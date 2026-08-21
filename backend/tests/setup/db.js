const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');

/**
 * Connect to the MongoDB started once in globalSetup.
 *
 * Mocking Mongoose would defeat the purpose of these tests: the bugs they
 * exist to catch (a bypassed pre-save hook, a unique index not firing,
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
  const uri = process.env.MONGO_TEST_URI;

  if (!uri) {
    throw new Error(
      'MONGO_TEST_URI is not set — tests must be run through jest so that ' +
        'globalSetup starts the shared MongoDB.',
    );
  }

  // A database per suite, so suites stay isolated even if they ever run in
  // parallel.
  const dbName = `test-${crypto.randomBytes(6).toString('hex')}`;

  await mongoose.connect(uri, { dbName });
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
};

module.exports = { connect, clear, close };
