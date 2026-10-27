import { generatePaymentReference } from '../utils/idGenerator.js';

let defaultMockOutcome = 'SUCCESS'; // 'SUCCESS' | 'FAILURE'

/**
 * Mock Payment Gateway Service.
 * Simulates third-party payment processing (Stripe/Razorpay) with configurable outcomes.
 */
export const paymentGateway = {
  /**
   * Sets the global mock outcome for testing.
   * @param {'SUCCESS'|'FAILURE'} outcome
   */
  setMockOutcome(outcome) {
    defaultMockOutcome = outcome;
  },

  /**
   * Resets mock outcome to SUCCESS.
   */
  reset() {
    defaultMockOutcome = 'SUCCESS';
  },

  /**
   * Processes a payment attempt.
   *
   * @param {Object} params
   * @param {number} params.amount - Integer amount in paise
   * @param {string} params.currency - 'INR'
   * @param {string} params.paymentMethod - 'CARD', 'UPI', 'NET_BANKING', etc.
   * @param {string} params.reservationId
   * @param {string} params.guestId
   * @param {'SUCCESS'|'FAILURE'} [params.mockOutcome]
   * @returns {Promise<{ success: boolean, transactionId?: string, paidAt?: Date, errorCode?: string, errorMessage?: string }>}
   */
  async processPayment({
    amount,
    currency = 'INR',
    paymentMethod,
    reservationId,
    guestId,
    mockOutcome,
  }) {
    const outcome = mockOutcome || defaultMockOutcome;

    // Simulate payment processing delay
    await new Promise((resolve) => setTimeout(resolve, 10));

    if (outcome === 'FAILURE') {
      return {
        success: false,
        errorCode: 'PAYMENT_DECLINED',
        errorMessage: 'Payment transaction declined by payment provider or bank',
      };
    }

    return {
      success: true,
      transactionId: generatePaymentReference(),
      paidAt: new Date(),
      amount,
      currency,
      paymentMethod,
      reservationId,
      guestId,
    };
  },
};

export default paymentGateway;
