import prisma from '../config/database';
import type { Job, JobStatus } from '../generated/prisma';
import logger from '../utils/logger';

export class JobService {
  /**
   * Create a new job
   */
  async createJob(data: Omit<Job, 'id' | 'createdAt' | 'updatedAt'>) {
    try {
      const job = await prisma.job.create({
        data,
      });
      return job;
    } catch (error) {
      logger.error('Error creating job:', error);
      throw error;
    }
  }

  /**
   * Find a job by ID
   */
  async findJobById(id: string) {
    try {
      const job = await prisma.job.findUnique({
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
      const jobs = await prisma.job.findMany({
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
   * Update job status and progress
   */
  async updateJobProgress(id: string, status: JobStatus, progress: number) {
    try {
      const job = await prisma.job.update({
        where: { id },
        data: {
          status,
          progress,
          ...(status === 'completed' || status === 'failed' ? { endDate: new Date() } : {}),
        },
      });
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
      const job = await prisma.job.update({
        where: { id },
        data: {
          status: 'failed',
          error,
          endDate: new Date(),
        },
      });
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
      const job = await prisma.job.update({
        where: { id },
        data: {
          stats,
        },
      });
      return job;
    } catch (error) {
      logger.error('Error updating job stats:', error);
      throw error;
    }
  }

  /**
   * Delete a job
   */
  async deleteJob(id: string) {
    try {
      const job = await prisma.job.delete({
        where: { id },
      });
      return job;
    } catch (error) {
      logger.error('Error deleting job:', error);
      throw error;
    }
  }
} 