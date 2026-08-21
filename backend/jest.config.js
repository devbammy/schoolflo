module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],

  // One MongoDB for the whole run, started once. Per-suite instances made the
  // mongod startup cost add up until it blew the start timeout.
  globalSetup: '<rootDir>/tests/setup/globalSetup.js',
  globalTeardown: '<rootDir>/tests/setup/globalTeardown.js',

  // mongodb-memory-server can be slow on a cold start while it resolves and
  // caches the mongod binary.
  testTimeout: 30000,

  // Suites each get their own database inside the shared instance, so they are
  // isolated. Kept at one worker because the clear-between-tests step is the
  // slow part, not the tests themselves.
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
