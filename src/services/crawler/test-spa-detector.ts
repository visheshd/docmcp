#!/usr/bin/env ts-node

/**
 * Test script for the SPADetector
 * This script tests the SPADetector on various URLs to verify its ability
 * to distinguish between SPAs and static websites.
 * 
 * Usage:
 * npx ts-node src/services/crawler/test-spa-detector.ts [url]
 */

import { SPADetector } from './implementations/SPADetector';
import { LoggingUtils, LogLevel } from './utils/LoggingUtils';

// Enable logging
LoggingUtils.setLogLevel(LogLevel.DEBUG);
LoggingUtils.enableTag('spa-detector');

// Add console wrapper for direct output
const log = {
  info: (msg: string) => console.log(`[INFO] ${msg}`),
  debug: (msg: string) => console.log(`[DEBUG] ${msg}`),
  error: (msg: string) => console.error(`[ERROR] ${msg}`)
};

/**
 * Test a single URL and return the detection result
 */
async function testUrl(detector: SPADetector, url: string): Promise<void> {
  log.info(`\nTesting URL: ${url}`);
  try {
    const startTime = Date.now();
    const result = await detector.detectPageType(url);
    const elapsedTime = Date.now() - startTime;

    log.info(`Result: ${result.pageType} (${result.isSPA ? 'SPA' : 'Static'})`);
    log.info(`Confidence: ${(result.confidence * 100).toFixed(1)}%`);
    log.info(`Detection method: ${result.detectionMethod}`);
    log.info(`Time taken: ${elapsedTime}ms`);
  } catch (error) {
    log.error(`Failed to analyze ${url}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Main test function
 */
async function main() {
  // Create detector with options
  const detector = new SPADetector({
    cacheResults: true,
    enableDynamicAnalysis: false // Set to true to enable dynamic analysis (requires Puppeteer implementation)
  });
  
  // Get URL from command line or use default test set
  const customUrl = process.argv[2];
  
  if (customUrl) {
    // Test single URL provided via command line
    await testUrl(detector, customUrl);
  } else {
    // Test a set of known URLs
    log.info('Running tests on predefined set of URLs...');
    
    // Known SPAs
    const spaUrls = [
      'https://reactjs.org',
      'https://vuejs.org',
      'https://angular.io',
      'https://nextjs.org',
      'https://www.spotify.com'
    ];
    
    // Known static sites
    const staticUrls = [
      'https://example.com',
      'https://developer.mozilla.org',
      'https://www.gnu.org',
      'https://httpbin.org/html'
    ];
    
    // Test SPAs
    log.info('\n=== Testing Known SPAs ===');
    for (const url of spaUrls) {
      await testUrl(detector, url);
    }
    
    // Test static sites
    log.info('\n=== Testing Known Static Sites ===');
    for (const url of staticUrls) {
      await testUrl(detector, url);
    }
  }
  
  log.info('\nAll tests completed');
}

// Run the test
main().catch(error => {
  log.error(`Unhandled error in test script: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}); 