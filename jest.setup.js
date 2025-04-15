// Increase timeout for all tests
jest.setTimeout(10000);

// Silence console logs during tests unless explicitly enabled
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}; 