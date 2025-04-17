import { PrismaClient, Package, PackageVersion, PackageDocumentationMapping } from '../generated/prisma';
import { getPrismaClient as getMainPrismaClient } from '../config/database';
import logger from '../utils/logger';
import { DetectedPackage } from '../utils/code-parser';

/**
 * Options for finding documentation
 */
export interface FindDocumentationOptions {
  version?: string;
  preferOfficial?: boolean;
  limit?: number;
  onlyApiDocs?: boolean;
  onlyGuides?: boolean;
}

/**
 * Documentation result object
 */
export interface DocumentationResult {
  documentId: string;
  title: string;
  url: string;
  packageName: string;
  version?: string;
  score: number;
  isApiDoc: boolean;
  isGuide: boolean;
  isHomepage: boolean;
  sourceName: string;
  isOfficialSource: boolean;
}

/**
 * Service for mapping packages to their documentation
 */
export class DocumentationMapperService {
  private prisma: PrismaClient;
  private cacheEnabled: boolean;
  private cacheTTL: number; // Time to live in seconds

  constructor(
    prismaClient?: PrismaClient, 
    options?: { 
      cacheEnabled?: boolean;
      cacheTTL?: number; 
    }
  ) {
    this.prisma = prismaClient || getMainPrismaClient();
    this.cacheEnabled = options?.cacheEnabled ?? true;
    this.cacheTTL = options?.cacheTTL ?? 3600; // Default 1 hour
  }

  /**
   * Initialize the service with seed data if no documentation mappings exist
   * This ensures there's always some baseline documentation available
   */
  async initializeWithSeedData(): Promise<boolean> {
    try {
      // Check if we already have mappings
      const existingMappingsCount = await this.prisma.packageDocumentationMapping.count();
      
      if (existingMappingsCount === 0) {
        logger.info('No existing documentation mappings found, seeding initial data');
        const seedCount = await this.seedPackageDocumentation();
        return seedCount > 0;
      }
      
      logger.debug(`Found ${existingMappingsCount} existing documentation mappings, skipping seed`);
      return false;
    } catch (error) {
      logger.error('Error initializing with seed data:', error);
      return false;
    }
  }

  /**
   * Find or create a package in the database
   */
  async findOrCreatePackage(name: string, language: string): Promise<Package> {
    try {
      // Try to find the package
      const existingPackage = await this.prisma.package.findUnique({
        where: { name }
      });

      if (existingPackage) {
        return existingPackage;
      }

      // Create the package if not found
      return await this.prisma.package.create({
        data: {
          name,
          language,
          popularity: 0 // Initial popularity
        }
      });
    } catch (error) {
      logger.error(`Error finding or creating package ${name}:`, error);
      throw error;
    }
  }

  /**
   * Find or create a package version
   */
  async findOrCreatePackageVersion(
    packageId: string, 
    version: string, 
    isLatest: boolean = false
  ): Promise<PackageVersion> {
    try {
      // Try to find the version
      const existingVersion = await this.prisma.packageVersion.findUnique({
        where: {
          packageId_version: {
            packageId,
            version
          }
        }
      });

      if (existingVersion) {
        // Update isLatest if needed
        if (existingVersion.isLatest !== isLatest && isLatest === true) {
          // If this is now the latest, set all others to false
          await this.prisma.$transaction([
            // Set all versions of this package to not latest
            this.prisma.packageVersion.updateMany({
              where: { packageId },
              data: { isLatest: false }
            }),
            // Set this version to latest
            this.prisma.packageVersion.update({
              where: { id: existingVersion.id },
              data: { isLatest: true }
            })
          ]);
          
          return {
            ...existingVersion,
            isLatest: true
          };
        }
        
        return existingVersion;
      }

      // If this is the latest version, set all other versions to not latest
      if (isLatest) {
        await this.prisma.packageVersion.updateMany({
          where: { packageId },
          data: { isLatest: false }
        });
      }

      // Create the version if not found
      return await this.prisma.packageVersion.create({
        data: {
          packageId,
          version,
          isLatest,
          releaseDate: new Date()
        }
      });
    } catch (error) {
      logger.error(`Error finding or creating package version ${packageId}@${version}:`, error);
      throw error;
    }
  }

  /**
   * Map a document to a package
   */
  async mapDocumentToPackage(
    documentId: string,
    packageName: string,
    language: string,
    options?: {
      version?: string;
      isApiDoc?: boolean;
      isGuide?: boolean;
      isHomepage?: boolean;
      relevanceScore?: number;
      sourceName?: string;
      sourceUrl?: string;
      sourceIsOfficial?: boolean;
    }
  ): Promise<PackageDocumentationMapping> {
    try {
      // Find or create the package
      const pkg = await this.findOrCreatePackage(packageName, language);
      
      // Find or create the version if provided
      let versionId: string | null = null;
      if (options?.version) {
        const version = await this.findOrCreatePackageVersion(
          pkg.id, 
          options.version,
          true // Assume it's the latest version if specified
        );
        versionId = version.id;
      }
      
      // Check if mapping already exists
      const existingMapping = await this.prisma.packageDocumentationMapping.findFirst({
        where: {
          packageId: pkg.id,
          documentId
        }
      });
      
      if (existingMapping) {
        // Update existing mapping
        return await this.prisma.packageDocumentationMapping.update({
          where: { id: existingMapping.id },
          data: {
            versionId,
            isApiDoc: options?.isApiDoc ?? existingMapping.isApiDoc,
            isGuide: options?.isGuide ?? existingMapping.isGuide,
            isHomepage: options?.isHomepage ?? existingMapping.isHomepage,
            relevanceScore: options?.relevanceScore ?? existingMapping.relevanceScore,
            sourceName: options?.sourceName ?? existingMapping.sourceName,
            sourceUrl: options?.sourceUrl,
            sourceIsOfficial: options?.sourceIsOfficial ?? existingMapping.sourceIsOfficial
          }
        });
      }
      
      // Create new mapping
      return await this.prisma.packageDocumentationMapping.create({
        data: {
          packageId: pkg.id,
          documentId,
          versionId,
          isApiDoc: options?.isApiDoc ?? false,
          isGuide: options?.isGuide ?? false,
          isHomepage: options?.isHomepage ?? false,
          relevanceScore: options?.relevanceScore ?? 0.5,
          sourceName: options?.sourceName ?? 'Unknown',
          sourceUrl: options?.sourceUrl,
          sourceIsOfficial: options?.sourceIsOfficial ?? false
        }
      });
    } catch (error) {
      logger.error(`Error mapping document ${documentId} to package ${packageName}:`, error);
      throw error;
    }
  }

  /**
   * Find documentation for a package
   */
  async findDocumentation(
    packageName: string,
    options?: FindDocumentationOptions
  ): Promise<DocumentationResult[]> {
    try {
      // Check cache first if enabled
      if (this.cacheEnabled) {
        const cacheKey = this.buildCacheKey(packageName, options);
        const cachedResults = await this.getFromCache(cacheKey);
        
        if (cachedResults) {
          logger.debug(`Cache hit for documentation of ${packageName}`);
          return cachedResults;
        }
      }
      
      // Find the package
      const pkg = await this.prisma.package.findUnique({
        where: { name: packageName }
      });
      
      if (!pkg) {
        logger.warn(`Package ${packageName} not found in database`);
        return [];
      }
      
      // Build where conditions
      const whereConditions: any = {
        packageId: pkg.id
      };
      
      // Add version filter if specified
      if (options?.version) {
        whereConditions.version = {
          is: {
            version: options.version
          }
        };
      } else {
        // If no version specified, prefer latest
        whereConditions.version = {
          is: {
            isLatest: true
          }
        };
      }
      
      // Add documentation type filters
      if (options?.onlyApiDocs) {
        whereConditions.isApiDoc = true;
      }
      
      if (options?.onlyGuides) {
        whereConditions.isGuide = true;
      }
      
      // Determine sort order
      let orderBy: any = [];
      
      // If preferring official docs, sort by that first
      if (options?.preferOfficial) {
        orderBy.push({ sourceIsOfficial: 'desc' });
      }
      
      // Then sort by relevance
      orderBy.push({ relevanceScore: 'desc' });
      
      // Get mappings with documents and versions
      const mappings = await this.prisma.packageDocumentationMapping.findMany({
        where: whereConditions,
        include: {
          document: {
            select: {
              id: true,
              title: true,
              url: true
            }
          },
          version: {
            select: {
              version: true
            }
          }
        },
        orderBy,
        take: options?.limit || 10
      });
      
      // Transform to result objects
      const results = mappings.map(mapping => ({
        documentId: mapping.document.id,
        title: mapping.document.title,
        url: mapping.document.url,
        packageName: packageName,
        version: mapping.version?.version,
        score: mapping.relevanceScore,
        isApiDoc: mapping.isApiDoc,
        isGuide: mapping.isGuide,
        isHomepage: mapping.isHomepage,
        sourceName: mapping.sourceName,
        isOfficialSource: mapping.sourceIsOfficial
      }));
      
      // If we didn't find any results, try to get fallback documentation
      if (results.length === 0) {
        logger.debug(`No direct documentation found for ${packageName}, trying fallbacks`);
        const fallbackResults = await this.findFallbackDocumentation(packageName, pkg.language, options);
        if (fallbackResults.length > 0) {
          // Cache fallback results too
          if (this.cacheEnabled) {
            const cacheKey = this.buildCacheKey(packageName, options);
            await this.saveToCache(cacheKey, fallbackResults);
          }
          return fallbackResults;
        }
      } else {
        // Cache results if enabled
        if (this.cacheEnabled) {
          const cacheKey = this.buildCacheKey(packageName, options);
          await this.saveToCache(cacheKey, results);
        }
      }
      
      return results;
    } catch (error) {
      logger.error(`Error finding documentation for package ${packageName}:`, error);
      return [];
    }
  }

  /**
   * Find fallback documentation for packages that don't have direct matches
   * This looks for:
   * 1. Similar packages by name
   * 2. Common technologies in the same language
   * 3. General guides for the language ecosystem
   */
  async findFallbackDocumentation(
    packageName: string,
    language: string,
    options?: FindDocumentationOptions
  ): Promise<DocumentationResult[]> {
    try {
      const results: DocumentationResult[] = [];
      let limit = options?.limit || 5;
      
      // 1. Try similar packages (using startsWith or contains)
      const similarPackagePattern = packageName.includes('-') 
        ? packageName.split('-')[0] // For scoped packages or with hyphens
        : packageName.slice(0, Math.max(3, Math.floor(packageName.length / 2))); // Use prefix
        
      // Find packages with similar names
      const similarPackages = await this.prisma.package.findMany({
        where: {
          name: {
            contains: similarPackagePattern
          },
          language: language,
          NOT: {
            name: packageName // Exclude the current package
          }
        },
        include: {
          docMappings: {
            where: {
              relevanceScore: {
                gte: 0.7 // Only high-quality mappings
              }
            },
            include: {
              document: {
                select: {
                  id: true,
                  title: true,
                  url: true
                }
              },
              version: {
                select: {
                  version: true
                }
              }
            },
            orderBy: {
              relevanceScore: 'desc'
            },
            take: 2 // Top 2 documents per similar package
          }
        },
        take: 3 // Top 3 similar packages
      });
      
      // Add results from similar packages
      for (const pkg of similarPackages) {
        for (const mapping of pkg.docMappings) {
          if (results.length >= limit) break;
          
          results.push({
            documentId: mapping.document.id,
            title: mapping.document.title,
            url: mapping.document.url,
            packageName: pkg.name, // The actual similar package
            version: mapping.version?.version,
            score: mapping.relevanceScore * 0.8, // Reduce score slightly as it's a fallback
            isApiDoc: mapping.isApiDoc,
            isGuide: mapping.isGuide,
            isHomepage: mapping.isHomepage,
            sourceName: `${mapping.sourceName} (similar to ${packageName})`,
            isOfficialSource: mapping.sourceIsOfficial
          });
        }
      }
      
      // 2. Add top resources for the language if still not enough results
      if (results.length < limit) {
        // Find language-specific guides (filtering by isGuide since they're more likely to be useful as fallbacks)
        const languageGuides = await this.prisma.packageDocumentationMapping.findMany({
          where: {
            package: {
              language: language,
            },
            isGuide: true,
            relevanceScore: {
              gte: 0.8 // Only high-quality guides
            }
          },
          include: {
            document: {
              select: {
                id: true,
                title: true,
                url: true
              }
            },
            package: {
              select: {
                name: true
              }
            },
            version: {
              select: {
                version: true
              }
            }
          },
          orderBy: {
            relevanceScore: 'desc'
          },
          take: limit - results.length
        });
        
        // Add language guides
        for (const mapping of languageGuides) {
          results.push({
            documentId: mapping.document.id,
            title: mapping.document.title,
            url: mapping.document.url,
            packageName: mapping.package.name,
            version: mapping.version?.version,
            score: mapping.relevanceScore * 0.7, // Reduce score more as it's just language-related
            isApiDoc: mapping.isApiDoc,
            isGuide: mapping.isGuide,
            isHomepage: mapping.isHomepage,
            sourceName: `${mapping.sourceName} (${language} ecosystem)`,
            isOfficialSource: mapping.sourceIsOfficial
          });
        }
      }
      
      // If we still don't have enough results, we could add general tech stack documentation,
      // popular frameworks for that language, etc.
      
      return results;
    } catch (error) {
      logger.error(`Error finding fallback documentation for ${packageName}:`, error);
      return [];
    }
  }

  /**
   * Find documentation for multiple packages
   */
  async findDocumentationForPackages(
    packageNames: string[],
    options?: FindDocumentationOptions
  ): Promise<Map<string, DocumentationResult[]>> {
    const results = new Map<string, DocumentationResult[]>();
    
    // Process packages in parallel
    await Promise.all(packageNames.map(async (packageName) => {
      const packageResults = await this.findDocumentation(packageName, options);
      results.set(packageName, packageResults);
    }));
    
    return results;
  }

  /**
   * Get scores for documents based on their relevance to packages
   */
  async scoreDocumentsForPackages(
    documentIds: string[],
    packageNames: string[]
  ): Promise<Map<string, number>> {
    try {
      const scores = new Map<string, number>();
      
      // Initialize all scores to 0
      for (const docId of documentIds) {
        scores.set(docId, 0);
      }
      
      // No packages to score against
      if (packageNames.length === 0) {
        return scores;
      }
      
      // Find packages
      const packages = await this.prisma.package.findMany({
        where: {
          name: {
            in: packageNames
          }
        }
      });
      
      const packageIds = packages.map(p => p.id);
      
      // No matching packages found
      if (packageIds.length === 0) {
        return scores;
      }
      
      // Find mappings for these documents and packages
      const mappings = await this.prisma.packageDocumentationMapping.findMany({
        where: {
          documentId: {
            in: documentIds
          },
          packageId: {
            in: packageIds
          }
        }
      });
      
      // Process mappings to calculate scores
      for (const mapping of mappings) {
        const currentScore = scores.get(mapping.documentId) || 0;
        
        // Calculate new score
        let mappingScore = mapping.relevanceScore;
        
        // Boost score if this is official documentation
        if (mapping.sourceIsOfficial) {
          mappingScore *= 1.5;
        }
        
        // Use the highest score if this document is mapped to multiple packages
        scores.set(mapping.documentId, Math.max(currentScore, mappingScore));
      }
      
      return scores;
    } catch (error) {
      logger.error('Error scoring documents for packages:', error);
      // Return empty map in case of error
      return new Map<string, number>();
    }
  }

  /**
   * Build a cache key for the given package and options
   */
  private buildCacheKey(packageName: string, options?: FindDocumentationOptions): string {
    let key = `doc:${packageName}`;
    
    if (options?.version) {
      key += `:v${options.version}`;
    }
    
    if (options?.preferOfficial) {
      key += ':official';
    }
    
    if (options?.onlyApiDocs) {
      key += ':api';
    }
    
    if (options?.onlyGuides) {
      key += ':guide';
    }
    
    if (options?.limit) {
      key += `:limit${options.limit}`;
    }
    
    return key;
  }

  /**
   * Get results from cache
   */
  private async getFromCache(key: string): Promise<DocumentationResult[] | null> {
    try {
      const cacheEntry = await this.prisma.documentationCache.findUnique({
        where: { key }
      });
      
      if (!cacheEntry) {
        return null;
      }
      
      // Check if expired
      if (new Date() > cacheEntry.expiresAt) {
        // Delete expired entry
        await this.prisma.documentationCache.delete({
          where: { key }
        });
        return null;
      }
      
      // Parse cached data
      return cacheEntry.data as unknown as DocumentationResult[];
    } catch (error) {
      logger.error(`Error getting cache for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Save results to cache
   */
  private async saveToCache(key: string, results: DocumentationResult[]): Promise<void> {
    try {
      // Calculate expiration date
      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + this.cacheTTL);
      
      // Upsert cache entry
      await this.prisma.documentationCache.upsert({
        where: { key },
        update: {
          data: results as unknown as any,
          expiresAt
        },
        create: {
          key,
          data: results as unknown as any,
          expiresAt
        }
      });
    } catch (error) {
      logger.error(`Error saving to cache for key ${key}:`, error);
    }
  }

  /**
   * Clear all caches or for a specific package
   */
  async clearCache(packageName?: string): Promise<void> {
    try {
      if (packageName) {
        // Clear cache for specific package
        await this.prisma.documentationCache.deleteMany({
          where: {
            key: {
              startsWith: `doc:${packageName}`
            }
          }
        });
      } else {
        // Clear all caches
        await this.prisma.documentationCache.deleteMany({});
      }
    } catch (error) {
      logger.error(`Error clearing cache:`, error);
    }
  }
  
  /**
   * Delete expired cache entries
   */
  async cleanExpiredCache(): Promise<number> {
    try {
      const now = new Date();
      const result = await this.prisma.documentationCache.deleteMany({
        where: {
          expiresAt: {
            lt: now
          }
        }
      });
      
      return result.count;
    } catch (error) {
      logger.error(`Error cleaning expired cache:`, error);
      return 0;
    }
  }

  /**
   * Seed initial package documentation mappings for common packages
   * Used to provide baseline documentation mappings
   */
  async seedPackageDocumentation(): Promise<number> {
    try {
      const seedData = [
        {
          packageName: 'react',
          language: 'javascript',
          docs: [
            {
              url: 'https://react.dev/reference/react',
              title: 'React API Reference',
              isApiDoc: true,
              isGuide: false,
              isHomepage: false,
              sourceName: 'React Documentation',
              sourceIsOfficial: true,
              relevanceScore: 0.95
            },
            {
              url: 'https://react.dev/learn',
              title: 'React Learn',
              isApiDoc: false,
              isGuide: true,
              isHomepage: false,
              sourceName: 'React Documentation',
              sourceIsOfficial: true,
              relevanceScore: 0.9
            }
          ]
        },
        {
          packageName: 'next',
          language: 'javascript',
          docs: [
            {
              url: 'https://nextjs.org/docs',
              title: 'Next.js Documentation',
              isApiDoc: true,
              isGuide: true,
              isHomepage: true,
              sourceName: 'Next.js Documentation',
              sourceIsOfficial: true,
              relevanceScore: 0.95
            },
            {
              url: 'https://nextjs.org/docs/app/api-reference',
              title: 'Next.js API Reference',
              isApiDoc: true,
              isGuide: false,
              isHomepage: false,
              sourceName: 'Next.js Documentation',
              sourceIsOfficial: true,
              relevanceScore: 0.95
            },
            {
              url: 'https://nextjs.org/docs/app/building-your-application/routing',
              title: 'Next.js Routing',
              isApiDoc: false,
              isGuide: true,
              isHomepage: false,
              sourceName: 'Next.js Documentation',
              sourceIsOfficial: true,
              relevanceScore: 0.9
            }
          ]
        },
        {
          packageName: '@langchain/langgraph',
          language: 'javascript',
          docs: [
            {
              url: 'https://langchain-ai.github.io/langgraphjs/',
              title: 'LangGraph.js Documentation',
              isApiDoc: true,
              isGuide: true,
              isHomepage: true,
              sourceName: 'LangGraph Documentation',
              sourceIsOfficial: true,
              relevanceScore: 0.95
            },
            {
              url: 'https://langchain-ai.github.io/langgraphjs/get_started/',
              title: 'LangGraph.js - Getting Started',
              isApiDoc: false,
              isGuide: true,
              isHomepage: false,
              sourceName: 'LangGraph Documentation',
              sourceIsOfficial: true,
              relevanceScore: 0.9
            },
            {
              url: 'https://langchain-ai.github.io/langgraphjs/api_reference/',
              title: 'LangGraph.js API Reference',
              isApiDoc: true,
              isGuide: false,
              isHomepage: false,
              sourceName: 'LangGraph Documentation',
              sourceIsOfficial: true,
              relevanceScore: 0.95
            }
          ]
        },
        // Add more common packages as needed
      ];

      let mappingsCount = 0;

      // We need to create both documents and mappings
      for (const seed of seedData) {
        // Check if package already exists to avoid duplicates
        const existingPackage = await this.prisma.package.findUnique({
          where: { name: seed.packageName },
          include: { docMappings: true }
        });

        if (existingPackage && existingPackage.docMappings.length > 0) {
          // Skip if already has mappings
          logger.debug(`Package ${seed.packageName} already has documentation mappings, skipping`);
          continue;
        }

        // Create documents and map them
        for (const doc of seed.docs) {
          // Create the document
          const document = await this.prisma.document.create({
            data: {
              url: doc.url,
              title: doc.title,
              content: `Seed documentation for ${seed.packageName}`, // Minimal content
              metadata: { 
                package: seed.packageName, 
                type: doc.isApiDoc ? 'api' : 'guide' 
              },
              crawlDate: new Date(),
              level: 0 // Root level
            }
          });

          // Map the document to the package
          await this.mapDocumentToPackage(document.id, seed.packageName, seed.language, {
            isApiDoc: doc.isApiDoc,
            isGuide: doc.isGuide,
            isHomepage: doc.isHomepage,
            relevanceScore: doc.relevanceScore,
            sourceName: doc.sourceName,
            sourceUrl: doc.url,
            sourceIsOfficial: doc.sourceIsOfficial
          });

          mappingsCount++;
        }
      }

      logger.info(`Created ${mappingsCount} seed documentation mappings`);
      return mappingsCount;
    } catch (error) {
      logger.error('Error seeding package documentation:', error);
      return 0;
    }
  }
} 