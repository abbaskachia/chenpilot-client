import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import TransactionsPage from "./page";
import type { StellarTransaction, PendingTransactionConfirmation } from "@/types";

const mockDispatch = vi.fn();
const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

const mockTransactions: StellarTransaction[] = [
  {
    id: "tx-confirmed-1",
    hash: "0x1111111111111111111111111111111111111111111111111111111111111111",
    ledger: 100,
    created_at: "2026-10-20T10:00:00Z",
    source_account: "GSOURCE",
    fee_charged: "100",
    operation_count: 1,
    successful: true,
    status: "confirmed",
    operations: [
      {
        id: "op-1",
        type: "payment",
        amount: "50",
        asset: "XLM",
        from: "GSOURCE",
        to: "GDEST",
        source_account: "GSOURCE",
      },
    ],
  },
  {
    id: "tx-failed-1",
    hash: "0x2222222222222222222222222222222222222222222222222222222222222222",
    ledger: 101,
    created_at: "2026-10-20T10:05:00Z",
    source_account: "GSOURCE",
    fee_charged: "100",
    operation_count: 1,
    successful: false,
    status: "failed",
    operations: [
      {
        id: "op-2",
        type: "payment",
        amount: "25",
        asset: "XLM",
        from: "GSOURCE",
        to: "GDEST",
        source_account: "GSOURCE",
      },
    ],
  },
  {
    id: "tx-pending-1",
    hash: "0x3333333333333333333333333333333333333333333333333333333333333333",
    ledger: 102,
    created_at: "2026-10-20T10:10:00Z",
    source_account: "GSOURCE",
    fee_charged: "100",
    operation_count: 1,
    successful: false,
    status: "pending",
    operations: [
      {
        id: "op-3",
        type: "payment",
        amount: "10",
        asset: "XLM",
        from: "GSOURCE",
        to: "GDEST",
        source_account: "GSOURCE",
      },
    ],
  },
];

const mockPendingConfirmations: PendingTransactionConfirmation[] = [
  {
    hash: "0xpendingconfirmationhash1234567890",
    label: "Transfer 15 XLM to Ada",
    status: "pending",
    updatedAt: "2026-10-20T10:15:00Z",
  },
];

let mockState = {
  account: {
    status: {
      publicKey: "GACTIVEUSER1234567890123456789012345678901234567890123456",
    },
    transactions: {
      transactions: mockTransactions,
      isLoading: false,
      error: null,
      isRefreshing: false,
      refreshError: null,
      lastUpdatedAt: "2026-10-20T10:00:00Z",
      nextCursor: "cursor-older-page-token-123",
      isLoadingMore: false,
      loadMoreError: null,
      pending: mockPendingConfirmations,
    },
  },
  ui: {
    language: "en",
  },
};

vi.mock("react-redux", () => ({
  useDispatch: () => mockDispatch,
  useSelector: (selector: (state: typeof mockState) => unknown) =>
    selector(mockState),
}));

describe("TransactionsPage status filtering and cursor state", () => {
  beforeEach(() => {
    mockDispatch.mockClear();
    mockPush.mockClear();
    mockState = {
      account: {
        status: {
          publicKey: "GACTIVEUSER1234567890123456789012345678901234567890123456",
        },
        transactions: {
          transactions: mockTransactions,
          isLoading: false,
          error: null,
          isRefreshing: false,
          refreshError: null,
          lastUpdatedAt: "2026-10-20T10:00:00Z",
          nextCursor: "cursor-older-page-token-123",
          isLoadingMore: false,
          loadMoreError: null,
          pending: mockPendingConfirmations,
        },
      },
      ui: {
        language: "en",
      },
    };
  });

  it("renders status options supported by the transaction contract", () => {
    render(<TransactionsPage />);

    const select = screen.getByRole("combobox", {
      name: /filter transactions by status/i,
    });
    expect(select).toBeInTheDocument();

    const options = Array.from(select.querySelectorAll("option")).map(
      (opt) => opt.value,
    );
    expect(options).toEqual([
      "all",
      "confirmed",
      "successful",
      "failed",
      "pending",
    ]);
  });

  it("filters for confirmed transactions when confirmed is selected", () => {
    render(<TransactionsPage />);

    const select = screen.getByRole("combobox", {
      name: /filter transactions by status/i,
    });
    fireEvent.change(select, { target: { value: "confirmed" } });

    expect(screen.getByText("Transaction 0x111111...")).toBeInTheDocument();
    expect(screen.queryByText("Transaction 0x222222...")).not.toBeInTheDocument();
    expect(screen.queryByText("Transaction 0x333333...")).not.toBeInTheDocument();
    // Awaiting confirmation card should not be shown
    expect(screen.queryByText("Awaiting confirmation")).not.toBeInTheDocument();
  });

  it("keeps pending distinct from failed transactions when filtering by failed", () => {
    render(<TransactionsPage />);

    const select = screen.getByRole("combobox", {
      name: /filter transactions by status/i,
    });
    fireEvent.change(select, { target: { value: "failed" } });

    expect(screen.getByText("Transaction 0x222222...")).toBeInTheDocument();
    expect(screen.queryByText("Transaction 0x111111...")).not.toBeInTheDocument();
    expect(screen.queryByText("Transaction 0x333333...")).not.toBeInTheDocument();
    // Pending confirmations must not be shown under failed
    expect(screen.queryByText("Awaiting confirmation")).not.toBeInTheDocument();
    expect(screen.queryByText("Transfer 15 XLM to Ada")).not.toBeInTheDocument();
  });

  it("shows pending transactions and confirmations when pending is selected", () => {
    render(<TransactionsPage />);

    const select = screen.getByRole("combobox", {
      name: /filter transactions by status/i,
    });
    fireEvent.change(select, { target: { value: "pending" } });

    // Pending confirmation is visible
    expect(screen.getByText("Awaiting confirmation")).toBeInTheDocument();
    expect(screen.getByText("Transfer 15 XLM to Ada")).toBeInTheDocument();
    // Pending transaction card is visible
    expect(screen.getByText("Transaction 0x333333...")).toBeInTheDocument();
    // Confirmed and failed transactions are hidden
    expect(screen.queryByText("Transaction 0x111111...")).not.toBeInTheDocument();
    expect(screen.queryByText("Transaction 0x222222...")).not.toBeInTheDocument();
  });

  it("combines with existing filters without dropping cursor state", () => {
    render(<TransactionsPage />);

    // Cursor button is visible initially
    const loadOlderButton = screen.getByRole("button", {
      name: /load older transactions/i,
    });
    expect(loadOlderButton).toBeInTheDocument();

    // Change status filter to failed
    const select = screen.getByRole("combobox", {
      name: /filter transactions by status/i,
    });
    fireEvent.change(select, { target: { value: "failed" } });

    // Load older transactions button remains available
    expect(
      screen.getByRole("button", { name: /load older transactions/i }),
    ).toBeInTheDocument();

    // Clicking it triggers load older with the active cursor
    fireEvent.click(
      screen.getByRole("button", { name: /load older transactions/i }),
    );
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.any(Function), // thunk from getOlderTransactionHistory
    );
  });
});
