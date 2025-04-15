import { Router } from 'express';
import logger from '../utils/logger';

const router = Router();

router.get('/', (req, res) => {
  logger.debug('Health check request received');
  res.status(200).json({
    status: 'success',
    message: 'Server is healthy',
    timestamp: new Date().toISOString(),
  });
});

export default router; 