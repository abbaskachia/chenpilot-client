"use client";

import React, { useEffect, useRef, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/store";
import {
  sendMessage,
  regenerateLastResponse,
  ABORT_ERROR,
  updateMessage,
  saveConversationLocally,
  queueMessage,
  addMessage as reduxAddMessage,
  addPendingMessage,
} from "@/store/slices/chatSlice";
import AgentMessage from "@/components/chat/AgentMessage";
import UserMessage from "@/components/chat/UserMessage";
import { TagWidget } from "@/components/chat/TagWidget";
import { OfflineIndicator } from "@/components/chat/OfflineIndicator";
import { useOfflineQueue } from "@/hooks/useOfflineQueue";
import { Send, Sun } from "lucide-react";
import toast from "react-hot-toast";
import { ChatMessage } from "@/types";
import { usePathname, useRouter } from "next/navigation";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { AgentToolsMenu } from "@/components/chat/AgentToolsMenu";
import { QueryStopButton } from "@/components/chat/QueryStopButton";

export const ChatEngine: React.FC = () => {
  const router = useRouter();
  const pathname = usePathname();
  const prefersReducedMotion = useReducedMotion();
  const dispatch = useAppDispatch();

  const { user } = useAppSelector((state) => state.auth);
  const {
    messages,
    isLoading: isChatLoading,
    isTyping,
    currentConversation,
    isOnline,
  } = useAppSelector((state) => state.chat);

  const { processQueue } = useOfflineQueue();

  const [inputValue, setInputValue] = useState("");
  const [selectedTool, setSelectedTool] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inflightRef = useRef<{
    abort: () => void;
    unwrap: () => Promise<unknown>;
  } | null>(null);
  const lastDraftRef = useRef("");

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  }, [messages, isTyping, prefersReducedMotion]);

  useEffect(() => {
    if (currentConversation && messages.length > 0) {
      dispatch(saveConversationLocally(currentConversation));
    }
  }, [dispatch, currentConversation, messages.length]);

  useEffect(() => {
    if (currentConversation?.id && pathname === "/chat") {
      router.replace(`/chat/${encodeURIComponent(currentConversation.id)}`, {
        scroll: false,
      });
    }
  }, [currentConversation?.id, pathname, router]);

  useEffect(() => {
    if (isOnline) {
      void processQueue();
    }
  }, [isOnline, processQueue]);

  useEffect(() => {
    return () => {
      inflightRef.current?.abort();
    };
  }, []);

  const handleSendMessage = async (
    event?: React.FormEvent<HTMLFormElement>,
  ) => {
    event?.preventDefault();

    const message = inputValue.trim();

    if (!message || isChatLoading || isTyping) {
      return;
    }

    lastDraftRef.current = message;
    setInputValue("");

    const queryWithTool = selectedTool
      ? `[Using ${selectedTool} tool] ${message}`
      : message;

    if (!isOnline) {
      const messageId = `offline_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 11)}`;

      dispatch(queueMessage({ id: messageId, query: queryWithTool }));

      const userMessage: ChatMessage = {
        id: messageId,
        type: "user",
        content: message,
        timestamp: new Date().toISOString(),
      };

      dispatch(reduxAddMessage(userMessage));
      dispatch(addPendingMessage(messageId));

      toast.error(
        "You're offline. Your message has been queued and will send when you're back online.",
      );
      return;
    }

    try {
      const request = dispatch(sendMessage(queryWithTool));
      inflightRef.current = request;

      await request.unwrap();

      inflightRef.current = null;
    } catch (error: unknown) {
      inflightRef.current = null;

      if (
        error === ABORT_ERROR ||
        (typeof error === "object" &&
          error !== null &&
          "name" in error &&
          error.name === "AbortError")
      ) {
        setInputValue(lastDraftRef.current);
        return;
      }

      toast.error(
        typeof error === "string" ? error : "Failed to send message.",
      );
    }
  };

  const handleStopQuery = () => {
    inflightRef.current?.abort();
    inflightRef.current = null;
    setInputValue(lastDraftRef.current);
  };

  const handleRegenerate = async () => {
    if (isChatLoading || isTyping || currentConversation?.isActive === false) {
      return;
    }

    try {
      const request = dispatch(regenerateLastResponse());
      inflightRef.current = request;

      await request.unwrap();

      inflightRef.current = null;
    } catch (error: unknown) {
      inflightRef.current = null;

      if (error === ABORT_ERROR || error === "busy" || error === "inactive") {
        return;
      }

      toast.error(
        typeof error === "string" ? error : "Failed to regenerate response.",
      );
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard.");
    } catch {
      toast.error("Could not copy to clipboard.");
    }
  };

  const handleEditMessage = (messageId: string, newContent: string) => {
    dispatch(
      updateMessage({
        id: messageId,
        updates: { content: newContent },
      }),
    );

    toast.success("Message updated.");
  };

  const renderInput = (isSticky = false) => (
    <form
      onSubmit={handleSendMessage}
      className={`w-full ${
        isSticky ? "mx-auto max-w-4xl px-4 py-6" : "mx-auto mb-8 max-w-3xl px-4"
      }`}
    >
      <div className="relative rounded-2xl border border-gray-800/50 bg-[#1A1A2E] p-6 shadow-xl">
        <input
          ref={inputRef}
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          placeholder="Ask ChenPilot..."
          disabled={isChatLoading || isTyping}
          className="mb-4 w-full border-none bg-transparent text-lg text-white placeholder:text-gray-500 focus:outline-none"
          aria-label="Message"
        />

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AgentToolsMenu
              selectedTool={selectedTool}
              onSelect={setSelectedTool}
            />
            <TagWidget />
          </div>

          <div className="flex items-center gap-2">
            <QueryStopButton
              inFlight={isChatLoading || isTyping}
              onStop={handleStopQuery}
            />

            <button
              type="submit"
              disabled={!inputValue.trim() || isChatLoading || isTyping}
              className="rounded-lg bg-purple-600 p-3 text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Send message"
              title="Send message"
            >
              <Send className="h-6 w-6" />
            </button>
          </div>
        </div>
      </div>
    </form>
  );

  const lastAgentMessageId = [...messages]
    .reverse()
    .find((message) => message.type === "agent")?.id;

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[#0F0F23] text-white">
      <OfflineIndicator />

      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-8">
            <div className="mb-8 text-center">
              <div className="mb-4 flex items-center justify-center">
                <Sun className="mr-3 h-8 w-8 text-orange-400" />
                <h2 className="text-2xl font-light text-white">
                  Happy{" "}
                  {new Date().toLocaleDateString("en-US", {
                    weekday: "long",
                  })}
                  , {user?.name || "User"}
                </h2>
              </div>

              <p className="text-lg text-gray-400">What can we do today?</p>
            </div>

            {renderInput()}

            <div className="w-full max-w-2xl">
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                {[
                  "Check wallet balance",
                  "Recent transactions",
                  "Deploy Stellar account",
                  "Create contact",
                  "Swap USDC to XLM",
                  "Bitcoin price",
                ].map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => {
                      setInputValue(question);
                      inputRef.current?.focus();
                    }}
                    className="rounded-lg border border-gray-700/50 bg-transparent px-3 py-2 text-left text-gray-400 transition-colors hover:border-gray-600 hover:text-white"
                  >
                    <span className="text-xs font-medium">{question}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${
                  message.type === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {message.type === "user" ? (
                  <UserMessage
                    message={message}
                    onCopy={copyToClipboard}
                    onEdit={handleEditMessage}
                  />
                ) : (
                  <div className="w-full max-w-2xl">
                    <AgentMessage
                      message={message}
                      onCopy={copyToClipboard}
                      onRegenerate={handleRegenerate}
                      canRegenerate={
                        message.type === "agent" &&
                        message.id === lastAgentMessageId &&
                        !isChatLoading &&
                        !isTyping &&
                        currentConversation?.isActive !== false
                      }
                    />
                  </div>
                )}
              </div>
            ))}

            {isTyping && (
              <div className="flex justify-start">
                <div className="rounded-2xl border border-gray-800 bg-gray-900/80 px-6 py-4 shadow-lg backdrop-blur-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <div
                        className={`h-2 w-2 rounded-full bg-purple-400 ${
                          prefersReducedMotion ? "" : "animate-bounce"
                        }`}
                      />
                      <div
                        className={`h-2 w-2 rounded-full bg-pink-400 ${
                          prefersReducedMotion ? "" : "animate-bounce"
                        }`}
                        style={{ animationDelay: "0.1s" }}
                      />
                      <div
                        className={`h-2 w-2 rounded-full bg-purple-400 ${
                          prefersReducedMotion ? "" : "animate-bounce"
                        }`}
                        style={{ animationDelay: "0.2s" }}
                      />
                    </div>

                    <span className="text-sm text-gray-400">
                      ChenPilot is thinking...
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {messages.length > 0 && (
        <div className="relative z-10 border-t border-gray-800/50 bg-[#0F0F23]/80 backdrop-blur-xl">
          {renderInput(true)}
        </div>
      )}

      <style jsx>{`
        @keyframes slide-up {
          0% {
            transform: translateY(10px);
            opacity: 0;
          }
          100% {
            transform: translateY(0);
            opacity: 1;
          }
        }

        .animate-slide-up {
          animation: slide-up 0.2s ease-out;
        }
      `}</style>
    </div>
  );
};

export default ChatEngine;
