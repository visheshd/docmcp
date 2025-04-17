/*
  Warnings:

  - The `embedding` column on the `chunks` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('crawl', 'process', 'delete');

-- DropIndex
DROP INDEX "chunks_embedding_idx";

-- AlterTable
ALTER TABLE "chunks" DROP COLUMN "embedding",
ADD COLUMN     "embedding" DOUBLE PRECISION[];

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "max_depth" INTEGER,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "name" TEXT,
ADD COLUMN     "tags" TEXT[],
ADD COLUMN     "type" "JobType" NOT NULL DEFAULT 'crawl';
