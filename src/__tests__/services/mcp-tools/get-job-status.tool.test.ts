import { getJobStatusTool } from '../../../services/mcp-tools/get-job-status.tool';
import { JobService } from '../../../services/job.service';
import { PrismaClient } from '../../../generated/prisma';

// Mock dependencies
jest.mock('../../../services/job.service');
const mockedJobService = JobService as jest.MockedClass<typeof JobService>;

describe('Get Job Status Tool', () => {
  // Mock data for testing
  const mockJob = {
    id: 'test-job-id',
    type: 'crawl',
    stage: 'processing',
    status: 'running',
    progress: 0.75,
    url: 'https://example.com/docs',
    name: 'Test Documentation',
    tags: ['test', 'docs'],
    startDate: new Date('2023-04-17T00:00:00Z'),
    endDate: null,
    error: null,
    errorCount: 0,
    lastError: null,
    stats: {
      pagesProcessed: 15,
      pagesSkipped: 2,
      totalChunks: 30
    },
    timeElapsed: 3600, // 1 hour
    timeRemaining: 1200, // 20 minutes
    estimatedCompletion: new Date(Date.now() + 1200 * 1000),
    lastActivity: new Date(),
    _count: {
      documents: 15
    },
    itemsTotal: 20,
    itemsProcessed: 15,
    itemsFailed: 0,
    itemsSkipped: 2
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock getJobStatus method to return our test data
    mockedJobService.prototype.getJobStatus = jest.fn().mockResolvedValue({
      id: mockJob.id,
      type: mockJob.type,
      stage: mockJob.stage,
      status: mockJob.status,
      progress: mockJob.progress,
      progressPercentage: 75,
      url: mockJob.url,
      name: mockJob.name,
      tags: mockJob.tags,
      startDate: mockJob.startDate,
      endDate: mockJob.endDate,
      error: mockJob.error,
      errorCount: mockJob.errorCount,
      lastError: mockJob.lastError,
      stats: {
        ...mockJob.stats,
        documentsCount: mockJob._count.documents,
        itemsTotal: mockJob.itemsTotal,
        itemsProcessed: mockJob.itemsProcessed,
        itemsFailed: mockJob.itemsFailed,
        itemsSkipped: mockJob.itemsSkipped
      },
      timeElapsed: mockJob.timeElapsed,
      timeRemaining: mockJob.timeRemaining,
      estimatedCompletion: mockJob.estimatedCompletion,
      lastActivity: mockJob.lastActivity,
      duration: mockJob.timeElapsed,
      canCancel: true,
      canPause: true,
      canResume: false
    });
  });

  it('should return detailed job status information', async () => {
    // Execute the handler
    const result = await getJobStatusTool.handler({
      jobId: 'test-job-id',
      _prisma: {} as PrismaClient
    });

    // Verify JobService.getJobStatus was called with the right ID
    expect(mockedJobService.prototype.getJobStatus).toHaveBeenCalledWith('test-job-id');

    // Verify result format and content
    expect(result).toHaveProperty('id', 'test-job-id');
    expect(result).toHaveProperty('type', 'crawl');
    expect(result).toHaveProperty('status', 'running');
    expect(result).toHaveProperty('progress', 0.75);
    expect(result).toHaveProperty('progressPercentage', 75);
    
    // Verify formatted values
    expect(result).toHaveProperty('formattedTimeElapsed', '1 hour, 0 minutes');
    expect(result).toHaveProperty('formattedTimeRemaining', '20 minutes, 0 seconds');
    
    // Verify status message
    expect(result).toHaveProperty('statusMessage');
    expect(result.statusMessage).toContain('Job is running (processing stage) at 75% completion');
    expect(result.statusMessage).toContain('Running for 1 hour, 0 minutes');
    
    // Verify actionable commands
    expect(result).toHaveProperty('actionableCommands');
    expect(result.actionableCommands).toContain(`Cancel job: Use 'cancel_job' tool with jobId: "test-job-id"`);
    expect(result.actionableCommands).toContain(`Pause job: Use 'pause_job' tool with jobId: "test-job-id"`);
  });

  it('should handle jobs in different states', async () => {
    // Test with a completed job
    mockedJobService.prototype.getJobStatus = jest.fn().mockResolvedValue({
      id: 'completed-job-id',
      status: 'completed',
      progress: 1.0,
      progressPercentage: 100,
      timeElapsed: 7200, // 2 hours
      canCancel: false,
      canPause: false,
      canResume: false
    });
    
    const completedResult = await getJobStatusTool.handler({
      jobId: 'completed-job-id',
      _prisma: {} as PrismaClient
    });
    
    expect(completedResult.statusMessage).toContain('Job completed successfully (100%) in 2 hours, 0 minutes');
    expect(completedResult.actionableCommands).toHaveLength(0);
    
    // Test with a failed job
    mockedJobService.prototype.getJobStatus = jest.fn().mockResolvedValue({
      id: 'failed-job-id',
      status: 'failed',
      progress: 0.3,
      progressPercentage: 30,
      timeElapsed: 900, // 15 minutes
      error: 'Network error',
      canCancel: false,
      canPause: false,
      canResume: false
    });
    
    const failedResult = await getJobStatusTool.handler({
      jobId: 'failed-job-id',
      _prisma: {} as PrismaClient
    });
    
    expect(failedResult.statusMessage).toContain('Job failed: Network error');
    expect(failedResult.statusMessage).toContain('15 minutes, 0 seconds');
    expect(failedResult.actionableCommands).toHaveLength(0);
    
    // Test with a paused job
    mockedJobService.prototype.getJobStatus = jest.fn().mockResolvedValue({
      id: 'paused-job-id',
      status: 'paused',
      progress: 0.5,
      progressPercentage: 50,
      timeElapsed: 1800, // 30 minutes
      canCancel: true,
      canPause: false,
      canResume: true
    });
    
    const pausedResult = await getJobStatusTool.handler({
      jobId: 'paused-job-id',
      _prisma: {} as PrismaClient
    });
    
    expect(pausedResult.statusMessage).toContain('Job is paused at 50% completion');
    expect(pausedResult.actionableCommands).toContain(`Resume job: Use 'resume_job' tool with jobId: "paused-job-id"`);
    expect(pausedResult.actionableCommands).toContain(`Cancel job: Use 'cancel_job' tool with jobId: "paused-job-id"`);
  });

  it('should handle errors when retrieving job status', async () => {
    // Mock JobService to throw an error
    mockedJobService.prototype.getJobStatus = jest.fn().mockRejectedValue(
      new Error('Job not found')
    );
    
    // Execute the handler and expect it to throw
    await expect(getJobStatusTool.handler({
      jobId: 'non-existent-job-id',
      _prisma: {} as PrismaClient
    })).rejects.toThrow('Job not found');
  });
}); 