import { TransactionLifecycleStatus } from "@/types";
import { normalizeTransactionHash } from "@/utils/transactionHistory";

/**
 * Window used to deduplicate notifications that cannot be reconciled by hash.
 */
export const TRANSACTION_TOAST_DEDUPE_WINDOW_MS = 5000;

export interface TransactionNotificationEvent {
  hash?: string;
  amount?: string;
  asset?: string;
  message?: string;
}

function hashLabel(label: string): string {
  let hash = 2166136261;
  for (let index = 0; index < label.length; index += 1) {
    hash ^= label.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Toast id for a submitted transaction.
 *
 * The normalized transaction hash is the reconciliation key: the pending
 * notification, its confirmation, and repeated socket events for the same
 * transaction all target one toast slot instead of stacking new toasts.
 */
export function transactionToastId(hash: string): string {
  const normalized = normalizeTransactionHash(hash);
  return `transaction-${normalized ?? hash.trim()}`;
}

/**
 * Fallback id for notifications that cannot be reconciled because no
 * transaction hash was supplied. Deduplicated by notification text only, and
 * only inside {@link TRANSACTION_TOAST_DEDUPE_WINDOW_MS}.
 */
export function transactionToastIdFromLabel(label: string, now = Date.now()): string {
  const window = Math.floor(now / TRANSACTION_TOAST_DEDUPE_WINDOW_MS);
  return `transaction-label-${hashLabel(label)}-${window}`;
}

/**
 * Human-readable description of the wallet action carried by an event.
 *
 * The amount/asset pair is preferred so lifecycle copy reads naturally
 * ("10 XLM confirmed"); an explicit message is only used when no amount is
 * available.
 */
export function describeTransactionEvent(event: TransactionNotificationEvent): string {
  if (event.amount && event.asset) {
    return `${event.amount} ${event.asset}`;
  }
  if (event.message) {
    return event.message;
  }
  return "Transaction";
}

/**
 * Notification copy for each lifecycle state. A success message is only ever
 * produced for the `confirmed` state.
 */
export function transactionStatusMessage(
  status: TransactionLifecycleStatus,
  label: string,
): string {
  switch (status) {
    case "pending":
      return `${label} — awaiting confirmation`;
    case "confirmed":
      return `${label} confirmed`;
    case "failed":
      return `${label} failed`;
  }
}
