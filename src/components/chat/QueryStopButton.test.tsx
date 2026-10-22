import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QueryStopButton } from "./QueryStopButton";

describe("QueryStopButton", () => {
  it("renders only while a query is in flight", () => {
    const { rerender } = render(<QueryStopButton inFlight={false} onStop={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Stop" })).toBeNull();

    rerender(<QueryStopButton inFlight={true} onStop={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Stop" })).toBeTruthy();
  });

  it("invokes onStop once", () => {
    const onStop = vi.fn();
    render(<QueryStopButton inFlight={true} onStop={onStop} />);
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(onStop).toHaveBeenCalledTimes(1);
  });
});
