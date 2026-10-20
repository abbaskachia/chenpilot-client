'use client';

import React, { useState } from 'react';
import { StellarTransaction, StellarOperation } from '@/types';
import { formatAddress, formatTokenAmount } from '@/utils/format';
import { filterTransactionsByStatus } from '@/utils/transactionFilters';
import type { TransactionStatusFilter } from '@/utils/transactionFilters';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  ExternalLink,
  Check,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface TransactionTableProps {
  transactions: StellarTransaction[];
  isLoading: boolean;
  error: string | null;
  currentPage: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

const OPERATION_TYPE_LABELS: { [key: string]: string } = {
  payment: 'Payment',
  create_account: 'Create Account',
  account_merge: 'Account Merge',
  manage_offer: 'Manage Offer',
  create_passive_offer: 'Create Passive Offer',
  set_options: 'Set Options',
  change_trust: 'Change Trust',
  allow_trust: 'Allow Trust',
  account_created: 'Account Created',
  invoke_host_function: 'Invoke Host Function',
  bump_sequence: 'Bump Sequence',
  ext_soroban_op: 'Soroban Operation',
};

export default function TransactionTable({
  transactions,
  isLoading,
  error,
  currentPage,
  pageSize,
  totalCount,
  onPageChange,
  onPageSizeChange,
}: TransactionTableProps) {
  const [statusFilter, setStatusFilter] = useState<TransactionStatusFilter>('all');
  const filteredTransactions = filterTransactionsByStatus(transactions, statusFilter);
  const totalPages = Math.ceil(totalCount / pageSize);
  const startIndex = (currentPage - 1) * pageSize + 1;
  const endIndex = Math.min(currentPage * pageSize, totalCount);

  const handleCopyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    toast.success('Transaction hash copied');
  };

  const getOperationType = (operations: StellarOperation[]): string => {
    if (!operations || operations.length === 0) return 'Unknown';
    const mainOp = operations[0];
    return OPERATION_TYPE_LABELS[mainOp.type] || mainOp.type;
  };

  const getOperationDetails = (operations: StellarOperation[]): string | null => {
    if (!operations || operations.length === 0) return null;
    const mainOp = operations[0];
    return mainOp.amount ? `${formatTokenAmount(mainOp.amount, 2)} ${mainOp.asset}` : null;
  };

  if (error) {
    return (
      <Card>
        <div className="flex items-center space-x-3 p-4 bg-red-500/10 rounded-lg border border-red-500/20">
          <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
          <span className="text-sm text-red-300">{error}</span>
        </div>
      </Card>
    );
  }

  if (isLoading && transactions.length === 0) {
    return (
      <Card>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 text-blue-400 animate-spin" />
          <span className="ml-3 text-gray-300">Loading transactions...</span>
        </div>
      </Card>
    );
  }

  if (transactions.length === 0) {
    return (
      <Card>
        <div className="text-center py-12">
          <p className="text-gray-400 mb-2">No transactions found</p>
          <p className="text-xs text-gray-500">
            Your on-chain transaction history will appear here
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="space-y-4">
        <label className="flex items-center gap-2 text-sm text-gray-300">
          <span>Status</span>
          <select
            aria-label="Filter transactions by status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as TransactionStatusFilter)}
            className="px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white"
          >
            <option value="all">All statuses</option>
            <option value="successful">Successful</option>
            <option value="failed">Failed</option>
          </select>
        </label>
        {/* Transactions Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left py-3 px-4 font-semibold text-gray-300">
                  Type
                </th>
                <th className="text-left py-3 px-4 font-semibold text-gray-300">
                  Hash
                </th>
                <th className="text-left py-3 px-4 font-semibold text-gray-300">
                  Amount
                </th>
                <th className="text-left py-3 px-4 font-semibold text-gray-300">
                  Ledger
                </th>
                <th className="text-left py-3 px-4 font-semibold text-gray-300">
                  Date
                </th>
                <th className="text-left py-3 px-4 font-semibold text-gray-300">
                  Status
                </th>
                <th className="text-right py-3 px-4 font-semibold text-gray-300">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 px-4 text-center text-gray-400">
                    No transactions match this status on this page
                  </td>
                </tr>
              ) : filteredTransactions.map((tx) => (
                <tr
                  key={tx.id}
                  className="border-b border-gray-800/50 hover:bg-gray-900/50 transition-colors"
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center space-x-2">
                      <div
                        className={`p-2 rounded-full ${
                          tx.successful
                            ? 'bg-blue-500/20'
                            : 'bg-red-500/20'
                        }`}
                      >
                        <ArrowUpRight
                          className={`h-4 w-4 ${
                            tx.successful
                              ? 'text-blue-400'
                              : 'text-red-400'
                          }`}
                        />
                      </div>
                      <div>
                        <p className="font-medium text-white">
                          {getOperationType(tx.operations)}
                        </p>
                        <p className="text-xs text-gray-400">
                          {tx.operation_count}
                          {tx.operation_count === 1 ? ' op' : ' ops'}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <button
                      onClick={() => handleCopyHash(tx.hash)}
                      className="font-mono text-xs text-blue-400 hover:text-blue-300 truncate max-w-xs"
                      title={tx.hash}
                    >
                      {formatAddress(tx.hash)}
                    </button>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-gray-300">
                      {getOperationDetails(tx.operations) || '-'}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-gray-300">#{tx.ledger}</span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-gray-300">
                      {new Date(tx.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    {tx.successful ? (
                      <div className="flex items-center space-x-1">
                        <Check className="h-4 w-4 text-green-400" />
                        <span className="text-green-400 font-medium">Success</span>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-1">
                        <AlertCircle className="h-4 w-4 text-red-400" />
                        <span className="text-red-400 font-medium">Failed</span>
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <a
                      href={`https://stellar.expert/explorer/public/tx/${tx.hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center space-x-1 px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 transition-colors text-xs text-blue-400 hover:text-blue-300"
                    >
                      <span>View</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-800">
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-400">
              {statusFilter === 'all'
                ? `Showing ${startIndex} to ${endIndex} of ${totalCount} transactions`
                : `Showing ${filteredTransactions.length} matching transactions on this page (${totalCount} total)`}
            </span>
            <div className="flex items-center space-x-2">
              <label className="text-sm text-gray-300">Per page:</label>
              <select
                value={pageSize}
                onChange={(e) => onPageSizeChange(parseInt(e.target.value))}
                className="px-2 py-1 bg-gray-900 border border-gray-700 rounded text-sm text-white hover:border-gray-500 transition-colors"
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
              className={`!p-2 ${currentPage === 1 || isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
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
                    onClick={() => onPageChange(pageNum)}
                    disabled={isLoading}
                    className={`px-2 py-1 rounded text-sm transition-colors ${
                      currentPage === pageNum
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-900 text-gray-300 hover:bg-gray-800'
                    } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
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
              className={`!p-2 ${currentPage >= totalPages || isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
