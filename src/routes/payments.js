const { db } = require('../database/DatabaseManager');
const auth = require('../middleware/auth');
const CarryOverService = require('../services/CarryOverService');
const { ApiErrorHandler } = require('../middleware/apiErrorHandler');

const paymentRoutes = (fastify, options, done) => {
    // Initialize CarryOverService with database pool
    const carryOverService = new CarryOverService(fastify.db?.getPool?.() || null);

    // Payment Management Page
    fastify.get('/', { preHandler: auth.verifyToken }, async (request, reply) => {
        try {
            // Use the singleton db instance directly

            // Get basic statistics for the page
            const stats = {
                total_count: 0,
                successful_count: 0,
                pending_count: 0,
                monthly_revenue: 0
            };

            try {
                const statsResult = await db.query(`
                    SELECT
                        COUNT(*) as total_count,
                        COUNT(CASE WHEN status = 'paid' THEN 1 END) as successful_count,
                        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
                        COALESCE(SUM(CASE
                            WHEN status = 'paid'
                            AND DATE(created_at) >= DATE_TRUNC('month', CURRENT_DATE)
                            THEN amount
                            ELSE 0
                        END), 0) as monthly_revenue
                    FROM payments
                `);
                if (statsResult && statsResult.length > 0) {
                    Object.assign(stats, statsResult[0]);
                }
            } catch (error) {
                fastify.log.error('Error getting payment stats:', error);
            }

            // Get today's summary
            const todaySummary = {
                count: 0,
                amount: 0
            };

            try {
                const todayResult = await db.query(`
                    SELECT
                        COUNT(*) as count,
                        COALESCE(SUM(amount), 0) as amount
                    FROM payments
                    WHERE DATE(created_at) = CURRENT_DATE
                `);
                if (todayResult && todayResult.length > 0) {
                    Object.assign(todaySummary, todayResult[0]);
                }
            } catch (error) {
                fastify.log.error('Error getting today summary:', error);
            }

            return reply.view('payments/index', {
                admin: request.admin,
                stats,
                todaySummary
            });
        } catch (error) {
            console.error('DETAILED ERROR loading payments page:', error);
            console.error('ERROR STACK:', error.stack);
            fastify.log.error('Error loading payments page:', error);
            return reply.code(500).view('error', { error: 'Internal Server Error', detail: error.message });
        }
    });

    // Get payments with pagination and filtering
    fastify.get('/api/payments', { preHandler: auth.verifyTokenAPI }, ApiErrorHandler.asyncHandler(async (request, reply) => {
            const {
                page = 1,
                limit = 20,
                search = '',
                status = '',
                method = '',
                start_date = '',
                end_date = '',
                sort_by = 'created_at',
                sort_order = 'desc'
            } = request.query;

            const offset = (page - 1) * limit;

            // Build WHERE conditions
            let whereConditions = [];
            let queryParams = [];
            let paramIndex = 1;

            if (search) {
                whereConditions.push(`
                    (p.id ILIKE $${paramIndex} OR
                     c.nama ILIKE $${paramIndex + 1} OR
                     c.nomor_hp ILIKE $${paramIndex + 2} OR
                     pr.name ILIKE $${paramIndex + 3} OR
                     p.notes ILIKE $${paramIndex + 4})
                `);
                const searchPattern = `%${search}%`;
                queryParams.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
                paramIndex += 5;
            }

            if (status) {
                whereConditions.push(`p.status = $${paramIndex}`);
                queryParams.push(status);
                paramIndex++;
            }

            if (method) {
                whereConditions.push(`p.method = $${paramIndex}`);
                queryParams.push(method);
                paramIndex++;
            }

            if (start_date) {
                whereConditions.push(`DATE(p.created_at) >= $${paramIndex}`);
                queryParams.push(start_date);
                paramIndex++;
            }

            if (end_date) {
                whereConditions.push(`DATE(p.created_at) <= $${paramIndex}`);
                queryParams.push(end_date);
                paramIndex++;
            }

            const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

            // Get total count
            const countQuery = `
                SELECT COUNT(*) as total
                FROM payments p
                LEFT JOIN customers c ON p.customer_id = c.id
                LEFT JOIN subscriptions s ON p.subscription_id = s.id
                LEFT JOIN profiles pr ON s.profile_id = pr.id
                ${whereClause}
            `;
            const countResult = await db.query(countQuery, queryParams);
            const total = countResult[0]?.total || 0;

            // Get payments
            const paymentsQuery = `
                SELECT
                    p.*,
                    c.nama as customer_name,
                    c.nomor_hp as customer_phone,
                    s.profile_id,
                    pr.name as subscription_name,
                    CASE
                        WHEN p.customer_id IS NOT NULL THEN 'customer'
                        ELSE 'guest'
                    END as payment_type
                FROM payments p
                LEFT JOIN customers c ON p.customer_id = c.id
                LEFT JOIN subscriptions s ON p.subscription_id = s.id
                LEFT JOIN profiles pr ON s.profile_id = pr.id
                ${whereClause}
                ORDER BY ${sort_by} ${sort_order.toUpperCase()}
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
            `;

            queryParams.push(limit, offset);
            const paymentsResult = await db.query(paymentsQuery, queryParams);

            const pagination = {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages: Math.ceil(total / limit)
            };

            return reply.send({
                success: true,
                data: {
                    payments: paymentsResult,
                    pagination
                }
            });
        }));

    // Get payment statistics
    fastify.get('/api/payments/statistics', { preHandler: auth.verifyTokenAPI }, ApiErrorHandler.asyncHandler(async (request, reply) => {
            const statsQuery = `
                SELECT
                    COUNT(*) as total_count,
                    COUNT(CASE WHEN status = 'paid' THEN 1 END) as successful_count,
                    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
                    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count,
                    COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_count,
                    COALESCE(SUM(CASE
                        WHEN status = 'paid'
                        AND DATE(created_at) >= DATE_TRUNC('month', CURRENT_DATE)
                        THEN amount
                        ELSE 0
                    END), 0) as monthly_revenue,
                    COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) as total_revenue
                FROM payments
            `;
            const result = await db.query(statsQuery);
            const stats = result[0] || {};

            return reply.send({
                success: true,
                data: stats
            });
        }));

    // Get today's summary
    fastify.get('/api/payments/today-summary', { preHandler: auth.verifyTokenAPI }, ApiErrorHandler.asyncHandler(async (request, reply) => {
            const query = `
                SELECT
                    COUNT(*) as count,
                    COALESCE(SUM(amount), 0) as amount,
                    COUNT(CASE WHEN status = 'paid' THEN 1 END) as successful_count,
                    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count
                FROM payments
                WHERE DATE(created_at) = CURRENT_DATE
            `;
            const result = await db.query(query);
            const summary = result[0] || {};

            return reply.send({
                success: true,
                data: summary
            });
        }));

    // Approve payment
    fastify.post('/api/payments/:id/approve', { preHandler: auth.verifyTokenAPI }, ApiErrorHandler.asyncHandler(async (request, reply) => {
                        const { id } = request.params;

            // Get payment details
            const payment = await db.getOne('payments', { id });

            if (!payment) {
                return reply.code(404).send({
                    success: false,
                    message: 'Payment not found',
                    error: 'Payment with specified ID does not exist'
                });
            }

            if (payment.status !== 'pending') {
                return reply.code(400).send({
                    success: false,
                    message: 'Payment is not in pending status',
                    error: `Payment status is ${payment.status}`
                });
            }

            // Update payment status
            await db.update('payments',
                {
                    status: 'paid',
                    updated_at: new Date()
                },
                { id }
            );

            // If payment is for a subscription, extend the subscription
            if (payment.subscription_id) {
                const subscription = await db.getOne('subscriptions', { id: payment.subscription_id });

                if (subscription) {
                    // Calculate extension based on payment amount and subscription price
                    const daysExtension = Math.floor((payment.amount / subscription.price_sell) * 30); // Approximate to 30-day month

                    // Check for partial payment and carry over logic
                    const expectedAmount = subscription.price_sell;
                    const excessAmount = payment.amount - expectedAmount;

                    if (excessAmount > 0) {
                        // Process carry over for excess payment
                        try {
                            const carryOverResult = await carryOverService.processPayment({
                                amount: payment.amount,
                                invoiceAmount: expectedAmount,
                                customerId: payment.customer_id,
                                subscriptionId: payment.subscription_id,
                                paymentId: payment.id,
                                paymentMethod: payment.method
                            });

                            if (carryOverResult.carriedOver) {
                                console.log(`Carry over processed: ${carryOverResult.excessAmount} for customer ${payment.customer_id}`);
                            }
                        } catch (carryError) {
                            fastify.log.error('Error processing carry over:', carryError);
                        }
                    }

                    // Extend subscription expiry
                    const now = new Date();
                    const currentExpiry = new Date(subscription.expiry_date);
                    const newExpiryDate = currentExpiry > now
                        ? new Date(currentExpiry.getTime() + daysExtension * 24 * 60 * 60 * 1000)
                        : new Date(now.getTime() + daysExtension * 24 * 60 * 60 * 1000);

                    await db.update('subscriptions',
                        {
                            expiry_date: newExpiryDate.toISOString().split('T')[0],
                            status: 'active',
                            updated_at: new Date()
                        },
                        { id: payment.subscription_id }
                    );

                    // Sync with Mikrotik
                    try {
                        await fastify.mikrotik.extendSubscription(subscription.username, daysExtension);
                    } catch (mikrotikError) {
                        fastify.log.error('Error extending subscription in Mikrotik:', mikrotikError);
                    }
                }
            } else if (payment.customer_id && payment.amount > 0) {
                // For general customer payments (no subscription), treat as prepaid/advance payment
                try {
                    const carryOverResult = await carryOverService.processPayment({
                        amount: payment.amount,
                        invoiceAmount: 0, // Full amount is carry over
                        customerId: payment.customer_id,
                        subscriptionId: null,
                        paymentId: payment.id,
                        paymentMethod: payment.method,
                        validityDays: 90 // Longer validity for advance payments
                    });

                    if (carryOverResult.carriedOver) {
                        console.log(`Advance payment stored: ${carryOverResult.excessAmount} for customer ${payment.customer_id}`);
                    }
                } catch (carryError) {
                    fastify.log.error('Error processing advance payment:', carryError);
                }
            }

            // Log system event
            await db.insert('system_logs', {
                level: 'INFO',
                module: 'payments',
                message: 'Payment approved',
                user_id: request.user?.id || null,
                ip_address: request.ip,
                created_at: new Date()
            });

            return reply.send({
                success: true,
                message: 'Payment approved successfully'
            });
        }));

    // Reject payment
    fastify.post('/api/payments/:id/reject', { preHandler: auth.verifyTokenAPI }, ApiErrorHandler.asyncHandler(async (request, reply) => {
                        const { id } = request.params;

            // Get payment details
            const payment = await db.getOne('payments', { id });

            if (!payment) {
                return reply.code(404).send({
                    success: false,
                    message: 'Payment not found',
                    error: 'Payment with specified ID does not exist'
                });
            }

            if (payment.status !== 'pending') {
                return reply.code(400).send({
                    success: false,
                    message: 'Payment is not in pending status',
                    error: `Payment status is ${payment.status}`
                });
            }

            // Update payment status
            await db.update('payments',
                {
                    status: 'failed',
                    updated_at: new Date()
                },
                { id }
            );

            // Log system event
            await db.insert('system_logs', {
                level: 'INFO',
                module: 'payments',
                message: 'Payment rejected',
                user_id: request.user?.id || null,
                ip_address: request.ip,
                created_at: new Date()
            });

            return reply.send({
                success: true,
                message: 'Payment rejected successfully'
            });
        }));

    // Check DuitKu payment status
    fastify.post('/api/payments/:id/check-duitku', { preHandler: auth.verifyTokenAPI }, ApiErrorHandler.asyncHandler(async (request, reply) => {
                        const { id } = request.params;

            // Get payment details
            const payment = await db.getOne('payments', {
                id,
                method: 'duitku'
            });

            if (!payment) {
                return reply.code(404).send({
                    success: false,
                    message: 'DuitKu payment not found',
                    error: 'Payment with specified ID and DuitKu method does not exist'
                });
            }

            if (!payment.transaction_id) {
                return reply.code(400).send({
                    success: false,
                    message: 'No DuitKu reference found',
                    error: 'Payment does not have a DuitKu reference number'
                });
            }

            // Check DuitKu status (this would integrate with DuitKu API)
            // For now, we'll simulate the status check
            let duitKuStatus = 'SUCCESS'; // This would come from DuitKu API

            // Update payment status based on DuitKu response
            let newStatus = 'paid';
            if (duitKuStatus === 'SUCCESS') {
                newStatus = 'paid';
            } else if (duitKuStatus === 'FAILED') {
                newStatus = 'failed';
            } else {
                newStatus = 'pending';
            }

            if (newStatus !== payment.status) {
                await db.update('payments',
                    {
                        status: newStatus,
                        updated_at: new Date()
                    },
                    { id }
                );
            }

            return reply.send({
                success: true,
                data: {
                    status: duitKuStatus,
                    status: newStatus
                }
            });
        }));

    // Get DuitKu pending payments
    fastify.get('/api/payments/duitku-pending', { preHandler: auth.verifyTokenAPI }, ApiErrorHandler.asyncHandler(async (request, reply) => {
                        const query = `
                SELECT
                    p.*,
                    c.nama as customer_name,
                    c.nomor_hp as customer_phone
                FROM payments p
                LEFT JOIN customers c ON p.customer_id = c.id
                WHERE p.method = 'duitku'
                AND p.status = 'pending'
                ORDER BY p.created_at DESC
                LIMIT 50
            `;
            const result = await db.query(query);

            return reply.send({
                success: true,
                data: result
            });
        }));

    // Bulk approve payments
    fastify.post('/api/payments/bulk-approve', { preHandler: auth.verifyTokenAPI }, ApiErrorHandler.asyncHandler(async (request, reply) => {
                        const { payment_ids } = request.body;

            if (!Array.isArray(payment_ids) || payment_ids.length === 0) {
                return reply.code(400).send({
                    success: false,
                    message: 'Invalid payment IDs',
                    error: 'Payment IDs must be a non-empty array'
                });
            }

            let processedCount = 0;

            for (const paymentId of payment_ids) {
                try {
                    // Get payment details
                    const payment = await db.getOne('payments', {
                        id: paymentId,
                        status: 'pending'
                    });

                    if (payment) {
                        // Update payment status
                        await db.update('payments',
                            {
                                status: 'paid',
                                updated_at: new Date()
                            },
                            { id: paymentId }
                        );

                        // Handle subscription extension if applicable
                        if (payment.subscription_id) {
                            const subscription = await db.getOne('subscriptions', {
                                id: payment.subscription_id
                            });

                            if (subscription) {
                                const daysExtension = Math.floor((payment.amount / subscription.price_sell) * 30);

                                const now = new Date();
                                const currentExpiry = new Date(subscription.expiry_date);
                                const newExpiryDate = currentExpiry > now
                                    ? new Date(currentExpiry.getTime() + daysExtension * 24 * 60 * 60 * 1000)
                                    : new Date(now.getTime() + daysExtension * 24 * 60 * 60 * 1000);

                                await db.update('subscriptions',
                                    {
                                        expiry_date: newExpiryDate.toISOString().split('T')[0],
                                        status: 'active',
                                        updated_at: new Date()
                                    },
                                    { id: payment.subscription_id }
                                );
                            }
                        }

                        processedCount++;
                    }
                } catch (error) {
                    fastify.log.error('Error processing payment:', error);
                }
            }

            // Log system event
            await db.insert('system_logs', {
                level: 'INFO',
                module: 'payments',
                message: `Bulk approved ${processedCount} payments`,
                user_id: request.user?.id || null,
                ip_address: request.ip,
                created_at: new Date()
            });

            return reply.send({
                success: true,
                data: {
                    processed_count: processedCount,
                    total_requested: payment_ids.length
                }
            });
        }));

    // Bulk reject payments
    fastify.post('/api/payments/bulk-reject', { preHandler: auth.verifyTokenAPI }, ApiErrorHandler.asyncHandler(async (request, reply) => {
                        const { payment_ids } = request.body;

            if (!Array.isArray(payment_ids) || payment_ids.length === 0) {
                return reply.code(400).send({
                    success: false,
                    message: 'Invalid payment IDs',
                    error: 'Payment IDs must be a non-empty array'
                });
            }

            // Build the WHERE clause for IN operation
            const placeholders = payment_ids.map((_, index) => `$${index + 1}`).join(',');
            const updateQuery = `
                UPDATE payments
                SET status = 'failed', updated_at = $${payment_ids.length + 1}
                WHERE id IN (${placeholders}) AND status = 'pending'
            `;

            const params = [...payment_ids, new Date()];
            const result = await db.query(updateQuery, params);

            const processedCount = result.rowCount || 0;

            // Log system event
            await db.insert('system_logs', {
                level: 'INFO',
                module: 'payments',
                message: `Bulk rejected ${processedCount} payments`,
                user_id: request.user?.id || null,
                ip_address: request.ip,
                created_at: new Date()
            });

            return reply.send({
                success: true,
                data: {
                    processed_count: processedCount,
                    total_requested: payment_ids.length
                }
            });
        }));

    // Bulk check DuitKu status
    fastify.post('/api/payments/bulk-check-duitku', { preHandler: auth.verifyTokenAPI }, ApiErrorHandler.asyncHandler(async (request, reply) => {
                        const { payment_ids } = request.body;

            if (!Array.isArray(payment_ids) || payment_ids.length === 0) {
                return reply.code(400).send({
                    success: false,
                    message: 'Invalid payment IDs',
                    error: 'Payment IDs must be a non-empty array'
                });
            }

            let processedCount = 0;

            for (const paymentId of payment_ids) {
                try {
                    // Get payment details
                    const payment = await db.getOne('payments', {
                        id: paymentId,
                        method: 'duitku',
                        status: 'pending'
                    });

                    if (payment) {
                        // Check DuitKu status (simulate for now)
                        let duitKuStatus = 'SUCCESS';
                        let newStatus = duitKuStatus === 'SUCCESS' ? 'paid' : 'failed';

                        // Update payment status
                        await db.update('payments',
                            {
                                status: newStatus,
                                updated_at: new Date()
                            },
                            { id: paymentId }
                        );

                        processedCount++;
                    }
                } catch (error) {
                    fastify.log.error('Error processing payment:', error);
                }
            }

            return reply.send({
                success: true,
                data: {
                    processed_count: processedCount,
                    total_requested: payment_ids.length
                }
            });
        }));

    // Export payments
    fastify.get('/api/payments/export', { preHandler: auth.verifyTokenAPI }, ApiErrorHandler.asyncHandler(async (request, reply) => {
                        const {
                search = '',
                status = '',
                method = '',
                start_date = '',
                end_date = '',
                format = 'csv'
            } = request.query;

            // Build WHERE conditions
            let whereConditions = [];
            let queryParams = [];
            let paramIndex = 1;

            if (search) {
                whereConditions.push(`
                    (p.id ILIKE $${paramIndex} OR
                     c.nama ILIKE $${paramIndex + 1} OR
                     c.nomor_hp ILIKE $${paramIndex + 2} OR
                     pr.name ILIKE $${paramIndex + 3} OR
                     p.notes ILIKE $${paramIndex + 4})
                `);
                const searchPattern = `%${search}%`;
                queryParams.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
                paramIndex += 5;
            }

            if (status) {
                whereConditions.push(`p.status = $${paramIndex}`);
                queryParams.push(status);
                paramIndex++;
            }

            if (method) {
                whereConditions.push(`p.method = $${paramIndex}`);
                queryParams.push(method);
                paramIndex++;
            }

            if (start_date) {
                whereConditions.push(`DATE(p.created_at) >= $${paramIndex}`);
                queryParams.push(start_date);
                paramIndex++;
            }

            if (end_date) {
                whereConditions.push(`DATE(p.created_at) <= $${paramIndex}`);
                queryParams.push(end_date);
                paramIndex++;
            }

            const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

            // Get payments data
            const query = `
                SELECT
                    p.id,
                    p.amount,
                    p.method,
                    p.status,
                    p.transaction_id as duitku_reference,
                    p.notes as description,
                    p.created_at,
                    c.nama as customer_name,
                    c.nomor_hp as customer_phone,
                    pr.name as subscription_name
                FROM payments p
                LEFT JOIN customers c ON p.customer_id = c.id
                LEFT JOIN subscriptions s ON p.subscription_id = s.id
                LEFT JOIN profiles pr ON s.profile_id = pr.id
                ${whereClause}
                ORDER BY p.created_at DESC
            `;
            const result = await db.query(query, queryParams);

            if (format === 'csv') {
                // Convert to CSV
                const csvHeaders = [
                    'ID', 'Amount', 'Payment Method', 'Status', 'Reference', 'Description',
                    'Customer Name', 'Customer Phone', 'Subscription', 'Created At'
                ];

                const csvRows = result.map(row => [
                    row.id,
                    row.amount,
                    row.method,
                    row.status,
                    row.duitku_reference || '',
                    row.description || '',
                    row.customer_name || '',
                    row.customer_phone || '',
                    row.subscription_name || '',
                    row.created_at
                ]);

                const csvContent = [csvHeaders, ...csvRows]
                    .map(row => row.map(field => `"${field}"`).join(','))
                    .join('\n');

                reply.header('Content-Type', 'text/csv');
                reply.header('Content-Disposition', `attachment; filename="payments_${Date.now()}.csv"`);
                return reply.send(csvContent);
            } else {
                // JSON format
                return reply.send({
                    success: true,
                    data: result
                });
            }
        }));

    // Generate payment report
    fastify.post('/api/payments/generate-report', { preHandler: auth.verifyTokenAPI }, ApiErrorHandler.asyncHandler(async (request, reply) => {
            const {
                report_type = 'summary',
                period = 'month',
                start_date,
                end_date,
                format = 'pdf'
            } = request.body;

            // Calculate date range based on period
            let startDate, endDate;
            const now = new Date();

            switch (period) {
                case 'today':
                    startDate = now.toISOString().split('T')[0];
                    endDate = startDate;
                    break;
                case 'week':
                    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                    endDate = now.toISOString().split('T')[0];
                    break;
                case 'month':
                    startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
                    endDate = now.toISOString().split('T')[0];
                    break;
                case 'custom':
                    startDate = start_date;
                    endDate = end_date;
                    break;
            }

            // Generate report based on type
            let reportData = {};
            let reportTitle = '';

            switch (report_type) {
                case 'summary':
                    reportTitle = 'Payment Summary Report';
                    reportData = await this.generatePaymentSummaryReport(startDate, endDate);
                    break;
                case 'detailed':
                    reportTitle = 'Detailed Payment Report';
                    reportData = await this.generateDetailedPaymentReport(startDate, endDate);
                    break;
                case 'revenue':
                    reportTitle = 'Revenue Report';
                    reportData = await this.generateRevenueReport(startDate, endDate);
                    break;
                case 'aging':
                    reportTitle = 'Payment Aging Report';
                    reportData = await this.generateAgingReport();
                    break;
                case 'method':
                    reportTitle = 'Payment Method Report';
                    reportData = await this.generateMethodReport(startDate, endDate);
                    break;
            }

            // Log report generation
                        await db.insert('system_logs', {
                level: 'INFO',
                module: 'payments',
                message: `Generated ${report_type} report`,
                user_id: request.user?.id || null,
                ip_address: request.ip,
                created_at: new Date()
            });

            return reply.send({
                success: true,
                data: {
                    report_title: reportTitle,
                    period: period,
                    date_range: { start_date: startDate, end_date: endDate },
                    ...reportData,
                    generated_at: new Date().toISOString()
                }
            });
        }));

    // Check overdue payments
    fastify.post('/api/payments/check-overdue', { preHandler: auth.verifyTokenAPI }, ApiErrorHandler.asyncHandler(async (request, reply) => {
                        // Find subscriptions that are expired but don't have recent payments
            const query = `
                SELECT
                    s.*,
                    c.nama as customer_name,
                    c.nomor_hp as customer_phone,
                    pr.name as profile_name,
                    p.created_at as last_payment_date
                FROM subscriptions s
                JOIN customers c ON s.customer_id = c.id
                JOIN profiles pr ON s.profile_id = pr.id
                LEFT JOIN payments p ON s.id = p.subscription_id AND p.status = 'paid'
                WHERE s.status = 'active'
                AND s.expiry_date < CURRENT_DATE
                AND (p.id IS NULL OR p.created_at < s.expiry_date)
            `;
            const overdueSubscriptions = await db.query(query);

            const overdueCount = overdueSubscriptions.length;

            // Log check
            await db.insert('system_logs', {
                level: 'INFO',
                module: 'payments',
                message: `Checked overdue payments: ${overdueCount} found`,
                user_id: request.user?.id || null,
                ip_address: request.ip,
                created_at: new Date()
            });

            return reply.send({
                success: true,
                data: {
                    overdue_count: overdueCount,
                    overdue_subscriptions: overdueSubscriptions
                }
            });
        }));

    // Reconcile payments
    fastify.post('/api/payments/reconcile', { preHandler: auth.verifyTokenAPI }, ApiErrorHandler.asyncHandler(async (request, reply) => {
                        // Find payments that should be reconciled
            const reconcileQuery = `
                SELECT COUNT(*) as total,
                       COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid,
                       COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
                       COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
                FROM payments
                WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
            `;
            const result = await db.query(reconcileQuery);
            const stats = result[0] || {};

            const status = stats.pending > 0 ? 'Action Required' : 'Up to date';
            const message = stats.pending > 0
                ? `${stats.pending} pending payments require attention`
                : 'All payments are reconciled';

            // Update reconciliation status
            await db.query(`
                UPDATE settings
                SET value = $1, updated_at = $2
                WHERE key = 'last_payment_reconcile'
            `, [new Date().toISOString(), new Date()]);

            return reply.send({
                success: true,
                data: {
                    status,
                    message,
                    last_reconcile: new Date().toISOString(),
                    stats
                }
            });
        }));

    // Auto-reconcile payments
    fastify.post('/api/payments/auto-reconcile', { preHandler: auth.verifyTokenAPI }, ApiErrorHandler.asyncHandler(async (request, reply) => {
                        let reconciledCount = 0;

            // Auto-approve successful DuitKu payments
            const duitKuResult = await db.query(`
                UPDATE payments
                SET status = 'paid', updated_at = $1
                WHERE method = 'duitku'
                AND status = 'pending'
                AND created_at < $2
                RETURNING id
            `, [new Date(), new Date(Date.now() - 60 * 60 * 1000)]); // 1 hour ago
            reconciledCount += duitKuResult.length;

            // Auto-expire old pending payments
            const expireResult = await db.query(`
                UPDATE payments
                SET status = 'cancelled', updated_at = $1
                WHERE status = 'pending'
                AND created_at < $2
                RETURNING id
            `, [new Date(), new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)]); // 7 days ago
            reconciledCount += expireResult.length;

            const status = reconciledCount > 0 ? 'Completed' : 'Up to date';
            const message = reconciledCount > 0
                ? `Auto-reconciled ${reconciledCount} payments`
                : 'No payments required reconciliation';

            // Update reconciliation status
            await db.query(`
                UPDATE settings
                SET value = $1, updated_at = $2
                WHERE key = 'last_payment_reconcile'
            `, [new Date().toISOString(), new Date()]);

            return reply.send({
                success: true,
                data: {
                    status,
                    message,
                    last_reconcile: new Date().toISOString(),
                    reconciled_count: reconciledCount
                }
            });
        }));

    // Get customer carry over balances
    fastify.get('/api/carry-over/:customerId', { preHandler: auth.verifyTokenAPI }, ApiErrorHandler.asyncHandler(async (request, reply) => {
            const { customerId } = request.params;

            const balances = await carryOverService.getAvailableBalances(parseInt(customerId));
            const totalAvailable = await carryOverService.getTotalAvailable(parseInt(customerId));

            return reply.send({
                success: true,
                data: {
                    balances,
                    totalAvailable,
                    count: balances.length
                }
            });
        }));

    // Apply carry over to invoice/subscription
    fastify.post('/api/carry-over/apply', { preHandler: auth.verifyTokenAPI }, ApiErrorHandler.asyncHandler(async (request, reply) => {
            const {
                customerId,
                invoiceAmount,
                subscriptionId,
                carryOverIds
            } = request.body;

            const result = await carryOverService.applyCarryOver({
                customerId: parseInt(customerId),
                invoiceAmount: parseFloat(invoiceAmount),
                subscriptionId: subscriptionId ? parseInt(subscriptionId) : null,
                carryOverIds
            });

            return reply.send({
                success: true,
                data: result
            });
        }));

    // Get carry over statistics
    fastify.get('/api/carry-over/statistics', { preHandler: auth.verifyTokenAPI }, ApiErrorHandler.asyncHandler(async (request, reply) => {
            const { customerId } = request.query;

            const stats = await carryOverService.getStatistics(
                customerId ? parseInt(customerId) : null
            );

            return reply.send({
                success: true,
                data: stats
            });
        }));

    // Transfer carry over between subscriptions
    fastify.post('/api/carry-over/transfer', { preHandler: auth.verifyTokenAPI }, ApiErrorHandler.asyncHandler(async (request, reply) => {
            const {
                fromSubscriptionId,
                toSubscriptionId,
                amount
            } = request.body;

            const result = await carryOverService.transferBalance(
                parseInt(fromSubscriptionId),
                parseInt(toSubscriptionId),
                parseFloat(amount)
            );

            return reply.send({
                success: true,
                data: result
            });
        }));

    // Clean up expired carry over balances (admin only)
    fastify.post('/api/carry-over/cleanup', { preHandler: auth.verifyTokenAPI }, ApiErrorHandler.asyncHandler(async (request, reply) => {
            const cleanedCount = await carryOverService.cleanupExpiredBalances();

            return reply.send({
                success: true,
                message: `Cleaned up ${cleanedCount} expired carry over balances`,
                cleanedCount
            });
        }));

    done();
};

module.exports = paymentRoutes;