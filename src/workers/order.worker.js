
require("dotenv").config();

const { Worker } = require("bullmq");
const IORedis = require("ioredis");

const pool = require("../config/database");

const {
    processOrder,
    failOrder
} = require("../services/order.processor");

const redisConnection = new IORedis({
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT || 6379),
    maxRetriesPerRequest: null
});

const worker = new Worker(
    "order-processing",

    async (job) => {
        console.log(`Received job: ${job.id}`);

        if (job.name !== "ORDER_CREATED") {
            throw new Error(`Unsupported job type: ${job.name}`);
        }

        const { orderId } = job.data;

        if (!orderId) {
            throw new Error("Order ID is missing from job data");
        }

        await processOrder(orderId);

        return {
            orderId,
            status: "COMPLETED"
        };
    },

    {
        connection: redisConnection,
        concurrency: 5
    }
);

// Called when a job completes successfully.
worker.on("completed", (job, result) => {
    console.log(`Job ${job.id} completed successfully`);
    console.log("Result:", result);
});

// Called whenever a job fails.
worker.on("failed", async (job, error) => {
    console.error(`Job ${job.id} failed:`, error.message);

    const maxAttempts = job.opts.attempts || 1;

    // Release reserved inventory only after the final failed attempt.
    if (job.attemptsMade >= maxAttempts) {
        console.error(
            `Job ${job.id} exhausted all ${maxAttempts} attempts`
        );

        try {
            await failOrder(job.data.orderId);
        } catch (failureError) {
            console.error(
                "Could not finalize failed order:",
                failureError.message
            );
        }
    }
});

worker.on("error", (error) => {
    console.error("Worker error:", error.message);
});

// Graceful shutdown.
let shuttingDown = false;

async function shutdown() {
    if (shuttingDown) return;

    shuttingDown = true;

    console.log("Shutting down worker...");

    await worker.close();
    await redisConnection.quit();
    await pool.end();

    console.log("Worker stopped successfully");
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log("Order processing worker started");
