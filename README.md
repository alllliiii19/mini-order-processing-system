
# Mini Order Processing System

A backend order processing application built using Node.js, Express.js, PostgreSQL, Redis, BullMQ and Docker.

The application supports order creation, inventory reservation, idempotent requests, asynchronous order processing and product caching.

## Features

- RESTful APIs for products and orders
- PostgreSQL database with relational schema
- Transaction-based order creation
- Atomic inventory reservation
- Idempotency to prevent duplicate orders
- Transactional Outbox Pattern for reliable event publishing
- Redis and BullMQ for asynchronous job processing
- Background workers for order fulfillment
- Automatic inventory updates
- Redis caching for product information
- Cache invalidation after inventory changes
- Automated API and database integration tests
- Docker and Docker Compose support

## Technology Stack

| Technology | Purpose |
|---|---|
| Node.js | Backend runtime |
| Express.js | REST API framework |
| PostgreSQL | Relational database |
| Redis | Caching and message queue storage |
| BullMQ | Background job processing |
| ioredis | Redis client |
| node-postgres (pg) | PostgreSQL connectivity |
| Jest | Automated testing |
| Supertest | HTTP API testing |
| Docker | Application containerization |
| Docker Compose | Multi-container orchestration |

## System Architecture

The application follows a layered architecture.

### Backend layers

- Routes: Define API endpoints.
- Controllers: Handle HTTP requests and responses.
- Services: Implement business logic and validation.
- Repositories: Execute database queries.
- Middleware: Handle errors and unknown routes.

### Order processing workflow

1. A client submits an order through the Express API.
2. The application validates the request and checks the idempotency key.
3. PostgreSQL reserves the required inventory.
4. The order, order items and outbox event are saved within one database transaction.
5. The outbox publisher reads unpublished events from PostgreSQL.
6. Events are published to Redis through BullMQ.
7. A background worker consumes the queued job.
8. The worker finalizes inventory and updates the order status.
9. The client can retrieve the latest order status through the API.

### Caching workflow

The application uses the cache-aside pattern.

- Check Redis before querying PostgreSQL.
- On a cache miss, retrieve the product from PostgreSQL.
- Store the result in Redis with a 60-second expiration.
- Invalidate product caches when inventory changes.

## Project Structure

```text
mini-order-processing-system/
│
├── database/
│   ├── schema.sql
│   ├── seed.sql
│   └── outbox.sql
│
├── src/
│   ├── config/
│   │   ├── database.js
│   │   ├── redis.js
│   │   └── cache.js
│   │
│   ├── controllers/
│   │   ├── product.controller.js
│   │   └── order.controller.js
│   │
│   ├── middleware/
│   │   └── error.middleware.js
│   │
│   ├── queues/
│   │   └── order.queue.js
│   │
│   ├── repositories/
│   │   ├── product.repository.js
│   │   └── order.repository.js
│   │
│   ├── routes/
│   │   ├── product.routes.js
│   │   └── order.routes.js
│   │
│   ├── services/
│   │   ├── product.service.js
│   │   ├── order.service.js
│   │   ├── order.processor.js
│   │   └── outbox.publisher.js
│   │
│   ├── workers/
│   │   └── order.worker.js
│   │
│   ├── app.js
│   ├── server.js
│   └── publisher.js
│
├── tests/
│   ├── api.test.js
│   └── order.integration.test.js
│
├── Dockerfile
├── compose.yaml
├── .dockerignore
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## Prerequisites

To run the application locally, install:

- Docker
- Docker Compose v2
- Git

For running tests directly on your computer, Node.js 22 and npm are also required.

## Environment Configuration

Clone the repository:

```bash
git clone <YOUR_GITHUB_REPOSITORY_URL>
cd mini-order-processing-system
```

Create your local environment file:

```bash
cp .env.example .env
```

Configure the environment variables:

```env
PORT=3000

DB_HOST=localhost
DB_PORT=5432
DB_NAME=order_processing
DB_USER=order_app
DB_PASSWORD=your_local_password

REDIS_HOST=localhost
REDIS_PORT=6379
```

The Docker Compose configuration automatically overrides the database and Redis hostnames for container-to-container communication.

Never commit your actual `.env` file.

## Run the Application Using Docker

Build and start all services with one command:

```bash
docker compose up --build -d
```

This starts:

| Service | Description |
|---|---|
| API | Express REST API |
| PostgreSQL | Database |
| Redis | Cache and queue storage |
| Publisher | Outbox event publisher |
| Worker | Background order processor |

Check container status:

```bash
docker compose ps
```

View application logs:

```bash
docker compose logs -f api publisher worker
```

## API Documentation

Base URL:

```text
http://localhost:3000/api/v1
```

### 1. Health Check

**GET** `/health`

Checks whether the API is running.

Example:

```bash
curl http://localhost:3000/api/v1/health
```

### 2. List Products

**GET** `/products`

Supports pagination.

Query parameters:

| Parameter | Description | Default |
|---|---|---|
| limit | Number of products to return (1–100) | 20 |
| offset | Number of records to skip | 0 |

Example:

```bash
curl "http://localhost:3000/api/v1/products?limit=2&offset=0"
```

### 3. Get Product

**GET** `/products/:id`

Retrieves a product by its ID.

Example:

```bash
curl http://localhost:3000/api/v1/products/1
```

### 4. Create Order

**POST** `/orders`

Required header:

```text
Content-Type: application/json
Idempotency-Key: unique-order-key
```

Example:

```bash
curl -X POST http://localhost:3000/api/v1/orders \
-H "Content-Type: application/json" \
-H "Idempotency-Key: order-001" \
-d '{
  "customerId": 1,
  "items": [
    {
      "productId": 1,
      "quantity": 2
    },
    {
      "productId": 2,
      "quantity": 1
    }
  ]
}'
```

A successful new order returns HTTP 201.

The initial order status is `PENDING` because processing happens asynchronously.

### 5. Get Order Status

**GET** `/orders/:id`

Retrieves order details and its current processing status.

Example:

```bash
curl http://localhost:3000/api/v1/orders/1
```

Possible order statuses:

- PENDING
- QUEUED
- PROCESSING
- COMPLETED
- FAILED
- CANCELLED

## Database Design

The PostgreSQL database contains five tables:

| Table | Purpose |
|---|---|
| customers | Customer information |
| products | Product catalogue and inventory |
| orders | Main order records |
| order_items | Individual products belonging to an order |
| outbox_events | Events waiting to be published |

The database schema is available in the `database/` directory.

## Automated Testing

Install dependencies:

```bash
npm ci
```

### API Unit Tests

Run:

```bash
npm test
```

Tests API routes, controllers, HTTP status codes and response handling using Jest and Supertest.

### Database Integration Tests

The integration tests use a separate database named `order_processing_test`.

Start PostgreSQL and Redis:

```bash
docker compose up -d postgres redis
```

Create the test database:

```bash
docker compose exec -T postgres psql \
-U order_app -d postgres <<'SQL'
SELECT 'CREATE DATABASE order_processing_test'
WHERE NOT EXISTS (
    SELECT 1 FROM pg_database
    WHERE datname = 'order_processing_test'
)
\gexec
SQL
```

Initialize the test database:

```bash
cat database/schema.sql | docker compose exec -T postgres \
psql -U order_app -d order_processing_test

cat database/outbox.sql | docker compose exec -T postgres \
psql -U order_app -d order_processing_test

cat database/seed.sql | docker compose exec -T postgres \
psql -U order_app -d order_processing_test
```

Run integration tests:

```bash
npm run test:integration
```

Run both test suites:

```bash
npm run test:all
```

The integration tests cover:

- Order creation and inventory reservation
- Idempotency and duplicate requests
- Conflicting idempotency keys
- Insufficient inventory
- Duplicate worker processing
- Concurrent orders and overselling prevention

The test suite was verified with 17 passing tests.

## Useful Docker Commands

Check running containers:

```bash
docker compose ps
```

View API logs:

```bash
docker compose logs -f api
```

View publisher logs:

```bash
docker compose logs -f publisher
```

View worker logs:

```bash
docker compose logs -f worker
```

Stop the application:

```bash
docker compose down
```

Stop the application and remove its database and Redis volumes:

```bash
docker compose down -v
```

**Warning:** The `-v` option deletes persistent PostgreSQL and Redis data. Do not use it when you need to preserve application data.

## Notes

- The API is exposed on `http://localhost:3000`.
- PostgreSQL and Redis are accessible through Docker networking.
- The application uses database transactions to maintain inventory consistency.
- BullMQ handles asynchronous processing and retry attempts.
- Redis caching reduces repeated product database queries.
- The outbox pattern helps prevent losing order-created events between database commits and queue publishing.
