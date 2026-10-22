"use client";

import React from "react";

export function QueryStopButton({
  inFlight,
  onStop,
}: {
  inFlight: boolean;
  onStop: () => void;
}) {
  if (!inFlight) return null;
  return (
    <button
      type="button"
      onClick={onStop}
      className="p-3 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30"
      aria-label="Stop"
    >
      Stop
    </button>
  );
}
