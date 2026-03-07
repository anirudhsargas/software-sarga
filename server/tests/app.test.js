const request = require('supertest');
const app = require('../index');

describe('App', () => {
  it('should return 404 for a non-existent route', async () => {
    const res = await request(app).get('/a-non-existent-route');
    expect(res.statusCode).toEqual(404);
  });
});
