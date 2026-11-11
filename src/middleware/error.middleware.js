
function notFoundHandler(req, res, next) {

    const error = new Error(
        `Route not found: ${req.method} ${req.originalUrl}`
    );

    error.statusCode = 404;

    next(error);
}


function errorHandler(error, req, res, next) {

    console.error(error);

    const statusCode =
        error.statusCode || error.status || 500;

    res.status(statusCode).json({
        success: false,
        message: statusCode >= 500
            ? "Internal server error"
            : error.message
    });
}

module.exports = {
    notFoundHandler,
    errorHandler
};
