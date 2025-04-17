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

## Getting Started (Docker Recommended)

Using Docker and Docker Compose is the easiest and recommended way to get DocMCP and its dependencies (PostgreSQL + pgvector) running locally for development and testing with AI agents like Cursor.

### Prerequisites (Docker Setup)

- Docker ([Install Guide](https://docs.docker.com/engine/install/))
- Docker Compose ([Install Guide](https://docs.docker.com/compose/install/))
- Git
- An accessible Ollama API instance (e.g., running locally on your host machine)

### Quick Start Steps (Docker)

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/yourusername/docmcp.git
    cd docmcp
    ```

2.  **Configure Environment:**
    *   Copy the example environment file:
        ```bash
        cp .env.example .env
        ```
    *   **Edit the `.env` file:**
        *   Verify `DATABASE_URL`. The default usually works with the included Docker Compose PostgreSQL service.
        *   **Crucially, set `OLLAMA_API_URL`** to the URL of your running Ollama instance. If Ollama is running on your host machine, you might use `http://host.docker.internal:11434` (on Docker Desktop for Mac/Windows) or the host's IP address. Ensure this URL is accessible *from within the Docker container*.
        *   Adjust other settings like `LOG_LEVEL` if needed.

3.  **Start the Application:**
    ```bash
    ./docker-start.sh 
    ```
    This script handles:
    *   Creating necessary directories.
    *   Setting file permissions.
    *   Building the Docker images (if not already built).
    *   Starting the `app` and `postgres` containers.
    *   **Automatically applying Prisma database migrations** within the `app` container upon startup.
    *   Displaying the application's base URL (usually `http://localhost:1337`).

4.  **Verify Services:**
    *   Check Docker Desktop or run `docker ps` to see the `docmcp-app` and `docmcp-postgres` containers running.
    *   Check logs (`docker-compose logs -f app`) for any startup errors, especially related to database connection or migrations.

5.  **(First Time Setup) Verify Seed Data:**
    *   DocMCP includes seed data for common packages.
    *   The `DocumentationMapperService` automatically seeds this data the first time it starts if the database is empty.
    *   Check application logs (`docker-compose logs -f app`) for seeding messages to confirm.
    *   This ensures some documentation is available immediately.

6.  **Stop the Application:**
    ```bash
    ./docker-stop.sh
    ```

Now that the service is running, you can proceed to integrate it with your AI agent (see "Integrating with AI Agents" section below) or explore other features.

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

## Integrating with AI Agents (like Cursor)

Once the DocMCP service is running via Docker (using `./docker-start.sh`), the MCP API endpoint is ready for integration.

**Endpoint:**

*   The default API endpoint exposed by the Docker setup is: `http://localhost:1337/mcp`

**Usage:**

1.  **Start DocMCP:** Ensure the Docker containers are running (`./docker-start.sh`).
2.  **Verify Ollama Access:** Confirm that your Ollama instance (specified in `.env`) is running and accessible from the DocMCP Docker container. Test this if unsure.
3.  **Configure Agent:** Configure your AI agent (like Cursor) to use `http://localhost:1337/mcp` as the base URL for accessing DocMCP's tools.
4.  **Use Tools:** The agent can now make POST requests to this endpoint to call the available MCP tools (e.g., `add_documentation`, `query_documentation`, `list_documentation`, `get_job_status`) as described below.

**Note:** If your agent is running outside the Docker network, `localhost` should work if the agent is on the same host machine. If the agent is elsewhere, use the host machine's IP address and ensure firewalls permit access to port 1337.

## Adding Documentation

Add documentation by providing a URL:

```bash
curl -X POST http://localhost:1337/mcp \
  -H "Content-Type: application/json" \
  -d '{"function": "add_documentation", "parameters": {"url": "https://example.com/docs", "maxDepth": 3}}'
```

## Querying Documentation

Query your documentation using natural language:

```bash
curl -X POST http://localhost:1337/mcp \
  -H "Content-Type: application/json" \
  -d '{"function": "query_documentation", "parameters": {"query": "How do I authenticate users?"}}'
```

## Listing Documentation

List available documentation with filtering options:

```bash
curl -X POST http://localhost:1337/mcp \
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

## Context-Aware Documentation Queries

The `query_documentation` MCP tool offers enhanced functionality by incorporating code context to deliver more relevant and targeted documentation results.

### How It Works

1.  **Context Input:** The tool accepts an optional `context` parameter containing a code snippet (e.g., the code currently being edited).
2.  **Analysis:** The backend `CodeContextService` parses this snippet using utilities in `src/utils/code-parser.ts` to:
    *   Detect imported packages/libraries (e.g., `react`, `prisma`).
    *   Identify key identifiers (function names, class names) within the code.
3.  **Mapping & Enhancement:**
    *   It looks up potentially relevant documentation associated with the detected packages using the `DocumentationMapperService`.
    *   It may generate an "enhanced query" string that refines the original user query with terms related to the detected packages and identifiers.
4.  **Search & Boosting:**
    *   The system performs a semantic search using the (potentially enhanced) query embedding generated via Ollama.
    *   Search results (chunks) originating from documents deemed relevant by the context analysis receive a relevance score boost.
5.  **Output:** The tool returns:
    *   Standard documentation results, sorted by relevance (incorporating context boost).
    *   A `summary` section detailing the context analysis performed (detected packages, if the query was enhanced).
    *   Potentially, direct `packageSuggestions` for documentation specifically related to the detected packages.

### Using the Feature

To leverage context-awareness when calling the `query_documentation` MCP tool:

*   Provide the relevant code snippet as a string in the `context` parameter.
*   The system will automatically attempt package detection and query enhancement.
*   You can still use the `package` parameter to *force* filtering by a specific package if needed, overriding the context-based filter.

Example MCP Call:

```json
{
  "function": "query_documentation",
  "parameters": {
    "query": "how to handle async effects",
    "context": "import React, { useState, useEffect } from 'react';\n\nfunction MyComponent() {\n  const [data, setData] = useState(null);\n  useEffect(() => {\n    async function fetchData() {\n      const response = await fetch('/api/data');\n      const result = await response.json();\n      setData(result);\n    }\n    fetchData();\n  }, []);\n\n  return <div>{data ? JSON.stringify(data) : 'Loading...'}</div>;\n}"
  }
}
```

### Extending the System

Developers can modify or extend the context-aware functionality:

*   **Code Parsing:** Enhance language support or improve parsing accuracy in `src/utils/code-parser.ts`.
*   **Context Analysis Logic:** Adjust how packages are detected, relevant documents are identified, or how the enhanced query is constructed within `src/services/code-context.service.ts`.
*   **Relevance Tuning:** Modify the scoring adjustments (e.g., the boost applied for contextually relevant documents) within the `queryDocumentationHandler` in `src/services/mcp-tools/query-documentation.tool.ts`.
*   **Package Mapping:** Improve the underlying data connecting packages to their documentation via the `DocumentationMapperService` and associated Prisma models.

## Manual Setup (Without Docker - Not Recommended for MCP Usage)

If you prefer not to use Docker, you can run the application manually.

### Prerequisites (Manual Setup)

- Node.js 16+
- PostgreSQL with pgvector extension (must be installed and running separately)
- Ollama API accessible for vector embeddings

### Installation Steps (Manual)

```bash
# Clone the repository
git clone https://github.com/yourusername/docmcp.git
cd docmcp

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# EDIT .env with your configuration (DATABASE_URL, OLLAMA_API_URL, etc.)

# Ensure your PostgreSQL + pgvector DB is running and accessible
# Ensure your Ollama service is running and accessible

# Run database migrations
npx prisma migrate deploy
```

### Usage (Manual)

Start the server:

```bash
npm run dev
```

Note: The seed data will also attempt to run automatically on the first start with a manual setup if the database is empty.

## Docker Configuration Details 

The Docker setup includes:

- **Application Container**: Node.js application running the DocMCP server
- **PostgreSQL Container**: Database with pgvector extension for vector operations
- **Persistent Volumes**: Data is preserved between container restarts
- **Health Checks**: Automatic monitoring of service health
- **Environment Variables**: Configured in docker-compose.yml

To customize the configuration, edit the following files:

- `docker-compose.yml`: Container setup and environment variables
- `.env`: Application configuration (create from .env.example)
- `Dockerfile`: Application build process

### Accessing Logs

View logs for all services:
```bash
docker-compose logs -f
```

View logs for a specific service:
```bash
docker-compose logs -f app
# or
docker-compose logs -f postgres
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
