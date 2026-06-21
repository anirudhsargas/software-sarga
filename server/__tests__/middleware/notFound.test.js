const notFound = require('../../middleware/notFound');

describe('notFound middleware', () => {
  it('passes a NotFoundError to next()', () => {
    const req = { method: 'GET', originalUrl: '/api/nonexistent' };
    const res = {};
    const next = jest.fn();

    notFound(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toMatch(/Route not found/);
    expect(err.userMessage).toMatch(/not found/);
  });
});
