import { describe, expect, it } from 'vitest';
import { buildPaymentIdempotencyKey } from './paymentIdempotency';

describe('buildPaymentIdempotencyKey', () => {
  it('reuses the same key for identical payment payloads', () => {
    const paymentA = {
      recipientAddress: 'GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890',
      amount: '25.50',
      tokenType: 'XLM',
      memo: 'rental',
      memoType: 'text' as const,
      recipientContactId: 'contact-123',
    };

    const paymentB = {
      recipientAddress: 'GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890',
      amount: '25.50',
      tokenType: 'XLM',
      memo: 'rental',
      memoType: 'text' as const,
      recipientContactId: 'contact-123',
    };

    expect(buildPaymentIdempotencyKey(paymentA)).toBe(buildPaymentIdempotencyKey(paymentB));
  });

  it('changes the key when the payment payload changes', () => {
    const paymentA = {
      recipientAddress: 'GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890',
      amount: '25.50',
      tokenType: 'XLM',
      memoType: 'none' as const,
      recipientContactId: 'contact-123',
    };

    const paymentB = {
      recipientAddress: 'GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890',
      amount: '26.50',
      tokenType: 'XLM',
      memoType: 'none' as const,
      recipientContactId: 'contact-123',
    };

    expect(buildPaymentIdempotencyKey(paymentA)).not.toBe(buildPaymentIdempotencyKey(paymentB));
  });
});
