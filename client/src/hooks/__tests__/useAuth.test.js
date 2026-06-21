import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { AuthProvider } from '../useAuth';
import auth from '../../services/auth';

vi.mock('../../services/auth', () => ({
  default: {
    login: vi.fn(),
    logout: vi.fn(),
    getUser: vi.fn(),
    setUser: vi.fn(),
    getToken: vi.fn(),
  },
}));

vi.mock('../../theme/ThemeProvider', () => ({
  useTheme: vi.fn(() => ({ setTheme: vi.fn() })),
}));

describe('useAuth', () => {
  beforeEach(() => {
    auth.getUser.mockReturnValue(null);
  });

  it('provides null user initially', async () => {
    const useAuthModule = await import('../useAuth');
    const useAuth = useAuthModule.default;

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => (
        <AuthProvider>{children}</AuthProvider>
      ),
    });

    expect(result.current.user).toBeNull();
  });

  it('provides user after login', async () => {
    const useAuthModule = await import('../useAuth');
    const useAuth = useAuthModule.default;
    const mockUser = { id: 1, name: 'Admin', role: 'Admin' };

    auth.login.mockResolvedValue({ user: mockUser, token: 'tok' });

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => (
        <AuthProvider>{children}</AuthProvider>
      ),
    });

    await act(async () => {
      await result.current.login('admin', 'pass');
    });

    expect(result.current.user).toEqual(mockUser);
  });

  it('clears user after logout', async () => {
    const useAuthModule = await import('../useAuth');
    const useAuth = useAuthModule.default;

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => (
        <AuthProvider>{children}</AuthProvider>
      ),
    });

    act(() => {
      result.current.logout();
    });

    expect(result.current.user).toBeNull();
  });
});
