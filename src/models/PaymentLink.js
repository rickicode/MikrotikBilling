const BaseModel = require('./BaseModel');

class PaymentLink extends BaseModel {
  constructor() {
    super('payment_links');
  }

  /**
   * Create a new payment link
   * @param {Object} paymentLinkData - Payment link data
   * @param {number} paymentLinkData.customerId - Customer ID
   * @param {string} paymentLinkData.invoiceNumber - Invoice number
   * @param {number} paymentLinkData.amount - Payment amount
   * @param {Date} paymentLinkData.expiryDate - Expiry date
   * @param {string} [paymentLinkData.duitkuReference] - DuitKu reference
   * @param {string} [paymentLinkData.paymentUrl] - Generated payment URL
   * @returns {Object} Created payment link with ID
   */
  async create(paymentLinkData) {
    const {
      customerId,
      invoiceNumber,
      amount,
      expiryDate,
      duitkuReference = null,
      paymentUrl = null
    } = paymentLinkData;

    const result = await this.db.query(`
      INSERT INTO payment_links (
        customer_id, invoice_number, duitku_reference, payment_url,
        amount, expiry_date, status, created_date, updated_date
      ) VALUES ($1, $2, $3, $4, $5, $6, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id
    `, [
      customerId,
      invoiceNumber,
      duitkuReference,
      paymentUrl,
      amount,
      expiryDate.toISOString()
    ]);

    return this.findById(result.rows[0].id);
  }

  /**
   * Find payment link by ID
   * @param {number} id - Payment link ID
   * @returns {Object|null} Payment link or null
   */
  async findById(id) {
    const result = await this.db.query(`
      SELECT * FROM payment_links WHERE id = $1
    `, [id]);

    return result.rows[0];
  }

  /**
   * Find payment link by invoice number
   * @param {string} invoiceNumber - Invoice number
   * @returns {Object|null} Payment link or null
   */
  async findByInvoiceNumber(invoiceNumber) {
    const result = await this.db.query(`
      SELECT * FROM payment_links WHERE invoice_number = $1
    `, [invoiceNumber]);

    return result.rows[0];
  }

  /**
   * Find payment links by customer ID with pagination
   * @param {number} customerId - Customer ID
   * @param {Object} options - Query options
   * @param {number} [options.limit=50] - Limit results
   * @param {number} [options.offset=0] - Offset results
   * @param {string} [options.status] - Filter by status
   * @returns {Array} Array of payment links
   */
  async findByCustomerId(customerId, options = {}) {
    const {
      limit = 50,
      offset = 0,
      status = null
    } = options;

    let query = `
      SELECT pl.*, c.name as customer_name, c.phone as customer_phone
      FROM payment_links pl
      LEFT JOIN customers c ON pl.customer_id = c.id
      WHERE pl.customer_id = $1
    `;

    const params = [customerId];

    if (status) {
      query += ` AND pl.status = $${params.length + 1}`;
      params.push(status);
    }

    query += ` ORDER BY pl.created_date DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await this.this.db.query(query, params);
    return result.rows;
  }

  /**
   * Update payment link status
   * @param {number} id - Payment link ID
   * @param {string} status - New status
   * @returns {boolean} True if updated
   */
  async updateStatus(id, status) {
    const result = await this.db.query(`
      UPDATE payment_links
      SET status = $1, updated_date = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [status, id]);

    return result.rowCount > 0;
  }

  /**
   * Regenerate payment URL for expired link
   * @param {number} id - Payment link ID
   * @param {string} newPaymentUrl - New payment URL
   * @param {Date} newExpiryDate - New expiry date
   * @returns {Object|null} Updated payment link or null
   */
  async regenerateUrl(id, newPaymentUrl, newExpiryDate) {
    const result = await this.db.query(`
      UPDATE payment_links
      SET payment_url = $1,
          expiry_date = $2,
          regenerated_count = regenerated_count + 1,
          status = 'active',
          updated_date = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [newPaymentUrl, newExpiryDate.toISOString(), id]);

    if (result.rowCount > 0) {
      return this.findById(id);
    }
    return null;
  }

  /**
   * Find expired payment links
   * @returns {Array} Array of expired payment links
   */
  async findExpired() {
    const result = await this.db.query(`
      SELECT * FROM payment_links
      WHERE expiry_date < CURRENT_TIMESTAMP AND status = 'active'
      ORDER BY expiry_date ASC
    `);

    return result.rows;
  }

  /**
   * Mark payment link as paid after receiving callback
   * @param {number} id - Payment link ID
   * @param {Object} callbackData - Callback data from DuitKu
   * @param {string} paymentMethod - Payment method used
   * @returns {boolean} True if updated
   */
  async markCallbackReceived(id, callbackData, paymentMethod) {
    const result = await this.db.query(`
      UPDATE payment_links
      SET status = 'paid',
          callback_received = TRUE,
          callback_data = $1,
          payment_method = $2,
          updated_date = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [JSON.stringify(callbackData), paymentMethod, id]);

    return result.rowCount > 0;
  }

  /**
   * Get payment links by status
   * @param {string} status - Payment link status
   * @param {Object} options - Query options
   * @returns {Array} Array of payment links
   */
  async findByStatus(status, options = {}) {
    const { limit = 100, offset = 0 } = options;

    const result = await this.db.query(`
      SELECT pl.*, c.name as customer_name, c.phone as customer_phone
      FROM payment_links pl
      LEFT JOIN customers c ON pl.customer_id = c.id
      WHERE pl.status = $1
      ORDER BY pl.created_date DESC
      LIMIT $2 OFFSET $3
    `, [status, limit, offset]);

    return result.rows;
  }

  /**
   * Get payment links that will expire within specified hours
   * @param {number} hours - Hours from now
   * @returns {Array} Array of payment links expiring soon
   */
  async findExpiringSoon(hours = 24) {
    const result = await this.db.query(`
      SELECT pl.*, c.name as customer_name, c.phone as customer_phone
      FROM payment_links pl
      LEFT JOIN customers c ON pl.customer_id = c.id
      WHERE pl.status = 'active'
        AND pl.expiry_date BETWEEN CURRENT_TIMESTAMP AND CURRENT_TIMESTAMP + INTERVAL $1 hour
        AND pl.callback_received = FALSE
      ORDER BY pl.expiry_date ASC
    `, [hours]);

    return result.rows;
  }

  /**
   * Get payment statistics
   * @param {Object} filters - Date filters
   * @returns {Object} Payment statistics
   */
  async getStatistics(filters = {}) {
    const { startDate = null, endDate = null } = filters;

    let whereClause = '1=1';
    const params = [];

    if (startDate) {
      whereClause += ` AND created_date >= $${params.length + 1}`;
      params.push(startDate.toISOString());
    }

    if (endDate) {
      whereClause += ` AND created_date <= $${params.length + 1}`;
      params.push(endDate.toISOString());
    }

    const stats = {};

    // Total links by status
    const statusQuery = `
      SELECT status, COUNT(*) as count, SUM(amount) as total_amount
      FROM payment_links
      WHERE ${whereClause}
      GROUP BY status
    `;
    const result = await this.this.db.query(statusQuery, params);
    stats.byStatus = result.rows;

    // Total revenue from paid links
    const revenueQuery = `
      SELECT COUNT(*) as paid_count, COALESCE(SUM(amount), 0) as total_revenue
      FROM payment_links
      WHERE status = 'paid' AND ${whereClause}
    `;
    const revenueResult = await this.db.queryOne(revenueQuery, params);
    stats.revenue = revenueResult;

    // Expiring links count
    const expiringQuery = `
      SELECT COUNT(*) as expiring_count
      FROM payment_links
      WHERE status = 'active'
        AND expiry_date > CURRENT_TIMESTAMP
        AND expiry_date <= CURRENT_TIMESTAMP + INTERVAL '24 hours'
    `;
    const expiringResult = await this.db.queryOne(expiringQuery);
    stats.expiringSoon = expiringResult;

    return stats;
  }

  /**
   * Delete payment link (soft delete by updating status)
   * @param {number} id - Payment link ID
   * @returns {boolean} True if deleted
   */
  async delete(id) {
    return this.updateStatus(id, 'cancelled');
  }

  /**
   * Get payment link with full details including customer
   * @param {number} id - Payment link ID
   * @returns {Object|null} Payment link with customer details
   */
  async findWithCustomer(id) {
    const result = await this.db.query(`
      SELECT pl.*, c.name as customer_name, c.phone as customer_phone, c.email as customer_email
      FROM payment_links pl
      LEFT JOIN customers c ON pl.customer_id = c.id
      WHERE pl.id = $1
    `, [id]);

    return result.rows[0];
  }
}

module.exports = PaymentLink;