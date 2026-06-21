jest.mock('axios');

const axios = require('axios');
const { callMLService, ML_URL, ML_TIMEOUT } = require('../config/ml');

describe('ML Service Config', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exports expected constants', () => {
    expect(ML_URL).toBe('http://127.0.0.1:5001');
    expect(ML_TIMEOUT).toBe(10000);
  });

  it('calls the ML service and returns data on success', async () => {
    axios.post.mockResolvedValue({ data: { result: 'ok', predictions: [1, 2, 3] } });
    const result = await callMLService('/predict-sales', { branch: 'all' });
    expect(result).toEqual({ result: 'ok', predictions: [1, 2, 3] });
    expect(axios.post).toHaveBeenCalledWith(
      'http://127.0.0.1:5001/predict-sales',
      { branch: 'all' },
      expect.objectContaining({ timeout: 10000 })
    );
  });

  it('returns fallback object on network error', async () => {
    axios.post.mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await callMLService('/predict-sales', {});
    expect(result).toEqual({ fallback: true, data: null });
  });

  it('returns fallback on timeout', async () => {
    axios.post.mockRejectedValue({ code: 'ECONNABORTED', message: 'timeout' });
    const result = await callMLService('/slow-endpoint');
    expect(result.fallback).toBe(true);
  });

  it('returns fallback on HTTP error with status', async () => {
    axios.post.mockRejectedValue({
      response: { status: 500 },
      message: 'Internal Server Error',
    });
    const result = await callMLService('/error-endpoint');
    expect(result.fallback).toBe(true);
  });

  it('returns fallback on 404', async () => {
    axios.post.mockRejectedValue({
      response: { status: 404 },
      message: 'Not Found',
    });
    const result = await callMLService('/nonexistent');
    expect(result.fallback).toBe(true);
  });
});
