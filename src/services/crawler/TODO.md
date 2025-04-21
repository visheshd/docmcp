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

- [x] Add Puppeteer as dependency (with lazy loading)
- [x] Implement `CheerioExtractor`
  - [x] HTML parsing
  - [x] Content extraction
  - [x] Metadata extraction
- [x] Implement `PuppeteerExtractor`
  - [x] Browser initialization
  - [x] Page rendering
  - [x] Content extraction after JS execution
  - [x] Resource cleanup
- [x] Implement `SPADetector`
  - [x] Static signature detection
  - [x] Dynamic behavior analysis
  - [x] Caching mechanism
  - [x] Score-based detection algorithm

## Phase 5: Crawler Strategy & Factory (Priority: Medium)

- [x] Implement `CrawlingStrategyFactory`
  - [x] Strategy selection logic
  - [x] Configuration options
- [x] Implement `ServiceFactory`
  - [x] Dependency injection
  - [x] Service instantiation
- [x] Implement `StandardCrawler`
  - [x] Main crawling loop
  - [x] Error handling
  - [x] Progress tracking
  - [x] Dynamic strategy selection

## Phase 6: Testing (Priority: High)

- [x] Write unit tests for all interfaces and implementations
  - [x] URL queue tests (InMemoryUrlQueue.test.ts)
  - [x] Link extractor tests (DefaultLinkExtractor.test.ts)
  - [x] RobotsTxt service tests (RobotsTxtService.test.ts)
  - [x] Job manager tests (PrismaJobManager.test.ts)
  - [x] Rate limiter tests (TokenBucketRateLimiter.test.ts)
  - [x] Content extractor tests
    - [x] CheerioExtractor (CheerioExtractor.test.ts)
    - [ ] PuppeteerExtractor
  - [x] Document processor tests (DocumentProcessor.test.ts)
  - [x] SPA detection tests
  - [x] Crawling strategy factory tests
- [x] Write integration tests
  - [x] Full crawl cycle tests
  - [x] Error handling tests
  - [x] Respect robots.txt tests
  - [x] Pagination handling tests
- [x] Set up mock servers for testing
  - [x] Static pages mock (using nock)
  - [ ] Implement `ErrorConditionMocks` Utility
    - [ ] Create `src/services/crawler/test-utils/mocks/ErrorConditionMocks.ts`.
    - [ ] Implement logic using `nock` to simulate various errors.
    - [ ] Include `setup()` and `cleanup()` methods.
    - [ ] Update `MockExamples.ts` to accurately reflect usage.
  - [ ] Integrate `SPAMock` into Tests
    - [ ] Refactor `src/__tests__/services/crawler.service.test.ts` to use `SPAMock`.
    - [ ] Ensure non-SPA tests use appropriate mocking.
  - [ ] Integrate `ErrorConditionMocks` into Tests
    - [ ] Refactor error handling tests in `crawler.service.test.ts`.
    - [ ] Add new integration tests for specific error types.
  - [ ] Implement `PuppeteerExtractor` Tests
    - [ ] Create `src/services/crawler/implementations/__tests__/PuppeteerExtractor.test.ts`.
    - [ ] Use `SPAMock` for realistic test environments.
    - [ ] Test JS execution, dynamic content, and cleanup.
  - [ ] Update `MockExamples.ts`
    - [ ] Ensure examples are functional and demonstrate final mock implementations.

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
