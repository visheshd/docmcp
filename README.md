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

### Document Processing Pipeline

The DocMCP system processes documentation through the following pipeline:

1. **Documentation Input**
   - User provides a URL through the `add_documentation` MCP tool
   - System creates a Job record with "pending" status
   - Job is assigned tags for categorization and future filtering

2. **Web Crawling** (CrawlerService)
   - Crawler respects robots.txt restrictions
   - Follows links up to specified maximum depth
   - Captures HTML content and metadata
   - Creates Document records linked to the parent Job

3. **Document Processing** (DocumentProcessorService)
   - Cleans HTML and converts to structured Markdown
   - Extracts metadata (package info, version, document type)
   - Establishes parent-child relationships between documents
   - Updates Job progress as processing continues

4. **Chunking & Embedding** (ChunkService)
   - Splits documents into semantic chunks for better retrieval
   - Generates vector embeddings for each chunk
   - Stores embeddings in PostgreSQL with pgvector extension
   - Preserves chunk metadata and document references

5. **Job Finalization** (JobService)
   - Updates Job status to "completed"
   - Calculates and stores document statistics
   - Makes documents available for querying

6. **Querying & Retrieval**
   - User sends query through `query_documentation` MCP tool
   - System converts query to vector embedding
   - Performs similarity search to find relevant chunks
   - Returns formatted results with source information
   - Supports filtering by tags, status, and metadata

This pipeline enables efficient storage, processing, and retrieval of documentation with semantic understanding capabilities. All steps are tracked through the job system, allowing detailed progress monitoring and error handling.

## Project Structure

```
docmcp/
├── prisma/                  # Database schema and migrations
│   └── schema.prisma        # Prisma model definitions and database configuration
├── src/
│   ├── config/              # Application configuration
│   │   └── database.ts      # Database connection setup
│   ├── generated/           # Generated code (Prisma client)
│   ├── services/            # Core service modules
│   │   ├── crawler.service.ts     # Website crawling functionality
│   │   ├── document.service.ts    # Document management
│   │   ├── document-processor.service.ts # Document processing and transformation
│   │   ├── job.service.ts         # Async job management
│   │   ├── chunk.service.ts       # Document chunking and vector operations
│   │   └── mcp-tools/       # MCP integration tools
│   │       ├── add-documentation.tool.ts    # Tool for adding new documentation
│   │       ├── get-job-status.tool.ts       # Tool for checking job status
│   │       ├── list-documentation.tool.ts   # Tool for listing available documentation
│   │       ├── query-documentation.tool.ts  # Tool for querying documentation
│   │       ├── sample.tool.ts               # Example tool implementation
│   │       └── index.ts                     # Tool registry and exports
│   ├── types/               # TypeScript type definitions
│   │   └── mcp.ts           # MCP tool interface definitions
│   ├── utils/               # Utility functions
│   │   ├── logger.ts        # Logging utilities
│   │   └── prisma-filters.ts # Reusable Prisma filtering patterns
│   └── __tests__/           # Test files
│       └── utils/           # Test utilities
│           └── testDb.ts    # Test database setup and teardown
├── .env                     # Environment variables
└── package.json             # Project dependencies and scripts
```

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

## Listing Documentation

List available documentation with filtering options:

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"function": "list_documentation", "parameters": {"tags": ["react"], "status": "completed", "page": 1, "pageSize": 10}}'
```

## Available MCP Tools

The system provides the following MCP tools for integration with AI agents and external systems:

| Tool Name | Description | Example Parameters |
|-----------|-------------|-------------------|
| `add_documentation` | Add documentation from a URL for crawling and processing | `{"url": "https://example.com/docs", "maxDepth": 3, "tags": ["react"]}` |
| `list_documentation` | List available documentation with filtering options | `{"tags": ["react"], "status": "completed", "page": 1, "pageSize": 10}` |
| `query_documentation` | Search documentation using semantic vectors | `{"query": "How to authenticate users?", "maxResults": 5}` |
| `get_job_status` | Check the status of a documentation processing job | `{"jobId": "550e8400-e29b-41d4-a716-446655440000"}` |

All tools are accessible through the MCP endpoint at `POST /mcp` with the following format:

```json
{
  "function": "tool_name",
  "parameters": {
    // Tool-specific parameters
  }
}
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
