const mockConnection = {
  query: jest.fn().mockResolvedValue([[]]),
  beginTransaction: jest.fn().mockResolvedValue(),
  commit: jest.fn().mockResolvedValue(),
  rollback: jest.fn().mockResolvedValue(),
  release: jest.fn(),
};

const mockPool = {
  query: jest.fn().mockResolvedValue([[]]),
  getConnection: jest.fn().mockResolvedValue(mockConnection),
};

module.exports = { pool: mockPool, initDb: jest.fn().mockResolvedValue() };
