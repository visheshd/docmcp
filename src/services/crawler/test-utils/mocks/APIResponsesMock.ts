import nock from 'nock';

/**
 * Configuration options for API responses mock
 */
export interface APIResponsesMockOptions {
  /** Base URL for the API, e.g., 'https://api.example.com' */
  baseUrl: string;
  /** Whether to include custom headers in responses */
  includeCustomHeaders?: boolean;
  /** Delay in milliseconds to simulate API response time */
  responseDelay?: number;
  /** Whether to set up default robots.txt response */
  setupDefaultRobotsTxt?: boolean;
}

/**
 * A utility class to mock API responses for testing
 */
export class APIResponsesMock {
  private options: Required<APIResponsesMockOptions>;
  private scope: nock.Scope;

  constructor(options: APIResponsesMockOptions) {
    // Set default options
    this.options = {
      baseUrl: options.baseUrl,
      includeCustomHeaders: options.includeCustomHeaders ?? true,
      responseDelay: options.responseDelay ?? 0,
      setupDefaultRobotsTxt: options.setupDefaultRobotsTxt ?? true
    };

    // Create nock scope
    const url = new URL(this.options.baseUrl);
    this.scope = nock(`${url.protocol}//${url.host}`);
  }

  /**
   * Set up the mock server by activating all defined routes
   */
  public setup(): void {
    // Set up default robots.txt response if enabled and not already defined
    if (this.options.setupDefaultRobotsTxt) {
      // Check if robots.txt is already mocked
      const pendingMocks = nock.pendingMocks();
      const robotsTxtPath = '/robots.txt';
      const robotsTxtMockExists = pendingMocks.some(mock => 
        mock.includes(this.options.baseUrl) && mock.includes(robotsTxtPath)
      );
      
      if (!robotsTxtMockExists) {
        this.scope.get('/robots.txt')
          .reply(200, "User-agent: *\nAllow: /\n");
      }
    }
  }

  /**
   * Clean up all nock interceptors
   */
  public cleanup(): void {
    nock.cleanAll();
  }
} 