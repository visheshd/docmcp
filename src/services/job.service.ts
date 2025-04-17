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
        metadata: job.metadata,
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

  /**
   * Clean up old jobs based on a specified threshold
   * @param thresholdDays Number of days after which a job is considered old
   * @param statusFilter Optional filter for job statuses to clean up
   */
  async cleanupOldJobs(thresholdDays: number = 30, statusFilter?: JobStatus[]) {
    try {
      const thresholdDate = new Date();
      thresholdDate.setDate(thresholdDate.getDate() - thresholdDays);
      
      const whereClause: Prisma.JobWhereInput = {
        lastActivity: {
          lt: thresholdDate
        }
      };
      
      // Add status filter if provided
      if (statusFilter && statusFilter.length > 0) {
        whereClause.status = {
          in: statusFilter
        };
      }
      
      // Find jobs matching the criteria
      const oldJobs = await this.prisma.job.findMany({
        where: whereClause,
        select: { id: true }
      });
      
      if (oldJobs.length === 0) {
        logger.info(`No old jobs found older than ${thresholdDays} days`);
        return { deletedCount: 0 };
      }
      
      // Delete the old jobs
      const result = await this.prisma.job.deleteMany({
        where: {
          id: {
            in: oldJobs.map(job => job.id)
          }
        }
      });
      
      logger.info(`Cleaned up ${result.count} old jobs older than ${thresholdDays} days`);
      return { deletedCount: result.count };
    } catch (error) {
      logger.error('Error cleaning up old jobs:', error);
      throw error;
    }
  }

  /**
   * Retry a failed job by creating a new job with the same parameters
   * @param id The ID of the failed job to retry
   */
  async retryFailedJob(id: string) {
    try {
      // Find the failed job
      const failedJob = await this.prisma.job.findUnique({
        where: { id }
      });
      
      if (!failedJob) {
        throw new Error(`Job with ID ${id} not found`);
      }
      
      if (failedJob.status !== 'failed') {
        throw new Error(`Cannot retry job with status '${failedJob.status}'. Only failed jobs can be retried.`);
      }
      
      // Create a new job with the same parameters
      const newJob = await this.prisma.job.create({
        data: {
          url: failedJob.url,
          type: failedJob.type,
          name: failedJob.name,
          tags: failedJob.tags,
          maxDepth: failedJob.maxDepth,
          metadata: failedJob.metadata as Prisma.InputJsonValue,
          status: 'pending',
          progress: 0,
          startDate: new Date(),
          lastActivity: new Date(),
          stats: { pagesProcessed: 0, pagesSkipped: 0, totalChunks: 0 } as Prisma.InputJsonValue,
          stage: 'initializing'
        }
      });
      
      logger.info(`Retried failed job ${id}. Created new job with ID ${newJob.id}`);
      
      return {
        originalJobId: id,
        newJobId: newJob.id,
        status: 'pending'
      };
    } catch (error) {
      logger.error(`Error retrying failed job ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get aggregate statistics across multiple jobs
   * @param filter Optional filter for job types or status
   */
  async getJobStatistics(filter?: { types?: JobType[], statuses?: JobStatus[] }) {
    try {
      const whereClause: Prisma.JobWhereInput = {};
      
      if (filter?.types && filter.types.length > 0) {
        whereClause.type = {
          in: filter.types
        };
      }
      
      if (filter?.statuses && filter.statuses.length > 0) {
        whereClause.status = {
          in: filter.statuses
        };
      }
      
      // Get all jobs matching the filter
      const jobs = await this.prisma.job.findMany({
        where: whereClause,
        select: {
          id: true,
          status: true,
          type: true,
          startDate: true,
          endDate: true,
          progress: true,
          itemsProcessed: true,
          itemsSkipped: true,
          itemsFailed: true,
          errorCount: true,
          stats: true
        }
      });
      
      // Calculate aggregate statistics
      const totalJobs = jobs.length;
      const jobsByStatus = jobs.reduce((acc, job) => {
        acc[job.status] = (acc[job.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      const jobsByType = jobs.reduce((acc, job) => {
        acc[job.type] = (acc[job.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      // Calculate averages and totals
      const completedJobs = jobs.filter(job => job.status === 'completed');
      const failedJobs = jobs.filter(job => job.status === 'failed');
      
      // Calculate average processing time for completed jobs
      const avgProcessingTime = completedJobs.length > 0
        ? completedJobs.reduce((sum, job) => {
            if (job.startDate && job.endDate) {
              return sum + (job.endDate.getTime() - job.startDate.getTime()) / 1000;
            }
            return sum;
          }, 0) / completedJobs.length
        : 0;
      
      // Aggregate document statistics
      const totalStats = jobs.reduce((acc, job) => {
        const stats = job.stats as Record<string, number>;
        if (stats) {
          acc.pagesProcessed += stats.pagesProcessed || 0;
          acc.pagesSkipped += stats.pagesSkipped || 0;
          acc.totalChunks += stats.totalChunks || 0;
        }
        
        acc.itemsProcessed += job.itemsProcessed || 0;
        acc.itemsSkipped += job.itemsSkipped || 0;
        acc.itemsFailed += job.itemsFailed || 0;
        acc.errorCount += job.errorCount || 0;
        
        return acc;
      }, {
        pagesProcessed: 0,
        pagesSkipped: 0,
        totalChunks: 0,
        itemsProcessed: 0,
        itemsSkipped: 0,
        itemsFailed: 0,
        errorCount: 0
      });
      
      // Calculate success rate
      const successRate = totalJobs > 0
        ? completedJobs.length / totalJobs
        : 0;
      
      logger.info(`Generated job statistics for ${totalJobs} jobs`);
      
      return {
        totalJobs,
        jobsByStatus,
        jobsByType,
        completedJobsCount: completedJobs.length,
        failedJobsCount: failedJobs.length,
        successRate,
        avgProcessingTime,
        totalStats
      };
    } catch (error) {
      logger.error('Error getting job statistics:', error);
      throw error;
    }
  }
} 