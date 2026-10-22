import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildClipboardFallbackMessage, copyTextToClipboard } from './clipboard';

describe('copyTextToClipboard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves successfully when the browser clipboard accepts the write request', async () => {
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      configurable: true,
    });

    const result = await copyTextToClipboard('GABC...', 'Address');

    expect(result.ok).toBe(true);
    expect(result.fallbackMessage).toBeUndefined();
  });

  it('returns a fallback instruction when the clipboard write is rejected', async () => {
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockRejectedValue(new Error('permission denied')),
      },
      configurable: true,
    });

    const result = await copyTextToClipboard('GABC...', 'Address');

    expect(result.ok).toBe(false);
    expect(result.fallbackMessage).toBe(buildClipboardFallbackMessage('Address'));
    expect(result.fallbackMessage).toContain('Cmd/Ctrl+C');
  });
});
