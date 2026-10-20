import { describe, expect, it } from "vitest";
import { filterTransactionsByStatus } from "./transactionFilters";

describe("filterTransactionsByStatus", () => {
  const transactions = [
    { id: "success", successful: true },
    { id: "failed", successful: false },
  ];

  it("returns all transaction statuses when no status filter is selected", () => {
    expect(filterTransactionsByStatus(transactions, "all")).toEqual(transactions);
  });

  it("keeps successful and failed transactions in separate results", () => {
    expect(filterTransactionsByStatus(transactions, "successful")).toEqual([
      transactions[0],
    ]);
    expect(filterTransactionsByStatus(transactions, "failed")).toEqual([
      transactions[1],
    ]);
  });
});
