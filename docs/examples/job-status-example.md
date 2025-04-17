# Job Status Tool Usage Example

The `get_job_status` tool provides detailed information about the status and progress of documentation indexing jobs. Here's how to use it:

## Basic Usage

To get information about a job, use the tool with the job ID:

```javascript
// Example of calling the get_job_status tool
const result = await callMCPTool('get_job_status', {
  jobId: '12345678-1234-1234-1234-123456789012'
});

console.log(result);
```

## Response Format

The tool returns a detailed response with the following information:

```javascript
{
  // Basic Information
  "id": "12345678-1234-1234-1234-123456789012",
  "type": "crawl",
  "stage": "processing",
  "status": "running",
  "progress": 0.75,
  "progressPercentage": 75,
  "url": "https://example.com/docs",
  "name": "Example Documentation",
  "tags": ["example", "docs"],
  
  // Timing Information
  "startDate": "2025-04-17T00:00:00Z",
  "endDate": null,
  "timeElapsed": 3600,
  "timeRemaining": 1200,
  "estimatedCompletion": "2025-04-17T01:00:00Z",
  "lastActivity": "2025-04-17T00:30:00Z",
  "duration": 3600,
  "formattedDuration": "1 hour, 0 minutes",
  "formattedTimeElapsed": "1 hour, 0 minutes",
  "formattedTimeRemaining": "20 minutes, 0 seconds",
  
  // Error Information (if applicable)
  "error": null,
  "errorCount": 0,
  "lastError": null,
  
  // Statistics
  "stats": {
    "pagesProcessed": 15,
    "pagesSkipped": 2,
    "totalChunks": 30,
    "documentsCount": 15,
    "itemsTotal": 20,
    "itemsProcessed": 15,
    "itemsFailed": 0,
    "itemsSkipped": 2
  },
  
  // Human-readable Status & Actions
  "statusMessage": "Job is running (processing stage) at 75% completion. Running for 1 hour, 0 minutes. Estimated time remaining: 20 minutes, 0 seconds",
  "actionableCommands": [
    "Cancel job: Use 'cancel_job' tool with jobId: \"12345678-1234-1234-1234-123456789012\"",
    "Pause job: Use 'pause_job' tool with jobId: \"12345678-1234-1234-1234-123456789012\""
  ],
  
  // Job Control Options
  "canCancel": true,
  "canPause": true,
  "canResume": false
}
```

## Status Messages

The tool provides human-readable status messages based on the job state:

1. **Pending**: "Job is queued and waiting to start."

2. **Running**: "Job is running (processing stage) at 75% completion. Running for 1 hour, 0 minutes. Estimated time remaining: 20 minutes, 0 seconds"

3. **Completed**: "Job completed successfully (100%) in 1 hour, 30 minutes."

4. **Failed**: "Job failed: Network error. Ran for 45 minutes, 30 seconds before failure."

5. **Cancelled**: "Job was cancelled: User requested cancellation. Ran for 20 minutes, 15 seconds before cancellation."

6. **Paused**: "Job is paused at 50% completion. Total run time so far: 30 minutes, 0 seconds."

## Error Handling

The tool handles various error cases:

- **Job Not Found**: Returns an error if the job ID doesn't exist
- **Invalid ID Format**: Returns an error if the job ID is invalid
- **Database Errors**: Handles database connection issues gracefully

## Example Usage in UI

```javascript
// Example of displaying job status in a UI
function JobStatusComponent({ jobId }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchStatus() {
      try {
        const result = await callMCPTool('get_job_status', { jobId });
        setStatus(result);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    const intervalId = setInterval(fetchStatus, 5000); // Update every 5 seconds
    fetchStatus(); // Initial fetch

    return () => clearInterval(intervalId);
  }, [jobId]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} />;

  return (
    <div className="job-status">
      <h2>{status.name || 'Documentation Job'}</h2>
      <ProgressBar percentage={status.progressPercentage} />
      <StatusMessage message={status.statusMessage} />
      
      {status.canCancel && <Button onClick={() => cancelJob(jobId)}>Cancel Job</Button>}
      {status.canPause && <Button onClick={() => pauseJob(jobId)}>Pause Job</Button>}
      {status.canResume && <Button onClick={() => resumeJob(jobId)}>Resume Job</Button>}
      
      <JobStats stats={status.stats} />
    </div>
  );
}
``` 