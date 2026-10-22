import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fetchTransactionConfirmation } from './transactionConfirmation';

const h = vi.hoisted(() => ({ horizonFetch: vi.fn() }));

vi.mock('@/utils/horizonFetch', () => ({ horizonFetch: h.horizonFetch }));

function response(status: number, body?: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe('fetchTransactionConfirmation', () => {
  beforeEach(() => {
    h.horizonFetch.mockReset();
  });

  it('reports pending (not an outcome) when the transaction is not yet in the ledger (404)', async () => {
    h.horizonFetch.mockResolvedValue(response(404));

    await expect(fetchTransactionConfirmation('abc')).resolves.toEqual({ status: 'pending' });
  });

  it('reports confirmed when Horizon reports a successful transaction', async () => {
    h.horizonFetch.mockResolvedValue(response(200, { successful: true, ledger: 42 }));

    await expect(fetchTransactionConfirmation('abc')).resolves.toEqual({
      status: 'confirmed',
      ledger: 42,
    });
  });

  it('reports failed when Horizon reports an unsuccessful transaction', async () => {
    h.horizonFetch.mockResolvedValue(response(200, { successful: false, ledger: 43 }));

    await expect(fetchTransactionConfirmation('abc')).resolves.toEqual({
      status: 'failed',
      ledger: 43,
    });
  });

  it('throws on a transient lookup error so the caller can keep the transaction pending', async () => {
    h.horizonFetch.mockResolvedValue(response(503));

    await expect(fetchTransactionConfirmation('abc')).rejects.toThrow(/503/);
  });

  it('throws on an unexpected payload instead of guessing an outcome', async () => {
    h.horizonFetch.mockResolvedValue(response(200, { nothing: 'useful' }));

    await expect(fetchTransactionConfirmation('abc')).rejects.toThrow(/unexpected payload/);
  });

  it('url-encodes the hash and requests the transaction resource', async () => {
    h.horizonFetch.mockResolvedValue(response(200, { successful: true, ledger: 1 }));

    await fetchTransactionConfirmation('AB/CD');

    expect(h.horizonFetch).toHaveBeenCalledWith(
      expect.stringContaining('/transactions/AB%2FCD'),
    );
  });
});
