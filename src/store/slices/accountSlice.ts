
import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import {
  AccountStatus,
  WalletBalance,
  StellarTransaction,
  AccountState,
  Trustline,
  AddTrustlineRequest,
  TransactionFilters,
} from "@/types";
import { horizonFetch } from "@/utils/horizonFetch";
import apiService from "@/services/api";
import {
  mergeNewestTransactionHistory,
  mergeTransactionHistory,
  reconcilePendingConfirmations,
} from "@/utils/transactionHistory";

export type { TransactionFilters };

export const initialFilters: TransactionFilters = {
  type: "all",
  asset: "all",
  direction: "all",
  startDate: "",
  endDate: "",
};

type NetworkHealthStatus = "healthy" | "degraded" | "down" | "unknown";
type AccountSyncState = "synced" | "syncing" | "desynced";

const initialState: AccountState = {
  status: null,
  balance: null,
  transactions: {
    transactions: [],
    isLoading: false,
    error: null,
    isRefreshing: false,
    refreshError: null,
    lastUpdatedAt: null,
    nextCursor: null,
    isLoadingMore: false,
    loadMoreError: null,
    pending: [],
  },
  filters: initialFilters,
  isLoading: false,
  error: null,
  network: {
    status: "unknown",
    latestLedger: null,
    ledgerCloseTimeMs: null,
    ledgerAgeSeconds: null,
    congestion: false,
    accountSyncState: "syncing",
    lastUpdated: null,
    isLoading: false,
    error: null,
  },
  trustlines: [],
  isLoadingTrustlines: false,
  trustlinesError: null,
};

// Async thunks
export const getAccountStatus = createAsyncThunk(
  "account/getStatus",
  async () => {
    const mockStatus: AccountStatus = {
      isDeployed: true,
      isFunded: true,
      deploymentTransactionHash: "0xmockdeploymenthash",
      fundingTransactionHash: "0xmockfundinghash",
      balance: "1000000000000000000",
      address: "0x1234567890abcdef",
      publicKey: "0xabcdef1234567890",
    };

    return mockStatus;
  },
);

export const getBalance = createAsyncThunk("account/getBalance", async () => {
  return "1000000000000000000";
});

export const getStellarNetworkStatus = createAsyncThunk(
  "account/getStellarNetworkStatus",
  async (_, { rejectWithValue }) => {
    try {
      const response = await horizonFetch(
        "https://horizon.stellar.org/ledgers?order=desc&limit=1",
      );

      if (!response.ok) {
        return rejectWithValue("Failed to fetch Stellar network status");
      }

      const data = await response.json();
      const latestLedgerRecord = data?._embedded?.records?.[0];

      if (!latestLedgerRecord) {
        return rejectWithValue("No ledger data available");
      }

      const latestLedger = Number(latestLedgerRecord.sequence);
      const closedAt = latestLedgerRecord.closed_at
        ? new Date(latestLedgerRecord.closed_at).getTime()
        : null;

      const ledgerAgeSeconds =
        closedAt !== null
          ? Math.max(0, Math.floor((Date.now() - closedAt) / 1000))
          : null;

      const maxTxSetSize = latestLedgerRecord.max_tx_set_size
        ? Number(latestLedgerRecord.max_tx_set_size)
        : 0;

      const successfulTxCount = latestLedgerRecord.successful_transaction_count
        ? Number(latestLedgerRecord.successful_transaction_count)
        : 0;

      const congestion =
        maxTxSetSize > 0 ? successfulTxCount / maxTxSetSize >= 0.85 : false;

      return {
        latestLedger,
        ledgerCloseTimeMs: closedAt,
        ledgerAgeSeconds,
        congestion,
        lastUpdated: new Date().toISOString(),
      };
    } catch (error: unknown) {
      return rejectWithValue(
        (error as { message?: string }).message ||
          "Failed to fetch Stellar network status",
      );
    }
  },
);

export const deployAccount = createAsyncThunk("account/deploy", async () => {
  return { success: true, transactionHash: "0xmockdeployhash" };
});

export const fundAccount = createAsyncThunk("account/fund", async () => {
  return { success: true, transactionHash: "0xmockfundhash" };
});

export const getAutoFundingStats = createAsyncThunk(
  "account/getAutoFundingStats",
  async () => {
    return {
      totalFunded: 10,
      totalAmount: "10000000000000000000",
      lastFunding: new Date().toISOString(),
    };
  },
);

/** Number of ledger transactions requested per history page. */
export const TRANSACTION_HISTORY_PAGE_SIZE = 50;

export interface TransactionHistoryPage {
  transactions: StellarTransaction[];
  nextCursor: string | null;
  fetchedAt: string;
}

function mapHorizonTransaction(
  record: Record<string, unknown>,
): StellarTransaction {
  return {
    id: record.id as string,
    hash: record.hash as string,
    ledger: record.ledger as number,
    created_at: record.created_at as string,
    source_account: record.source_account as string,
    fee_charged: record.fee_charged as string,
    operation_count: record.operation_count as number,
    successful: record.successful as boolean,
    operations:
      (
        record._embedded as {
          records?: Record<string, unknown>[];
        }
      )?.records?.map((op: Record<string, unknown>) => ({
        id: op.id as string,
        type: op.type as string,
        amount: op.amount as string,
        asset:
          op.asset_type === "native"
            ? "XLM"
            : `${op.asset_code}:${op.asset_issuer}`,
        from: op.from as string,
        to: op.to as string,
        source_account: op.source_account as string,
      })) || [],
  };
}

/**
 * Read one page of account transactions from Horizon.
 * The next cursor is available only when a full page was returned.
 */
async function fetchTransactionHistoryPage(
  publicKey: string,
  cursor?: string,
): Promise<TransactionHistoryPage> {
  const params = new URLSearchParams({
    order: "desc",
    limit: String(TRANSACTION_HISTORY_PAGE_SIZE),
  });

  if (cursor) {
    params.set("cursor", cursor);
  }

  const response = await horizonFetch(
    `https://horizon.stellar.org/accounts/${publicKey}/transactions?${params.toString()}`,
  );

  if (!response.ok) {
    throw new Error("Failed to fetch transaction history");
  }

  const data = await response.json();
  const records: Record<string, unknown>[] = data?._embedded?.records ?? [];
  const transactions = records.map(mapHorizonTransaction);
  const oldestRecord = records[records.length - 1];

  const nextCursor =
    records.length === TRANSACTION_HISTORY_PAGE_SIZE &&
    typeof oldestRecord?.paging_token === "string"
      ? oldestRecord.paging_token
      : null;

  return {
    transactions,
    nextCursor,
    fetchedAt: new Date().toISOString(),
  };
}

export const getTransactionHistory = createAsyncThunk(
  "account/getTransactionHistory",
  async (publicKey: string, { rejectWithValue }) => {
    try {
      return await fetchTransactionHistoryPage(publicKey);
    } catch (error: unknown) {
      return rejectWithValue(
        (error as { message?: string }).message ||
          "Failed to fetch transaction history",
      );
    }
  },
);

/** Refresh the newest page without dropping older pages already loaded. */
export const refreshTransactionHistory = createAsyncThunk(
  "account/refreshTransactionHistory",
  async (publicKey: string, { rejectWithValue }) => {
    try {
      return await fetchTransactionHistoryPage(publicKey);
    } catch (error: unknown) {
      return rejectWithValue(
        (error as { message?: string }).message ||
          "Failed to refresh transaction history",
      );
    }
  },
);

/** Load the next older page using the Horizon paging cursor. */
export const getOlderTransactionHistory = createAsyncThunk(
  "account/getOlderTransactionHistory",
  async (
    { publicKey, cursor }: { publicKey: string; cursor: string },
    { rejectWithValue },
  ) => {
    try {
      return await fetchTransactionHistoryPage(publicKey, cursor);
    } catch (error: unknown) {
      return rejectWithValue(
        (error as { message?: string }).message ||
          "Failed to load older transactions",
      );
    }
  },
);

export const getAccountTransactions = createAsyncThunk(
  "account/getAccountTransactions",
  async (
    {
      userId,
      page = 1,
      limit = 10,
    }: {
      userId: string;
      page?: number;
      limit?: number;
    },
    { rejectWithValue },
  ) => {
    try {
      const response = await apiService.getAccountTransactions(
        userId,
        page,
        limit,
      );

      if (!response.success) {
        return rejectWithValue(
          response.message || "Failed to fetch transactions",
        );
      }

      return response.data;
    } catch (error: unknown) {
      return rejectWithValue(
        (error as { message?: string }).message ||
          "Failed to fetch account transactions",
      );
    }
  },
);

// Trustline async thunks
export const fetchTrustlines = createAsyncThunk(
  "account/fetchTrustlines",
  async (publicKey: string, { rejectWithValue }) => {
    try {
      return await apiService.fetchAccountTrustlines(publicKey);
    } catch (error: unknown) {
      return rejectWithValue(
        (error as { message?: string }).message ||
          "Failed to fetch account trustlines",
      );
    }
  },
);

export const addAccountTrustline = createAsyncThunk(
  "account/addTrustline",
  async (
    {
      publicKey,
      data,
    }: {
      publicKey: string;
      data: AddTrustlineRequest;
    },
    { dispatch, rejectWithValue },
  ) => {
    try {
      const result = await apiService.addTrustline(publicKey, data);
      await dispatch(fetchTrustlines(publicKey)).unwrap();
      return result;
    } catch (error: unknown) {
      return rejectWithValue(
        (error as { message?: string })?.message ||
          "Failed to add trustline",
      );
    }
  },
);

export const removeAccountTrustline = createAsyncThunk(
  "account/removeTrustline",
  async (
    {
      publicKey,
      assetCode,
      assetIssuer,
    }: {
      publicKey: string;
      assetCode: string;
      assetIssuer: string;
    },
    { dispatch, rejectWithValue },
  ) => {
    try {
      const result = await apiService.removeTrustline(
        publicKey,
        assetCode,
        assetIssuer,
      );

      await dispatch(fetchTrustlines(publicKey)).unwrap();
      return result;
    } catch (error: unknown) {
      return rejectWithValue(
        (error as { message?: string })?.message ||
          "Failed to remove trustline",
      );
    }
  },
);

const accountSlice = createSlice({
  name: "account",
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },

    updateAccountStatus: (
      state,
      action: PayloadAction<Partial<AccountStatus>>,
    ) => {
      if (state.status) {
        state.status = { ...state.status, ...action.payload };
      } else {
        state.status = action.payload as AccountStatus;
      }
    },

    updateBalance: (state, action: PayloadAction<Partial<WalletBalance>>) => {
      if (state.balance) {
        state.balance = { ...state.balance, ...action.payload };
      } else {
        state.balance = action.payload as WalletBalance;
      }
    },

    clearAccount: (state) => {
      state.status = null;
      state.balance = null;
      state.error = null;
      state.trustlines = [];
      state.trustlinesError = null;
    },

    // Trustline reducers
    setTrustlines: (state, action: PayloadAction<Trustline[]>) => {
      state.trustlines = action.payload;
    },

    setLoadingTrustlines: (state, action: PayloadAction<boolean>) => {
      state.isLoadingTrustlines = action.payload;
    },

    setTrustlinesError: (state, action: PayloadAction<string | null>) => {
      state.trustlinesError = action.payload;
    },

    // Transaction filters
    setTransactionFilter: (
      state,
      action: PayloadAction<Partial<TransactionFilters>>,
    ) => {
      state.filters = {
        ...(state.filters || initialFilters),
        ...action.payload,
      };
    },

    clearTransactionFilters: (state) => {
      state.filters = { ...initialFilters };
    },

    /**
     * Record a submitted wallet action as pending.
     * Existing terminal transactions are never regressed.
     */
    trackPendingTransaction: (
      state,
      action: PayloadAction<{
        hash: string;
        label: string;
        at: string;
      }>,
    ) => {
      const { hash, label, at } = action.payload;
      const existing = state.transactions.pending.find(
        (entry) => entry.hash === hash,
      );

      if (existing) {
        existing.label = label;
        return;
      }

      state.transactions.pending.push({
        hash,
        label,
        status: "pending",
        updatedAt: at,
      });
    },

    /** Resolve a tracked transaction to an authoritative terminal state. */
    resolvePendingTransaction: (
      state,
      action: PayloadAction<{
        hash: string;
        status: "confirmed" | "failed";
        at: string;
      }>,
    ) => {
      const { hash, status, at } = action.payload;
      const existing = state.transactions.pending.find(
        (entry) => entry.hash === hash,
      );

      if (existing) {
        existing.status = status;
        existing.updatedAt = at;
        return;
      }

      state.transactions.pending.push({
        hash,
        label: "Transaction",
        status,
        updatedAt: at,
      });
    },
  },

  extraReducers: (builder) => {
    builder
      // Get account status
      .addCase(getAccountStatus.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(getAccountStatus.fulfilled, (state, action) => {
        state.isLoading = false;
        state.status = action.payload;
        state.error = null;
      })
      .addCase(getAccountStatus.rejected, (state, action) => {
        state.isLoading = false;
        state.error =
          (action.payload as string) ||
          action.error.message ||
          "Failed to fetch account status";
      })

      // Get balance
      .addCase(getBalance.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(getBalance.fulfilled, (state, action) => {
        state.isLoading = false;
        state.balance = action.payload;
        state.error = null;
      })
      .addCase(getBalance.rejected, (state, action) => {
        state.isLoading = false;
        state.error =
          (action.payload as string) ||
          action.error.message ||
          "Failed to fetch balance";
      })

      // Stellar network status
      .addCase(getStellarNetworkStatus.pending, (state) => {
        state.network.isLoading = true;
        state.network.error = null;
        state.network.accountSyncState = "syncing";
      })
      .addCase(getStellarNetworkStatus.fulfilled, (state, action) => {
        const {
          latestLedger,
          ledgerCloseTimeMs,
          ledgerAgeSeconds,
          congestion,
          lastUpdated,
        } = action.payload;

        let status: NetworkHealthStatus = "healthy";

        if (ledgerAgeSeconds !== null && ledgerAgeSeconds > 30) {
          status = "down";
        } else if (ledgerAgeSeconds !== null && ledgerAgeSeconds > 15) {
          status = "degraded";
        } else if (congestion) {
          status = "degraded";
        }

        const accountSyncState: AccountSyncState =
          ledgerAgeSeconds === null || ledgerAgeSeconds > 30
            ? "desynced"
            : ledgerAgeSeconds > 15
              ? "syncing"
              : "synced";

        state.network = {
          ...state.network,
          status,
          latestLedger,
          ledgerCloseTimeMs,
          ledgerAgeSeconds,
          congestion,
          lastUpdated,
          accountSyncState,
          isLoading: false,
          error: null,
        };
      })
      .addCase(getStellarNetworkStatus.rejected, (state, action) => {
        state.network.isLoading = false;
        state.network.status = "down";
        state.network.error =
          (action.payload as string) ||
          action.error.message ||
          "Failed to fetch Stellar network status";
        state.network.accountSyncState = "desynced";
      })

      // Deploy account
      .addCase(deployAccount.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(deployAccount.fulfilled, (state, action) => {
        state.isLoading = false;

        if (state.status) {
          state.status.isDeployed = true;
          state.status.deploymentTransactionHash =
            action.payload.transactionHash;
        }

        state.error = null;
      })
      .addCase(deployAccount.rejected, (state, action) => {
        state.isLoading = false;
        state.error =
          (action.payload as string) ||
          action.error.message ||
          "Failed to deploy account";
      })

      // Fund account
      .addCase(fundAccount.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fundAccount.fulfilled, (state, action) => {
        state.isLoading = false;

        if (state.status) {
          state.status.isFunded = true;
          state.status.fundingTransactionHash = action.payload.transactionHash;
        }

        state.error = null;
      })
      .addCase(fundAccount.rejected, (state, action) => {
        state.isLoading = false;
        state.error =
          (action.payload as string) ||
          action.error.message ||
          "Failed to fund account";
      })

      // Auto-funding stats
      .addCase(getAutoFundingStats.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(getAutoFundingStats.fulfilled, (state) => {
        state.isLoading = false;
        state.error = null;
      })
      .addCase(getAutoFundingStats.rejected, (state, action) => {
        state.isLoading = false;
        state.error =
          (action.payload as string) ||
          action.error.message ||
          "Failed to fetch auto-funding stats";
      })

      // Initial transaction history
      .addCase(getTransactionHistory.pending, (state) => {
        state.transactions.isLoading = true;
        state.transactions.error = null;
      })
      .addCase(getTransactionHistory.fulfilled, (state, action) => {
        const { transactions, nextCursor, fetchedAt } = action.payload;

        state.transactions.isLoading = false;
        state.transactions.transactions = transactions;
        state.transactions.nextCursor = nextCursor;
        state.transactions.lastUpdatedAt = fetchedAt;
        state.transactions.error = null;
        state.transactions.refreshError = null;
        state.transactions.loadMoreError = null;

        state.transactions.pending = reconcilePendingConfirmations(
          state.transactions.pending,
          transactions,
          fetchedAt,
        );
      })
      .addCase(getTransactionHistory.rejected, (state, action) => {
        state.transactions.isLoading = false;
        state.transactions.error =
          (action.payload as string) ||
          action.error.message ||
          "Failed to fetch transaction history";
      })

      // Refresh newest transaction history page
      .addCase(refreshTransactionHistory.pending, (state) => {
        state.transactions.isRefreshing = true;
        state.transactions.refreshError = null;
      })
      .addCase(refreshTransactionHistory.fulfilled, (state, action) => {
        const { transactions, nextCursor, fetchedAt } = action.payload;
        const hadHistory = state.transactions.transactions.length > 0;

        state.transactions.transactions = mergeNewestTransactionHistory(
          state.transactions.transactions,
          transactions,
        );

        if (!hadHistory) {
          state.transactions.nextCursor = nextCursor;
        }

        state.transactions.isRefreshing = false;
        state.transactions.lastUpdatedAt = fetchedAt;
        state.transactions.refreshError = null;

        state.transactions.pending = reconcilePendingConfirmations(
          state.transactions.pending,
          transactions,
          fetchedAt,
        );
      })
      .addCase(refreshTransactionHistory.rejected, (state, action) => {
        state.transactions.isRefreshing = false;
        state.transactions.refreshError =
          (action.payload as string) ||
          action.error.message ||
          "Failed to refresh transaction history";
      })

      // Load older transactions
      .addCase(getOlderTransactionHistory.pending, (state) => {
        state.transactions.isLoadingMore = true;
        state.transactions.loadMoreError = null;
      })
      .addCase(getOlderTransactionHistory.fulfilled, (state, action) => {
        const { transactions, nextCursor, fetchedAt } = action.payload;

        state.transactions.transactions = mergeTransactionHistory(
          state.transactions.transactions,
          transactions,
        );

        state.transactions.nextCursor = nextCursor;
        state.transactions.isLoadingMore = false;
        state.transactions.loadMoreError = null;

        state.transactions.pending = reconcilePendingConfirmations(
          state.transactions.pending,
          transactions,
          fetchedAt,
        );
      })
      .addCase(getOlderTransactionHistory.rejected, (state, action) => {
        state.transactions.isLoadingMore = false;
        state.transactions.loadMoreError =
          (action.payload as string) ||
          action.error.message ||
          "Failed to load older transactions";
      })

      // API account transactions
      .addCase(getAccountTransactions.pending, (state) => {
        state.transactions.isLoading = true;
        state.transactions.error = null;
      })
      .addCase(getAccountTransactions.fulfilled, (state, action) => {
        state.transactions.isLoading = false;
        state.transactions.transactions = action.payload.transactions;
        state.transactions.error = null;
      })
      .addCase(getAccountTransactions.rejected, (state, action) => {
        state.transactions.isLoading = false;
        state.transactions.error =
          (action.payload as string) ||
          action.error.message ||
          "Failed to fetch account transactions";
      })

      // Fetch trustlines
      .addCase(fetchTrustlines.pending, (state) => {
        state.isLoadingTrustlines = true;
        state.trustlinesError = null;
      })
      .addCase(fetchTrustlines.fulfilled, (state, action) => {
        state.isLoadingTrustlines = false;
        state.trustlines = action.payload;
        state.trustlinesError = null;
      })
      .addCase(fetchTrustlines.rejected, (state, action) => {
        state.isLoadingTrustlines = false;
        state.trustlinesError =
          (action.payload as string) ||
          action.error.message ||
          "Failed to fetch account trustlines";
      })

      // Add trustline
      .addCase(addAccountTrustline.pending, (state) => {
        state.isLoadingTrustlines = true;
        state.trustlinesError = null;
      })
      .addCase(addAccountTrustline.fulfilled, (state) => {
        state.isLoadingTrustlines = false;
        state.trustlinesError = null;
      })
      .addCase(addAccountTrustline.rejected, (state, action) => {
        state.isLoadingTrustlines = false;
        state.trustlinesError =
          (action.payload as string) ||
          action.error.message ||
          "Failed to add trustline";
      })

      // Remove trustline
      .addCase(removeAccountTrustline.pending, (state) => {
        state.isLoadingTrustlines = true;
        state.trustlinesError = null;
      })
      .addCase(removeAccountTrustline.fulfilled, (state) => {
        state.isLoadingTrustlines = false;
        state.trustlinesError = null;
      })
      .addCase(removeAccountTrustline.rejected, (state, action) => {
        state.isLoadingTrustlines = false;
        state.trustlinesError =
          (action.payload as string) ||
          action.error.message ||
          "Failed to remove trustline";
      });
  },
});

export const {
  clearError,
  updateAccountStatus,
  updateBalance,
  clearAccount,
  setTrustlines,
  setLoadingTrustlines,
  setTrustlinesError,
  setTransactionFilter,
  clearTransactionFilters,
  trackPendingTransaction,
  resolvePendingTransaction,
} = accountSlice.actions;

export default accountSlice.reducer;
