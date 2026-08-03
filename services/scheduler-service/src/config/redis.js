const Redis = require('ioredis');
const { loadEnv } = require('./env');

let redisClient = null;

function getRedisClient() {
  if (!redisClient) {
    const { REDIS_URL } = loadEnv();
    redisClient = new Redis(REDIS_URL, {
      maxRetriesPerRequest: null,
    });

    redisClient.on('error', (error) => {
      console.error('Redis client error in scheduler-service:', error.message);
    });
  }

  return redisClient;
}

async function connectRedis() {
  const client = getRedisClient();
  await client.ping();
  console.log('Redis connected in scheduler-service');
  return client;
}

async function disconnectRedis() {
  if (redisClient && redisClient.status !== 'end') {
    await redisClient.quit();
    redisClient = null;
    console.log('Redis disconnected in scheduler-service');
  }
}

module.exports = { connectRedis, disconnectRedis, getRedisClient };