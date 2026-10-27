import app from './app.js';
import { connectDB } from './config/db.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { startExpirationJob, stopExpirationJob } from './services/expirationService.js';

const startServer = async () => {
  try {
    await connectDB();

    // Start background reservation expiration cleaner
    startExpirationJob(60000);

    const server = app.listen(env.PORT, () => {
      logger.info(`🚀 Server running in ${env.NODE_ENV} mode on port ${env.PORT}`);
    });

    const shutdown = async (signal) => {
      logger.info(`${signal} signal received: closing HTTP server...`);
      stopExpirationJob();
      server.close(async () => {
        logger.info('HTTP server closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error({ err: error }, 'Failed to start server');
    process.exit(1);
  }
};

startServer();
