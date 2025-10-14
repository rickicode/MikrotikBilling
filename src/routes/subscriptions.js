const SecurityLogger = require('../services/SecurityLogger');

module.exports = async function(fastify, opts) {
    const { db } = require('../database/DatabaseManager');

    // Middleware to verify admin access for subscription management
    async function verifySubscriptionAccess(request, reply) {
        if (!request.session.user) {
            return reply.redirect('/login');
        }

        // Check if user has permission to manage subscriptions
        if (request.session.user.role !== 'admin' && request.session.user.role !== 'manager') {
            return reply.code(403).view('error', {
                error: 'Anda tidak memiliki akses ke manajemen berlangganan'
            });
        }
    }

    // Subscriptions Management Page
    fastify.get('/', { preHandler: verifySubscriptionAccess }, async (request, reply) => {
        try {
            // Get basic statistics for the page
            const stats = {
                total: 0,
                active: 0,
                expired: 0,
                monthly_revenue: 0
            };

            // Get quick statistics
            const totalSubs = await db.getOne('SELECT COUNT(*) as count FROM subscriptions');
            const activeSubs = await db.getOne('SELECT COUNT(*) as count FROM subscriptions WHERE status = \'active\'');
            const expiredSubs = await db.getOne('SELECT COUNT(*) as count FROM subscriptions WHERE status = \'expired\' OR expiry_date < CURRENT_DATE');

            // Calculate monthly revenue from active subscriptions
            const monthlyRevenue = await db.getOne(`
                SELECT SUM(price_sell) as total
                FROM subscriptions
                WHERE status = \'active\'
                AND billing_cycle = \'monthly\'
            `);

            stats.total = totalSubs.count || 0;
            stats.active = activeSubs.count || 0;
            stats.expired = expiredSubs.count || 0;
            stats.monthly_revenue = monthlyRevenue.total || 0;

            return reply.view('subscriptions/index', {
                stats,
                user: request.session.user,
                settings: reply.locals.settings || {}
            });
        } catch (error) {
            fastify.log.error('Error loading subscriptions page:', error);
            return reply.code(500).view('error', {
                error: 'Terjadi kesalahan saat memuat halaman berlangganan'
            });
        }
    });

    // Create Subscription Page
    fastify.get('/create', { preHandler: verifySubscriptionAccess }, async (request, reply) => {
        try {
            // Get all customers
            const customers = await db.query(`
                SELECT id, nama, nomor_hp, status_aktif
                FROM customers
                ORDER BY nama
            `);

            // Get all profiles
            const profiles = await db.query(`
                SELECT id, name, price_sell, service_type
                FROM profiles
                WHERE is_active = true
                ORDER BY name
            `);

            return reply.view('subscriptions/create', {
                customers,
                profiles,
                user: request.session.user,
                settings: reply.locals.settings || {}
            });
        } catch (error) {
            fastify.log.error('Error loading create subscription page:', error);
            return reply.code(500).view('error', {
                error: 'Terjadi kesalahan saat memuat halaman'
            });
        }
    });

    // Edit Subscription Page
    fastify.get('/:id/edit', { preHandler: verifySubscriptionAccess }, async (request, reply) => {
        try {
            const { id } = request.params;

            // Get subscription details
            const subscription = await db.getOne(`
                SELECT s.*, c.nama as customer_name, p.name as profile_name
                FROM subscriptions s
                JOIN customers c ON s.customer_id = c.id
                LEFT JOIN profiles p ON s.profile_id = p.id
                WHERE s.id = $1
            `, [id]);

            if (!subscription) {
                return reply.code(404).view('404', { url: request.url });
            }

            // Get all customers
            const customers = await db.query(`
                SELECT id, nama, nomor_hp, status_aktif
                FROM customers
                ORDER BY nama
            `);

            // Get all profiles
            const profiles = await db.query(`
                SELECT id, name, price_sell, service_type
                FROM profiles
                WHERE is_active = true
                ORDER BY name
            `);

            return reply.view('subscriptions/edit', {
                subscription,
                customers,
                profiles,
                user: request.session.user,
                settings: reply.locals.settings || {}
            });
        } catch (error) {
            fastify.log.error('Error loading edit subscription page:', error);
            return reply.code(500).view('error', {
                error: 'Terjadi kesalahan saat memuat halaman'
            });
        }
    });

    // Create Subscription
    fastify.post('/api/subscriptions', async (request, reply) => {
        try {
            const { customer_id, service_type, profile_id, username, password, price_sell, price_cost,
                    billing_cycle, duration_days, start_date, auto_renew } = request.body;

            // Validate required fields
            if (!customer_id || !service_type || !profile_id || !username || !price_sell) {
                return reply.code(400).json({
                success: false,
                message: 'Field wajib tidak boleh kosong',
                error: {
                    detail: 'Validation failed',
                    type: 'ValidationError'
                }
            });
            }

            // Check if username already exists
            const existingSubscription = await db.getOne(
                'SELECT id FROM subscriptions WHERE username = $5',
                [username]
            );

            if (existingSubscription) {
                return reply.code(400).json({
                success: false,
                message: 'Username sudah digunakan',
                error: {
                    detail: 'Validation failed',
                    type: 'ValidationError'
                }
            });
            }

            // Calculate expiry date
            const startDate = start_date || new Date().toISOString().split('T')[0];
            let expiryDate = null;

            if (duration_days) {
                const date = new Date(startDate);
                date.setDate(date.getDate() + parseInt(duration_days));
                expiryDate = date.toISOString().split('T')[0];
            }

            // Create subscription
            const result = await db.query(`
                INSERT INTO subscriptions (
                    customer_id, service_type, profile_id, username, password,
                    price_sell, price_cost, billing_cycle, duration_days,
                    start_date, expiry_date, status, auto_renew, mikrotik_synced
                ) VALUES ($6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
            `, [
                customer_id, service_type, profile_id, username, password || 'default_password',
                price_sell, price_cost || Math.floor(price_sell * 0.7), billing_cycle, duration_days,
                startDate, expiryDate, 'active', auto_renew, 0
            ]);

            // Log security event
            if (global.securityLogger) {
                global.securityLogger.logSystemEvent('subscription_created', {
                    action: 'create_subscription',
                    subscription_id: result[0].id,
                    customer_id,
                    service_type,
                    username,
                    amount: price_sell,
                    metadata: {
                        billing_cycle,
                        auto_renew: !!auto_renew
                    }
                });
            }

            return reply.code(201).json({
                success: true,
                message: 'Berlangganan berhasil dibuat',
                subscription_id: result[0].id
            });
        } catch (error) {
            fastify.log.error('Error creating subscription:', error);

            // Log security event
            if (global.securityLogger) {
                global.securityLogger.logSystemEvent('subscription_create_failed', {
                    action: 'create_subscription',
                    error: error.message,
                    metadata: request.body
                });
            }

            return reply.code(500).json({
                success: false,
                message: 'Terjadi kesalahan saat membuat berlangganan',
                error: {
                    detail: 'Internal server error occurred',
                    type: 'InternalServerError'
                }
            });
        }
    });

    // Get Subscription Details
    fastify.get('/api/subscriptions/:id', async (request, reply) => {
        try {
            const { id } = request.params;

            const subscription = await db.getOne(`
                SELECT s.*, c.nama as customer_name, c.nomor_hp as customer_phone,
                       c.email as customer_email, p.name as profile_name
                FROM subscriptions s
                JOIN customers c ON s.customer_id = c.id
                LEFT JOIN profiles p ON s.profile_id = p.id
                WHERE s.id = $20
            `, [id]);

            if (!subscription) {
                return reply.code(404).json({
                success: false,
                message: 'Berlangganan tidak ditemukan',
                error: {
                    detail: 'Resource not found',
                    type: 'NotFoundError'
                }
            });
            }

            return reply.json({ success: true, subscription });
        } catch (error) {
            fastify.log.error('Terjadi kesalahan:', error);
            return reply.code(500).json({
                success: false,
                message: 'Terjadi kesalahan',
                error: {
                    detail: error.message,
                    type: error.constructor.name,
                    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
                }
            });
        }
    });

    // Update Subscription
    fastify.put('/api/subscriptions/:id', async (request, reply) => {
        try {
            const { id } = request.params;
            const { customer_id, service_type, profile_id, username, price_sell, price_cost,
                    billing_cycle, duration_days, status, auto_renew } = request.body;

            // Get current subscription
            const currentSubscription = await db.getOne('SELECT * FROM subscriptions WHERE id = $21', [id]);
            if (!currentSubscription) {
                return reply.code(404).json({
                success: false,
                message: 'Berlangganan tidak ditemukan',
                error: {
                    detail: 'Resource not found',
                    type: 'NotFoundError'
                }
            });
            }

            // Check if username already exists (for different subscription)
            if (username !== currentSubscription.username) {
                const existingSubscription = await db.getOne(
                    'SELECT id FROM subscriptions WHERE username = $22 AND id != $23',
                    [username, id]
                );

                if (existingSubscription) {
                    return reply.code(400).json({
                success: false,
                message: 'Username sudah digunakan',
                error: {
                    detail: 'Validation failed',
                    type: 'ValidationError'
                }
            });
                }
            }

            // Calculate new expiry date if duration changed
            let expiryDate = currentSubscription.expiry_date;
            if (duration_days && duration_days !== currentSubscription.duration_days) {
                const startDate = currentSubscription.start_date || new Date().toISOString().split('T')[0];
                const date = new Date(startDate);
                date.setDate(date.getDate() + parseInt(duration_days));
                expiryDate = date.toISOString().split('T')[0];
            }

            // Update subscription
            await db.query(`
                UPDATE subscriptions
                SET customer_id = $24, service_type = $25, profile_id = $26, username = $27,
                    price_sell = $28, price_cost = $29, billing_cycle = $30, duration_days = $31,
                    expiry_date = $32, status = $33, auto_renew = $34, updated_at = CURRENT_TIMESTAMP
                WHERE id = $35
            `, [
                customer_id, service_type, profile_id, username, price_sell,
                price_cost || Math.floor(price_sell * 0.7), billing_cycle, duration_days,
                expiryDate, status, auto_renew, id
            ]);

            // Log security event
            if (global.securityLogger) {
                global.securityLogger.logSystemEvent('subscription_updated', {
                    action: 'update_subscription',
                    subscription_id: id,
                    changes: {
                        customer_id,
                        service_type,
                        username,
                        price_sell,
                        status,
                        auto_renew: !!auto_renew
                    }
                });
            }

            return reply.json({
                success: true,
                message: 'Berlangganan berhasil diperbarui'
            });
        } catch (error) {
            fastify.log.error('Error updating subscription:', error);

            // Log security event
            if (global.securityLogger) {
                global.securityLogger.logSystemEvent('subscription_update_failed', {
                    action: 'update_subscription',
                    subscription_id: request.params.id,
                    error: error.message
                });
            }

            return reply.code(500).json({
                success: false,
                message: 'Terjadi kesalahan saat memperbarui berlangganan',
                error: {
                    detail: 'Internal server error occurred',
                    type: 'InternalServerError'
                }
            });
        }
    });

    // Delete Subscription
    fastify.delete('/api/subscriptions/:id', async (request, reply) => {
        try {
            const { id } = request.params;

            // Get subscription details before deletion
            const subscription = await db.getOne('SELECT * FROM subscriptions WHERE id = $36', [id]);
            if (!subscription) {
                return reply.code(404).json({
                success: false,
                message: 'Berlangganan tidak ditemukan',
                error: {
                    detail: 'Resource not found',
                    type: 'NotFoundError'
                }
            });
            }

            // Delete subscription
            await db.query('DELETE FROM subscriptions WHERE id = $37', [id]);

            // Log security event
            if (global.securityLogger) {
                global.securityLogger.logSystemEvent('subscription_deleted', {
                    action: 'delete_subscription',
                    subscription_id: id,
                    customer_id: subscription.customer_id,
                    service_type: subscription.service_type,
                    username: subscription.username
                });
            }

            return reply.json({
                success: true,
                message: 'Berlangganan berhasil dihapus'
            });
        } catch (error) {
            fastify.log.error('Error deleting subscription:', error);

            // Log security event
            if (global.securityLogger) {
                global.securityLogger.logSystemEvent('subscription_delete_failed', {
                    action: 'delete_subscription',
                    subscription_id: request.params.id,
                    error: error.message
                });
            }

            return reply.code(500).json({
                success: false,
                message: 'Terjadi kesalahan saat menghapus berlangganan',
                error: {
                    detail: 'Internal server error occurred',
                    type: 'InternalServerError'
                }
            });
        }
    });

    // List Subscriptions with Filtering and Pagination
    fastify.get('/api/subscriptions', async (request, reply) => {
        try {
            const { page = 1, page_size = 20, search = '', status = '', service = '',
                    expiry = '', sort_by = 'expiry_date', sort_order = 'asc' } = request.query;

            const offset = (page - 1) * page_size;
            let whereClause = '1=1';
            const params = [];

            // Build WHERE clause
            if (search) {
                whereClause += ` AND (c.nama LIKE $38 OR s.username LIKE $39 OR s.id = $40)`;
                const searchPattern = `%${search}%`;
                params.push(searchPattern, searchPattern, search);
            }

            if (status) {
                whereClause += ` AND s.status = $41`;
                params.push(status);
            }

            if (service) {
                whereClause += ` AND s.service_type = $42`;
                params.push(service);
            }

            if (expiry) {
                if (expiry === 'expired') {
                    whereClause += ` AND s.expiry_date < CURRENT_DATE`;
                } else {
                    const days = parseInt(expiry);
                    whereClause += ` AND s.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '${days} days'`;
                }
            }

            // Get total count
            const countResult = await db.getOne(`
                SELECT COUNT(*) as total
                FROM subscriptions s
                JOIN customers c ON s.customer_id = c.id
                WHERE ${whereClause}
            `, params);

            // Get subscriptions
            const subscriptions = await db.query(`
                SELECT s.*, c.nama as customer_name, c.nomor_hp as customer_phone,
                       p.name as profile_name
                FROM subscriptions s
                JOIN customers c ON s.customer_id = c.id
                LEFT JOIN profiles p ON s.profile_id = p.id
                WHERE ${whereClause}
                ORDER BY ${sort_by} ${sort_order}
                LIMIT $43 OFFSET $44
            `, [...params, parseInt(page_size), offset]);

            return reply.json({
                success: true,
                subscriptions: subscriptions,
                pagination: {
                    current_page: parseInt(page),
                    total_pages: Math.ceil(countResult.total / page_size),
                    total_items: countResult.total,
                    page_size: parseInt(page_size)
                }
            });
        } catch (error) {
            fastify.log.error('Terjadi kesalahan saat memuat data:', error);
            return reply.code(500).json({
                success: false,
                message: 'Terjadi kesalahan saat memuat data',
                error: {
                    detail: error.message,
                    type: error.constructor.name,
                    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
                }
            });
        }
    });

    // Get Subscription Statistics
    fastify.get('/api/subscriptions/statistics', async (request, reply) => {
        try {
            const stats = {
                total: 0,
                active: 0,
                disabled: 0,
                expired: 0,
                hotspot: 0,
                pppoe: 0,
                monthly_revenue: 0,
                expiring_soon: 0,
                auto_renew_count: 0
            };

            // Get counts
            const counts = await db.getOne(`
                SELECT
                    COUNT(*) as total,
                    SUM(CASE WHEN status = \'active\' THEN 1 ELSE 0 END) as active,
                    SUM(CASE WHEN status = \'disabled\' THEN 1 ELSE 0 END) as disabled,
                    SUM(CASE WHEN status = \'expired\' OR expiry_date < CURRENT_DATE THEN 1 ELSE 0 END) as expired,
                    SUM(CASE WHEN service_type = \'hotspot\' THEN 1 ELSE 0 END) as hotspot,
                    SUM(CASE WHEN service_type = \'pppoe\' THEN 1 ELSE 0 END) as pppoe,
                    SUM(CASE WHEN billing_cycle = \'monthly\' AND status = \'active\' THEN price_sell ELSE 0 END) as monthly_revenue,
                    SUM(CASE WHEN expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '3 days' AND status = \'active\' THEN 1 ELSE 0 END) as expiring_soon,
                    SUM(CASE WHEN auto_renew = true THEN 1 ELSE 0 END) as auto_renew_count
                FROM subscriptions
            `);

            if (counts) {
                Object.assign(stats, counts);
            }

            return reply.json({ success: true, stats });
        } catch (error) {
            fastify.log.error('Terjadi kesalahan:', error);
            return reply.code(500).json({
                success: false,
                message: 'Terjadi kesalahan',
                error: {
                    detail: error.message,
                    type: error.constructor.name,
                    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
                }
            });
        }
    });

    // Export Subscriptions
    fastify.get('/api/subscriptions/export', async (request, reply) => {
        try {
            const { format = 'csv', search = '', status = '', service = '', expiry = '' } = request.query;

            let whereClause = '1=1';
            const params = [];

            // Build WHERE clause
            if (search) {
                whereClause += ` AND (c.nama LIKE $45 OR s.username LIKE $46)`;
                params.push(`%${search}%`, `%${search}%`);
            }

            if (status) {
                whereClause += ` AND s.status = $47`;
                params.push(status);
            }

            if (service) {
                whereClause += ` AND s.service_type = $48`;
                params.push(service);
            }

            if (expiry) {
                if (expiry === 'expired') {
                    whereClause += ` AND s.expiry_date < CURRENT_DATE`;
                } else {
                    const days = parseInt(expiry);
                    whereClause += ` AND s.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '${days} days'`;
                }
            }

            const subscriptions = await db.query(`
                SELECT s.id, c.nama as customer_name, c.nomor_hp as customer_phone,
                       s.service_type, s.username, p.name as profile_name, s.status,
                       s.billing_cycle, s.price_sell, s.start_date, s.expiry_date,
                       s.auto_renew, s.created_at
                FROM subscriptions s
                JOIN customers c ON s.customer_id = c.id
                LEFT JOIN profiles p ON s.profile_id = p.id
                WHERE ${whereClause}
                ORDER BY s.created_at DESC
            `, params);

            if (format === 'csv') {
                // Generate CSV
                const headers = [
                    'ID', 'Customer Name', 'Customer Phone', 'Service Type', 'Username',
                    'Profile', 'Status', 'Billing Cycle', 'Price', 'Start Date', 'Expiry Date',
                    'Auto Renew', 'Created At'
                ];

                const csvContent = [
                    headers.join(','),
                    ...subscriptions.map(sub => [
                        sub.id, `"${sub.customer_name}"`, `"${sub.customer_phone}"`, sub.service_type,
                        sub.username, `"${sub.profile_name}"`, sub.status, sub.billing_cycle,
                        sub.price_sell, sub.start_date, sub.expiry_date, sub.auto_renew, sub.created_at
                    ].join(','))
                ].join('\n');

                reply.header('Content-Type', 'text/csv');
                reply.header('Content-Disposition', `attachment; filename="subscriptions_${new Date().toISOString().split('T')[0]}.csv"`);
                return reply.send(csvContent);
            }

            return reply.json({ success: true, subscriptions });
        } catch (error) {
            fastify.log.error('Terjadi kesalahan saat mengekspor data:', error);
            return reply.code(500).json({
                success: false,
                message: 'Terjadi kesalahan saat mengekspor data',
                error: {
                    detail: error.message,
                    type: error.constructor.name,
                    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
                }
            });
        }
    });

    // Renew Subscription
    fastify.post('/api/subscriptions/:id/renew', async (request, reply) => {
        try {
            const { id } = request.params;
            const { duration, amount, payment_method, note } = request.body;

            // Get current subscription
            const subscription = await db.getOne('SELECT * FROM subscriptions WHERE id = $49', [id]);
            if (!subscription) {
                return reply.code(404).json({
                success: false,
                message: 'Berlangganan tidak ditemukan',
                error: {
                    detail: 'Resource not found',
                    type: 'NotFoundError'
                }
            });
            }

            // Calculate new expiry date
            const currentExpiry = new Date(subscription.expiry_date || Date.now());
            const newExpiry = new Date(currentExpiry);
            newExpiry.setDate(newExpiry.getDate() + parseInt(duration));

            // Update subscription expiry
            await db.query(`
                UPDATE subscriptions
                SET expiry_date = $50, status = \'active\', updated_at = CURRENT_TIMESTAMP
                WHERE id = $51
            `, [newExpiry.toISOString().split('T')[0], id]);

            // Create payment record
            if (amount && payment_method) {
                await db.query(`
                    INSERT INTO payments (
                        customer_id, subscription_id, amount, payment_method,
                        payment_status, description, created_at
                    ) VALUES ($52, $53, $54, $55, 'paid', $56, CURRENT_TIMESTAMP)
                `, [
                    subscription.customer_id, id, amount, payment_method,
                    `Perpanjang berlangganan ${duration} hari${note ? ' - ' + note : ''}`
                ]);
            }

            // Log security event
            if (global.securityLogger) {
                global.securityLogger.logSystemEvent('subscription_renewed', {
                    action: 'renew_subscription',
                    subscription_id: id,
                    customer_id: subscription.customer_id,
                    duration,
                    amount,
                    payment_method
                });
            }

            return reply.json({
                success: true,
                message: 'Berlangganan berhasil diperpanjang',
                new_expiry_date: newExpiry.toISOString().split('T')[0]
            });
        } catch (error) {
            fastify.log.error('Error renewing subscription:', error);

            // Log security event
            if (global.securityLogger) {
                global.securityLogger.logSystemEvent('subscription_renew_failed', {
                    action: 'renew_subscription',
                    subscription_id: request.params.id,
                    error: error.message
                });
            }

            return reply.code(500).json({
                success: false,
                message: 'Terjadi kesalahan saat memperpanjang berlangganan',
                error: {
                    detail: 'Internal server error occurred',
                    type: 'InternalServerError'
                }
            });
        }
    });

    // Bulk Operations
    fastify.post('/api/subscriptions/bulk-renew', async (request, reply) => {
        try {
            const { subscription_ids, duration, payment_method } = request.body;

            if (!subscription_ids || !Array.isArray(subscription_ids) || subscription_ids.length === 0) {
                return reply.code(400).json({
                success: false,
                message: 'Tidak ada berlangganan yang dipilih',
                error: {
                    detail: 'Validation failed',
                    type: 'ValidationError'
                }
            });
            }

            let renewedCount = 0;
            const errors = [];

            for (const subscriptionId of subscription_ids) {
                try {
                    const subscription = await db.getOne('SELECT * FROM subscriptions WHERE id = $58', [subscriptionId]);
                    if (!subscription) {
                        errors.push(`Berlangganan ${subscriptionId} tidak ditemukan`);
                        continue;
                    }

                    // Calculate new expiry date
                    const currentExpiry = new Date(subscription.expiry_date || Date.now());
                    const newExpiry = new Date(currentExpiry);
                    newExpiry.setDate(newExpiry.getDate() + parseInt(duration));

                    // Update subscription
                    await db.query(`
                        UPDATE subscriptions
                        SET expiry_date = $59, status = \'active\', updated_at = CURRENT_TIMESTAMP
                        WHERE id = $60
                    `, [newExpiry.toISOString().split('T')[0], subscriptionId]);

                    renewedCount++;
                } catch (error) {
                    errors.push(`Gagal memperpanjang berlangganan ${subscriptionId}: ${error.message}`);
                }
            }

            // Log security event
            if (global.securityLogger && renewedCount > 0) {
                global.securityLogger.logSystemEvent('bulk_subscription_renew', {
                    action: 'bulk_renew_subscription',
                    renewed_count: renewedCount,
                    total_attempted: subscription_ids.length,
                    errors: errors.length
                });
            }

            return reply.json({
                success: true,
                message: `Berhasil memperpanjang ${renewedCount} berlangganan`,
                renewed_count: renewedCount,
                errors: errors
            });
        } catch (error) {
            fastify.log.error('Error bulk renewing subscriptions:', error);

            // Log security event
            if (global.securityLogger) {
                global.securityLogger.logSystemEvent('bulk_subscription_renew_failed', {
                    action: 'bulk_renew_subscription',
                    error: error.message
                });
            }

            return reply.code(500).json({
                success: false,
                message: 'Terjadi kesalahan saat memperpanjang berlangganan',
                error: {
                    detail: 'Internal server error occurred',
                    type: 'InternalServerError'
                }
            });
        }
    });

    // Bulk Disable
    fastify.post('/api/subscriptions/bulk-disable', async (request, reply) => {
        try {
            const { subscription_ids } = request.body;

            if (!subscription_ids || !Array.isArray(subscription_ids) || subscription_ids.length === 0) {
                return reply.code(400).json({
                success: false,
                message: 'Tidak ada berlangganan yang dipilih',
                error: {
                    detail: 'Validation failed',
                    type: 'ValidationError'
                }
            });
            }

            // Disable subscriptions
            const result = await db.query(`
                UPDATE subscriptions
                SET status = \'disabled\', updated_at = CURRENT_TIMESTAMP
                WHERE id IN (${subscription_ids.map((_, i) => `${i + 61}`).join(',')})
            `, subscription_ids);

            // Log security event
            if (global.securityLogger) {
                global.securityLogger.logSystemEvent('bulk_subscription_disable', {
                    action: 'bulk_disable_subscription',
                    disabled_count: result.rowCount || result.length,
                    subscription_ids
                });
            }

            return reply.json({
                success: true,
                message: `${result.rowCount || result.length} berlangganan berhasil dinonaktifkan`,
                disabled_count: result.rowCount || result.length
            });
        } catch (error) {
            fastify.log.error('Error bulk disabling subscriptions:', error);

            // Log security event
            if (global.securityLogger) {
                global.securityLogger.logSystemEvent('bulk_subscription_disable_failed', {
                    action: 'bulk_disable_subscription',
                    error: error.message
                });
            }

            return reply.code(500).json({
                success: false,
                message: 'Terjadi kesalahan saat menonaktifkan berlangganan',
                error: {
                    detail: 'Internal server error occurred',
                    type: 'InternalServerError'
                }
            });
        }
    });

    // Bulk Delete
    fastify.post('/api/subscriptions/bulk-delete', async (request, reply) => {
        try {
            const { subscription_ids } = request.body;

            if (!subscription_ids || !Array.isArray(subscription_ids) || subscription_ids.length === 0) {
                return reply.code(400).json({
                success: false,
                message: 'Tidak ada berlangganan yang dipilih',
                error: {
                    detail: 'Validation failed',
                    type: 'ValidationError'
                }
            });
            }

            // Delete subscriptions
            const result = await db.query(`
                DELETE FROM subscriptions
                WHERE id IN (${subscription_ids.map((_, i) => `${i + 62}`).join(',')})
            `, subscription_ids);

            // Log security event
            if (global.securityLogger) {
                global.securityLogger.logSystemEvent('bulk_subscription_delete', {
                    action: 'bulk_delete_subscription',
                    deleted_count: result.rowCount || result.length,
                    subscription_ids
                });
            }

            return reply.json({
                success: true,
                message: `${result.rowCount || result.length} berlangganan berhasil dihapus`,
                deleted_count: result.rowCount || result.length
            });
        } catch (error) {
            fastify.log.error('Error bulk deleting subscriptions:', error);

            // Log security event
            if (global.securityLogger) {
                global.securityLogger.logSystemEvent('bulk_subscription_delete_failed', {
                    action: 'bulk_delete_subscription',
                    error: error.message
                });
            }

            return reply.code(500).json({
                success: false,
                message: 'Terjadi kesalahan saat menghapus berlangganan',
                error: {
                    detail: 'Internal server error occurred',
                    type: 'InternalServerError'
                }
            });
        }
    });

    // Bulk Send Reminders
    fastify.post('/api/subscriptions/bulk-reminder', async (request, reply) => {
        try {
            const { subscription_ids } = request.body;

            if (!subscription_ids || !Array.isArray(subscription_ids) || subscription_ids.length === 0) {
                return reply.code(400).json({
                success: false,
                message: 'Tidak ada berlangganan yang dipilih',
                error: {
                    detail: 'Validation failed',
                    type: 'ValidationError'
                }
            });
            }

            // Get subscriptions with customer info
            const subscriptions = await db.query(`
                SELECT s.*, c.nama, c.nomor_hp
                FROM subscriptions s
                JOIN customers c ON s.customer_id = c.id
                WHERE s.id IN (${subscription_ids.map((_, i) => `${i + 63}`).join(',')})
            `, subscription_ids);

            let sentCount = 0;
            const errors = [];

            for (const subscription of subscriptions) {
                try {
                    if (subscription.nomor_hp && fastify.whatsappService) {
                        await fastify.whatsappService.sendNotification(
                            subscription.customer_id,
                            'subscription_expiry_warning',
                            {
                                days: 3,
                                package_name: `${subscription.service_type} ${subscription.billing_cycle}`
                            }
                        );
                        sentCount++;
                    }
                } catch (error) {
                    errors.push(`Gagal mengirim reminder ke ${subscription.nama}: ${error.message}`);
                }
            }

            // Log security event
            if (global.securityLogger && sentCount > 0) {
                global.securityLogger.logSystemEvent('bulk_subscription_reminder', {
                    action: 'bulk_send_reminder',
                    sent_count: sentCount,
                    total_attempted: subscriptions.length,
                    errors: errors.length
                });
            }

            return reply.json({
                success: true,
                message: `Reminder berhasil dikirim ke ${sentCount} pelanggan`,
                sent_count: sentCount,
                errors
            });
        } catch (error) {
            fastify.log.error('Error sending bulk reminders:', error);

            // Log security event
            if (global.securityLogger) {
                global.securityLogger.logSystemEvent('bulk_subscription_reminder_failed', {
                    action: 'bulk_send_reminder',
                    error: error.message
                });
            }

            return reply.code(500).json({
                success: false,
                message: 'Terjadi kesalahan saat mengirim reminder',
                error: {
                    detail: 'Internal server error occurred',
                    type: 'InternalServerError'
                }
            });
        }
    });

    // Sync with Mikrotik
    fastify.post('/api/subscriptions/sync-mikrotik', async (request, reply) => {
        try {
            if (!fastify.mikrotik) {
                return reply.code(503).json({
                    success: false,
                    message: 'Mikrotik service tidak tersedia'
                });
            }

            const result = await fastify.mikrotik.syncSubscriptions();

            // Log security event
            if (global.securityLogger) {
                global.securityLogger.logSystemEvent('mikrotik_sync', {
                    action: 'sync_subscriptions',
                    synced_count: result.syncedCount || 0,
                    errors_count: result.errors.length || 0
                });
            }

            return reply.json({
                success: true,
                message: `Sinkronisasi selesai: ${result.syncedCount || 0} diperbarui`,
                synced_count: result.syncedCount || 0,
                errors: result.errors
            });
        } catch (error) {
            fastify.log.error('Error syncing with Mikrotik:', error);

            // Log security event
            if (global.securityLogger) {
                global.securityLogger.logSystemEvent('mikrotik_sync_failed', {
                    action: 'sync_subscriptions',
                    error: error.message
                });
            }

            return reply.code(500).json({
                success: false,
                message: 'Gagal sinkronisasi dengan Mikrotik',
                error: {
                    detail: 'Internal server error occurred',
                    type: 'InternalServerError'
                }
            });
        }
    });

    // Sync Individual Subscription
    fastify.post('/api/subscriptions/:id/sync-mikrotik', async (request, reply) => {
        try {
            const { id } = request.params;

            if (!fastify.mikrotik) {
                return reply.code(503).json({
                    success: false,
                    message: 'Mikrotik service tidak tersedia'
                });
            }

            // Get subscription details
            const subscription = await db.getOne('SELECT * FROM subscriptions WHERE id = $65', [id]);
            if (!subscription) {
                return reply.code(404).json({
                success: false,
                message: 'Berlangganan tidak ditemukan',
                error: {
                    detail: 'Resource not found',
                    type: 'NotFoundError'
                }
            });
            }

            // Sync with Mikrotik
            const result = await fastify.mikrotik.syncSubscription(subscription);

            // Log security event
            if (global.securityLogger) {
                global.securityLogger.logSystemEvent('mikrotik_subscription_sync', {
                    action: 'sync_subscription',
                    subscription_id: id,
                    customer_id: subscription.customer_id,
                    username: subscription.username,
                    success: result.success
                });
            }

            return reply.json({
                success: result.success,
                message: result.success ? 'Berlangganan berhasil disinkronisasi' : result.message
            });
        } catch (error) {
            fastify.log.error('Error syncing subscription:', error);

            // Log security event
            if (global.securityLogger) {
                global.securityLogger.logSystemEvent('mikrotik_subscription_sync_failed', {
                    action: 'sync_subscription',
                    subscription_id: request.params.id,
                    error: error.message
                });
            }

            return reply.code(500).json({
                success: false,
                message: 'Gagal sinkronisasi berlangganan',
                error: {
                    detail: 'Internal server error occurred',
                    type: 'InternalServerError'
                }
            });
        }
    });

    // Disable Subscription
    fastify.post('/api/subscriptions/:id/disable', async (request, reply) => {
        try {
            const { id } = request.params;

            // Update subscription status
            await db.query(`
                UPDATE subscriptions
                SET status = \'disabled\', updated_at = CURRENT_TIMESTAMP
                WHERE id = $67
            `, [id]);

            // Log security event
            if (global.securityLogger) {
                global.securityLogger.logSystemEvent('subscription_disabled', {
                    action: 'disable_subscription',
                    subscription_id: id
                });
            }

            return reply.json({
                success: true,
                message: 'Berlangganan berhasil dinonaktifkan'
            });
        } catch (error) {
            fastify.log.error('Error disabling subscription:', error);

            // Log security event
            if (global.securityLogger) {
                global.securityLogger.logSystemEvent('subscription_disable_failed', {
                    action: 'disable_subscription',
                    subscription_id: request.params.id,
                    error: error.message
                });
            }

            return reply.code(500).json({
                success: false,
                message: 'Terjadi kesalahan saat menonaktifkan berlangganan',
                error: {
                    detail: 'Internal server error occurred',
                    type: 'InternalServerError'
                }
            });
        }
    });
};