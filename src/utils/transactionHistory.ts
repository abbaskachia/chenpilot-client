import { PendingTransactionConfirmation, StellarTransaction } from "@/types";

/**
 * Normalize a transaction hash into the stable key used for reconciliation.
 *
 * Horizon hashes are hex strings, but events and API responses are not
 * guaranteed to be consistently cased or trimmed, so the value is normalized
 * before it is used as a lookup key. Returns `null` when there is no usable
 * identifier — callers must not treat that as a shared key.
 */
export function normalizeTransactionHash(hash?: string | null): string | null {
  if (typeof hash !== "string") {
    return null;
  }
  const normalized = hash.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

/**
 * Find a transaction in a list by its normalized hash.
 */
export function findTransactionByHash(
  transactions: StellarTransaction[],
  hash: string,
): StellarTransaction | undefined {
  const target = normalizeTransactionHash(hash);
  if (!target) {
    return undefined;
  }
  return transactions.find(
    (transaction) => normalizeTransactionHash(transaction.hash) === target,
  );
}

/**
 * Apply a freshly loaded *newest* page to the already loaded history.
 *
 * Horizon returns transactions newest-first and a refresh only re-reads the
 * head of that list, so the incoming page must lead the merged result while
 * every older record that the refresh did not mention is preserved after it:
 *
 * - Records from the newest page are taken in their own order, deduplicated by
 *   hash, so an updated status/ledger for a known hash replaces the stale copy
 *   instead of adding a row.
 * - Records already loaded that the newest page did not mention are appended,
 *   because they are by definition older than the whole newest page.
 * - Records without a usable hash are never merged together.
 *
 * Neither input array (nor its records) is mutated.
 */
export function mergeNewestTransactionHistory(
  existing: StellarTransaction[],
  incoming: StellarTransaction[],
): StellarTransaction[] {
  const seen = new Set<string>();
  const merged: StellarTransaction[] = [];

  for (const transaction of incoming) {
    const hash = normalizeTransactionHash(transaction.hash);
    if (hash) {
      if (seen.has(hash)) {
        continue;
      }
      seen.add(hash);
    }
    merged.push(transaction);
  }

  for (const transaction of existing) {
    const hash = normalizeTransactionHash(transaction.hash);
    if (hash && seen.has(hash)) {
      continue;
    }
    merged.push(transaction);
  }

  return merged;
}

/**
 * Merge freshly loaded transactions into the already loaded history.
 *
 * Hash-keyed semantics:
 * - Records that already exist are replaced by the newer authoritative copy so
 *   an updated status/ledger for the same hash never creates a second row.
 * - Newly discovered records are appended, preserving the source ordering.
 * - Records missing from `incoming` are left untouched, so older pages that
 *   were already loaded survive a newest-page refresh.
 * - Records without a usable hash are kept but never merged, so unrelated
 *   transactions are never collapsed under a shared/undefined identifier.
 *
 * Neither input array (nor its records) is mutated.
 */
export function mergeTransactionHistory(
  existing: StellarTransaction[],
  incoming: StellarTransaction[],
): StellarTransaction[] {
  const merged = [...existing];
  const indexByHash = new Map<string, number>();

  merged.forEach((transaction, index) => {
    const hash = normalizeTransactionHash(transaction.hash);
    if (hash && !indexByHash.has(hash)) {
      indexByHash.set(hash, index);
    }
  });

  for (const transaction of incoming) {
    const hash = normalizeTransactionHash(transaction.hash);
    if (!hash) {
      merged.push(transaction);
      continue;
    }

    const existingIndex = indexByHash.get(hash);
    if (existingIndex === undefined) {
      indexByHash.set(hash, merged.length);
      merged.push(transaction);
    } else {
      merged[existingIndex] = transaction;
    }
  }

  return merged;
}

/**
 * Apply authoritative ledger records to the list of tracked confirmations.
 *
 * Only entries that are still `pending` are transitioned, so a stale response
 * can never regress an already resolved transaction.
 */
export function reconcilePendingConfirmations(
  pending: PendingTransactionConfirmation[],
  records: StellarTransaction[],
  at: string,
): PendingTransactionConfirmation[] {
  if (pending.length === 0 || records.length === 0) {
    return pending;
  }

  const byHash = new Map<string, StellarTransaction>();
  for (const record of records) {
    const hash = normalizeTransactionHash(record.hash);
    if (hash && !byHash.has(hash)) {
      byHash.set(hash, record);
    }
  }

  return pending.map((entry) => {
    if (entry.status !== "pending") {
      return entry;
    }
    const match = byHash.get(entry.hash);
    if (!match) {
      return entry;
    }
    return {
      ...entry,
      status: match.successful ? "confirmed" : "failed",
      updatedAt: at,
    };
  });
}
