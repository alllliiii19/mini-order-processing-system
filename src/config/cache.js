
require("dotenv").config();

const IORedis = require("ioredis");

const cacheRedis = new IORedis({
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT || 6379),

    // Connect when the first cache command is executed.
    lazyConnect: true,

    // Limit retries so API requests do not wait indefinitely.
    maxRetriesPerRequest: 1,

    enableOfflineQueue: false,
    connectTimeout: 3000,

    retryStrategy(times) {
        if (times > 3) {
            return null;
        }

        return Math.min(times * 200, 1000);
    }
});

cacheRedis.on("error", (error) => {
    console.error("Redis cache connection error:", error.message);
});

module.exports = cacheRedis;
