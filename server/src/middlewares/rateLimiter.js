import rateLimit from 'express-rate-limit';

/**
 * Dedicated Rate Limiter for Authentication Endpoints.
 * Mitigates brute-force credential stuffing and registration spam.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 requests per windowMs per IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many authentication attempts. Please try again in 15 minutes.',
        details: null,
      },
    });
  },
});

export default authRateLimiter;
