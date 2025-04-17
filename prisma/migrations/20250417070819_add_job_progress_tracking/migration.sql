-- CreateEnum
CREATE TYPE "JobStage" AS ENUM ('initializing', 'crawling', 'processing', 'embedding', 'finalizing', 'cleanup');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JobStatus" ADD VALUE 'cancelled';
ALTER TYPE "JobStatus" ADD VALUE 'paused';

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "error_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "estimated_completion" TIMESTAMP(3),
ADD COLUMN     "items_failed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "items_processed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "items_skipped" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "items_total" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "last_activity" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "last_error" TIMESTAMP(3),
ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "should_cancel" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "should_pause" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stage" "JobStage",
ADD COLUMN     "time_elapsed" INTEGER,
ADD COLUMN     "time_remaining" INTEGER;

-- CreateIndex
CREATE INDEX "jobs_status_idx" ON "jobs"("status");

-- CreateIndex
CREATE INDEX "jobs_type_idx" ON "jobs"("type");

-- CreateIndex
CREATE INDEX "jobs_stage_idx" ON "jobs"("stage");

-- CreateIndex
CREATE INDEX "jobs_created_at_idx" ON "jobs"("created_at");

-- CreateIndex
CREATE INDEX "jobs_priority_idx" ON "jobs"("priority");
