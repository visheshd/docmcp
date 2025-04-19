import { Job, JobCreateData, JobStats } from './types';

/**
 * Interface for job management.
 * Implementations handle the creation, updating, and tracking of crawl jobs
 * in the database or other persistent storage.
 */
export interface IJobManager {
  /**
   * Create a new job in the database
   * @param data Data for the job to create
   * @returns The created job
   */
  createJob(data: JobCreateData): Promise<Job>;
  
  /**
   * Update the progress of a job
   * @param jobId The ID of the job to update
   * @param progress The progress value (0-1)
   * @param stats Job statistics to update
   */
  updateProgress(jobId: string, progress: number, stats: JobStats): Promise<void>;
  
  /**
   * Mark a job as completed
   * @param jobId The ID of the job to mark as completed
   * @param stats Final job statistics
   */
  markJobCompleted(jobId: string, stats: JobStats): Promise<void>;
  
  /**
   * Mark a job as failed
   * @param jobId The ID of the job to mark as failed
   * @param error Error message or reason for failure
   * @param stats Job statistics at the time of failure
   */
  markJobFailed(jobId: string, error: string, stats: JobStats): Promise<void>;
  
  /**
   * Check if a job should continue processing
   * This checks if the job has been cancelled or paused
   * @param jobId The ID of the job to check
   * @returns True if the job should continue, false if it should stop
   */
  shouldContinue(jobId: string): Promise<boolean>;

  /**
   * Cancel a running job
   * @param jobId ID of the job to cancel
   * @param reason Optional reason for cancellation
   */
  cancelJob(jobId: string, reason?: string): Promise<void>;

  /**
   * Pause a running job
   * @param jobId ID of the job to pause
   */
  pauseJob(jobId: string): Promise<void>;

  /**
   * Resume a paused job
   * @param jobId ID of the job to resume
   */
  resumeJob(jobId: string): Promise<void>;
} 