import nock from 'nock';

/**
 * Configuration options for SPA mock server
 */
export interface SPAMockOptions {
  /** Base URL for the SPA, e.g., 'https://example.com' */
  baseUrl: string;
  /** SPA framework to simulate ('react' | 'angular' | 'vue' | 'custom') */
  framework?: 'react' | 'angular' | 'vue' | 'custom';
  /** Whether to include client-side routing */
  includeRouting?: boolean;
  /** Delay in milliseconds to simulate loading time */
  responseDelay?: number;
  /** Custom HTML for the base page, if not using a framework template */
  customHtml?: string;
  /** Enable verbose logging */
  verbose?: boolean;
}

/**
 * Route configuration for SPA mock
 */
export interface SPARouteConfig {
  /** Route path (e.g., '/about', '/products/123') */
  path: string;
  /** HTML content for this route */
  content?: string;
  /** Title for this route */
  title?: string;
  /** Whether this route should return an error */
  error?: {
    status: number;
    message: string;
  };
  /** Metadata to include in the HTML */
  metadata?: Record<string, string>;
}

/**
 * A utility class to create a mock SPA for testing purposes
 */
export class SPAMock {
  private options: Required<SPAMockOptions>;
  private routes: Map<string, SPARouteConfig> = new Map();
  private scope: nock.Scope;

  constructor(options: SPAMockOptions) {
    // Set default options
    this.options = {
      baseUrl: options.baseUrl,
      framework: options.framework || 'react',
      includeRouting: options.includeRouting ?? true,
      responseDelay: options.responseDelay ?? 0,
      customHtml: options.customHtml || '',
      verbose: options.verbose ?? false,
    };

    // Create nock scope
    this.scope = nock(this.options.baseUrl);

    // Add default route (homepage)
    this.addRoute({
      path: '/',
      title: 'Home',
      content: '<h1>Home Page</h1>',
    });

    this.log(`Created SPA mock for ${this.options.baseUrl} using ${this.options.framework} framework`);
  }

  /**
   * Add a route to the SPA mock
   * @param route Route configuration
   * @returns this instance for chaining
   */
  public addRoute(route: SPARouteConfig): SPAMock {
    this.routes.set(route.path, route);
    this.log(`Added route: ${route.path}`);
    return this;
  }

  /**
   * Add multiple routes to the SPA mock
   * @param routes Array of route configurations
   * @returns this instance for chaining
   */
  public addRoutes(routes: SPARouteConfig[]): SPAMock {
    routes.forEach(route => this.addRoute(route));
    return this;
  }

  /**
   * Start the mock server by setting up nock interceptors
   * @returns this instance for chaining
   */
  public start(): SPAMock {
    this.log('Starting SPA mock server...');

    // Set up interceptors for all routes
    this.routes.forEach((route, path) => {
      if (route.error) {
        // Set up error response
        this.scope
          .get(new RegExp(path.replace(/:id/, '[^/]+')))
          .delay(this.options.responseDelay)
          .reply(route.error.status, route.error.message);

        this.log(`Set up error response for ${path}: ${route.error.status}`);
      } else {
        // Set up normal response
        const html = this.generateHtml(route);
        this.scope
          .get(new RegExp(path.replace(/:id/, '[^/]+')))
          .delay(this.options.responseDelay)
          .reply(200, html, {
            'Content-Type': 'text/html',
          });

        this.log(`Set up mock response for ${path}`);
      }
    });

    return this;
  }

  /**
   * Stop the mock server by cleaning up nock interceptors
   */
  public stop(): void {
    nock.cleanAll();
    this.log('Stopped SPA mock server');
  }

  /**
   * Generate HTML for a route based on the configured framework and route settings
   * @param route Route configuration
   * @returns HTML string
   */
  private generateHtml(route: SPARouteConfig): string {
    if (this.options.customHtml && route.path === '/') {
      return this.options.customHtml;
    }

    // Generate metadata tags
    const metaTags = this.generateMetaTags(route.metadata || {});

    // Generate HTML based on framework
    switch (this.options.framework) {
      case 'react':
        return this.generateReactHtml(route, metaTags);
      case 'angular':
        return this.generateAngularHtml(route, metaTags);
      case 'vue':
        return this.generateVueHtml(route, metaTags);
      case 'custom':
        return route.content || `<h1>${route.title || 'Untitled Page'}</h1>`;
      default:
        return this.generateReactHtml(route, metaTags);
    }
  }

  /**
   * Generate React SPA HTML
   */
  private generateReactHtml(route: SPARouteConfig, metaTags: string): string {
    const routingJs = this.options.includeRouting
      ? `
        <script>
          // Simulate React Router
          window.addEventListener('popstate', function(event) {
            console.log('Location changed to: ' + window.location.pathname);
            // In a real app, this would re-render the component
          });
          
          function navigateTo(path) {
            window.history.pushState({}, '', path);
            console.log('Navigated to: ' + path);
          }
        </script>
      ` : '';

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${route.title || 'React App'}</title>
          ${metaTags}
          <script src="https://unpkg.com/react@17/umd/react.production.min.js"></script>
          <script src="https://unpkg.com/react-dom@17/umd/react-dom.production.min.js"></script>
          ${routingJs}
        </head>
        <body>
          <div id="root">
            ${route.content || `<h1>${route.title || 'React Page'}</h1>`}
            ${this.generateNavLinks()}
          </div>
          <script>
            console.log('React app initialized');
            // Simulate React app mounting
            document.addEventListener('DOMContentLoaded', function() {
              console.log('React app mounted');
            });
          </script>
        </body>
      </html>
    `;
  }

  /**
   * Generate Angular SPA HTML
   */
  private generateAngularHtml(route: SPARouteConfig, metaTags: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${route.title || 'Angular App'}</title>
          ${metaTags}
        </head>
        <body>
          <app-root _nghost-abc-123="">
            ${route.content || `<h1>${route.title || 'Angular Page'}</h1>`}
            ${this.generateNavLinks()}
          </app-root>
          <script src="runtime.js"></script>
          <script src="polyfills.js"></script>
          <script src="main.js"></script>
          <script>
            console.log('Angular app initialized');
          </script>
        </body>
      </html>
    `;
  }

  /**
   * Generate Vue SPA HTML
   */
  private generateVueHtml(route: SPARouteConfig, metaTags: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${route.title || 'Vue App'}</title>
          ${metaTags}
          <script src="https://unpkg.com/vue@3"></script>
        </head>
        <body>
          <div id="app">
            ${route.content || `<h1>${route.title || 'Vue Page'}</h1>`}
            ${this.generateNavLinks()}
          </div>
          <script>
            console.log('Vue app initialized');
            Vue.createApp({
              template: '${route.content ? route.content.replace(/'/g, "\\'") : `<h1>${route.title || 'Vue Page'}</h1>`}'
            }).mount('#app');
          </script>
        </body>
      </html>
    `;
  }

  /**
   * Generate metadata tags for HTML
   */
  private generateMetaTags(metadata: Record<string, string>): string {
    return Object.entries(metadata)
      .map(([name, content]) => `<meta name="${name}" content="${content}" />`)
      .join('\n');
  }

  /**
   * Generate navigation links for routes
   */
  private generateNavLinks(): string {
    if (!this.options.includeRouting) {
      return '';
    }

    return `
      <nav>
        <ul>
          ${Array.from(this.routes.entries())
        .filter(([_, route]) => !route.error) // Don't include error routes
        .map(([path, route]) => `
              <li>
                <a href="${path}" ${this.options.framework === 'react' ? 'onclick="navigateTo(\'' + path + '\'); return false;"' : ''}>
                  ${route.title || path}
                </a>
              </li>
            `)
        .join('\n')}
        </ul>
      </nav>
    `;
  }

  /**
   * Log message if verbose mode is enabled
   */
  private log(message: string): void {
    if (this.options.verbose) {
      console.log(`[SPAMock] ${message}`);
    }
  }
} 