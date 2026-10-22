import { horizonFetch } from "@/utils/horizonFetch";

const HORIZON_BASE = "https://horizon.stellar.org";

/** How long to wait between authoritative lookups for a submitted transaction. */
export const TRANSACTION_CONFIRMATION_POLL_INTERVAL_MS = 4000;

/**
 * How long to keep polling before leaving the transaction in an accurate
 * pending state. Reaching this timeout is not an outcome: it never produces a
 * success or a failure.
 */
export const TRANSACTION_CONFIRMATION_TIMEOUT_MS = 60000;

export type TransactionConfirmationResult =
  | { status: "pending" }
  | { status: "confirmed"; ledger: number | null }
  | { status: "failed"; ledger: number | null };

/**
 * Look a transaction up in the ledger.
 *
 * This is the authoritative source used to move a submitted transaction to a
 * terminal state. `GET /transactions/{hash}` is a standard Horizon endpoint and
 * is reached through the same `horizonFetch` proxy the history flow already
 * uses.
 *
 * - `404` means Horizon has not recorded the hash in a closed ledger yet, so
 *   the transaction is still pending.
 * - A non-`404` failure or an unexpected payload throws, so the caller keeps
 *   the transaction pending and retries instead of inventing an outcome.
 */
export async function fetchTransactionConfirmation(
  hash: string,
): Promise<TransactionConfirmationResult> {
  const response = await horizonFetch(
    `${HORIZON_BASE}/transactions/${encodeURIComponent(hash)}`,
  );

  if (response.status === 404) {
    return { status: "pending" };
  }

  if (!response.ok) {
    throw new Error(`Transaction lookup failed with status ${response.status}`);
  }

  const record = await response.json();
  if (typeof record?.successful !== "boolean") {
    throw new Error("Transaction lookup returned an unexpected payload");
  }

  const ledger = typeof record?.ledger === "number" ? record.ledger : null;
  return record.successful
    ? { status: "confirmed", ledger }
    : { status: "failed", ledger };
}
