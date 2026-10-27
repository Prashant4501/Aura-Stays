import { BadRequestError } from '../errors/AppError.js';

/**
 * Zod validation middleware with strict whitelisting to prevent mass assignment attacks.
 * Unwhitelisted fields in request body/query/params are stripped or rejected.
 *
 * Rules enforced:
 * 1. Self-registration as ADMIN or PROPERTY_MANAGER is strictly blocked.
 * 2. On all routes, any role, user_id, or guest_id in request bodies are ignored & stripped.
 *
 * @param {Object} schemas
 * @param {import('zod').ZodSchema} [schemas.body]
 * @param {import('zod').ZodSchema} [schemas.query]
 * @param {import('zod').ZodSchema} [schemas.params]
 * @param {Object} [options]
 * @param {boolean} [options.isRegistration=false]
 */
export const validateRequest = (schemas, options = {}) => {
  return async (req, res, next) => {
    try {
      const isRegistration = options.isRegistration || req.originalUrl?.includes('/register');

      // Rule: Block self-registration as ADMIN or PROPERTY_MANAGER
      if (isRegistration) {
        const targetRole = req.body?.role ? String(req.body.role).toUpperCase() : null;
        if (targetRole === 'ADMIN' || targetRole === 'PROPERTY_MANAGER') {
          throw new BadRequestError(
            'Self-registration as ADMIN or PROPERTY_MANAGER is strictly forbidden',
            null,
            'FORBIDDEN_ROLE_REGISTRATION'
          );
        }
      }

      const schemaObj =
        schemas && typeof schemas.parseAsync === 'function' ? { body: schemas } : schemas;

      if (schemaObj.body) {
        // Strip unknown properties so only strictly whitelisted fields pass through
        const parsedBody = await schemaObj.body.parseAsync(req.body);

        // Explicit security barrier: Identity ALWAYS comes from the token, NEVER from bodies.
        // Ignore and strip any role, user_id, guest_id, etc.
        delete parsedBody.role;
        delete parsedBody.user_id;
        delete parsedBody.guest_id;
        delete parsedBody.guest_number;
        delete parsedBody.passwordHash;

        // Strip status for guests/unauthenticated to prevent self-approval/manipulation
        if (!options.allowStatus && (req.user?.role === 'GUEST' || !req.user)) {
          delete parsedBody.status;
        }

        req.body = parsedBody;
      }

      if (schemaObj.query) {
        req.query = await schemaObj.query.parseAsync(req.query);
      }

      if (schemaObj.params) {
        req.params = await schemaObj.params.parseAsync(req.params);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

export const validate = (schemas, options = {}) => {
  const schemaObj =
    schemas && typeof schemas.parseAsync === 'function' ? { body: schemas } : schemas;
  return validateRequest(schemaObj, { allowStatus: true, ...options });
};

export default validateRequest;
