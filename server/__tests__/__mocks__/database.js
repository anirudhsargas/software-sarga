const { mockPool, mockConnection } = require('../helpers/mockDb');

const pool = mockPool;

const initDb = jest.fn().mockResolvedValue();

module.exports = { pool, initDb };
