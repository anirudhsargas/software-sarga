import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from './App';

vi.mock('./services/serverTime', () => ({
  initServerTime: vi.fn(),
}));

vi.mock('./services/syncWorkerManager', () => ({
  syncManager: {
    init: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    updateToken: vi.fn(),
    setOnlineStatus: vi.fn(),
    destroy: vi.fn(),
  },
}));

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

describe('App', () => {
  it('renders without crashing into error boundary', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.queryByText(/Something went wrong/i)).not.toBeInTheDocument();
    });
  });
});
