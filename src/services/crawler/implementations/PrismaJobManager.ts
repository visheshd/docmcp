import { PrismaClient } from '@prisma/client';
import { IJobManager } from '../interfaces/IJobManager';
import { Job, JobCreateData, JobStats } from '../interfaces/types';
import { LoggingUtils } from '../utils/LoggingUtils';

// Import JobStatus from the generated Prisma types
import { JobStatus } from '../../../generated/prisma';

/**
 * Implementation of the job manager using Prisma
 */
export class PrismaJobManager implements IJobManager {
  private readonly prisma: PrismaClient;
  private readonly logger = LoggingUtils.createTaggedLogger('job-manager');

  /**
   * Constructor with optional Prisma client for dependency injection
   * @param prismaClient Optional Prisma client instance (for testing)
   */
  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || new PrismaClient();
  }

  /**
   * Create a new job in the database
   * @param data Job creation data
   * @returns The created job
   */
  async createJob(data: JobCreateData): Promise<Job> {
    try {
      this.logger.info(`Creating new job for URL: ${data.url}`);
      
      const job = await this.prisma.job.create({
        data: {
          url: data.url,
          status: data.status,
          type: data.type,
          startDate: data.startDate,
          progress: data.progress,
          endDate: data.endDate,
          error: data.error,
          stats: data.stats,
          metadata: data.metadata
        }
      });
      
      this.logger.info(`Created job with ID: ${job.id}`);
      return job as Job;
    } catch (error) {
      this.logger.error(`Error creating job: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Update job progress
   * @param jobId ID of the job to update
   * @param progress Progress percentage (0-100)
   * @param stats Job statistics
   */
  async updateProgress(jobId: string, progress: number, stats: JobStats): Promise<void> {
    try {
      // Ensure progress is between 0 and 100
      const normalizedProgress = Math.min(100, Math.max(0, progress));
      
      this.logger.debug(`Updating job ${jobId} progress to ${normalizedProgress}%`);
      
      await this.prisma.job.update({
        where: { id: jobId },
        data: {
          progress: normalizedProgress,
          stats: stats,
          updatedAt: new Date()
        }
      });
    } catch (error) {
      this.logger.error(`Error updating job progress: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Mark a job as completed
   * @param jobId ID of the job to mark completed
   * @param stats Final job statistics
   */
  async markJobCompleted(jobId: string, stats: JobStats): Promise<void> {
    try {
      this.logger.info(`Marking job ${jobId} as completed`);
      
      await this.prisma.job.update({
        where: { id: jobId },
        data: {
          status: JobStatus.completed,
          progress: 100,
          endDate: new Date(),
          stats: stats,
          updatedAt: new Date()
        }
      });
      
      this.logger.info(`Job ${jobId} completed successfully`);
    } catch (error) {
      this.logger.error(`Error marking job as completed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Mark a job as failed
   * @param jobId ID of the job to mark failed
   * @param error Error message or reason for failure
   * @param stats Current job statistics
   */
  async markJobFailed(jobId: string, error: string, stats: JobStats): Promise<void> {
    try {
      this.logger.warn(`Marking job ${jobId} as failed: ${error}`);
      
      await this.prisma.job.update({
        where: { id: jobId },
        data: {
          status: JobStatus.failed,
          endDate: new Date(),
          error: error,
          stats: stats,
          updatedAt: new Date()
        }
      });
    } catch (err) {
      this.logger.error(`Error marking job as failed: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  }

  /**
   * Check if a job should continue running
   * @param jobId ID of the job to check
   * @returns True if the job should continue, false if it should stop
   */
  async shouldContinue(jobId: string): Promise<boolean> {
    try {
      const job = await this.prisma.job.findUnique({
        where: { id: jobId },
        select: { status: true }
      });
      
      if (!job) {
        this.logger.warn(`Job ${jobId} not found, stopping execution`);
        return false;
      }
      
      // Continue if the job is in pending or processing state
      const shouldContinue = 
        job.status === JobStatus.pending || 
        job.status === JobStatus.running; // 'processing' is 'running' in the schema
      
      if (!shouldContinue) {
        this.logger.info(`Job ${jobId} should stop: status is ${job.status}`);
      }
      
      return shouldContinue;
    } catch (error) {
      this.logger.error(`Error checking job status: ${error instanceof Error ? error.message : String(error)}`);
      // Default to stopping on error
      return false;
    }
  }

  /**
   * Find a job by its ID
   * @param jobId ID of the job to find
   * @returns The job or null if not found
   */
  async findJobById(jobId: string): Promise<Job | null> {
    try {
      const job = await this.prisma.job.findUnique({
        where: { id: jobId }
      });
      
      return job as Job | null;
    } catch (error) {
      this.logger.error(`Error finding job: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Cancel a running job
   * @param jobId ID of the job to cancel
   */
  async cancelJob(jobId: string): Promise<void> {
    try {
      this.logger.info(`Cancelling job ${jobId}`);
      
      await this.prisma.job.update({
        where: { id: jobId },
        data: {
          status: JobStatus.cancelled,
          endDate: new Date(),
          updatedAt: new Date()
        }
      });
      
      this.logger.info(`Job ${jobId} cancelled`);
    } catch (error) {
      this.logger.error(`Error cancelling job: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Pause a running job
   * @param jobId ID of the job to pause
   */
  async pauseJob(jobId: string): Promise<void> {
    try {
      this.logger.info(`Pausing job ${jobId}`);
      
      await this.prisma.job.update({
        where: { id: jobId },
        data: {
          status: JobStatus.paused,
          updatedAt: new Date()
        }
      });
      
      this.logger.info(`Job ${jobId} paused`);
    } catch (error) {
      this.logger.error(`Error pausing job: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Resume a paused job
   * @param jobId ID of the job to resume
   */
  async resumeJob(jobId: string): Promise<void> {
    try {
      this.logger.info(`Resuming job ${jobId}`);
      
      await this.prisma.job.update({
        where: { id: jobId },
        data: {
          status: JobStatus.running, // 'processing' is 'running' in the schema
          updatedAt: new Date()
        }
      });
      
      this.logger.info(`Job ${jobId} resumed`);
    } catch (error) {
      this.logger.error(`Error resuming job: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
} 