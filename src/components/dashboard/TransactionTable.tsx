"use client";

import React, { useContext, useState } from "react";
import { ReactReduxContext } from "react-redux";
import type {
  StellarTransaction,
  StellarOperation,
  TransactionDirection,
  TransactionLifecycleStatus,
  AssetIdentifier,
} from "@/types";
import {
  formatAddress,
  formatTokenAmount,
  formatTransactionAmount as formatLocaleAmount,
  formatTransactionDate,
  formatTransactionFee,
  ASSET_PRECISION,
} from "@/utils/format";
import type { FormatAmountOptions } from "@/utils/format";
import { useAppSelector } from "@/store";
import type { Language } from "@/lib/i18n/i18n";
import {
  filterTransactionsByStatus,
  type TransactionStatusFilter,
} from "@/utils/transactionFilters";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  ExternalLink,
  Check,
  AlertCircle,
  Loader2,
} from "lucide-react";
import toast from "react-hot-toast";

export interface TransactionTableProps {
  transactions: StellarTransaction[];
  isLoading: boolean;
  error: string | null;
  currentPage: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  language?: Language;
  locale?: string;
  activeAccountAddress?: string;
  accountAddress?: string;
  statusFilter?: TransactionStatusFilter;
  onStatusFilterChange?: (status: TransactionStatusFilter) => void;
}

const OPERATION_TYPE_LABELS: { [key: string]: string } = {
  payment: "Payment",
  create_account: "Create Account",
  account_merge: "Account Merge",
  manage_offer: "Manage Offer",
  create_passive_offer: "Create Passive Offer",
  set_options: "Set Options",
  change_trust: "Change Trust",
  allow_trust: "Allow Trust",
  account_created: "Account Created",
  invoke_host_function: "Invoke Host Function",
  bump_sequence: "Bump Sequence",
  ext_soroban_op: "Soroban Operation",
};

function normalizeAddress(address?: string | null): string {
  return address ? address.trim().toLowerCase() : "";
}

/**
 * Resolves an asset's code, issuer, and canonical representation from operation metadata.
 *
 * Rules:
 * - Native assets ('XLM' or 'native'): canonical is 'XLM', isNative is true.
 * - Issued assets with issuer: canonical is '<CODE>:<ISSUER>', isNative is false.
 * - Issued assets without issuer (incomplete metadata): canonical is '<CODE>', hasIncompleteMetadata is true.
 * - Missing/empty metadata: safely falls back to native 'XLM'.
 */
export function resolveAssetIdentifier(
  asset?: string | null,
  issuer?: string | null,
  assetType?: string | null,
): AssetIdentifier {
  if (assetType === "native" || asset === "native") {
    return {
      code: "XLM",
      issuer: undefined,
      isNative: true,
      canonical: "XLM",
      hasIncompleteMetadata: false,
    };
  }

  // Handle canonical string format "CODE:ISSUER"
  if (asset && asset.includes(":")) {
    const [rawCode, ...rest] = asset.split(":");
    const parsedIssuer = rest.join(":").trim();
    const cleanCode = rawCode.trim().toUpperCase() || "UNKNOWN";

    if (parsedIssuer) {
      return {
        code: cleanCode,
        issuer: parsedIssuer,
        isNative: false,
        canonical: `${cleanCode}:${parsedIssuer}`,
        hasIncompleteMetadata: false,
      };
    }

    return {
      code: cleanCode,
      issuer: undefined,
      isNative: false,
      canonical: cleanCode,
      hasIncompleteMetadata: true,
    };
  }

  const cleanCode = asset ? asset.trim().toUpperCase() : "";
  const cleanIssuer = issuer ? issuer.trim() : undefined;

  // Missing or unknown asset code defaults safely to native XLM
  if (!cleanCode) {
    return {
      code: "XLM",
      issuer: undefined,
      isNative: true,
      canonical: "XLM",
      hasIncompleteMetadata: false,
    };
  }

  if (cleanCode === "XLM") {
    return {
      code: "XLM",
      issuer: undefined,
      isNative: true,
      canonical: "XLM",
      hasIncompleteMetadata: false,
    };
  }

  // Non-native asset with explicit issuer
  if (cleanIssuer) {
    return {
      code: cleanCode,
      issuer: cleanIssuer,
      isNative: false,
      canonical: `${cleanCode}:${cleanIssuer}`,
      hasIncompleteMetadata: false,
    };
  }

  // Non-native asset without issuer metadata
  return {
    code: cleanCode,
    issuer: undefined,
    isNative: false,
    canonical: cleanCode,
    hasIncompleteMetadata: true,
  };
}

/**
 * Returns a display string for an asset, with optional compact issuer notation.
 */
export function formatAssetIdentifier(
  asset?: string | null,
  issuer?: string | null,
  options?: { compact?: boolean },
): string {
  const info = resolveAssetIdentifier(asset, issuer);
  if (info.isNative) {
    return info.code;
  }
  if (info.issuer) {
    if (options?.compact) {
      return `${info.code} (${formatAddress(info.issuer, 4, 4)})`;
    }
    return info.canonical;
  }
  return `${info.code} (unverified)`;
}

/**
 * Classifies an individual operation's direction relative to the active account address.
 *
 * Rules:
 * - 'self': both source and destination match the active address.
 * - 'incoming': destination matches active address, and source does not.
 * - 'outgoing': source matches active address, and destination is present and does not match active address.
 * - 'unknown': missing active address, missing operation accounts, non-transfer ops, or neither matches.
 */
export function getOperationDirection(
  operation?: Partial<StellarOperation> | null,
  activeAccountAddress?: string | null,
  txSourceAccount?: string | null,
): TransactionDirection {
  const normActive = normalizeAddress(activeAccountAddress);

  if (!normActive || !operation) {
    return "unknown";
  }

  const extra = operation as unknown as Record<string, unknown>;

  const rawSource =
    operation.from ||
    operation.source_account ||
    (extra.funder as string | undefined) ||
    txSourceAccount;

  const rawDest =
    operation.to ||
    operation.into ||
    (extra.account as string | undefined);

  const normSource = normalizeAddress(rawSource);
  const normDest = normalizeAddress(rawDest);

  if (!normSource && !normDest) {
    return "unknown";
  }

  if (normSource && normDest && normSource === normActive && normDest === normActive) {
    return "self";
  }

  if (normDest && normDest === normActive && normSource !== normActive) {
    return "incoming";
  }

  if (normSource && normSource === normActive && normDest && normDest !== normActive) {
    return "outgoing";
  }

  if (normSource && normSource === normActive && !normDest) {
    return "outgoing";
  }

  return "unknown";
}

/**
 * Derives overall transaction direction based on its primary operation, falling back to transaction-level fields.
 */
export function getTransactionDirection(
  tx: StellarTransaction,
  activeAccountAddress?: string | null,
): TransactionDirection {
  if (tx.direction) {
    return tx.direction;
  }

  const primaryOp =
    tx.operations && tx.operations.length > 0 ? tx.operations[0] : null;

  return getOperationDirection(
    primaryOp,
    activeAccountAddress,
    tx.source_account,
  );
}

/**
 * Formats a transaction amount consistently with directional prefix and asset symbol/identifier.
 * - incoming: "+<amount> <asset>"
 * - outgoing: "-<amount> <asset>"
 * - self: "<amount> <asset>"
 * - unknown: "<amount> <asset>" (or "-" if amount is missing)
 */
export function formatTransactionAmount(
  amount?: string | number | null,
  direction: TransactionDirection = "unknown",
  asset = "XLM",
  decimals?: number,
  options?: FormatAmountOptions & {
    issuer?: string | null;
    showCanonical?: boolean;
    compactIssuer?: boolean;
  },
): string {
  if (amount === undefined || amount === null || amount === "") {
    return "-";
  }

  const assetInfo = resolveAssetIdentifier(asset, options?.issuer);

  let assetLabel = assetInfo.code;
  if (options?.showCanonical) {
    assetLabel = assetInfo.canonical;
  } else if (options?.compactIssuer && assetInfo.issuer) {
    assetLabel = `${assetInfo.code} (${formatAddress(assetInfo.issuer, 4, 4)})`;
  }

  if (options?.language || options?.locale) {
    const rawFormatted = formatLocaleAmount(amount, {
      ...options,
      asset: assetLabel,
      decimals:
        decimals !== undefined
          ? decimals
          : assetInfo.code
            ? ASSET_PRECISION[assetInfo.code.toUpperCase()]
            : undefined,
    });

    if (rawFormatted === "-") {
      return "-";
    }

    if (direction === "incoming" && !rawFormatted.startsWith("+")) {
      return `+${rawFormatted}`;
    }

    if (direction === "outgoing" && !rawFormatted.startsWith("-")) {
      return `-${rawFormatted}`;
    }

    return rawFormatted;
  }

  const tokenFormatted = formatTokenAmount(
    amount,
    decimals !== undefined ? decimals : 2,
  );
  const assetSuffix = assetLabel ? ` ${assetLabel}` : "";

  if (direction === "incoming") {
    return `+${tokenFormatted}${assetSuffix}`;
  }

  if (direction === "outgoing") {
    return `-${tokenFormatted}${assetSuffix}`;
  }

  return `${tokenFormatted}${assetSuffix}`;
}

/**
 * Formats an asset amount without directional prefixes, with optional canonical/compact issuer format.
 */
export function formatAssetAmount(
  amount?: string | number | null,
  asset?: string | null,
  issuer?: string | null,
  decimals: number = 2,
  options?: {
    showCanonical?: boolean;
    compactIssuer?: boolean;
    language?: Language;
    locale?: string;
  },
): string {
  if (amount === undefined || amount === null || amount === "") {
    return "-";
  }

  const assetInfo = resolveAssetIdentifier(asset, issuer);

  if (options?.language || options?.locale) {
    const formatted = formatLocaleAmount(amount, {
      language: options.language,
      locale: options.locale,
      decimals: assetInfo.code
        ? ASSET_PRECISION[assetInfo.code.toUpperCase()]
        : decimals,
    });
    if (options?.showCanonical) {
      return `${formatted} ${assetInfo.canonical}`;
    }
    if (options?.compactIssuer && assetInfo.issuer) {
      return `${formatted} ${assetInfo.code} (${formatAddress(assetInfo.issuer, 4, 4)})`;
    }
    return `${formatted} ${assetInfo.code}`;
  }

  const formatted = formatTokenAmount(amount, decimals);

  if (options?.showCanonical) {
    return `${formatted} ${assetInfo.canonical}`;
  }
  if (options?.compactIssuer && assetInfo.issuer) {
    return `${formatted} ${assetInfo.code} (${formatAddress(assetInfo.issuer, 4, 4)})`;
  }

  return `${formatted} ${assetInfo.code}`;
}

export default function TransactionTable({
  transactions,
  isLoading,
  error,
  currentPage,
  pageSize,
  totalCount,
  onPageChange,
  onPageSizeChange,
  language,
  locale,
  activeAccountAddress,
  accountAddress,
  statusFilter: statusFilterProp,
  onStatusFilterChange,
}: TransactionTableProps) {
  const [internalStatusFilter, setInternalStatusFilter] =
    useState<TransactionStatusFilter>("all");

  const effectiveStatusFilter = statusFilterProp ?? internalStatusFilter;

  const handleStatusFilterChange = (nextStatus: TransactionStatusFilter) => {
    if (statusFilterProp === undefined) {
      setInternalStatusFilter(nextStatus);
    }
    onStatusFilterChange?.(nextStatus);
  };

  const filteredTransactions = filterTransactionsByStatus(
    transactions,
    effectiveStatusFilter,
  );

  const reduxLanguage = useAppSelector(
    (state) => state.ui?.language,
  ) as Language | undefined;

  const currentLanguage = language || reduxLanguage || "en";

  const reduxContext = useContext(ReactReduxContext);

  const storeState = reduxContext?.store?.getState?.() as
    | {
        auth?: { user?: { address?: string; publicKey?: string } };
        account?: { status?: { address?: string; publicKey?: string } };
      }
    | undefined;

  const resolvedActiveAddress =
    activeAccountAddress ||
    accountAddress ||
    storeState?.auth?.user?.address ||
    storeState?.auth?.user?.publicKey ||
    storeState?.account?.status?.address ||
    storeState?.account?.status?.publicKey;

  const totalPages = Math.ceil(totalCount / pageSize);
  const startIndex = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endIndex = Math.min(currentPage * pageSize, totalCount);

  const handleCopyHash = (hash: string) => {
    void navigator.clipboard
      .writeText(hash)
      .then(() => toast.success("Transaction hash copied"))
      .catch(() => toast.error("Could not copy transaction hash"));
  };

  const getOperationType = (
    operations?: StellarOperation[],
  ): string => {
    if (!operations || operations.length === 0) {
      return "Unknown";
    }

    const mainOp = operations[0];
    return OPERATION_TYPE_LABELS[mainOp.type] || mainOp.type;
  };

  const getDirectionIcon = (
    direction: TransactionDirection,
    successful: boolean,
    status?: TransactionLifecycleStatus,
  ) => {
    if (status === "pending") {
      return <Loader2 className="h-4 w-4 animate-spin text-yellow-400" />;
    }

    if (!successful && status !== "confirmed") {
      return <AlertCircle className="h-4 w-4 text-red-400" />;
    }

    switch (direction) {
      case "incoming":
        return <ArrowDownLeft className="h-4 w-4 text-emerald-400" />;
      case "outgoing":
        return <ArrowUpRight className="h-4 w-4 text-blue-400" />;
      case "self":
        return <ArrowLeftRight className="h-4 w-4 text-purple-400" />;
      default:
        return <ArrowUpRight className="h-4 w-4 text-gray-400" />;
    }
  };

  const getDirectionContainerClass = (
    direction: TransactionDirection,
    successful: boolean,
    status?: TransactionLifecycleStatus,
  ) => {
    if (status === "pending") {
      return "bg-yellow-500/20";
    }

    if (!successful && status !== "confirmed") {
      return "bg-red-500/20";
    }

    switch (direction) {
      case "incoming":
        return "bg-emerald-500/20";
      case "outgoing":
        return "bg-blue-500/20";
      case "self":
        return "bg-purple-500/20";
      default:
        return "bg-gray-800";
    }
  };

  if (error) {
    return (
      <Card className="border-red-900/50 bg-red-950/20 p-6">
        <div className="flex items-center space-x-3">
          <AlertCircle className="h-5 w-5 text-red-400" />
          <span className="text-red-400">{error}</span>
        </div>
      </Card>
    );
  }

  if (isLoading && transactions.length === 0) {
    return (
      <Card className="p-12">
        <div className="flex flex-col items-center justify-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <p className="text-gray-400">Loading transactions...</p>
        </div>
      </Card>
    );
  }

  if (transactions.length === 0) {
    return (
      <Card className="p-12">
        <div className="text-center">
          <p className="mb-2 text-gray-400">No transactions found</p>
          <p className="text-xs text-gray-500">
            Your on-chain transaction history will appear here
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="p-6">
        <h2 className="mb-4 text-lg font-semibold text-white">
          Transaction History
        </h2>

        <div className="mb-4">
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <span>Status</span>
            <select
              aria-label="Filter transactions by status"
              value={effectiveStatusFilter}
              onChange={(event) =>
                handleStatusFilterChange(
                  event.target.value as TransactionStatusFilter,
                )
              }
              className="rounded border border-gray-700 bg-gray-900 px-2 py-1 text-white"
            >
              <option value="all">All statuses</option>
              <option value="confirmed">Confirmed</option>
              <option value="successful">Successful</option>
              <option value="failed">Failed</option>
              <option value="pending">Pending</option>
            </select>
          </label>
        </div>

        {/* Transactions Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="px-4 py-3 text-left font-semibold text-gray-300">
                  Type
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-300">
                  Direction
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-300">
                  Hash
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-300">
                  Amount
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-300">
                  Ledger
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-300">
                  Date
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-300">
                  Status
                </th>
                <th className="px-4 py-3 text-right font-semibold text-gray-300">
                  Action
                </th>
              </tr>
            </thead>

            <tbody>
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-8 text-center text-gray-400"
                  >
                    No transactions match this status on this page.
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx) => {
                  const direction = getTransactionDirection(
                    tx,
                    resolvedActiveAddress,
                  );
                  const mainOp =
                    tx.operations && tx.operations.length > 0
                      ? tx.operations.find((o) => o.amount || o.to || o.from) ||
                        tx.operations[0]
                      : null;

                  const assetInfo = resolveAssetIdentifier(
                    mainOp?.asset || mainOp?.asset_code,
                    mainOp?.asset_issuer,
                    mainOp?.asset_type,
                  );

                  const formattedAmount = mainOp?.amount
                    ? formatTransactionAmount(
                        mainOp.amount,
                        direction,
                        assetInfo.code,
                        undefined,
                        {
                          language: currentLanguage,
                          locale,
                          issuer: assetInfo.issuer,
                        },
                      )
                    : "-";

                  return (
                    <tr
                      key={tx.id}
                      className="border-b border-gray-800/50 transition-colors hover:bg-gray-900/50"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center space-x-3">
                          <div
                            className={`rounded-full p-2 ${getDirectionContainerClass(
                              direction,
                              tx.successful,
                              tx.status,
                            )}`}
                          >
                            {getDirectionIcon(
                              direction,
                              tx.successful,
                              tx.status,
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-white">
                              {getOperationType(tx.operations)}
                            </p>
                            <p className="text-xs text-gray-400">
                              {tx.operation_count}
                              {tx.operation_count === 1 ? " op" : " ops"}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <span
                          data-testid={`tx-direction-${tx.id}`}
                          className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium capitalize ${
                            direction === "incoming"
                              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                              : direction === "outgoing"
                                ? "border-blue-500/20 bg-blue-500/10 text-blue-400"
                                : direction === "self"
                                  ? "border-purple-500/20 bg-purple-500/10 text-purple-400"
                                  : "border-gray-700 bg-gray-800 text-gray-400"
                          }`}
                        >
                          {direction === "self" ? "Self-Transfer" : direction}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => handleCopyHash(tx.hash)}
                          className="max-w-xs truncate font-mono text-xs text-blue-400 hover:text-blue-300"
                          title={tx.hash}
                        >
                          {formatAddress(tx.hash)}
                        </button>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex flex-col items-start space-y-0.5">
                          <span
                            data-testid={`tx-amount-${tx.id}`}
                            className={`block font-mono text-sm ${
                              direction === "incoming"
                                ? "font-medium text-emerald-400"
                                : direction === "outgoing"
                                  ? "font-medium text-rose-400"
                                  : direction === "self"
                                    ? "font-medium text-purple-300"
                                    : "text-gray-300"
                            }`}
                          >
                            {formattedAmount}
                          </span>
                          {assetInfo.issuer ? (
                            <span
                              data-testid={`tx-asset-issuer-${tx.id}`}
                              className="inline-flex cursor-pointer items-center gap-1 font-mono text-[11px] text-gray-400 hover:text-gray-300"
                              title={`Canonical Asset: ${assetInfo.canonical}`}
                            >
                              <span className="text-gray-500">issuer:</span>
                              <span>{formatAddress(assetInfo.issuer, 4, 4)}</span>
                            </span>
                          ) : assetInfo.hasIncompleteMetadata ? (
                            <span
                              data-testid={`tx-asset-fallback-${tx.id}`}
                              className="inline-flex items-center gap-1 text-[11px] text-amber-400/90"
                              title="Asset issuer metadata is missing or unverified"
                            >
                              <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400"></span>
                              <span>unverified issuer</span>
                            </span>
                          ) : null}
                          {tx.fee_charged && (
                            <span className="block text-xs text-gray-500">
                              Fee:{" "}
                              {formatTransactionFee(tx.fee_charged, {
                                language: currentLanguage,
                                locale,
                                asset: "XLM",
                              })}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <span className="text-gray-300">#{tx.ledger}</span>
                      </td>

                      <td className="px-4 py-3">
                        <span className="text-gray-300">
                          {formatTransactionDate(tx.created_at, {
                            language: currentLanguage,
                            locale,
                          })}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        {tx.status === "pending" ? (
                          <div className="flex items-center space-x-1">
                            <Loader2 className="h-4 w-4 animate-spin text-yellow-400" />
                            <span className="font-medium text-yellow-400">
                              Pending
                            </span>
                          </div>
                        ) : tx.successful || tx.status === "confirmed" ? (
                          <div className="flex items-center space-x-1">
                            <Check className="h-4 w-4 text-green-400" />
                            <span className="font-medium text-green-400">
                              Success
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-1">
                            <AlertCircle className="h-4 w-4 text-red-400" />
                            <span className="font-medium text-red-400">
                              Failed
                            </span>
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <a
                          href={`https://stellar.expert/explorer/public/tx/${tx.hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center space-x-1 rounded bg-gray-800 px-2 py-1 text-xs text-blue-400 transition-colors hover:bg-gray-700 hover:text-blue-300"
                        >
                          <span>View</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-gray-800 pt-4">
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-sm text-gray-400">
              {effectiveStatusFilter === "all"
                ? `Showing ${startIndex} to ${endIndex} of ${totalCount} transactions`
                : `Showing ${filteredTransactions.length} matching transactions on this page (${totalCount} total)`}
            </span>

            <div className="flex items-center space-x-2">
              <label
                htmlFor="transaction-page-size"
                className="text-sm text-gray-300"
              >
                Per page:
              </label>
              <select
                id="transaction-page-size"
                value={pageSize}
                onChange={(event) =>
                  onPageSizeChange(Number.parseInt(event.target.value, 10))
                }
                className="rounded border border-gray-700 bg-gray-900 px-2 py-1 text-sm text-white transition-colors hover:border-gray-500"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1 || isLoading}
              className={`!p-2 ${
                currentPage === 1 || isLoading
                  ? "cursor-not-allowed opacity-50"
                  : ""
              }`}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <div className="flex items-center space-x-1">
              {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
                let pageNum: number;

                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }

                return (
                  <button
                    key={pageNum}
                    type="button"
                    onClick={() => onPageChange(pageNum)}
                    disabled={isLoading}
                    aria-current={currentPage === pageNum ? "page" : undefined}
                    className={`rounded px-2 py-1 text-sm transition-colors ${
                      currentPage === pageNum
                        ? "bg-blue-600 text-white"
                        : "bg-gray-900 text-gray-300 hover:bg-gray-800"
                    } ${isLoading ? "cursor-not-allowed opacity-50" : ""}`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage >= totalPages || isLoading}
              className={`!p-2 ${
                currentPage >= totalPages || isLoading
                  ? "cursor-not-allowed opacity-50"
                  : ""
              }`}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}