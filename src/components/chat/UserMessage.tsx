"use client";

import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatMessage } from "@/types";
import {
  Copy,
  Check,
  Edit2,
  Check as CheckIcon,
  X,
  Clock,
  MessageSquare,
} from "lucide-react";
import { useAppSelector } from "@/store";

interface UserMessageProps {
  message: ChatMessage;
  onCopy?: (text: string) => void;
  onEdit?: (messageId: string, newContent: string) => void;
  onReply?: (messageId: string) => void;
}

export default function UserMessage({
  message,
  onCopy,
  onEdit,
  onReply,
}: UserMessageProps) {
  const { pendingMessages } = useAppSelector((state) => state.chat);
  const isPending = pendingMessages.has(message.id);

  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(
    typeof message.content === "string"
      ? message.content
      : JSON.stringify(message.content, null, 2),
  );

  const content =
    typeof message.content === "string"
      ? message.content
      : JSON.stringify(message.content, null, 2);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      onCopy?.(content);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy text:", error);
    }
  };

  const handleEdit = () => {
    setEditContent(content);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    const newContent = editContent.trim();

    if (onEdit && newContent !== content) {
      onEdit(message.id, newContent);
    }

    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditContent(content);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSaveEdit();
    } else if (e.key === "Escape") {
      handleCancelEdit();
    }
  };

  const markdownComponents = {
    p: ({ children, ...props }: any) => (
      <p className="mb-2 last:mb-0" {...props}>
        {children}
      </p>
    ),
    strong: ({ children, ...props }: any) => (
      <strong className="font-semibold text-white" {...props}>
        {children}
      </strong>
    ),
    em: ({ children, ...props }: any) => (
      <em className="italic text-gray-200" {...props}>
        {children}
      </em>
    ),
    code: ({ children, ...props }: any) => (
      <code
        className="bg-gray-800 text-green-400 px-1 py-0.5 rounded text-sm"
        {...props}
      >
        {children}
      </code>
    ),
    pre: ({ children, ...props }: any) => (
      <pre
        className="bg-gray-900 text-gray-100 p-3 rounded-lg overflow-x-auto my-2"
        {...props}
      >
        {children}
      </pre>
    ),
    ul: ({ children, ...props }: any) => (
      <ul className="list-disc list-inside mb-2 space-y-1" {...props}>
        {children}
      </ul>
    ),
    ol: ({ children, ...props }: any) => (
      <ol className="list-decimal list-inside mb-2 space-y-1" {...props}>
        {children}
      </ol>
    ),
    li: ({ children, ...props }: any) => (
      <li className="text-gray-200" {...props}>
        {children}
      </li>
    ),
  };

  return (
    <div className="flex flex-col items-end">
      <div
        className={`max-w-3xl bg-[#7C3AED] text-white rounded-2xl px-6 py-4 group relative ${
          isPending ? "opacity-75" : ""
        }`}
      >
        {isPending && (
          <div className="absolute -left-8 top-4 flex items-center gap-1 text-xs text-yellow-400">
            <Clock className="h-3 w-3 animate-spin" />
            <span>Sending...</span>
          </div>
        )}

        {isEditing ? (
          <div className="space-y-2">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full bg-transparent text-white placeholder:text-gray-300 focus:outline-none resize-none"
              rows={Math.max(1, editContent.split("\n").length)}
              autoFocus
            />

            <div className="flex items-center space-x-2">
              <button
                onClick={handleSaveEdit}
                className="p-1 text-green-400 hover:text-green-300 transition-colors"
                title="Save changes"
                type="button"
              >
                <CheckIcon className="h-4 w-4" />
              </button>

              <button
                onClick={handleCancelEdit}
                className="p-1 text-red-400 hover:text-red-300 transition-colors"
                title="Cancel"
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="prose prose-invert prose-lg max-w-none leading-relaxed pr-12">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={markdownComponents}
              >
                {content}
              </ReactMarkdown>
            </div>

            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center space-x-1">
              <button
                onClick={handleCopy}
                className="p-1 text-gray-300 hover:text-white transition-colors"
                title="Copy message"
                type="button"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-400" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>

              <button
                onClick={handleEdit}
                className="p-1 text-gray-300 hover:text-white transition-colors"
                title="Edit message"
                type="button"
              >
                <Edit2 className="h-4 w-4" />
              </button>

              {onReply && (
                <button
                  onClick={() => onReply(message.id)}
                  className="p-1 text-gray-300 hover:text-white transition-colors"
                  title="Reply in thread"
                  type="button"
                >
                  <MessageSquare className="h-4 w-4" />
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
