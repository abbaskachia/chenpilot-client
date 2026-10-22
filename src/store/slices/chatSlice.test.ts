import { describe, it, expect, vi, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import chatReducer, {
  sendMessage,
  regenerateLastResponse,
  ABORT_ERROR,
  addMessage,
  addUserMessage,
  addSystemMessage,
  setMessages,
  updateMessage,
  setTyping,
  clearMessages,
  removeMessage,
  saveConversationLocally,
  deleteConversationLocally,
  setCurrentConversation,
  getMessageTimestamp,
  sortMessagesChronologically,
} from './chatSlice';
import authReducer from './authSlice';
import apiService from '@/services/api';
import { ChatMessage } from '@/types';

vi.mock('@/services/api', () => ({
  default: {
    queryAgent: vi.fn(),
  },
}));

describe('chatSlice - Message Ordering & Race Conditions (#86)', () => {
  let store: ReturnType<typeof createTestStore>;

  const createTestStore = () =>
    configureStore({
      reducer: {
        chat: chatReducer,
        auth: authReducer,
      },
      preloadedState: {
        auth: {
          user: {
            id: 'user_test_123',
            email: 'test@example.com',
            name: 'Test User',
            address: '0x123',
            publicKey: 'GABC123',
            isDeployed: true,
            isFunded: true,
            tokenType: 'XLM',
            authProvider: 'email',
            isEmailVerified: true,
            createdAt: '2026-09-29T10:00:00.000Z',
            updatedAt: '2026-09-29T10:00:00.000Z',
          },
          token: 'jwt_mock_token',
          isAuthenticated: true,
          isLoading: false,
          error: null,
          accountStatus: null,
          hasStellarAccount: true,
          stellarAccount: null,
          balance: null,
          isInitialized: true,
        },
      },
    });

  beforeEach(() => {
    vi.clearAllMocks();
    store = createTestStore();
  });

  describe('Timestamp Extraction & Sorting Helpers', () => {
    it('getMessageTimestamp prioritizes serverTimestamp over client timestamp', () => {
      const msg: ChatMessage = {
        id: 'msg-1',
        type: 'user',
        content: 'Hello',
        timestamp: '2026-09-29T10:00:00.000Z',
        serverTimestamp: 1774958410000,
        metadata: {
          clientTimestamp: 1774958400000,
        },
      };

      expect(getMessageTimestamp(msg)).toBe(1774958410000);
    });

    it('getMessageTimestamp prioritizes metadata.serverTimestamp if root is absent', () => {
      const msg: ChatMessage = {
        id: 'msg-1',
        type: 'agent',
        content: 'Hi',
        timestamp: '2026-09-29T10:00:00.000Z',
        metadata: {
          serverTimestamp: 1774958420000,
          clientTimestamp: 1774958400000,
        },
      };

      expect(getMessageTimestamp(msg)).toBe(1774958420000);
    });

    it('getMessageTimestamp parses ISO timestamp strings correctly', () => {
      const iso = '2026-09-29T12:00:00.000Z';
      const msg: ChatMessage = {
        id: 'msg-1',
        type: 'user',
        content: 'Testing ISO',
        timestamp: iso,
      };

      expect(getMessageTimestamp(msg)).toBe(new Date(iso).getTime());
    });

    it('sortMessagesChronologically sorts jumbled messages into proper order', () => {
      const messages: ChatMessage[] = [
        { id: '3', type: 'agent', content: 'Third', timestamp: '2026-09-29T10:00:03.000Z', serverTimestamp: 3000 },
        { id: '1', type: 'user', content: 'First', timestamp: '2026-09-29T10:00:01.000Z', serverTimestamp: 1000 },
        { id: '4', type: 'agent', content: 'Fourth', timestamp: '2026-09-29T10:00:04.000Z', serverTimestamp: 4000 },
        { id: '2', type: 'agent', content: 'Second', timestamp: '2026-09-29T10:00:02.000Z', serverTimestamp: 2000 },
      ];

      const sorted = sortMessagesChronologically(messages);
      expect(sorted.map((m) => m.id)).toEqual(['1', '2', '3', '4']);
    });

    it('sortMessagesChronologically places user message before agent message on timestamp tie', () => {
      const messages: ChatMessage[] = [
        { id: 'agent-1', type: 'agent', content: 'Answer', timestamp: '2026-09-29T10:00:00.000Z', serverTimestamp: 5000 },
        { id: 'user-1', type: 'user', content: 'Question', timestamp: '2026-09-29T10:00:00.000Z', serverTimestamp: 5000 },
      ];

      const sorted = sortMessagesChronologically(messages);
      expect(sorted[0].id).toBe('user-1');
      expect(sorted[1].id).toBe('agent-1');
    });
  });

  describe('Optimistic Updates', () => {
    it('adds user message optimistically with pending status immediately on dispatch', () => {
      (apiService.queryAgent as any).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ result: { success: true, data: 'OK' } }), 100))
      );

      const promise = store.dispatch(sendMessage({ query: 'Optimistic prompt', tempId: 'opt-123' }));

      // Immediately after dispatch (in-flight)
      const state = store.getState().chat;
      expect(state.isLoading).toBe(true);
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0].id).toBe('opt-123');
      expect(state.messages[0].content).toBe('Optimistic prompt');
      expect(state.messages[0].metadata?.status).toBe('pending');

      return promise;
    });

    it('resolves optimistic message to success status and updates server timestamp on fulfilled', async () => {
      const serverTime = 1774959000000;
      (apiService.queryAgent as any).mockResolvedValueOnce({
        result: {
          success: true,
          data: 'Here is the response',
          serverTimestamp: serverTime,
        },
      });

      await store.dispatch(sendMessage({ query: 'Check balance', tempId: 'opt-balance' }));

      const messages = store.getState().chat.messages;
      expect(messages).toHaveLength(2);

      const userMsg = messages[0];
      const agentMsg = messages[1];

      expect(userMsg.id).toBe('opt-balance');
      expect(userMsg.metadata?.status).toBe('success');
      expect(userMsg.serverTimestamp).toBe(serverTime);

      expect(agentMsg.type).toBe('agent');
      expect(agentMsg.content).toBe('Here is the response');
      expect(agentMsg.serverTimestamp).toBe(serverTime);
    });
  });

  describe('Race Condition Reordering (Out-of-Order Network Arrival)', () => {
    it('correctly reorders messages when Request 1 arrives after Request 2 due to slow network', async () => {
      let resolveQuery1: (val: any) => void;
      let resolveQuery2: (val: any) => void;

      const p1 = new Promise((resolve) => {
        resolveQuery1 = resolve;
      });
      const p2 = new Promise((resolve) => {
        resolveQuery2 = resolve;
      });

      (apiService.queryAgent as any)
        .mockImplementationOnce(() => p1)
        .mockImplementationOnce(() => p2);

      // Dispatch Message 1 at T=1000
      const dispatch1 = store.dispatch(
        sendMessage({ query: 'First Query (Slow)', tempId: 'user-req-1', clientTimestamp: 1000 })
      );

      // Dispatch Message 2 at T=2000
      const dispatch2 = store.dispatch(
        sendMessage({ query: 'Second Query (Fast)', tempId: 'user-req-2', clientTimestamp: 2000 })
      );

      // Verify both are optimistically displayed in order
      let currentMessages = store.getState().chat.messages;
      expect(currentMessages).toHaveLength(2);
      expect(currentMessages[0].id).toBe('user-req-1');
      expect(currentMessages[1].id).toBe('user-req-2');

      // Now Request 2 (Fast) resolves FIRST with serverTimestamp 2050
      resolveQuery2!({
        result: {
          success: true,
          data: 'Agent response to Second Query',
          serverTimestamp: 2050,
        },
      });
      await dispatch2;

      // At this point, we have: user-req-1 (pending, ts:1000), user-req-2 (success, ts:2050), agent-2 (ts:2050)
      currentMessages = store.getState().chat.messages;
      expect(currentMessages.map((m) => m.id)).toEqual([
        'user-req-1',
        'user-req-2',
        expect.stringMatching(/^msg_/),
      ]);

      // Now Request 1 (Slow) finally arrives with serverTimestamp 1050
      resolveQuery1!({
        result: {
          success: true,
          data: 'Agent response to First Query',
          serverTimestamp: 1050,
        },
      });
      await dispatch1;

      // Final state: Messages must be strictly sorted by server timestamp:
      // 1. user-req-1 (ts: 1050)
      // 2. agent-1 (ts: 1050)
      // 3. user-req-2 (ts: 2050)
      // 4. agent-2 (ts: 2050)
      const finalMessages = store.getState().chat.messages;
      expect(finalMessages).toHaveLength(4);

      expect(finalMessages[0].id).toBe('user-req-1');
      expect(finalMessages[0].content).toBe('First Query (Slow)');
      expect(finalMessages[0].metadata?.status).toBe('success');

      expect(finalMessages[1].type).toBe('agent');
      expect(finalMessages[1].content).toBe('Agent response to First Query');

      expect(finalMessages[2].id).toBe('user-req-2');
      expect(finalMessages[2].content).toBe('Second Query (Fast)');
      expect(finalMessages[2].metadata?.status).toBe('success');

      expect(finalMessages[3].type).toBe('agent');
      expect(finalMessages[3].content).toBe('Agent response to Second Query');
    });

    it('handles rapid send scenarios with multiple concurrent out-of-order queries', async () => {
      // Simulate 3 rapid requests with randomized network arrival times
      const queries = [
        { id: 'q1', query: 'What is Stellar?', serverTime: 10000, delay: 50 },
        { id: 'q2', query: 'Send 5 XLM', serverTime: 20000, delay: 10 },
        { id: 'q3', query: 'Check balance', serverTime: 30000, delay: 30 },
      ];

      (apiService.queryAgent as any).mockImplementation(({ query }: { query: string }) => {
        const item = queries.find((q) => q.query === query)!;
        return new Promise((resolve) =>
          setTimeout(() => {
            resolve({
              result: {
                success: true,
                data: `Response for: ${query}`,
                serverTimestamp: item.serverTime,
              },
            });
          }, item.delay)
        );
      });

      // Dispatch all 3 concurrently in rapid succession
      const p1 = store.dispatch(sendMessage({ query: queries[0].query, tempId: queries[0].id }));
      const p2 = store.dispatch(sendMessage({ query: queries[1].query, tempId: queries[1].id }));
      const p3 = store.dispatch(sendMessage({ query: queries[2].query, tempId: queries[2].id }));

      await Promise.all([p1, p2, p3]);

      const finalMessages = store.getState().chat.messages;
      expect(finalMessages).toHaveLength(6);

      // Verify sequence: user-q1, agent-q1, user-q2, agent-q2, user-q3, agent-q3
      expect(finalMessages[0].content).toBe('What is Stellar?');
      expect(finalMessages[1].content).toBe('Response for: What is Stellar?');
      expect(finalMessages[2].content).toBe('Send 5 XLM');
      expect(finalMessages[3].content).toBe('Response for: Send 5 XLM');
      expect(finalMessages[4].content).toBe('Check balance');
      expect(finalMessages[5].content).toBe('Response for: Check balance');
    });

    it('marks optimistic message as failed when request is rejected without breaking order', async () => {
      (apiService.queryAgent as any).mockRejectedValueOnce(new Error('Network error: connection lost'));

      await store.dispatch(sendMessage({ query: 'Failed prompt', tempId: 'fail-1' }));

      const messages = store.getState().chat.messages;
      expect(messages).toHaveLength(2);

      const userMsg = messages.find((m) => m.id === 'fail-1');
      expect(userMsg?.metadata?.status).toBe('failed');

      const errorMsg = messages.find((m) => m.type === 'agent');
      expect(errorMsg?.metadata?.status).toBe('failed');
      expect(errorMsg?.content).toContain(
        "I'm having trouble connecting. Please check your internet connection and try again."
      );
    });
  });

  describe('Reducers Integration', () => {
    it('maintains chronological sorting when manual messages are added', () => {
      store.dispatch(
        addMessage({
          id: 'manual-2',
          type: 'agent',
          content: 'Later message',
          timestamp: '2026-09-29T10:00:20.000Z',
          serverTimestamp: 20000,
        })
      );

      store.dispatch(
        addMessage({
          id: 'manual-1',
          type: 'user',
          content: 'Earlier message',
          timestamp: '2026-09-29T10:00:10.000Z',
          serverTimestamp: 10000,
        })
      );

      const messages = store.getState().chat.messages;
      expect(messages[0].id).toBe('manual-1');
      expect(messages[1].id).toBe('manual-2');
    });

    it('setMessages sorts incoming list chronologically', () => {
      const incoming: ChatMessage[] = [
        { id: 'b', type: 'user', content: 'B', timestamp: '2026-09-29T10:00:02.000Z', serverTimestamp: 200 },
        { id: 'a', type: 'user', content: 'A', timestamp: '2026-09-29T10:00:01.000Z', serverTimestamp: 100 },
      ];

      store.dispatch(setMessages(incoming));
      const messages = store.getState().chat.messages;
      expect(messages[0].id).toBe('a');
      expect(messages[1].id).toBe('b');
    });
  });

  describe('Abort and regenerate', () => {
    it('resets loading flags and marks the turn cancelled without an error bubble', async () => {
      (apiService.queryAgent as any).mockImplementation(
        (_data: unknown, options?: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            options?.signal?.addEventListener('abort', () => {
              const error = Object.assign(new Error('canceled'), {
                name: 'CanceledError',
                code: 'ERR_CANCELED',
              });
              reject(error);
            });
          }),
      );

      const promise = store.dispatch(sendMessage({ query: 'stop me', tempId: 'abort-1' }));
      promise.abort();
      const result = await promise;

      expect(result.payload).toBe(ABORT_ERROR);
      const state = store.getState().chat;
      expect(state.isLoading).toBe(false);
      expect(state.isTyping).toBe(false);
      expect(state.messages.some((message) => message.metadata?.status === 'cancelled')).toBe(true);
      expect(state.messages.some((message) => message.metadata?.type === 'error')).toBe(false);
    });

    it('replaces the previous agent message without duplication', async () => {
      store.dispatch(addMessage({
        id: 'user-regen',
        type: 'user',
        content: '[Using vault tool] What is APY?',
        timestamp: '2026-09-29T10:00:01.000Z',
      }));
      store.dispatch(addMessage({
        id: 'agent-regen',
        type: 'agent',
        content: 'old answer',
        timestamp: '2026-09-29T10:00:02.000Z',
      }));
      (apiService.queryAgent as any).mockResolvedValueOnce({
        result: { success: true, data: 'new answer' },
      });

      await store.dispatch(regenerateLastResponse());

      const agents = store.getState().chat.messages.filter((message) => message.type === 'agent');
      expect(agents).toHaveLength(1);
      expect(agents[0].id).toBe('agent-regen');
      expect(agents[0].content).toBe('new answer');
      expect(apiService.queryAgent).toHaveBeenCalledWith(
        expect.objectContaining({ query: '[Using vault tool] What is APY?' }),
        expect.any(Object),
      );
    });

    it('blocks regeneration while isTyping is true', async () => {
      store.dispatch(setTyping(true));
      await store.dispatch(regenerateLastResponse());
      expect(apiService.queryAgent).not.toHaveBeenCalled();
    });
  });
});

describe('chatSlice reducers, persistence, and error mapping', () => {
  const memory = new Map<string, string>();
  const localStorageMock = {
    getItem: vi.fn((key: string) => memory.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      memory.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      memory.delete(key);
    }),
    clear: vi.fn(() => memory.clear()),
    key: vi.fn(() => null),
    length: 0,
  };

  beforeEach(() => {
    memory.clear();
    vi.clearAllMocks();
    vi.stubGlobal('localStorage', localStorageMock);
  });

  it('adds, updates, removes, and clears messages', () => {
    const store = configureStore({
      reducer: { chat: chatReducer, auth: authReducer },
    });
    store.dispatch(addMessage({ id: 'a', type: 'user', content: 'later', timestamp: '2024-01-02T00:00:00.000Z' }));
    store.dispatch(addMessage({ id: 'b', type: 'user', content: 'earlier', timestamp: '2024-01-01T00:00:00.000Z' }));
    expect(store.getState().chat.messages.map((item) => item.id)).toEqual(['b', 'a']);

    store.dispatch(updateMessage({ id: 'b', updates: { content: 'updated' } }));
    expect(store.getState().chat.messages.find((item) => item.id === 'b')?.content).toBe('updated');

    store.dispatch(removeMessage('a'));
    expect(store.getState().chat.messages).toHaveLength(1);
    store.dispatch(clearMessages());
    expect(store.getState().chat.messages).toEqual([]);
  });

  it('writes conversations through mocked storage', () => {
    const store = configureStore({
      reducer: { chat: chatReducer, auth: authReducer },
    });
    const conversation = {
      id: 'conv-1',
      title: 'New Chat',
      isActive: true,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      userId: 'user-1',
      messageCount: 0,
    };
    store.dispatch(setCurrentConversation(conversation));
    store.dispatch(addMessage({ id: 'a', type: 'user', content: 'hello', timestamp: '2024-01-01T00:00:00.000Z' }));
    store.dispatch(saveConversationLocally(conversation));
    expect(localStorageMock.setItem).toHaveBeenCalledWith('chat_history', expect.any(String));
    expect(JSON.parse(memory.get('conversations') ?? '[]')[0].id).toBe('conv-1');

    store.dispatch(deleteConversationLocally('conv-1'));
    expect(JSON.parse(memory.get('conversations') ?? '[]')).toEqual([]);
  });

  it.each([
    ['network down', "I'm having trouble connecting. Please check your internet connection and try again."],
    ['invalid query', "I didn't understand that. Could you please rephrase your question?"],
    ['Failed to send message', "I'm having trouble processing your request. Please try again."],
  ])('maps %s onto one friendly error message', async (technical, friendly) => {
    const store = configureStore({
      reducer: { chat: chatReducer, auth: authReducer },
      preloadedState: {
        auth: {
          user: { id: 'user-1', email: 'a@b.c', name: 'A', address: 'G', publicKey: 'G', isDeployed: true },
        },
      } as never,
    });
    (apiService.queryAgent as ReturnType<typeof vi.fn>).mockRejectedValue(new Error(technical));
    await store.dispatch(sendMessage('hello'));
    const errors = store.getState().chat.messages.filter((item) => item.metadata?.type === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.content).toBe(friendly);
  });
});
