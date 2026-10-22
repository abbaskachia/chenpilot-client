'use client';

import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { useSocket } from '@/hooks/useSocket';
import { useAppDispatch } from '@/store';
import {
  resolvePendingTransaction,
  trackPendingTransaction,
} from '@/store/slices/accountSlice';
import {
  TRANSACTION_CONFIRMATION_POLL_INTERVAL_MS,
  TRANSACTION_CONFIRMATION_TIMEOUT_MS,
  fetchTransactionConfirmation,
} from '@/utils/transactionConfirmation';
import { normalizeTransactionHash } from '@/utils/transactionHistory';
import {
  TransactionNotificationEvent,
  describeTransactionEvent,
  transactionStatusMessage,
  transactionToastId,
  transactionToastIdFromLabel,
} from '@/utils/transactionToast';

interface TrackedTransaction {
  /** Set once a terminal notification has been produced or the watch was torn down. */
  terminal: boolean;
  /** Set on unmount so in-flight lookups cannot update state or notify. */
  stopped: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

/**
 * Turns transaction socket events into confirmation-aware notifications.
 *
 * A socket event describes a *submission*, not a ledger confirmation, so it
 * only opens a pending notification. The transaction is reconciled against
 * authoritative Horizon data (`GET /transactions/{hash}`) and only that lookup
 * may produce a success or failure notification. Reconciled by hash, so
 * duplicate events for the same transaction never stack notifications and
 * concurrent transactions are tracked independently.
 */
export function TransactionToastListener() {
  const { socket } = useSocket();
  const dispatch = useAppDispatch();
  const trackedRef = useRef(new Map<string, TrackedTransaction>());

  useEffect(() => {
    if (!socket) return;

    const tracked = trackedRef.current;

    const watchTransaction = (hash: string, label: string) => {
      const id = transactionToastId(hash);
      const startedAt = Date.now();
      const entry: TrackedTransaction = {
        terminal: false,
        stopped: false,
        timer: null,
      };
      tracked.set(hash, entry);

      dispatch(trackPendingTransaction({ hash, label, at: new Date().toISOString() }));
      toast.loading(transactionStatusMessage('pending', label), { id });

      const finish = (status: 'confirmed' | 'failed') => {
        if (entry.stopped || entry.terminal) return;
        entry.terminal = true;
        if (entry.timer) {
          clearTimeout(entry.timer);
          entry.timer = null;
        }

        dispatch(
          resolvePendingTransaction({
            hash,
            status,
            at: new Date().toISOString(),
          }),
        );

        const message = transactionStatusMessage(status, label);
        if (status === 'confirmed') {
          toast.success(message, { id, duration: 5000 });
        } else {
          toast.error(message, { id, duration: 6000 });
        }
      };

      const poll = async () => {
        if (entry.stopped || entry.terminal) return;

        try {
          const result = await fetchTransactionConfirmation(hash);
          if (entry.stopped || entry.terminal) return;

          if (result.status === 'confirmed') {
            finish('confirmed');
            return;
          }
          if (result.status === 'failed') {
            finish('failed');
            return;
          }
        } catch {
          // A transient lookup failure is not an outcome. Stay pending and
          // retry rather than reporting a success or a failure.
        }

        if (entry.stopped || entry.terminal) return;

        if (Date.now() - startedAt >= TRANSACTION_CONFIRMATION_TIMEOUT_MS) {
          // Preserve an accurate pending state instead of inventing an outcome.
          toast(transactionStatusMessage('pending', label), { id, duration: 8000 });
          entry.timer = null;
          return;
        }

        entry.timer = setTimeout(() => {
          void poll();
        }, TRANSACTION_CONFIRMATION_POLL_INTERVAL_MS);
      };

      void poll();
    };

    const handleTransaction = (event: TransactionNotificationEvent) => {
      const label = describeTransactionEvent(event);
      const hash = normalizeTransactionHash(event.hash);

      if (!hash) {
        // No hash means no reconciliation is possible, so this can never be
        // reported as a confirmed success.
        toast(transactionStatusMessage('pending', label), {
          id: transactionToastIdFromLabel(label),
          duration: 6000,
        });
        return;
      }

      if (tracked.has(hash)) {
        // Already watching (or already resolved) this transaction. A repeated
        // event must not create a second pending entry or a second toast.
        return;
      }

      watchTransaction(hash, label);
    };

    socket.on('transaction:completed', handleTransaction);
    socket.on('transaction:success', handleTransaction);

    return () => {
      socket.off('transaction:completed', handleTransaction);
      socket.off('transaction:success', handleTransaction);

      // Cancel every outstanding timer and mark the watches stopped so an
      // in-flight lookup cannot push a stale update after unmount.
      tracked.forEach((entry) => {
        entry.stopped = true;
        if (entry.timer) {
          clearTimeout(entry.timer);
          entry.timer = null;
        }
      });
      tracked.clear();
    };
  }, [socket, dispatch]);

  return null;
}
