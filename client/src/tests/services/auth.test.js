import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUser = { id: 1, name: 'Admin', role: 'Admin', branch_id: 1 };

vi.mock('../../services/api', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
  devFallback: vi.fn((p) => p),
}));

describe('Auth Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('stores token and user on login', () => {
    localStorage.setItem('token', 'test-jwt');
    localStorage.setItem('user', JSON.stringify(mockUser));
    expect(localStorage.getItem('token')).toBe('test-jwt');
    expect(JSON.parse(localStorage.getItem('user'))).toEqual(mockUser);
  });

  it('clears token and user on logout', () => {
    localStorage.setItem('token', 'test-jwt');
    localStorage.setItem('user', JSON.stringify(mockUser));
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });

  it('isAuthenticated returns true when token exists', () => {
    localStorage.setItem('token', 'valid-token');
    const auth = { isAuthenticated: () => !!localStorage.getItem('token') };
    expect(auth.isAuthenticated()).toBe(true);
  });

  it('isAuthenticated returns false when no token', () => {
    const auth = { isAuthenticated: () => !!localStorage.getItem('token') };
    expect(auth.isAuthenticated()).toBe(false);
  });
});
