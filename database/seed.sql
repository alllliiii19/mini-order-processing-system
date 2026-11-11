
BEGIN;

-- Insert sample customers
INSERT INTO customers (full_name, email)
VALUES
    ('Hadi Abbas', 'hadi@example.com'),
    ('Ali Khan', 'ali@example.com')
ON CONFLICT (email) DO NOTHING;


-- Insert sample products
INSERT INTO products
    (name, sku, price, on_hand_quantity)
VALUES
    ('Laptop', 'LAP-001', 55000.00, 10),
    ('Wireless Mouse', 'MOU-001', 799.00, 25),
    ('Keyboard', 'KEY-001', 1499.00, 15),
    ('Monitor', 'MON-001', 12000.00, 8),
    ('Headphones', 'HEAD-001', 2499.00, 20)
ON CONFLICT (sku) DO NOTHING;

COMMIT;
