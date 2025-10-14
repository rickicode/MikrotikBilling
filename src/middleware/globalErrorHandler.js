/**
 * Global Error Handler Middleware
 * Provides detailed error responses for all API endpoints
 */

class GlobalErrorHandler {
    /**
     * Handle 404 errors
     */
    static notFound(request, reply) {
        return reply.status(404).send({
            success: false,
            error: {
                code: 'NOT_FOUND',
                message: 'Endpoint not found',
                details: `Route ${request.method} ${request.url} does not exist`,
                timestamp: new Date().toISOString(),
                path: request.url,
                method: request.method
            },
            data: null
        });
    }

    /**
     * Handle general errors
     */
    static async errorHandler(error, request, reply) {
        // Log the full error for debugging
        console.error('🔥 Global Error Handler:', {
            error: error.message,
            stack: error.stack,
            url: request.url,
            method: request.method,
            headers: request.headers,
            body: request.body,
            query: request.query,
            params: request.params,
            timestamp: new Date().toISOString()
        });

        // Default error response
        let statusCode = 500;
        let errorCode = 'INTERNAL_SERVER_ERROR';
        let message = 'An unexpected error occurred';
        let details = null;
        let field = null;

        // Handle specific error types
        if (error.name === 'ValidationError') {
            statusCode = 400;
            errorCode = 'VALIDATION_ERROR';
            message = 'Validation failed';
            details = error.details || error.message;
        } else if (error.name === 'JsonWebTokenError') {
            statusCode = 401;
            errorCode = 'INVALID_TOKEN';
            message = 'Invalid or expired authentication token';
        } else if (error.name === 'UnauthorizedError') {
            statusCode = 401;
            errorCode = 'UNAUTHORIZED';
            message = 'Authentication required';
        } else if (error.name === 'ForbiddenError') {
            statusCode = 403;
            errorCode = 'FORBIDDEN';
            message = 'You do not have permission to perform this action';
        } else if (error.code === '23505') { // PostgreSQL unique violation
            statusCode = 409;
            errorCode = 'DUPLICATE_ENTRY';
            message = 'Data already exists';

            // Extract field from constraint violation if available
            const match = error.detail.match(/Key \((.*?)\)=/);
            if (match) {
                field = match[1];
                details = `The value for ${field} already exists`;
            }
        } else if (error.code === '23503') { // PostgreSQL foreign key violation
            statusCode = 400;
            errorCode = 'FOREIGN_KEY_VIOLATION';
            message = 'Referenced data does not exist';
            details = error.detail;
        } else if (error.code === '23502') { // PostgreSQL not null violation
            statusCode = 400;
            errorCode = 'REQUIRED_FIELD_MISSING';
            message = 'Required field is missing';

            // Extract field from violation if available
            const match = error.detail.match(/column "(.*?)" violates not-null constraint/);
            if (match) {
                field = match[1];
                details = `Field ${field} is required`;
            }
        } else if (error.code === '22001') { // String too long
            statusCode = 400;
            errorCode = 'VALUE_TOO_LONG';
            message = 'Input value is too long';
            details = error.detail;
        } else if (error.code === '22P02') { // Invalid input syntax
            statusCode = 400;
            errorCode = 'INVALID_INPUT_FORMAT';
            message = 'Invalid input format';
            details = error.detail;
        } else if (error.statusCode || error.status) {
            statusCode = error.statusCode || error.status;
            errorCode = error.code || 'CUSTOM_ERROR';
            message = error.message;
            details = error.details || null;
        } else if (error.message) {
            // Handle custom application errors
            message = error.message;

            // Try to determine error type from message
            if (error.message.includes('not found')) {
                statusCode = 404;
                errorCode = 'NOT_FOUND';
            } else if (error.message.includes('already exists') || error.message.includes('duplicate')) {
                statusCode = 409;
                errorCode = 'DUPLICATE_ENTRY';
            } else if (error.message.includes('required') || error.message.includes('missing')) {
                statusCode = 400;
                errorCode = 'VALIDATION_ERROR';
            } else if (error.message.includes('permission') || error.message.includes('authorized')) {
                statusCode = 403;
                errorCode = 'FORBIDDEN';
            }
        }

        // Build error response
        const errorResponse = {
            success: false,
            error: {
                code: errorCode,
                message: message,
                timestamp: new Date().toISOString(),
                path: request.url,
                method: request.method
            },
            data: null
        };

        // Add additional details in development mode
        if (process.env.NODE_ENV !== 'production') {
            errorResponse.error.details = details || error.message;
            errorResponse.error.stack = error.stack;
            errorResponse.debug = {
                headers: request.headers,
                body: request.body,
                query: request.query,
                params: request.params
            };

            if (field) {
                errorResponse.error.field = field;
            }
        } else {
            // In production, only add safe details
            if (details && !details.includes('password') && !details.includes('secret')) {
                errorResponse.error.details = details;
            }
            if (field) {
                errorResponse.error.field = field;
            }
        }

        // Add request ID if available
        if (request.id) {
            errorResponse.error.requestId = request.id;
        }

        return reply.status(statusCode).send(errorResponse);
    }

    /**
     * Wrap async routes to catch errors automatically
     */
    static asyncHandler(fn) {
        return async (request, reply) => {
            try {
                return await fn(request, reply);
            } catch (error) {
                return this.errorHandler(error, request, reply);
            }
        };
    }

    /**
     * Handle database query errors with specific details
     */
    static handleDatabaseError(error, query, params = []) {
        console.error('🔴 Database Error:', {
            error: error.message,
            code: error.code,
            query: query,
            params: params,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });

        // Create enhanced error with database context
        const dbError = new Error(error.message);
        dbError.name = 'DatabaseError';
        dbError.code = error.code;
        dbError.details = `Query failed: ${query.substring(0, 100)}...`;
        dbError.originalError = error;

        return dbError;
    }

    /**
     * Validation error helper
     */
    static validationError(message, field = null, details = null) {
        const error = new Error(message);
        error.name = 'ValidationError';
        error.statusCode = 400;
        error.code = 'VALIDATION_ERROR';
        error.field = field;
        error.details = details;
        return error;
    }

    /**
     * Not found error helper
     */
    static notFoundError(resource = 'Resource') {
        const error = new Error(`${resource} not found`);
        error.name = 'NotFoundError';
        error.statusCode = 404;
        error.code = 'NOT_FOUND';
        return error;
    }

    /**
     * Unauthorized error helper
     */
    static unauthorizedError(message = 'Unauthorized access') {
        const error = new Error(message);
        error.name = 'UnauthorizedError';
        error.statusCode = 401;
        error.code = 'UNAUTHORIZED';
        return error;
    }

    /**
     * Forbidden error helper
     */
    static forbiddenError(message = 'Access forbidden') {
        const error = new Error(message);
        error.name = 'ForbiddenError';
        error.statusCode = 403;
        error.code = 'FORBIDDEN';
        return error;
    }
}

module.exports = GlobalErrorHandler;