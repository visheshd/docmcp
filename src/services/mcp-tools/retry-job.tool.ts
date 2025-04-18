import { z } from "zod";
import { JobService } from "../job.service";
import { CallToolResult } from "@modelcontextprotocol/sdk/types";
import logger from "../../utils/logger";
import { PrismaClient } from "@prisma/client";
import { getPrismaClient as getMainPrismaClient } from "../../config/database";

// Define the input schema as an object literal for SDK consumption
export const retryJobSchema = {
  jobId: z.string().uuid("Invalid Job ID format"),
};

// Define the type for the handler parameters manually to include internal params
type RetryJobParams = {
  jobId: string;
  // Optional Prisma client for testing/injection
  _prisma?: PrismaClient;
};

// Define the handler function matching SDK expectations
export const retryJobHandler = async (params: RetryJobParams): Promise<CallToolResult> => {
  // Assuming SDK performed validation based on retryJobSchema object literal
  // Extract jobId directly from validated params
  const { jobId } = params;

  // Use injected Prisma client or fallback to main client
  const prisma = params._prisma || getMainPrismaClient();
  const jobService = new JobService(prisma);

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
      content: [{ type: "text", text: errorMessage }],
      isError: true
    };
  }
}; 