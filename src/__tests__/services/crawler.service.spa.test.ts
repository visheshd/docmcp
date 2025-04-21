import { SPAMock } from '../../services/crawler/test-utils/mocks/SPAMock';
import axios from 'axios';

// Initialize the SPA mock with desired options
const spaMock = new SPAMock({
  baseUrl: 'https://spa-test.example.com',
  framework: 'react',
  responseDelay: 100,
  verbose: true
});

// Add routes to the SPA mock
spaMock.addRoutes([
  { path: '/about', title: 'About Us', content: '<h1>About Us</h1>' },
  { path: '/contact', title: 'Contact', content: '<h1>Contact</h1>' },
  { path: '/products/:id', title: 'Product Detail', content: '<h1>Product Detail</h1>' }
]);

// Start the mock server
spaMock.start();

describe('Crawler Service SPA Tests', () => {
  afterAll(() => {
    // Stop the mock server after tests
    spaMock.stop();
  });

  it('should fetch the home page', async () => {
    const response = await axios.get('https://spa-test.example.com/');
    expect(response.status).toBe(200);
    expect(response.data).toContain('Home Page');
  });

  it('should fetch the about page', async () => {
    const response = await axios.get('https://spa-test.example.com/about');
    expect(response.status).toBe(200);
    expect(response.data).toContain('About Us');
  });

  it('should fetch the contact page', async () => {
    const response = await axios.get('https://spa-test.example.com/contact');
    expect(response.status).toBe(200);
    expect(response.data).toContain('Contact');
  });

  it('should handle dynamic product routes', async () => {
    const response = await axios.get('https://spa-test.example.com/products/123');
    expect(response.status).toBe(200);
    expect(response.data).toContain('Product Detail');
  });
});
