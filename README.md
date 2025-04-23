# DocMCP: Documentation Management and Processing System

A powerful system for crawling, processing, and querying documentation with AI-powered embedding generation and semantic search capabilities.

## Features

- **Documentation Crawling**: Automatically crawl documentation sites with customizable depth and rate limiting
- **Content Processing**: Convert HTML to clean Markdown with metadata extraction
- **Vector Embeddings**: Generate embeddings using AWS Bedrock for semantic searching
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
   - Generates vector embeddings using AWS Bedrock
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

## Getting Started (Development Setup)

### Prerequisites

- Docker ([Install Guide](https://docs.docker.com/engine/install/))
- Docker Compose ([Install Guide](https://docs.docker.com/compose/install/))
- Node.js 16+
- Git
- AWS Account with Bedrock access
- AWS CLI configured with appropriate credentials

### Quick Start Steps

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/visheshd/docmcp.git
    cd docmcp
    ```

2.  **Configure Environment:**
    *   Copy the example environment file:
        ```bash
        cp .env.example .env
        ```
    *   **Edit the `.env` file:**
        *   Set `DATABASE_URL` to `postgresql://postgres:postgres@localhost:5433/docmcp`
        *   **Configure AWS Bedrock:**
            *   Set `AWS_REGION` to your AWS region (e.g., `us-east-1`)
            *   Set `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` with your AWS credentials
            *   Or ensure your AWS CLI is configured with appropriate credentials
        *   Adjust other settings like `LOG_LEVEL` if needed

3.  **Start the Development Environment:**
    ```bash
    # Make the script executable
    chmod +x dev-start.sh
    
    # Start the development environment
    ./dev-start.sh
    ```
    This script will:
    * Start PostgreSQL with pgvector in a Docker container
    * Install project dependencies
    * Run database migrations
    * Import seed data automatically
    * The database will be accessible on port 5433

4.  **Add Documentation:**
    Use the `add-docs` script to crawl and process documentation:
    ```bash
    # Basic usage
    npm run add-docs -- --url https://example.com/docs --max-depth 3

    # With additional options
    npm run add-docs -- \
      --url https://example.com/docs \
      --max-depth 3 \
      --tags react,frontend \
      --package react \
      --version 18.0.0 \
      --wait
    ```

    Available options:
    - `--url`: Documentation URL to crawl (required)
    - `--max-depth`: Maximum crawl depth (default: 3)
    - `--tags`: Comma-separated tags for categorization
    - `--package`: Package name this documentation is for
    - `--version`: Package version (defaults to "latest")
    - `--wait`: Wait for processing to complete
    - `--verbose`: Enable detailed logging
    - See `npm run add-docs -- --help` for all options

5.  **Query Documentation:**
    Once documentation is added, you can query it using the MCP tools. See the "Querying Documentation" section below.

6.  **Stop the Development Environment:**
    ```bash
    docker-compose -f docker-compose.dev.yml down
    ```

This setup provides a lightweight development environment with just the required PostgreSQL database and pre-loaded seed data. For production deployments or if you prefer a fully containerized setup, see the "Production Docker Setup" section below.

## Cursor Setup

To use DocMCP with Cursor IDE, you'll need to configure the MCP transport. Add the following configuration to your Cursor settings:

```json
{
    "docmcp-local-stdio": {
      "transport": "stdio",
      "command": "node",
      "args": [
        "<DOCMCP_DIR>/dist/stdio-server.js"
      ],
      "clientInfo": {
        "name": "cursor-client",
        "version": "1.0.0"
      }
    }
}
```

Replace `<DOCMCP_DIR>` with the absolute path to your DocMCP installation directory.

For example, if DocMCP is installed in `/home/user/projects/docmcp`, your configuration would be:
```json
"args": ["/home/user/projects/docmcp/dist/stdio-server.js"]
```

After adding this configuration, restart Cursor for the changes to take effect.

## Usage



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
