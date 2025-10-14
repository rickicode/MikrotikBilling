const Query = require('../lib/query');
// Database pool will be passed as parameter
const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');

/**
 * Payment Flow Orchestrator - Manages end-to-end payment processing
 * Integrates payment plugins, carry over logic, notifications, and subscription updates
 */
class PaymentFlowOrchestrator extends EventEmitter {
    constructor(dbPool = null, options = {}) {
        super();
        if (dbPool) this.query = new Query(dbPool);
        this.carryOverService = options.carryOverService;
        this.whatsappService = options.whatsappService;
        this.mikrotikClient = options.mikrotikClient;
        this.notificationService = options.notificationService;
        this.isProcessing = new Map(); // Track ongoing payments
    }

    /**
     * Process payment from payment link
     * @param {string} token - Payment token
     * @param {string} paymentMethod - Payment method/plugin
     * @param {Object} options - Additional options
     * @returns {Object} Processing result
     */
    async processPaymentFromLink(token, paymentMethod, options = {}) {
        const processId = uuidv4();

        try {
            // Check if already processing
            if (this.isProcessing.has(token)) {
                throw new Error('Payment is already being processed');
            }

            this.isProcessing.set(token, processId);
            this.emit('paymentStarted', { token, paymentMethod, processId });

            // Start transaction
            const client = await this.pool.connect();

            try {
                await client.query('BEGIN');

                // 1. Validate payment token
                const tokenData = await this.validatePaymentToken(token, client);
                if (!tokenData) {
                    throw new Error('Invalid or expired payment token');
                }

                // 2. Get or create invoice
                const invoice = await this.getOrCreateInvoice(tokenData.invoiceId, tokenData, client);

                // 3. Check carry over balance
                const carryOverResult = await this.applyCarryOverIfAvailable(
                    invoice.customer_id,
                    invoice.total_amount,
                    invoice.subscription_id,
                    client
                );

                let remainingAmount = invoice.total_amount - (carryOverResult?.appliedAmount || 0);
                let paymentRecords = [];

                // 4. Create payment if amount remaining
                if (remainingAmount > 0) {
                    const payment = await this.createPaymentThroughPlugin(
                        invoice,
                        remainingAmount,
                        paymentMethod,
                        options,
                        client
                    );
                    paymentRecords.push(payment);
                }

                // 5. Update invoice status
                const invoiceStatus = remainingAmount > 0 ? 'partial' : 'paid';
                await this.updateInvoiceStatus(invoice.id, invoiceStatus, carryOverResult, client);

                // 6. Create payment record
                const paymentId = await this.query.insertWithClient(`
                    INSERT INTO payments
                    (customer_id, subscription_id, invoice_id, amount, method, status, reference, created_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
                    RETURNING id
                `, client, [
                    invoice.customer_id,
                    invoice.subscription_id,
                    invoice.id,
                    invoice.total_amount,
                    paymentMethod,
                    remainingAmount > 0 ? 'pending' : 'paid',
                    paymentRecords[0]?.reference || null
                ]);

                await client.query('COMMIT');

                // 7. Send notification
                if (carryOverResult?.appliedAmount > 0) {
                    await this.sendPaymentNotification(
                        invoice.customer_id,
                        'payment_with_carryover',
                        {
                            invoiceNumber: invoice.invoice_number,
                            totalAmount: invoice.total_amount,
                            carryOverAmount: carryOverResult.appliedAmount,
                            paidAmount: invoice.total_amount - carryOverResult.appliedAmount
                        }
                    );
                }

                // 8. Schedule payment status checking if pending
                if (remainingAmount > 0) {
                    this.schedulePaymentCheck(paymentId, paymentMethod);
                }

                this.isProcessing.delete(token);
                this.emit('paymentProcessed', {
                    token,
                    paymentId,
                    status: remainingAmount > 0 ? 'partial' : 'paid',
                    carryOverApplied: carryOverResult?.appliedAmount > 0
                });

                return {
                    success: true,
                    paymentId,
                    invoiceNumber: invoice.invoice_number,
                    status: remainingAmount > 0 ? 'partial' : 'paid',
                    totalAmount: invoice.total_amount,
                    carryOverApplied: carryOverResult?.appliedAmount || 0,
                    remainingAmount,
                    paymentUrl: paymentRecords[0]?.paymentUrl
                };

            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }

        } catch (error) {
            this.isProcessing.delete(token);
            this.emit('paymentError', { token, error: error.message });
            throw error;
        }
    }

    /**
     * Handle payment callback from gateway
     * @param {string} method - Payment method
     * @param {Object} callbackData - Callback data
     * @returns {Object} Processing result
     */
    async handlePaymentCallback(method, callbackData) {
        try {
            this.emit('callbackReceived', { method, callbackData });

            // 1. Verify callback signature
            const plugin = await this.loadPaymentPlugin(method);
            const isValid = await plugin.verifyCallback(callbackData);

            if (!isValid) {
                throw new Error('Invalid callback signature');
            }

            // 2. Extract payment info
            const paymentInfo = plugin.parseCallback(callbackData);
            const { reference, status, amount, transactionId } = paymentInfo;

            // 3. Update payment record
            const payment = await this.query.getOne(`
                SELECT p.*, i.customer_id, i.subscription_id
                FROM payments p
                LEFT JOIN invoices i ON p.invoice_id = i.id
                WHERE p.reference = $1
            `, [reference]);

            if (!payment) {
                throw new Error('Payment not found');
            }

            // 4. Process based on status
            if (status === 'SUCCESS' || status === 'PAID') {
                await this.processSuccessfulPayment(payment, {
                    amount,
                    transactionId,
                    method
                });
            } else if (status === 'FAILED' || status === 'CANCELLED') {
                await this.processFailedPayment(payment, {
                    reason: callbackData.failureReason || 'Payment failed',
                    method
                });
            }

            return { success: true, status };

        } catch (error) {
            this.emit('callbackError', { method, error: error.message });
            throw error;
        }
    }

    /**
     * Process successful payment
     * @param {Object} payment - Payment record
     * @param {Object} updateData - Update data
     */
    async processSuccessfulPayment(payment, updateData) {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Update payment status
            await this.query.queryWithClient(`
                UPDATE payments
                SET status = 'paid',
                    transaction_id = $1,
                    paid_at = NOW(),
                    updated_at = NOW()
                WHERE id = $2
            `, client, [updateData.transactionId, payment.id]);

            // Check for excess amount
            const excessAmount = updateData.amount - payment.amount;

            if (excessAmount > 0 && this.carryOverService) {
                // Create carry over
                await this.carryOverService.processPayment({
                    amount: updateData.amount,
                    invoiceAmount: payment.amount,
                    customerId: payment.customer_id,
                    subscriptionId: payment.subscription_id,
                    paymentId: payment.id,
                    paymentMethod: updateData.method
                });
            }

            // Update subscription if applicable
            if (payment.subscription_id) {
                await this.extendSubscription(payment.subscription_id, payment.amount, client);
            }

            await client.query('COMMIT');

            // Send notification
            await this.sendPaymentNotification(
                payment.customer_id,
                'payment_success',
                {
                    amount: payment.amount,
                    method: updateData.method,
                    transactionId: updateData.transactionId,
                    excessAmount: excessAmount > 0 ? excessAmount : null
                }
            );

            this.emit('paymentSuccess', { paymentId: payment.id, excessAmount });

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Process failed payment
     * @param {Object} payment - Payment record
     * @param {Object} updateData - Update data
     */
    async processFailedPayment(payment, updateData) {
        await this.query.query(`
            UPDATE payments
            SET status = 'failed',
                failure_reason = $1,
                updated_at = NOW()
            WHERE id = $2
        `, [updateData.reason, payment.id]);

        // Send notification
        await this.sendPaymentNotification(
            payment.customer_id,
            'payment_failed',
            {
                amount: payment.amount,
                reason: updateData.reason,
                method: updateData.method
            }
        );

        this.emit('paymentFailed', { paymentId: payment.id, reason: updateData.reason });
    }

    /**
     * Validate payment token
     * @param {string} token - Payment token
     * @param {Object} client - Database client
     * @returns {Object} Token data
     */
    async validatePaymentToken(token, client) {
        const result = await this.query.getOneWithClient(`
            SELECT pt.*, i.invoice_number, i.total_amount, i.customer_id, i.subscription_id
            FROM payment_tokens pt
            LEFT JOIN invoices i ON pt.invoice_id = i.id
            WHERE pt.token = $1
              AND pt.expires_at > NOW()
              AND pt.is_used = false
        `, client, [token]);

        if (result) {
            // Mark token as used
            await this.query.queryWithClient(`
                UPDATE payment_tokens
                SET is_used = true, used_at = NOW()
                WHERE id = $1
            `, client, [result.id]);
        }

        return result;
    }

    /**
     * Get or create invoice
     * @param {number} invoiceId - Invoice ID
     * @param {Object} tokenData - Token data
     * @param {Object} client - Database client
     * @returns {Object} Invoice data
     */
    async getOrCreateInvoice(invoiceId, tokenData, client) {
        if (invoiceId) {
            return await this.query.getOneWithClient(`
                SELECT * FROM invoices WHERE id = $1
            `, client, [invoiceId]);
        }

        // Create new invoice
        const invoiceNumber = this.generateInvoiceNumber();
        const newInvoice = await this.query.insertWithClient(`
            INSERT INTO invoices
            (invoice_number, customer_id, subscription_id, total_amount, status, due_date, created_at)
            VALUES ($1, $2, $3, $4, 'pending', NOW() + INTERVAL '7 days', NOW())
            RETURNING *
        `, client, [
            invoiceNumber,
            tokenData.customer_id,
            tokenData.subscription_id,
            tokenData.amount || 0
        ]);

        return newInvoice;
    }

    /**
     * Apply carry over balance if available
     * @param {number} customerId - Customer ID
     * @param {number} invoiceAmount - Invoice amount
     * @param {number} subscriptionId - Subscription ID
     * @param {Object} client - Database client
     * @returns {Object} Application result
     */
    async applyCarryOverIfAvailable(customerId, invoiceAmount, subscriptionId, client) {
        if (!this.carryOverService) {
            return null;
        }

        try {
            const result = await this.carryOverService.applyCarryOver({
                customerId,
                invoiceAmount,
                subscriptionId
            });

            // Log carry over usage
            if (result.appliedAmount > 0) {
                await this.query.insertWithClient(`
                    INSERT INTO payment_logs
                    (payment_id, action, details, created_at)
                    VALUES ($1, $2, $3, NOW())
                `, client, [
                    null,
                    'carry_over_applied',
                    JSON.stringify(result)
                ]);
            }

            return result;

        } catch (error) {
            console.error('Error applying carry over:', error);
            return null;
        }
    }

    /**
     * Create payment through plugin
     * @param {Object} invoice - Invoice data
     * @param {number} amount - Payment amount
     * @param {string} method - Payment method
     * @param {Object} options - Additional options
     * @param {Object} client - Database client
     * @returns {Object} Payment data
     */
    async createPaymentThroughPlugin(invoice, amount, method, options, client) {
        const plugin = await this.loadPaymentPlugin(method);

        const paymentData = {
            invoiceNumber: invoice.invoice_number,
            amount,
            customer: {
                id: invoice.customer_id
            },
            returnUrl: `${process.env.BASE_URL}/pay/success/${invoice.invoice_number}`,
            callbackUrl: `${process.env.BASE_URL}/api/payments/webhook/${method}`,
            ...options
        };

        const payment = await plugin.createPayment(paymentData);

        // Store payment reference
        await this.query.insertWithClient(`
            INSERT INTO payment_references
            (payment_id, method, reference, payment_url, created_at)
            VALUES ($1, $2, $3, $4, NOW())
        `, client, [
            invoice.id,
            method,
            payment.reference,
            payment.paymentUrl
        ]);

        return payment;
    }

    /**
     * Load payment plugin
     * @param {string} method - Payment method
     * @returns {Object} Plugin instance
     */
    async loadPaymentPlugin(method) {
        const PaymentPluginManager = require('./PaymentPluginManager');
        const pluginManager = new PaymentPluginManager(this.query);

        return await pluginManager.getPlugin(method);
    }

    /**
     * Update invoice status
     * @param {number} invoiceId - Invoice ID
     * @param {string} status - New status
     * @param {Object} carryOverResult - Carry over result
     * @param {Object} client - Database client
     */
    async updateInvoiceStatus(invoiceId, status, carryOverResult, client) {
        await this.query.queryWithClient(`
            UPDATE invoices
            SET status = $1,
                paid_amount = COALESCE(paid_amount, 0) + $2,
                carry_over_amount = COALESCE(carry_over_amount, 0) + $3,
                updated_at = NOW()
            WHERE id = $4
        `, client, [
            status,
            carryOverResult?.appliedAmount || 0,
            carryOverResult?.appliedAmount || 0,
            invoiceId
        ]);
    }

    /**
     * Extend subscription
     * @param {number} subscriptionId - Subscription ID
     * @param {number} amount - Payment amount
     * @param {Object} client - Database client
     */
    async extendSubscription(subscriptionId, amount, client) {
        // Get subscription details
        const subscription = await this.query.getOneWithClient(`
            SELECT * FROM subscriptions WHERE id = $1
        `, client, [subscriptionId]);

        if (!subscription) return;

        // Calculate extension (simplified logic)
        const daysExtension = Math.floor((amount / subscription.price_sell) * 30);

        // Update subscription
        await this.query.queryWithClient(`
            UPDATE subscriptions
            SET expiry_date = CASE
                WHEN expiry_date > NOW()
                THEN expiry_date + INTERVAL '${daysExtension} days'
                ELSE NOW() + INTERVAL '${daysExtension} days'
            END,
            status = 'active',
            updated_at = NOW()
            WHERE id = $1
        `, client, [subscriptionId]);

        // Sync with Mikrotik if available
        if (this.mikrotikClient && subscription.username) {
            try {
                await this.mikrotikClient.extendSubscription(subscription.username, daysExtension);
            } catch (error) {
                console.error('Error syncing with Mikrotik:', error);
            }
        }

        this.emit('subscriptionExtended', { subscriptionId, daysExtension });
    }

    /**
     * Send payment notification
     * @param {number} customerId - Customer ID
     * @param {string} template - Notification template
     * @param {Object} data - Template data
     */
    async sendPaymentNotification(customerId, template, data) {
        if (this.whatsappService) {
            try {
                // Get customer phone number
                const customer = await this.query.getOne(`
                    SELECT phone FROM customers WHERE id = $1
                `, [customerId]);

                if (customer && customer.phone) {
                    await this.whatsappService.sendNotification(
                        customer.phone,
                        template,
                        data
                    );
                }
            } catch (error) {
                console.error('Error sending payment notification:', error);
            }
        }
    }

    /**
     * Schedule payment status check
     * @param {number} paymentId - Payment ID
     * @param {string} method - Payment method
     */
    schedulePaymentCheck(paymentId, method) {
        // Schedule status check in 5 minutes
        setTimeout(async () => {
            try {
                const plugin = await this.loadPaymentPlugin(method);
                const payment = await this.query.getOne(`
                    SELECT * FROM payments WHERE id = $1 AND status = 'pending'
                `, [paymentId]);

                if (payment) {
                    const status = await plugin.checkStatus(payment.reference);
                    if (status === 'SUCCESS') {
                        await this.processSuccessfulPayment(payment, {
                            amount: payment.amount,
                            transactionId: status.transactionId,
                            method
                        });
                    }
                }
            } catch (error) {
                console.error('Error checking payment status:', error);
            }
        }, 5 * 60 * 1000); // 5 minutes
    }

    /**
     * Generate invoice number
     * @returns {string} Invoice number
     */
    generateInvoiceNumber() {
        const date = new Date();
        const timestamp = date.getFullYear() +
            String(date.getMonth() + 1).padStart(2, '0') +
            String(date.getDate()).padStart(2, '0');
        const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        return `INV${timestamp}${random}`;
    }

    /**
     * Get payment statistics
     * @param {Object} filters - Filter options
     * @returns {Object} Statistics
     */
    async getPaymentStatistics(filters = {}) {
        const { startDate, endDate, customerId, status } = filters;

        let whereClause = 'WHERE 1=1';
        const params = [];
        let paramIndex = 1;

        if (startDate) {
            whereClause += ` AND DATE(p.created_at) >= $${paramIndex++}`;
            params.push(startDate);
        }

        if (endDate) {
            whereClause += ` AND DATE(p.created_at) <= $${paramIndex++}`;
            params.push(endDate);
        }

        if (customerId) {
            whereClause += ` AND p.customer_id = $${paramIndex++}`;
            params.push(customerId);
        }

        if (status) {
            whereClause += ` AND p.status = $${paramIndex++}`;
            params.push(status);
        }

        const stats = await this.query.getOne(`
            SELECT
                COUNT(*) as total_payments,
                COUNT(CASE WHEN p.status = 'paid' THEN 1 END) as successful_payments,
                COUNT(CASE WHEN p.status = 'pending' THEN 1 END) as pending_payments,
                COUNT(CASE WHEN p.status = 'failed' THEN 1 END) as failed_payments,
                COALESCE(SUM(p.amount), 0) as total_amount,
                COALESCE(SUM(CASE WHEN p.status = 'paid' THEN p.amount ELSE 0 END), 0) as collected_amount,
                COALESCE(AVG(p.amount), 0) as average_amount
            FROM payments p
            ${whereClause}
        `, params);

        return stats;
    }
}

module.exports = PaymentFlowOrchestrator;