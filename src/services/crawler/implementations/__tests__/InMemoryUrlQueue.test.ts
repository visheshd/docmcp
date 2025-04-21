import { InMemoryUrlQueue } from '../InMemoryUrlQueue';

describe('InMemoryUrlQueue', () => {
  let queue: InMemoryUrlQueue;

  beforeEach(() => {
    queue = new InMemoryUrlQueue();
  });

  describe('add', () => {
    it('should add URLs to the queue', () => {
      const url = 'https://example.com';
      const depth = 0;

      queue.add(url, depth);
      expect(queue.size()).toBe(1);
    });

    it('should not add duplicate URLs', () => {
      const url = 'https://example.com';
      const depth = 0;

      queue.add(url, depth);
      queue.add(url, depth);
      expect(queue.size()).toBe(1);
    });

    it('should handle multiple URLs with different depths', () => {
      const urls = [
        { url: 'https://example.com', depth: 0 },
        { url: 'https://example.com/page1', depth: 1 },
        { url: 'https://example.com/page2', depth: 1 }
      ];

      for (const { url, depth } of urls) {
        queue.add(url, depth);
      }
      expect(queue.size()).toBe(3);
    });

    it('should normalize URLs before adding', () => {
      queue.add('https://example.com/path/', 0);
      queue.add('https://example.com/path', 0);
      expect(queue.size()).toBe(1);
    });
  });

  describe('addBulk', () => {
    it('should add multiple URLs at once', () => {
      const urls = [
        { url: 'https://example.com/1', depth: 0 },
        { url: 'https://example.com/2', depth: 0 }
      ];

      queue.addBulk(urls);
      expect(queue.size()).toBe(2);
    });

    it('should handle duplicate URLs in bulk add', () => {
      const urls = [
        { url: 'https://example.com', depth: 0 },
        { url: 'https://example.com', depth: 1 } // Same URL, different depth
      ];

      queue.addBulk(urls);
      expect(queue.size()).toBe(1); // Should only add one
    });
  });

  describe('getNext', () => {
    it('should return null when queue is empty', () => {
      const result = queue.getNext();
      expect(result).toBeNull();
    });

    it('should return and remove the first URL from queue', () => {
      const url = 'https://example.com';
      const depth = 0;

      queue.add(url, depth);
      const next = queue.getNext();
      expect(next).toEqual({ url, depth });
      expect(queue.size()).toBe(0);
    });

    it('should maintain FIFO order', () => {
      const urls = [
        { url: 'https://example.com/1', depth: 0 },
        { url: 'https://example.com/2', depth: 0 },
        { url: 'https://example.com/3', depth: 0 }
      ];

      queue.addBulk(urls);

      for (const expected of urls) {
        const next = queue.getNext();
        expect(next).toEqual(expected);
      }
    });
  });

  describe('size', () => {
    it('should return 0 for empty queue', () => {
      expect(queue.size()).toBe(0);
    });

    it('should return correct size after add and getNext operations', () => {
      const urls = [
        { url: 'https://example.com/1', depth: 0 },
        { url: 'https://example.com/2', depth: 0 }
      ];

      queue.addBulk(urls);
      expect(queue.size()).toBe(2);

      queue.getNext();
      expect(queue.size()).toBe(1);

      queue.getNext();
      expect(queue.size()).toBe(0);
    });
  });

  describe('clear', () => {
    it('should remove all URLs from the queue', () => {
      const urls = [
        { url: 'https://example.com/1', depth: 0 },
        { url: 'https://example.com/2', depth: 0 }
      ];

      queue.addBulk(urls);
      expect(queue.size()).toBe(2);

      queue.clear();
      expect(queue.size()).toBe(0);
    });

    it('should clear both queue and visited URLs', () => {
      const url = 'https://example.com';
      queue.add(url, 0);
      queue.markVisited(url);

      queue.clear();
      expect(queue.size()).toBe(0);
      expect(queue.visitedCount()).toBe(0);
      expect(queue.isVisited(url)).toBe(false);
    });
  });

  describe('has', () => {
    it('should return true for URLs in the queue', () => {
      const url = 'https://example.com';
      queue.add(url, 0);
      expect(queue.has(url)).toBe(true);
    });

    it('should return false for URLs not in the queue', () => {
      expect(queue.has('https://example.com')).toBe(false);
    });

    it('should handle URLs after getNext', () => {
      const url = 'https://example.com';
      queue.add(url, 0);
      queue.getNext();
      expect(queue.has(url)).toBe(false);
    });
  });

  describe('markVisited', () => {
    it('should mark URLs as visited', () => {
      const url = 'https://example.com';
      queue.markVisited(url);
      expect(queue.isVisited(url)).toBe(true);
    });

    it('should remove visited URLs from queue', () => {
      const url = 'https://example.com';
      queue.add(url, 0);
      expect(queue.size()).toBe(1);

      queue.markVisited(url);
      expect(queue.size()).toBe(0);
      expect(queue.isVisited(url)).toBe(true);
    });
  });

  describe('visitedCount', () => {
    it('should return number of visited URLs', () => {
      const urls = [
        'https://example.com/1',
        'https://example.com/2',
        'https://example.com/3'
      ];

      for (const url of urls) {
        queue.markVisited(url);
      }

      expect(queue.visitedCount()).toBe(3);
    });
  });

  describe('prioritize', () => {
    it('should sort queue by depth by default', () => {
      const urls = [
        { url: 'https://example.com/deep', depth: 2 },
        { url: 'https://example.com/', depth: 0 },
        { url: 'https://example.com/medium', depth: 1 }
      ];

      queue.addBulk(urls);
      queue.prioritize();

      // Should get URLs in ascending depth order
      expect(queue.getNext()).toEqual({ url: 'https://example.com', depth: 0 });
      expect(queue.getNext()).toEqual({ url: 'https://example.com/medium', depth: 1 });
      expect(queue.getNext()).toEqual({ url: 'https://example.com/deep', depth: 2 });
    });

    it('should accept custom comparison function', () => {
      const urls = [
        { url: 'https://example.com/1', depth: 0 },
        { url: 'https://example.com/2', depth: 0 }
      ];

      queue.addBulk(urls);
      // Sort by URL in reverse order
      queue.prioritize((a, b) => b.url.localeCompare(a.url));

      expect(queue.getNext()).toEqual({ url: 'https://example.com/2', depth: 0 });
      expect(queue.getNext()).toEqual({ url: 'https://example.com/1', depth: 0 });
    });
  });
}); 