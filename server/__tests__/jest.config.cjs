module.exports = {
  rootDir: '../',
  testEnvironment: 'node',
  setupFilesAfterSetup: ['<rootDir>/__tests__/setup.js'],
  testMatch: ['**/__tests__/**/*.test.js'],
  clearMocks: true,
  resetModules: true,
  testTimeout: 15000,
  verbose: true,
  moduleNameMapper: {
    'database$': '<rootDir>/__tests__/helpers/mock-pool.js'
  }
};
