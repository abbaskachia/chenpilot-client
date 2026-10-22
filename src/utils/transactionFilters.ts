
import type { StellarTransaction } from "@/types";

export type TransactionStatusFilter = "all" | "successful" | "failed";

export function filterTransactionsByStatus<
  T extends Pick<StellarTransaction, "successful">
>(
  transactions: T[],
  status: TransactionStatusFilter,
): T[] {
  if (status === "all") {
    return transactions;
  }

  const successful = status === "successful";

  return transactions.filter(
    (transaction) => transaction.successful === successful,
  );
}
