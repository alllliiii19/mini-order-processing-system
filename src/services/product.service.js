
const productRepository = require("../repositories/product.repository");
const cacheRedis = require("../config/cache");

const CACHE_TTL_SECONDS = 60;
const CACHE_VERSION_KEY = "products:cache:version";

let connectionPromise = null;

function createValidationError(message) {
    const error = new Error(message);
    error.statusCode = 400;
    return error;
}

// Wait until Redis is ready before executing commands.
async function ensureCacheConnection() {
    if (cacheRedis.status === "ready") {
        return;
    }

    if (cacheRedis.status === "end") {
        throw new Error("Redis cache connection has ended");
    }

    // Share one connection attempt between concurrent requests.
    if (!connectionPromise) {
        if (cacheRedis.status === "wait") {
            connectionPromise = cacheRedis.connect();
        } else {
            connectionPromise = new Promise((resolve, reject) => {
                const cleanup = () => {
                    cacheRedis.removeListener("ready", onReady);
                    cacheRedis.removeListener("error", onError);
                };

                const onReady = () => {
                    cleanup();
                    resolve();
                };

                const onError = (error) => {
                    cleanup();
                    reject(error);
                };

                cacheRedis.once("ready", onReady);
                cacheRedis.once("error", onError);
            });
        }

        connectionPromise = connectionPromise.finally(() => {
            connectionPromise = null;
        });
    }

    await connectionPromise;
}

// Get the current cache version.
async function getCacheVersion() {
    try {
        await ensureCacheConnection();

        return (await cacheRedis.get(CACHE_VERSION_KEY)) || "0";

    } catch (error) {
        console.warn("Product cache unavailable:", error.message);
        return null;
    }
}

// Read data from Redis.
async function readCache(key) {
    try {
        await ensureCacheConnection();

        const cached = await cacheRedis.get(key);

        return cached === null ? undefined : JSON.parse(cached);

    } catch (error) {
        console.warn("Product cache read failed:", error.message);
        return undefined;
    }
}

// Write data to Redis with a TTL.
async function writeCache(key, value) {
    try {
        await ensureCacheConnection();

        await cacheRedis.set(
            key,
            JSON.stringify(value),
            "EX",
            CACHE_TTL_SECONDS
        );

    } catch (error) {
        console.warn("Product cache write failed:", error.message);
    }
}

// Invalidate product cache by increasing its version.
async function invalidateProductCache() {
    try {
        await ensureCacheConnection();

        await cacheRedis.incr(CACHE_VERSION_KEY);

        console.log("Product cache invalidated");

    } catch (error) {
        console.warn(
            "Product cache invalidation failed:",
            error.message
        );
    }
}

// Get products with validated pagination.
async function listProducts({ limit, offset }) {
    const parsedLimit =
        limit === undefined ? 20 : Number(limit);

    const parsedOffset =
        offset === undefined ? 0 : Number(offset);

    if (
        !Number.isInteger(parsedLimit) ||
        parsedLimit < 1 ||
        parsedLimit > 100
    ) {
        throw createValidationError(
            "Limit must be between 1 and 100"
        );
    }

    if (
        !Number.isInteger(parsedOffset) ||
        parsedOffset < 0
    ) {
        throw createValidationError(
            "Offset must be a non-negative integer"
        );
    }

    const version = await getCacheVersion();

    const cacheKey = version === null
        ? null
        : `products:v${version}:list:${parsedLimit}:${parsedOffset}`;

    // Check Redis first.
    if (cacheKey) {
        const cachedResult = await readCache(cacheKey);

        if (cachedResult !== undefined) {
            console.log("Product list cache hit");
            return cachedResult;
        }
    }

    // Cache miss: retrieve products from PostgreSQL.
    console.log("Product list cache miss");

    const result = {
        ...(await productRepository.findAll({
            limit: parsedLimit,
            offset: parsedOffset
        })),
        limit: parsedLimit,
        offset: parsedOffset
    };

    // Store the result in Redis.
    if (cacheKey) {
        await writeCache(cacheKey, result);
    }

    return result;
}

// Get a single product.
async function getProductById(id) {
    if (!/^[1-9]\d*$/.test(id)) {
        throw createValidationError(
            "Product ID must be a positive integer"
        );
    }

    const version = await getCacheVersion();

    const cacheKey = version === null
        ? null
        : `products:v${version}:item:${id}`;

    // Check Redis first.
    if (cacheKey) {
        const cachedProduct = await readCache(cacheKey);

        if (cachedProduct !== undefined) {
            console.log(`Product ${id} cache hit`);
            return cachedProduct;
        }
    }

    // Cache miss: query PostgreSQL.
    console.log(`Product ${id} cache miss`);

    const product = await productRepository.findById(id);

    // Cache existing products only.
    if (product && cacheKey) {
        await writeCache(cacheKey, product);
    }

    return product;
}

module.exports = {
    listProducts,
    getProductById,
    invalidateProductCache
};
