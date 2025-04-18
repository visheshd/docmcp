import { z } from "zod";
import { JobService } from "../job.service";
import { CallToolResult } from "@modelcontextprotocol/sdk/types";
import logger from "../../utils/logger";

// Define the input schema for the retry-job tool
export const retryJobSchema = z.object({
  jobId: z.string().uuid("Invalid Job ID format"),
});

// Define the handler function for the retry-job tool
export const retryJobHandler = async (input: z.infer<typeof retryJobSchema>): Promise<CallToolResult> => {
  // Extract arguments using the schema for validation
  const validationResult = retryJobSchema.safeParse(input);
  
  if (!validationResult.success) {
    const errorMessage = `Invalid input for retry-job: ${validationResult.error.message}`;
    logger.error(errorMessage);
    return {
      result: "error",
      content: [{ type: "text", text: errorMessage }],
    };
  }
  
  const { jobId } = validationResult.data;
  const jobService = new JobService();

  try {
    logger.info(`Attempting to retry failed job with ID: ${jobId}`);
    const result = await jobService.retryFailedJob(jobId);
    
    const message = `Successfully initiated retry for job ${jobId}. New job created with ID: ${result.newJobId}.`;
    logger.info(message);
    
    return {
      result: "success",
      content: [{ type: "text", text: message }],
      data: {
        originalJobId: result.originalJobId,
        newJobId: result.newJobId,
        newJobStatus: result.status,
      },
    };
  } catch (error: any) {
    logger.error(`Error retrying job ${jobId}:`, error);
    const errorMessage = `Failed to retry job ${jobId}: ${error.message || "Unknown error"}`;
    return {
      result: "error",
      content: [{ type: "text", text: errorMessage }],
    };
  }
}; 