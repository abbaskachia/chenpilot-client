import { describe, expect, it } from "vitest";
import { filterTransactionsByStatus } from "./transactionFilters";

describe("filterTransactionsByStatus", () => {
  const transactions = [
    { id: "tx-success", successful: true },
    { id: "tx-failed", successful: false },
    { id: "tx-pending", successful: false, status: "pending" as const },
    { id: "tx-confirmed", successful: true, status: "confirmed" as const },
    { id: "tx-explicit-failed", successful: false, status: "failed" as const },
  ];

  it("returns all transaction statuses when no status filter is selected", () => {
    expect(filterTransactionsByStatus(transactions, "all")).toEqual(transactions);
  });

  it("keeps successful and failed transactions in separate results", () => {
    const legacyTransactions = [
      { id: "success", successful: true },
      { id: "failed", successful: false },
    ];
    expect(filterTransactionsByStatus(legacyTransactions, "successful")).toEqual([
      legacyTransactions[0],
    ]);
    expect(filterTransactionsByStatus(legacyTransactions, "failed")).toEqual([
      legacyTransactions[1],
    ]);
  });

  it("supports 'confirmed' and 'successful' filter aliases", () => {
    const confirmedResults = filterTransactionsByStatus(transactions, "confirmed");
    const successfulResults = filterTransactionsByStatus(transactions, "successful");

    expect(confirmedResults).toEqual([transactions[0], transactions[3]]);
    expect(successfulResults).toEqual([transactions[0], transactions[3]]);
  });

  it("keeps pending distinct from failed transactions", () => {
    const failedResults = filterTransactionsByStatus(transactions, "failed");

    expect(failedResults).toEqual([transactions[1], transactions[4]]);
    expect(failedResults).not.toContainEqual(transactions[2]);
  });

  it("filters for pending transactions exclusively", () => {
    const pendingResults = filterTransactionsByStatus(transactions, "pending");

    expect(pendingResults).toEqual([transactions[2]]);
  });

  it("handles empty transaction lists without error", () => {
    expect(filterTransactionsByStatus([], "all")).toEqual([]);
    expect(filterTransactionsByStatus([], "pending")).toEqual([]);
    expect(filterTransactionsByStatus([], "confirmed")).toEqual([]);
    expect(filterTransactionsByStatus([], "failed")).toEqual([]);
  });
});
