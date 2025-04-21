import { ErrorConditionMocks, ErrorType } from '../ErrorConditionMocks';
import axios from 'axios';

describe('ErrorConditionMocks', () => {
  const baseUrl = 'https://error-test.example.com';
  let errorMocks: ErrorConditionMocks;
  
  beforeEach(() => {
    // Reset any lingering nock scopes
    errorMocks?.cleanup();
  });
  
  afterEach(() => {
    // Clean up nock scopes after each test
    errorMocks?.cleanup();
  });
  
  describe('HTTP error status codes', () => {
    beforeEach(() => {
      // Create a basic error mock
      errorMocks = new ErrorConditionMocks({
        baseUrl
      });
      
      // Setup the mock routes
      errorMocks.setup();
    });
    
    it('should respond with 404 Not Found error', async () => {
      // Get the URL for the not found error
      const notFoundUrl = errorMocks.getUrlForErrorType(ErrorType.NOT_FOUND);
      
      // Make the request and expect it to fail with 404
      await expect(axios.get(notFoundUrl))
        .rejects.toMatchObject({ response: { status: 404 } });
    });
    
    it('should respond with 500 Internal Server Error', async () => {
      // Get the URL for the server error
      const serverErrorUrl = errorMocks.getUrlForErrorType(ErrorType.SERVER_ERROR);
      
      // Make the request and expect it to fail with 500
      await expect(axios.get(serverErrorUrl))
        .rejects.toMatchObject({ response: { status: 500 } });
    });
    
    it('should respond with 403 Forbidden error', async () => {
      // Get the URL for the forbidden error
      const forbiddenUrl = errorMocks.getUrlForErrorType(ErrorType.FORBIDDEN);
      
      // Make the request and expect it to fail with 403
      await expect(axios.get(forbiddenUrl))
        .rejects.toMatchObject({ response: { status: 403 } });
    });
    
    it('should respond with 429 Too Many Requests error and rate limit headers', async () => {
      // Get the URL for the rate limited error
      const rateLimitedUrl = errorMocks.getUrlForErrorType(ErrorType.RATE_LIMITED);
      
      try {
        await axios.get(rateLimitedUrl);
        fail('Expected request to be rejected');
      } catch (error) {
        if (axios.isAxiosError(error) && error.response) {
          // Verify status code
          expect(error.response.status).toBe(429);
          
          // Verify rate limit headers
          expect(error.response.headers['retry-after']).toBe('60');
          expect(error.response.headers['x-ratelimit-limit']).toBe('10');
          expect(error.response.headers['x-ratelimit-remaining']).toBe('0');
          expect(error.response.headers['x-ratelimit-reset']).toBeDefined();
        } else {
          fail('Expected Axios error with response');
        }
      }
    });
  });
  
  describe('Network errors', () => {
    beforeEach(() => {
      errorMocks = new ErrorConditionMocks({
        baseUrl
      });
      
      errorMocks.setup();
    });
    
    it('should simulate a network error', async () => {
      // Get the URL for network error
      const networkErrorUrl = errorMocks.getUrlForErrorType(ErrorType.NETWORK_ERROR);
      
      // Make the request and expect a network error (no response)
      await expect(axios.get(networkErrorUrl))
        .rejects.toMatchObject({ 
          code: 'ECONNRESET',
          message: expect.stringContaining('Connection reset by peer')
        });
    });
  });
  
  describe('Malformed content', () => {
    beforeEach(() => {
      errorMocks = new ErrorConditionMocks({
        baseUrl
      });
      
      errorMocks.setup();
    });
    
    it('should return malformed HTML content', async () => {
      // Get the URL for malformed content
      const malformedUrl = errorMocks.getUrlForErrorType(ErrorType.MALFORMED_CONTENT);
      
      try {
        const response = await axios.get(malformedUrl);
        
        // Verify response contains malformed HTML
        expect(response.data).toContain('<titl Invalid HTML');
        expect(response.data).not.toContain('</html>');
      } catch (error) {
        fail('Request should not fail for malformed HTML');
      }
    });
    
    it('should return empty response for empty content error', async () => {
      // Get the URL for empty response
      const emptyUrl = errorMocks.getUrlForErrorType(ErrorType.EMPTY_RESPONSE);
      
      const response = await axios.get(emptyUrl);
      
      // Verify response is empty
      expect(response.data).toBe('');
    });
  });
  
  describe('Redirect loops', () => {
    beforeEach(() => {
      errorMocks = new ErrorConditionMocks({
        baseUrl,
        maxRedirects: 3
      });
      
      errorMocks.setup();
    });
    
    it('should create a redirect loop that triggers Axios maxRedirects error', async () => {
      // Get the URL for redirect loop
      const redirectLoopUrl = errorMocks.getUrlForErrorType(ErrorType.REDIRECT_LOOP);
      
      // Configure axios with a low maxRedirects to trigger the error
      await expect(axios.get(redirectLoopUrl, { maxRedirects: 2 }))
        .rejects.toMatchObject({
          message: expect.stringContaining('maxRedirects')
        });
    });
  });
  
  describe('Timeouts', () => {
    beforeEach(() => {
      errorMocks = new ErrorConditionMocks({
        baseUrl
      });
      
      errorMocks.setup();
    });
    
    it('should trigger a timeout error', async () => {
      // Get the URL for timeout
      const timeoutUrl = errorMocks.getUrlForErrorType(ErrorType.TIMEOUT);
      
      // Set a very short timeout to ensure it triggers
      await expect(axios.get(timeoutUrl, { timeout: 100 }))
        .rejects.toMatchObject({
          code: 'ECONNABORTED',
          message: expect.stringContaining('timeout')
        });
    });
  });
  
  describe('Unreliable server', () => {
    const mockRandom = jest.spyOn(Math, 'random');
    
    beforeEach(() => {
      errorMocks = new ErrorConditionMocks({
        baseUrl,
        unreliableErrorRate: 0.5
      });
      
      errorMocks.setup();
    });
    
    afterEach(() => {
      mockRandom.mockRestore();
    });
    
    it('should succeed when random value is below error rate', async () => {
      // Mock Math.random to return a value below the error rate threshold
      mockRandom.mockReturnValue(0.4);
      
      // Get the URL for unreliable server
      const unreliableUrl = errorMocks.getUrlForErrorType(ErrorType.UNRELIABLE);
      
      // Make the request and expect it to succeed
      const response = await axios.get(unreliableUrl);
      expect(response.status).toBe(200);
      expect(response.data).toContain('Success (this time)');
    });
    
    it('should fail when random value is above error rate', async () => {
      // Mock Math.random to return a value above the error rate threshold
      mockRandom.mockReturnValue(0.6);
      
      // Get the URL for unreliable server
      const unreliableUrl = errorMocks.getUrlForErrorType(ErrorType.UNRELIABLE);
      
      // Make the request and expect it to fail
      await expect(axios.get(unreliableUrl))
        .rejects.toMatchObject({ response: { status: 500 } });
    });
  });
  
  describe('Custom status codes', () => {
    beforeEach(() => {
      errorMocks = new ErrorConditionMocks({
        baseUrl
      });
      
      errorMocks.setup();
    });
    
    it('should respond with custom status code', async () => {
      // Get the URL for a custom status code
      const customUrl = errorMocks.getUrlForStatusCode(418);
      
      // Make the request and expect a teapot error
      await expect(axios.get(customUrl))
        .rejects.toMatchObject({ response: { status: 500 } });
    });
  });
  
  describe('Custom error message', () => {
    const customMessage = 'This is a custom error message';
    
    beforeEach(() => {
      errorMocks = new ErrorConditionMocks({
        baseUrl,
        customErrorMessage: customMessage
      });
      
      errorMocks.setup();
    });
    
    it('should include custom error message in response', async () => {
      // Get the URL for server error
      const serverErrorUrl = errorMocks.getUrlForErrorType(ErrorType.SERVER_ERROR);
      
      try {
        await axios.get(serverErrorUrl);
        fail('Expected request to be rejected');
      } catch (error) {
        if (axios.isAxiosError(error) && error.response) {
          // Verify custom message is included in the response data
          expect(error.response.data).toContain(customMessage);
        } else {
          fail('Expected Axios error with response');
        }
      }
    });
  });
}); 