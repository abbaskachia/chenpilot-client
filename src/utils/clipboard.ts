export const buildClipboardFallbackMessage = (label: string): string => {
  const readableLabel = label.trim() || 'value';
  return `Copy failed. Use Cmd/Ctrl+C to copy the ${readableLabel.toLowerCase()} manually.`;
};

export const copyTextToClipboard = async (
  text: string,
  label: string = 'value',
): Promise<{ ok: boolean; fallbackMessage?: string }> => {
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
      throw new Error('Clipboard API unavailable');
    }

    await navigator.clipboard.writeText(text);
    return { ok: true };
  } catch {
    return {
      ok: false,
      fallbackMessage: buildClipboardFallbackMessage(label),
    };
  }
};
