
-- ==========================================
-- MINI ORDER PROCESSING SYSTEM
-- DATABASE SCHEMA
-- ==========================================

BEGIN;

-- 1. CUSTOMERS TABLE

CREATE TABLE customers (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    full_name VARCHAR(150) NOT NULL,

    email VARCHAR(255) NOT NULL UNIQUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- 2. PRODUCTS TABLE

CREATE TABLE products (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    name VARCHAR(150) NOT NULL,

    sku VARCHAR(100) NOT NULL UNIQUE,

    price NUMERIC(12,2) NOT NULL
        CHECK (price >= 0),

    on_hand_quantity INTEGER NOT NULL DEFAULT 0
        CHECK (on_hand_quantity >= 0),

    reserved_quantity INTEGER NOT NULL DEFAULT 0
        CHECK (reserved_quantity >= 0),

    CHECK (reserved_quantity <= on_hand_quantity),

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- 3. ORDERS TABLE

CREATE TABLE orders (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    customer_id BIGINT NOT NULL
        REFERENCES customers(id) ON DELETE RESTRICT,

    status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
        CHECK (
            status IN (
                'PENDING',
                'QUEUED',
                'PROCESSING',
                'COMPLETED',
                'FAILED',
                'CANCELLED'
            )
        ),

    total_amount NUMERIC(12,2) NOT NULL DEFAULT 0
        CHECK (total_amount >= 0),

    idempotency_key VARCHAR(255),

    -- SHA-256 hash used to detect conflicting idempotent requests.
    request_hash CHAR(64),

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (customer_id, idempotency_key)
);


-- 4. ORDER ITEMS TABLE

CREATE TABLE order_items (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    order_id BIGINT NOT NULL
        REFERENCES orders(id) ON DELETE RESTRICT,

    product_id BIGINT NOT NULL
        REFERENCES products(id) ON DELETE RESTRICT,

    quantity INTEGER NOT NULL
        CHECK (quantity > 0),

    unit_price NUMERIC(12,2) NOT NULL
        CHECK (unit_price >= 0),

    UNIQUE (order_id, product_id)
);


-- 5. INDEXES

CREATE INDEX idx_orders_customer_created
ON orders(customer_id, created_at DESC);

CREATE INDEX idx_orders_status
ON orders(status);

CREATE INDEX idx_order_items_product
ON order_items(product_id);

COMMIT;
