import { PrismaJobManager } from '../PrismaJobManager';
import { PrismaClient } from '@prisma/client';
import { JobStatus } from '../../../../generated/prisma';
import { JobCreateData, JobStats } from '../../interfaces/types';

// Mock PrismaClient
jest.mock('@prisma/client', () => {
  const mockCreate = jest.fn();
  const mockUpdate = jest.fn();
  const mockFindUnique = jest.fn();
  
  return {
    PrismaClient: jest.fn().mockImplementation(() => ({
      job: {
        create: mockCreate,
        update: mockUpdate,
        findUnique: mockFindUnique
      },
      $connect: jest.fn(),
      $disconnect: jest.fn()
    }))
  };
});

describe('PrismaJobManager', () => {
  let jobManager: PrismaJobManager;
  let mockPrisma: jest.Mocked<PrismaClient>;
  
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = new PrismaClient() as jest.Mocked<PrismaClient>;
    jobManager = new PrismaJobManager(mockPrisma);
  });
  
  describe('createJob', () => {
    it('should create a job in the database', async () => {
      // Setup test data
      const mockJobData: JobCreateData = {
        url: 'https://example.com',
        status: JobStatus.pending,
        type: 'crawl',
        startDate: new Date('2023-01-01'),
        progress: 0,
        endDate: null,
        error: null,
        stats: {
          pagesProcessed: 0,
          pagesSkipped: 0,
          totalChunks: 0
        },
        metadata: {
          sourceUrl: 'https://example.com',
          sourceName: 'Example',
          crawlMaxDepth: 3
        }
      };
      
      const mockCreatedJob = {
        id: 'job123',
        ...mockJobData,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      // Setup mock response
      mockPrisma.job.create.mockResolvedValueOnce(mockCreatedJob);
      
      // Execute method
      const result = await jobManager.createJob(mockJobData);
      
      // Verify results
      expect(mockPrisma.job.create).toHaveBeenCalledWith({
        data: {
          url: mockJobData.url,
          status: mockJobData.status,
          type: mockJobData.type,
          startDate: mockJobData.startDate,
          progress: mockJobData.progress,
          endDate: mockJobData.endDate,
          error: mockJobData.error,
          stats: mockJobData.stats,
          metadata: mockJobData.metadata
        }
      });
      
      expect(result).toEqual(mockCreatedJob);
    });
    
    it('should handle database errors', async () => {
      const mockError = new Error('Database error');
      mockPrisma.job.create.mockRejectedValueOnce(mockError);
      
      const mockJobData: JobCreateData = {
        url: 'https://example.com',
        status: JobStatus.pending,
        type: 'crawl',
        startDate: new Date(),
        progress: 0,
        endDate: null,
        error: null,
        stats: { pagesProcessed: 0, pagesSkipped: 0, totalChunks: 0 },
        metadata: {}
      };
      
      await expect(jobManager.createJob(mockJobData)).rejects.toThrow('Database error');
    });
  });
  
  describe('updateProgress', () => {
    it('should update job progress', async () => {
      const jobId = 'job123';
      const progress = 45;
      const stats: JobStats = {
        pagesProcessed: 45,
        pagesSkipped: 5,
        totalChunks: 100
      };
      
      mockPrisma.job.update.mockResolvedValueOnce({
        id: jobId,
        progress,
        stats,
        updatedAt: new Date()
      });
      
      await jobManager.updateProgress(jobId, progress, stats);
      
      expect(mockPrisma.job.update).toHaveBeenCalledWith({
        where: { id: jobId },
        data: {
          progress,
          stats,
          updatedAt: expect.any(Date)
        }
      });
    });
    
    it('should normalize progress values to 0-100 range', async () => {
      const jobId = 'job123';
      const stats: JobStats = { pagesProcessed: 0, pagesSkipped: 0, totalChunks: 0 };
      
      // Test overflow
      await jobManager.updateProgress(jobId, 150, stats);
      expect(mockPrisma.job.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            progress: 100 // Should cap at 100
          })
        })
      );
      
      jest.clearAllMocks();
      
      // Test underflow
      await jobManager.updateProgress(jobId, -10, stats);
      expect(mockPrisma.job.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            progress: 0 // Should floor at 0
          })
        })
      );
    });
  });
  
  describe('markJobCompleted', () => {
    it('should mark a job as completed', async () => {
      const jobId = 'job123';
      const stats: JobStats = {
        pagesProcessed: 100,
        pagesSkipped: 10,
        totalChunks: 200
      };
      
      await jobManager.markJobCompleted(jobId, stats);
      
      expect(mockPrisma.job.update).toHaveBeenCalledWith({
        where: { id: jobId },
        data: {
          status: JobStatus.completed,
          progress: 100,
          endDate: expect.any(Date),
          stats,
          updatedAt: expect.any(Date)
        }
      });
    });
  });
  
  describe('markJobFailed', () => {
    it('should mark a job as failed with error message', async () => {
      const jobId = 'job123';
      const errorMessage = 'Something went wrong';
      const stats: JobStats = {
        pagesProcessed: 50,
        pagesSkipped: 5,
        totalChunks: 100
      };
      
      await jobManager.markJobFailed(jobId, errorMessage, stats);
      
      expect(mockPrisma.job.update).toHaveBeenCalledWith({
        where: { id: jobId },
        data: {
          status: JobStatus.failed,
          endDate: expect.any(Date),
          error: errorMessage,
          stats,
          updatedAt: expect.any(Date)
        }
      });
    });
  });
  
  describe('shouldContinue', () => {
    it('should return true for pending jobs', async () => {
      mockPrisma.job.findUnique.mockResolvedValueOnce({
        status: JobStatus.pending
      });
      
      const result = await jobManager.shouldContinue('job123');
      
      expect(result).toBe(true);
    });
    
    it('should return true for running jobs', async () => {
      mockPrisma.job.findUnique.mockResolvedValueOnce({
        status: JobStatus.running
      });
      
      const result = await jobManager.shouldContinue('job123');
      
      expect(result).toBe(true);
    });
    
    it('should return false for completed jobs', async () => {
      mockPrisma.job.findUnique.mockResolvedValueOnce({
        status: JobStatus.completed
      });
      
      const result = await jobManager.shouldContinue('job123');
      
      expect(result).toBe(false);
    });
    
    it('should return false for failed jobs', async () => {
      mockPrisma.job.findUnique.mockResolvedValueOnce({
        status: JobStatus.failed
      });
      
      const result = await jobManager.shouldContinue('job123');
      
      expect(result).toBe(false);
    });
    
    it('should return false for non-existent jobs', async () => {
      mockPrisma.job.findUnique.mockResolvedValueOnce(null);
      
      const result = await jobManager.shouldContinue('nonexistent');
      
      expect(result).toBe(false);
    });
    
    it('should return false when database error occurs', async () => {
      mockPrisma.job.findUnique.mockRejectedValueOnce(new Error('Database error'));
      
      const result = await jobManager.shouldContinue('job123');
      
      expect(result).toBe(false);
    });
  });
  
  describe('findJobById', () => {
    it('should find a job by ID', async () => {
      const jobId = 'job123';
      const mockJob = {
        id: jobId,
        url: 'https://example.com',
        status: JobStatus.running,
        type: 'crawl',
        startDate: new Date(),
        progress: 50,
        endDate: null,
        error: null,
        stats: { pagesProcessed: 50, pagesSkipped: 0, totalChunks: 100 },
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      mockPrisma.job.findUnique.mockResolvedValueOnce(mockJob);
      
      const result = await jobManager.findJobById(jobId);
      
      expect(mockPrisma.job.findUnique).toHaveBeenCalledWith({
        where: { id: jobId }
      });
      
      expect(result).toEqual(mockJob);
    });
    
    it('should return null when job not found', async () => {
      mockPrisma.job.findUnique.mockResolvedValueOnce(null);
      
      const result = await jobManager.findJobById('nonexistent');
      
      expect(result).toBeNull();
    });
  });
  
  describe('cancelJob', () => {
    it('should mark a job as cancelled', async () => {
      const jobId = 'job123';
      
      await jobManager.cancelJob(jobId);
      
      expect(mockPrisma.job.update).toHaveBeenCalledWith({
        where: { id: jobId },
        data: {
          status: JobStatus.cancelled,
          endDate: expect.any(Date),
          updatedAt: expect.any(Date)
        }
      });
    });
  });
  
  describe('pauseJob', () => {
    it('should mark a job as paused', async () => {
      const jobId = 'job123';
      
      await jobManager.pauseJob(jobId);
      
      expect(mockPrisma.job.update).toHaveBeenCalledWith({
        where: { id: jobId },
        data: {
          status: JobStatus.paused,
          updatedAt: expect.any(Date)
        }
      });
    });
  });
  
  describe('resumeJob', () => {
    it('should mark a job as running', async () => {
      const jobId = 'job123';
      
      await jobManager.resumeJob(jobId);
      
      expect(mockPrisma.job.update).toHaveBeenCalledWith({
        where: { id: jobId },
        data: {
          status: JobStatus.running,
          updatedAt: expect.any(Date)
        }
      });
    });
  });
}); 