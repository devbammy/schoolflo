module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],

  // mongodb-memory-server can be slow on a cold start while it resolves and
  // caches the mongod binary.
  testTimeout: 30000,

  // Integration tests share one in-memory MongoDB per file; running files in
  // parallel makes the clear-between-tests step race.
  maxWorkers: 1,

  collectCoverageFrom: [
    'src/**/*.js',
    '!src/config/**',
    '!src/utils/seed.js',
  ],

  // Surface anything left running after the suite (open handles are usually a
  // connection someone forgot to close).
  detectOpenHandles: true,
  forceExit: true,
};
