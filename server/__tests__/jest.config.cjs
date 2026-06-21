module.exports = {
  testEnvironment: 'node',
  setupFilesAfterSetup: ['./setup.js'],
  testMatch: ['**/__tests__/**/*.test.js'],
  clearMocks: true,
  resetModules: true,
  testTimeout: 15000,
  verbose: true,
};
