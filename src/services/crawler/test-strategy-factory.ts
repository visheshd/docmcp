#!/usr/bin/env ts-node

/**
 * Test script for the CrawlingStrategyFactory
 * This script tests the factory's ability to select the appropriate extractor
 * based on the detected page type (SPA vs static page).
 * 
 * Usage:
 * npx ts-node src/services/crawler/test-strategy-factory.ts [url]
 */

import { CrawlingStrategyFactory } from './factories/CrawlingStrategyFactory';
import { CheerioExtractor } from './implementations/CheerioExtractor';
import { PuppeteerExtractor } from './implementations/PuppeteerExtractor';
import { SPADetector } from './implementations/SPADetector';
import { IContentExtractor } from './interfaces/IContentExtractor';
import { LoggingUtils, LogLevel } from './utils/LoggingUtils';

// Enable logging
LoggingUtils.setLogLevel(LogLevel.DEBUG);
LoggingUtils.enableTag('strategy-factory');
LoggingUtils.enableTag('spa-detector');

// Add console wrapper for direct output
const log = {
  info: (msg: string) => console.log(`[INFO] ${msg}`),
  debug: (msg: string) => console.log(`[DEBUG] ${msg}`),
  error: (msg: string) => console.error(`[ERROR] ${msg}`)
};

/**
 * Test factory selection for a URL
 */
async function testFactory(factory: CrawlingStrategyFactory, url: string): Promise<void> {
  log.info(`\nTesting URL: ${url}`);
  try {
    const startTime = Date.now();
    
    // Get extractor for URL
    const extractor = await factory.getExtractorForUrl(url);
    const extractorName = getExtractorName(extractor);
    
    const elapsedTime = Date.now() - startTime;
    log.info(`Selected extractor: ${extractorName}`);
    log.info(`Time taken: ${elapsedTime}ms`);
    
  } catch (error) {
    log.error(`Failed to select extractor for ${url}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Get a readable name for an extractor
 */
function getExtractorName(extractor: IContentExtractor): string {
  if (extractor instanceof CheerioExtractor) {
    return 'CheerioExtractor (for static pages)';
  } else if (extractor instanceof PuppeteerExtractor) {
    return 'PuppeteerExtractor (for SPAs)';
  } else {
    return 'Unknown extractor';
  }
}

/**
 * Main test function
 */
async function main() {
  log.info('Initializing components...');
  
  // Create extractors
  const cheerioExtractor = new CheerioExtractor();
  const puppeteerExtractor = new PuppeteerExtractor();
  
  // Create SPA detector
  const spaDetector = new SPADetector({
    cacheResults: true,
    enableDynamicAnalysis: false
  });
  
  // Create factory
  const factory = new CrawlingStrategyFactory(
    spaDetector,
    cheerioExtractor,
    puppeteerExtractor,
    { forceStrategy: undefined } // No forced strategy
  );
  
  // Get URL from command line or use default test set
  const customUrl = process.argv[2];
  
  if (customUrl) {
    // Test factory with single URL
    await testFactory(factory, customUrl);
  } else {
    // Test a set of known URLs
    log.info('Running tests on predefined set of URLs...');
    
    // Known SPAs
    const spaUrls = [
      'https://reactjs.org',
      'https://vuejs.org',
      'https://angular.io',
      'https://nextjs.org'
    ];
    
    // Known static sites
    const staticUrls = [
      'https://example.com',
      'https://developer.mozilla.org',
      'https://www.gnu.org'
    ];
    
    // Test SPAs
    log.info('\n=== Testing Known SPAs ===');
    for (const url of spaUrls) {
      await testFactory(factory, url);
    }
    
    // Test static sites
    log.info('\n=== Testing Known Static Sites ===');
    for (const url of staticUrls) {
      await testFactory(factory, url);
    }
    
    // Test with forced strategies
    log.info('\n=== Testing Forced Strategy: Cheerio ===');
    const cheerioFactory = new CrawlingStrategyFactory(
      spaDetector,
      cheerioExtractor,
      puppeteerExtractor,
      { forceStrategy: 'cheerio' }
    );
    await testFactory(cheerioFactory, 'https://reactjs.org'); // Should use Cheerio despite being SPA
    
    log.info('\n=== Testing Forced Strategy: Puppeteer ===');
    const puppeteerFactory = new CrawlingStrategyFactory(
      spaDetector,
      cheerioExtractor,
      puppeteerExtractor,
      { forceStrategy: 'puppeteer' }
    );
    await testFactory(puppeteerFactory, 'https://example.com'); // Should use Puppeteer despite being static
  }
  
  log.info('\nAll tests completed');
  
  // Clean up resources
  await puppeteerExtractor.cleanup();
}

// Run the test
main().catch(error => {
  log.error(`Unhandled error in test script: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}); 