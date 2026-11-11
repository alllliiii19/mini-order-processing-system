
const pool = require("../config/database");
const productService = require("./product.service");

async function processOrder(orderId) {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        // Lock the order so two workers cannot process it simultaneously.
        const orderResult = await client.query(
            `SELECT id, status
             FROM orders
             WHERE id = $1
             FOR UPDATE`,
            [orderId]
        );

        const order = orderResult.rows[0];

        if (!order) {
            throw new Error(`Order ${orderId} not found`);
        }

        // Prevent duplicate processing.
        if (
            order.status === "COMPLETED" ||
            order.status === "FAILED" ||
            order.status === "CANCELLED"
        ) {
            await client.query("COMMIT");

            console.log(
                `Order ${orderId} already has terminal status ${order.status}. Skipping.`
            );

            return;
        }

        // Mark the order as processing.
        await client.query(
            `UPDATE orders
             SET status = 'PROCESSING',
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [orderId]
        );

        // Retrieve all products and quantities in this order.
        const itemsResult = await client.query(
            `SELECT product_id, quantity
             FROM order_items
             WHERE order_id = $1
             ORDER BY product_id`,
            [orderId]
        );

        if (itemsResult.rows.length === 0) {
            throw new Error(`Order ${orderId} has no items`);
        }

        // Convert reserved stock into completed sales.
        for (const item of itemsResult.rows) {
            const result = await client.query(
                `UPDATE products
                 SET on_hand_quantity = on_hand_quantity - $1,
                     reserved_quantity = reserved_quantity - $1
                 WHERE id = $2
                 AND on_hand_quantity >= $1
                 AND reserved_quantity >= $1
                 RETURNING id`,
                [item.quantity, item.product_id]
            );

            if (result.rowCount === 0) {
                throw new Error(
                    `Could not finalize inventory for product ${item.product_id}`
                );
            }
        }

        // Mark the order as completed.
        await client.query(
            `UPDATE orders
             SET status = 'COMPLETED',
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [orderId]
        );

        // Commit all inventory and order changes.
        await client.query("COMMIT");

        // Invalidate cached product information.
        await productService.invalidateProductCache();

        console.log(`Order ${orderId} processed successfully`);

    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;

    } finally {
        client.release();
    }
}

// Release reserved stock if all processing attempts fail.
async function failOrder(orderId) {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const orderResult = await client.query(
            `SELECT id, status
             FROM orders
             WHERE id = $1
             FOR UPDATE`,
            [orderId]
        );

        const order = orderResult.rows[0];

        if (!order) {
            await client.query("COMMIT");
            return;
        }

        if (
            order.status === "COMPLETED" ||
            order.status === "FAILED" ||
            order.status === "CANCELLED"
        ) {
            await client.query("COMMIT");
            return;
        }

        const itemsResult = await client.query(
            `SELECT product_id, quantity
             FROM order_items
             WHERE order_id = $1
             ORDER BY product_id`,
            [orderId]
        );

        // Release reservations because the order will not be completed.
        for (const item of itemsResult.rows) {
            const result = await client.query(
                `UPDATE products
                 SET reserved_quantity = reserved_quantity - $1
                 WHERE id = $2
                 AND reserved_quantity >= $1
                 RETURNING id`,
                [item.quantity, item.product_id]
            );

            if (result.rowCount === 0) {
                throw new Error(
                    `Could not release reserved stock for product ${item.product_id}`
                );
            }
        }

        await client.query(
            `UPDATE orders
             SET status = 'FAILED',
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [orderId]
        );

        // Commit reservation releases and status update.
        await client.query("COMMIT");

        // Invalidate cached product information.
        await productService.invalidateProductCache();

        console.log(
            `Order ${orderId} marked FAILED; reservations released`
        );

    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;

    } finally {
        client.release();
    }
}

module.exports = {
    processOrder,
    failOrder
};
