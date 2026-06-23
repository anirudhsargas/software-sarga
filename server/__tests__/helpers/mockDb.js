const mockQuery = jest.fn();
const mockGetConnection = jest.fn();
const mockRelease = jest.fn();

const mockPool = {
  query: mockQuery,
  getConnection: mockGetConnection,
};

const mockConnection = {
  query: mockQuery,
  beginTransaction: jest.fn(),
  commit: jest.fn(),
  rollback: jest.fn(),
  release: mockRelease,
};

mockGetConnection.mockResolvedValue(mockConnection);

jest.mock('../../database', () => ({
  pool: mockPool,
  initDb: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../middleware/auth', () => {
  const actual = jest.requireActual('../../middleware/auth');
  return {
    ...actual,
    authenticateToken: (req, res, next) => {
      req.user = {
        id: 1,
        user_id: 'admin',
        role: 'Admin',
        branch_id: 1,
        sub: '1',
      };
      next();
    },
    authenticate: (req, res, next) => {
      req.user = { id: 1, user_id: 'admin', role: 'Admin', name: 'Admin', branch_id: 1 };
      next();
    },
    authorizeRoles: (..._roles) => (req, res, next) => next(),
    requireRole: () => (req, res, next) => next(),
  };
});

jest.mock('../../helpers/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../helpers', () => ({
  ...jest.requireActual('../../helpers'),
  auditLog: jest.fn(),
  getTodayDate: () => new Date().toISOString().split('T')[0],
  generateJobNumber: jest.fn().mockResolvedValue('JOB-2026-0001'),
  normalizeMobileWithCountry: (v) => v,
  getUserBranchId: jest.fn().mockResolvedValue(1),
  getUsageMap: jest.fn().mockResolvedValue({}),
  sortByUsageThenPosition: () => () => 0,
  sortByPositionThenName: () => () => 0,
  bumpUsageForUser: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../helpers/pagination', () => ({
  paginate: (query, page = 1, limit = 20) => ({
    limit: Math.min(100, Math.max(1, parseInt(limit) || 20)),
    offset: (Math.max(1, parseInt(page) || 1) - 1) * Math.min(100, Math.max(1, parseInt(limit) || 20)),
    page: Math.max(1, parseInt(page) || 1),
    response: (data, total) => ({
      data,
      total,
      page: Math.max(1, parseInt(page) || 1),
      limit: Math.min(100, Math.max(1, parseInt(limit) || 20)),
      totalPages: Math.ceil(total / Math.min(100, Math.max(1, parseInt(limit) || 20))),
      hasNext: Math.max(1, parseInt(page) || 1) < Math.ceil(total / (Math.min(100, Math.max(1, parseInt(limit) || 20)) || 1)),
      hasPrev: Math.max(1, parseInt(page) || 1) > 1,
    }),
  }),
}));

jest.mock('../../middleware/branchFilter', () => ({
  branchFilter: jest.fn().mockResolvedValue({
    branchId: 1,
    isPrivileged: true,
    clause: '',
    params: [],
  }),
  isPrivilegedRole: () => true,
}));

jest.mock('../../middleware/validate', () => {
  const actual = jest.requireActual('../../middleware/validate');
  return {
    ...actual,
    validate: (schema) => (req, res, next) => {
      try {
        schema.parse(req.body);
        next();
      } catch (err) {
        res.status(400).json({ message: 'Validation error', errors: err.errors });
      }
    },
  };
});

jest.mock('multer', () => {
  const multer = () => ({
    single: () => (req, res, next) => {
      next();
    },
    array: () => (req, res, next) => {
      next();
    },
    fields: () => (req, res, next) => {
      next();
    },
  });
  multer.diskStorage = () => ({});
  return multer;
});

afterEach(() => {
  mockQuery.mockReset();
  mockGetConnection.mockReset();
});

module.exports = { mockPool, mockQuery, mockGetConnection, mockConnection, mockRelease };
