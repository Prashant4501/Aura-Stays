/**
 * Currency utilities for handling money in paise (integers).
 * 1 Rupee = 100 paise.
 * All monetary amounts in database are stored as integer paise to prevent floating-point rounding errors.
 */

/**
 * Converts rupees (float or integer) to integer paise.
 * e.g., 3000.00 -> 300000, 15.50 -> 1550
 * @param {number|string} rupees
 * @returns {number} Integer paise
 */
export const toPaise = (rupees) => {
  if (rupees === null || rupees === undefined || isNaN(Number(rupees))) {
    return 0;
  }
  return Math.round(Number(rupees) * 100);
};

/**
 * Converts integer paise to rupees (float rounded to 2 decimal places).
 * e.g., 300000 -> 3000.00, 1550 -> 15.50
 * @param {number|string} paise
 * @returns {number} Rupee value with 2 decimal precision
 */
export const toRupees = (paise) => {
  if (paise === null || paise === undefined || isNaN(Number(paise))) {
    return 0;
  }
  return Number((Number(paise) / 100).toFixed(2));
};

/**
 * Formats integer paise into standard Indian Rupee string (e.g., "₹3,000.00").
 * @param {number} paise
 * @returns {string}
 */
export const formatINR = (paise) => {
  const rupees = toRupees(paise);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(rupees);
};
