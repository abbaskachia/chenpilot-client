import { describe, expect, it, vi, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import accountReducer, {
  TRANSACTION_HISTORY_PAGE_SIZE,
  getOlderTransactionHistory,
  getTransactionHistory,
  refreshTransactionHistory,
  resolvePendingTransaction,
  trackPendingTransaction,
} from './accountSlice';

const h = vi.hoisted(() => ({ horizonFetch: vi.fn() }));

vi.mock('@/utils/horizonFetch', () => ({ horizonFetch: h.horizonFetch }));

vi.mock('@/services/api', () => ({
  default: { getAccountTransactions: vi.fn(), setStore: vi.fn() },
}));

const horizonFetchMock = h.horizonFetch;

const PUBLIC_KEY = 'GPUBLICKEY';

function horizonRecord(hash: string, successful = true, extra: Record<string, unknown> = {}) {
  return {
    id: `id-${hash}`,
    hash,
    ledger: 10,
    created_at: '2026-01-01T00:00:00.000Z',
    source_account: 'GSOURCE',
    fee_charged: '100',
    operation_count: 1,
    successful,
    paging_token: `token-${hash}`,
    _embedded: { records: [] },
    ...extra,
  };
}

function pageResponse(records: Record<string, unknown>[], status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({
      _embedded: { records },
    }),
  };
}

function createStore() {
  return configureStore({ reducer: { account: accountReducer } });
}

function fullPage(prefix: string) {
  return Array.from({ length: TRANSACTION_HISTORY_PAGE_SIZE }, (_, index) =>
    horizonRecord(`${prefix}-${index}`),
  );
}

describe('accountSlice — transaction history refresh (#238)', () => {
  beforeEach(() => {
    horizonFetchMock.mockReset();
  });

  it('loads the newest page on initial fetch and exposes a cursor for older pages', async () => {
    horizonFetchMock.mockResolvedValue(pageResponse(fullPage('first')));
    const store = createStore();

    await store.dispatch(getTransactionHistory(PUBLIC_KEY));

    const history = store.getState().account.transactions;
    expect(history.transactions).toHaveLength(TRANSACTION_HISTORY_PAGE_SIZE);
    expect(history.nextCursor).toBe(`token-first-${TRANSACTION_HISTORY_PAGE_SIZE - 1}`);
    expect(history.lastUpdatedAt).not.toBeNull();
    expect(history.error).toBeNull();
  });

  it('refreshes only the newest page (no cursor is sent)', async () => {
    horizonFetchMock.mockResolvedValue(pageResponse(fullPage('first')));
    const store = createStore();
    await store.dispatch(getTransactionHistory(PUBLIC_KEY));

    horizonFetchMock.mockClear();
    horizonFetchMock.mockResolvedValue(pageResponse([horizonRecord('newest')]));
    await store.dispatch(refreshTransactionHistory(PUBLIC_KEY));

    expect(horizonFetchMock).toHaveBeenCalledTimes(1);
    expect(horizonFetchMock.mock.calls[0][0]).not.toContain('cursor=');
  });

  it('merges refreshed transactions by hash: new rows are added and matches are updated', async () => {
    horizonFetchMock.mockResolvedValue(
      pageResponse([horizonRecord('alpha', true, { ledger: 10 }), horizonRecord('beta')]),
    );
    const store = createStore();
    await store.dispatch(getTransactionHistory(PUBLIC_KEY));

    horizonFetchMock.mockResolvedValue(
      pageResponse([horizonRecord('alpha', false, { ledger: 99 }), horizonRecord('gamma')]),
    );
    await store.dispatch(refreshTransactionHistory(PUBLIC_KEY));

    const transactions = store.getState().account.transactions.transactions;
    // The refreshed newest page leads; the older record it did not mention survives.
    expect(transactions.map((tx) => tx.hash)).toEqual(['alpha', 'gamma', 'beta']);
    expect(transactions[0].ledger).toBe(99);
    expect(transactions[0].successful).toBe(false);
  });

  it('preserves previously loaded older pages and pagination state across a refresh', async () => {
    horizonFetchMock.mockResolvedValue(pageResponse(fullPage('first')));
    const store = createStore();
    await store.dispatch(getTransactionHistory(PUBLIC_KEY));

    const cursorBefore = store.getState().account.transactions.nextCursor;

    horizonFetchMock.mockResolvedValue(pageResponse([horizonRecord('brand-new')]));
    await store.dispatch(refreshTransactionHistory(PUBLIC_KEY));

    const history = store.getState().account.transactions;
    expect(history.transactions).toHaveLength(TRANSACTION_HISTORY_PAGE_SIZE + 1);
    expect(history.transactions[0].hash).toBe('brand-new');
    expect(history.nextCursor).toBe(cursorBefore);
  });

  it('adopts a cursor on refresh only when no history existed yet', async () => {
    horizonFetchMock.mockResolvedValue(pageResponse(fullPage('only')));
    const store = createStore();

    await store.dispatch(refreshTransactionHistory(PUBLIC_KEY));

    expect(store.getState().account.transactions.nextCursor).toBe(
      `token-only-${TRANSACTION_HISTORY_PAGE_SIZE - 1}`,
    );
  });

  it('sets isRefreshing while in flight and clears it on success', async () => {
    const store = createStore();
    let resolveFetch!: (value: unknown) => void;
    horizonFetchMock.mockImplementation(
      () => new Promise((resolve) => { resolveFetch = resolve; }),
    );

    const pending = store.dispatch(refreshTransactionHistory(PUBLIC_KEY));

    expect(store.getState().account.transactions.isRefreshing).toBe(true);

    resolveFetch(pageResponse([horizonRecord('done')]));
    await pending;

    expect(store.getState().account.transactions.isRefreshing).toBe(false);
  });

  it('surfaces refresh errors without clearing valid history or advancing lastUpdatedAt', async () => {
    horizonFetchMock.mockResolvedValue(pageResponse([horizonRecord('kept')]));
    const store = createStore();
    await store.dispatch(getTransactionHistory(PUBLIC_KEY));

    const { lastUpdatedAt, transactions } = store.getState().account.transactions;

    horizonFetchMock.mockResolvedValue(pageResponse([], 500));
    await store.dispatch(refreshTransactionHistory(PUBLIC_KEY));

    const history = store.getState().account.transactions;
    expect(history.refreshError).toBeTruthy();
    expect(history.isRefreshing).toBe(false);
    expect(history.transactions).toEqual(transactions);
    expect(history.lastUpdatedAt).toBe(lastUpdatedAt);
    expect(history.error).toBeNull();
  });

  it('clears a previous refresh error after a successful retry', async () => {
    const store = createStore();
    horizonFetchMock.mockResolvedValue(pageResponse([], 500));
    await store.dispatch(refreshTransactionHistory(PUBLIC_KEY));
    expect(store.getState().account.transactions.refreshError).toBeTruthy();

    horizonFetchMock.mockResolvedValue(pageResponse([horizonRecord('recovered')]));
    await store.dispatch(refreshTransactionHistory(PUBLIC_KEY));

    const history = store.getState().account.transactions;
    expect(history.refreshError).toBeNull();
    expect(history.transactions.map((tx) => tx.hash)).toEqual(['recovered']);
  });

  it('keeps history empty (no crash) when refreshing an empty history', async () => {
    horizonFetchMock.mockResolvedValue(pageResponse([]));
    const store = createStore();

    await store.dispatch(refreshTransactionHistory(PUBLIC_KEY));

    const history = store.getState().account.transactions;
    expect(history.transactions).toEqual([]);
    expect(history.nextCursor).toBeNull();
    expect(history.refreshError).toBeNull();
  });

  it('appends an older page and advances the cursor when loading more', async () => {
    horizonFetchMock.mockResolvedValue(pageResponse(fullPage('first')));
    const store = createStore();
    await store.dispatch(getTransactionHistory(PUBLIC_KEY));

    const cursor = store.getState().account.transactions.nextCursor!;
    horizonFetchMock.mockResolvedValue(pageResponse(fullPage('second')));
    await store.dispatch(getOlderTransactionHistory({ publicKey: PUBLIC_KEY, cursor }));

    const history = store.getState().account.transactions;
    expect(history.transactions).toHaveLength(TRANSACTION_HISTORY_PAGE_SIZE * 2);
    expect(horizonFetchMock.mock.calls[1][0]).toContain(`cursor=${cursor}`);
    expect(history.isLoadingMore).toBe(false);
    expect(history.loadMoreError).toBeNull();
  });
});

describe('accountSlice — pending confirmation lifecycle (#235)', () => {
  beforeEach(() => {
    horizonFetchMock.mockReset();
  });

  it('tracks a submitted transaction as pending', () => {
    const store = createStore();

    store.dispatch(
      trackPendingTransaction({ hash: 'abc', label: '10 XLM', at: '2026-01-01T00:00:00.000Z' }),
    );

    const pending = store.getState().account.transactions.pending;
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ hash: 'abc', status: 'pending' });
  });

  it('does not duplicate a repeated submission for the same hash', () => {
    const store = createStore();

    store.dispatch(trackPendingTransaction({ hash: 'abc', label: '10 XLM', at: '2026-01-01T00:00:00.000Z' }));
    store.dispatch(trackPendingTransaction({ hash: 'abc', label: '10 XLM', at: '2026-01-01T00:00:01.000Z' }));

    expect(store.getState().account.transactions.pending).toHaveLength(1);
  });

  it('reconciles a pending transaction against authoritative history on refresh', async () => {
    const store = createStore();
    store.dispatch(
      trackPendingTransaction({ hash: 'abc', label: '10 XLM', at: '2026-01-01T00:00:00.000Z' }),
    );

    horizonFetchMock.mockResolvedValue(pageResponse([horizonRecord('abc', true)]));
    await store.dispatch(refreshTransactionHistory(PUBLIC_KEY));

    const pending = store.getState().account.transactions.pending;
    expect(pending[0].status).toBe('confirmed');
  });

  it('leaves an unresolved pending transaction pending when the newest page does not include it', async () => {
    const store = createStore();
    store.dispatch(
      trackPendingTransaction({ hash: 'missing', label: '10 XLM', at: '2026-01-01T00:00:00.000Z' }),
    );

    horizonFetchMock.mockResolvedValue(pageResponse([horizonRecord('other')]));
    await store.dispatch(refreshTransactionHistory(PUBLIC_KEY));

    expect(store.getState().account.transactions.pending[0].status).toBe('pending');
  });

  it('never regresses a resolved confirmation when a later refresh still shows it', async () => {
    const store = createStore();
    store.dispatch(
      trackPendingTransaction({ hash: 'abc', label: '10 XLM', at: '2026-01-01T00:00:00.000Z' }),
    );
    store.dispatch(
      resolvePendingTransaction({ hash: 'abc', status: 'confirmed', at: '2026-01-01T00:00:05.000Z' }),
    );

    horizonFetchMock.mockResolvedValue(pageResponse([horizonRecord('abc', false)]));
    await store.dispatch(refreshTransactionHistory(PUBLIC_KEY));

    expect(store.getState().account.transactions.pending[0].status).toBe('confirmed');
  });
});
