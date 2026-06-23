const errorHandler = require('../../middleware/errorHandler');
const { AppError: _AppError, BadRequestError: _BadRequestError, NotFoundError } = require('../../utils/AppError');

jest.mock('../../helpers/logger', () => ({
  error: jest.fn(),
}));

describe('errorHandler', () => {
  let req, res;

  beforeEach(() => {
    req = { originalUrl: '/api/test', url: '/api/test', user: { id: 1 } };
    res = {
      status: jest.fn(() => res),
      json: jest.fn(),
    };
  });

  it('handles JSON SyntaxError', () => {
    const err = new SyntaxError('Unexpected token');
    err.status = 400;
    err.body = true;
    errorHandler(err, req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error.code).toBe('INVALID_JSON');
  });

  it('handles multer file size error', () => {
    const err = new Error('File too large');
    err.code = 'LIMIT_FILE_SIZE';
    err.name = 'MulterError';
    errorHandler(err, req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error.code).toBe('LIMIT_FILE_SIZE');
  });

  it('handles multer generic error', () => {
    const err = new Error('Unexpected field');
    err.code = 'UNEXPECTED_FILE';
    err.name = 'MulterError';
    errorHandler(err, req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('handles AppError', () => {
    const err = new NotFoundError('Resource not found');
    errorHandler(err, req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json.mock.calls[0][0].error.code).toBe('NOT_FOUND');
  });

  it('handles generic Error with 500 default', () => {
    const err = new Error('Something went wrong');
    errorHandler(err, req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0].error.code).toBe('INTERNAL_ERROR');
  });
});
