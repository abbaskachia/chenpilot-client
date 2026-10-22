import { describe, expect, it } from 'vitest';
import { isPaymentOutcomeUnknown, PaymentOutcomeUnknownError } from './paymentOutcome';

describe('payment outcome classification', () => {
  it('marks transport failures and server errors as uncertain for payment requests', () => {
    expect(isPaymentOutcomeUnknown({ config: { paymentOperation: true } })).toBe(true);
    expect(isPaymentOutcomeUnknown({ response: { status: 503 } })).toBe(true);
    expect(isPaymentOutcomeUnknown(new PaymentOutcomeUnknownError())).toBe(true);
  });

  it('does not mark a definitive client rejection as uncertain', () => {
    expect(isPaymentOutcomeUnknown({ response: { status: 400 } })).toBe(false);
    expect(isPaymentOutcomeUnknown({ response: { status: 429 } })).toBe(false);
  });
});
