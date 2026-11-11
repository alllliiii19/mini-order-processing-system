
const request = require("supertest");

// Mock services to avoid modifying the real database.
jest.mock("../src/services/product.service", () => ({
    listProducts: jest.fn(),
    getProductById: jest.fn()
}));

jest.mock("../src/services/order.service", () => ({
    createOrder: jest.fn(),
    getOrderById: jest.fn()
}));

const app = require("../src/app");

const productService = require("../src/services/product.service");
const orderService = require("../src/services/order.service");

// Suppress expected error logs during negative tests.
const consoleError = jest.spyOn(console, "error")
    .mockImplementation(() => {});

afterAll(() => {
    consoleError.mockRestore();
});

beforeEach(() => {
    jest.clearAllMocks();
});

// ----------------------------------------
// HEALTH API TESTS
// ----------------------------------------

describe("Health API", () => {
    test("GET /api/v1/health should return HTTP 200", async () => {
        const response = await request(app)
            .get("/api/v1/health");

        expect(response.status).toBe(200);

        expect(response.body).toEqual({
            success: true,
            message: "Order Processing API is running"
        });
    });
});

// ----------------------------------------
// PRODUCT API TESTS
// ----------------------------------------

describe("Product API", () => {
    test("GET /api/v1/products should return products", async () => {
        productService.listProducts.mockResolvedValue({
            products: [
                {
                    id: "1",
                    name: "Laptop",
                    price: "55000.00"
                },
                {
                    id: "2",
                    name: "Wireless Mouse",
                    price: "799.00"
                }
            ],
            limit: 10,
            offset: 0,
            hasMore: false
        });

        const response = await request(app)
            .get("/api/v1/products");

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveLength(2);

        expect(response.body.pagination).toEqual({
            limit: 10,
            offset: 0,
            hasMore: false
        });
    });

    test("GET /api/v1/products should accept pagination parameters", async () => {
        productService.listProducts.mockResolvedValue({
            products: [],
            limit: 2,
            offset: 1,
            hasMore: true
        });

        const response = await request(app)
            .get("/api/v1/products?limit=2&offset=1");

        expect(response.status).toBe(200);

        expect(productService.listProducts).toHaveBeenCalledWith({
            limit: "2",
            offset: "1"
        });

        expect(response.body.pagination.hasMore).toBe(true);
    });

    test("GET /api/v1/products/:id should return one product", async () => {
        productService.getProductById.mockResolvedValue({
            id: "1",
            name: "Laptop",
            price: "55000.00"
        });

        const response = await request(app)
            .get("/api/v1/products/1");

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.name).toBe("Laptop");
    });

    test("GET /api/v1/products/:id should return 404 for missing product", async () => {
        productService.getProductById.mockResolvedValue(null);

        const response = await request(app)
            .get("/api/v1/products/999");

        expect(response.status).toBe(404);

        expect(response.body).toEqual({
            success: false,
            message: "Product not found"
        });
    });
});

// ----------------------------------------
// ORDER API TESTS
// ----------------------------------------

describe("Order API", () => {
    test("POST /api/v1/orders should create an order", async () => {
        orderService.createOrder.mockResolvedValue({
            id: "3",
            customer_id: "1",
            status: "PENDING",
            total_amount: "1499.00",
            replayed: false,
            items: []
        });

        const response = await request(app)
            .post("/api/v1/orders")
            .set("Idempotency-Key", "test-order-001")
            .send({
                customerId: 1,
                items: [
                    {
                        productId: 3,
                        quantity: 1
                    }
                ]
            });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);

        expect(response.body.data.status).toBe("PENDING");

        expect(orderService.createOrder).toHaveBeenCalledWith({
            customerId: 1,
            items: [
                {
                    productId: 3,
                    quantity: 1
                }
            ],
            idempotencyKey: "test-order-001"
        });
    });

    test("POST /api/v1/orders should return 200 for an idempotent replay", async () => {
        orderService.createOrder.mockResolvedValue({
            id: "3",
            customer_id: "1",
            status: "COMPLETED",
            total_amount: "1499.00",
            replayed: true,
            items: []
        });

        const response = await request(app)
            .post("/api/v1/orders")
            .set("Idempotency-Key", "test-order-001")
            .send({
                customerId: 1,
                items: [
                    {
                        productId: 3,
                        quantity: 1
                    }
                ]
            });

        expect(response.status).toBe(200);
        expect(response.body.message).toBe("Existing order returned");
        expect(response.body.data.replayed).toBe(true);
    });

    test("GET /api/v1/orders/:id should retrieve an order", async () => {
        orderService.getOrderById.mockResolvedValue({
            id: "2",
            customer_id: "1",
            status: "COMPLETED",
            total_amount: "1499.00",
            items: []
        });

        const response = await request(app)
            .get("/api/v1/orders/2");

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.status).toBe("COMPLETED");
    });

    test("GET /api/v1/orders/:id should return 400 for invalid ID", async () => {
        const error = new Error("Invalid order ID");
        error.statusCode = 400;

        orderService.getOrderById.mockRejectedValue(error);

        const response = await request(app)
            .get("/api/v1/orders/abc");

        expect(response.status).toBe(400);

        expect(response.body).toEqual({
            success: false,
            message: "Invalid order ID"
        });
    });

    test("GET /api/v1/orders/:id should return 404 for missing order", async () => {
        const error = new Error("Order not found");
        error.statusCode = 404;

        orderService.getOrderById.mockRejectedValue(error);

        const response = await request(app)
            .get("/api/v1/orders/999");

        expect(response.status).toBe(404);

        expect(response.body).toEqual({
            success: false,
            message: "Order not found"
        });
    });
});

// ----------------------------------------
// GENERAL ERROR HANDLING
// ----------------------------------------

describe("Application error handling", () => {
    test("Unknown API routes should return 404", async () => {
        const response = await request(app)
            .get("/api/v1/unknown");

        expect(response.status).toBe(404);
        expect(response.body.success).toBe(false);
    });
});
