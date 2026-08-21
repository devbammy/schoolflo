/**
 * Stop the shared MongoDB started in globalSetup.
 * Leaving it running would keep the process alive after the suite finishes.
 */
module.exports = async () => {
  if (global.__MONGOD__) {
    await global.__MONGOD__.stop();
  }
};
