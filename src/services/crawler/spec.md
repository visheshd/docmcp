# Crawler Service Refactoring Specification

## Overview

This specification outlines a comprehensive refactoring of the `CrawlerService` to:
1. Detect and handle SPAs (Single Page Applications) vs static pages appropriately
2. Apply SOLID principles to improve architecture
3. Improve organization, maintainability, and extensibility

## Current Issues

The current `CrawlerService` implementation has several limitations:

1. **Single Responsibility Principle (SRP) violations**:
   - Handles too many responsibilities: crawling, content extraction, robots.txt handling, job management, document creation
   - Methods like `crawlPage`, `updateJobProgress`, and `loadRobotsTxt` should be in separate classes

2. **Open/Closed Principle issues**:
   - Not easily extendable for different crawling strategies (SPA vs regular pages)
   - Hard-coded content extraction logic isn't flexible for different site structures

3. **Lacks proper abstractions**:
   - Direct dependency on PrismaClient and DocumentService
   - No interfaces for HTTP requests or HTML parsing
   - No separation between static and dynamic page handling

## Architecture Design

### Directory Structure

```
/src/services/crawler/
├── index.ts                      # Main export file
├── interfaces/                   # Core interfaces
│   ├── ICrawler.ts               # Base crawler interface
│   ├── IContentExtractor.ts      # Content extraction interface
│   ├── IPageDetector.ts          # Page type detection interface
│   ├── ILinkExtractor.ts         # Link extraction interface
│   ├── IRateLimiter.ts           # Rate limiting interface
│   ├── IJobManager.ts            # Job management interface
│   ├── IDocumentProcessor.ts     # Document processing interface
│   ├── IRobotsTxtService.ts      # Robots.txt interface
│   ├── IUrlQueue.ts              # URL queue interface
│   └── types.ts                  # Common types and enums
├── implementations/              # Interface implementations
│   ├── BaseCrawler.ts            # Abstract base crawler implementation
│   ├── StandardCrawler.ts        # Main crawler implementation
│   ├── CheerioExtractor.ts       # Cheerio-based content extractor
│   ├── PuppeteerExtractor.ts     # Puppeteer-based content extractor
│   ├── SPADetector.ts            # SPA detection implementation
│   ├── DefaultLinkExtractor.ts   # Link extraction implementation
│   ├── PrismaJobManager.ts       # Job management with Prisma
│   ├── DocumentProcessor.ts      # Document processing implementation
│   ├── RobotsTxtService.ts       # Robots.txt handling
│   ├── InMemoryUrlQueue.ts       # URL queue implementation
│   └── TokenBucketRateLimiter.ts # Rate limiting implementation
├── factories/                    # Factory classes
│   ├── CrawlingStrategyFactory.ts # Factory for selecting extraction strategy
│   └── ServiceFactory.ts         # Factory for creating service instances
└── utils/                        # Helper utilities
    ├── UrlUtils.ts               # URL handling utilities
    ├── HtmlUtils.ts              # HTML parsing utilities
    ├── DelayUtils.ts             # Timing and delay utilities
    └── LoggingUtils.ts           # Crawler-specific logging
```

### Core Interfaces

#### `ICrawler`
```typescript
export interface ICrawler {
  crawl(jobId: string, startUrl: string, options: CrawlOptions): Promise<void>;
  initialize(): Promise<void>;
  stop(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  getProgress(): Promise<CrawlProgress>;
}
```

#### `IContentExtractor`
```typescript
export interface IContentExtractor {
  extract(url: string, options: ExtractionOptions): Promise<ExtractedContent>;
  supportsPageType(pageType: PageType): boolean;
  cleanup(): Promise<void>;
}
```

#### `IPageDetector`
```typescript
export interface IPageDetector {
  detectPageType(url: string, htmlContent?: string): Promise<PageTypeResult>;
  isSPA(url: string, htmlContent?: string): Promise<boolean>;
}
```

#### `ILinkExtractor`
```typescript
export interface ILinkExtractor {
  extractLinks(htmlContent: string, baseUrl: string, currentUrl: string): Promise<string[]>;
  extractPaginationLinks(htmlContent: string, baseUrl: string, currentUrl: string): Promise<string[]>;
}
```

#### `IRateLimiter`
```typescript
export interface IRateLimiter {
  acquireToken(domain: string): Promise<void>;
  releaseToken(domain: string): void;
  setRateLimit(domain: string, rateLimit: number): void;
  getRateLimit(domain: string): number;
}
```

#### `IJobManager`
```typescript
export interface IJobManager {
  createJob(data: JobCreateData): Promise<Job>;
  updateProgress(jobId: string, progress: number, stats: JobStats): Promise<void>;
  markJobCompleted(jobId: string, stats: JobStats): Promise<void>;
  markJobFailed(jobId: string, error: string, stats: JobStats): Promise<void>;
  shouldContinue(jobId: string): Promise<boolean>;
}
```

#### `IDocumentProcessor`
```typescript
export interface IDocumentProcessor {
  createDocument(data: DocumentCreateData): Promise<Document>;
  findRecentDocument(url: string, age: number): Promise<Document | null>;
  copyDocument(existingDocument: Document, jobId: string, level: number): Promise<Document>;
}
```

#### `IRobotsTxtService`
```typescript
export interface IRobotsTxtService {
  loadRobotsTxt(baseUrl: string, userAgent: string): Promise<void>;
  isAllowed(url: string): boolean;
  getCrawlDelay(): number | null;
}
```

#### `IUrlQueue`
```typescript
export interface IUrlQueue {
  add(url: string, depth: number): void;
  addBulk(urls: Array<{url: string, depth: number}>): void;
  getNext(): {url: string, depth: number} | null;
  has(url: string): boolean;
  size(): number;
  markVisited(url: string): void;
  isVisited(url: string): boolean;
  visitedCount(): number;
}
```

## SPA Detection Strategy

The system will use a hybrid approach to detect SPAs vs static pages:

### Static Analysis
First, the system will analyze the static HTML for:
- JavaScript framework signatures (React, Angular, Vue)
- Minimal HTML with heavy JavaScript loading
- SPA-specific DOM structures (like `#app` or `#root` divs)
- Client-side routing code (history API or hash-based routing)

### Dynamic Analysis
If the static analysis is inconclusive, the system will use Puppeteer to:
- Monitor DOM changes after initial load
- Track XHR/fetch API calls
- Observe behavior after user interactions
- Check for dynamic content loading

### Implementation Details

The `SPADetector` will use a scoring approach:
```typescript
export class SPADetector implements IPageDetector {
  // Framework signature patterns
  private readonly signaturePatterns = [
    { pattern: /react|reactjs/i, framework: 'React' },
    { pattern: /angular|ng-/i, framework: 'Angular' },
    { pattern: /vue|vuejs/i, framework: 'Vue' },
    { pattern: /ember|emberjs/i, framework: 'Ember' },
    { pattern: /backbone/i, framework: 'Backbone' }
  ];
  
  // Cache detection results by domain
  private domainTypeCache = new Map<string, PageTypeResult>();
  
  async detectPageType(url: string, htmlContent?: string): Promise<PageTypeResult> {
    // Check cache first
    const domain = new URL(url).hostname;
    if (this.domainTypeCache.has(domain)) {
      return this.domainTypeCache.get(domain)!;
    }
    
    // Static analysis (score from 0-1)
    let staticScore = await this.analyzeStaticContent(url, htmlContent);
    
    // Dynamic analysis if needed (when static analysis is inconclusive)
    if (staticScore > 0.3 && staticScore < 0.7) {
      const dynamicScore = await this.analyzeDynamicBehavior(url);
      staticScore = (staticScore * 0.4) + (dynamicScore * 0.6);
    }
    
    // Determine result
    const isSPA = staticScore >= 0.6;
    const result = {
      isSPA,
      confidence: staticScore,
      pageType: isSPA ? PageType.SPA : PageType.STATIC,
      detectionMethod: staticScore > 0.7 ? 'static' : 'hybrid'
    };
    
    // Cache and return
    this.domainTypeCache.set(domain, result);
    return result;
  }
}
```

## Content Extraction Strategy

Based on the page type detection, the system will select the appropriate content extraction strategy:

### CheerioExtractor (for static pages)
- Fast, lightweight HTML parsing
- Lower resource usage
- Suitable for static content sites

### PuppeteerExtractor (for SPAs)
- Full browser rendering
- JavaScript execution
- Waits for dynamic content to load
- Handles client-side routing

### Strategy Selection
The `CrawlingStrategyFactory` will handle strategy selection:
```typescript
export class CrawlingStrategyFactory {
  constructor(
    private readonly pageDetector: IPageDetector,
    private readonly cheerioExtractor: IContentExtractor,
    private readonly puppeteerExtractor: IContentExtractor,
    private readonly options: StrategyFactoryOptions
  ) {}

  async getExtractorForUrl(url: string, htmlContent?: string): Promise<IContentExtractor> {
    // Check if strategy is forced in options
    if (this.options.forceStrategy === 'cheerio') {
      return this.cheerioExtractor;
    } else if (this.options.forceStrategy === 'puppeteer') {
      return this.puppeteerExtractor;
    }
    
    // Detect page type and select appropriate extractor
    const pageTypeResult = await this.pageDetector.detectPageType(url, htmlContent);
    return pageTypeResult.isSPA ? this.puppeteerExtractor : this.cheerioExtractor;
  }
}
```

## Main Crawler Implementation

The `StandardCrawler` will coordinate all components:

```typescript
export class StandardCrawler implements ICrawler {
  constructor(
    private readonly pageDetector: IPageDetector,
    private readonly strategyFactory: CrawlingStrategyFactory,
    private readonly linkExtractor: ILinkExtractor,
    private readonly urlQueue: IUrlQueue,
    private readonly jobManager: IJobManager,
    private readonly documentProcessor: IDocumentProcessor,
    private readonly robotsTxtService: IRobotsTxtService,
    private readonly rateLimiter: IRateLimiter,
    private readonly options: CrawlOptions
  ) {}

  async crawl(jobId: string, startUrl: string, options: CrawlOptions): Promise<void> {
    // Initialize and configure
    await this.initialize();
    this.urlQueue.add(startUrl, 0);
    const crawlOptions = { ...this.options, ...options };
    
    try {
      // Main crawling loop
      while (this.urlQueue.size() > 0) {
        // Check job status (cancelled, paused)
        if (!(await this.jobManager.shouldContinue(jobId))) {
          break;
        }
        
        const { url, depth } = this.urlQueue.getNext()!;
        
        // Skip if already visited or too deep
        if (this.urlQueue.isVisited(url) || depth > crawlOptions.maxDepth) {
          continue;
        }
        
        // Process URL
        try {
          // Select appropriate extractor based on page type
          const extractor = await this.strategyFactory.getExtractorForUrl(url);
          
          // Extract content
          const content = await extractor.extract(url, {
            userAgent: crawlOptions.userAgent,
            timeout: crawlOptions.timeout
          });
          
          // Mark URL as visited
          this.urlQueue.markVisited(url);
          
          // Process document
          await this.documentProcessor.createDocument({
            url: content.url,
            title: content.title,
            content: content.content,
            metadata: content.metadata,
            crawlDate: new Date(),
            level: depth,
            jobId
          });
          
          // Extract and queue new links
          const links = await this.linkExtractor.extractLinks(
            content.content,
            crawlOptions.baseUrl,
            url
          );
          
          for (const link of links) {
            if (!this.urlQueue.isVisited(link)) {
              this.urlQueue.add(link, depth + 1);
            }
          }
          
          // Update job progress
          await this.updateJobProgress(jobId);
          
        } catch (error) {
          // Handle errors for this URL
          this.urlQueue.markVisited(url);
          // Update job with error but continue crawling
        }
      }
      
      // Complete job
      await this.markJobCompleted(jobId);
      
    } catch (error) {
      // Handle unexpected errors
      await this.markJobFailed(jobId, error);
    }
  }
}
```

## Performance Considerations

1. **Resource Management**
   - Puppeteer is only used when needed (for SPAs)
   - Caching detection results at the domain level
   - Cheerio used by default for static pages (lower resource usage)

2. **Optimization Strategies**
   - Reusing existing document data when available
   - Domain-level rate limiting to avoid overloading servers
   - Configurable crawl depth and timeouts

3. **Error Handling**
   - Graceful handling of network failures
   - Appropriate retries with exponential backoff
   - Detailed error reporting

## Implementation Plan

1. Create interfaces and types
2. Implement core utilities
3. Build concrete implementations for each interface
4. Create factory classes
5. Implement main crawler
6. Write tests for each component
7. Integration testing
8. Performance testing and optimization

## Configuration Options

The system will support the following configuration options:

```typescript
export interface CrawlOptions {
  maxDepth: number;            // Maximum crawl depth
  baseUrl: string;             // Base URL for same-domain checking
  rateLimit?: number;          // Milliseconds between requests
  respectRobotsTxt?: boolean;  // Whether to respect robots.txt
  userAgent?: string;          // User agent for requests
  timeout?: number;            // Request timeout
  forceStrategy?: 'cheerio' | 'puppeteer'; // Force a specific strategy
  maxRedirects?: number;       // Maximum redirects to follow
  reuseCachedContent?: boolean; // Whether to reuse recently crawled content
  cacheExpiry?: number;        // Age limit for reusing content (in days)
}
```

## Benefits of the New Architecture

1. **SOLID Principles Compliance**
   - Single Responsibility: Each class has one purpose
   - Open/Closed: Easy to extend without modifying existing code
   - Liskov Substitution: Implementations are interchangeable
   - Interface Segregation: Clean, focused interfaces
   - Dependency Inversion: High-level modules depend on abstractions

2. **Better Testing**
   - Components can be tested in isolation
   - Interfaces allow for easy mocking
   - Reduced test complexity

3. **Improved Maintainability**
   - Smaller, focused classes
   - Clear separation of concerns
   - Well-defined interfaces

4. **Enhanced Flexibility**
   - Support for both static sites and SPAs
   - Easy to add new extraction strategies
   - Configurable behavior
