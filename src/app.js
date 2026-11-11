
const express = require("express");

const productRoutes = require("./routes/product.routes");
const orderRoutes = require("./routes/order.routes");

const {
    notFoundHandler,
    errorHandler
} = require("./middleware/error.middleware");

const app = express();

// Parse incoming JSON requests
app.use(express.json({ limit: "1mb" }));

// API health endpoint
app.get("/api/v1/health", (req, res) => {
    res.status(200).json({
        success: true,
        message: "Order Processing API is running"
    });
});

// Product API routes
app.use("/api/v1/products", productRoutes);
// Order API routes
app.use("/api/v1/orders", orderRoutes);

// Handle unknown routes
app.use(notFoundHandler);

// Handle application errors
app.use(errorHandler);

module.exports = app;
