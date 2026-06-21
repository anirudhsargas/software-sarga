const httpMocks = require('node-mocks-http');
const notFound = require('../middleware/notFound');

describe('notFound middleware', () => {
  it('forwards NotFoundError for unknown routes', () => {
    const req = httpMocks.createRequest({ method: 'GET', url: '/api/nonexistent' });
    const res = httpMocks.createResponse();
    const next = jest.fn();
    notFound(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toContain('/api/nonexistent');
    expect(err.userMessage).toContain('/api/nonexistent');
  });
});
