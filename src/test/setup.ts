import '@testing-library/jest-dom';

if (typeof window !== 'undefined') {
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }

  if (!navigator.clipboard) {
    Object.defineProperty(navigator, 'clipboard', {
      writable: true,
      value: {
        writeText: () => Promise.resolve(),
      },
    });
  }
}