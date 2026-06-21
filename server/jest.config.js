module.exports = {
  testEnvironment: 'node',
  setupFiles: ['./__tests__/setup.js'],
  testMatch: ['**/__tests__/**/*.test.js'],
  modulePathIgnorePatterns: ['<rootDir>/dev-scripts/'],
};
