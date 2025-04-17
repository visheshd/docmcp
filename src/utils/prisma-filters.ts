import { Prisma } from '../generated/prisma';

/**
 * Utility functions for common Prisma filtering patterns
 * These functions help create consistent where clauses for common filtering scenarios
 */

/**
 * Create a Prisma filter for filtering documents by tags
 * @param tags Array of tags to filter by
 * @returns Prisma where clause fragment for tag filtering
 */
export const createTagsFilter = (tags?: string[]): any => {
  if (!tags || tags.length === 0) {
    return {};
  }
  
  return {
    job: {
      tags: {
        hasSome: tags
      }
    }
  };
};

/**
 * Create a Prisma filter for filtering documents by job status
 * @param status Job status to filter by
 * @returns Prisma where clause fragment for status filtering
 */
export const createStatusFilter = (status?: string): any => {
  if (!status) {
    return {};
  }
  
  // Convert status to lowercase to match enum values
  const lowerStatus = status.toLowerCase();
  
  return {
    job: {
      status: lowerStatus
    }
  };
};

/**
 * Create a Prisma filter for filtering documents by job ID
 * @param jobId Job ID to filter by
 * @returns Prisma where clause fragment for job ID filtering
 */
export const createJobIdFilter = (jobId?: string): any => {
  if (!jobId) {
    return {};
  }
  
  return {
    jobId
  };
};

/**
 * Create a Prisma filter for filtering documents by metadata
 * @param metadataFilters Key-value pairs for metadata filtering
 * @returns Prisma where clause fragment for metadata filtering
 */
export const createMetadataFilter = (metadataFilters?: Record<string, any>): any => {
  if (!metadataFilters || Object.keys(metadataFilters).length === 0) {
    return {};
  }
  
  // Create a path filter for each metadata key
  const filters = Object.entries(metadataFilters).map(([key, value]) => {
    return {
      metadata: {
        path: [key],
        equals: value
      }
    };
  });
  
  // If there are multiple filters, combine them with AND
  if (filters.length > 1) {
    return {
      AND: filters
    };
  }
  
  return filters[0];
};

/**
 * Combine multiple filter objects into a single Prisma where clause
 * @param filters Array of filter objects to combine
 * @returns Combined Prisma where clause
 */
export const combineFilters = (filters: any[]): any => {
  // Remove empty filters
  const nonEmptyFilters = filters.filter(f => f && Object.keys(f).length > 0);
  
  if (nonEmptyFilters.length === 0) {
    return {};
  }
  
  // If there's a single filter, return it directly
  if (nonEmptyFilters.length === 1) {
    return nonEmptyFilters[0];
  }
  
  // Combine multiple filters
  const mergedFilter = nonEmptyFilters.reduce((result, filter) => {
    // Special handling for job-related filters to merge them correctly
    if (filter.job && result.job) {
      result.job = { ...result.job, ...filter.job };
      return result;
    }
    
    // For other filters, merge at top level
    return { ...result, ...filter };
  }, {});
  
  return mergedFilter;
};

/**
 * Create a complete Prisma where clause from common filter parameters
 * @param params Filter parameters
 * @returns Combined Prisma where clause
 */
export const createWhereClause = (params: {
  tags?: string[];
  status?: string;
  jobId?: string;
  metadataFilters?: Record<string, any>;
}): any => {
  const filters = [
    createTagsFilter(params.tags),
    createStatusFilter(params.status),
    createJobIdFilter(params.jobId),
    createMetadataFilter(params.metadataFilters)
  ];
  
  return combineFilters(filters);
}; 