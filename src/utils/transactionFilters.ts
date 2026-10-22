import type { StellarTransaction, TransactionLifecycleStatus } from "@/types";

export type TransactionStatusFilter =
  | "all"
  | "confirmed"
  | "successful"
  | "failed"
  | "pending";

export function filterTransactionsByStatus<
  T extends {
    successful?: boolean;
    status?: TransactionLifecycleStatus | string;
  }
>(
  transactions: T[],
  status: TransactionStatusFilter,
): T[] {
  if (status === "all") {
    return transactions;
  }

  if (status === "pending") {
    return transactions.filter(
      (transaction) => transaction.status === "pending",
    );
  }

  if (status === "confirmed" || status === "successful") {
    return transactions.filter(
      (transaction) =>
        transaction.status === "confirmed" ||
        (transaction.status === undefined && transaction.successful === true),
    );
  }

  if (status === "failed") {
    return transactions.filter(
      (transaction) =>
        transaction.status !== "pending" &&
        (transaction.status === "failed" ||
          (transaction.status === undefined && transaction.successful === false)),
    );
  }

  return transactions;
}
