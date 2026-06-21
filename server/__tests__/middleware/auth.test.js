const { normalizeRole } = require('../../middleware/auth');

jest.mock('../../database', () => ({
  pool: {
    query: jest.fn(() => Promise.resolve([[]])),
  },
}));

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn(),
  sign: jest.fn(() => 'signed-token'),
}));

describe('normalizeRole', () => {
  const tests = [
    ['Admin', 'Admin'],
    ['admin', 'Admin'],
    ['ADMIN', 'Admin'],
    ['Front Office', 'Front Office'],
    ['front office', 'Front Office'],
    ['Designer', 'Designer'],
    ['designer', 'Designer'],
    ['Printer', 'Printer'],
    ['printer', 'Printer'],
    ['Accountant', 'Accountant'],
    ['accountant', 'Accountant'],
    ['Other Staff', 'Other Staff'],
    ['other staff', 'Other Staff'],
    ['unknown', 'unknown'],
    [null, null],
    [undefined, undefined],
  ];

  test.each(tests)('normalizeRole(%p) => %p', (input, expected) => {
    expect(normalizeRole(input)).toBe(expected);
  });
});

describe('authorizeRoles', () => {
  const { authorizeRoles } = require('../../middleware/auth');

  let req, res, next;
  beforeEach(() => {
    req = { user: { role: 'Admin' } };
    res = { status: jest.fn(() => res), json: jest.fn() };
    next = jest.fn();
  });

  it('allows matching role', () => {
    authorizeRoles('Admin', 'Designer')(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('denies non-matching role', () => {
    req.user.role = 'Printer';
    authorizeRoles('Admin', 'Designer')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('denies when no user', () => {
    req.user = null;
    authorizeRoles('Admin')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
