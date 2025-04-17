import { getPrismaClient as getMainPrismaClient } from '../config/database';
import { PrismaClient, Job, JobStatus, JobType, JobStage, Prisma } from '../generated/prisma';
import logger from '../utils/logger';

// Define interfaces for creating different types of jobs
export interface CrawlJobData {
  url: string;
  name?: string;
  maxDepth?: number;
  tags?: string[];
  metadata?: Prisma.InputJsonValue;
  startDate?: Date;
  status?: JobStatus;
  progress?: number;
  type?: JobType;
}

export class JobService {
  private prisma: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || getMainPrismaClient();
  }

  /**
   * Create a new job
   */
  async createJob(data: Prisma.JobCreateInput) {
    try {
      const job = await this.prisma.job.create({
        data: {
          ...data,
          stats: data.stats || {},
        },
      });
      logger.info(`Created job with ID ${job.id}`);
      return job;
    } catch (error) {
      logger.error('Error creating job:', error);
      throw error;
    }
  }

  /**
   * Create a new crawl job with specific fields
   */
  async createCrawlJob(data: CrawlJobData) {
    try {
      // Create a transaction to ensure data consistency
      return await this.prisma.$transaction(async (tx) => {
        const job = await tx.job.create({
          data: {
            url: data.url,
            name: data.name,
            maxDepth: data.maxDepth,
            tags: data.tags || [],
            metadata: data.metadata || {},
            startDate: data.startDate || new Date(),
            status: data.status || 'pending',
            progress: data.progress || 0,
            type: 'crawl',
            stage: 'initializing',
            stats: { pagesProcessed: 0, pagesSkipped: 0, totalChunks: 0 },
            lastActivity: new Date(),
          },
        });
        
        logger.info(`Created crawl job with ID ${job.id} for URL ${data.url}`);
        return job;
      });
    } catch (error) {
      logger.error('Error creating crawl job:', error);
      throw error;
    }
  }

  /**
   * Find a job by ID
   */
  async findJobById(id: string) {
    try {
      const job = await this.prisma.job.findUnique({
        where: { id },
      });
      return job;
    } catch (error) {
      logger.error('Error finding job:', error);
      throw error;
    }
  }

  /**
   * Find jobs by status
   */
  async findJobsByStatus(status: JobStatus) {
    try {
      const jobs = await this.prisma.job.findMany({
        where: { status },
        orderBy: { createdAt: 'desc' },
      });
      return jobs;
    } catch (error) {
      logger.error('Error finding jobs by status:', error);
      throw error;
    }
  }

  /**
   * Find jobs by type
   */
  async findJobsByType(type: JobType) {
    try {
      const jobs = await this.prisma.job.findMany({
        where: { type },
        orderBy: { createdAt: 'desc' },
      });
      return jobs;
    } catch (error) {
      logger.error('Error finding jobs by type:', error);
      throw error;
    }
  }

  /**
   * Find jobs by tag
   */
  async findJobsByTag(tag: string) {
    try {
      const jobs = await this.prisma.job.findMany({
        where: {
          tags: {
            has: tag,
          },
        },
        orderBy: { createdAt: 'desc' },
      });
      return jobs;
    } catch (error) {
      logger.error('Error finding jobs by tag:', error);
      throw error;
    }
  }

  /**
   * Update job status and progress
   */
  async updateJobProgress(id: string, status: JobStatus, progress: number) {
    try {
      const job = await this.prisma.job.update({
        where: { id },
        data: {
          status,
          progress,
          lastActivity: new Date(),
          ...(status === 'completed' || status === 'failed' ? { endDate: new Date() } : {}),
        },
      });
      logger.info(`Updated job ${id} progress to ${progress} with status ${status}`);
      return job;
    } catch (error) {
      logger.error('Error updating job progress:', error);
      throw error;
    }
  }

  /**
   * Update job error
   */
  async updateJobError(id: string, error: string) {
    try {
      const job = await this.prisma.job.update({
        where: { id },
        data: {
          status: 'failed',
          error,
          endDate: new Date(),
          errorCount: {
            increment: 1
          },
          lastError: new Date(),
          lastActivity: new Date(),
        },
      });
      logger.error(`Job ${id} failed with error: ${error}`);
      return job;
    } catch (error) {
      logger.error('Error updating job error:', error);
      throw error;
    }
  }

  /**
   * Update job stats
   */
  async updateJobStats(id: string, stats: { pagesProcessed: number; pagesSkipped: number; totalChunks: number }) {
    try {
      const job = await this.prisma.job.update({
        where: { id },
        data: {
          stats: stats as Prisma.InputJsonValue,
          itemsProcessed: stats.pagesProcessed,
          itemsSkipped: stats.pagesSkipped,
          itemsTotal: stats.pagesProcessed + stats.pagesSkipped,
          lastActivity: new Date(),
        },
      });
      logger.debug(`Updated job ${id} stats: ${JSON.stringify(stats)}`);
      return job;
    } catch (error) {
      logger.error('Error updating job stats:', error);
      throw error;
    }
  }

  /**
   * Update job metadata
   */
  async updateJobMetadata(id: string, metadata: Record<string, any>) {
    try {
      // First get the current metadata to merge with new data
      const currentJob = await this.prisma.job.findUnique({
        where: { id },
        select: { metadata: true },
      });
      
      // Merge existing metadata with new metadata
      const updatedMetadata = {
        ...(currentJob?.metadata as Record<string, any> || {}),
        ...metadata,
      };
      
      const job = await this.prisma.job.update({
        where: { id },
        data: {
          metadata: updatedMetadata as Prisma.InputJsonValue,
          lastActivity: new Date(),
        },
      });
      
      logger.debug(`Updated job ${id} metadata`);
      return job;
    } catch (error) {
      logger.error('Error updating job metadata:', error);
      throw error;
    }
  }

  /**
   * Delete a job
   */
  async deleteJob(id: string) {
    try {
      const job = await this.prisma.job.delete({
        where: { id },
      });
      logger.info(`Deleted job ${id}`);
      return job;
    } catch (error) {
      logger.error('Error deleting job:', error);
      throw error;
    }
  }

  /**
   * Update job stage
   */
  async updateJobStage(id: string, stage: JobStage) {
    try {
      const job = await this.prisma.job.update({
        where: { id },
        data: {
          stage,
          lastActivity: new Date(),
        },
      });
      logger.info(`Updated job ${id} stage to ${stage}`);
      return job;
    } catch (error) {
      logger.error('Error updating job stage:', error);
      throw error;
    }
  }

  /**
   * Update job item progress
   */
  async updateJobItems(id: string, itemsTotal: number, itemsProcessed: number, itemsFailed: number = 0, itemsSkipped: number = 0) {
    try {
      const job = await this.prisma.job.update({
        where: { id },
        data: {
          itemsTotal,
          itemsProcessed,
          itemsFailed,
          itemsSkipped,
          // Calculate progress as a percentage
          progress: itemsTotal > 0 ? itemsProcessed / itemsTotal : 0,
          lastActivity: new Date(),
        },
      });
      logger.debug(`Updated job ${id} items: ${itemsProcessed}/${itemsTotal}`);
      return job;
    } catch (error) {
      logger.error('Error updating job items:', error);
      throw error;
    }
  }

  /**
   * Update job time estimates
   */
  async updateJobTimeEstimates(id: string, timeElapsed: number, estimatedCompletion?: Date) {
    try {
      // Calculate remaining time if not provided explicitly
      let timeRemaining: number | null = null;
      
      if (estimatedCompletion) {
        const now = new Date();
        timeRemaining = Math.max(0, Math.floor((estimatedCompletion.getTime() - now.getTime()) / 1000));
      }
      
      const job = await this.prisma.job.update({
        where: { id },
        data: {
          timeElapsed,
          ...(estimatedCompletion ? { estimatedCompletion } : {}),
          ...(timeRemaining !== null ? { timeRemaining } : {}),
          lastActivity: new Date(),
        },
      });
      
      if (estimatedCompletion) {
        logger.debug(`Updated job ${id} estimated completion to ${estimatedCompletion.toISOString()}`);
      } else {
        logger.debug(`Updated job ${id} time elapsed to ${timeElapsed} seconds`);
      }
      
      return job;
    } catch (error) {
      logger.error('Error updating job time estimates:', error);
      throw error;
    }
  }

  /**
   * Cancel a job
   */
  async cancelJob(id: string, reason?: string) {
    try {
      const job = await this.prisma.job.update({
        where: { id },
        data: {
          shouldCancel: true,
          status: 'cancelled',
          endDate: new Date(),
          ...(reason ? {
            error: `Job cancelled: ${reason}`,
          } : {}),
          lastActivity: new Date(),
        },
      });
      logger.info(`Job ${id} marked for cancellation${reason ? `: ${reason}` : ''}`);
      return job;
    } catch (error) {
      logger.error('Error cancelling job:', error);
      throw error;
    }
  }

  /**
   * Pause a job
   */
  async pauseJob(id: string) {
    try {
      const job = await this.prisma.job.update({
        where: { id },
        data: {
          shouldPause: true,
          status: 'paused',
          lastActivity: new Date(),
        },
      });
      logger.info(`Job ${id} marked for pause`);
      return job;
    } catch (error) {
      logger.error('Error pausing job:', error);
      throw error;
    }
  }

  /**
   * Resume a paused job
   */
  async resumeJob(id: string) {
    try {
      const job = await this.prisma.job.update({
        where: { id },
        data: {
          shouldPause: false,
          status: 'running',
          lastActivity: new Date(),
        },
      });
      logger.info(`Job ${id} resumed`);
      return job;
    } catch (error) {
      logger.error('Error resuming job:', error);
      throw error;
    }
  }

  /**
   * Get all active jobs
   */
  async getActiveJobs() {
    try {
      const jobs = await this.prisma.job.findMany({
        where: {
          status: {
            in: ['pending', 'running', 'paused']
          }
        },
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'asc' }
        ]
      });
      return jobs;
    } catch (error) {
      logger.error('Error getting active jobs:', error);
      throw error;
    }
  }

  /**
   * Get detailed job status
   */
  async getJobStatus(id: string) {
    try {
      const job = await this.prisma.job.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              documents: true
            }
          }
        }
      });
      
      if (!job) {
        throw new Error(`Job with ID ${id} not found`);
      }
      
      // Calculate elapsed time if job is still running
      let calculatedTimeElapsed = job.timeElapsed || 0;
      if (job.status === 'running' && job.startDate) {
        const now = new Date();
        calculatedTimeElapsed = Math.floor((now.getTime() - job.startDate.getTime()) / 1000);
      }
      
      // Calculate estimated time remaining based on progress
      let estimatedRemaining = job.timeRemaining;
      if (job.status === 'running' && job.progress > 0 && calculatedTimeElapsed > 0) {
        const progressRate = job.progress / calculatedTimeElapsed; // progress per second
        if (progressRate > 0) {
          estimatedRemaining = Math.floor((1 - job.progress) / progressRate);
        }
      }
      
      // Calculate estimated completion time
      let estimatedCompletion = job.estimatedCompletion;
      if (job.status === 'running' && estimatedRemaining && !estimatedCompletion) {
        estimatedCompletion = new Date(Date.now() + estimatedRemaining * 1000);
      }
      
      // Calculate progress percentage
      const progressPercentage = Math.round(job.progress * 100);
      
      // Format stats for output
      const stats = {
        ...(job.stats as Record<string, any>),
        documentsCount: job._count.documents,
        itemsTotal: job.itemsTotal,
        itemsProcessed: job.itemsProcessed,
        itemsFailed: job.itemsFailed,
        itemsSkipped: job.itemsSkipped,
      };
      
      // Construct the detailed status
      return {
        id: job.id,
        type: job.type,
        stage: job.stage,
        status: job.status,
        progress: job.progress,
        progressPercentage,
        url: job.url,
        name: job.name,
        tags: job.tags,
        startDate: job.startDate,
        endDate: job.endDate,
        error: job.error,
        errorCount: job.errorCount,
        lastError: job.lastError,
        stats,
        timeElapsed: calculatedTimeElapsed,
        timeRemaining: estimatedRemaining,
        estimatedCompletion,
        lastActivity: job.lastActivity,
        duration: job.endDate && job.startDate 
          ? Math.floor((job.endDate.getTime() - job.startDate.getTime()) / 1000)
          : calculatedTimeElapsed,
        canCancel: ['pending', 'running', 'paused'].includes(job.status),
        canPause: job.status === 'running',
        canResume: job.status === 'paused',
      };
    } catch (error) {
      logger.error('Error getting job status:', error);
      throw error;
    }
  }
} 