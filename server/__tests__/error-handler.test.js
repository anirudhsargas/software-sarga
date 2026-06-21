jest.mock('../helpers/logger', () => ({
  info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(), log: jest.fn(),
}));

const httpMocks = require('node-mocks-http');
const errorHandler = require('../middleware/errorHandler');
const { AppError, BadRequestError, NotFoundError, ValidationError } = require('../utils/AppError');

function buildReqRes(url) {
  const req = httpMocks.createRequest({ url: url || '/api/test' });
  const res = httpMocks.createResponse();
  return { req, res };
}

describe('errorHandler middleware', () => {
  it('handles JSON SyntaxError (invalid JSON body)', () => {
    const { req, res } = buildReqRes();
    const err = new SyntaxError('Unexpected token');
    err.status = 400;
    err.body = true;
    errorHandler(err, req, res, () => {});
    const data = JSON.parse(res._getData());
    expect(res.statusCode).toBe(400);
    expect(data.error.code).toBe('INVALID_JSON');
  });

  it('handles multer file size limit error', () => {
    const { req, res } = buildReqRes();
    const err = new Error('File too large');
    err.code = 'LIMIT_FILE_SIZE';
    err.name = 'MulterError';
    errorHandler(err, req, res, () => {});
    const data = JSON.parse(res._getData());
    expect(res.statusCode).toBe(400);
    expect(data.error.code).toBe('LIMIT_FILE_SIZE');
  });

  it('handles generic multer error', () => {
    const { req, res } = buildReqRes();
    const err = new Error('Unexpected field');
    err.code = 'UNEXPECTED_FILE_TYPE';
    err.name = 'MulterError';
    errorHandler(err, req, res, () => {});
    const data = JSON.parse(res._getData());
    expect(res.statusCode).toBe(400);
    expect(data.error.code).toBe('UNEXPECTED_FILE_TYPE');
  });

  it('handles AppError instances', () => {
    const { req, res } = buildReqRes();
    const err = new NotFoundError('Resource not found');
    errorHandler(err, req, res, () => {});
    const data = JSON.parse(res._getData());
    expect(res.statusCode).toBe(404);
    expect(data.error.code).toBe('NOT_FOUND');
    expect(data.success).toBe(false);
    expect(data.error.userMessage).toBeTruthy();
  });

  it('handles AppError with details', () => {
    const { req, res } = buildReqRes();
    const err = new ValidationError('Invalid', [{ field: 'email', message: 'required' }]);
    errorHandler(err, req, res, () => {});
    const data = JSON.parse(res._getData());
    expect(res.statusCode).toBe(422);
    expect(data.error.details).toHaveLength(1);
  });

  it('handles generic errors with 500', () => {
    const { req, res } = buildReqRes();
    const err = new Error('Something broke');
    errorHandler(err, req, res, () => {});
    const data = JSON.parse(res._getData());
    expect(res.statusCode).toBe(500);
    expect(data.error.code).toBe('INTERNAL_ERROR');
    expect(data.success).toBe(false);
  });

  it('uses error.status if present on generic error', () => {
    const { req, res } = buildReqRes();
    const err = new Error('Custom status');
    err.status = 418;
    errorHandler(err, req, res, () => {});
    expect(res.statusCode).toBe(418);
  });
});
