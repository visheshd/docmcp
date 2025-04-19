#!/usr/bin/env ts-node

/**
 * Test script for the PuppeteerExtractor
 * This is a simple test to verify that the PuppeteerExtractor is working correctly
 * by crawling a known SPA website and extracting its content.
 * 
 * Usage:
 * npm run ts-node src/services/crawler/test-puppeteer-extractor.ts [url]
 */

import { PuppeteerExtractor } from './implementations/PuppeteerExtractor';
import { ExtractionOptions } from './interfaces/types';
import { LoggingUtils, LogLevel } from './utils/LoggingUtils';

const logger = LoggingUtils.createTaggedLogger('test-puppeteer');

// Enable logging for our test tag explicitly
LoggingUtils.enableTag('test-puppeteer');
LoggingUtils.enableTag('puppeteer-extractor');
// Set log level to DEBUG to see all messages
LoggingUtils.setLogLevel(LogLevel.DEBUG);

// Add a console wrapper to ensure we see output
const consoleLog = {
  info: (msg: string) => {
    console.log(`[INFO] ${msg}`);
    logger.info(msg);
  },
  debug: (msg: string) => {
    console.log(`[DEBUG] ${msg}`);
    logger.debug(msg);
  },
  error: (msg: string | Error) => {
    console.error(`[ERROR] ${msg instanceof Error ? msg.message : msg}`);
    logger.error(msg);
  }
};

/**
 * Main test function
 */
async function main() {
  // Get URL from command line or use default
  const url = process.argv[2] || 'https://reactjs.org/';
  
  consoleLog.info(`Testing PuppeteerExtractor with URL: ${url}`);
  
  const extractor = new PuppeteerExtractor();
  
  try {
    // Configure extraction options
    const options: ExtractionOptions = {
      userAgent: 'DocMCP Test Bot/1.0',
      timeout: 30000,
      waitForTimeout: 2000,
      extractLinks: true,
      evaluateJs: true
    };
    
    // Start time
    const startTime = Date.now();
    
    // Extract content
    consoleLog.info('Extracting content...');
    const content = await extractor.extract(url, options);
    
    // End time
    const elapsedTime = Date.now() - startTime;
    consoleLog.info(`Extraction completed in ${elapsedTime}ms`);
    
    // Log results
    consoleLog.info(`Title: ${content.title}`);
    consoleLog.info(`Content length: ${content.content.length} characters`);
    
    if (content.text) {
      consoleLog.info(`Text length: ${content.text.length} characters`);
      
      // Print a sample of the text
      const textSample = content.text.substring(0, 200) + 
        (content.text.length > 200 ? '...' : '');
      consoleLog.info(`Text sample: ${textSample}`);
    }
    
    // Show framework detection results
    if (content.metadata.frameworks) {
      consoleLog.info(`Detected frameworks: ${content.metadata.frameworks.join(', ')}`);
    } else {
      consoleLog.info('No frameworks detected');
    }
    
    // Show links
    if (content.links && content.links.length > 0) {
      consoleLog.info(`Found ${content.links.length} links`);
      
      // Print a few links for verification
      const linkSamples = content.links.slice(0, 5);
      consoleLog.info('Sample links:');
      linkSamples.forEach((link, idx) => {
        console.log(`  ${idx + 1}. ${link}`);
      });
    } else {
      consoleLog.info('No links found');
    }
    
  } catch (error) {
    consoleLog.error(`Test failed: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
  } finally {
    // Clean up extractor resources
    consoleLog.info('Cleaning up extractor resources...');
    await extractor.cleanup();
    consoleLog.info('Test completed');
  }
}

// Run the test
main().catch(error => {
  consoleLog.error('Unhandled error in test script:');
  console.error(error);
  process.exit(1);
}); 