const Query = require('../lib/query');
// Database pool will be passed as parameter
const EventEmitter = require('events');

/**
 * Carry Over Service - Handles partial payment carry over logic
 * Manages unused balances from partial payments for future use
 */
class CarryOverService extends EventEmitter {
    constructor(dbPool = null) {
        super();
        if (dbPool) this.query = new Query(dbPool);
    }

    /**
     * Process payment and carry over any excess amount
     * @param {Object} paymentData - Payment information
     * @param {number} paymentData.amount - Amount paid
     * @param {number} paymentData.invoiceAmount - Invoice amount
     * @param {number} paymentData.customerId - Customer ID
     * @param {number} paymentData.subscriptionId - Subscription ID (optional)
     * @param {string} paymentData.paymentId - Payment ID
     * @param {string} paymentData.currency - Currency code (default: IDR)
     * @param {number} paymentData.validityDays - Carry over validity period (default: 30 days)
     * @returns {Object} Processing result
     */
    async processPayment(paymentData) {
        const {
            amount,
            invoiceAmount,
            customerId,
            subscriptionId = null,
            paymentId,
            currency = 'IDR',
            validityDays = 30
        } = paymentData;

        const excessAmount = amount - invoiceAmount;

        if (excessAmount <= 0) {
            return {
                success: true,
                carriedOver: false,
                excessAmount: 0,
                message: 'Payment fully applied to invoice'
            };
        }

        try {
            // Create carry over balance entry
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + validityDays);

            const carryOverId = await QueryHelper.insert(`
                INSERT INTO carry_over_balances
                (customer_id, subscription_id, amount, currency, original_payment_id, expires_at, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, NOW())
                RETURNING id
            `, [
                customerId,
                subscriptionId,
                excessAmount,
                currency,
                paymentId,
                expiresAt
            ]);

            console.log(`💰 Carry over created: ${excessAmount} ${currency} for customer ${customerId}`);

            // Log carry over creation
            await QueryHelper.insert(`
                INSERT INTO subscription_history
                (subscription_id, customer_id, action, details, created_at)
                VALUES ($1, $2, $3, $4, NOW())
            `, [
                subscriptionId,
                customerId,
                'carry_over_created',
                JSON.stringify({
                    carry_over_id: carryOverId,
                    amount: excessAmount,
                    currency,
                    expires_at: expiresAt,
                    payment_id: paymentId
                })
            ]);

            this.emit('carryOverCreated', {
                id: carryOverId,
                customerId,
                subscriptionId,
                amount: excessAmount,
                currency,
                expiresAt
            });

            return {
                success: true,
                carriedOver: true,
                carryOverId,
                excessAmount,
                expiresAt,
                message: `Excess amount of ${excessAmount} ${currency} carried over for future use`
            };

        } catch (error) {
            console.error('Error processing carry over:', error);
            this.emit('error', error);
            throw error;
        }
    }

    /**
     * Get available carry over balances for a customer
     * @param {number} customerId - Customer ID
     * @param {number} subscriptionId - Optional subscription ID to filter
     * @returns {Array} Available carry over balances
     */
    async getAvailableBalances(customerId, subscriptionId = null) {
        try {
            const whereClause = subscriptionId
                ? `AND cob.subscription_id = $2`
                : ``;

            const params = subscriptionId
                ? [customerId, subscriptionId]
                : [customerId];

            const balances = await QueryHelper.getMany(`
                SELECT
                    cob.*,
                    c.name as customer_name,
                    s.name as subscription_name,
                    p.method,
                    p.created_at as original_payment_date
                FROM carry_over_balances cob
                LEFT JOIN customers c ON cob.customer_id = c.id
                LEFT JOIN subscriptions s ON cob.subscription_id = s.id
                LEFT JOIN payments p ON cob.original_payment_id = p.id
                WHERE cob.customer_id = $1
                  AND cob.is_used = false
                  AND cob.expires_at > NOW()
                  ${whereClause}
                ORDER BY cob.expires_at ASC
            `, params);

            return balances;
        } catch (error) {
            console.error('Error getting available balances:', error);
            throw error;
        }
    }

    /**
     * Apply carry over balances to an invoice
     * @param {Object} invoiceData - Invoice information
     * @param {number} invoiceData.customerId - Customer ID
     * @param {number} invoiceData.invoiceAmount - Total invoice amount
     * @param {number} invoiceData.subscriptionId - Subscription ID (optional)
     * @param {Array} invoiceData.carryOverIds - Specific carry over IDs to use (optional)
     * @returns {Object} Application result
     */
    async applyCarryOver(invoiceData) {
        const {
            customerId,
            invoiceAmount,
            subscriptionId = null,
            carryOverIds = null
        } = invoiceData;

        if (invoiceAmount <= 0) {
            throw new Error('Invoice amount must be greater than 0');
        }

        try {
            // Get available balances
            const availableBalances = await this.getAvailableBalances(customerId, subscriptionId);

            // Filter specific IDs if provided
            let balancesToUse = availableBalances;
            if (carryOverIds && carryOverIds.length > 0) {
                balancesToUse = availableBalances.filter(b =>
                    carryOverIds.includes(b.id)
                );
            }

            if (balancesToUse.length === 0) {
                return {
                    success: true,
                    appliedAmount: 0,
                    remainingAmount: invoiceAmount,
                    usedBalances: [],
                    message: 'No carry over balances available'
                };
            }

            let remainingInvoice = invoiceAmount;
            const usedBalances = [];
            const totalAvailable = balancesToUse.reduce((sum, b) => sum + parseFloat(b.amount), 0);

            // Apply balances FIFO style
            for (const balance of balancesToUse) {
                if (remainingInvoice <= 0) break;

                const balanceAmount = parseFloat(balance.amount);
                const amountToApply = Math.min(balanceAmount, remainingInvoice);

                // Update or mark as used
                if (amountToApply >= balanceAmount) {
                    // Fully used
                    await QueryHelper.query(`
                        UPDATE carry_over_balances
                        SET is_used = true,
                            used_at = NOW(),
                            used_amount = $1,
                            updated_at = NOW()
                        WHERE id = $2
                    `, [amountToApply, balance.id]);
                } else {
                    // Partially used
                    const newAmount = balanceAmount - amountToApply;
                    await QueryHelper.query(`
                        UPDATE carry_over_balances
                        SET amount = $1,
                            used_amount = used_amount + $2,
                            updated_at = NOW()
                        WHERE id = $3
                    `, [newAmount, amountToApply, balance.id]);
                }

                usedBalances.push({
                    carryOverId: balance.id,
                    amount: amountToApply,
                    originalAmount: balanceAmount
                });

                remainingInvoice -= amountToApply;

                // Log usage
                await QueryHelper.insert(`
                    INSERT INTO subscription_history
                    (subscription_id, customer_id, action, details, created_at)
                    VALUES ($1, $2, $3, $4, NOW())
                `, [
                    subscriptionId,
                    customerId,
                    'carry_over_applied',
                    JSON.stringify({
                        carry_over_id: balance.id,
                        amount: amountToApply,
                        remaining_invoice: remainingInvoice
                    })
                ]);
            }

            const appliedAmount = invoiceAmount - remainingInvoice;

            this.emit('carryOverApplied', {
                customerId,
                subscriptionId,
                invoiceAmount,
                appliedAmount,
                remainingInvoice,
                usedBalances
            });

            return {
                success: true,
                appliedAmount,
                remainingAmount: remainingInvoice,
                usedBalances,
                message: `Applied ${appliedAmount} from carry over balances`
            };

        } catch (error) {
            console.error('Error applying carry over:', error);
            this.emit('error', error);
            throw error;
        }
    }

    /**
     * Get total available carry over amount for a customer
     * @param {number} customerId - Customer ID
     * @param {number} subscriptionId - Optional subscription ID
     * @returns {number} Total available amount
     */
    async getTotalAvailable(customerId, subscriptionId = null) {
        try {
            const whereClause = subscriptionId
                ? `AND subscription_id = $2`
                : ``;

            const params = subscriptionId
                ? [customerId, subscriptionId]
                : [customerId];

            const result = await QueryHelper.getOne(`
                SELECT COALESCE(SUM(amount), 0) as total
                FROM carry_over_balances
                WHERE customer_id = $1
                  AND is_used = false
                  AND expires_at > NOW()
                  ${whereClause}
            `, params);

            return parseFloat(result.total) || 0;
        } catch (error) {
            console.error('Error getting total available:', error);
            return 0;
        }
    }

    /**
     * Clean up expired carry over balances
     * Runs daily to mark expired balances as void
     */
    async cleanupExpiredBalances() {
        try {
            const expiredBalances = await QueryHelper.getMany(`
                UPDATE carry_over_balances
                SET is_used = true,
                    used_at = NOW(),
                    updated_at = NOW(),
                    notes = 'Expired - balance voided'
                WHERE is_used = false
                  AND expires_at <= NOW()
                RETURNING *
            `);

            if (expiredBalances.length > 0) {
                console.log(`🗑️ Cleaned up ${expiredBalances.length} expired carry over balances`);

                // Log cleanup
                for (const balance of expiredBalances) {
                    await QueryHelper.insert(`
                        INSERT INTO subscription_history
                        (subscription_id, customer_id, action, details, created_at)
                        VALUES ($1, $2, $3, $4, NOW())
                    `, [
                        balance.subscription_id,
                        balance.customer_id,
                        'carry_over_expired',
                        JSON.stringify({
                            carry_over_id: balance.id,
                            amount: balance.amount,
                            expired_at: balance.expires_at
                        })
                    ]);
                }

                this.emit('balancesExpired', expiredBalances);
            }

            return expiredBalances.length;
        } catch (error) {
            console.error('Error cleaning up expired balances:', error);
            throw error;
        }
    }

    /**
     * Get carry over statistics
     * @param {number} customerId - Optional customer ID
     * @returns {Object} Statistics
     */
    async getStatistics(customerId = null) {
        try {
            const whereClause = customerId
                ? `WHERE cob.customer_id = $1`
                : ``;

            const params = customerId
                ? [customerId]
                : [];

            const stats = await QueryHelper.getOne(`
                SELECT
                    COUNT(*) as total_entries,
                    COUNT(CASE WHEN cob.is_used = false AND cob.expires_at > NOW() THEN 1 END) as active_entries,
                    COUNT(CASE WHEN cob.is_used = true THEN 1 END) as used_entries,
                    COUNT(CASE WHEN cob.is_used = false AND cob.expires_at <= NOW() THEN 1 END) as expired_entries,
                    COALESCE(SUM(CASE WHEN cob.is_used = false AND cob.expires_at > NOW() THEN cob.amount END), 0) as active_total,
                    COALESCE(SUM(CASE WHEN cob.is_used = true THEN cob.used_amount END), 0) as used_total,
                    COALESCE(SUM(CASE WHEN cob.is_used = false AND cob.expires_at <= NOW() THEN cob.amount END), 0) as expired_total
                FROM carry_over_balances cob
                ${whereClause}
            `, params);

            return {
                totalEntries: parseInt(stats.total_entries),
                activeEntries: parseInt(stats.active_entries),
                usedEntries: parseInt(stats.used_entries),
                expiredEntries: parseInt(stats.expired_entries),
                activeTotal: parseFloat(stats.active_total),
                usedTotal: parseFloat(stats.used_total),
                expiredTotal: parseFloat(stats.expired_total)
            };
        } catch (error) {
            console.error('Error getting carry over statistics:', error);
            throw error;
        }
    }

    /**
     * Transfer carry over balance between subscriptions
     * @param {number} fromSubscriptionId - Source subscription ID
     * @param {number} toSubscriptionId - Target subscription ID
     * @param {number} amount - Amount to transfer
     * @returns {Object} Transfer result
     */
    async transferBalance(fromSubscriptionId, toSubscriptionId, amount) {
        try {
            // Get available balance from source subscription
            const sourceBalances = await QueryHelper.getMany(`
                SELECT * FROM carry_over_balances
                WHERE subscription_id = $1
                  AND is_used = false
                  AND expires_at > NOW()
                ORDER BY expires_at ASC
            `, [fromSubscriptionId]);

            const totalAvailable = sourceBalances.reduce((sum, b) => sum + parseFloat(b.amount), 0);

            if (totalAvailable < amount) {
                throw new Error(`Insufficient balance. Available: ${totalAvailable}, Requested: ${amount}`);
            }

            let remainingToTransfer = amount;
            const transferredBalances = [];

            for (const balance of sourceBalances) {
                if (remainingToTransfer <= 0) break;

                const balanceAmount = parseFloat(balance.amount);
                const amountToTransfer = Math.min(balanceAmount, remainingToTransfer);

                // Create new carry over entry for target subscription
                await QueryHelper.insert(`
                    INSERT INTO carry_over_balances
                    (customer_id, subscription_id, amount, currency, original_payment_id, expires_at, notes, created_at)
                    SELECT customer_id, $2, $3, currency, original_payment_id, expires_at, 'Transferred from subscription ' || $1, NOW()
                    FROM carry_over_balances
                    WHERE id = $4
                `, [fromSubscriptionId, toSubscriptionId, amountToTransfer, balance.id]);

                // Update source balance
                if (amountToTransfer >= balanceAmount) {
                    await QueryHelper.query(`
                        UPDATE carry_over_balances
                        SET is_used = true,
                            used_at = NOW(),
                            notes = 'Transferred to subscription ' || $2,
                            updated_at = NOW()
                        WHERE id = $1
                    `, [balance.id]);
                } else {
                    await QueryHelper.query(`
                        UPDATE carry_over_balances
                        SET amount = amount - $1,
                            used_amount = used_amount + $1,
                            notes = 'Partial transfer to subscription ' || $2,
                            updated_at = NOW()
                        WHERE id = $3
                    `, [amountToTransfer, toSubscriptionId, balance.id]);
                }

                transferredBalances.push({
                    sourceBalanceId: balance.id,
                    amount: amountToTransfer
                });

                remainingToTransfer -= amountToTransfer;
            }

            this.emit('balanceTransferred', {
                fromSubscriptionId,
                toSubscriptionId,
                amount,
                transferredBalances
            });

            return {
                success: true,
                amount,
                transferredBalances,
                message: `Successfully transferred ${amount} to subscription ${toSubscriptionId}`
            };

        } catch (error) {
            console.error('Error transferring balance:', error);
            throw error;
        }
    }
}

module.exports = CarryOverService;