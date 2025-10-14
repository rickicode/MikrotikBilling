/**
 * WhatsApp Message Model
 *
 * Handles all database operations for WhatsApp messages
 * including storing sent messages, status updates, and delivery tracking.
 */

const BaseModel = require('./BaseModel');

class WhatsAppMessage extends BaseModel {
  constructor() {
    super('whatsapp_messages');
  }

  /**
   * Create a new WhatsApp message record
   * @param {Object} messageData - Message data
   * @param {string} messageData.chat_id - WhatsApp chat ID (format: 6281234567890@s.whatsapp.net)
   * @param {string} messageData.content - Message content
   * @param {string} [messageData.message_type] - Message type (outgoing/incoming)
   * @param {string} [messageData.status] - Message status
   * @param {number} [messageData.related_id] - Related entity ID
   * @param {string} [messageData.related_type] - Related entity type
   * @param {number} [messageData.template_id] - Template ID used
   * @param {Date} [messageData.scheduled_at] - Schedule for delayed sending
   * @returns {Promise<Object>} Created message record
   */
  async create(messageData) {
    const {
      chat_id,
      content,
      message_type = 'outgoing',
      status = 'pending',
      related_id = null,
      related_type = null,
      template_id = null,
      scheduled_at = null
    } = messageData;

    // Validate required fields
    if (!chat_id || !content) {
      throw new Error('Missing required fields: chat_id, content');
    }

    // Validate chat_id format (WhatsApp format)
    if (!this.isValidChatId(chat_id)) {
      throw new Error('Invalid chat_id format. Expected format: 6281234567890@s.whatsapp.net');
    }

    // Validate message type
    const validTypes = ['outgoing', 'incoming'];
    if (!validTypes.includes(message_type)) {
      throw new Error(`Invalid message type: ${message_type}. Must be: ${validTypes.join(', ')}`);
    }

    // Validate status
    const validStatuses = ['pending', 'scheduled', 'sent', 'delivered', 'read', 'failed'];
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status: ${status}. Must be: ${validStatuses.join(', ')}`);
    }

    // Validate related_type if provided
    if (related_type) {
      const validRelatedTypes = ['customer', 'voucher', 'payment', 'subscription', 'general'];
      if (!validRelatedTypes.includes(related_type)) {
        throw new Error(`Invalid related_type: ${related_type}. Must be: ${validRelatedTypes.join(', ')}`);
      }
    }

    // Generate unique WhatsApp message ID
    const message_id = this.generateMessageId();

    try {
      const result = await this.db.query(`
        INSERT INTO ${this.tableName} (
          message_id, chat_id, content, message_type, status,
          related_id, related_type, template_id, scheduled_at,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id
      `, [
        message_id,
        chat_id,
        content,
        message_type,
        status,
        related_id,
        related_type,
        template_id,
        scheduled_at ? scheduled_at.toISOString() : null,
        new Date().toISOString()
      ]);

      // Return the created message
      return await this.findById(result.rows[0].id);
    } catch (error) {
      throw new Error(`Failed to create WhatsApp message: ${error.message}`);
    }
  }

  /**
   * Find message by ID
   * @param {number} id - Message ID
   * @returns {Promise<Object|null>} Message record or null
   */
  async findById(id) {
    try {
      const message = await this.db.getOne(this.tableName, { id });

      if (!message) return null;

      // Add calculated fields
      return this.formatMessage(message);
    } catch (error) {
      throw new Error(`Failed to find message by ID: ${error.message}`);
    }
  }

  /**
   * Find message by WhatsApp message ID
   * @param {string} messageId - WhatsApp message ID
   * @returns {Promise<Object|null>} Message record or null
   */
  async findByMessageId(messageId) {
    try {
      const message = await this.db.getOne(this.tableName, { message_id: messageId });

      if (!message) return null;

      return this.formatMessage(message);
    } catch (error) {
      throw new Error(`Failed to find message by message_id: ${error.message}`);
    }
  }

  /**
   * Update message status
   * @param {number} id - Message ID
   * @param {string} status - New status
   * @param {Object} [updateData] - Additional update data
   * @returns {Promise<boolean>} True if updated successfully
   */
  async updateStatus(id, status, updateData = {}) {
    const validStatuses = ['pending', 'sent', 'delivered', 'read', 'failed'];
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status: ${status}. Must be: ${validStatuses.join(', ')}`);
    }

    try {
      const now = new Date().toISOString();
      let updateFields = 'status = $1, updated_at = $2';
      const updateValues = [status, now];
      let paramIndex = 3;

      // Add timestamp fields based on status
      if (status === 'sent' && !updateData.sent_at) {
        updateFields += `, sent_at = $${paramIndex++}`;
        updateValues.push(now);
      }

      if (status === 'delivered' && !updateData.delivered_at) {
        updateFields += `, delivered_at = $${paramIndex++}`;
        updateValues.push(now);
      }

      if (status === 'read' && !updateData.read_at) {
        updateFields += `, read_at = $${paramIndex++}`;
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

      updateValues.push(id);

      const result = await this.db.query(`
        UPDATE ${this.tableName}
        SET ${updateFields}
        WHERE id = $${paramIndex}
      `, updateValues);

      return result.rowCount > 0;
    } catch (error) {
      throw new Error(`Failed to update message status: ${error.message}`);
    }
  }

  /**
   * Get messages by chat ID
   * @param {string} chatId - WhatsApp chat ID
   * @param {Object} [options] - Query options
   * @param {number} [options.limit] - Limit results
   * @param {number} [options.offset] - Offset results
   * @param {string} [options.status] - Filter by status
   * @param {string} [options.message_type] - Filter by message type
   * @returns {Promise<Array>} Array of messages
   */
  async getByChatId(chatId, options = {}) {
    const {
      limit = 50,
      offset = 0,
      status = null,
      message_type = null
    } = options;

    try {
      let query = `
        SELECT * FROM ${this.tableName}
        WHERE chat_id = $1
      `;
      const params = [chatId];
      let paramIndex = 2;

      if (status) {
        query += ` AND status = $${paramIndex++}`;
        params.push(status);
      }

      if (message_type) {
        query += ` AND message_type = $${paramIndex++}`;
        params.push(message_type);
      }

      query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
      params.push(limit, offset);

      const result = await this.db.query(query, params);

      return result.rows.map(message => this.formatMessage(message));
    } catch (error) {
      throw new Error(`Failed to get messages by chat ID: ${error.message}`);
    }
  }

  /**
   * Get messages by recipient (legacy support)
   * @param {string} phoneNumber - Recipient phone number
   * @param {Object} [options] - Query options
   * @returns {Promise<Array>} Array of messages
   */
  async getByRecipient(phoneNumber, options = {}) {
    // Convert phone number to chat ID format and use getByChatId
    const chatId = this.formatPhoneNumberToChatId(phoneNumber);
    return this.getByChatId(chatId, options);
  }

  /**
   * Get messages by related entity
   * @param {number} relatedId - Related entity ID
   * @param {string} relatedType - Related entity type
   * @param {Object} [options] - Query options
   * @returns {Promise<Array>} Array of messages
   */
  async getByRelatedEntity(relatedId, relatedType, options = {}) {
    const { limit = 50, offset = 0 } = options;

    try {
      const result = await this.db.query(`
        SELECT * FROM ${this.tableName}
        WHERE related_id = $1 AND related_type = $2
        ORDER BY timestamp DESC
        LIMIT $3 OFFSET $4
      `, [relatedId, relatedType, limit, offset]);

      return result.rows.map(message => this.formatMessage(message));
    } catch (error) {
      throw new Error(`Failed to get messages by related entity: ${error.message}`);
    }
  }

  /**
   * Get messages with pagination and filtering
   * @param {Object} [filters] - Filter options
   * @param {string} [filters.status] - Filter by status
   * @param {string} [filters.recipient] - Filter by recipient
   * @param {string} [filters.date_from] - Filter from date
   * @param {string} [filters.date_to] - Filter to date
   * @param {string} [filters.related_type] - Filter by related type
   * @param {Object} [pagination] - Pagination options
   * @param {number} [pagination.page] - Page number (default: 1)
   * @param {number} [pagination.limit] - Items per page (default: 50)
   * @returns {Promise<Object>} Paginated results
   */
  async getAll(filters = {}, pagination = {}) {
    const {
      status = null,
      recipient = null,
      date_from = null,
      date_to = null,
      related_type = null
    } = filters;

    const {
      page = 1,
      limit = 50
    } = pagination;

    const offset = (page - 1) * limit;

    try {
      // Build WHERE clause
      let whereClause = 'WHERE 1=1';
      const params = [];
      let paramIndex = 1;

      if (status) {
        whereClause += ` AND status = $${paramIndex++}`;
        params.push(status);
      }

      if (recipient) {
        whereClause += ` AND (from_number = $${paramIndex++} OR to_number = $${paramIndex++})`;
        params.push(recipient, recipient);
      }

      if (date_from) {
        whereClause += ` AND DATE(timestamp) >= DATE($${paramIndex++})`;
        params.push(date_from);
      }

      if (date_to) {
        whereClause += ` AND DATE(timestamp) <= DATE($${paramIndex++})`;
        params.push(date_to);
      }

      if (related_type) {
        whereClause += ` AND related_type = $${paramIndex++}`;
        params.push(related_type);
      }

      // Get total count - build custom query for count
      const countQuery = `SELECT COUNT(*) as total FROM ${this.tableName} ${whereClause}`;
      const countResult = await this.db.query(countQuery, params);
      const total = countResult.rows[0].total;

      // Get paginated results
      whereClause += ` ORDER BY timestamp DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
      params.push(limit, offset);

      const dataResult = await this.db.query(`
        SELECT * FROM ${this.tableName}
        ${whereClause}
      `, params);

      const formattedMessages = dataResult.rows.map(message => this.formatMessage(message));

      return {
        data: formattedMessages,
        pagination: {
          page,
          limit,
          total,
          total_pages: Math.ceil(total / limit),
          has_next: page * limit < total,
          has_prev: page > 1
        }
      };
    } catch (error) {
      throw new Error(`Failed to get messages: ${error.message}`);
    }
  }

  /**
   * Increment retry count for a message
   * @param {number} id - Message ID
   * @returns {Promise<boolean>} True if updated successfully
   */
  async incrementRetryCount(id) {
    try {
      const result = await this.db.query(`
        UPDATE ${this.tableName}
        SET retry_count = retry_count + 1, updated_at = $1
        WHERE id = $2
      `, [new Date().toISOString(), id]);

      return result.rowCount > 0;
    } catch (error) {
      throw new Error(`Failed to increment retry count: ${error.message}`);
    }
  }

  /**
   * Get message statistics
   * @param {Object} [filters] - Filter options
   * @returns {Promise<Object>} Statistics object
   */
  async getStatistics(filters = {}) {
    try {
      let whereClause = 'WHERE 1=1';
      const params = [];
      let paramIndex = 1;

      if (filters.date_from) {
        whereClause += ` AND DATE(timestamp) >= DATE($${paramIndex++})`;
        params.push(filters.date_from);
      }

      if (filters.date_to) {
        whereClause += ` AND DATE(timestamp) <= DATE($${paramIndex++})`;
        params.push(filters.date_to);
      }

      const result = await this.db.query(`
        SELECT
          status,
          COUNT(*) as count,
          DATE(timestamp) as date
        FROM ${this.tableName}
        ${whereClause}
        GROUP BY status, DATE(timestamp)
        ORDER BY date DESC, status
      `, params);

      // Calculate totals by status
      const stats = {
        total: 0,
        by_status: {},
        by_date: {},
        delivery_rate: 0,
        read_rate: 0
      };

      result.rows.forEach(row => {
        stats.total += row.count;
        stats.by_status[row.status] = (stats.by_status[row.status] || 0) + row.count;
        stats.by_date[row.date] = (stats.by_date[row.date] || 0) + row.count;
      });

      // Calculate rates
      const sent = stats.by_status.sent || 0;
      const delivered = stats.by_status.delivered || 0;
      const read = stats.by_status.read || 0;

      if (sent > 0) {
        stats.delivery_rate = (delivered / sent) * 100;
        stats.read_rate = (read / sent) * 100;
      }

      return stats;
    } catch (error) {
      throw new Error(`Failed to get message statistics: ${error.message}`);
    }
  }

  /**
   * Delete old messages (cleanup)
   * @param {number} daysOld - Delete messages older than this many days
   * @returns {Promise<number>} Number of deleted messages
   */
  async deleteOldMessages(daysOld = 90) {
    try {
      const result = await this.db.query(`
        DELETE FROM ${this.tableName}
        WHERE timestamp < NOW() - INTERVAL '${daysOld} days'
      `);

      return result.rowCount;
    } catch (error) {
      throw new Error(`Failed to delete old messages: ${error.message}`);
    }
  }

  /**
   * Generate unique WhatsApp message ID
   * @returns {string} Unique message ID
   */
  generateMessageId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `wa_msg_${timestamp}_${random}`;
  }

  /**
   * Validate phone number format
   * @param {string} phoneNumber - Phone number to validate
   * @returns {boolean} True if valid
   */
  isValidPhoneNumber(phoneNumber) {
    // Handle system number and allow empty/null for testing
    if (!phoneNumber || phoneNumber === 'system' || phoneNumber === 'System') {
      return true;
    }

    // Clean the phone number first
    const cleanNumber = phoneNumber.replace(/[^\d+]/g, '');

    // Basic validation for international format - more flexible
    const phoneRegex = /^\+\d{8,15}$/;
    return phoneRegex.test(cleanNumber);
  }

  /**
   * Format phone number to WhatsApp chat ID
   * @param {string} phoneNumber - Phone number to format
   * @returns {string} WhatsApp chat ID
   */
  formatPhoneNumberToChatId(phoneNumber) {
    if (!phoneNumber) return null;

    // Remove all non-digit characters
    let cleaned = phoneNumber.replace(/\D/g, '');

    // Remove leading 0 and add 62 if needed
    if (cleaned.startsWith('0')) {
      cleaned = '62' + cleaned.substring(1);
    }

    // Add @s.whatsapp.net suffix
    return cleaned + '@s.whatsapp.net';
  }

  /**
   * Format message for API response
   * @param {Object} message - Raw message data
   * @returns {Object} Formatted message
   */
  formatMessage(message) {
    return {
      id: message.id,
      message_id: message.message_id,
      chat_id: message.chat_id,
      from_number: message.from_number,
      to_number: message.to_number,
      message_type: message.message_type,
      content: message.content,
      status: message.status,
      timestamp: message.timestamp,
      created_at: message.created_at,
      scheduled_at: message.scheduled_at,
      sent_at: message.sent_at,
      delivered_at: message.delivered_at,
      read_at: message.read_at,
      expires_at: message.expires_at,
      related_id: message.related_id,
      related_type: message.related_type,
      template_id: message.template_id,
      queue_id: message.queue_id,
      error_message: message.error_message,
      retry_count: message.retry_count || 0,
      updated_at: message.updated_at
    };
  }
}

module.exports = WhatsAppMessage;