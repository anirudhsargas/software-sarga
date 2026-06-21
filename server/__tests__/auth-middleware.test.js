jest.mock('jsonwebtoken');
jest.mock('../database', () => ({
  pool: { query: jest.fn() },
}));
jest.mock('../helpers/logger', () => ({
  info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(), log: jest.fn(),
}));

const jwt = require('jsonwebtoken');
const { pool } = require('../database');
const { authenticateToken, authorizeRoles, verifyWithAnySecret, normalizeRole } = require('../middleware/auth');

function mockReqRes(token, opts = {}) {
  const req = {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    path: opts.path || '/api/test',
    method: opts.method || 'GET',
    ip: '127.0.0.1',
    query: {},
    body: {},
  };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn(),
  };
  const next = jest.fn();
  return { req, res, next };
}

describe('authenticateToken', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when no token is provided', async () => {
    const { req, res, next } = mockReqRes(null);
    await authenticateToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Access denied. No token provided.' }));
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 for invalid token', async () => {
    jwt.verify.mockImplementation(() => { throw new Error('jwt malformed'); });
    const { req, res, next } = mockReqRes('invalid-token');
    await authenticateToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Invalid or expired token.' }));
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() when token is valid and session not revoked', async () => {
    jwt.verify.mockReturnValue({ id: 1, role: 'Admin' });
    pool.query.mockResolvedValue([[]]);
    const { req, res, next } = mockReqRes('valid-token');
    await authenticateToken(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual({ id: 1, role: 'Admin' });
  });

  it('returns 401 when session is revoked', async () => {
    jwt.verify.mockReturnValue({ id: 1, role: 'Admin' });
    pool.query.mockResolvedValue([[{ is_revoked: 1 }]]);
    const { req, res, next } = mockReqRes('revoked-token');
    await authenticateToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('revoked') }));
    expect(next).not.toHaveBeenCalled();
  });

  it('proceeds even if session DB check fails', async () => {
    jwt.verify.mockReturnValue({ id: 1, role: 'Admin' });
    pool.query.mockRejectedValue(new Error('DB error'));
    const { req, res, next } = mockReqRes('valid-token');
    await authenticateToken(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe('authorizeRoles', () => {
  it('allows authorized role', () => {
    const { req, res, next } = mockReqRes(null);
    req.user = { role: 'Admin' };
    const middleware = authorizeRoles('Admin', 'Accountant');
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('blocks unauthorized role', () => {
    const { req, res, next } = mockReqRes(null);
    req.user = { role: 'Front Office' };
    const middleware = authorizeRoles('Admin', 'Accountant');
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Insufficient permissions') }));
    expect(next).not.toHaveBeenCalled();
  });

  it('blocks when user is not set', () => {
    const { req, res, next } = mockReqRes(null);
    req.user = null;
    const middleware = authorizeRoles('Admin');
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('normalizeRole', () => {
  it('normalizes "admin" to "Admin"', () => {
    expect(normalizeRole('admin')).toBe('Admin');
  });
  it('normalizes "FRONT OFFICE" to "Front Office"', () => {
    expect(normalizeRole('FRONT OFFICE')).toBe('Front Office');
  });
  it('normalizes "PrInTeR" to "Printer"', () => {
    expect(normalizeRole('PrInTeR')).toBe('Printer');
  });
  it('returns empty for null/undefined', () => {
    expect(normalizeRole(null)).toBe(null);
    expect(normalizeRole(undefined)).toBe(undefined);
  });
  it('passes through unknown roles', () => {
    expect(normalizeRole('SuperAdmin')).toBe('SuperAdmin');
  });
});

describe('verifyWithAnySecret', () => {
  it('returns decoded payload on success', () => {
    const payload = { id: 1, role: 'Admin' };
    jwt.verify.mockReturnValue(payload);
    expect(verifyWithAnySecret('token')).toEqual(payload);
  });

  it('tries previous secret when primary fails', () => {
    jwt.verify
      .mockImplementationOnce(() => { throw new Error('invalid'); })
      .mockImplementationOnce(() => ({ id: 2, role: 'Accountant' }));
    const result = verifyWithAnySecret('old-token');
    expect(result.role).toBe('Accountant');
    expect(jwt.verify).toHaveBeenCalledTimes(2);
  });

  it('throws when all secrets fail', () => {
    jwt.verify.mockImplementation(() => { throw new Error('bad'); });
    expect(() => verifyWithAnySecret('bad-token')).toThrow('Invalid token');
  });
});
