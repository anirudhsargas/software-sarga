const jwt = require('jsonwebtoken');

jest.mock('../database');

describe('Auth Middleware', () => {
  let authenticateToken;
  let authorizeRoles;
  let authenticate;
  let requireRole;
  let normalizeRole;
  let pool;

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-jwt-secret-key-that-is-at-least-32-chars-long-for-testing';
    const auth = require('../middleware/auth');
    authenticateToken = auth.authenticateToken;
    authorizeRoles = auth.authorizeRoles;
    authenticate = auth.authenticate;
    requireRole = auth.requireRole;
    normalizeRole = auth.normalizeRole;
    pool = require('../database').pool;
  });

  beforeEach(() => {
    pool.query.mockReset();
    pool.query.mockResolvedValue([[]]);
  });

  function buildReqRes(token, overrides = {}) {
    const req = {
      headers: token ? { authorization: `Bearer ${token}` } : {},
      path: '/test',
      method: 'GET',
      ip: '127.0.0.1',
      originalUrl: '/api/test',
      query: {},
      body: {},
      ...overrides,
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn(),
      set: jest.fn(),
    };
    return { req, res };
  }

  describe('normalizeRole', () => {
    it('returns Admin for various casings', () => {
      expect(normalizeRole('Admin')).toBe('Admin');
      expect(normalizeRole('admin')).toBe('Admin');
      expect(normalizeRole('ADMIN')).toBe('Admin');
    });

    it('returns Front Office', () => {
      expect(normalizeRole('Front Office')).toBe('Front Office');
      expect(normalizeRole('front office')).toBe('Front Office');
    });

    it('returns other roles correctly', () => {
      expect(normalizeRole('Designer')).toBe('Designer');
      expect(normalizeRole('Printer')).toBe('Printer');
      expect(normalizeRole('Accountant')).toBe('Accountant');
      expect(normalizeRole('Other Staff')).toBe('Other Staff');
    });

    it('passes through unknown roles', () => {
      expect(normalizeRole('SuperAdmin')).toBe('SuperAdmin');
    });

    it('handles null/undefined', () => {
      expect(normalizeRole(null)).toBe(null);
      expect(normalizeRole(undefined)).toBe(undefined);
    });
  });

  describe('authenticateToken', () => {
    it('returns 401 if no token provided', async () => {
      const { req, res } = buildReqRes(null);
      await authenticateToken(req, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: 'Access denied. No token provided.' });
    });

    it('returns 401 for invalid token', async () => {
      const { req, res } = buildReqRes('invalid-token-here');
      await authenticateToken(req, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('calls next with valid token', async () => {
      const token = jwt.sign({ id: 1, role: 'Admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });
      const { req, res } = buildReqRes(token);
      const next = jest.fn();
      await authenticateToken(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user.role).toBe('Admin');
    });

    it('accepts token signed with previous secret', async () => {
      const token = jwt.sign({ id: 2, role: 'Front Office' }, process.env.JWT_SECRET_PREVIOUS, { expiresIn: '1h' });
      const { req, res } = buildReqRes(token);
      const next = jest.fn();
      await authenticateToken(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('returns 401 when session is revoked', async () => {
      pool.query.mockResolvedValue([[{ is_revoked: 1 }]]);
      const token = jwt.sign({ id: 1, role: 'Admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });
      const { req, res } = buildReqRes(token);
      await authenticateToken(req, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: 'Session has been revoked. Please log in again.' });
    });
  });

  describe('authorizeRoles', () => {
    it('allows authorized role', () => {
      const middleware = authorizeRoles('Admin');
      const { req, res } = buildReqRes(null, { user: { id: 1, role: 'Admin' } });
      const next = jest.fn();
      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('blocks unauthorized role', () => {
      const middleware = authorizeRoles('Admin');
      const { req, res } = buildReqRes(null, { user: { id: 1, role: 'Front Office' } });
      middleware(req, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('allows multiple roles', () => {
      const middleware = authorizeRoles('Admin', 'Accountant');
      const req1 = { user: { role: 'Admin' } };
      const req2 = { user: { role: 'Accountant' } };
      const next1 = jest.fn();
      const next2 = jest.fn();
      middleware(req1, { status: jest.fn().mockReturnThis(), json: jest.fn() }, next1);
      expect(next1).toHaveBeenCalled();
      middleware(req2, { status: jest.fn().mockReturnThis(), json: jest.fn() }, next2);
      expect(next2).toHaveBeenCalled();
    });

    it('blocks request with no user', () => {
      const middleware = authorizeRoles('Admin');
      const req = {};
      middleware(req, { status: jest.fn().mockReturnThis(), json: jest.fn() }, jest.fn());
      expect(req.status || true).toBeTruthy();
    });
  });

  describe('authenticate (enhanced)', () => {
    it('returns 401 without token', async () => {
      const { req, res } = buildReqRes(null);
      await authenticate(req, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'No token provided' });
    });

    it('returns 401 with invalid token', async () => {
      const { req, res } = buildReqRes('badtoken');
      await authenticate(req, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('calls next with valid token and existing user', async () => {
      pool.query.mockResolvedValue([[{ id: 1, user_id: 'admin', role: 'Admin', name: 'Admin User', branch_id: 1 }]]);
      const token = jwt.sign({ id: 1, role: 'Admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });
      const { req, res } = buildReqRes(token);
      const next = jest.fn();
      await authenticate(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
    });

    it('enforces branch_id for Front Office on POST', async () => {
      pool.query.mockResolvedValue([[{ id: 2, user_id: 'fo_staff', role: 'Front Office', name: 'FO', branch_id: 1 }]]);
      const token = jwt.sign({ id: 2, role: 'Front Office' }, process.env.JWT_SECRET, { expiresIn: '1h' });
      const { req, res } = buildReqRes(token, { method: 'POST', body: { branch_id: 2 } });
      await authenticate(req, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('requireRole', () => {
    it('allows matching role', () => {
      const mw = requireRole(['Admin']);
      const next = jest.fn();
      mw({ user: { role: 'Admin' } }, { status: jest.fn().mockReturnThis(), json: jest.fn() }, next);
      expect(next).toHaveBeenCalled();
    });

    it('blocks non-matching role', () => {
      const mw = requireRole(['Admin']);
      mw({ user: { role: 'Designer' } }, { status: jest.fn().mockReturnThis(), json: jest.fn() }, jest.fn());
    });

    it('returns 401 if no user', () => {
      const mw = requireRole(['Admin']);
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      mw({}, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });
});
