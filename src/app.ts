import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import config from './config';
import logger from './utils/logger';
import healthRoutes from './routes/health';
import mcpRoutes from './routes/mcp';
import { errorHandler } from './middleware/errorHandler';

// Create Express app
const app = express();

// Apply security middleware
app.use(helmet());
app.use(cors({
  origin: config.security.corsOrigin,
}));

// Parse JSON bodies
app.use(express.json());

// Routes
app.use('/health', healthRoutes);
app.use('/mcp', mcpRoutes);

// Error handling - must be after routes
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  errorHandler(err, req, res, next);
});

// Start server
const startServer = () => {
  try {
    app.listen(config.server.port, () => {
      logger.info(`Server started in ${config.server.nodeEnv} mode on port ${config.server.port}`);
    });
  } catch (error) {
    logger.error('Error starting server:', error);
    process.exit(1);
  }
};

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled Rejection:', error);
  process.exit(1);
});

export { app, startServer }; 