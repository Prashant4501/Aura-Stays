import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { requestIdMiddleware } from './middlewares/requestId.js';
import { errorHandler } from './middlewares/errorHandler.js';
import apiV1Router from './routes/index.js';

const app = express();

// Trust reverse proxy (for Render, Heroku, etc.)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());

// CORS configuration
app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
  })
);

// Request ID propagation
app.use(requestIdMiddleware);

// Body and Cookie parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Request logging middleware with request ID
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info({
      requestId: req.id,
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
    });
  });
  next();
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: dbStatus,
  });
});

// Mount API v1 router
app.use('/api/v1', apiV1Router);

// 404 Handler for undefined routes (matches consistent error structure)
app.use((req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Cannot ${req.method} ${req.originalUrl}`,
      details: null,
    },
  });
});

// Centralized error handler
app.use(errorHandler);

export default app;
