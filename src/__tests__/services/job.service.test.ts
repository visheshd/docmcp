import { JobService } from '../../services/job.service';
import { setupTestDatabase, teardownTestDatabase, getTestPrismaClient } from '../utils/testDb';
import type { Job, JobStatus } from '../../generated/prisma';

describe('JobService Integration Tests', () => {
  let jobService: JobService;
  let prisma: any;

  beforeAll(async () => {
    prisma = await setupTestDatabase();
    jobService = new JobService();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    // Clean up the database before each test
    await prisma.job.deleteMany();
  });

  describe('createJob', () => {
    it('should create a job successfully', async () => {
      const testJob: Omit<Job, 'id' | 'createdAt' | 'updatedAt'> = {
        url: 'https://test.com/docs',
        status: 'pending',
        progress: 0,
        startDate: new Date(),
        endDate: null,
        error: null,
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
          progress: 0,
          startDate: new Date(),
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
            progress: 0.5,
            startDate: new Date(),
            stats: { pagesProcessed: 5, pagesSkipped: 1, totalChunks: 20 },
          },
          {
            url: 'https://test.com/docs/2',
            status,
            progress: 0.7,
            startDate: new Date(),
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
          progress: 0,
          startDate: new Date(),
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
          progress: 0.8,
          startDate: new Date(),
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
          progress: 0.5,
          startDate: new Date(),
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
          progress: 0.5,
          startDate: new Date(),
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
          progress: 1.0,
          startDate: new Date(),
          endDate: new Date(),
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
}); 