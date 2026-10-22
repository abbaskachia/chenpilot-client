// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { TransactionToastListener } from './TransactionToastListener';
import { transactionToastId } from '@/utils/transactionToast';

const h = vi.hoisted(() => {
  const handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  const state = {
    handlers,
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(cb);
    }),
    off: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      handlers.get(event)?.delete(cb);
    }),
    dispatch: vi.fn(),
    fetchConfirmation: vi.fn(),
    toast: vi.fn(),
    toastLoading: vi.fn(),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
    emit(event: string, payload: unknown) {
      handlers.get(event)?.forEach((cb) => cb(payload));
    },
    reset() {
      handlers.clear();
      state.on.mockClear();
      state.off.mockClear();
      state.dispatch.mockReset();
      state.fetchConfirmation.mockReset();
      state.toast.mockReset();
      state.toastLoading.mockReset();
      state.toastSuccess.mockReset();
      state.toastError.mockReset();
    },
  };
  return state;
});

vi.mock('@/hooks/useSocket', () => ({
  useSocket: () => ({ socket: { on: h.on, off: h.off, emit: vi.fn(), connected: true } }),
}));

vi.mock('@/store', () => ({
  useAppDispatch: () => h.dispatch,
}));

vi.mock('@/utils/transactionConfirmation', () => ({
  TRANSACTION_CONFIRMATION_POLL_INTERVAL_MS: 4000,
  TRANSACTION_CONFIRMATION_TIMEOUT_MS: 60000,
  fetchTransactionConfirmation: (...args: unknown[]) => h.fetchConfirmation(...args),
}));

vi.mock('react-hot-toast', () => ({
  default: Object.assign(h.toast, {
    loading: h.toastLoading,
    success: h.toastSuccess,
    error: h.toastError,
  }),
}));

function mount() {
  return renderHook(() => TransactionToastListener());
}

describe('TransactionToastListener (#235)', () => {
  beforeEach(() => {
    h.reset();
    h.fetchConfirmation.mockResolvedValue({ status: 'pending' });
  });

  it('opens a pending notification on submission and never reports success', () => {
    mount();

    act(() => {
      h.emit('transaction:completed', { hash: 'abc', amount: '10', asset: 'XLM' });
    });

    expect(h.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'account/trackPendingTransaction' }),
    );
    expect(h.toastLoading).toHaveBeenCalledTimes(1);
    expect(h.toastLoading.mock.calls[0][1]).toMatchObject({ id: transactionToastId('abc') });
    expect(h.toastSuccess).not.toHaveBeenCalled();
    expect(h.toastError).not.toHaveBeenCalled();
  });

  it('only reports success after authoritative confirmation arrives (delayed)', async () => {
    let resolveConfirmation!: (value: unknown) => void;
    h.fetchConfirmation.mockImplementation(
      () => new Promise((resolve) => { resolveConfirmation = resolve; }),
    );

    mount();

    act(() => {
      h.emit('transaction:completed', { hash: 'abc', amount: '10', asset: 'XLM' });
    });

    // Still unconfirmed: no success yet.
    expect(h.toastSuccess).not.toHaveBeenCalled();

    await act(async () => {
      resolveConfirmation({ status: 'confirmed', ledger: 5 });
      await Promise.resolve();
    });

    await waitFor(() => expect(h.toastSuccess).toHaveBeenCalledTimes(1));
    expect(h.toastSuccess.mock.calls[0][1]).toMatchObject({ id: transactionToastId('abc') });
    expect(h.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'account/resolvePendingTransaction' }),
    );
  });

  it('reports a successful confirmation with the same toast id (no duplicate notification)', async () => {
    h.fetchConfirmation.mockResolvedValue({ status: 'confirmed', ledger: 7 });
    mount();

    act(() => {
      h.emit('transaction:success', { hash: 'abc', amount: '10', asset: 'XLM' });
    });

    await waitFor(() => expect(h.toastSuccess).toHaveBeenCalledTimes(1));

    // The pending toast and the success toast share one id, so react-hot-toast
    // replaces the pending entry rather than stacking a second one.
    const pendingId = h.toastLoading.mock.calls[0][1].id;
    const successId = h.toastSuccess.mock.calls[0][1].id;
    expect(successId).toBe(pendingId);
  });

  it('reports failure (not success) when the authoritative record is unsuccessful', async () => {
    h.fetchConfirmation.mockResolvedValue({ status: 'failed', ledger: 9 });
    mount();

    act(() => {
      h.emit('transaction:completed', { hash: 'abc', amount: '10', asset: 'XLM' });
    });

    await waitFor(() => expect(h.toastError).toHaveBeenCalledTimes(1));
    expect(h.toastSuccess).not.toHaveBeenCalled();
  });

  it('stays pending when the confirmation lookup fails transiently', async () => {
    h.fetchConfirmation.mockRejectedValue(new Error('lookup failed with status 503'));
    mount();

    act(() => {
      h.emit('transaction:completed', { hash: 'abc', amount: '10', asset: 'XLM' });
    });

    await waitFor(() => expect(h.fetchConfirmation).toHaveBeenCalled());

    expect(h.toastSuccess).not.toHaveBeenCalled();
    expect(h.toastError).not.toHaveBeenCalled();
    expect(h.dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'account/resolvePendingTransaction' }),
    );
  });

  it('ignores duplicate events for the same transaction hash', () => {
    mount();

    act(() => {
      h.emit('transaction:completed', { hash: 'abc', amount: '10', asset: 'XLM' });
      h.emit('transaction:completed', { hash: 'abc', amount: '10', asset: 'XLM' });
      h.emit('transaction:success', { hash: 'abc', amount: '10', asset: 'XLM' });
    });

    const trackCalls = h.dispatch.mock.calls.filter(
      ([action]) => action.type === 'account/trackPendingTransaction',
    );
    expect(trackCalls).toHaveLength(1);
    expect(h.toastLoading).toHaveBeenCalledTimes(1);
  });

  it('tracks concurrent transactions independently and reconciles case-insensitively by hash', () => {
    mount();

    act(() => {
      h.emit('transaction:completed', { hash: 'abc', amount: '10', asset: 'XLM' });
      h.emit('transaction:completed', { hash: 'def', amount: '5', asset: 'USDC' });
      // Different casing of an already-tracked hash must not start a second watch.
      h.emit('transaction:completed', { hash: 'ABC', amount: '10', asset: 'XLM' });
    });

    const trackCalls = h.dispatch.mock.calls.filter(
      ([action]) => action.type === 'account/trackPendingTransaction',
    );
    expect(trackCalls).toHaveLength(2);
    expect(h.toastLoading).toHaveBeenCalledTimes(2);
  });

  it('cleans up socket subscriptions and timers on unmount', async () => {
    let resolveConfirmation!: (value: unknown) => void;
    h.fetchConfirmation.mockImplementation(
      () => new Promise((resolve) => { resolveConfirmation = resolve; }),
    );

    const { unmount } = mount();

    act(() => {
      h.emit('transaction:completed', { hash: 'abc', amount: '10', asset: 'XLM' });
    });

    unmount();

    expect(h.off).toHaveBeenCalledWith('transaction:completed', expect.any(Function));
    expect(h.off).toHaveBeenCalledWith('transaction:success', expect.any(Function));

    h.dispatch.mockClear();
    h.toastSuccess.mockClear();

    await act(async () => {
      resolveConfirmation({ status: 'confirmed', ledger: 5 });
      await Promise.resolve();
    });

    // An in-flight lookup must not push a stale notification after unmount.
    expect(h.toastSuccess).not.toHaveBeenCalled();
    expect(h.dispatch).not.toHaveBeenCalled();
  });

  it('shows a pending-only notice for a submission without a hash and never reports success', () => {
    mount();

    act(() => {
      h.emit('transaction:completed', { amount: '10', asset: 'XLM' });
    });

    expect(h.toast).toHaveBeenCalledTimes(1);
    expect(h.toast.mock.calls[0][0]).toMatch(/awaiting confirmation/i);
    expect(h.toastSuccess).not.toHaveBeenCalled();
    expect(h.toastError).not.toHaveBeenCalled();
    expect(h.dispatch).not.toHaveBeenCalled();
  });
});
