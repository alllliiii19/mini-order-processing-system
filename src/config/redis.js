
require("dotenv").config();

const IORedis = require("ioredis");

const redisConnection = new IORedis({
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT || 6379),
    maxRetriesPerRequest: null
});

redisConnection.on("connect", () => {
    console.log("Redis connected successfully");
});

redisConnection.on("error", (error) => {
    console.error("Redis connection error:", error.message);
});

module.exports = redisConnection;
