
const productService = require("../services/product.service");


// GET /api/v1/products
async function listProducts(req, res, next) {

    try {
        const result = await productService.listProducts({
            limit: req.query.limit,
            offset: req.query.offset
        });

        res.status(200).json({
            success: true,
            data: result.products,
            pagination: {
                limit: result.limit,
                offset: result.offset,
                hasMore: result.hasMore
            }
        });

    } catch (error) {
        next(error);
    }
}


// GET /api/v1/products/:id
async function getProductById(req, res, next) {

    try {
        const product = await productService.getProductById(
            req.params.id
        );

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        res.status(200).json({
            success: true,
            data: product
        });

    } catch (error) {
        next(error);
    }
}

module.exports = {
    listProducts,
    getProductById
};
