import { DocumentationMapperService } from '../../services/documentation-mapper.service';
import { PrismaClient } from '../../generated/prisma';
import { mockDeep, mockReset, DeepMockProxy } from 'jest-mock-extended';

// Mock the logger
jest.mock('../../utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// Mock the Prisma client
jest.mock('../../config/database', () => ({
  getPrismaClient: jest.fn(() => mockPrisma),
}));

// Create a mock PrismaClient
const mockPrisma = mockDeep<PrismaClient>();

describe('DocumentationMapperService', () => {
  let service: DocumentationMapperService;
  let prisma: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    mockReset(mockPrisma);
    prisma = mockPrisma;
    service = new DocumentationMapperService(prisma);
  });

  describe('findOrCreatePackage', () => {
    it('should return existing package if found', async () => {
      const mockPackage = {
        id: 'pkg-1',
        name: 'react',
        language: 'javascript',
        popularity: 1,
        description: null,
        repository: null,
        homepage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prisma.package.findUnique.mockResolvedValue(mockPackage);

      const result = await service.findOrCreatePackage('react', 'javascript');
      
      expect(prisma.package.findUnique).toHaveBeenCalledWith({
        where: { name: 'react' }
      });
      expect(prisma.package.create).not.toHaveBeenCalled();
      expect(result).toEqual(mockPackage);
    });

    it('should create package if not found', async () => {
      const mockPackage = {
        id: 'pkg-1',
        name: 'react',
        language: 'javascript',
        popularity: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        description: null,
        repository: null,
        homepage: null,
      };

      prisma.package.findUnique.mockResolvedValue(null);
      prisma.package.create.mockResolvedValue(mockPackage);

      const result = await service.findOrCreatePackage('react', 'javascript');
      
      expect(prisma.package.findUnique).toHaveBeenCalledWith({
        where: { name: 'react' }
      });
      expect(prisma.package.create).toHaveBeenCalledWith({
        data: {
          name: 'react',
          language: 'javascript',
          popularity: 0
        }
      });
      expect(result).toEqual(mockPackage);
    });
  });

  describe('findOrCreatePackageVersion', () => {
    it('should return existing version if found', async () => {
      const mockVersion = {
        id: 'ver-1',
        packageId: 'pkg-1',
        version: '1.0.0',
        isLatest: false,
        releaseDate: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prisma.packageVersion.findUnique.mockResolvedValue(mockVersion);

      const result = await service.findOrCreatePackageVersion('pkg-1', '1.0.0', false);
      
      expect(prisma.packageVersion.findUnique).toHaveBeenCalledWith({
        where: {
          packageId_version: {
            packageId: 'pkg-1',
            version: '1.0.0'
          }
        }
      });
      expect(prisma.packageVersion.create).not.toHaveBeenCalled();
      expect(result).toEqual(mockVersion);
    });

    it('should update isLatest flag if specified and different', async () => {
      const mockVersion = {
        id: 'ver-1',
        packageId: 'pkg-1',
        version: '1.0.0',
        isLatest: false,
        releaseDate: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prisma.packageVersion.findUnique.mockResolvedValue(mockVersion);
      prisma.$transaction.mockResolvedValue([]);
      
      // Mock the update result
      prisma.packageVersion.update.mockResolvedValue({
        ...mockVersion,
        isLatest: true
      });

      const result = await service.findOrCreatePackageVersion('pkg-1', '1.0.0', true);
      
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result).toEqual({
        ...mockVersion,
        isLatest: true
      });
    });

    it('should create a new version if not found', async () => {
      const mockVersion = {
        id: 'ver-1',
        packageId: 'pkg-1',
        version: '1.0.0',
        isLatest: true,
        releaseDate: expect.any(Date),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prisma.packageVersion.findUnique.mockResolvedValue(null);
      prisma.packageVersion.create.mockResolvedValue(mockVersion);

      const result = await service.findOrCreatePackageVersion('pkg-1', '1.0.0', true);
      
      expect(prisma.packageVersion.updateMany).toHaveBeenCalledWith({
        where: { packageId: 'pkg-1' },
        data: { isLatest: false }
      });
      
      expect(prisma.packageVersion.create).toHaveBeenCalledWith({
        data: {
          packageId: 'pkg-1',
          version: '1.0.0',
          isLatest: true,
          releaseDate: expect.any(Date)
        }
      });
      
      expect(result).toEqual(mockVersion);
    });
  });

  describe('findDocumentation', () => {
    it('should return cached results if available', async () => {
      const cacheKey = 'doc:react';
      const cachedResults = [
        {
          documentId: 'doc-1',
          title: 'React Docs',
          url: 'https://react.dev',
          packageName: 'react',
          score: 0.95,
          isApiDoc: true,
          isGuide: false,
          isHomepage: true,
          sourceName: 'React Documentation',
          isOfficialSource: true,
        }
      ];

      // Mock the getFromCache method
      jest.spyOn(service as any, 'getFromCache').mockResolvedValue(cachedResults);
      
      const result = await service.findDocumentation('react');
      
      expect(service['getFromCache']).toHaveBeenCalledWith(cacheKey);
      expect(result).toEqual(cachedResults);
    });

    it('should query the database if no cache hit', async () => {
      const mockPackage = {
        id: 'pkg-1',
        name: 'react',
        language: 'javascript',
        popularity: 1,
        description: null,
        repository: null,
        homepage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      const mockMappings = [
        {
          id: 'map-1',
          packageId: 'pkg-1',
          documentId: 'doc-1',
          versionId: 'ver-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          sourceUrl: null,
          sourceReliability: 0.8,
          document: {
            id: 'doc-1',
            title: 'React Docs',
            url: 'https://react.dev',
          },
          version: {
            version: '18.0.0'
          },
          relevanceScore: 0.95,
          isApiDoc: true,
          isGuide: false,
          isHomepage: true,
          sourceName: 'React Documentation',
          sourceIsOfficial: true,
        }
      ];

      // Mock the getFromCache method to return null (cache miss)
      jest.spyOn(service as any, 'getFromCache').mockResolvedValue(null);
      
      // Mock required Prisma calls
      prisma.package.findUnique.mockResolvedValue(mockPackage);
      prisma.packageDocumentationMapping.findMany.mockResolvedValue(mockMappings);
      
      // Mock the saveToCache method
      jest.spyOn(service as any, 'saveToCache').mockResolvedValue(undefined);

      const result = await service.findDocumentation('react');
      
      expect(service['getFromCache']).toHaveBeenCalled();
      expect(prisma.package.findUnique).toHaveBeenCalledWith({
        where: { name: 'react' }
      });
      
      expect(prisma.packageDocumentationMapping.findMany).toHaveBeenCalled();
      expect(service['saveToCache']).toHaveBeenCalled();
      
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        documentId: 'doc-1',
        title: 'React Docs',
        url: 'https://react.dev',
        packageName: 'react',
        version: '18.0.0',
        score: 0.95,
        isApiDoc: true,
        isGuide: false,
        isHomepage: true,
        sourceName: 'React Documentation',
        isOfficialSource: true,
      });
    });

    it('should try fallback documentation when no direct matches found', async () => {
      const mockPackage = {
        id: 'pkg-1',
        name: 'unknown-package',
        language: 'javascript',
        popularity: 0,
        description: null,
        repository: null,
        homepage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      const fallbackResults = [
        {
          documentId: 'doc-2',
          title: 'JavaScript Docs',
          url: 'https://javascript.info',
          packageName: 'javascript',
          score: 0.7,
          isApiDoc: false,
          isGuide: true,
          isHomepage: false,
          sourceName: 'JavaScript.info (javascript ecosystem)',
          isOfficialSource: false,
        }
      ];

      // Mock cache miss
      jest.spyOn(service as any, 'getFromCache').mockResolvedValue(null);
      
      // Mock findFallbackDocumentation
      jest.spyOn(service, 'findFallbackDocumentation').mockResolvedValue(fallbackResults);
      
      // Return empty mappings for the direct query
      prisma.package.findUnique.mockResolvedValue(mockPackage);
      prisma.packageDocumentationMapping.findMany.mockResolvedValue([]);
      
      // Mock the saveToCache method
      jest.spyOn(service as any, 'saveToCache').mockResolvedValue(undefined);

      const result = await service.findDocumentation('unknown-package');
      
      expect(service.findFallbackDocumentation).toHaveBeenCalledWith('unknown-package', 'javascript', undefined);
      expect(service['saveToCache']).toHaveBeenCalled();
      expect(result).toEqual(fallbackResults);
    });
  });

  describe('findFallbackDocumentation', () => {
    it('should return similar package documentation as fallback', async () => {
      const similarPackages = [
        {
          id: 'pkg-2',
          name: 'react-dom',
          language: 'javascript',
          description: null,
          repository: null,
          homepage: null,
          popularity: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          docMappings: [
            {
              document: {
                id: 'doc-2',
                title: 'React DOM API',
                url: 'https://react.dev/reference/react-dom',
              },
              version: { version: '18.0.0' },
              isApiDoc: true,
              isGuide: false,
              isHomepage: false,
              sourceName: 'React Documentation',
              sourceIsOfficial: true,
              relevanceScore: 0.9,
            }
          ]
        }
      ];

      prisma.package.findMany.mockResolvedValue(similarPackages);
      
      // No language guides needed for this test
      prisma.packageDocumentationMapping.findMany.mockResolvedValue([]);

      const result = await service.findFallbackDocumentation('react-native', 'javascript');
      
      expect(prisma.package.findMany).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        documentId: 'doc-2',
        title: 'React DOM API',
        packageName: 'react-dom',
        sourceName: expect.stringContaining('similar to react-native'),
        score: expect.any(Number),
      });
    });

    it('should return language guides if no similar packages found', async () => {
      // No similar packages
      prisma.package.findMany.mockResolvedValue([]);
      
      // Mock language guides
      const languageGuides = [
        {
          id: 'map-3',
          documentId: 'doc-3',
          packageId: 'pkg-3',
          versionId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          sourceReliability: 0.8,
          sourceUrl: null,
          document: {
            id: 'doc-3',
            title: 'JavaScript Fundamentals',
            url: 'https://javascript.info',
          },
          package: { name: 'javascript-guide' },
          version: null,
          isApiDoc: false,
          isGuide: true,
          isHomepage: false,
          sourceName: 'JavaScript.info',
          sourceIsOfficial: false,
          relevanceScore: 0.85,
        }
      ];
      
      prisma.packageDocumentationMapping.findMany.mockResolvedValue(languageGuides);

      const result = await service.findFallbackDocumentation('unknown-package', 'javascript');
      
      expect(prisma.packageDocumentationMapping.findMany).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        documentId: 'doc-3',
        title: 'JavaScript Fundamentals',
        packageName: 'javascript-guide',
        sourceName: expect.stringContaining('javascript ecosystem'),
        score: expect.any(Number),
      });
    });
  });

  describe('seedPackageDocumentation', () => {
    it('should create seed documentation for packages', async () => {
      // No packages exist yet
      prisma.package.findUnique.mockResolvedValue(null);
      
      // Mock document creation
      const mockDocument = {
        id: 'doc-seed-1',
        url: 'https://react.dev/reference/react',
        title: 'React API Reference',
        content: 'Seed documentation for react',
        metadata: expect.any(Object),
        crawlDate: expect.any(Date),
        level: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        parentDocumentId: null,
        jobId: null
      };
      
      prisma.document.create.mockResolvedValue(mockDocument);
      
      // Mock mapping creation
      const mockMapping = {
        id: 'map-seed-1',
        packageId: 'pkg-seed-1',
        documentId: 'doc-seed-1',
        isApiDoc: true,
        relevanceScore: 0.95,
      };
      
      // Spy on findOrCreatePackage and mapDocumentToPackage
      jest.spyOn(service, 'findOrCreatePackage').mockResolvedValue({
        id: 'pkg-seed-1',
        name: 'react',
        language: 'javascript',
        popularity: 0,
      } as any);
      
      jest.spyOn(service, 'mapDocumentToPackage').mockResolvedValue(mockMapping as any);

      const result = await service.seedPackageDocumentation();
      
      // Each seed package has at least one doc
      expect(result).toBeGreaterThan(0);
      expect(service.findOrCreatePackage).toHaveBeenCalled();
      expect(service.mapDocumentToPackage).toHaveBeenCalled();
      expect(prisma.document.create).toHaveBeenCalled();
    });

    it('should skip packages that already have mappings', async () => {
      // Mock package with existing mappings
      const existingPackage = {
        id: 'pkg-1',
        name: 'react',
        language: 'javascript',
        description: null,
        repository: null,
        homepage: null,
        popularity: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        docMappings: [{ id: 'existing-mapping' }],
      };
      
      prisma.package.findUnique.mockResolvedValue(existingPackage);

      await service.seedPackageDocumentation();
      
      // Should not create documents for packages with mappings
      expect(prisma.document.create).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'React API Reference'
          })
        })
      );
    });
  });

  describe('initializeWithSeedData', () => {
    it('should seed data if no mappings exist', async () => {
      // No mappings exist
      prisma.packageDocumentationMapping.count.mockResolvedValue(0);
      
      // Mock seedPackageDocumentation to return a count
      jest.spyOn(service, 'seedPackageDocumentation').mockResolvedValue(5);

      const result = await service.initializeWithSeedData();
      
      expect(prisma.packageDocumentationMapping.count).toHaveBeenCalled();
      expect(service.seedPackageDocumentation).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should skip seeding if mappings already exist', async () => {
      // Mappings already exist
      prisma.packageDocumentationMapping.count.mockResolvedValue(10);
      
      // Mock seedPackageDocumentation
      jest.spyOn(service, 'seedPackageDocumentation').mockResolvedValue(0);

      const result = await service.initializeWithSeedData();
      
      expect(prisma.packageDocumentationMapping.count).toHaveBeenCalled();
      expect(service.seedPackageDocumentation).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });
  });

  describe('cache management', () => {
    it('should clear cache for a specific package', async () => {
      await service.clearCache('react');
      
      expect(prisma.documentationCache.deleteMany).toHaveBeenCalledWith({
        where: {
          key: {
            startsWith: 'doc:react'
          }
        }
      });
    });

    it('should clear all caches when no package specified', async () => {
      await service.clearCache();
      
      expect(prisma.documentationCache.deleteMany).toHaveBeenCalledWith({});
    });

    it('should clean expired cache entries', async () => {
      prisma.documentationCache.deleteMany.mockResolvedValue({ count: 5 });
      
      const result = await service.cleanExpiredCache();
      
      expect(prisma.documentationCache.deleteMany).toHaveBeenCalledWith({
        where: {
          expiresAt: {
            lt: expect.any(Date)
          }
        }
      });
      
      expect(result).toBe(5);
    });
  });
}); 