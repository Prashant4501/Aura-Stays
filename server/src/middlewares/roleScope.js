import { NotFoundError } from '../errors/AppError.js';
import { Property } from '../models/index.js';

/**
 * Builds a query filter scoped strictly according to the authenticated user's role:
 * - GUEST: restricted to their own guest_id data
 * - PROPERTY_MANAGER: restricted to properties where manager_user_id equals their user_id
 * - ADMIN: unrestricted (returns empty filter {})
 *
 * @param {Object} user - req.user object { user_id, role, guest_id }
 * @param {Object} options
 * @param {string} [options.guestField='guest_id']
 * @param {string} [options.propertyField='property_id']
 * @param {boolean} [options.isPropertyModel=false]
 * @returns {Promise<Object>} MongoDB query filter object
 */
export const getRoleScope = async (user, options = {}) => {
  const {
    guestField = 'guest_id',
    propertyField = 'property_id',
    isPropertyModel = false,
  } = options;

  if (user.role === 'ADMIN') {
    return {};
  }

  if (user.role === 'GUEST') {
    if (!user.guest_id) {
      // Guest profile missing; prevent data leakage by matching no documents
      return { [guestField]: '__UNASSOCIATED__' };
    }
    return { [guestField]: user.guest_id };
  }

  if (user.role === 'PROPERTY_MANAGER') {
    if (isPropertyModel) {
      return { manager_user_id: user.user_id };
    }

    // Find all properties managed by this property manager
    const managedProperties = await Property.find(
      { manager_user_id: user.user_id },
      { property_id: 1 }
    ).lean();
    const managedPropertyIds = managedProperties.map((p) => p.property_id);

    return { [propertyField]: { $in: managedPropertyIds } };
  }

  // Any other role: match nothing by default
  return { _id: null };
};

/**
 * Validates ownership of an individual fetched resource against the authenticated user.
 * RULE: Returns 404 (NOT 403) when a guest attempts to access a resource owned by someone else,
 * preventing malicious resource enumeration / existence probing.
 *
 * @param {Object} resource - The document retrieved from database
 * @param {Object} user - req.user
 * @param {Object} options
 * @param {string} [options.resourceName='Resource']
 * @param {string} [options.guestField='guest_id']
 * @param {string} [options.propertyField='property_id']
 */
export const enforceResourceOwnership = async (resource, user, options = {}) => {
  const {
    resourceName = 'Resource',
    guestField = 'guest_id',
    propertyField = 'property_id',
  } = options;

  if (!resource) {
    throw new NotFoundError(`${resourceName} not found`);
  }

  if (user.role === 'ADMIN') {
    return resource;
  }

  if (user.role === 'GUEST') {
    const ownerGuestId = resource[guestField];
    if (!ownerGuestId || ownerGuestId !== user.guest_id) {
      // Return 404 NOT 403 to avoid disclosing resource existence
      throw new NotFoundError(`${resourceName} not found`);
    }
    return resource;
  }

  if (user.role === 'PROPERTY_MANAGER') {
    const propId = resource[propertyField] || (resource.property_id ? resource.property_id : null);
    if (!propId) {
      throw new NotFoundError(`${resourceName} not found`);
    }

    const isManager = await Property.exists({ property_id: propId, manager_user_id: user.user_id });
    if (!isManager) {
      // Return 404 NOT 403
      throw new NotFoundError(`${resourceName} not found`);
    }
    return resource;
  }

  throw new NotFoundError(`${resourceName} not found`);
};

/**
 * Returns array of property_ids managed by the user, or null if ADMIN (all properties).
 *
 * @param {Object} user - req.user
 * @returns {Promise<string[]|null>}
 */
export const getManagedPropertyIds = async (user) => {
  if (user.role === 'ADMIN') {
    return null; // all properties
  }
  if (user.role === 'PROPERTY_MANAGER') {
    const props = await Property.find({ manager_user_id: user.user_id }, { property_id: 1 }).lean();
    return props.map((p) => p.property_id);
  }
  return [];
};

/**
 * Asserts that the authenticated user has manager or admin rights over the given property_id.
 * Throws 404 NotFoundError if access denied to prevent resource enumeration.
 *
 * @param {string} propertyId
 * @param {Object} user - req.user
 */
export const assertCanManageProperty = async (propertyId, user) => {
  if (user.role === 'ADMIN') {
    return true;
  }
  if (user.role === 'PROPERTY_MANAGER') {
    const isManager = await Property.exists({
      property_id: propertyId,
      manager_user_id: user.user_id,
    });
    if (isManager) {
      return true;
    }
  }
  throw new NotFoundError('Property not found');
};

export default {
  getRoleScope,
  enforceResourceOwnership,
  getManagedPropertyIds,
  assertCanManageProperty,
};
