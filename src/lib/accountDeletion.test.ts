import { afterEach, describe, expect, it } from "vitest";
import { ACCOUNT_STORAGE_KEYS, clearAccountLocalStorage } from "./accountDeletion";

describe("clearAccountLocalStorage", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("clears chat history and drafts", () => {
    localStorage.setItem(ACCOUNT_STORAGE_KEYS.token, "tok");
    localStorage.setItem(ACCOUNT_STORAGE_KEYS.user, "{}");
    localStorage.setItem(ACCOUNT_STORAGE_KEYS.conversations, "[]");
    localStorage.setItem(ACCOUNT_STORAGE_KEYS.chatHistory, "{}");
    localStorage.setItem(ACCOUNT_STORAGE_KEYS.drafts, "hello");
    localStorage.setItem(ACCOUNT_STORAGE_KEYS.queue, "[]");

    const result = clearAccountLocalStorage();

    expect(result.token).toBe(true);
    expect(result.conversations).toBe(true);
    expect(result.drafts).toBe(true);
    expect(localStorage.getItem("chat_history")).toBeNull();
    expect(localStorage.getItem("chat_drafts")).toBeNull();
    expect(result.remaining).toEqual([]);
  });
});
