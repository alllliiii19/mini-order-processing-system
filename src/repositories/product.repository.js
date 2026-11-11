
const pool = require("../config/database");

// Retrieve products with pagination
async function findAll({ limit, offset }) {

    const result = await pool.query(
        `SELECT
            id,
            name,
            sku,
            price,
            on_hand_quantity,
            reserved_quantity,
            created_at
         FROM products
         ORDER BY id ASC
         LIMIT $1 OFFSET $2`,
        [limit + 1, offset]
    );

    // Fetch one extra record to determine
    // whether another page exists.
    const hasMore = result.rows.length > limit;

    return {
        products: result.rows.slice(0, limit),
        hasMore
    };
}


// Retrieve one product using its ID
async function findById(id) {

    const result = await pool.query(
        `SELECT
            id,
            name,
            sku,
            price,
            on_hand_quantity,
            reserved_quantity,
            created_at
         FROM products
         WHERE id = $1`,
        [id]
    );

    return result.rows[0] || null;
}

module.exports = {
    findAll,
    findById
};
