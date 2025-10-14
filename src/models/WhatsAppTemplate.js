/**
 * WhatsApp Template Model
 *
 * Handles all database operations for WhatsApp message templates,
 * including template management, variable validation, and usage tracking.
 */

const BaseModel = require('./BaseModel');

class WhatsAppTemplate extends BaseModel {
  constructor() {
    super('whatsapp_templates');
  }

  /**
   * Create a new WhatsApp template
   * @param {Object} templateData - Template data
   * @param {string} templateData.name - Template name (system name, no spaces)
   * @param {string} [templateData.display_name] - Human readable template name
   * @param {string} templateData.message_type - Type of notification
   * @param {string} templateData.template_content - Message template with placeholders
   * @param {Array} [templateData.variables] - Array of variable definitions
   * @param {string} [templateData.category] - Template category
   * @param {boolean} [templateData.is_active] - Whether template is active
   * @returns {Promise<Object>} Created template record
   */
  async create(templateData) {
    const {
      name,
      display_name = null,
      message_type,
      template_content,
      variables = [],
      category = 'notification',
      is_active = true
    } = templateData;

    // Validate required fields
    if (!name || !message_type || !template_content) {
      throw new Error('Missing required fields: name, message_type, template_content');
    }

    // Validate template name format
    if (!this.isValidTemplateName(name)) {
      throw new Error('Invalid template name format. Use lowercase letters, numbers, and underscores only.');
    }

    // Validate message type
    const validMessageTypes = ['expiry_warning', 'payment_reminder', 'welcome', 'system_alert', 'custom'];
    if (!validMessageTypes.includes(message_type)) {
      throw new Error(`Invalid message_type: ${message_type}. Must be: ${validMessageTypes.join(', ')}`);
    }

    // Validate category
    const validCategories = ['notification', 'payment', 'reminder', 'system', 'custom'];
    if (!validCategories.includes(category)) {
      throw new Error(`Invalid category: ${category}. Must be: ${validCategories.join(', ')}`);
    }

    // Validate template content
    this.validateTemplateContent(template_content, variables);

    // Validate variables array
    if (variables && !this.validateVariables(variables)) {
      throw new Error('Invalid variables format');
    }

    // Check for duplicate template name
    const existingTemplate = await this.findByName(name);
    if (existingTemplate) {
      throw new Error(`Template with name "${name}" already exists`);
    }

    try {
      const now = new Date().toISOString();
      const variablesJson = JSON.stringify(variables);

      const result = await this.this.db.query(`
        INSERT INTO ${this.tableName} (
          name, display_name, category, message_type, template_content,
          variables, is_active, usage_count, last_used_at,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id
      `, [
        name,
        display_name || this.generateDisplayName(name),
        category,
        message_type,
        template_content,
        variablesJson,
        is_active,
        0,
        null,
        now,
        now
      ]);

      // Return the created template
      return await this.findById(result.rows[0].id);
    } catch (error) {
      throw new Error(`Failed to create WhatsApp template: ${error.message}`);
    }
  }

  /**
   * Find template by ID
   * @param {number} id - Template ID
   * @returns {Promise<Object|null>} Template record or null
   */
  async findById(id) {
    try {
      const template = await this.db.queryOne(`
        SELECT * FROM ${this.tableName} WHERE id = $1
      `, [id]);

      if (!template) return null;

      return this.formatTemplate(template);
    } catch (error) {
      throw new Error(`Failed to find template by ID: ${error.message}`);
    }
  }

  /**
   * Find template by name
   * @param {string} name - Template name
   * @returns {Promise<Object|null>} Template record or null
   */
  async findByName(name) {
    try {
      const template = await this.db.queryOne(`
        SELECT * FROM ${this.tableName} WHERE name = $1
      `, [name]);

      if (!template) return null;

      return this.formatTemplate(template);
    } catch (error) {
      throw new Error(`Failed to find template by name: ${error.message}`);
    }
  }

  /**
   * Get all templates with filtering
   * @param {Object} [filters] - Filter options
   * @param {boolean} [filters.active_only] - Get only active templates
   * @param {string} [filters.category] - Filter by category
   * @param {string} [filters.message_type] - Filter by message type
   * @returns {Promise<Array>} Array of templates
   */
  async getAll(filters = {}) {
    const {
      active_only = false,
      category = null,
      message_type = null
    } = filters;

    try {
      let query = `SELECT * FROM ${this.tableName}`;
      const params = [];
      const whereConditions = [];

      if (active_only) {
        whereConditions.push('is_active = true');
      }

      if (category) {
        whereConditions.push(`category = $${params.length + 1}`);
        params.push(category);
      }

      if (message_type) {
        whereConditions.push(`message_type = $${params.length + 1}`);
        params.push(message_type);
      }

      if (whereConditions.length > 0) {
        query += ' WHERE ' + whereConditions.join(' AND ');
      }

      query += ' ORDER BY name';

      const result = await this.this.db.query(query, params);

      return result.rows.map(template => this.formatTemplate(template));
    } catch (error) {
      throw new Error(`Failed to get templates: ${error.message}`);
    }
  }

  /**
   * Update template
   * @param {number} id - Template ID
   * @param {Object} updateData - Update data
   * @returns {Promise<Object|null>} Updated template or null
   */
  async update(id, updateData) {
    const {
      name,
      display_name,
      message_type,
      template_content,
      variables,
      category,
      is_active
    } = updateData;

    // Build dynamic update query
    const updateFields = [];
    const updateValues = [];

    if (name !== undefined) {
      if (!this.isValidTemplateName(name)) {
        throw new Error('Invalid template name format');
      }

      // Check for duplicate name (excluding current template)
      const existingTemplate = await this.findByName(name);
      if (existingTemplate && existingTemplate.id !== id) {
        throw new Error(`Template with name "${name}" already exists`);
      }

      updateFields.push(`name = $${updateValues.length + 1}`);
      updateValues.push(name);
    }

    if (display_name !== undefined) {
      updateFields.push(`display_name = $${updateValues.length + 1}`);
      updateValues.push(display_name);
    }

    if (message_type !== undefined) {
      const validMessageTypes = ['expiry_warning', 'payment_reminder', 'welcome', 'system_alert', 'custom'];
      if (!validMessageTypes.includes(message_type)) {
        throw new Error(`Invalid message_type: ${message_type}`);
      }
      updateFields.push(`message_type = $${updateValues.length + 1}`);
      updateValues.push(message_type);
    }

    if (template_content !== undefined) {
      const templateVars = variables || await this.getTemplateVariables(id);
      this.validateTemplateContent(template_content, templateVars);
      updateFields.push(`template_content = $${updateValues.length + 1}`);
      updateValues.push(template_content);
    }

    if (variables !== undefined) {
      if (!this.validateVariables(variables)) {
        throw new Error('Invalid variables format');
      }
      updateFields.push(`variables = $${updateValues.length + 1}`);
      updateValues.push(JSON.stringify(variables));
    }

    if (category !== undefined) {
      const validCategories = ['notification', 'payment', 'reminder', 'system', 'custom'];
      if (!validCategories.includes(category)) {
        throw new Error(`Invalid category: ${category}`);
      }
      updateFields.push(`category = $${updateValues.length + 1}`);
      updateValues.push(category);
    }

    if (is_active !== undefined) {
      updateFields.push(`is_active = $${updateValues.length + 1}`);
      updateValues.push(is_active);
    }

    if (updateFields.length === 0) {
      throw new Error('No fields to update');
    }

    // Add updated_at timestamp
    updateFields.push(`updated_at = $${updateValues.length + 1}`);
    updateValues.push(new Date().toISOString());

    // Add WHERE condition
    updateFields.push(`WHERE id = $${updateValues.length + 1}`);
    updateValues.push(id);

    try {
      const result = await this.this.db.query(`
        UPDATE ${this.tableName}
        SET ${updateFields.join(', ')}
      `, updateValues);

      if (result.rowCount === 0) {
        return null;
      }

      return await this.findById(id);
    } catch (error) {
      throw new Error(`Failed to update template: ${error.message}`);
    }
  }

  /**
   * Delete template
   * @param {number} id - Template ID
   * @returns {Promise<boolean>} True if deleted successfully
   */
  async delete(id) {
    try {
      const result = await this.this.db.query(`
        DELETE FROM ${this.tableName} WHERE id = $1
      `, [id]);

      return result.rowCount > 0;
    } catch (error) {
      throw new Error(`Failed to delete template: ${error.message}`);
    }
  }

  /**
   * Increment usage count for template
   * @param {number} id - Template ID
   * @returns {Promise<boolean>} True if updated successfully
   */
  async incrementUsage(id) {
    try {
      const now = new Date().toISOString();
      const result = await this.this.db.query(`
        UPDATE ${this.tableName}
        SET usage_count = usage_count + 1,
            last_used_at = $1,
            updated_at = $2
        WHERE id = $3
      `, [now, now, id]);

      return result.rowCount > 0;
    } catch (error) {
      throw new Error(`Failed to increment template usage: ${error.message}`);
    }
  }

  /**
   * Process template with variable substitution
   * @param {number} id - Template ID
   * @param {Object} variablesData - Variable values for substitution
   * @returns {Promise<string>} Processed message content
   */
  async processTemplate(id, variablesData = {}) {
    const template = await this.findById(id);
    if (!template) {
      throw new Error('Template not found');
    }

    if (!template.is_active) {
      throw new Error('Template is not active');
    }

    let processedContent = template.template_content;

    // Process variables
    if (template.variables && template.variables.length > 0) {
      for (const variable of template.variables) {
        const { name, type, required } = variable;
        const placeholder = `{{${name}}}`;

        let value = variablesData[name];

        // Handle required variables
        if (required && (value === undefined || value === null)) {
          throw new Error(`Required variable "${name}" is missing`);
        }

        // Apply default values for missing optional variables
        if (value === undefined || value === null) {
          value = this.getDefaultValue(type, name);
        }

        // Format value based on type
        const formattedValue = this.formatVariableValue(value, type);
        processedContent = processedContent.replace(
          new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'),
          formattedValue
        );
      }
    }

    // Remove any remaining unreplaced placeholders
    processedContent = processedContent.replace(/\{\{[^}]+\}\}/g, '[MISSING]');

    return processedContent;
  }

  /**
   * Get template variables from database
   * @param {number} id - Template ID
   * @returns {Promise<Array>} Array of variable definitions
   */
  async getTemplateVariables(id) {
    try {
      const result = await this.db.queryOne(`
        SELECT variables FROM ${this.tableName} WHERE id = $1
      `, [id]);

      if (!result || !result.variables) {
        return [];
      }

      return JSON.parse(result.variables);
    } catch (error) {
      throw new Error(`Failed to get template variables: ${error.message}`);
    }
  }

  /**
   * Get template statistics
   * @returns {Promise<Object>} Statistics object
   */
  async getStatistics() {
    try {
      const stats = await this.db.queryOne(`
        SELECT
          COUNT(*) as total_templates,
          COUNT(CASE WHEN is_active = true THEN 1 END) as active_templates,
          COUNT(CASE WHEN usage_count > 0 THEN 1 END) as used_templates,
          SUM(usage_count) as total_usage,
          AVG(usage_count) as avg_usage
        FROM ${this.tableName}
      `);

      // Get breakdown by category
      const categoryResult = await this.this.db.query(`
        SELECT category, COUNT(*) as count
        FROM ${this.tableName}
        GROUP BY category
      `);

      // Get breakdown by message type
      const typeResult = await this.this.db.query(`
        SELECT message_type, COUNT(*) as count
        FROM ${this.tableName}
        GROUP BY message_type
      `);

      return {
        ...stats,
        avg_usage: Math.round((stats.avg_usage || 0) * 100) / 100,
        by_category: categoryResult.rows,
        by_message_type: typeResult.rows
      };
    } catch (error) {
      throw new Error(`Failed to get template statistics: ${error.message}`);
    }
  }

  /**
   * Validate template name format
   * @param {string} name - Template name to validate
   * @returns {boolean} True if valid
   */
  isValidTemplateName(name) {
    // Only lowercase letters, numbers, and underscores, no spaces
    const nameRegex = /^[a-z][a-z0-9_]*$/;
    return nameRegex.test(name) && name.length >= 3 && name.length <= 50;
  }

  /**
   * Validate template content with variables
   * @param {string} content - Template content
   * @param {Array} variables - Variable definitions
   */
  validateTemplateContent(content, variables = []) {
    if (!content || content.trim().length === 0) {
      throw new Error('Template content cannot be empty');
    }

    if (content.length > 5000) {
      throw new Error('Template content too long (max 5000 characters)');
    }

    // Extract placeholders from content
    const placeholderRegex = /\{\{([^}]+)\}\}/g;
    const placeholders = [];
    let match;

    while ((match = placeholderRegex.exec(content)) !== null) {
      placeholders.push(match[1]);
    }

    // Check if all placeholders have corresponding variables
    const variableNames = variables.map(v => v.name);
    const missingVariables = placeholders.filter(p => !variableNames.includes(p));

    if (missingVariables.length > 0) {
      throw new Error(`Missing variable definitions for: ${missingVariables.join(', ')}`);
    }

    // Check if all variables are used in content (warning, not error)
    const unusedVariables = variableNames.filter(v => !placeholders.includes(v));
    if (unusedVariables.length > 0) {
      console.warn(`Unused variables in template: ${unusedVariables.join(', ')}`);
    }
  }

  /**
   * Validate variables array
   * @param {Array} variables - Variables to validate
   * @returns {boolean} True if valid
   */
  validateVariables(variables) {
    if (!Array.isArray(variables)) {
      return false;
    }

    const validTypes = ['string', 'number', 'date', 'boolean'];

    return variables.every(variable => {
      return (
        variable &&
        typeof variable.name === 'string' &&
        this.isValidVariableName(variable.name) &&
        validTypes.includes(variable.type) &&
        typeof variable.required === 'boolean' &&
        typeof variable.description === 'string'
      );
    });
  }

  /**
   * Validate variable name format
   * @param {string} name - Variable name
   * @returns {boolean} True if valid
   */
  isValidVariableName(name) {
    // Letters, numbers, and underscores, no spaces
    const nameRegex = /^[a-zA-Z][a-zA-Z0-9_]*$/;
    return nameRegex.test(name) && name.length >= 2 && name.length <= 30;
  }

  /**
   * Generate display name from system name
   * @param {string} name - System name
   * @returns {string} Display name
   */
  generateDisplayName(name) {
    return name
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Get default value for variable type
   * @param {string} type - Variable type
   * @param {string} name - Variable name
   * @returns {string} Default value
   */
  getDefaultValue(type, name) {
    const defaults = {
      string: name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      number: '0',
      date: new Date().toISOString().split('T')[0],
      boolean: 'false'
    };

    return defaults[type] || '';
  }

  /**
   * Format variable value based on type
   * @param {*} value - Value to format
   * @param {string} type - Variable type
   * @returns {string} Formatted value
   */
  formatVariableValue(value, type) {
    if (value === null || value === undefined) {
      return '';
    }

    switch (type) {
      case 'string':
        return String(value);

      case 'number':
        return Number(value).toLocaleString();

      case 'date':
        const date = new Date(value);
        return date.toLocaleDateString();

      case 'boolean':
        return Boolean(value) ? 'Yes' : 'No';

      default:
        return String(value);
    }
  }

  /**
   * Format template for API response
   * @param {Object} template - Raw template data
   * @returns {Object} Formatted template
   */
  formatTemplate(template) {
    return {
      id: template.id,
      name: template.name,
      display_name: template.display_name,
      category: template.category,
      message_type: template.message_type,
      template_content: template.template_content,
      variables: template.variables ? JSON.parse(template.variables) : [],
      is_active: Boolean(template.is_active),
      usage_count: template.usage_count,
      last_used_at: template.last_used_at,
      created_at: template.created_at,
      updated_at: template.updated_at
    };
  }
}

module.exports = WhatsAppTemplate;