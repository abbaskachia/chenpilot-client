import { describe, expect, it } from 'vitest';
import {
  TRANSACTION_TOAST_DEDUPE_WINDOW_MS,
  transactionStatusMessage,
  transactionToastId,
  transactionToastIdFromLabel,
} from './transactionToast';

describe('transactionToastId', () => {
  it('derives a stable id from the transaction hash', () => {
    expect(transactionToastId('ABC123')).toBe(transactionToastId('abc123'));
  });

  it('normalizes surrounding whitespace and casing', () => {
    expect(transactionToastId('  AbC123  ')).toBe('transaction-abc123');
  });

  it('gives different hashes different ids', () => {
    expect(transactionToastId('aaa111')).not.toBe(transactionToastId('bbb222'));
  });
});

describe('transactionToastIdFromLabel', () => {
  it('reuses an id for the same label inside the dedupe window', () => {
    expect(transactionToastIdFromLabel('Payment complete', 1000)).toBe(
      transactionToastIdFromLabel('Payment complete', TRANSACTION_TOAST_DEDUPE_WINDOW_MS - 1),
    );
  });

  it('allows the same label to be shown again after the dedupe window', () => {
    expect(transactionToastIdFromLabel('Payment complete', 1000)).not.toBe(
      transactionToastIdFromLabel('Payment complete', 7000),
    );
  });
});

describe('transactionStatusMessage', () => {
  it('never describes a pending transaction as complete', () => {
    const pending = transactionStatusMessage('pending', '10 XLM');
    expect(pending).not.toMatch(/confirmed|success|complete/i);
    expect(pending).toMatch(/awaiting confirmation/i);
  });

  it('describes confirmed and failed states explicitly', () => {
    expect(transactionStatusMessage('confirmed', '10 XLM')).toBe('10 XLM confirmed');
    expect(transactionStatusMessage('failed', '10 XLM')).toBe('10 XLM failed');
  });
});
