import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DangerZone } from "./DangerZone";

describe("DangerZone", () => {
  it("keeps deletion disabled until the email matches", () => {
    const onDelete = vi.fn();
    render(<DangerZone email="user@example.com" onDelete={onDelete} />);

    const button = screen.getByRole("button", { name: "Delete Account" });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("user@example.com"), {
      target: { value: "other@example.com" },
    });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("user@example.com"), {
      target: { value: "user@example.com" },
    });
    expect(button).not.toBeDisabled();

    fireEvent.click(button);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
