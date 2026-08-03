const mongoose = require('mongoose');
const { loadEnv } = require('./env');

const DEFAULT_MAX_RETRIES = 10;
const DEFAULT_RETRY_DELAY_MS = 2000;

async function connectDb(options = {}) {
  const { MONGO_URI } = loadEnv();
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

  mongoose.set('strictQuery', true);

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      await mongoose.connect(MONGO_URI);
      console.log('MongoDB connected in scheduler-service');
      return mongoose.connection;
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;
      console.error(
        `MongoDB connection attempt ${attempt}/${maxRetries} failed:`,
        error.message,
      );

      if (isLastAttempt) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  return mongoose.connection;
}

async function disconnectDb() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    console.log('MongoDB disconnected in scheduler-service');
  }
}

module.exports = { connectDb, disconnectDb };