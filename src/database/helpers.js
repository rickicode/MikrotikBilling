/**
 * Global Database Helper Functions - FIXED VERSION
 * Provides convenient access to database operations throughout the application
 * This version bypasses the problematic GlobalQuery for critical operations
 */

const { db } = require('./DatabaseManager');

/**
 * Authentication and User Management Helpers - Fixed Version
 */
class AuthHelper {
  /**
   * Find admin user by username - Fixed to use direct database query
   */
  static async findAdminByUsername(username) {
    try {
      // Use direct database query to avoid GlobalQuery issues
      const result = await db.query(
        'SELECT * FROM admin_users WHERE username = ? LIMIT 1',
        [username]
      );

      // Handle different database result formats
      let admin = null;
      if (Array.isArray(result)) {
        // Array format (direct SQLite results)
        admin = result.length > 0 ? result[0] : null;
      } else if (result && typeof result === 'object') {
        if (result.rows && Array.isArray(result.rows)) {
          // PostgreSQL-style format with rows property
          admin = result.rows.length > 0 ? result.rows[0] : null;
        } else {
          // Single object format
          admin = result;
        }
      }

      return admin;
    } catch (error) {
      console.error('Error finding admin by username:', error);
      throw error;
    }
  }

  /**
   * Create admin user
   */
  static async createAdmin(adminData) {
    try {
      const keys = Object.keys(adminData);
      const values = Object.values(adminData);
      const placeholders = keys.map(() => '?').join(', ');

      const sql = `INSERT INTO admin_users (${keys.join(', ')}) VALUES (${placeholders})`;

      const result = await db.query(sql, values);
      return result;
    } catch (error) {
      console.error('Error creating admin:', error);
      throw error;
    }
  }

  /**
   * Update admin last login
   */
  static async updateAdminLastLogin(adminId) {
    try {
      const result = await db.query(
        'UPDATE admin_users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
        [adminId]
      );
      return result;
    } catch (error) {
      console.error('Error updating admin last login:', error);
      throw error;
    }
  }

  /**
   * Verify admin password using admin object (more efficient)
   */
  static async verifyAdminPasswordWithObject(admin, password) {
    try {
      if (!admin) {
        return null;
      }

      const bcrypt = require('bcrypt');

      // Try both password_hash and password field names
      const storedHash = admin.password_hash || admin.password;

      // Check if stored password is a bcrypt hash (starts with $2a$, $2b$, etc)
      if (storedHash && storedHash.startsWith('$2')) {
        try {
          // Try bcrypt comparison (for hashed passwords)
          const isValid = await bcrypt.compare(password, storedHash);
          return isValid ? admin : null;
        } catch (bcryptError) {
          console.error('Bcrypt comparison failed:', bcryptError);
          return null;
        }
      } else {
        // Direct string comparison (for plain text passwords)
        const isValid = password === storedHash;
        return isValid ? admin : null;
      }
    } catch (error) {
      console.error('Error verifying admin password:', error);
      throw error;
    }
  }

  /**
   * Verify admin password by username (for backward compatibility)
   */
  static async verifyAdminPassword(username, password) {
    try {
      const admin = await this.findAdminByUsername(username);
      return await this.verifyAdminPasswordWithObject(admin, password);
    } catch (error) {
      console.error('Error verifying admin password:', error);
      throw error;
    }
  }

  /**
   * Create session for admin
   */
  static async createAdminSession(adminId, sessionId, expiresAt) {
    try {
      const result = await db.query(
        'INSERT INTO user_sessions (user_id, session_token, ip_address, user_agent, expires_at) VALUES (?, ?, ?, ?, ?)',
        [adminId, sessionId, null, null, expiresAt]
      );
      return result;
    } catch (error) {
      console.error('Error creating admin session:', error);
      throw error;
    }
  }

  /**
   * Find admin by session ID
   */
  static async findAdminBySession(sessionId) {
    try {
      // Use raw query to handle date comparison for both SQLite and PostgreSQL
      let session;
      if (db.dbType === 'pg') {
        const result = await db.query(
          'SELECT * FROM user_sessions WHERE session_token = $1 AND expires_at > NOW()',
          [sessionId]
        );
        session = Array.isArray(result) ? result[0] : result;
      } else {
        // For SQLite, get session and check expiration manually
        const result = await db.query(
          'SELECT * FROM user_sessions WHERE session_token = ?',
          [sessionId]
        );
        session = Array.isArray(result) ? result[0] : result;

        // Check expiration manually for SQLite
        if (session && new Date(session.expires_at) <= new Date()) {
          await db.query('DELETE FROM user_sessions WHERE id = ?', [session.id]);
          session = null;
        }
      }

      if (!session) {
        return null;
      }

      // Find admin by user_id
      const adminResult = await db.query(
        'SELECT * FROM admin_users WHERE id = ? LIMIT 1',
        [session.user_id]
      );

      return Array.isArray(adminResult) ? adminResult[0] : adminResult;
    } catch (error) {
      console.error('Error finding admin by session:', error);
      throw error;
    }
  }

  /**
   * Clean expired sessions
   */
  static async cleanExpiredSessions() {
    try {
      // For PostgreSQL, we can use raw query with NOW()
      if (db.dbType === 'pg') {
        return await db.query('DELETE FROM user_sessions WHERE expires_at <= NOW()');
      } else {
        // For SQLite, we need to handle it differently
        const sessions = await db.query('SELECT * FROM user_sessions');
        const expiredSessions = sessions.filter(session =>
          new Date(session.expires_at) <= new Date()
        );

        if (expiredSessions.length > 0) {
          const expiredIds = expiredSessions.map(s => s.id);
          const placeholders = expiredIds.map(() => '?').join(',');
          return await db.query(
            `DELETE FROM user_sessions WHERE id IN (${placeholders})`,
            expiredIds
          );
        }

        return { rowCount: 0 };
      }
    } catch (error) {
      console.error('Error cleaning expired sessions:', error);
      throw error;
    }
  }
}

/**
 * Customer Management Helpers
 */
class CustomerHelper {
  /**
   * Find customer by ID or email
   */
  static async findCustomer(identifier) {
    try {
      let where;
      if (typeof identifier === 'number') {
        where = { id: identifier };
      } else if (typeof identifier === 'string') {
        // Check if it's an email or phone number
        where = identifier.includes('@')
          ? { email: identifier }
          : { phone: identifier };
      }

      const keys = Object.keys(where);
      const values = Object.values(where);
      const whereClause = keys.map(key => `${key} = ?`).join(' AND ');

      const result = await db.query(
        `SELECT * FROM customers WHERE ${whereClause} LIMIT 1`,
        values
      );

      return Array.isArray(result) ? result[0] : result;
    } catch (error) {
      console.error('Error finding customer:', error);
      throw error;
    }
  }

  /**
   * Create new customer
   */
  static async createCustomer(customerData) {
    try {
      const keys = Object.keys({
        ...customerData,
        created_at: new Date(),
        updated_at: new Date(),
        balance: 0,
        debt: 0
      });
      const values = Object.values({
        ...customerData,
        created_at: new Date(),
        updated_at: new Date(),
        balance: 0,
        debt: 0
      });
      const placeholders = keys.map(() => '?').join(', ');

      const sql = `INSERT INTO customers (${keys.join(', ')}) VALUES (${placeholders})`;

      const result = await db.query(sql, values);
      return result;
    } catch (error) {
      console.error('Error creating customer:', error);
      throw error;
    }
  }

  /**
   * Update customer balance
   */
  static async updateCustomerBalance(customerId, amount, type = 'add') {
    try {
      const customer = await this.findCustomer(customerId);
      if (!customer) {
        throw new Error('Customer not found');
      }

      let updateField, updateValue;
      if (type === 'add') {
        updateField = 'balance';
        updateValue = customer.balance + amount;
      } else if (type === 'subtract') {
        updateField = 'balance';
        updateValue = customer.balance - amount;
      } else if (type === 'add_debt') {
        updateField = 'debt';
        updateValue = customer.debt + amount;
      } else if (type === 'pay_debt') {
        updateField = 'debt';
        updateValue = Math.max(0, customer.debt - amount);
      }

      const result = await db.query(
        `UPDATE customers SET ${updateField} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [updateValue, customerId]
      );

      return result;
    } catch (error) {
      console.error('Error updating customer balance:', error);
      throw error;
    }
  }

  /**
   * Get customer statistics
   */
  static async getCustomerStats(customerId) {
    try {
      const customer = await this.findCustomer(customerId);
      if (!customer) {
        return null;
      }

      // Get active subscriptions count
      const activeSubscriptionsResult = await db.query(
        'SELECT COUNT(*) as count FROM subscriptions WHERE customer_id = ? AND status = ?',
        [customerId, 'active']
      );
      const activeSubscriptions = Array.isArray(activeSubscriptionsResult)
        ? activeSubscriptionsResult[0]?.count || 0
        : activeSubscriptionsResult?.count || 0;

      // Get total payments
      const totalPaymentsResult = await db.query(
        'SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE customer_id = ?',
        [customerId]
      );
      const totalPayments = Array.isArray(totalPaymentsResult)
        ? parseFloat(totalPaymentsResult[0]?.total || 0)
        : parseFloat(totalPaymentsResult?.total || 0);

      return {
        customer,
        active_subscriptions: activeSubscriptions,
        total_payments: totalPayments
      };
    } catch (error) {
      console.error('Error getting customer stats:', error);
      throw error;
    }
  }
}

/**
 * Error Handling Helper
 */
class DatabaseErrorHelper {
  /**
   * Check if error is connection-related
   */
  static isConnectionError(error) {
    const connectionErrorPatterns = [
      'ECONNREFUSED',
      'ENOTFOUND',
      'ETIMEDOUT',
      'XX000',
      'connection terminated',
      'db_termination',
      'connection closed',
      'timeout',
      'pool is full',
      'acquire connection',
      'SQLITE_CANTOPEN',
      'SQLITE_BUSY'
    ];

    return connectionErrorPatterns.some(pattern =>
      error.code === pattern ||
      error.message.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  /**
   * Get user-friendly error message
   */
  static getErrorMessage(error) {
    if (this.isConnectionError(error)) {
      return 'Database connection error. Please try again in a moment.';
    }

    switch (error.code) {
      case '23505': // PostgreSQL unique violation
        return 'Data already exists. Please check your input.';
      case '23503': // PostgreSQL foreign key violation
        return 'Referenced data not found.';
      case '23502': // PostgreSQL not null violation
        return 'Required field is missing.';
      case '23514': // PostgreSQL check violation
        return 'Invalid data provided.';
      default:
        return 'Database error. Please contact administrator.';
    }
  }

  /**
   * Log error with context
   */
  static logError(error, context = {}) {
    console.error('Database operation error:', {
      message: error.message,
      code: error.code,
      severity: error.severity,
      detail: error.detail,
      hint: error.hint,
      context,
      database: db.dbType,
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = {
  AuthHelper,
  CustomerHelper,
  DatabaseErrorHelper,

  // Convenience exports
  auth: AuthHelper,
  customer: CustomerHelper,
  error: DatabaseErrorHelper
};