import nock from 'nock';

/**
 * Error condition type options
 */
export enum ErrorType {
  /** HTTP 404 Not Found */
  NOT_FOUND = 'not_found',
  /** HTTP 500 Internal Server Error */
  SERVER_ERROR = 'server_error',
  /** HTTP 403 Forbidden */
  FORBIDDEN = 'forbidden',
  /** HTTP 429 Too Many Requests (rate limiting) */
  RATE_LIMITED = 'rate_limited',
  /** HTTP 301/302 Redirect loop */
  REDIRECT_LOOP = 'redirect_loop',
  /** Connection timeout */
  TIMEOUT = 'timeout',
  /** Network error (connection refused) */
  NETWORK_ERROR = 'network_error',
  /** Malformed content (invalid HTML) */
  MALFORMED_CONTENT = 'malformed_content',
  /** Empty response */
  EMPTY_RESPONSE = 'empty_response',
  /** Unreliable server (random errors) */
  UNRELIABLE = 'unreliable'
}

/**
 * Options for configuring error condition mocks
 */
export interface ErrorConditionOptions {
  /** Base URL to mock errors for */
  baseUrl: string;
  /** Path patterns to apply errors to (default: ['/error-*']) */
  pathPatterns?: string[];
  /** Default error type if not specified in the path */
  defaultErrorType?: ErrorType;
  /** Custom error message to use */
  customErrorMessage?: string;
  /** Random error rate for unreliable server (0-1) */
  unreliableErrorRate?: number;
  /** Maximum number of redirects before loop */
  maxRedirects?: number;
  /** Delay in ms before triggering the error */
  delay?: number;
}

/**
 * Error mock endpoint configuration
 */
interface ErrorEndpoint {
  /** Path pattern to match */
  path: string | RegExp;
  /** Error type to simulate */
  errorType: ErrorType;
  /** Specific status code (if applicable) */
  statusCode?: number;
  /** Custom message to use */
  message?: string;
}

/**
 * Provides mocks for various error conditions that might occur during crawling
 * This helps test the crawler's error handling and resilience
 */
export class ErrorConditionMocks {
  private baseUrl: string;
  private scope: nock.Scope;
  private endpoints: ErrorEndpoint[] = [];
  private options: Required<ErrorConditionOptions>;
  
  /**
   * Creates a new set of error condition mocks
   * @param options Configuration options
   */
  constructor(options: ErrorConditionOptions) {
    this.baseUrl = options.baseUrl;
    
    // Set defaults for options
    this.options = {
      baseUrl: options.baseUrl,
      pathPatterns: options.pathPatterns || ['/error-*'],
      defaultErrorType: options.defaultErrorType || ErrorType.SERVER_ERROR,
      customErrorMessage: options.customErrorMessage || 'Error condition mock triggered',
      unreliableErrorRate: options.unreliableErrorRate || 0.5,
      maxRedirects: options.maxRedirects || 3,
      delay: options.delay || 0
    };
    
    // Create the nock scope for the given base URL
    const url = new URL(this.baseUrl);
    this.scope = nock(`${url.protocol}//${url.host}`);
    
    // Generate error endpoints
    this.generateErrorEndpoints();
  }
  
  /**
   * Generates error endpoints based on configured path patterns
   */
  private generateErrorEndpoints(): void {
    // Basic error types that map directly to paths
    const basicErrorTypes = [
      ErrorType.NOT_FOUND,
      ErrorType.SERVER_ERROR,
      ErrorType.FORBIDDEN,
      ErrorType.RATE_LIMITED,
      ErrorType.MALFORMED_CONTENT,
      ErrorType.EMPTY_RESPONSE
    ];
    
    // Create endpoints for each basic error type
    basicErrorTypes.forEach(errorType => {
      this.endpoints.push({
        path: `/error-${errorType}`,
        errorType
      });
    });
    
    // Add specialized error conditions
    this.endpoints.push({
      path: '/error-timeout',
      errorType: ErrorType.TIMEOUT
    });
    
    this.endpoints.push({
      path: '/error-redirect-loop',
      errorType: ErrorType.REDIRECT_LOOP
    });
    
    this.endpoints.push({
      path: '/error-network',
      errorType: ErrorType.NETWORK_ERROR
    });
    
    this.endpoints.push({
      path: '/error-unreliable',
      errorType: ErrorType.UNRELIABLE
    });
    
    // Add regex pattern for other error paths
    this.endpoints.push({
      path: /\/error-custom\/(\d+)/,
      errorType: ErrorType.SERVER_ERROR
    });
    
    // Add wildcard patterns from options
    this.options.pathPatterns
      .filter(pattern => pattern !== '/error-*') // Skip the default pattern
      .forEach(pattern => {
        // Convert glob-style patterns to regex
        const regexPattern = new RegExp(pattern.replace('*', '.*'));
        this.endpoints.push({
          path: regexPattern,
          errorType: this.options.defaultErrorType
        });
      });
  }
  
  /**
   * Maps error type to HTTP status code
   * @param errorType The error type
   * @returns The corresponding HTTP status code
   */
  private getStatusCodeForErrorType(errorType: ErrorType): number {
    switch (errorType) {
      case ErrorType.NOT_FOUND:
        return 404;
      case ErrorType.SERVER_ERROR:
        return 500;
      case ErrorType.FORBIDDEN:
        return 403;
      case ErrorType.RATE_LIMITED:
        return 429;
      case ErrorType.REDIRECT_LOOP:
        return 302;
      // Timeouts and network errors don't have HTTP status codes
      // as they occur before a response is received
      default:
        return 500;
    }
  }
  
  /**
   * Creates error response content based on error type
   * @param errorType The error type
   * @param path The current path
   * @returns Error content
   */
  private createErrorContent(errorType: ErrorType, path: string): string {
    const baseMessage = this.options.customErrorMessage || 'Error condition test';
    
    switch (errorType) {
      case ErrorType.MALFORMED_CONTENT:
        return `<!DOCTYPE html><html><head><titl Invalid HTML with unclosed tags <p>Missing closing tags`;
      
      case ErrorType.EMPTY_RESPONSE:
        return '';
      
      default:
        return `<!DOCTYPE html>
<html>
<head>
  <title>Error ${this.getStatusCodeForErrorType(errorType)}</title>
</head>
<body>
  <h1>Error</h1>
  <p>${baseMessage}</p>
  <p>Error Type: ${errorType}</p>
  <p>Path: ${path}</p>
</body>
</html>`;
    }
  }
  
  /**
   * Sets up all error condition mocks
   */
  public setup(): void {
    // Setup each error endpoint
    this.endpoints.forEach(endpoint => {
      const statusCode = this.getStatusCodeForErrorType(endpoint.errorType);
      
      switch (endpoint.errorType) {
        case ErrorType.TIMEOUT:
          // For timeouts, we set a very long delay that will timeout most clients
          this.scope
            .get(endpoint.path)
            .delayConnection(30000) // 30 second delay
            .reply(200, 'Should timeout before seeing this');
          break;
          
        case ErrorType.NETWORK_ERROR:
          // For network errors, we use a special nock error
          this.scope
            .get(endpoint.path)
            .replyWithError({
              code: 'ECONNRESET',
              message: 'Connection reset by peer'
            });
          break;
          
        case ErrorType.REDIRECT_LOOP:
          // Create a series of redirects that eventually loop
          for (let i = 0; i < this.options.maxRedirects; i++) {
            const nextPath = i === this.options.maxRedirects - 1
              ? '/error-redirect-loop' // Loop back to start
              : `/error-redirect-loop/${i + 1}`;
              
            this.scope
              .get(i === 0 ? endpoint.path : `/error-redirect-loop/${i}`)
              .reply(302, '', { 'Location': nextPath });
          }
          break;
          
        case ErrorType.UNRELIABLE:
          // Sometimes succeeds, sometimes fails
          this.scope
            .get(endpoint.path)
            .reply((uri) => {
              // Random success or failure based on configured rate
              const shouldFail = Math.random() < this.options.unreliableErrorRate;
              if (shouldFail) {
                return [500, this.createErrorContent(ErrorType.SERVER_ERROR, uri)];
              } else {
                return [200, `<!DOCTYPE html><html><body><p>Success (this time)</p></body></html>`];
              }
            });
          break;
          
        case ErrorType.RATE_LIMITED:
          // Return appropriate headers for rate limiting
          this.scope
            .get(endpoint.path)
            .reply(429, this.createErrorContent(endpoint.errorType, String(endpoint.path)), {
              'Retry-After': '60',
              'X-RateLimit-Limit': '10',
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': Math.floor(Date.now() / 1000 + 60).toString()
            });
          break;
          
        default:
          // Standard error response with optional delay
          let responder = this.scope.get(endpoint.path);
          
          // Add delay if configured
          if (this.options.delay > 0) {
            responder = responder.delayConnection(this.options.delay);
          }
          
          // Send the response
          responder.reply(
            statusCode,
            this.createErrorContent(endpoint.errorType, String(endpoint.path))
          );
          break;
      }
    });
    
    // Add a catch-all for any unmatched error paths to use default error type
    this.scope
      .get(/\/error-.*/)
      .reply((uri) => {
        return [
          this.getStatusCodeForErrorType(this.options.defaultErrorType),
          this.createErrorContent(this.options.defaultErrorType, uri)
        ];
      });
  }
  
  /**
   * Cleans up all error condition mocks
   */
  public cleanup(): void {
    nock.cleanAll();
  }
  
  /**
   * Gets a URL for a specific error type
   * @param errorType The error type to get URL for
   * @returns Full URL that will trigger the specified error
   */
  public getUrlForErrorType(errorType: ErrorType): string {
    // Combine base URL with error path
    const url = new URL(this.baseUrl);
    url.pathname = `/error-${errorType}`;
    return url.toString();
  }
  
  /**
   * Helper to create a URL for a custom status code error
   * @param statusCode HTTP status code to simulate
   * @returns Full URL that will respond with the specified status code
   */
  public getUrlForStatusCode(statusCode: number): string {
    // Combine base URL with error path
    const url = new URL(this.baseUrl);
    url.pathname = `/error-custom/${statusCode}`;
    return url.toString();
  }
} 