const { AppError, BadRequestError, NotFoundError } = require('../utils/AppError');

describe('Error Handler', () => {
  let errorHandler;
  let req;
  let res;

  beforeAll(() => {
    errorHandler = require('../middleware/errorHandler');
  });

  beforeEach(() => {
    req = { originalUrl: '/api/test', url: '/api/test', user: { id: 1 } };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  it('handles SyntaxError (malformed JSON)', () => {
    const err = new SyntaxError('Unexpected token');
    err.status = 400;
    err.body = true;
    errorHandler(err, req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: 'INVALID_JSON' }),
    }));
  });

  it('handles Multer file size error', () => {
    const multer = require('multer');
    const err = new multer.MulterError('LIMIT_FILE_SIZE');
    errorHandler(err, req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: 'LIMIT_FILE_SIZE' }),
    }));
  });

  it('handles generic MulterError', () => {
    const multer = require('multer');
    const err = new multer.MulterError('LIMIT_UNEXPECTED_FILE');
    errorHandler(err, req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('handles AppError instances', () => {
    const err = new BadRequestError('Invalid input');
    errorHandler(err, req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: 'BAD_REQUEST' }),
    }));
  });

  it('handles NotFoundError', () => {
    const err = new NotFoundError('Not found');
    errorHandler(err, req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('handles generic errors as 500', () => {
    const err = new Error('Something broke');
    errorHandler(err, req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
    }));
  });

  it('handles errors with custom status', () => {
    const err = new Error('Custom');
    err.status = 418;
    errorHandler(err, req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(418);
  });
});
