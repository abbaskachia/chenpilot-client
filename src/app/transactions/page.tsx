"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";
import type { RootState, AppDispatch } from "@/store";
import {
  getOlderTransactionHistory,
  getTransactionHistory,
  refreshTransactionHistory,
} from "@/store/slices/accountSlice";
import { singleFlight } from "@/services/api";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import {
  formatRelativeTime,
  formatTransactionAmount,
  formatTransactionDate,
  formatTransactionFee,
} from "@/utils/format";
import {
  filterTransactionsByStatus,
  type TransactionStatusFilter,
} from "@/utils/transactionFilters";
import type { Language } from "@/lib/i18n/i18n";
import { RefreshCw, ReceiptText } from "lucide-react";

function formatLastUpdated(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return formatRelativeTime(parsed);
}

export default function TransactionsPage() {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const { status, transactions } = useSelector(
    (state: RootState) => state.account,
  );
  const language = useSelector(
    (state: RootState) => state.ui?.language,
  ) as Language | undefined;

  const [statusFilter, setStatusFilter] =
    useState<TransactionStatusFilter>("all");

  const publicKey = status?.publicKey ?? null;
  const transactionList = transactions?.transactions ?? [];
  const pendingList = transactions?.pending ?? [];
  const hasHistory = transactionList.length > 0;

  const filteredTransactions = useMemo(
    () =>
      filterTransactionsByStatus(
        transactionList,
        statusFilter,
      ),
    [transactionList, statusFilter],
  );

  const lastUpdatedLabel = useMemo(
    () => formatLastUpdated(transactions?.lastUpdatedAt ?? null),
    [transactions?.lastUpdatedAt],
  );

  const showPendingConfirmations =
    statusFilter === "all" || statusFilter === "pending";

  const pendingConfirmations = useMemo(
    () =>
      showPendingConfirmations
        ? pendingList.filter((entry) => entry.status === "pending")
        : [],
    [showPendingConfirmations, pendingList],
  );

  useEffect(() => {
    if (publicKey) {
      dispatch(getTransactionHistory(publicKey));
    }
  }, [dispatch, publicKey]);

  const handleRefresh = useCallback(() => {
    if (!publicKey) {
      return;
    }

    void singleFlight
      .run(`transaction-history:${publicKey}`, () =>
        dispatch(refreshTransactionHistory(publicKey)).unwrap(),
      )
      .catch(() => {
        // The failure is surfaced through transactions.refreshError.
      });
  }, [dispatch, publicKey]);

  const handleLoadOlder = useCallback(() => {
    if (!publicKey || !transactions.nextCursor) {
      return;
    }

    void dispatch(
      getOlderTransactionHistory({
        publicKey,
        cursor: transactions.nextCursor,
      }),
    );
  }, [dispatch, publicKey, transactions.nextCursor]);

  const getStatusColor = (successful: boolean, status?: string) => {
    if (status === "pending") {
      return "text-yellow-600 dark:text-yellow-400";
    }
    return successful || status === "confirmed"
      ? "text-green-600 dark:text-green-400"
      : "text-red-600 dark:text-red-400";
  };

  const getOperationType = (type: string) => {
    switch (type) {
      case "create_account":
        return "Funding";
      case "payment":
        return "Payment";
      case "trust":
        return "Trust";
      default:
        return type.replace("_", " ").toUpperCase();
    }
  };

  if (transactions.isLoading && !hasHistory) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="mb-6 text-2xl font-bold">Transaction History</h1>
        <div className="text-center" role="status">
          Loading transactions...
        </div>
      </div>
    );
  }

  if (transactions.error && !hasHistory) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="mb-6 text-2xl font-bold">Transaction History</h1>
        <Card className="border-red-200 dark:border-red-900">
          <div role="alert" className="space-y-4">
            <p className="text-red-700 dark:text-red-300">
              Error: {transactions.error}
            </p>
            {publicKey && (
              <Button
                type="button"
                onClick={() => dispatch(getTransactionHistory(publicKey))}
                className="inline-flex items-center gap-2"
              >
                <RefreshCw aria-hidden="true" className="h-4 w-4" />
                Retry
              </Button>
            )}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Transaction History</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {transactions.isRefreshing
              ? "Refreshing newest transactions..."
              : lastUpdatedLabel
                ? `Last updated ${lastUpdatedLabel}`
                : "Not yet updated"}
          </p>
        </div>

        <Button
          type="button"
          variant="secondary"
          onClick={handleRefresh}
          disabled={!publicKey}
          loading={transactions.isRefreshing}
          aria-label="Refresh transaction history"
          className="inline-flex items-center gap-2"
        >
          {!transactions.isRefreshing && (
            <RefreshCw aria-hidden="true" className="h-4 w-4" />
          )}
          {transactions.isRefreshing ? "Refreshing" : "Refresh"}
        </Button>
      </div>

      {transactions.refreshError && (
        <Card className="mb-4 border-red-200 dark:border-red-900">
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-4"
          >
            <p className="text-red-700 dark:text-red-300">
              Could not refresh transactions: {transactions.refreshError}
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={handleRefresh}
              disabled={transactions.isRefreshing}
              className="inline-flex items-center gap-2"
            >
              <RefreshCw aria-hidden="true" className="h-4 w-4" />
              Retry refresh
            </Button>
          </div>
        </Card>
      )}

      {pendingConfirmations.length > 0 && (
        <Card className="mb-4">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
            Awaiting confirmation
          </h2>
          <ul className="mt-2 space-y-1">
            {pendingConfirmations.map((entry) => (
              <li
                key={entry.hash}
                role="status"
                className="flex items-center justify-between text-sm text-yellow-700 dark:text-yellow-300"
              >
                <span>{entry.label}</span>
                <span>Pending</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {!hasHistory ? (
        <EmptyState
          icon={<ReceiptText aria-hidden="true" className="h-8 w-8" />}
          title="No transactions yet"
          description="Your completed transactions will appear here. Start with a wallet transfer or payment."
          action={{
            label: "Go to dashboard",
            onClick: () => router.push("/dashboard"),
          }}
        />
      ) : (
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <span>Status</span>
            <select
              aria-label="Filter transactions by status"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as TransactionStatusFilter)
              }
              className="rounded border border-gray-300 bg-white px-2 py-1 text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            >
              <option value="all">All statuses</option>
              <option value="confirmed">Confirmed</option>
              <option value="successful">Successful</option>
              <option value="failed">Failed</option>
              <option value="pending">Pending</option>
            </select>
          </label>

          {filteredTransactions.length === 0 &&
          !(statusFilter === "pending" && pendingConfirmations.length > 0) ? (
            <p role="status">No transactions match this status.</p>
          ) : (
            filteredTransactions.map((tx) => (
              <Card key={tx.id} className="p-4">
                <div className="mb-2 flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">
                      Transaction {tx.hash.slice(0, 8)}...
                    </h3>
                    <p className="text-sm text-gray-600">
                      {formatTransactionDate(tx.created_at, { language })}
                    </p>
                  </div>
                  <div
                    className={`font-semibold ${getStatusColor(
                      tx.successful,
                      tx.status,
                    )}`}
                  >
                    {tx.status === "pending"
                      ? "Pending"
                      : tx.successful || tx.status === "confirmed"
                        ? "Confirmed"
                        : "Failed"}
                  </div>
                </div>

                <div className="space-y-2">
                  {tx.operations.map((op) => (
                    <div
                      key={op.id}
                      className="flex items-center justify-between rounded bg-gray-50 p-2"
                    >
                      <div>
                        <span className="font-medium">
                          {getOperationType(op.type)}
                        </span>
                        {op.amount && (
                          <span className="ml-2 text-sm">
                            {formatTransactionAmount(op.amount, {
                              language,
                              asset: op.asset || "XLM",
                            })}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-600">
                        {op.to && `To: ${op.to.slice(0, 8)}...`}
                        {op.from && `From: ${op.from.slice(0, 8)}...`}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-2 text-xs text-gray-500">
                  Fee:{" "}
                  {formatTransactionFee(tx.fee_charged, {
                    language,
                    asset: "XLM",
                  })}{" "}
                  | Ledger: {tx.ledger}
                </div>
              </Card>
            ))
          )}

          {transactions.loadMoreError && (
            <div role="alert" className="text-sm text-red-700 dark:text-red-300">
              Could not load older transactions: {transactions.loadMoreError}
            </div>
          )}

          {transactions.nextCursor && (
            <div className="pt-2 text-center">
              <Button
                type="button"
                variant="secondary"
                onClick={handleLoadOlder}
                loading={transactions.isLoadingMore}
                disabled={transactions.isLoadingMore}
              >
                {transactions.isLoadingMore
                  ? "Loading..."
                  : "Load older transactions"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
