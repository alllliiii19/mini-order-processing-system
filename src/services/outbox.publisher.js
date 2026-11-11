
const pool = require("../config/database");
const orderQueue = require("../queues/order.queue");

let inFlight = null;

function publishPendingEvents() {
    // Prevent overlapping polling runs.
    if (inFlight) {
        return inFlight;
    }

    inFlight = (async () => {
        const result = await pool.query(
            `SELECT id, event_type, payload
             FROM outbox_events
             WHERE published_at IS NULL
             ORDER BY id ASC
             LIMIT 20`
        );

        for (const event of result.rows) {
            try {
                // Use a stable job ID to reduce duplicate queue jobs.
                await orderQueue.add(
                    event.event_type,
                    event.payload,
                    {
                        jobId: `outbox-${event.id}`
                    }
                );

                // Mark the event as published only after queue.add succeeds.
                await pool.query(
                    `UPDATE outbox_events
                     SET published_at = CURRENT_TIMESTAMP
                     WHERE id = $1
                     AND published_at IS NULL`,
                    [event.id]
                );

                console.log(
                    `Published outbox event ${event.id} to BullMQ`
                );

            } catch (error) {
                // Leave the event unpublished so a later poll can retry.
                console.error(
                    `Could not publish event ${event.id}:`,
                    error.message
                );
            }
        }
    })().finally(() => {
        inFlight = null;
    });

    return inFlight;
}

module.exports = {
    publishPendingEvents
};
