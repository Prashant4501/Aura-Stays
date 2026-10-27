import { ZodError } from 'zod';
import { AppError } from '../errors/AppError.js';
import { logger } from '../utils/logger.js';

/**
 * Central Error Handling Middleware.
 * Enforces standardized error response: { error: { code, message, details } }
 */
export const errorHandler = (err, req, res, _next) => {
  const requestId = req.id || 'unknown';

  // 1. AppError instances
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ err, requestId }, `[${requestId}] Operational server error: ${err.message}`);
    } else {
      logger.warn(
        { err: err.message, code: err.code, requestId },
        `[${requestId}] Client error: ${err.message}`
      );
    }

    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details || null,
      },
    });
  }

  // 2. Zod Validation Errors
  if (err instanceof ZodError) {
    const formattedDetails = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));

    logger.warn({ details: formattedDetails, requestId }, `[${requestId}] Validation error`);

    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: formattedDetails,
      },
    });
  }

  // 3. JWT Errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or malformed authentication token',
        details: null,
      },
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: {
        code: 'TOKEN_EXPIRED',
        message: 'Authentication token has expired',
        details: null,
      },
    });
  }

  // 4. Mongo Duplicate Key Error (E11000)
  const isDuplicateKey =
    err.code === 11000 ||
    err.errorResponse?.code === 11000 ||
    err.cause?.code === 11000 ||
    (typeof err.message === 'string' && err.message.includes('E11000'));

  if (isDuplicateKey) {
    const isInventoryDuplicate =
      err.message?.includes('inventories') ||
      err.keyPattern?.room_id !== undefined ||
      err.keyValue?.room_id !== undefined ||
      err.errorResponse?.keyPattern?.room_id !== undefined;

    if (isInventoryDuplicate) {
      return res.status(409).json({
        error: {
          code: 'ROOM_ALREADY_BOOKED',
          message:
            'The requested room is already reserved for one or more of the selected dates. Please choose different dates or rooms.',
          details: err.keyValue || err.errorResponse?.keyValue || null,
        },
      });
    }

    const keyPattern = err.keyPattern || err.errorResponse?.keyPattern || {};
    const fields = Object.keys(keyPattern);
    const fieldName = fields[0] || 'resource';
    return res.status(409).json({
      error: {
        code: 'CONFLICT',
        message: `A record with this ${fieldName} already exists`,
        details: err.keyValue || err.errorResponse?.keyValue || null,
      },
    });
  }

  // 5. Unhandled / Unexpected Errors
  logger.error(
    { err, requestId },
    `[${requestId}] Unhandled internal server error: ${err.message}`
  );

  return res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
      details: null,
    },
  });
};

export default errorHandler;
