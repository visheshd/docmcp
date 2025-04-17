import { getPrismaClient as getMainPrismaClient } from '../config/database';
import { PrismaClient, Job, JobStatus, JobType, Prisma } from '../generated/prisma';
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
            stats: { pagesProcessed: 0, pagesSkipped: 0, totalChunks: 0 },
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
} 