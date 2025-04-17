import { JobService } from '../../services/job.service';
import { getTestPrismaClient } from '../utils/testDb';
import type { JobStatus, JobType, Prisma } from '../../generated/prisma';

describe('JobService Integration Tests', () => {
  let jobService: JobService;
  const prisma = getTestPrismaClient();

  beforeAll(async () => {
    jobService = new JobService(prisma);
  });

  beforeEach(async () => {
    // Clean up the database before each test
    await prisma.job.deleteMany();
  });

  describe('createJob', () => {
    it('should create a job successfully', async () => {
      const testJob: Prisma.JobCreateInput = {
        url: 'https://test.com/docs',
        status: 'pending',
        type: 'crawl',
        progress: 0,
        startDate: new Date(),
        name: 'Test Job',
        tags: [],
        stats: { pagesProcessed: 0, pagesSkipped: 0, totalChunks: 0 },
      };

      const result = await jobService.createJob(testJob);

      expect(result).toBeDefined();
      expect(result.url).toBe(testJob.url);
      expect(result.status).toBe('pending');
      expect(result.progress).toBe(0);
    });
  });

  describe('findJobById', () => {
    it('should find a job by id', async () => {
      const testJob = await prisma.job.create({
        data: {
          url: 'https://test.com/docs',
          status: 'pending',
          type: 'crawl',
          progress: 0,
          startDate: new Date(),
          name: 'Test Job',
          tags: [],
          stats: { pagesProcessed: 0, pagesSkipped: 0, totalChunks: 0 },
        },
      });

      const result = await jobService.findJobById(testJob.id);

      expect(result).toBeDefined();
      expect(result?.id).toBe(testJob.id);
    });

    it('should return null for non-existent job', async () => {
      const result = await jobService.findJobById('non-existent-id');
      expect(result).toBeNull();
    });
  });

  describe('findJobsByStatus', () => {
    it('should find jobs by status', async () => {
      const status: JobStatus = 'running';
      await prisma.job.createMany({
        data: [
          {
            url: 'https://test.com/docs/1',
            status,
            type: 'crawl' as JobType,
            progress: 0.5,
            startDate: new Date(),
            name: 'Test Job 1',
            tags: [],
            stats: { pagesProcessed: 5, pagesSkipped: 1, totalChunks: 20 },
          },
          {
            url: 'https://test.com/docs/2',
            status,
            type: 'crawl' as JobType,
            progress: 0.7,
            startDate: new Date(),
            name: 'Test Job 2',
            tags: [],
            stats: { pagesProcessed: 7, pagesSkipped: 2, totalChunks: 30 },
          },
        ],
      });

      const results = await jobService.findJobsByStatus(status);

      expect(results).toHaveLength(2);
      expect(results[0].status).toBe(status);
      expect(results[1].status).toBe(status);
    });
  });

  describe('updateJobProgress', () => {
    it('should update job progress and status', async () => {
      const testJob = await prisma.job.create({
        data: {
          url: 'https://test.com/docs',
          status: 'pending',
          type: 'crawl',
          progress: 0,
          startDate: new Date(),
          name: 'Test Job',
          tags: [],
          stats: { pagesProcessed: 0, pagesSkipped: 0, totalChunks: 0 },
        },
      });

      const result = await jobService.updateJobProgress(testJob.id, 'running', 0.5);

      expect(result).toBeDefined();
      expect(result.status).toBe('running');
      expect(result.progress).toBe(0.5);
    });

    it('should set endDate when job is completed', async () => {
      const testJob = await prisma.job.create({
        data: {
          url: 'https://test.com/docs',
          status: 'running',
          type: 'crawl',
          progress: 0.8,
          startDate: new Date(),
          name: 'Test Job',
          tags: [],
          stats: { pagesProcessed: 8, pagesSkipped: 1, totalChunks: 40 },
        },
      });

      const result = await jobService.updateJobProgress(testJob.id, 'completed', 1.0);

      expect(result.status).toBe('completed');
      expect(result.progress).toBe(1.0);
      expect(result.endDate).toBeDefined();
    });
  });

  describe('updateJobError', () => {
    it('should update job with error and mark as failed', async () => {
      const testJob = await prisma.job.create({
        data: {
          url: 'https://test.com/docs',
          status: 'running',
          type: 'crawl',
          progress: 0.5,
          startDate: new Date(),
          name: 'Test Job',
          tags: [],
          stats: { pagesProcessed: 5, pagesSkipped: 1, totalChunks: 20 },
        },
      });

      const errorMessage = 'Test error message';
      const result = await jobService.updateJobError(testJob.id, errorMessage);

      expect(result.status).toBe('failed');
      expect(result.error).toBe(errorMessage);
      expect(result.endDate).toBeDefined();
    });
  });

  describe('updateJobStats', () => {
    it('should update job statistics', async () => {
      const testJob = await prisma.job.create({
        data: {
          url: 'https://test.com/docs',
          status: 'running',
          type: 'crawl',
          progress: 0.5,
          startDate: new Date(),
          name: 'Test Job',
          tags: [],
          stats: { pagesProcessed: 0, pagesSkipped: 0, totalChunks: 0 },
        },
      });

      const newStats = {
        pagesProcessed: 10,
        pagesSkipped: 2,
        totalChunks: 50,
      };

      const result = await jobService.updateJobStats(testJob.id, newStats);

      expect(result.stats).toEqual(newStats);
    });
  });

  describe('deleteJob', () => {
    it('should delete a job successfully', async () => {
      const testJob = await prisma.job.create({
        data: {
          url: 'https://test.com/docs',
          status: 'completed',
          type: 'crawl',
          progress: 1.0,
          startDate: new Date(),
          endDate: new Date(),
          name: 'Test Job',
          tags: [],
          stats: { pagesProcessed: 10, pagesSkipped: 2, totalChunks: 50 },
        },
      });

      await jobService.deleteJob(testJob.id);

      const result = await prisma.job.findUnique({
        where: { id: testJob.id },
      });

      expect(result).toBeNull();
    });
  });

  describe('cleanupOldJobs', () => {
    it('should clean up old jobs based on a threshold', async () => {
      // Create some old jobs with modified lastActivity date
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 40); // 40 days old
      
      await prisma.job.createMany({
        data: [
          {
            url: 'https://test.com/docs/old1',
            status: 'completed',
            type: 'crawl',
            progress: 1.0,
            startDate: oldDate,
            endDate: oldDate,
            lastActivity: oldDate,
            name: 'Old Test Job 1',
            tags: [],
            stats: { pagesProcessed: 10, pagesSkipped: 2, totalChunks: 50 },
          },
          {
            url: 'https://test.com/docs/old2',
            status: 'failed',
            type: 'crawl',
            progress: 0.5,
            startDate: oldDate,
            endDate: oldDate,
            lastActivity: oldDate,
            name: 'Old Test Job 2',
            tags: [],
            stats: { pagesProcessed: 5, pagesSkipped: 1, totalChunks: 25 },
          }
        ],
      });
      
      // Create a recent job
      await prisma.job.create({
        data: {
          url: 'https://test.com/docs/recent',
          status: 'completed',
          type: 'crawl',
          progress: 1.0,
          startDate: new Date(),
          endDate: new Date(),
          lastActivity: new Date(),
          name: 'Recent Test Job',
          tags: [],
          stats: { pagesProcessed: 10, pagesSkipped: 2, totalChunks: 50 },
        },
      });
      
      // Clean up jobs older than 30 days
      const result = await jobService.cleanupOldJobs(30);
      
      // Should have deleted the two old jobs
      expect(result.deletedCount).toBe(2);
      
      // Verify only the recent job remains
      const remainingJobs = await prisma.job.findMany();
      expect(remainingJobs.length).toBe(1);
      expect(remainingJobs[0].name).toBe('Recent Test Job');
    });
    
    it('should filter by status when cleaning up old jobs', async () => {
      // Create some old jobs with different statuses
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 40); // 40 days old
      
      await prisma.job.createMany({
        data: [
          {
            url: 'https://test.com/docs/old1',
            status: 'completed',
            type: 'crawl',
            progress: 1.0,
            startDate: oldDate,
            endDate: oldDate,
            lastActivity: oldDate,
            name: 'Old Completed Job',
            tags: [],
            stats: { pagesProcessed: 10, pagesSkipped: 2, totalChunks: 50 },
          },
          {
            url: 'https://test.com/docs/old2',
            status: 'failed',
            type: 'crawl',
            progress: 0.5,
            startDate: oldDate,
            endDate: oldDate,
            lastActivity: oldDate,
            name: 'Old Failed Job',
            tags: [],
            stats: { pagesProcessed: 5, pagesSkipped: 1, totalChunks: 25 },
          }
        ],
      });
      
      // Clean up only failed jobs older than 30 days
      const result = await jobService.cleanupOldJobs(30, ['failed']);
      
      // Should have deleted only the failed job
      expect(result.deletedCount).toBe(1);
      
      // Verify the completed job remains
      const remainingJobs = await prisma.job.findMany();
      expect(remainingJobs.length).toBe(1);
      expect(remainingJobs[0].name).toBe('Old Completed Job');
    });
  });
  
  describe('retryFailedJob', () => {
    it('should create a new job based on a failed job', async () => {
      // Create a failed job
      const failedJob = await prisma.job.create({
        data: {
          url: 'https://test.com/docs/failed',
          status: 'failed',
          type: 'crawl',
          progress: 0.5,
          startDate: new Date(),
          endDate: new Date(),
          lastActivity: new Date(),
          name: 'Failed Test Job',
          tags: ['test', 'docs'],
          maxDepth: 3,
          metadata: { custom: 'value' } as Prisma.InputJsonValue,
          stats: { pagesProcessed: 5, pagesSkipped: 1, totalChunks: 0 } as Prisma.InputJsonValue,
          error: 'Test error message',
          stage: 'processing',
        },
      });
      
      // Retry the failed job
      const result = await jobService.retryFailedJob(failedJob.id);
      
      // Verify the result
      expect(result).toBeDefined();
      expect(result.originalJobId).toBe(failedJob.id);
      expect(result.newJobId).toBeDefined();
      expect(result.status).toBe('pending');
      
      // Verify the new job was created with correct properties
      const newJob = await prisma.job.findUnique({
        where: { id: result.newJobId },
      });
      
      expect(newJob).toBeDefined();
      if (newJob) { // TS null check
        expect(newJob.url).toBe(failedJob.url);
        expect(newJob.name).toBe(failedJob.name);
        expect(newJob.tags).toEqual(failedJob.tags);
        expect(newJob.maxDepth).toBe(failedJob.maxDepth);
        expect(newJob.status).toBe('pending');
        expect(newJob.progress).toBe(0);
        expect(newJob.stage).toBe('initializing');
      }
    });
    
    it('should throw error when trying to retry a non-failed job', async () => {
      // Create a completed job
      const completedJob = await prisma.job.create({
        data: {
          url: 'https://test.com/docs/completed',
          status: 'completed',
          type: 'crawl',
          progress: 1.0,
          startDate: new Date(),
          endDate: new Date(),
          lastActivity: new Date(),
          name: 'Completed Test Job',
          tags: [],
          stats: { pagesProcessed: 10, pagesSkipped: 0, totalChunks: 50 } as Prisma.InputJsonValue,
        },
      });
      
      // Try to retry the completed job and expect an error
      await expect(jobService.retryFailedJob(completedJob.id)).rejects.toThrow(
        `Cannot retry job with status 'completed'. Only failed jobs can be retried.`
      );
    });
    
    it('should throw error when job is not found', async () => {
      await expect(jobService.retryFailedJob('non-existent-id')).rejects.toThrow(
        'Job with ID non-existent-id not found'
      );
    });
  });
  
  describe('getJobStatistics', () => {
    beforeEach(async () => {
      // Create a diverse set of jobs for statistics testing
      await prisma.job.createMany({
        data: [
          {
            url: 'https://test.com/docs/1',
            status: 'completed',
            type: 'crawl',
            progress: 1.0,
            startDate: new Date(Date.now() - 3600000), // 1 hour ago
            endDate: new Date(),
            lastActivity: new Date(),
            name: 'Completed Crawl Job 1',
            tags: ['docs'],
            itemsProcessed: 10,
            itemsSkipped: 2,
            itemsFailed: 0,
            stats: { pagesProcessed: 10, pagesSkipped: 2, totalChunks: 50 } as Prisma.InputJsonValue,
          },
          {
            url: 'https://test.com/docs/2',
            status: 'completed',
            type: 'crawl',
            progress: 1.0,
            startDate: new Date(Date.now() - 7200000), // 2 hours ago
            endDate: new Date(),
            lastActivity: new Date(),
            name: 'Completed Crawl Job 2',
            tags: ['api'],
            itemsProcessed: 15,
            itemsSkipped: 3,
            itemsFailed: 1,
            stats: { pagesProcessed: 15, pagesSkipped: 3, totalChunks: 75 } as Prisma.InputJsonValue,
          },
          {
            url: 'https://test.com/process/1',
            status: 'failed',
            type: 'process',
            progress: 0.5,
            startDate: new Date(Date.now() - 1800000), // 30 minutes ago
            endDate: new Date(),
            lastActivity: new Date(),
            name: 'Failed Process Job',
            tags: ['docs'],
            itemsProcessed: 5,
            itemsSkipped: 1,
            itemsFailed: 2,
            errorCount: 1,
            stats: { pagesProcessed: 5, pagesSkipped: 1, totalChunks: 25 } as Prisma.InputJsonValue,
          },
          {
            url: 'https://test.com/delete/1',
            status: 'running',
            type: 'delete',
            progress: 0.7,
            startDate: new Date(),
            lastActivity: new Date(),
            name: 'Running Delete Job',
            tags: ['cleanup'],
            itemsProcessed: 7,
            itemsSkipped: 0,
            itemsFailed: 0,
            stats: { pagesProcessed: 7, pagesSkipped: 0, totalChunks: 0 } as Prisma.InputJsonValue,
          },
        ],
      });
    });
    
    it('should return aggregate statistics for all jobs', async () => {
      const stats = await jobService.getJobStatistics();
      
      expect(stats).toBeDefined();
      expect(stats.totalJobs).toBe(4);
      expect(stats.completedJobsCount).toBe(2);
      expect(stats.failedJobsCount).toBe(1);
      expect(stats.successRate).toBe(0.5); // 2 completed out of 4 total
      
      // Verify job counts by status
      expect(stats.jobsByStatus).toEqual({
        completed: 2,
        failed: 1,
        running: 1
      });
      
      // Verify job counts by type
      expect(stats.jobsByType).toEqual({
        crawl: 2,
        process: 1,
        delete: 1
      });
      
      // Verify aggregated statistics
      expect(stats.totalStats.pagesProcessed).toBe(37); // 10 + 15 + 5 + 7
      expect(stats.totalStats.pagesSkipped).toBe(6); // 2 + 3 + 1 + 0
      expect(stats.totalStats.totalChunks).toBe(150); // 50 + 75 + 25 + 0
      expect(stats.totalStats.itemsProcessed).toBe(37); // 10 + 15 + 5 + 7
      expect(stats.totalStats.itemsSkipped).toBe(6); // 2 + 3 + 1 + 0
      expect(stats.totalStats.itemsFailed).toBe(3); // 0 + 1 + 2 + 0
      expect(stats.totalStats.errorCount).toBe(1); // 0 + 0 + 1 + 0
    });
    
    it('should filter statistics by job type', async () => {
      const stats = await jobService.getJobStatistics({ types: ['crawl'] });
      
      expect(stats.totalJobs).toBe(2);
      expect(stats.completedJobsCount).toBe(2);
      expect(stats.failedJobsCount).toBe(0);
      expect(stats.successRate).toBe(1.0); // 2 completed out of 2 total
      
      // Verify job counts by status
      expect(stats.jobsByStatus).toEqual({
        completed: 2
      });
      
      // Verify job counts by type
      expect(stats.jobsByType).toEqual({
        crawl: 2
      });
      
      // Verify aggregated statistics
      expect(stats.totalStats.pagesProcessed).toBe(25); // 10 + 15
      expect(stats.totalStats.pagesSkipped).toBe(5); // 2 + 3
      expect(stats.totalStats.totalChunks).toBe(125); // 50 + 75
    });
    
    it('should filter statistics by job status', async () => {
      const stats = await jobService.getJobStatistics({ statuses: ['failed', 'running'] });
      
      expect(stats.totalJobs).toBe(2);
      expect(stats.completedJobsCount).toBe(0);
      expect(stats.failedJobsCount).toBe(1);
      expect(stats.successRate).toBe(0); // 0 completed out of 2 total
      
      // Verify job counts by status
      expect(stats.jobsByStatus).toEqual({
        failed: 1,
        running: 1
      });
      
      // Verify job counts by type
      expect(stats.jobsByType).toEqual({
        process: 1,
        delete: 1
      });
    });
  });

  describe('Job Lifecycle Integration', () => {
    it('should track a job through its complete lifecycle', async () => {
      // 1. Create a new job
      const newJob = await jobService.createJob({
        url: 'https://test.com/docs/lifecycle',
        status: 'pending',
        type: 'crawl',
        progress: 0,
        startDate: new Date(),
        name: 'Lifecycle Test Job',
        tags: ['test', 'lifecycle'],
        stats: { pagesProcessed: 0, pagesSkipped: 0, totalChunks: 0 },
      });
      
      expect(newJob).toBeDefined();
      expect(newJob.status).toBe('pending');
      expect(newJob.progress).toBe(0);
      
      // 2. Update job to running status when processing starts
      const runningJob = await jobService.updateJobProgress(newJob.id, 'running', 0);
      expect(runningJob.status).toBe('running');
      
      // 3. Update job stage
      const processingJob = await jobService.updateJobStage(newJob.id, 'processing');
      expect(processingJob.stage).toBe('processing');
      
      // 4. Update progress during processing
      const progressJob1 = await jobService.updateJobProgress(newJob.id, 'running', 0.25);
      expect(progressJob1.progress).toBe(0.25);
      
      // 5. Update statistics as documents are processed
      await jobService.updateJobStats(newJob.id, {
        pagesProcessed: 5,
        pagesSkipped: 1,
        totalChunks: 20,
      });
      
      // 6. Update processed items count
      await jobService.updateJobItems(newJob.id, 10, 5, 0, 1);
      
      // 7. Update time estimates
      const now = new Date();
      const estimatedCompletion = new Date(now.getTime() + 1800000); // 30 minutes from now
      await jobService.updateJobTimeEstimates(newJob.id, 600, estimatedCompletion);
      
      // 8. Update progress further
      const progressJob2 = await jobService.updateJobProgress(newJob.id, 'running', 0.5);
      expect(progressJob2.progress).toBe(0.5);
      
      // 9. Update metadata with custom information
      await jobService.updateJobMetadata(newJob.id, {
        customValue: 'test',
        processingDetails: {
          engine: 'test-engine',
          version: '1.0'
        }
      });
      
      // 10. Update more statistics
      await jobService.updateJobStats(newJob.id, {
        pagesProcessed: 10,
        pagesSkipped: 2,
        totalChunks: 40,
      });
      
      // 11. Complete the job
      const completedJob = await jobService.updateJobProgress(newJob.id, 'completed', 1.0);
      expect(completedJob.status).toBe('completed');
      expect(completedJob.progress).toBe(1.0);
      expect(completedJob.endDate).toBeDefined();
      
      // 12. Verify final job details
      const finalJob = await jobService.getJobStatus(newJob.id);
      expect(finalJob).toBeDefined();
      expect(finalJob.status).toBe('completed');
      expect(finalJob.progress).toBe(1.0);
      expect(finalJob.progressPercentage).toBe(100);
      expect(finalJob.stats).toBeDefined();
      // Access stats as a generic object with any properties
      const statsObj = finalJob.stats as any;
      expect(statsObj.pagesProcessed).toBe(10);
      expect(statsObj.pagesSkipped).toBe(2);
      expect(statsObj.totalChunks).toBe(40);
      expect(finalJob.stage).toBe('processing');
      expect(finalJob.canCancel).toBe(false); // Cannot cancel completed job
      
      // Verify the stored metadata
      // Access metadata as a generic object
      const metadataObj = finalJob as any;
      expect(metadataObj.metadata).toBeDefined();
      if (metadataObj.metadata) {
        const metadata = metadataObj.metadata as Record<string, any>;
        expect(metadata.customValue).toBe('test');
        expect(metadata.processingDetails).toBeDefined();
        expect(metadata.processingDetails.engine).toBe('test-engine');
      }
    });
    
    it('should handle job failure correctly', async () => {
      // 1. Create a new job
      const newJob = await jobService.createJob({
        url: 'https://test.com/docs/failure',
        status: 'pending',
        type: 'crawl',
        progress: 0,
        startDate: new Date(),
        name: 'Failure Test Job',
        tags: ['test', 'failure'],
        stats: { pagesProcessed: 0, pagesSkipped: 0, totalChunks: 0 },
      });
      
      // 2. Start the job
      await jobService.updateJobProgress(newJob.id, 'running', 0);
      
      // 3. Make some progress
      await jobService.updateJobProgress(newJob.id, 'running', 0.3);
      
      // 4. Update some statistics
      await jobService.updateJobStats(newJob.id, {
        pagesProcessed: 3,
        pagesSkipped: 1,
        totalChunks: 15,
      });
      
      // 5. Simulate an error
      const errorMessage = 'Network connection failed while processing document';
      const failedJob = await jobService.updateJobError(newJob.id, errorMessage);
      
      expect(failedJob.status).toBe('failed');
      expect(failedJob.error).toBe(errorMessage);
      expect(failedJob.errorCount).toBe(1);
      expect(failedJob.lastError).toBeDefined();
      expect(failedJob.endDate).toBeDefined();
      
      // 6. Verify final job details
      const finalJob = await jobService.getJobStatus(newJob.id);
      expect(finalJob.status).toBe('failed');
      expect(finalJob.error).toBe(errorMessage);
      
      // 7. Verify we can retry the job
      const retryResult = await jobService.retryFailedJob(newJob.id);
      expect(retryResult.originalJobId).toBe(newJob.id);
      expect(retryResult.newJobId).toBeDefined();
      expect(retryResult.status).toBe('pending');
      
      // 8. Verify the new job was created correctly
      const retriedJob = await jobService.findJobById(retryResult.newJobId);
      expect(retriedJob).toBeDefined();
      if (retriedJob) { // TS null check
        expect(retriedJob.url).toBe(newJob.url);
        expect(retriedJob.status).toBe('pending');
        expect(retriedJob.progress).toBe(0);
        expect(retriedJob.error).toBeNull();
      }
    });
    
    it('should handle job cancellation correctly', async () => {
      // 1. Create a new job
      const newJob = await jobService.createJob({
        url: 'https://test.com/docs/cancel',
        status: 'pending',
        type: 'crawl',
        progress: 0,
        startDate: new Date(),
        name: 'Cancellation Test Job',
        tags: ['test', 'cancel'],
        stats: { pagesProcessed: 0, pagesSkipped: 0, totalChunks: 0 },
      });
      
      // 2. Start the job
      await jobService.updateJobProgress(newJob.id, 'running', 0);
      
      // 3. Make some progress
      await jobService.updateJobProgress(newJob.id, 'running', 0.4);
      
      // 4. Cancel the job
      const cancelReason = 'User requested cancellation';
      const cancelledJob = await jobService.cancelJob(newJob.id, cancelReason);
      
      expect(cancelledJob.status).toBe('cancelled');
      expect(cancelledJob.shouldCancel).toBe(true);
      expect(cancelledJob.error).toContain(cancelReason);
      expect(cancelledJob.endDate).toBeDefined();
      
      // 5. Verify final job details
      const finalJob = await jobService.getJobStatus(newJob.id);
      expect(finalJob.status).toBe('cancelled');
      expect(finalJob.error).toContain(cancelReason);
      expect(finalJob.canCancel).toBe(false);
      expect(finalJob.canPause).toBe(false);
      expect(finalJob.canResume).toBe(false);
    });
  });
}); 