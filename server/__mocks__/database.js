const { mockPool } = require('../__tests__/helpers/mockDb');

const pool = mockPool;

const initDb = jest.fn().mockResolvedValue();

module.exports = { pool, initDb };
