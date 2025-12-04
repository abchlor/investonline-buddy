const Redis = require('redis');

let store = new Map();
let useRedis = (process.env.USE_REDIS === 'true');

let redisClient = null;
const TTL = parseInt(process.env.SESSION_TTL_SECONDS || '3600', 10);

async function initSessionStore() {
  if (useRedis) {
    redisClient = Redis.createClient({ url: process.env.REDIS_URL });
    redisClient.on('error', err => console.error('Redis Error', err));
    await redisClient.connect();
    console.log('Using Redis session store');
  } else {
    console.log('Using in-memory session store');
  }
}

async function getSession(sessionId) {
  if (useRedis && redisClient) {
    const raw = await redisClient.get(sessionId);
    return raw ? JSON.parse(raw) : null;
  }
  return store.get(sessionId) || null;
}

async function setSession(sessionId, data) {
  if (useRedis && redisClient) {
    await redisClient.set(sessionId, JSON.stringify(data), { EX: TTL });
  } else {
    store.set(sessionId, data);
    setTimeout(() => { store.delete(sessionId); }, TTL * 1000);
  }
}

module.exports = { initSessionStore, getSession, setSession };
