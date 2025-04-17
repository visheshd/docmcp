import { z } from 'zod';
import logger from '../../utils/logger';
import { JobService } from '../job.service';
import { getPrismaClient as getMainPrismaClient } from '../../config/database';
import { PrismaClient, JobType, JobStage, JobStatus } from '../../generated/prisma';

/**
 * Get Job Status MCP tool implementation
 * This tool allows checking the status and progress of a job in the system
 */

// Define Zod schema for parameters
export const getJobStatusSchema = {
  jobId: z.string().describe('The ID of the job to check status for')
};

// Explicitly define the type for the handler parameters
type GetJobStatusParams = {
  jobId: string;
  _prisma?: PrismaClient;
};

// Enhanced response type
interface JobStatusResponse {
  id: string;
  type: JobType;
  stage: JobStage | null;
  status: JobStatus;
  progress: number;
  progressPercentage: number;
  url: string;
  name: string | null;
  tags: string[];
  startDate: Date;
  endDate: Date | null;
  error: string | null;
  errorCount: number;
  lastError: Date | null;
  stats: Record<string, any>;
  timeElapsed: number | null;
  timeRemaining: number | null;
  estimatedCompletion: Date | null;
  lastActivity: Date;
  duration: number | null;
  canCancel: boolean;
  canPause: boolean;
  canResume: boolean;
  formattedDuration: string | null;
  formattedTimeElapsed: string | null;
  formattedTimeRemaining: string | null;
  statusMessage?: string;
  actionableCommands?: string[];
}

// Define the handler function matching SDK expectations
export const getJobStatusHandler = async (params: GetJobStatusParams) => {
  logger.info(`Get job status tool called for job ID: ${params.jobId}`);

  try {
    // Use the provided Prisma client or get the main one
    const prisma = params._prisma || getMainPrismaClient();
    
    // Create a job service with the Prisma client
    const jobService = new JobService(prisma);
    
    // Get detailed job status
    const jobStatus = await jobService.getJobStatus(params.jobId);
    
    // Format timeElapsed into a human-readable string
    const formatDuration = (seconds: number): string => {
      if (seconds < 60) {
        return `${seconds} second${seconds !== 1 ? 's' : ''}`;
      } else if (seconds < 3600) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes} minute${minutes !== 1 ? 's' : ''}, ${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`;
      } else {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${hours} hour${hours !== 1 ? 's' : ''}, ${minutes} minute${minutes !== 1 ? 's' : ''}`;
      }
    };
    
    // Enhance the response with formatted values
    const response: JobStatusResponse = {
      ...jobStatus,
      formattedDuration: jobStatus.duration ? formatDuration(jobStatus.duration) : null,
      formattedTimeElapsed: jobStatus.timeElapsed ? formatDuration(jobStatus.timeElapsed) : null,
      formattedTimeRemaining: jobStatus.timeRemaining ? formatDuration(jobStatus.timeRemaining) : null,
    };
    
    // Add the status message and actionable commands
    response.statusMessage = getStatusMessage(response);
    response.actionableCommands = getActionableCommands(response);
    
    logger.info(`Retrieved status for job ${params.jobId}: ${response.status}, progress: ${response.progressPercentage}%`);

    // Return simplified response for SDK
    return {
      content: [
        {
          type: 'text' as const,
          // Convert the detailed response to a string or select key fields
          text: `Status for Job ${response.id}: ${response.statusMessage}\nDetails: ${JSON.stringify(response, null, 2)}` 
        }
      ]
    };
  } catch (error) {
    logger.error('Error in get_job_status handler:', error);
    return {
      content: [
        {
          type: 'text' as const,
          text: error instanceof Error ? error.message : 'Failed to get job status'
        }
      ],
      isError: true
    };
  }
};

/**
 * Generate a human-readable status message based on job status
 */
function getStatusMessage(jobStatus: JobStatusResponse): string {
  const { status, stage, progressPercentage, error, formattedTimeElapsed, formattedTimeRemaining } = jobStatus;
  
  // Different messages based on status
  switch (status) {
    case 'pending':
      return `Job is queued and waiting to start.`;
      
    case 'running':
      let runningMessage = `Job is running`;
      if (stage) {
        runningMessage += ` (${stage} stage)`;
      }
      runningMessage += ` at ${progressPercentage}% completion`;
      
      if (formattedTimeElapsed) {
        runningMessage += `. Running for ${formattedTimeElapsed}`;
      }
      
      if (formattedTimeRemaining) {
        runningMessage += `. Estimated time remaining: ${formattedTimeRemaining}`;
      }
      
      return runningMessage;
      
    case 'completed':
      return `Job completed successfully (${progressPercentage}%) in ${formattedTimeElapsed || 'unknown time'}.`;
      
    case 'failed':
      return `Job failed${error ? `: ${error}` : ''}. Ran for ${formattedTimeElapsed || 'unknown time'} before failure.`;
      
    case 'cancelled':
      return `Job was cancelled${error ? `: ${error}` : ''}.`;
      
    default:
      return `Unknown job status: ${status}`;
  }
}

/**
 * Generate actionable commands for the job based on its status
 */
function getActionableCommands(jobStatus: JobStatusResponse): string[] {
  const { status, canCancel, canPause, canResume } = jobStatus;
  
  const commands: string[] = [];
  
  if (canCancel && status === 'running') {
    commands.push('Cancel');
  }
  
  if (canPause && status === 'running') {
    commands.push('Pause');
  }
  
  if (canResume && status === 'paused') {
    commands.push('Resume');
  }
  
  return commands;
}