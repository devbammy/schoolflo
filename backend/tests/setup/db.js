const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;

/**
 * Spin up a real MongoDB in memory for integration tests.
 *
 * Mocking Mongoose would defeat the purpose here: the bugs these tests exist
 * to catch (a pre-save hook being bypassed, a unique index not firing,
 * bulkWrite skipping validators) only appear against a real database.
 */
/**
 * Register every model on the connection.
 *
 * Populating a ref whose model was never required throws MissingSchemaError,
 * and which models a given test needs is not obvious from the file it lives
 * in — settlePayment, for example, populates User and Fees. Loading them all
 * is cheap and removes a whole class of confusing test failure.
 */
const registerModels = () => {
  const modelsDir = path.join(__dirname, '..', '..', 'src', 'models');
  fs.readdirSync(modelsDir)
    .filter((file) => file.endsWith('.js'))
    .forEach((file) => require(path.join(modelsDir, file)));
};

const connect = async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'schoolflo-test' });
  registerModels();
};

const clear = async () => {
  const { collections } = mongoose.connection;
  await Promise.all(
    Object.values(collections).map((collection) => collection.deleteMany({})),
  );
};

const close = async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  if (mongod) await mongod.stop();
};

module.exports = { connect, clear, close };
