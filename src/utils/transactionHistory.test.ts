import { describe, expect, it } from 'vitest';
import { StellarTransaction } from '@/types';
import {
  findTransactionByHash,
  mergeNewestTransactionHistory,
  mergeTransactionHistory,
  normalizeTransactionHash,
  reconcilePendingConfirmations,
} from './transactionHistory';

function tx(hash: string, successful = true, overrides: Partial<StellarTransaction> = {}): StellarTransaction {
  return {
    id: `id-${hash}`,
    hash,
    ledger: 100,
    created_at: '2026-01-01T00:00:00.000Z',
    source_account: 'GSOURCE',
    fee_charged: '100',
    operation_count: 1,
    successful,
    operations: [],
    ...overrides,
  };
}

describe('normalizeTransactionHash', () => {
  it('lowercases and trims usable hashes', () => {
    expect(normalizeTransactionHash('  ABC123  ')).toBe('abc123');
  });

  it('returns null for missing, blank, or non-string values', () => {
    expect(normalizeTransactionHash(undefined)).toBeNull();
    expect(normalizeTransactionHash(null)).toBeNull();
    expect(normalizeTransactionHash('')).toBeNull();
    expect(normalizeTransactionHash('   ')).toBeNull();
  });
});

describe('findTransactionByHash', () => {
  it('matches on the normalized hash', () => {
    const list = [tx('aaa'), tx('BBB')];
    expect(findTransactionByHash(list, '  bbb ')?.id).toBe('id-BBB');
  });

  it('returns undefined for a missing or unusable hash', () => {
    expect(findTransactionByHash([tx('aaa')], 'zzz')).toBeUndefined();
    expect(findTransactionByHash([tx('aaa')], '   ')).toBeUndefined();
  });
});

describe('mergeTransactionHistory', () => {
  it('inserts newly discovered transactions without dropping existing ones', () => {
    const existing = [tx('aaa'), tx('bbb')];
    const merged = mergeTransactionHistory(existing, [tx('ccc')]);

    expect(merged.map((t) => t.hash)).toEqual(['aaa', 'bbb', 'ccc']);
  });

  it('replaces an existing record (matched by hash) instead of duplicating it', () => {
    const existing = [tx('aaa', false, { ledger: 10 })];
    const merged = mergeTransactionHistory(existing, [tx('aaa', true, { ledger: 20 })]);

    expect(merged).toHaveLength(1);
    expect(merged[0].successful).toBe(true);
    expect(merged[0].ledger).toBe(20);
  });

  it('matches case-insensitively on the hash', () => {
    const existing = [tx('AAA111')];
    const merged = mergeTransactionHistory(existing, [tx('aaa111', false)]);

    expect(merged).toHaveLength(1);
    expect(merged[0].successful).toBe(false);
  });

  it('preserves older pages that are absent from the incoming newest page', () => {
    const olderPage = [tx('old-1'), tx('old-2')];
    const newestPage = [tx('new-1')];

    const afterRefresh = mergeTransactionHistory([...newestPage, ...olderPage], newestPage);

    expect(afterRefresh.map((t) => t.hash)).toEqual(['new-1', 'old-1', 'old-2']);
  });

  it('keeps records without a usable hash instead of collapsing them', () => {
    const missingHash = tx('', true, { id: 'no-hash-1' });
    const alsoMissing = tx('', true, { id: 'no-hash-2' });

    const merged = mergeTransactionHistory([missingHash], [alsoMissing]);

    expect(merged).toHaveLength(2);
    expect(merged.map((t) => t.id)).toEqual(['no-hash-1', 'no-hash-2']);
  });

  it('does not mutate either input array', () => {
    const existing = [tx('aaa')];
    const incoming = [tx('bbb')];

    mergeTransactionHistory(existing, incoming);

    expect(existing.map((t) => t.hash)).toEqual(['aaa']);
    expect(incoming.map((t) => t.hash)).toEqual(['bbb']);
  });
});

describe('mergeNewestTransactionHistory', () => {
  it('leads with the refreshed newest page and keeps older pages after it', () => {
    const existing = [tx('n-1'), tx('n-2'), tx('older-1'), tx('older-2')];
    const incoming = [tx('n-1'), tx('n-2'), tx('brand-new')];

    const merged = mergeNewestTransactionHistory(existing, incoming);

    expect(merged.map((t) => t.hash)).toEqual([
      'n-1',
      'n-2',
      'brand-new',
      'older-1',
      'older-2',
    ]);
  });

  it('replaces a known hash with the refreshed copy instead of duplicating it', () => {
    const existing = [tx('aaa', false, { ledger: 10 }), tx('older')];
    const incoming = [tx('aaa', true, { ledger: 20 })];

    const merged = mergeNewestTransactionHistory(existing, incoming);

    expect(merged).toHaveLength(2);
    expect(merged[0].hash).toBe('aaa');
    expect(merged[0].successful).toBe(true);
    expect(merged[0].ledger).toBe(20);
  });

  it('returns the existing history untouched when the newest page is empty', () => {
    const existing = [tx('aaa'), tx('bbb')];

    expect(mergeNewestTransactionHistory(existing, []).map((t) => t.hash)).toEqual(['aaa', 'bbb']);
  });

  it('deduplicates repeated hashes inside the incoming page', () => {
    const merged = mergeNewestTransactionHistory([], [tx('aaa', true), tx('aaa', false)]);

    expect(merged).toHaveLength(1);
    expect(merged[0].successful).toBe(true);
  });

  it('does not mutate either input array', () => {
    const existing = [tx('aaa')];
    const incoming = [tx('bbb')];

    mergeNewestTransactionHistory(existing, incoming);

    expect(existing.map((t) => t.hash)).toEqual(['aaa']);
    expect(incoming.map((t) => t.hash)).toEqual(['bbb']);
  });
});

describe('reconcilePendingConfirmations', () => {
  const pending = (hash: string, status: 'pending' | 'confirmed' | 'failed' = 'pending') => ({
    hash,
    label: 'Payment',
    status,
    updatedAt: '2026-01-01T00:00:00.000Z',
  });

  it('confirms a pending entry when authoritative data reports success', () => {
    const result = reconcilePendingConfirmations([pending('aaa')], [tx('aaa', true)], '2026-01-02T00:00:00.000Z');

    expect(result[0].status).toBe('confirmed');
    expect(result[0].updatedAt).toBe('2026-01-02T00:00:00.000Z');
  });

  it('marks a pending entry failed when authoritative data reports failure', () => {
    const result = reconcilePendingConfirmations([pending('aaa')], [tx('aaa', false)], '2026-01-02T00:00:00.000Z');

    expect(result[0].status).toBe('failed');
  });

  it('leaves entries pending when the authoritative page does not include them', () => {
    const result = reconcilePendingConfirmations([pending('zzz')], [tx('aaa')], '2026-01-02T00:00:00.000Z');

    expect(result[0].status).toBe('pending');
  });

  it('never regresses an already resolved entry', () => {
    const result = reconcilePendingConfirmations(
      [pending('aaa', 'confirmed')],
      [tx('aaa', false)],
      '2026-01-02T00:00:00.000Z',
    );

    expect(result[0].status).toBe('confirmed');
  });

  it('returns the original list when there is nothing to reconcile against', () => {
    const list = [pending('aaa')];
    expect(reconcilePendingConfirmations(list, [], '2026-01-02T00:00:00.000Z')).toBe(list);
  });
});
