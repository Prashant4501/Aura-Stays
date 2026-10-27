import crypto from 'crypto';

/**
 * Request ID middleware.
 * Generates or propagates unique request IDs for distributed tracing and logging.
 */
export const requestIdMiddleware = (req, res, next) => {
  const existingId = req.headers['x-request-id'];
  const requestId = (typeof existingId === 'string' && existingId.trim()) || crypto.randomUUID();

  req.id = requestId;
  res.setHeader('x-request-id', requestId);
  next();
};

export default requestIdMiddleware;
