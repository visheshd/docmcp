import { MCPFunction, MCPTool, MCPToolRegistry } from '../../types/mcp';
import logger from '../../utils/logger';
import { JobService } from '../job.service';
import { getPrismaClient as getMainPrismaClient } from '../../config/database';
import { PrismaClient, JobType, JobStage, JobStatus } from '../../generated/prisma';

/**
 * Get Job Status MCP tool implementation
 * This tool allows checking the status and progress of a job in the system
 */

// Define the tool function schema following OpenAI Function Calling format
const getJobStatusFunction: MCPFunction = {
  name: 'get_job_status',
  description: 'Get detailed status information about a running or completed job',
  parameters: {
    type: 'object',
    properties: {
      jobId: {
        type: 'string',
        description: 'The ID of the job to check status for'
      }
    },
    required: ['jobId']
  }
};

// Input type for the handler
interface GetJobStatusParams {
  jobId: string;
  // For testing: provide custom Prisma client
  _prisma?: PrismaClient;
}

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

// Implement the tool handler
const getJobStatusHandler = async (params: GetJobStatusParams) => {
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
    return response;
  } catch (error) {
    logger.error('Error in get_job_status handler:', error);
    throw error;
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
      return `Job was cancelled${error ? `: ${error}` : ''}. Ran for ${formattedTimeElapsed || 'unknown time'} before cancellation.`;
      
    case 'paused':
      return `Job is paused at ${progressPercentage}% completion. Total run time so far: ${formattedTimeElapsed || 'unknown time'}.`;
      
    default:
      return `Job is in ${status} state.`;
  }
}

/**
 * Generate actionable commands for the job based on its status
 */
function getActionableCommands(jobStatus: JobStatusResponse): string[] {
  const commands = [];
  
  if (jobStatus.canCancel) {
    commands.push(`Cancel job: Use 'cancel_job' tool with jobId: "${jobStatus.id}"`);
  }
  
  if (jobStatus.canPause) {
    commands.push(`Pause job: Use 'pause_job' tool with jobId: "${jobStatus.id}"`);
  }
  
  if (jobStatus.canResume) {
    commands.push(`Resume job: Use 'resume_job' tool with jobId: "${jobStatus.id}"`);
  }
  
  return commands;
}

// Create the tool object
export const getJobStatusTool: MCPTool = {
  function: getJobStatusFunction,
  handler: getJobStatusHandler
};

// Register the tool
export const registerGetJobStatusTool = () => {
  MCPToolRegistry.registerTool(getJobStatusTool);
  logger.info('Registered get_job_status tool');
};

// Export the tool for testing
export default getJobStatusTool; 