
const crypto = require("node:crypto");

const pool = require("../config/database");
const orderRepository = require("../repositories/order.repository");
const productService = require("./product.service");

function createError(message, statusCode) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

// Convert a PostgreSQL decimal price into integer cents.
// This avoids floating-point calculation errors.
function toCents(price) {
    const [whole, fraction = ""] = String(price).split(".");

    return (
        BigInt(whole) * 100n +
        BigInt(fraction.padEnd(2, "0").slice(0, 2))
    );
}

// Convert integer cents back into a decimal string.
function formatCents(cents) {
    const whole = cents / 100n;
    const fraction = String(cents % 100n).padStart(2, "0");

    return `${whole}.${fraction}`;
}

async function createOrder({
    customerId: rawCustomerId,
    items: rawItems,
    idempotencyKey
}) {
    // 1. Validate customer ID.
    const customerId = Number(rawCustomerId);

    if (!Number.isSafeInteger(customerId) || customerId <= 0) {
        throw createError("Invalid customer ID", 400);
    }

    // 2. Validate idempotency key.
    if (
        typeof idempotencyKey !== "string" ||
        idempotencyKey.trim().length === 0 ||
        idempotencyKey.length > 255
    ) {
        throw createError(
            "A valid Idempotency-Key header is required",
            400
        );
    }

    // 3. Validate order items.
    if (
        !Array.isArray(rawItems) ||
        rawItems.length === 0 ||
        rawItems.length > 50
    ) {
        throw createError(
            "Order must contain between 1 and 50 items",
            400
        );
    }

    const items = rawItems.map((item) => {
        const productId = Number(item.productId);
        const quantity = Number(item.quantity);

        if (!Number.isSafeInteger(productId) || productId <= 0) {
            throw createError("Invalid product ID", 400);
        }

        if (!Number.isSafeInteger(quantity) || quantity <= 0) {
            throw createError(
                "Quantity must be a positive integer",
                400
            );
        }

        return {
            productId,
            quantity
        };
    });

    // Reject repeated products within the same order.
    const productIds = items.map((item) => item.productId);

    if (new Set(productIds).size !== productIds.length) {
        throw createError(
            "Duplicate products are not allowed in one order",
            400
        );
    }

    // Sort for deterministic processing and hashing.
    items.sort((a, b) => a.productId - b.productId);

    // 4. Generate a hash of the request.
    const requestHash = crypto
        .createHash("sha256")
        .update(JSON.stringify({ customerId, items }))
        .digest("hex");

    let client;

    try {
        // 5. Get a dedicated database connection.
        client = await pool.connect();

        // Start transaction.
        await client.query("BEGIN");

        // 6. Check whether this request was already processed.
        const existing = await orderRepository.findByIdempotencyKey(
            client,
            customerId,
            idempotencyKey
        );

        if (existing) {
            if (existing.request_hash !== requestHash) {
                throw createError(
                    "Idempotency key was already used for a different order",
                    409
                );
            }

            const previousOrder =
                await orderRepository.findOrderWithItems(
                    client,
                    existing.id
                );

            await client.query("COMMIT");

            return {
                ...previousOrder,
                replayed: true
            };
        }

        // 7. Verify that customer exists.
        const customer = await orderRepository.findCustomerById(
            client,
            customerId
        );

        if (!customer) {
            throw createError("Customer not found", 404);
        }

        // 8. Reserve stock and calculate order total.
        let totalCents = 0n;
        const reservedProducts = [];

        for (const item of items) {
            const product = await orderRepository.reserveProduct(
                client,
                item.productId,
                item.quantity
            );

            if (!product) {
                const existingProduct =
                    await orderRepository.findProductById(
                        client,
                        item.productId
                    );

                if (!existingProduct) {
                    throw createError(
                        `Product ${item.productId} not found`,
                        404
                    );
                }

                throw createError(
                    `Insufficient stock for ${existingProduct.name}`,
                    409
                );
            }

            const itemPrice = toCents(product.price);

            totalCents += itemPrice * BigInt(item.quantity);

            reservedProducts.push({
                productId: product.id,
                quantity: item.quantity,
                price: product.price
            });
        }

        // 9. Create the main order.
        const totalAmount = formatCents(totalCents);

        const order = await orderRepository.insertOrder(
            client,
            customerId,
            totalAmount,
            idempotencyKey,
            requestHash
        );

        // 10. Create each order item.
        for (const item of reservedProducts) {
            await orderRepository.insertOrderItem(
                client,
                order.id,
                item.productId,
                item.quantity,
                item.price
            );
        }

        // 11. Create an outbox event in the same transaction.
        await orderRepository.insertOutboxEvent(
            client,
            "ORDER_CREATED",
            order.id,
            { orderId: order.id }
        );

        // 12. Retrieve the newly created order.
        const completeOrder =
            await orderRepository.findOrderWithItems(
                client,
                order.id
            );

        // 13. Commit everything together.
        await client.query("COMMIT");

        // 14. Invalidate cached product information.
        await productService.invalidateProductCache();

        return {
            ...completeOrder,
            replayed: false
        };

    } catch (error) {
        if (client) {
            await client.query("ROLLBACK").catch(() => {});
        }

        // Handle simultaneous requests using the same
        // customer and idempotency key.
        if (error.code === "23505") {
            const existing =
                await orderRepository.findByIdempotencyKey(
                    pool,
                    customerId,
                    idempotencyKey
                );

            if (existing) {
                if (existing.request_hash !== requestHash) {
                    throw createError(
                        "Idempotency key was already used for a different order",
                        409
                    );
                }

                const previousOrder =
                    await orderRepository.findOrderWithItems(
                        pool,
                        existing.id
                    );

                return {
                    ...previousOrder,
                    replayed: true
                };
            }
        }

        throw error;

    } finally {
        if (client) {
            client.release();
        }
    }
}

// Retrieve an order by ID, including its order items.
async function getOrderById(rawOrderId) {
    const orderId = Number(rawOrderId);

    if (!Number.isSafeInteger(orderId) || orderId <= 0) {
        throw createError("Invalid order ID", 400);
    }

    const order = await orderRepository.findOrderWithItems(
        pool,
        orderId
    );

    if (!order) {
        throw createError("Order not found", 404);
    }

    return order;
}

module.exports = {
    createOrder,
    getOrderById
};
