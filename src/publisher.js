
require("dotenv").config();

const pool = require("./config/database");
const redisConnection = require("./config/redis");
const orderQueue = require("./queues/order.queue");

const {
    publishPendingEvents
} = require("./services/outbox.publisher");

let stopping = false;
let timer;
let currentPoll = Promise.resolve();

async function poll() {
    if (stopping) return;

    currentPoll = publishPendingEvents().catch((error) => {
        console.error("Outbox publisher error:", error.message);
    });

    await currentPoll;

    if (!stopping) {
        timer = setTimeout(poll, 2000);
    }
}

async function shutdown() {
    if (stopping) return;

    stopping = true;
    clearTimeout(timer);

    await currentPoll;

    console.log("Shutting down outbox publisher...");

    await orderQueue.close().catch(() => {});
    await redisConnection.quit().catch(() => {});
    await pool.end();

    console.log("Publisher stopped successfully");
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log("Outbox publisher started");

poll();
