
require("dotenv").config();

const { Pool } = require("pg");

const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,

    // Maximum number of simultaneous connections
    max: 10,

    // Close unused connections after 30 seconds
    idleTimeoutMillis: 30000,

    // Wait up to 5 seconds to establish a connection
    connectionTimeoutMillis: 5000
});

// Log unexpected errors on idle connections
pool.on("error", (error) => {
    console.error("Unexpected database error:", error);
});

module.exports = pool;
