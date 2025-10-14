/**
 * Notification Queue Model
 *
 * Handles all database operations for the notification queue system,
 * including message queuing, status tracking, priority management, and processing state.
 */

const BaseModel = require('./BaseModel');

class NotificationQueue extends BaseModel {
  constructor() {
    super('notification_queue');
  }

  /**
   * Add a message to the queue
   * @param {Object} queueData - Queue data
   * @param {number} queueData.customer_id - Customer ID
   * @param {string} queueData.invoice_number - Invoice number
   * @param {string} queueData.recipient - Recipient phone number
   * @param {string} queueData.message - Message content
   * @param {string} [queueData.template_id] - Template ID used
   * @param {string} [queueData.priority] - Message priority
   * @param {string} [queueData.related_type] - Related entity type
   * @param {string} [queueData.scheduled_at] - Scheduled send time
   * @param {Object} [queueData.template_data] - Template data for substitution
   * @returns {Promise<Object>} Created queue entry
   */
  async add(queueData) {
    const {
      customer_id,
      invoice_number,
      recipient,
      message,
      template_id = null,
      priority = 'normal',
      related_type = null,
      scheduled_at = null,
      template_data = null
    } = queueData;

    // For bulk messages, allow customer_id = 0 and generate invoice_number if not provided
    if (!recipient || !message) {
      throw new Error('Missing required fields: recipient, message');
    }

    // Set default values for bulk messages
    let finalCustomerId = customer_id;
    let finalInvoiceNumber = invoice_number;

    if (!finalCustomerId) finalCustomerId = 0;
    if (!finalInvoiceNumber) finalInvoiceNumber = `BULK_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Validate phone number
    if (!this.isValidPhoneNumber(recipient)) {
      throw new Error('Invalid phone number format');
    }

    // Validate priority
    const validPriorities = ['high', 'normal', 'low'];
    if (!validPriorities.includes(priority)) {
      throw new Error(`Invalid priority: ${priority}. Must be: ${validPriorities.join(', ')}`);
    }

    // Validate related type
    const validRelatedTypes = ['customer', 'subscription', 'payment', 'voucher', 'system'];
    if (related_type && !validRelatedTypes.includes(related_type)) {
      throw new Error(`Invalid related_type: ${related_type}. Must be: ${validRelatedTypes.join(', ')}`);
    }

    // Validate scheduled time
    if (scheduled_at) {
      const scheduledTime = new Date(scheduled_at);
      const now = new Date();
      if (scheduledTime <= now) {
        throw new Error('Scheduled time must be in the future');
      }
    }

    // Calculate priority weight for ordering
    const priorityWeight = this.getPriorityWeight(priority);

    try {
      const now = new Date().toISOString();
      const templateDataJson = template_data ? JSON.stringify(template_data) : null;

      const result = await this.db.query(`
        INSERT INTO ${this.tableName} (
          customer_id, invoice_number, recipient, message, template_id,
          priority, related_type, related_id, scheduled_at, template_data,
          status, priority_weight, retry_count, max_retries, error_message,
          whatsapp_message_id, whatsapp_status, delivery_timestamp,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
        RETURNING id
      `, [
        finalCustomerId,
        finalInvoiceNumber,
        recipient,
        message,
        template_id,
        priority,
        related_type,
        null, // related_id
        scheduled_at,
        templateDataJson,
        scheduled_at ? 'scheduled' : 'pending',
        priorityWeight,
        0,
        3, // max_retries
        null, // error_message
        null, // whatsapp_message_id
        null, // whatsapp_status
        null, // delivery_timestamp
        now,
        now
      ]);

      // Return the created queue entry
      return await this.findById(result.rows[0].id);
    } catch (error) {
      throw new Error(`Failed to add message to queue: ${error.message}`);
    }
  }

  /**
   * Get next message to process
   * @param {number} [limit] - Number of messages to get
   * @returns {Promise<Array>} Array of queue entries
   */
  async getNextMessages(limit = 1) {
    try {
      const now = new Date().toISOString();

      // First, select the IDs of messages to process
      const selectResult = await this.db.query(`
        SELECT id FROM ${this.tableName}
        WHERE status IN ('pending', 'failed')
          AND (scheduled_at IS NULL OR scheduled_at <= $1)
        ORDER BY priority_weight ASC, created_at ASC
        LIMIT $2
      `, [now, limit]);

      if (selectResult.rows.length === 0) {
        return [];
      }

      const messageIds = selectResult.rows.map(m => m.id);
      const placeholders = messageIds.map((_, index) => `$${index + 1}`).join(',');

      // Then update their status
      await this.db.query(`
        UPDATE ${this.tableName}
        SET status = 'processing', updated_at = $${messageIds.length + 1}
        WHERE id IN (${placeholders})
      `, [...messageIds, now]);

      // Finally, fetch the updated records
      const fetchResult = await this.db.query(`
        SELECT * FROM ${this.tableName}
        WHERE id IN (${placeholders})
        ORDER BY priority_weight ASC, created_at ASC
      `, messageIds);

      return fetchResult.rows.map(entry => this.formatQueueEntry(entry));
    } catch (error) {
      throw new Error(`Failed to get next messages: ${error.message}`);
    }
  }

  /**
   * Update queue entry status
   * @param {number} id - Queue entry ID
   * @param {string} status - New status
   * @param {Object} [updateData] - Additional update data
   * @returns {Promise<boolean>} True if updated successfully
   */
  async updateStatus(id, status, updateData = {}) {
    const validStatuses = ['pending', 'processing', 'sent', 'delivered', 'failed', 'expired', 'cancelled'];
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status: ${status}. Must be: ${validStatuses.join(', ')}`);
    }

    try {
      const now = new Date().toISOString();
      let updateFields = 'status = $1, updated_at = $2';
      const updateValues = [status, now];
      let paramIndex = 3;

      // Add timestamp fields based on status
      if (status === 'sent') {
        updateFields += `, sent_at = $${paramIndex++}`;
        updateValues.push(now);
      }

      if (status === 'delivered') {
        updateFields += `, delivered_at = $${paramIndex++}`;
        updateValues.push(now);
      }

      // Add error message if failed
      if (status === 'failed' && updateData.error_message) {
        updateFields += `, error_message = $${paramIndex++}`;
        updateValues.push(updateData.error_message);
      }

      // Add retry count
      if (updateData.retry_count !== undefined) {
        updateFields += `, retry_count = $${paramIndex++}`;
        updateValues.push(updateData.retry_count);
      }

      // Add WhatsApp message ID if provided
      if (updateData.whatsapp_message_id) {
        updateFields += `, whatsapp_message_id = $${paramIndex++}`;
        updateValues.push(updateData.whatsapp_message_id);
      }

      updateValues.push(id);

      const result = await this.db.query(`
        UPDATE ${this.tableName}
        SET ${updateFields}
        WHERE id = $${paramIndex}
      `, updateValues);

      return result.rowCount > 0;
    } catch (error) {
      throw new Error(`Failed to update queue status: ${error.message}`);
    }
  }

  /**
   * Get queue entry by ID
   * @param {number} id - Queue entry ID
   * @returns {Promise<Object|null>} Queue entry or null
   */
  async findById(id) {
    try {
      const entry = await this.db.getOne(this.tableName, { id });

      if (!entry) return null;

      return this.formatQueueEntry(entry);
    } catch (error) {
      throw new Error(`Failed to find queue entry by ID: ${error.message}`);
    }
  }

  /**
   * Get queue entries by status
   * @param {string} status - Queue status
   * @param {Object} [options] - Query options
   * @param {number} [options.limit] - Limit results
   * @param {number} [options.offset] - Offset results
   * @returns {Promise<Array>} Array of queue entries
   */
  async getByStatus(status, options = {}) {
    const { limit = 50, offset = 0 } = options;

    try {
      const result = await this.db.query(`
        SELECT * FROM ${this.tableName}
        WHERE status = $1
        ORDER BY priority_weight ASC, created_at DESC
        LIMIT $2 OFFSET $3
      `, [status, limit, offset]);

      return result.rows.map(entry => this.formatQueueEntry(entry));
    } catch (error) {
      throw new Error(`Failed to get queue entries by status: ${error.message}`);
    }
  }

  /**
   * Get queue entries by customer
   * @param {number} customerId - Customer ID
   * @param {Object} [options] - Query options
   * @returns {Promise<Array>} Array of queue entries
   */
  async getByCustomer(customerId, options = {}) {
    const {
      limit = 50,
      offset = 0,
      status = null
    } = options;

    try {
      let query = `
        SELECT * FROM ${this.tableName}
        WHERE customer_id = $1
      `;
      const params = [customerId];
      let paramIndex = 2;

      if (status) {
        query += ` AND status = $${paramIndex++}`;
        params.push(status);
      }

      query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
      params.push(limit, offset);

      const result = await this.db.query(query, params);

      return result.rows.map(entry => this.formatQueueEntry(entry));
    } catch (error) {
      throw new Error(`Failed to get queue entries by customer: ${error.message}`);
    }
  }

  /**
   * Get queue statistics (alias for getStatistics)
   * @returns {Promise<Object>} Queue statistics
   */
  async getStats() {
    return await this.getStatistics();
  }

  /**
   * Get queue statistics
   * @returns {Promise<Object>} Queue statistics
   */
  async getStatistics() {
    try {
      const result = await this.db.query(`
        SELECT
          status,
          COUNT(*) as count,
          priority,
          COUNT(*) as priority_count
        FROM ${this.tableName}
        GROUP BY status, priority
        ORDER BY status, priority
      `);

      // Calculate totals
      const stats = {
        total: 0,
        by_status: {},
        by_priority: {},
        details: result.rows
      };

      result.rows.forEach(row => {
        stats.total += row.count;
        stats.by_status[row.status] = (stats.by_status[row.status] || 0) + row.count;
        stats.by_priority[row.priority] = (stats.by_priority[row.priority] || 0) + row.count;
      });

      // Get oldest and newest queue times
      const timeStatsQuery = `
        SELECT
          MIN(created_at) as oldest_entry,
          MAX(created_at) as newest_entry,
          COUNT(*) as total_entries
        FROM ${this.tableName}
      `;
      const timeStats = await this.db.query(timeStatsQuery);

      stats.oldest_entry = timeStats.rows[0].oldest_entry;
      stats.newest_entry = timeStats.rows[0].newest_entry;

      // Get next retry time for failed messages
      const retryStatsQuery = `
        SELECT MIN(scheduled_at) as next_retry
        FROM ${this.tableName}
        WHERE status = 'failed' AND retry_count < 3
      `;
      const retryStats = await this.db.query(retryStatsQuery);

      stats.next_retry = retryStats.rows[0].next_retry;

      return stats;
    } catch (error) {
      throw new Error(`Failed to get queue statistics: ${error.message}`);
    }
  }

  /**
   * Get failed messages that can be retried
   * @param {number} [maxRetries] - Maximum retry attempts
   * @returns {Promise<Array>} Array of failed messages ready for retry
   */
  async getRetryableMessages(maxRetries = 3) {
    try {
      const now = new Date().toISOString();

      const result = await this.db.query(`
        SELECT * FROM ${this.tableName}
        WHERE status = 'failed'
          AND retry_count < $1
          AND (scheduled_at IS NULL OR scheduled_at <= $2)
        ORDER BY priority_weight ASC, created_at ASC
      `, [maxRetries, now]);

      return result.rows.map(entry => this.formatQueueEntry(entry));
    } catch (error) {
      throw new Error(`Failed to get retryable messages: ${error.message}`);
    }
  }

  /**
   * Get expired messages
   * @param {number} hoursOld - Hours after which messages are considered expired
   * @returns {Promise<Array>} Array of expired messages
   */
  async getExpiredMessages(hoursOld = 24) {
    try {
      const expiryTime = new Date(Date.now() - hoursOld * 60 * 60 * 1000).toISOString();

      const result = await this.db.query(`
        SELECT * FROM ${this.tableName}
        WHERE status IN ('pending', 'processing')
          AND created_at < $1
          AND (scheduled_at IS NULL OR scheduled_at < $2)
        ORDER BY created_at ASC
      `, [expiryTime, expiryTime]);

      return result.rows.map(entry => this.formatQueueEntry(entry));
    } catch (error) {
      throw new Error(`Failed to get expired messages: ${error.message}`);
    }
  }

  /**
   * Mark messages as expired
   * @param {Array} messageIds - Array of message IDs to expire
   * @returns {Promise<number>} Number of messages marked as expired
   */
  async markAsExpired(messageIds) {
    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return 0;
    }

    try {
      const placeholders = messageIds.map((_, index) => `$${index + 2}`).join(',');

      const result = await this.db.query(`
        UPDATE ${this.tableName}
        SET status = 'expired', updated_at = $1
        WHERE id IN (${placeholders})
      `, [new Date().toISOString(), ...messageIds]);

      return result.rowCount;
    } catch (error) {
      throw new Error(`Failed to mark messages as expired: ${error.message}`);
    }
  }

  /**
   * Schedule retry for failed message
   * @param {number} id - Queue entry ID
   * @param {number} [delayMinutes] - Delay before retry (default: exponential backoff)
   * @returns {Promise<boolean>} True if scheduled successfully
   */
  async scheduleRetry(id, delayMinutes = null) {
    try {
      const entry = await this.findById(id);
      if (!entry) {
        throw new Error('Queue entry not found');
      }

      if (entry.status !== 'failed') {
        throw new Error('Can only retry failed messages');
      }

      if (entry.retry_count >= 3) {
        throw new Error('Maximum retry attempts reached');
      }

      // Calculate retry delay (exponential backoff)
      const retryDelay = delayMinutes || Math.pow(2, entry.retry_count) * 5; // 5, 10, 20 minutes
      const scheduledAt = new Date(Date.now() + retryDelay * 60 * 1000).toISOString();

      const result = await this.db.query(`
        UPDATE ${this.tableName}
        SET status = 'pending',
            scheduled_at = $1,
            retry_count = retry_count + 1,
            error_message = NULL,
            updated_at = $2
        WHERE id = $3
      `, [
        scheduledAt,
        new Date().toISOString(),
        id
      ]);

      return result.rowCount > 0;
    } catch (error) {
      throw new Error(`Failed to schedule retry: ${error.message}`);
    }
  }

  /**
   * Clear queue entries by status and time
   * @param {Object} [options] - Clear options
   * @param {string} [options.status] - Status to clear (pending, failed, expired)
   * @param {string} [options.older_than] - Clear entries older than this time
   * @returns {Promise<number>} Number of cleared entries
   */
  async clearQueue(options = {}) {
    const { status = null, older_than = null } = options;

    try {
      let query = `DELETE FROM ${this.tableName}`;
      const params = [];
      const conditions = [];
      let paramIndex = 1;

      if (status) {
        conditions.push(`status = $${paramIndex++}`);
        params.push(status);
      }

      if (older_than) {
        conditions.push(`created_at < $${paramIndex++}`);
        params.push(older_than);
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      const result = await this.db.query(query, params);

      return result.rowCount;
    } catch (error) {
      throw new Error(`Failed to clear queue: ${error.message}`);
    }
  }

  /**
   * Get priority weight for ordering
   * @param {string} priority - Priority level
   * @returns {number} Priority weight
   */
  getPriorityWeight(priority) {
    const weights = {
      high: 1,
      normal: 2,
      low: 3
    };

    return weights[priority] || 2;
  }

  /**
   * Validate phone number format
   * @param {string} phoneNumber - Phone number to validate
   * @returns {boolean} True if valid
   */
  isValidPhoneNumber(phoneNumber) {
    // Support multiple formats:
    // 1. International format: +6281234567890
    // 2. WhatsApp format: 6281234567890@s.whatsapp.net
    // 3. Local format with country code: 6281234567890
    const internationalRegex = /^\+\d{10,15}$/;
    const whatsappRegex = /^\d{10,15}@s\.whatsapp\.net$/;
    const localRegex = /^\d{10,15}$/;

    return internationalRegex.test(phoneNumber) ||
           whatsappRegex.test(phoneNumber) ||
           localRegex.test(phoneNumber);
  }

  /**
   * Format queue entry for API response
   * @param {Object} entry - Raw queue entry data
   * @returns {Object} Formatted queue entry
   */
  formatQueueEntry(entry) {
    return {
      id: entry.id,
      customer_id: entry.customer_id,
      invoice_number: entry.invoice_number,
      recipient: entry.recipient,
      message: entry.message,
      template_id: entry.template_id,
      priority: entry.priority,
      related_type: entry.related_type,
      scheduled_at: entry.scheduled_at,
      template_data: entry.template_data ? JSON.parse(entry.template_data) : null,
      status: entry.status,
      priority_weight: entry.priority_weight,
      retry_count: entry.retry_count,
      error_message: entry.error_message,
      whatsapp_message_id: entry.whatsapp_message_id,
      sent_at: entry.sent_at,
      delivered_at: entry.delivered_at,
      created_at: entry.created_at,
      updated_at: entry.updated_at
    };
  }
}

module.exports = NotificationQueue;