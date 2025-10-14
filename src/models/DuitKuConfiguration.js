const BaseModel = require('./BaseModel');

class DuitKuConfiguration extends BaseModel {
  constructor() {
    super('duitku_configurations');
  }

  /**
   * Get current DuitKu configuration
   * @returns {Object|null} Current configuration or null
   */
  async getCurrent() {
    const result = await this.db.query(`
      SELECT * FROM duitku_configurations
      WHERE enabled = TRUE
      ORDER BY created_date DESC
      LIMIT 1
    `);

    const config = result.rows[0];

    // Don't return sensitive data in full
    if (config) {
      return {
        ...config,
        api_key: config.api_key ? '***MASKED***' : null
      };
    }
    return null;
  }

  /**
   * Get DuitKu configuration with API key (for internal use)
   * @param {number} id - Configuration ID
   * @returns {Object|null} Configuration with API key or null
   */
  async getWithApiKey(id) {
    const result = await this.db.query(`
      SELECT * FROM duitku_configurations WHERE id = $1
    `, [id]);

    return result.rows[0];
  }

  /**
   * Create new DuitKu configuration
   * @param {Object} configData - Configuration data
   * @param {string} configData.merchantCode - DuitKu merchant code
   * @param {string} configData.apiKey - DuitKu API key
   * @param {string} [configData.environment='sandbox'] - Environment (sandbox/production)
   * @param {string} [configData.callbackUrl] - Callback URL
   * @param {number} [configData.expiryHours=24] - Default expiry hours
   * @param {number} [configData.maxRegenerations=3] - Maximum regenerations allowed
   * @returns {Object} Created configuration with ID
   */
  async create(configData) {
    const {
      merchantCode,
      apiKey,
      environment = 'sandbox',
      callbackUrl = null,
      expiryHours = 24,
      maxRegenerations = 3
    } = configData;

    const result = await this.db.query(`
      INSERT INTO duitku_configurations (
        merchant_code, api_key, environment, callback_url,
        expiry_hours, max_regenerations, enabled, created_date, updated_date
      ) VALUES ($1, $2, $3, $4, $5, $6, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id
    `, [
      merchantCode,
      apiKey,
      environment,
      callbackUrl,
      expiryHours,
      maxRegenerations
    ]);

    return this.findById(result.rows[0].id);
  }

  /**
   * Find configuration by ID
   * @param {number} id - Configuration ID
   * @returns {Object|null} Configuration or null
   */
  async findById(id) {
    const result = await this.db.query(`
      SELECT * FROM duitku_configurations WHERE id = $1
    `, [id]);

    const config = result.rows[0];

    // Mask API key for security
    if (config && config.api_key) {
      config.api_key = '***MASKED***';
    }

    return config;
  }

  /**
   * Update configuration
   * @param {number} id - Configuration ID
   * @param {Object} updateData - Data to update
   * @returns {Object|null} Updated configuration or null
   */
  async update(id, updateData) {
    const {
      merchantCode,
      apiKey,
      environment,
      callbackUrl,
      expiryHours,
      maxRegenerations,
      enabled
    } = updateData;

    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (merchantCode !== undefined) {
      updates.push(`merchant_code = $${paramIndex++}`);
      params.push(merchantCode);
    }

    if (apiKey !== undefined) {
      updates.push(`api_key = $${paramIndex++}`);
      params.push(apiKey);
    }

    if (environment !== undefined) {
      updates.push(`environment = $${paramIndex++}`);
      params.push(environment);
    }

    if (callbackUrl !== undefined) {
      updates.push(`callback_url = $${paramIndex++}`);
      params.push(callbackUrl);
    }

    if (expiryHours !== undefined) {
      updates.push(`expiry_hours = $${paramIndex++}`);
      params.push(expiryHours);
    }

    if (maxRegenerations !== undefined) {
      updates.push(`max_regenerations = $${paramIndex++}`);
      params.push(maxRegenerations);
    }

    if (enabled !== undefined) {
      updates.push(`enabled = $${paramIndex++}`);
      params.push(enabled);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    updates.push(`updated_date = CURRENT_TIMESTAMP`);
    params.push(id);

    const result = await this.db.query(`
      UPDATE duitku_configurations
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
    `, params);

    if (result.rowCount > 0) {
      return this.findById(id);
    }
    return null;
  }

  /**
   * Update API key (sensitive operation)
   * @param {number} id - Configuration ID
   * @param {string} newApiKey - New API key
   * @returns {boolean} True if updated
   */
  async updateApiKey(id, newApiKey) {
    const result = await this.db.query(`
      UPDATE duitku_configurations
      SET api_key = $1, updated_date = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [newApiKey, id]);
    return result.rowCount > 0;
  }

  /**
   * Enable/disable configuration
   * @param {number} id - Configuration ID
   * @param {boolean} enabled - Enable status
   * @returns {boolean} True if updated
   */
  async setEnabled(id, enabled) {
    const result = await this.db.query(`
      UPDATE duitku_configurations
      SET enabled = $1, updated_date = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [enabled, id]);
    return result.rowCount > 0;
  }

  /**
   * Disable all configurations (for switching)
   * @returns {number} Number of disabled configurations
   */
  async disableAll() {
    const result = await this.db.query(`
      UPDATE duitku_configurations
      SET enabled = FALSE, updated_date = CURRENT_TIMESTAMP
    `);

    return result.rowCount;
  }

  /**
   * Get all configurations with pagination
   * @param {Object} options - Query options
   * @param {number} [options.limit=20] - Limit results
   * @param {number} [options.offset=0] - Offset results
   * @param {boolean} [options.includeDisabled=false] - Include disabled configurations
   * @returns {Array} Array of configurations
   */
  async findAll(options = {}) {
    const {
      limit = 20,
      offset = 0,
      includeDisabled = false
    } = options;

    let query = 'SELECT * FROM duitku_configurations';
    const params = [];

    if (!includeDisabled) {
      query += ' WHERE enabled = TRUE';
    }

    query += ` ORDER BY created_date DESC LIMIT $1 OFFSET $2`;
    params.push(limit, offset);

    const result = await this.db.query(query, params);
    const configs = result.rows;

    // Mask API keys for security
    return configs.map(config => ({
      ...config,
      api_key: config.api_key ? '***MASKED***' : null
    }));
  }

  /**
   * Get active configuration for API calls
   * @returns {Object|null} Active configuration with API key or null
   */
  async getActiveForApi() {
    const result = await this.db.query(`
      SELECT * FROM duitku_configurations
      WHERE enabled = TRUE
      ORDER BY created_date DESC
      LIMIT 1
    `);

    return result.rows[0];
  }

  /**
   * Delete configuration
   * @param {number} id - Configuration ID
   * @returns {boolean} True if deleted
   */
  async delete(id) {
    const result = await this.db.query(`
      DELETE FROM duitku_configurations WHERE id = $1
    `, [id]);

    return result.rowCount > 0;
  }

  /**
   * Validate configuration data
   * @param {Object} configData - Configuration data to validate
   * @returns {Object} Validation result with isValid and errors
   */
  validate(configData) {
    const errors = [];

    // Validate merchant code
    if (!configData.merchantCode || configData.merchantCode.trim().length === 0) {
      errors.push('Merchant code is required');
    } else if (configData.merchantCode.length > 50) {
      errors.push('Merchant code must be 50 characters or less');
    }

    // Validate API key
    if (!configData.apiKey || configData.apiKey.trim().length === 0) {
      errors.push('API key is required');
    } else if (configData.apiKey.length > 200) {
      errors.push('API key must be 200 characters or less');
    }

    // Validate environment
    if (configData.environment && !['sandbox', 'production'].includes(configData.environment)) {
      errors.push('Environment must be either "sandbox" or "production"');
    }

    // Validate callback URL
    if (configData.callbackUrl && configData.callbackUrl.length > 500) {
      errors.push('Callback URL must be 500 characters or less');
    }

    // Validate expiry hours
    if (configData.expiryHours !== undefined) {
      if (!Number.isInteger(configData.expiryHours) || configData.expiryHours < 1 || configData.expiryHours > 168) {
        errors.push('Expiry hours must be between 1 and 168');
      }
    }

    // Validate max regenerations
    if (configData.maxRegenerations !== undefined) {
      if (!Number.isInteger(configData.maxRegenerations) || configData.maxRegenerations < 1 || configData.maxRegenerations > 10) {
        errors.push('Max regenerations must be between 1 and 10');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Test configuration connectivity
   * @param {number} id - Configuration ID
   * @returns {Object} Test result
   */
  async testConnection(id) {
    const config = await this.getWithApiKey(id);

    if (!config) {
      return {
        success: false,
        error: 'Configuration not found'
      };
    }

    try {
      // This would be implemented to test actual DuitKu API connectivity
      // For now, just validate the configuration format
      const validation = this.validate({
        merchantCode: config.merchant_code,
        apiKey: config.api_key,
        environment: config.environment
      });

      if (!validation.isValid) {
        return {
          success: false,
          error: 'Invalid configuration: ' + validation.errors.join(', ')
        };
      }

      return {
        success: true,
        environment: config.environment,
        message: `Configuration is valid for ${config.environment} environment`
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = DuitKuConfiguration;