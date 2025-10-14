/**
 * API Error Handler Middleware
 * Provides detailed error information for API responses
 */

function apiErrorHandler(error, request, reply) {
    // Log the full error for debugging
    request.log.error({
        error: error,
        url: request.url,
        method: request.method,
        headers: request.headers,
        body: request.body,
        query: request.query
    }, 'API Error occurred');

    // Determine if this is a validation error
    if (error.validation) {
        return reply.status(400).send({
            success: false,
            error: {
                type: 'ValidationError',
                message: 'Invalid request data',
                details: error.validation.map(err => ({
                    field: err.dataPath || err.instancePath || err.params?.missingProperty || 'unknown',
                    message: err.message,
                    value: err.data
                })),
                code: 'VALIDATION_ERROR'
            },
            timestamp: new Date().toISOString(),
            path: request.url
        });
    }

    // Handle database errors
    if (error.code && error.code.startsWith('23')) {
        // PostgreSQL constraint violation
        return reply.status(400).send({
            success: false,
            error: {
                type: 'DatabaseError',
                message: 'Database constraint violation',
                details: {
                    constraint: error.constraint,
                    table: error.table,
                    column: error.column
                },
                code: 'DATABASE_CONSTRAINT_ERROR',
                sql: error.sql
            },
            timestamp: new Date().toISOString(),
            path: request.url
        });
    }

    // Handle JWT errors
    if (error.code === 'FST_JWT_NO_AUTHORIZATION_IN_HEADER') {
        return reply.status(401).send({
            success: false,
            error: {
                type: 'AuthenticationError',
                message: 'No authorization token provided',
                details: 'Please provide a valid JWT token in the Authorization header',
                code: 'MISSING_TOKEN'
            },
            timestamp: new Date().toISOString(),
            path: request.url
        });
    }

    if (error.code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED') {
        return reply.status(401).send({
            success: false,
            error: {
                type: 'AuthenticationError',
                message: 'Authorization token has expired',
                details: 'Please login again to get a new token',
                code: 'TOKEN_EXPIRED'
            },
            timestamp: new Date().toISOString(),
            path: request.url
        });
    }

    if (error.code === 'FST_JWT_AUTHORIZATION_TOKEN_INVALID') {
        return reply.status(401).send({
            success: false,
            error: {
                type: 'AuthenticationError',
                message: 'Invalid authorization token',
                details: 'The provided token is not valid',
                code: 'INVALID_TOKEN'
            },
            timestamp: new Date().toISOString(),
            path: request.url
        });
    }

    // Handle Mikrotik connection errors
    if (error.message && error.message.includes('Mikrotik')) {
        return reply.status(503).send({
            success: false,
            error: {
                type: 'MikrotikError',
                message: 'Mikrotik connection error',
                details: error.message,
                code: 'MIKROTIK_CONNECTION_ERROR'
            },
            timestamp: new Date().toISOString(),
            path: request.url
        });
    }

    // Handle not found errors
    if (error.statusCode === 404 || error.status === 404) {
        return reply.status(404).send({
            success: false,
            error: {
                type: 'NotFoundError',
                message: 'Resource not found',
                details: error.message || 'The requested resource does not exist',
                code: 'NOT_FOUND'
            },
            timestamp: new Date().toISOString(),
            path: request.url
        });
    }

    // Handle rate limiting
    if (error.statusCode === 429 || error.status === 429) {
        return reply.status(429).send({
            success: false,
            error: {
                type: 'RateLimitError',
                message: 'Too many requests',
                details: 'Please wait before making another request',
                code: 'RATE_LIMIT_EXCEEDED',
                retryAfter: error.headers?.['retry-after']
            },
            timestamp: new Date().toISOString(),
            path: request.url
        });
    }

    // Default error response with full details in development
    const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production';

    const errorResponse = {
        success: false,
        error: {
            type: error.name || 'InternalServerError',
            message: error.message || 'An unexpected error occurred',
            code: error.code || 'INTERNAL_SERVER_ERROR'
        },
        timestamp: new Date().toISOString(),
        path: request.url
    };

    // Add stack trace in development
    if (isDevelopment) {
        errorResponse.error.stack = error.stack;
        errorResponse.error.details = {
            statusCode: error.statusCode || error.status,
            ...error
        };
    }

    // Set appropriate status code
    const statusCode = error.statusCode || error.status || 500;

    return reply.status(statusCode).send(errorResponse);
}

module.exports = apiErrorHandler;