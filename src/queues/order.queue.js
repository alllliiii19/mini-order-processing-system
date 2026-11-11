
const { Queue } = require("bullmq");

const redisConnection = require("../config/redis");

const orderQueue = new Queue("order-processing", {
    connection: redisConnection,

    defaultJobOptions: {
        attempts: 3,

        backoff: {
            type: "exponential",
            delay: 2000
        },

        removeOnComplete: {
            count: 1000
        },

        removeOnFail: {
            count: 5000
        }
    }
});

module.exports = orderQueue;
