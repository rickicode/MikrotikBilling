/**
 * WhatsApp Session Model
 *
 * Handles all database operations for WhatsApp Web JS session management,
 * including session state tracking, QR code management, and connection monitoring.
 */

const BaseModel = require('./BaseModel');

class WhatsAppSession extends BaseModel {
  constructor() {
    super('whatsapp_sessions');
  }

  /**
   * Create a new WhatsApp session
   * @param {Object} sessionData - Session data
   * @param {string} [sessionData.session_name] - Session name (defaults to 'main')
   * @param {string} [sessionData.phone_number] - Connected phone number
   * @param {string} [sessionData.qr_code] - QR code data (base64)
   * @param {Object} [sessionData.session_data] - Serialized session data
   * @returns {Promise<Object>} Created session record
   */
  async create(sessionData = {}) {
    const {
      session_id = null,
      session_name = 'main',
      phone_number = null,
      qr_code = null,
      session_data = null
    } = sessionData;

    try {
      const now = new Date().toISOString();
      const sessionDataJson = session_data ? JSON.stringify(session_data) : null;

      // Generate session_id if not provided
      const finalSessionId = session_id || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const result = await this.db.query(`
        INSERT INTO ${this.tableName} (
          session_id, session_name, phone_number, qr_code, session_data, status, last_activity
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `, [
        finalSessionId,
        session_name,
        phone_number,
        qr_code,
        sessionDataJson,
        'disconnected',
        now
      ]);

      // Return the created session
      return await this.findById(result.rows[0].id);
    } catch (error) {
      throw new Error(`Failed to create WhatsApp session: ${error.message}`);
    }
  }

  /**
   * Find session by ID
   * @param {number} id - Session ID
   * @returns {Promise<Object|null>} Session record or null
   */
  async findById(id) {
    try {
      const result = await this.db.query(`
        SELECT * FROM ${this.tableName} WHERE id = $1
      `, [id]);

      if (!result || result.length === 0) return null;
      const session = result[0];

      return this.formatSession(session);
    } catch (error) {
      throw new Error(`Failed to find session by ID: ${error.message}`);
    }
  }

  /**
   * Find session by session name
   * @param {string} sessionName - Session name
   * @returns {Promise<Object|null>} Session record or null
   */
  async findBySessionName(sessionName) {
    try {
      const result = await this.db.query(`
        SELECT * FROM ${this.tableName} WHERE session_name = $1
      `, [sessionName]);

      if (!result || result.length === 0) return null;
      const session = result[0];

      return this.formatSession(session);
    } catch (error) {
      throw new Error(`Failed to find session by session_name: ${error.message}`);
    }
  }

  /**
   * Find session by phone number
   * @param {string} phoneNumber - Phone number
   * @returns {Promise<Object|null>} Session record or null
   */
  async findByPhoneNumber(phoneNumber) {
    try {
      const result = await this.db.query(`
        SELECT * FROM ${this.tableName}
        WHERE phone_number = $1
        ORDER BY last_activity DESC
        LIMIT 1
      `, [phoneNumber]);

      if (!result || result.length === 0) return null;
      const session = result[0];

      return this.formatSession(session);
    } catch (error) {
      throw new Error(`Failed to find session by phone number: ${error.message}`);
    }
  }

  /**
   * Get active session
   * @returns {Promise<Object|null>} Active session or null
   */
  async getActiveSession() {
    try {
      const result = await this.db.query(`
        SELECT * FROM ${this.tableName}
        WHERE status = 'connected'
        ORDER BY last_activity DESC
        LIMIT 1
      `);

      if (!result || result.length === 0) return null;
      const session = result[0];

      return this.formatSession(session);
    } catch (error) {
      throw new Error(`Failed to get active session: ${error.message}`);
    }
  }

  /**
   * Get all sessions with filtering
   * @param {Object} [filters] - Filter options
   * @param {string} [filters.status] - Filter by connection status
   * @returns {Promise<Array>} Array of sessions
   */
  async getAll(filters = {}) {
    const {
      status = null
    } = filters;

    try {
      let query = `SELECT * FROM ${this.tableName}`;
      const params = [];
      const whereConditions = [];
      let paramIndex = 1;

      if (status) {
        whereConditions.push(`status = $${paramIndex++}`);
        params.push(status);
      }

      if (whereConditions.length > 0) {
        query += ' WHERE ' + whereConditions.join(' AND ');
      }

      query += ' ORDER BY last_activity DESC';

      const result = await this.db.query(query, params);

      return result.map(session => this.formatSession(session));
    } catch (error) {
      throw new Error(`Failed to get sessions: ${error.message}`);
    }
  }

  /**
   * Update session status
   * @param {number} id - Session ID
   * @param {string} status - New status
   * @param {Object} [updateData] - Additional update data
   * @returns {Promise<boolean>} True if updated successfully
   */
  async updateStatus(id, status, updateData = {}) {
    const validStatuses = ['disconnected', 'connecting', 'connected', 'scanning', 'error'];
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status: ${status}. Must be: ${validStatuses.join(', ')}`);
    }

    try {
      const now = new Date().toISOString();
      let updateFields = 'status = $1, last_activity = $2';
      const updateValues = [status, now];
      let paramIndex = 3;

      // Add phone number if provided
      if (updateData.phone_number) {
        updateFields += `, phone_number = $${paramIndex++}`;
        updateValues.push(updateData.phone_number);
      }

      // Add QR code data if provided
      if (updateData.qr_code !== undefined) {
        updateFields += `, qr_code = $${paramIndex++}`;
        updateValues.push(updateData.qr_code);
      }

      // Add session data if provided
      if (updateData.session_data) {
        updateFields += `, session_data = $${paramIndex++}`;
        updateValues.push(JSON.stringify(updateData.session_data));
      }

      updateValues.push(id);

      const result = await this.db.query(`
        UPDATE ${this.tableName}
        SET ${updateFields}
        WHERE id = $${paramIndex}
      `, updateValues);

      return result > 0;
    } catch (error) {
      throw new Error(`Failed to update session status: ${error.message}`);
    }
  }

  /**
   * Deactivate session
   * @param {number} id - Session ID
   * @returns {Promise<boolean>} True if deactivated successfully
   */
  async deactivate(id) {
    return this.updateStatus(id, 'disconnected');
  }

  /**
   * Update QR code for session
   * @param {number} id - Session ID
   * @param {string} qrCode - QR code data (base64)
   * @returns {Promise<boolean>} True if updated successfully
   */
  async updateQRCode(id, qrCode) {
    return this.updateStatus(id, 'scanning', { qr_code: qrCode });
  }


  /**
   * Get session statistics
   * @returns {Promise<Object>} Session statistics
   */
  async getStatistics() {
    try {
      const result = await this.db.query(`
        SELECT
          COUNT(*) as total_sessions,
          COUNT(CASE WHEN status = 'connected' THEN 1 END) as connected_sessions,
          COUNT(CASE WHEN status = 'disconnected' THEN 1 END) as disconnected_sessions,
          COUNT(CASE WHEN status = 'scanning' THEN 1 END) as scanning_sessions,
          COUNT(CASE WHEN status = 'error' THEN 1 END) as error_sessions,
          MAX(last_activity) as last_activity,
          COUNT(CASE WHEN phone_number IS NOT NULL THEN 1 END) as authenticated_sessions
        FROM ${this.tableName}
      `);

      const stats = result[0];

      // Get breakdown by status
      const statusResult = await this.db.query(`
        SELECT status, COUNT(*) as count
        FROM ${this.tableName}
        GROUP BY status
      `);

      const byStatus = statusResult;

      return {
        ...stats,
        by_status: byStatus,
        connection_rate: stats.total_sessions > 0 ? (stats.connected_sessions / stats.total_sessions) * 100 : 0
      };
    } catch (error) {
      throw new Error(`Failed to get session statistics: ${error.message}`);
    }
  }

  /**
   * Clean up old sessions
   * @param {number} daysOld - Remove sessions older than this many days
   * @returns {Promise<number>} Number of cleaned up sessions
   */
  async cleanupOldSessions(daysOld = 7) {
    try {
      const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();

      const result = await this.db.query(`
        DELETE FROM ${this.tableName}
        WHERE last_activity < $1
          AND status IN ('disconnected', 'error')
      `, [cutoffDate]);

      return result;
    } catch (error) {
      throw new Error(`Failed to cleanup old sessions: ${error.message}`);
    }
  }

  /**
   * Format session for API response
   * @param {Object} session - Raw session data
   * @returns {Object} Formatted session
   */
  formatSession(session) {
    return {
      id: session.id,
      session_id: session.session_id,
      session_name: session.session_name,
      phone_number: session.phone_number,
      qr_code: session.qr_code,
      session_data: session.session_data ? JSON.parse(session.session_data) : null,
      status: session.status,
      last_activity: session.last_activity,
      created_at: session.created_at,
      updated_at: session.updated_at
    };
  }
}

module.exports = WhatsAppSession;