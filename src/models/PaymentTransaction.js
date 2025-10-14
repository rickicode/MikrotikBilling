const BaseModel = require('./BaseModel');

class PaymentTransaction extends BaseModel {
  constructor() {
    super('payment_transactions');
  }

  /**
   * Create a new payment transaction
   * @param {Object} transactionData - Transaction data
   * @param {number} transactionData.paymentLinkId - Payment link ID
   * @param {string} transactionData.transactionType - Transaction type
   * @param {Object} [transactionData.transactionData] - Transaction data
   * @returns {Object} Created transaction with ID
   */
  async create(transactionData) {
    const {
      paymentLinkId,
      transactionType,
      transactionData: data = null
    } = transactionData;

    const result = await this.db.query(`
      INSERT INTO payment_transactions (
        payment_link_id, transaction_type, transaction_data, status, created_date
      ) VALUES ($1, $2, $3, 'pending', CURRENT_TIMESTAMP)
      RETURNING id
    `, [
      paymentLinkId,
      transactionType,
      data ? JSON.stringify(data) : null
    ]);

    return this.findById(result.rows[0].id);
  }

  /**
   * Find transaction by ID
   * @param {number} id - Transaction ID
   * @returns {Object|null} Transaction or null
   */
  async findById(id) {
    const result = await this.db.query(`
      SELECT pt.*, pl.invoice_number, c.name as customer_name
      FROM payment_transactions pt
      LEFT JOIN payment_links pl ON pt.payment_link_id = pl.id
      LEFT JOIN customers c ON pl.customer_id = c.id
      WHERE pt.id = $1
    `, [id]);

    const transaction = result.rows[0];

    if (transaction && transaction.transaction_data) {
      try {
        transaction.transaction_data = JSON.parse(transaction.transaction_data);
      } catch (e) {
        // Keep as string if invalid JSON
      }
    }

    return transaction;
  }

  /**
   * Find transactions by payment link ID
   * @param {number} paymentLinkId - Payment link ID
   * @param {Object} options - Query options
   * @returns {Array} Array of transactions
   */
  async findByPaymentLinkId(paymentLinkId, options = {}) {
    const {
      limit = 50,
      offset = 0,
      transactionType = null
    } = options;

    let query = `
      SELECT pt.*, pl.invoice_number, c.name as customer_name
      FROM payment_transactions pt
      LEFT JOIN payment_links pl ON pt.payment_link_id = pl.id
      LEFT JOIN customers c ON pl.customer_id = c.id
      WHERE pt.payment_link_id = $1
    `;

    const params = [paymentLinkId];

    if (transactionType) {
      query += ` AND pt.transaction_type = $${params.length + 1}`;
      params.push(transactionType);
    }

    query += ` ORDER BY pt.created_date DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await this.this.db.query(query, params);
    const transactions = result.rows;

    // Parse JSON data for each transaction
    return transactions.map(transaction => {
      if (transaction.transaction_data) {
        try {
          transaction.transaction_data = JSON.parse(transaction.transaction_data);
        } catch (e) {
          // Keep as string if invalid JSON
        }
      }
      return transaction;
    });
  }

  /**
   * Update transaction status
   * @param {number} id - Transaction ID
   * @param {string} status - New status
   * @param {string} [errorMessage] - Error message if failed
   * @returns {boolean} True if updated
   */
  async updateStatus(id, status, errorMessage = null) {
    const updates = ['status = $1', 'completed_date = CURRENT_TIMESTAMP'];
    const params = [status];

    if (errorMessage) {
      updates.push(`error_message = $${params.length + 1}`);
      params.push(errorMessage);
    }

    updates.push(`WHERE id = $${params.length + 1}`);
    params.push(id);

    const result = await this.db.query(`
      UPDATE payment_transactions
      SET ${updates.join(', ')}
    `, params);

    return result.rowCount > 0;
  }

  /**
   * Mark transaction as successful
   * @param {number} id - Transaction ID
   * @param {Object} [resultData] - Result data
   * @returns {boolean} True if updated
   */
  async markSuccess(id, resultData = null) {
    const updates = [
      'status = $1',
      'completed_date = CURRENT_TIMESTAMP',
      'error_message = NULL'
    ];
    const params = ['success'];

    if (resultData) {
      updates.push(`transaction_data = $${params.length + 1}`);
      params.push(JSON.stringify(resultData));
    }

    updates.push(`WHERE id = $${params.length + 1}`);
    params.push(id);

    const result = await this.db.query(`
      UPDATE payment_transactions
      SET ${updates.join(', ')}
    `, params);

    return result.rowCount > 0;
  }

  /**
   * Mark transaction as failed
   * @param {number} id - Transaction ID
   * @param {string} errorMessage - Error message
   * @returns {boolean} True if updated
   */
  async markFailed(id, errorMessage) {
    return this.updateStatus(id, 'failed', errorMessage);
  }

  /**
   * Mark transaction for retry
   * @param {number} id - Transaction ID
   * @param {string} [errorMessage] - Error message
   * @returns {boolean} True if updated
   */
  async markForRetry(id, errorMessage = null) {
    const result = await this.db.query(`
      UPDATE payment_transactions
      SET status = 'retry',
          retry_count = retry_count + 1,
          error_message = $1,
          completed_date = NULL
      WHERE id = $2
    `, [errorMessage, id]);

    return result.rowCount > 0;
  }

  /**
   * Find transactions that need retry
   * @param {number} [maxRetryCount=3] - Maximum retry count
   * @returns {Array} Array of transactions to retry
   */
  async findRetryable(maxRetryCount = 3) {
    const result = await this.db.query(`
      SELECT pt.*, pl.invoice_number, c.name as customer_name
      FROM payment_transactions pt
      LEFT JOIN payment_links pl ON pt.payment_link_id = pl.id
      LEFT JOIN customers c ON pl.customer_id = c.id
      WHERE pt.status = 'retry' AND pt.retry_count < $1
      ORDER BY pt.created_date ASC
    `, [maxRetryCount]);

    const transactions = result.rows;

    // Parse JSON data for each transaction
    return transactions.map(transaction => {
      if (transaction.transaction_data) {
        try {
          transaction.transaction_data = JSON.parse(transaction.transaction_data);
        } catch (e) {
          // Keep as string if invalid JSON
        }
      }
      return transaction;
    });
  }

  /**
   * Get transactions by status
   * @param {string} status - Transaction status
   * @param {Object} options - Query options
   * @returns {Array} Array of transactions
   */
  async findByStatus(status, options = {}) {
    const {
      limit = 100,
      offset = 0,
      transactionType = null,
      startDate = null,
      endDate = null
    } = options;

    let query = `
      SELECT pt.*, pl.invoice_number, c.name as customer_name
      FROM payment_transactions pt
      LEFT JOIN payment_links pl ON pt.payment_link_id = pl.id
      LEFT JOIN customers c ON pl.customer_id = c.id
      WHERE pt.status = $1
    `;

    const params = [status];

    if (transactionType) {
      query += ` AND pt.transaction_type = $${params.length + 1}`;
      params.push(transactionType);
    }

    if (startDate) {
      query += ` AND pt.created_date >= $${params.length + 1}`;
      params.push(startDate.toISOString());
    }

    if (endDate) {
      query += ` AND pt.created_date <= $${params.length + 1}`;
      params.push(endDate.toISOString());
    }

    query += ` ORDER BY pt.created_date DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await this.this.db.query(query, params);
    const transactions = result.rows;

    // Parse JSON data for each transaction
    return transactions.map(transaction => {
      if (transaction.transaction_data) {
        try {
          transaction.transaction_data = JSON.parse(transaction.transaction_data);
        } catch (e) {
          // Keep as string if invalid JSON
        }
      }
      return transaction;
    });
  }

  /**
   * Get transaction statistics
   * @param {Object} filters - Date and status filters
   * @returns {Object} Transaction statistics
   */
  async getStatistics(filters = {}) {
    const {
      startDate = null,
      endDate = null,
      paymentLinkId = null
    } = filters;

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

    if (paymentLinkId) {
      whereClause += ` AND payment_link_id = $${params.length + 1}`;
      params.push(paymentLinkId);
    }

    const stats = {};

    // Transaction counts by status
    const statusQuery = `
      SELECT status, COUNT(*) as count
      FROM payment_transactions
      WHERE ${whereClause}
      GROUP BY status
    `;
    const result = await this.this.db.query(statusQuery, params);
    stats.byStatus = result.rows;

    // Transaction counts by type
    const typeQuery = `
      SELECT transaction_type, status, COUNT(*) as count
      FROM payment_transactions
      WHERE ${whereClause}
      GROUP BY transaction_type, status
    `;
    const typeResult = await this.this.db.query(typeQuery, params);
    stats.byType = typeResult.rows;

    // Success rate
    const successQuery = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'retry' THEN 1 ELSE 0 END) as retrying
      FROM payment_transactions
      WHERE ${whereClause}
    `;
    const successResult = await this.db.query(successQuery, params);
    stats.successRate = successResult.rows[0];

    return stats;
  }

  /**
   * Get recent transactions
   * @param {Object} options - Query options
   * @returns {Array} Array of recent transactions
   */
  async getRecent(options = {}) {
    const {
      limit = 20,
      offset = 0,
      transactionType = null
    } = options;

    let query = `
      SELECT pt.*, pl.invoice_number, c.name as customer_name, pl.amount
      FROM payment_transactions pt
      LEFT JOIN payment_links pl ON pt.payment_link_id = pl.id
      LEFT JOIN customers c ON pl.customer_id = c.id
    `;

    const params = [];

    if (transactionType) {
      query += ` WHERE pt.transaction_type = $1`;
      params.push(transactionType);
    }

    query += ` ORDER BY pt.created_date DESC LIMIT $1 OFFSET $2`;
    params.push(limit, offset);

    const result = await this.this.db.query(query, params);
    const transactions = result.rows;

    // Parse JSON data for each transaction
    return transactions.map(transaction => {
      if (transaction.transaction_data) {
        try {
          transaction.transaction_data = JSON.parse(transaction.transaction_data);
        } catch (e) {
          // Keep as string if invalid JSON
        }
      }
      return transaction;
    });
  }

  /**
   * Log URL generation transaction
   * @param {number} paymentLinkId - Payment link ID
   * @param {Object} generationData - URL generation data
   * @returns {Object} Created transaction
   */
  async logUrlGeneration(paymentLinkId, generationData) {
    return this.create({
      paymentLinkId,
      transactionType: 'generation',
      transactionData: generationData
    });
  }

  /**
   * Log URL regeneration transaction
   * @param {number} paymentLinkId - Payment link ID
   * @param {Object} regenerationData - URL regeneration data
   * @returns {Object} Created transaction
   */
  async logUrlRegeneration(paymentLinkId, regenerationData) {
    return this.create({
      paymentLinkId,
      transactionType: 'regeneration',
      transactionData: regenerationData
    });
  }

  /**
   * Log callback transaction
   * @param {number} paymentLinkId - Payment link ID
   * @param {Object} callbackData - DuitKu callback data
   * @returns {Object} Created transaction
   */
  async logCallback(paymentLinkId, callbackData) {
    return this.create({
      paymentLinkId,
      transactionType: 'callback',
      transactionData: callbackData
    });
  }

  /**
   * Log validation transaction
   * @param {number} paymentLinkId - Payment link ID
   * @param {Object} validationData - Payment validation data
   * @returns {Object} Created transaction
   */
  async logValidation(paymentLinkId, validationData) {
    return this.create({
      paymentLinkId,
      transactionType: 'validation',
      transactionData: validationData
    });
  }

  /**
   * Clean up old transactions
   * @param {number} daysOld - Delete transactions older than this many days
   * @returns {number} Number of deleted transactions
   */
  async cleanupOld(daysOld = 90) {
    const result = await this.db.query(`
      DELETE FROM payment_transactions
      WHERE created_date < CURRENT_TIMESTAMP - INTERVAL $1 day
    `, [daysOld]);

    return result.rowCount;
  }
}

module.exports = PaymentTransaction;