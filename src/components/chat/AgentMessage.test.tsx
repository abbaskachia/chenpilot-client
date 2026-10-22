import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AgentMessage from "./AgentMessage";
import { ChatMessage } from "@/types";

const agentMessage: ChatMessage = {
  id: "agent-1",
  type: "agent",
  content: "Previous answer",
  timestamp: "2026-10-21T00:00:00.000Z",
};

describe("AgentMessage regenerate", () => {
  it("dispatches regenerate exactly once", () => {
    const onRegenerate = vi.fn();
    render(
      <AgentMessage
        message={agentMessage}
        onRegenerate={onRegenerate}
        canRegenerate
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Regenerate/i }));
    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });

  it("disables regenerate while another query is running", () => {
    const onRegenerate = vi.fn();
    render(
      <AgentMessage
        message={agentMessage}
        onRegenerate={onRegenerate}
        canRegenerate={false}
      />,
    );

    expect(screen.getByRole("button", { name: /Regenerate/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Regenerate/i }));
    expect(onRegenerate).not.toHaveBeenCalled();
  });
});
