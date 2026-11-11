
const orderService = require("../services/order.service");

async function createOrder(req, res, next) {
    try {
        const order = await orderService.createOrder({
            ...req.body,
            idempotencyKey: req.get("Idempotency-Key")
        });

        return res
            .status(order.replayed ? 200 : 201)
            .json({
                success: true,
                message: order.replayed
                    ? "Existing order returned"
                    : "Order created successfully",
                data: order
            });

    } catch (error) {
        next(error);
    }
}

async function getOrderById(req, res, next) {
    try {
        const order = await orderService.getOrderById(req.params.id);

        return res.status(200).json({
            success: true,
            message: "Order retrieved successfully",
            data: order
        });

    } catch (error) {
        next(error);
    }
}

module.exports = {
    createOrder,
    getOrderById
};
