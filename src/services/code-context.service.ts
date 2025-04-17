import { PrismaClient } from '../generated/prisma';
import { getPrismaClient as getMainPrismaClient } from '../config/database';
import logger from '../utils/logger';
import { getPackagesFromCode, DetectedPackage, parseCode } from '../utils/code-parser';

interface PackageDocumentationMapping {
  packageName: string;
  documentIds: string[];
  confidenceScore: number;
}

interface DocumentMetadata {
  package?: string;
  version?: string;
  type?: string;
  tags?: string[];
  [key: string]: unknown;
}

interface DocumentSuggestion {
  package: string;
  title: string;
  url: string;
  confidence: number;
}

export class CodeContextService {
  private prisma: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || getMainPrismaClient();
  }

  /**
   * Analyze code snippet to extract the context
   */
  async analyzeCodeContext(code: string, filename?: string): Promise<{
    packages: string[];
    relevantDocumentIds: string[];
    enhancedQuery?: string;
  }> {
    try {
      // Parse and extract packages
      const packages = getPackagesFromCode(code, filename);
      
      logger.debug(`Detected packages: ${packages.join(', ')}`);
      
      // Find documentation for detected packages
      const documentMappings = await this.findDocumentationForPackages(packages);
      
      // Get list of relevant document IDs
      const relevantDocumentIds = this.getRelevantDocumentIds(documentMappings);
      
      // Create enhanced query based on code context
      const enhancedQuery = this.createEnhancedQuery(code, packages);
      
      return {
        packages,
        relevantDocumentIds,
        enhancedQuery
      };
    } catch (error) {
      logger.error('Error analyzing code context:', error);
      return {
        packages: [],
        relevantDocumentIds: []
      };
    }
  }

  /**
   * Find documentation entries for detected packages
   */
  private async findDocumentationForPackages(packages: string[]): Promise<PackageDocumentationMapping[]> {
    if (!packages.length) return [];
    
    try {
      const mappings: PackageDocumentationMapping[] = [];
      
      // For each package, find documents that might be relevant
      for (const packageName of packages) {
        // Search for documentation by package name in metadata
        const docsFromMetadata = await this.prisma.document.findMany({
          where: {
            metadata: {
              path: ['package'],
              string_contains: packageName
            }
          },
          select: {
            id: true,
            metadata: true
          }
        });
        
        // Search for documentation by package name in title
        const docsFromTitle = await this.prisma.document.findMany({
          where: {
            title: {
              contains: packageName,
              mode: 'insensitive'
            },
            // Exclude docs already found in metadata
            id: {
              notIn: docsFromMetadata.map(doc => doc.id)
            }
          },
          select: {
            id: true,
            metadata: true
          }
        });
        
        // Search for documentation by package name in URL
        const docsFromUrl = await this.prisma.document.findMany({
          where: {
            url: {
              contains: packageName,
              mode: 'insensitive'
            },
            // Exclude docs already found
            id: {
              notIn: [...docsFromMetadata.map(doc => doc.id), ...docsFromTitle.map(doc => doc.id)]
            }
          },
          select: {
            id: true,
            metadata: true
          }
        });
        
        // Combine and calculate confidence scores
        const allDocIds = [
          ...docsFromMetadata.map(doc => ({ id: doc.id, confidence: 0.9 })), // Highest confidence
          ...docsFromTitle.map(doc => ({ id: doc.id, confidence: 0.7 })),
          ...docsFromUrl.map(doc => ({ id: doc.id, confidence: 0.5 })) // Lowest confidence
        ];
        
        if (allDocIds.length > 0) {
          mappings.push({
            packageName,
            documentIds: allDocIds.map(doc => doc.id),
            confidenceScore: allDocIds.reduce((avg, doc) => avg + doc.confidence, 0) / allDocIds.length
          });
        }
      }
      
      return mappings;
    } catch (error) {
      logger.error('Error finding documentation for packages:', error);
      return [];
    }
  }

  /**
   * Extract the most relevant document IDs from mappings
   */
  private getRelevantDocumentIds(mappings: PackageDocumentationMapping[]): string[] {
    // Create a map to track highest confidence for each document
    const docConfidenceMap = new Map<string, number>();
    
    // Populate the map with highest confidence scores
    for (const mapping of mappings) {
      for (const docId of mapping.documentIds) {
        if (!docConfidenceMap.has(docId) || docConfidenceMap.get(docId)! < mapping.confidenceScore) {
          docConfidenceMap.set(docId, mapping.confidenceScore);
        }
      }
    }
    
    // Convert to array of [docId, confidence] entries and sort by confidence
    const sortedEntries = Array.from(docConfidenceMap.entries())
      .sort((a, b) => b[1] - a[1]);
    
    // Return top 20 document IDs, or all if fewer than 20
    return sortedEntries
      .slice(0, 20)
      .map(entry => entry[0]);
  }

  /**
   * Create an enhanced query based on code context
   */
  private createEnhancedQuery(code: string, packages: string[]): string | undefined {
    if (!packages.length) return undefined;
    
    // Parse full code to get more detailed info
    const detectedPackages = parseCode(code);
    
    // Extract import statements
    const importStatements = detectedPackages.map(pkg => pkg.importStatement);
    
    // Extract function/class/variable names that might be relevant
    const identifierRegex = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g;
    const identifiers = Array.from(new Set(code.match(identifierRegex) || []));
    
    // Filter out common keywords and short identifiers
    const commonKeywords = new Set([
      'function', 'const', 'let', 'var', 'if', 'else', 'for', 'while', 
      'return', 'class', 'import', 'export', 'default', 'from', 'require',
      'new', 'this', 'true', 'false', 'null', 'undefined'
    ]);
    
    const relevantIdentifiers = identifiers
      .filter(id => !commonKeywords.has(id.toLowerCase()))
      .filter(id => id.length > 2);
    
    // Create enhanced query components
    const components = [
      `Package documentation: ${packages.join(', ')}`,
    ];
    
    // Add relevant identifiers if we have any
    if (relevantIdentifiers.length > 0) {
      // Take up to 5 most likely API names (longer identifiers often are)
      const apiCandidates = relevantIdentifiers
        .sort((a, b) => b.length - a.length)
        .slice(0, 5);
      
      components.push(`API references: ${apiCandidates.join(', ')}`);
    }
    
    return components.join('. ');
  }

  /**
   * Generate documentation suggestions based on code context
   */
  async generateContextualSuggestions(code: string, filename?: string, limit: number = 3): Promise<DocumentSuggestion[]> {
    try {
      // Analyze code context
      const { packages, relevantDocumentIds } = await this.analyzeCodeContext(code, filename);
      
      if (packages.length === 0 || relevantDocumentIds.length === 0) {
        return [];
      }
      
      // Fetch the actual documents
      const documents = await this.prisma.document.findMany({
        where: {
          id: {
            in: relevantDocumentIds
          }
        },
        select: {
          id: true,
          title: true,
          url: true,
          metadata: true
        },
        take: limit * 2 // Fetch more than needed so we can filter
      });
      
      // Calculate confidence scores and match documents to packages
      const suggestions = documents.map(doc => {
        // Determine which package this document is most relevant for
        let bestMatchPackage = '';
        let highestScore = 0;
        
        for (const pkg of packages) {
          let score = 0;
          
          // Check metadata
          const metadata = doc.metadata as DocumentMetadata;
          if (metadata && typeof metadata === 'object' && metadata.package === pkg) {
            score += 0.5;
          }
          
          // Check title
          if (doc.title.toLowerCase().includes(pkg.toLowerCase())) {
            score += 0.3;
          }
          
          // Check URL
          if (doc.url.toLowerCase().includes(pkg.toLowerCase())) {
            score += 0.2;
          }
          
          if (score > highestScore) {
            highestScore = score;
            bestMatchPackage = pkg;
          }
        }
        
        // If no good match, use the first package
        if (bestMatchPackage === '' && packages.length > 0) {
          bestMatchPackage = packages[0];
          highestScore = 0.1;
        }
        
        return {
          package: bestMatchPackage,
          title: doc.title,
          url: doc.url,
          confidence: highestScore
        };
      });
      
      // Sort by confidence and take the top 'limit' results
      return suggestions
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, limit);
      
    } catch (error) {
      logger.error('Error generating contextual suggestions:', error);
      return [];
    }
  }
} 