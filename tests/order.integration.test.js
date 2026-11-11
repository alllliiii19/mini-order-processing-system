
const pool = require("../src/config/database");
const cacheRedis = require("../src/config/cache");

const {
    createOrder
} = require("../src/services/order.service");

const {
    processOrder
} = require("../src/services/order.processor");

// Make sure these tests never run against the main database.
beforeAll(async () => {
    const result = await pool.query(
        "SELECT current_database() AS database_name"
    );

    if (result.rows[0].database_name !== "order_processing_test") {
        throw new Error(
            "Integration tests must use order_processing_test"
        );
    }
});

// Reset test data before every test.
beforeEach(async () => {
    await pool.query(`
        TRUNCATE TABLE
            outbox_events,
            order_items,
            orders
        RESTART IDENTITY
    `);

    await pool.query(`
        UPDATE products
        SET
            on_hand_quantity = CASE id
                WHEN 1 THEN 10
                WHEN 2 THEN 25
                WHEN 3 THEN 15
                WHEN 4 THEN 8
                WHEN 5 THEN 20
                ELSE on_hand_quantity
            END,
            reserved_quantity = 0
    `);
});

// Close Redis and PostgreSQL connections after all tests.
afterAll(async () => {
    try {
        if (cacheRedis.status === "ready") {
            await cacheRedis.quit();
        } else {
            cacheRedis.disconnect();
        }
    } catch (error) {
        cacheRedis.disconnect();
    }

    await pool.end();
});

describe("Order service integration tests", () => {

    test("should create an order and reserve inventory", async () => {
        const order = await createOrder({
            customerId: 1,
            items: [
                {
                    productId: 3,
                    quantity: 2
                }
            ],
            idempotencyKey: "integration-create-001"
        });

        expect(order.id).toBeDefined();
        expect(order.status).toBe("PENDING");
        expect(order.total_amount).toBe("2998.00");
        expect(order.replayed).toBe(false);

        const inventory = await pool.query(
            `SELECT on_hand_quantity, reserved_quantity
             FROM products
             WHERE id = 3`
        );

        expect(inventory.rows[0].on_hand_quantity).toBe(15);
        expect(inventory.rows[0].reserved_quantity).toBe(2);

        const outbox = await pool.query(
            `SELECT *
             FROM outbox_events
             WHERE aggregate_id = $1`,
            [order.id]
        );

        expect(outbox.rowCount).toBe(1);
        expect(outbox.rows[0].event_type).toBe("ORDER_CREATED");
    });

    test("should return the existing order for the same idempotency key", async () => {
        const firstOrder = await createOrder({
            customerId: 1,
            items: [
                {
                    productId: 2,
                    quantity: 1
                }
            ],
            idempotencyKey: "integration-replay-001"
        });

        const secondOrder = await createOrder({
            customerId: 1,
            items: [
                {
                    productId: 2,
                    quantity: 1
                }
            ],
            idempotencyKey: "integration-replay-001"
        });

        expect(secondOrder.id).toBe(firstOrder.id);
        expect(secondOrder.replayed).toBe(true);

        const orders = await pool.query(
            "SELECT COUNT(*)::int AS count FROM orders"
        );

        expect(orders.rows[0].count).toBe(1);

        const inventory = await pool.query(
            "SELECT reserved_quantity FROM products WHERE id = 2"
        );

        expect(inventory.rows[0].reserved_quantity).toBe(1);
    });

    test("should reject a reused idempotency key with different order data", async () => {
        await createOrder({
            customerId: 1,
            items: [
                {
                    productId: 2,
                    quantity: 1
                }
            ],
            idempotencyKey: "integration-conflict-001"
        });

        await expect(
            createOrder({
                customerId: 1,
                items: [
                    {
                        productId: 2,
                        quantity: 2
                    }
                ],
                idempotencyKey: "integration-conflict-001"
            })
        ).rejects.toMatchObject({
            statusCode: 409
        });

        const inventory = await pool.query(
            "SELECT reserved_quantity FROM products WHERE id = 2"
        );

        expect(inventory.rows[0].reserved_quantity).toBe(1);

        const orders = await pool.query(
            "SELECT COUNT(*)::int AS count FROM orders"
        );

        expect(orders.rows[0].count).toBe(1);
    });

    test("should reject an order when inventory is insufficient", async () => {
        await expect(
            createOrder({
                customerId: 1,
                items: [
                    {
                        productId: 1,
                        quantity: 11
                    }
                ],
                idempotencyKey: "integration-stock-001"
            })
        ).rejects.toMatchObject({
            statusCode: 409
        });

        const inventory = await pool.query(
            `SELECT on_hand_quantity, reserved_quantity
             FROM products
             WHERE id = 1`
        );

        expect(inventory.rows[0].on_hand_quantity).toBe(10);
        expect(inventory.rows[0].reserved_quantity).toBe(0);

        const orders = await pool.query(
            "SELECT COUNT(*)::int AS count FROM orders"
        );

        expect(orders.rows[0].count).toBe(0);

        const events = await pool.query(
            "SELECT COUNT(*)::int AS count FROM outbox_events"
        );

        expect(events.rows[0].count).toBe(0);
    });

    test("should process an order and prevent duplicate inventory deduction", async () => {
        const order = await createOrder({
            customerId: 1,
            items: [
                {
                    productId: 3,
                    quantity: 1
                }
            ],
            idempotencyKey: "integration-worker-001"
        });

        // First processing attempt.
        await processOrder(order.id);

        // Simulate the same job being delivered again.
        await processOrder(order.id);

        const updatedOrder = await pool.query(
            "SELECT status FROM orders WHERE id = $1",
            [order.id]
        );

        expect(updatedOrder.rows[0].status).toBe("COMPLETED");

        const inventory = await pool.query(
            `SELECT on_hand_quantity, reserved_quantity
             FROM products
             WHERE id = 3`
        );

        expect(inventory.rows[0].on_hand_quantity).toBe(14);
        expect(inventory.rows[0].reserved_quantity).toBe(0);
    });

    test("should prevent overselling during concurrent orders", async () => {
        // Product 1 has only 10 units available.
        const results = await Promise.allSettled([
            createOrder({
                customerId: 1,
                items: [
                    {
                        productId: 1,
                        quantity: 6
                    }
                ],
                idempotencyKey: "integration-race-001"
            }),

            createOrder({
                customerId: 2,
                items: [
                    {
                        productId: 1,
                        quantity: 6
                    }
                ],
                idempotencyKey: "integration-race-002"
            })
        ]);

        const successfulOrders = results.filter(
            result => result.status === "fulfilled"
        );

        const rejectedOrders = results.filter(
            result => result.status === "rejected"
        );

        expect(successfulOrders).toHaveLength(1);
        expect(rejectedOrders).toHaveLength(1);

        expect(rejectedOrders[0].reason.statusCode).toBe(409);

        const inventory = await pool.query(
            `SELECT on_hand_quantity, reserved_quantity
             FROM products
             WHERE id = 1`
        );

        expect(inventory.rows[0].on_hand_quantity).toBe(10);
        expect(inventory.rows[0].reserved_quantity).toBe(6);

        const orders = await pool.query(
            "SELECT COUNT(*)::int AS count FROM orders"
        );

        expect(orders.rows[0].count).toBe(1);
    });

});
