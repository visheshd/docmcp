# DocMCP: Documentation Management and Processing System

A powerful system for crawling, processing, and querying documentation with AI-powered embedding generation and semantic search capabilities.

## Features

- **Documentation Crawling**: Automatically crawl documentation sites with customizable depth and rate limiting
- **Content Processing**: Convert HTML to clean Markdown with metadata extraction
- **Vector Embeddings**: Generate embeddings using Ollama API for semantic searching
- **Job Management**: Track and manage document processing jobs with detailed progress reporting
- **MCP Integration**: Built-in MCP tools for AI agent integration
- **RESTful API**: Simple API endpoints for integration with other systems

## Architecture

The system consists of several core services:

- **CrawlerService**: Handles documentation site crawling with robots.txt support
- **DocumentProcessorService**: Processes documents (HTML→Markdown, chunking, embedding)
- **JobService**: Manages asynchronous processing jobs with detailed status tracking
- **ChunkService**: Stores and retrieves document chunks with vector search capabilities
- **MCP Tools**: Agent-friendly interface for adding and querying documentation

## Getting Started

### Prerequisites

- Node.js 16+
- PostgreSQL with pgvector extension
- Ollama API for vector embeddings

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/docmcp.git
cd docmcp

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Run database migrations
npx prisma migrate deploy
```

### Usage

Start the server:

```bash
npm run dev
```

## Adding Documentation

Add documentation by providing a URL:

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"function": "add_documentation", "parameters": {"url": "https://example.com/docs", "maxDepth": 3}}'
```

## Querying Documentation

Query your documentation using natural language:

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"function": "query_documentation", "parameters": {"query": "How do I authenticate users?"}}'
```

## Job Management Pattern

All services follow a consistent Prisma instance injection pattern:

```typescript
constructor(prismaClient?: PrismaClient) {
  this.prisma = prismaClient || getMainPrismaClient();
}
```

This pattern enables:
- Using standard client in normal operation
- Injecting test database clients during testing
- Better isolated tests to prevent cross-contamination

## Development

### Build

```bash
npm run build
```

### Testing

```bash
npm test
```

## License

MIT
