/**
 * Enhanced API Error Handler Middleware
 * Provides detailed error information for API responses in debug mode,
 * simplified responses in production
 */

class ApiErrorHandler {
    /**
     * Main error handler function
     */
    static handle(error, request, reply) {
        // Log the full error for debugging
        request.log.error({
            error: error,
            url: request.url,
            method: request.method,
            headers: request.headers,
            body: request.body,
            query: request.query
        }, 'API Error occurred');

        // Build base error response
        const errorResponse = {
            success: false,
            error: {
                type: this.getErrorType(error),
                message: this.getErrorMessage(error),
                code: this.getErrorCode(error),
                timestamp: new Date().toISOString(),
                path: request.url,
                method: request.method
            },
            data: null
        };

        // Add detailed information in debug mode
        const isDebugMode = this.isDebugMode();

        if (isDebugMode) {
            errorResponse.error.details = {
                type: error.constructor?.name || 'Error',
                originalMessage: error.message,
                stack: error.stack,
                statusCode: error.statusCode || error.status || 500,
                ...this.getErrorSpecificDetails(error)
            };

            // Add request context
            errorResponse.debug = {
                headers: this.sanitizeHeaders(request.headers),
                body: this.sanitizeBody(request.body),
                query: request.query,
                params: request.params
            };
        } else {
            // In production, only add safe details
            const safeDetails = this.getSafeErrorDetails(error);
            if (safeDetails) {
                errorResponse.error.details = safeDetails;
            }
        }

        // Add request ID if available
        if (request.id) {
            errorResponse.error.requestId = request.id;
        }

        // Set appropriate status code
        const statusCode = this.getStatusCode(error);
        return reply.status(statusCode).send(errorResponse);
    }

    /**
     * Determine if debug mode is enabled
     */
    static isDebugMode() {
        return process.env.DEBUG_MODE === 'true' ||
               process.env.NODE_ENV === 'development' ||
               process.env.NODE_ENV !== 'production';
    }

    /**
     * Get error type based on error object
     */
    static getErrorType(error) {
        if (error.validation) return 'ValidationError';
        if (error.code && error.code.startsWith('23')) return 'DatabaseError';
        if (error.code?.startsWith('FST_JWT')) return 'AuthenticationError';
        if (error.message?.includes('Mikrotik')) return 'MikrotikError';
        return error.name || 'InternalServerError';
    }

    /**
     * Get appropriate error message
     */
    static getErrorMessage(error) {
        // Use specific error messages for known error types
        switch (this.getErrorType(error)) {
            case 'ValidationError':
                return 'Invalid request data';
            case 'DatabaseError':
                return this.getDatabaseErrorMessage(error);
            case 'AuthenticationError':
                return this.getAuthErrorMessage(error);
            case 'MikrotikError':
                return 'Mikrotik connection error';
            case 'NotFoundError':
                return 'Resource not found';
            case 'RateLimitError':
                return 'Too many requests';
            default:
                return error.message || 'An unexpected error occurred';
        }
    }

    /**
     * Get database error specific message
     */
    static getDatabaseErrorMessage(error) {
        switch (error.code) {
            case '23505':
                return 'Data already exists';
            case '23503':
                return 'Referenced data does not exist';
            case '23502':
                return 'Required field is missing';
            case '22001':
                return 'Input value is too long';
            case '22P02':
                return 'Invalid input format';
            default:
                return 'Database operation failed';
        }
    }

    /**
     * Get authentication error specific message
     */
    static getAuthErrorMessage(error) {
        switch (error.code) {
            case 'FST_JWT_NO_AUTHORIZATION_IN_HEADER':
                return 'No authorization token provided';
            case 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED':
                return 'Authorization token has expired';
            case 'FST_JWT_AUTHORIZATION_TOKEN_INVALID':
                return 'Invalid authorization token';
            default:
                return 'Authentication failed';
        }
    }

    /**
     * Get error code based on error type
     */
    static getErrorCode(error) {
        if (error.code) return error.code;

        switch (this.getErrorType(error)) {
            case 'ValidationError':
                return 'VALIDATION_ERROR';
            case 'DatabaseError':
                return this.getDatabaseErrorCode(error);
            case 'AuthenticationError':
                return this.getAuthErrorCode(error);
            case 'MikrotikError':
                return 'MIKROTIK_CONNECTION_ERROR';
            case 'NotFoundError':
                return 'NOT_FOUND';
            case 'RateLimitError':
                return 'RATE_LIMIT_EXCEEDED';
            default:
                return 'INTERNAL_SERVER_ERROR';
        }
    }

    /**
     * Get database error specific code
     */
    static getDatabaseErrorCode(error) {
        switch (error.code) {
            case '23505':
                return 'DUPLICATE_ENTRY';
            case '23503':
                return 'FOREIGN_KEY_VIOLATION';
            case '23502':
                return 'REQUIRED_FIELD_MISSING';
            case '22001':
                return 'VALUE_TOO_LONG';
            case '22P02':
                return 'INVALID_INPUT_FORMAT';
            default:
                return 'DATABASE_ERROR';
        }
    }

    /**
     * Get authentication error specific code
     */
    static getAuthErrorCode(error) {
        switch (error.code) {
            case 'FST_JWT_NO_AUTHORIZATION_IN_HEADER':
                return 'MISSING_TOKEN';
            case 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED':
                return 'TOKEN_EXPIRED';
            case 'FST_JWT_AUTHORIZATION_TOKEN_INVALID':
                return 'INVALID_TOKEN';
            default:
                return 'AUTHENTICATION_ERROR';
        }
    }

    /**
     * Get error-specific details
     */
    static getErrorSpecificDetails(error) {
        const details = {};

        // Validation error details
        if (error.validation) {
            details.validation = error.validation.map(err => ({
                field: err.dataPath || err.instancePath || err.params?.missingProperty || 'unknown',
                message: err.message,
                value: err.data
            }));
        }

        // Database error details
        if (error.code && error.code.startsWith('23')) {
            details.database = {
                constraint: error.constraint,
                table: error.table,
                column: error.column,
                sql: error.sql
            };
        }

        // Mikrotik error details
        if (error.message?.includes('Mikrotik')) {
            details.mikrotik = {
                originalError: error.message
            };
        }

        // Not found details
        if (error.statusCode === 404 || error.status === 404) {
            details.notFound = {
                originalMessage: error.message || 'Resource not found'
            };
        }

        // Rate limiting details
        if (error.statusCode === 429 || error.status === 429) {
            details.rateLimit = {
                retryAfter: error.headers?.['retry-after']
            };
        }

        return details;
    }

    /**
     * Get safe error details for production
     */
    static getSafeErrorDetails(error) {
        const safeDetails = {};

        // Database constraint violations are generally safe
        if (error.code && error.code.startsWith('23')) {
            safeDetails.database = {
                constraint: error.constraint,
                table: error.table
            };

            // Add field information for constraint violations
            if (error.code === '23505') { // unique violation
                const match = error.detail?.match(/Key \((.*?)\)=/);
                if (match) {
                    safeDetails.field = match[1];
                    safeDetails.message = `The value for ${match[1]} already exists`;
                }
            } else if (error.code === '23502') { // not null violation
                const match = error.detail?.match(/column "(.*?)" violates not-null constraint/);
                if (match) {
                    safeDetails.field = match[1];
                    safeDetails.message = `Field ${match[1]} is required`;
                }
            }
        }

        // Rate limiting retry information
        if (error.statusCode === 429 || error.status === 429) {
            safeDetails.retryAfter = error.headers?.['retry-after'];
        }

        return Object.keys(safeDetails).length > 0 ? safeDetails : null;
    }

    /**
     * Get appropriate status code
     */
    static getStatusCode(error) {
        return error.statusCode || error.status || 500;
    }

    /**
     * Sanitize headers to remove sensitive information
     */
    static sanitizeHeaders(headers = {}) {
        const sanitized = { ...headers };
        const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'x-auth-token'];
        sensitiveHeaders.forEach(header => {
            if (sanitized[header]) {
                sanitized[header] = '[REDACTED]';
            }
        });
        return sanitized;
    }

    /**
     * Sanitize body to remove sensitive information
     */
    static sanitizeBody(body = {}) {
        if (!body || typeof body !== 'object') {
            return body;
        }
        const sanitized = { ...body };
        const sensitiveFields = ['password', 'token', 'secret', 'key', 'authorization'];
        sensitiveFields.forEach(field => {
            if (sanitized[field]) {
                sanitized[field] = '[REDCATED]';
            }
        });
        return sanitized;
    }

    /**
     * Async handler wrapper for routes
     */
    static asyncHandler(fn) {
        return async (request, reply) => {
            try {
                return await fn(request, reply);
            } catch (error) {
                return this.handle(error, request, reply);
            }
        };
    }

    /**
     * Create specific error types
     */
    static validationError(message, field = null, details = null) {
        const error = new Error(message);
        error.name = 'ValidationError';
        error.validation = details || [{ message, field }];
        error.statusCode = 400;
        error.code = 'VALIDATION_ERROR';
        error.field = field;
        return error;
    }

    static notFoundError(message = 'Resource not found', details = null) {
        const error = new Error(message);
        error.name = 'NotFoundError';
        error.statusCode = 404;
        error.code = 'NOT_FOUND';
        error.details = details;
        return error;
    }

    static unauthorizedError(message = 'Unauthorized access', details = null) {
        const error = new Error(message);
        error.name = 'AuthenticationError';
        error.statusCode = 401;
        error.code = 'UNAUTHORIZED';
        error.details = details;
        return error;
    }

    static forbiddenError(message = 'Access forbidden', details = null) {
        const error = new Error(message);
        error.name = 'ForbiddenError';
        error.statusCode = 403;
        error.code = 'FORBIDDEN';
        error.details = details;
        return error;
    }

    static databaseError(message, originalError = null, query = null) {
        const error = new Error(message);
        error.name = 'DatabaseError';
        error.originalError = originalError;
        error.sql = query;
        error.code = this.getDatabaseErrorCode(originalError || {});
        return error;
    }

    static rateLimitError(message = 'Too many requests', retryAfter = null) {
        const error = new Error(message);
        error.name = 'RateLimitError';
        error.statusCode = 429;
        error.code = 'RATE_LIMIT_EXCEEDED';
        error.headers = { 'retry-after': retryAfter };
        return error;
    }
}

// Export both the class and a compatibility function
function apiErrorHandler(error, request, reply) {
    return ApiErrorHandler.handle(error, request, reply);
}

// Export both for backward compatibility
module.exports = { ApiErrorHandler, apiErrorHandler };