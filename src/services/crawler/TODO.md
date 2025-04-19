# Crawler Service Refactoring TODO List

## Phase 1: Setup & Interfaces (Priority: High)

- [x] Create basic directory structure according to spec
- [x] Define common types and enums in `interfaces/types.ts`
- [x] Implement `ICrawler` interface
- [x] Implement `IContentExtractor` interface 
- [x] Implement `IPageDetector` interface
- [x] Implement `ILinkExtractor` interface
- [x] Implement `IRateLimiter` interface
- [x] Implement `IJobManager` interface
- [x] Implement `IDocumentProcessor` interface
- [x] Implement `IRobotsTxtService` interface
- [x] Implement `IUrlQueue` interface
- [x] Set up dependency injection container/pattern
- [x] Create base configuration types

## Phase 2: Core Utilities (Priority: High)

- [x] Implement URL utilities
  - [x] URL normalization
  - [x] Domain extraction
  - [x] URL validation
- [x] Implement HTML utilities
  - [x] Common parsing helpers
  - [x] Content extraction helpers
- [x] Implement delay utilities
  - [x] Configurable delays
  - [x] Exponential backoff
- [x] Implement logging utilities
  - [x] Crawler-specific logging format
  - [x] Log level configuration

## Phase 3: Basic Implementations (Priority: High)

- [x] Implement `InMemoryUrlQueue`
- [x] Implement `DefaultLinkExtractor`
- [x] Implement `RobotsTxtService`
- [x] Implement `PrismaJobManager`
- [x] Implement `DocumentProcessor`
- [x] Implement `TokenBucketRateLimiter`
- [x] Create basic `BaseCrawler` abstract class

## Phase 4: SPA Detection & Content Extraction (Priority: Medium)

- [ ] Add Puppeteer as dependency (with lazy loading)
- [ ] Implement `CheerioExtractor`
  - [ ] HTML parsing
  - [ ] Content extraction
  - [ ] Metadata extraction
- [ ] Implement `PuppeteerExtractor`
  - [ ] Browser initialization
  - [ ] Page rendering
  - [ ] Content extraction after JS execution
  - [ ] Resource cleanup
- [ ] Implement `SPADetector`
  - [ ] Static signature detection
  - [ ] Dynamic behavior analysis
  - [ ] Caching mechanism
  - [ ] Score-based detection algorithm

## Phase 5: Crawler Strategy & Factory (Priority: Medium)

- [ ] Implement `CrawlingStrategyFactory`
  - [ ] Strategy selection logic
  - [ ] Configuration options
- [ ] Implement `ServiceFactory`
  - [ ] Dependency injection
  - [ ] Service instantiation
- [ ] Implement `StandardCrawler`
  - [ ] Main crawling loop
  - [ ] Error handling
  - [ ] Progress tracking
  - [ ] Dynamic strategy selection

## Phase 6: Testing (Priority: High)

- [ ] Write unit tests for all interfaces and implementations
  - [ ] URL queue tests
  - [ ] Link extractor tests
  - [ ] RobotsTxt service tests
  - [ ] Job manager tests
  - [ ] Rate limiter tests
- [ ] Write integration tests
  - [ ] Full crawl cycle tests
  - [ ] Error handling tests
  - [ ] SPA detection tests
- [ ] Set up mock servers for testing
  - [ ] Static pages mock
  - [ ] SPA mock
  - [ ] Error condition mocks

## Phase 7: Performance Optimization (Priority: Medium)

- [ ] Implement domain-level caching
- [ ] Add metrics collection
  - [ ] Crawl speed
  - [ ] Memory usage
  - [ ] Detection accuracy
- [ ] Optimize Puppeteer resource usage
  - [ ] Browser reuse
  - [ ] Connection pooling
- [ ] Implement batch processing of URLs
- [ ] Add configurable concurrency limits

## Phase 8: Documentation & Examples (Priority: Low)

- [ ] Create API documentation
- [ ] Add JSDoc comments to all public methods
- [ ] Create usage examples
  - [ ] Basic crawling example
  - [ ] SPA crawling example
  - [ ] Custom extraction example
- [ ] Document configuration options
- [ ] Create troubleshooting guide

## Phase 9: Integration & Migration (Priority: High)

- [ ] Create adapter for legacy code compatibility
- [ ] Implement gradual migration strategy
- [ ] Update import paths in existing code
- [ ] Create tests ensuring backward compatibility
- [ ] Update MCP tools to use new crawler architecture
