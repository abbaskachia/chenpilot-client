// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import accountReducer, { refreshTransactionHistory } from '@/store/slices/accountSlice';
import { TransactionToastListener } from './TransactionToastListener';

const h = vi.hoisted(() => {
  const handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  return {
    handlers,
    dispatchRef: { current: vi.fn() as unknown as (action: unknown) => unknown },
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(cb);
    }),
    off: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      handlers.get(event)?.delete(cb);
    }),
    fetchConfirmation: vi.fn(),
    horizonFetch: vi.fn(),
    toastLoading: vi.fn(),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
    emit(event: string, payload: unknown) {
      handlers.get(event)?.forEach((cb) => cb(payload));
    },
  };
});

const horizonFetchMock = h.horizonFetch;

vi.mock('@/hooks/useSocket', () => ({
  useSocket: () => ({ socket: { on: h.on, off: h.off, emit: vi.fn(), connected: true } }),
}));

vi.mock('@/store', () => ({
  useAppDispatch: () => h.dispatchRef.current,
}));

vi.mock('@/utils/horizonFetch', () => ({ horizonFetch: h.horizonFetch }));

vi.mock('@/utils/transactionConfirmation', () => ({
  TRANSACTION_CONFIRMATION_POLL_INTERVAL_MS: 4000,
  TRANSACTION_CONFIRMATION_TIMEOUT_MS: 60000,
  fetchTransactionConfirmation: (...args: unknown[]) => h.fetchConfirmation(...args),
}));

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), {
    loading: h.toastLoading,
    success: h.toastSuccess,
    error: h.toastError,
  }),
}));

vi.mock('@/services/api', () => ({
  default: { getAccountTransactions: vi.fn(), setStore: vi.fn() },
}));

const PUBLIC_KEY = 'GPUBLICKEY';

function horizonRecord(hash: string, successful: boolean, paging_token = `token-${hash}`) {
  return {
    id: `id-${hash}`,
    hash,
    ledger: 12,
    created_at: '2026-01-01T00:00:00.000Z',
    source_account: 'GSOURCE',
    fee_charged: '100',
    operation_count: 1,
    successful,
    paging_token,
    _embedded: { records: [] },
  };
}

function pageResponse(records: Record<string, unknown>[]) {
  return { ok: true, status: 200, json: async () => ({ _embedded: { records } }) };
}

/**
 * A real account store, wired into the mocked `@/store` hook so the listener
 * dispatches into the same slice the page reads from.
 */
function installStore() {
  const store = configureStore({ reducer: { account: accountReducer } });
  h.dispatchRef.current = store.dispatch as unknown as (action: unknown) => unknown;
  return store;
}

describe('transaction confirmation + history refresh integration', () => {
  beforeEach(() => {
    h.handlers.clear();
    h.on.mockClear();
    h.off.mockClear();
    h.fetchConfirmation.mockReset();
    h.fetchConfirmation.mockResolvedValue({ status: 'pending' });
    h.horizonFetch.mockReset();
    h.toastLoading.mockReset();
    h.toastSuccess.mockReset();
    h.toastError.mockReset();
  });

  it('records a socket submission as pending, then confirms it from authoritative history', async () => {
    const store = installStore();

    // Start with an already loaded history page so pagination state exists.
    horizonFetchMock.mockResolvedValueOnce(
      pageResponse([horizonRecord('older-tx', true, 'cursor-1')]),
    );
    await store.dispatch(refreshTransactionHistory(PUBLIC_KEY));

    renderHook(() => TransactionToastListener());

    act(() => {
      h.emit('transaction:completed', { hash: 'pending-tx', amount: '10', asset: 'XLM' });
    });

    const tracked = store.getState().account.transactions.pending;
    expect(tracked).toHaveLength(1);
    expect(tracked[0]).toMatchObject({ hash: 'pending-tx', status: 'pending' });
    expect(h.toastSuccess).not.toHaveBeenCalled();

    // The newest page now contains the transaction, so authoritative data
    // resolves the tracked pending entry without losing older history.
    horizonFetchMock.mockResolvedValueOnce(
      pageResponse([horizonRecord('pending-tx', true), horizonRecord('older-tx', true, 'cursor-1')]),
    );
    await store.dispatch(refreshTransactionHistory(PUBLIC_KEY));

    const history = store.getState().account.transactions;
    expect(history.pending[0].status).toBe('confirmed');
    expect(history.transactions.map((tx) => tx.hash)).toEqual(['pending-tx', 'older-tx']);
  });

  it('keeps the pending entry unresolved (and history intact) while the transaction is not yet in the ledger', async () => {
    const store = installStore();

    renderHook(() => TransactionToastListener());

    act(() => {
      h.emit('transaction:success', { hash: 'slow-tx', amount: '3', asset: 'XLM' });
    });

    horizonFetchMock.mockResolvedValueOnce(pageResponse([horizonRecord('other-tx', true)]));
    await store.dispatch(refreshTransactionHistory(PUBLIC_KEY));

    const history = store.getState().account.transactions;
    expect(history.pending[0].status).toBe('pending');
    expect(history.transactions.map((tx) => tx.hash)).toEqual(['other-tx']);
    expect(h.toastSuccess).not.toHaveBeenCalled();
  });

  it('collapses duplicate socket events for the same hash into a single tracked transaction', async () => {
    const store = installStore();

    renderHook(() => TransactionToastListener());

    act(() => {
      h.emit('transaction:completed', { hash: 'dup-tx', amount: '1', asset: 'XLM' });
      h.emit('transaction:success', { hash: 'dup-tx', amount: '1', asset: 'XLM' });
    });

    await waitFor(() => {
      expect(store.getState().account.transactions.pending).toHaveLength(1);
    });
    expect(h.toastLoading).toHaveBeenCalledTimes(1);
  });
});
