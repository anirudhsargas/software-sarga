import { describe, it, expect, vi, beforeEach, test } from 'vitest';
import auth from '../auth';
import axios from 'axios';

vi.mock('axios', () => {
  const mAxios = {
    post: vi.fn(),
    create: vi.fn(() => mAxios),
  };
  return { default: mAxios };
});

vi.mock('../api', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
}));

vi.mock('jwt-decode', () => ({
  jwtDecode: vi.fn(),
}));

describe('Auth Service', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  describe('login', () => {
    it('stores token and user in localStorage when rememberMe is true', async () => {
      const mockData = {
        token: 'test-token',
        user: { id: 1, name: 'Admin', role: 'Admin' },
      };
      axios.post.mockResolvedValue({ data: mockData });

      const result = await auth.login('admin', 'pass', true);

      expect(result).toEqual(mockData);
      expect(localStorage.getItem('token')).toBe('test-token');
      expect(JSON.parse(localStorage.getItem('user'))).toEqual(mockData.user);
      expect(sessionStorage.getItem('token')).toBeNull();
    });

    it('stores token and user in sessionStorage when rememberMe is false', async () => {
      const mockData = {
        token: 'test-token-session',
        user: { id: 2, name: 'User', role: 'Front Office' },
      };
      axios.post.mockResolvedValue({ data: mockData });

      const result = await auth.login('user', 'pass', false);

      expect(result).toEqual(mockData);
      expect(sessionStorage.getItem('token')).toBe('test-token-session');
      expect(JSON.parse(sessionStorage.getItem('user'))).toEqual(mockData.user);
      expect(localStorage.getItem('token')).toBeNull();
    });
  });

  describe('logout', () => {
    it('clears storage and redirects', async () => {
      const originalLocation = window.location;
      delete window.location;
      window.location = { href: '', hostname: 'localhost' };

      localStorage.setItem('token', 'test');
      localStorage.setItem('user', '{}');
      sessionStorage.setItem('token', 'test-session');
      axios.post.mockResolvedValue({});

      await auth.logout();

      expect(localStorage.getItem('token')).toBeNull();
      expect(localStorage.getItem('user')).toBeNull();
      expect(sessionStorage.getItem('token')).toBeNull();
      expect(window.location.href).toBe('/login');

      window.location = originalLocation;
    });
  });

  describe('getToken / getUser', () => {
    it('returns null when not set', () => {
      expect(auth.getToken()).toBeNull();
      expect(auth.getUser()).toBeNull();
    });

    it('returns stored values', () => {
      localStorage.setItem('token', 'abc');
      localStorage.setItem('user', JSON.stringify({ name: 'Test' }));
      expect(auth.getToken()).toBe('abc');
      expect(auth.getUser()).toEqual({ name: 'Test' });
    });
  });

  describe('isAuthenticated', () => {
    it('returns false without token', () => {
      expect(auth.isAuthenticated()).toBe(false);
    });
  });

  describe('normalizeRole', () => {
    const tests = [
      ['Admin', 'Admin'], ['admin', 'Admin'], ['ADMIN', 'Admin'],
      ['Front Office', 'Front Office'], ['front office', 'Front Office'],
      ['Designer', 'Designer'], ['Printer', 'Printer'],
      ['Accountant', 'Accountant'], ['Other Staff', 'Other Staff'],
      [null, ''], [undefined, ''],
    ];
    test.each(tests)('normalizeRole(%p) => %p', (input, expected) => {
      expect(auth.normalizeRole(input)).toBe(expected);
    });
  });

  describe('can', () => {
    it('returns true for admin with any permission', () => {
      localStorage.setItem('user', JSON.stringify({ role: 'Admin' }));
      expect(auth.can('manage_staff')).toBe(true);
    });

    it('returns false for printer with manage_staff', () => {
      localStorage.setItem('user', JSON.stringify({ role: 'Printer' }));
      expect(auth.can('manage_staff')).toBe(false);
    });
  });

  describe('isRole', () => {
    it('matches role correctly', () => {
      localStorage.setItem('user', JSON.stringify({ role: 'Designer' }));
      expect(auth.isRole('Designer')).toBe(true);
      expect(auth.isRole('Admin')).toBe(false);
    });
  });
});
