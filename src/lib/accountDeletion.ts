export const ACCOUNT_STORAGE_KEYS = {
  token: "auth_token",
  user: "user_data",
  session: "session_expiration",
  conversations: "conversations",
  chatHistory: "chat_history",
  drafts: "chat_drafts",
  queue: "messageQueue",
} as const;

export type AccountLocalCleanup = {
  token: boolean;
  conversations: boolean;
  drafts: boolean;
  removed: string[];
  remaining: string[];
};

function removeKey(key: string, removed: string[], remaining: string[]): boolean {
  try {
    localStorage.removeItem(key);
    if (localStorage.getItem(key) === null) {
      removed.push(key);
      return true;
    }
    remaining.push(key);
    return false;
  } catch {
    remaining.push(key);
    return false;
  }
}

export function clearAccountLocalStorage(): AccountLocalCleanup {
  const removed: string[] = [];
  const remaining: string[] = [];
  if (typeof window === "undefined") {
    return { token: false, conversations: false, drafts: false, removed, remaining };
  }

  const token = [
    ACCOUNT_STORAGE_KEYS.token,
    ACCOUNT_STORAGE_KEYS.user,
    ACCOUNT_STORAGE_KEYS.session,
  ].every((key) => removeKey(key, removed, remaining));
  const conversations = [
    ACCOUNT_STORAGE_KEYS.conversations,
    ACCOUNT_STORAGE_KEYS.chatHistory,
    ACCOUNT_STORAGE_KEYS.queue,
  ].every((key) => removeKey(key, removed, remaining));
  const drafts = removeKey(ACCOUNT_STORAGE_KEYS.drafts, removed, remaining);

  return { token, conversations, drafts, removed, remaining };
}
