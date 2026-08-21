const { MongoMemoryServer } = require('mongodb-memory-server');

/**
 * Start ONE MongoDB for the whole test run.
 *
 * Each suite used to spin up its own instance, which meant paying the mongod
 * startup cost per file — and on a cold or loaded machine that reliably
 * exceeded the default 10s start timeout once there were several suites.
 *
 * Suites still get their own database inside this instance, so they remain
 * isolated from one another.
 */
module.exports = async () => {
  const mongod = await MongoMemoryServer.create({
    instance: { launchTimeout: 60000 },
  });

  // globalTeardown reads this back to shut the instance down.
  global.__MONGOD__ = mongod;
  process.env.MONGO_TEST_URI = mongod.getUri();
};
