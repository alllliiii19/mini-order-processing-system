
async function findCustomerById(db, customerId) {
    const result = await db.query(
        "SELECT id FROM customers WHERE id = $1",
        [customerId]
    );

    return result.rows[0] || null;
}


// Find an existing order using its idempotency key
async function findByIdempotencyKey(
    db,
    customerId,
    idempotencyKey
) {
    const result = await db.query(
        `SELECT
            id,
            customer_id,
            status,
            total_amount,
            request_hash,
            created_at
         FROM orders
         WHERE customer_id = $1
         AND idempotency_key = $2`,
        [customerId, idempotencyKey]
    );

    return result.rows[0] || null;
}


// Reserve inventory using one atomic SQL update
async function reserveProduct(db, productId, quantity) {
    const result = await db.query(
        `UPDATE products
         SET reserved_quantity = reserved_quantity + $1
         WHERE id = $2
         AND on_hand_quantity - reserved_quantity >= $1
         RETURNING id, name, price`,
        [quantity, productId]
    );

    return result.rows[0] || null;
}


async function findProductById(db, productId) {
    const result = await db.query(
        "SELECT id, name FROM products WHERE id = $1",
        [productId]
    );

    return result.rows[0] || null;
}


// Create the main order record
async function insertOrder(
    db,
    customerId,
    totalAmount,
    idempotencyKey,
    requestHash
) {
    const result = await db.query(
        `INSERT INTO orders
            (customer_id, status, total_amount,
             idempotency_key, request_hash)
         VALUES ($1, 'PENDING', $2, $3, $4)
         RETURNING id, customer_id, status,
                   total_amount, created_at`,
        [
            customerId,
            totalAmount,
            idempotencyKey,
            requestHash
        ]
    );

    return result.rows[0];
}


// Create an individual order item
async function insertOrderItem(
    db,
    orderId,
    productId,
    quantity,
    unitPrice
) {
    await db.query(
        `INSERT INTO order_items
            (order_id, product_id, quantity, unit_price)
         VALUES ($1, $2, $3, $4)`,
        [orderId, productId, quantity, unitPrice]
    );
}


// Retrieve an order together with its items
async function findOrderWithItems(db, orderId) {
    const orderResult = await db.query(
        `SELECT
            id,
            customer_id,
            status,
            total_amount,
            created_at
         FROM orders
         WHERE id = $1`,
        [orderId]
    );

    if (!orderResult.rows[0]) {
        return null;
    }

    const itemsResult = await db.query(
        `SELECT
            oi.product_id,
            p.name AS product_name,
            oi.quantity,
            oi.unit_price
         FROM order_items oi
         JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = $1
         ORDER BY oi.product_id`,
        [orderId]
    );

    return {
        ...orderResult.rows[0],
        items: itemsResult.rows
    };
}

async function insertOutboxEvent(
    db,
    eventType,
    orderId,
    payload
) {
    await db.query(
        `INSERT INTO outbox_events
            (event_type, aggregate_id, payload)
         VALUES ($1, $2, $3)`,
        [
            eventType,
            orderId,
            JSON.stringify(payload)
        ]
    );
}




module.exports = {
    findCustomerById,
    findByIdempotencyKey,
    reserveProduct,
    findProductById,
    insertOrder,
    insertOrderItem,
    findOrderWithItems,
    insertOutboxEvent
};
