/**
 * Input Validation and Sanitization for Mikrotik API
 * Provides comprehensive validation for all API inputs
 */
const EventEmitter = require('events');

class InputValidator extends EventEmitter {
  constructor(options = {}) {
    super();

    // Configuration
    this.enableStrictMode = options.enableStrictMode !== false;
    this.enableLogging = options.enableLogging !== false;
    this.maxStringLength = options.maxStringLength || 1000;
    this.enableXSSProtection = options.enableXSSProtection !== false;
    this.enableSQLInjectionProtection = options.enableSQLInjectionProtection !== false;

    // Validation patterns
    this.patterns = {
      // Username patterns
      username: {
        hotspot: /^[a-zA-Z0-9@._-]{3,32}$/,
        pppoe: /^[a-zA-Z0-9@._-]{3,32}$/,
        system: /^[a-zA-Z0-9@._-]{3,32}$/
      },

      // Password patterns
      password: {
        min: 8,
        max: 64,
        requireComplexity: false // For Mikrotik, simple passwords are allowed
      },

      // IP Address patterns
      ipAddress: /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
      cidr: /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\/(?:[0-9]|[1-2][0-9]|3[0-2])$/,

      // MAC Address pattern
      macAddress: /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/,

      // Mikrotik command patterns
      command: /^[a-zA-Z0-9\/_\-\.]+$/,
      parameter: /^[a-zA-Z0-9_\-\.]+$/,

      // General text patterns
      safeText: /^[a-zA-Z0-9\s@._\-:.,!?()[\]{}]+$/,
      comment: /^[^<>\"'&]*$/, // No HTML tags or quotes

      // Numeric patterns
      port: /^(?:[1-9]\d{0,3}|[1-5]\d{4}|6[0-4]\d{3}|65[0-4]\d{2}|655[0-2]\d|6553[0-5])$/,
      timeout: /^[0-9]+$/,
      number: /^[0-9]+$/,
      float: /^[0-9]*\.?[0-9]+$/

    };

    // Validation statistics
    this.stats = {
      totalValidations: 0,
      passedValidations: 0,
      failedValidations: 0,
      sanitizations: 0,
      blockedAttacks: 0,
      byType: {},
      byInputType: {}
    };

    // Attack detection patterns
    this.attackPatterns = {
      xss: [
        /<script/i,
        /javascript:/i,
        /on\w+\s*=/i,
        /<iframe/i,
        /<object/i,
        /<embed/i
      ],

      sqlInjection: [
        /union\s+select/i,
        /drop\s+table/i,
        /delete\s+from/i,
        /insert\s+into/i,
        /update\s+set/i,
        /exec\s*\(/i,
        /script\s*>/i,
        /--/,
        /\/\*/,
        /\*\//
      ],

      commandInjection: [
        /[;&|`$()]/,
        /\.\./,
        /\/etc\//,
        /\/proc\//,
        /system\(/i
      ],

      pathTraversal: [
        /\.\.[\/\\]/,
        /[\/\\]\.\.[\/\\]/,
        /[\/\\]\.\.$/
      ]
    };
  }

  /**
   * Validate and sanitize input
   */
  validate(input, type, options = {}) {
    this.stats.totalValidations++;

    const validation = {
      input: input,
      type: type,
      options: options,
      result: null,
      errors: [],
      warnings: [],
      sanitized: false,
      blocked: false,
      timestamp: Date.now()
    };

    try {
      // Check for attacks first
      if (this._detectAttacks(input, type)) {
        validation.blocked = true;
        validation.errors.push('Input blocked due to security concerns');
        this.stats.blockedAttacks++;
        this.emit('attack-detected', { input, type, validation });
        return validation;
      }

      // Validate based on type
      const result = this._validateByType(input, type, options);
      validation.result = result.value;
      validation.sanitized = result.sanitized;
      validation.errors.push(...result.errors);
      validation.warnings.push(...result.warnings);

      // Update statistics
      if (validation.errors.length === 0) {
        this.stats.passedValidations++;
        this.emit('validation-passed', validation);
      } else {
        this.stats.failedValidations++;
        this.emit('validation-failed', validation);
      }

      if (validation.sanitized) {
        this.stats.sanitizations++;
        this.emit('input-sanitized', validation);
      }

      // Update type statistics
      this.stats.byType[type] = (this.stats.byType[type] || 0) + 1;
      this.stats.byInputType[type] = (this.stats.byInputType[type] || 0) + 1;

    } catch (error) {
      validation.errors.push(`Validation error: ${error.message}`);
      this.stats.failedValidations++;
      this.emit('validation-error', { input, type, error, validation });
    }

    return validation;
  }

  /**
   * Validate multiple inputs
   */
  validateBatch(inputs, options = {}) {
    const results = {};
    const errors = [];
    const warnings = [];

    for (const [key, config] of Object.entries(inputs)) {
      const validation = this.validate(config.value, config.type, config.options);
      results[key] = validation;

      errors.push(...validation.errors.map(error => `${key}: ${error}`));
      warnings.push(...validation.warnings.map(warning => `${key}: ${warning}`));
    }

    const batchResult = {
      results,
      errors,
      warnings,
      valid: errors.length === 0,
      timestamp: Date.now()
    };

    this.emit('batch-validation', batchResult);
    return batchResult;
  }

  /**
   * Sanitize string input
   */
  sanitizeString(input, options = {}) {
    if (typeof input !== 'string') {
      return { value: input, sanitized: false, errors: ['Input is not a string'] };
    }

    let sanitized = input;
    let changed = false;
    const errors = [];

    // Trim whitespace
    if (options.trim !== false) {
      sanitized = sanitized.trim();
      if (sanitized !== input) changed = true;
    }

    // Limit length
    if (sanitized.length > this.maxStringLength) {
      sanitized = sanitized.substring(0, this.maxStringLength);
      changed = true;
      errors.push(`Input truncated to ${this.maxStringLength} characters`);
    }

    // Remove HTML tags
    if (this.enableXSSProtection) {
      const withoutTags = sanitized.replace(/<[^>]*>/g, '');
      if (withoutTags !== sanitized) {
        sanitized = withoutTags;
        changed = true;
        errors.push('HTML tags removed');
      }
    }

    // Remove potentially dangerous characters
    if (options.strict || this.enableStrictMode) {
      const dangerous = /[<>"'&]/g;
      const withoutDangerous = sanitized.replace(dangerous, '');
      if (withoutDangerous !== sanitized) {
        sanitized = withoutDangerous;
        changed = true;
        errors.push('Dangerous characters removed');
      }
    }

    return {
      value: sanitized,
      sanitized: changed,
      errors
    };
  }

  /**
   * Validate specific input types
   */
  _validateByType(input, type, options) {
    const result = {
      value: input,
      sanitized: false,
      errors: [],
      warnings: []
    };

    switch (type) {
      case 'username':
        return this._validateUsername(input, options);
      case 'password':
        return this._validatePassword(input, options);
      case 'ip':
        return this._validateIPAddress(input, options);
      case 'cidr':
        return this._validateCIDR(input, options);
      case 'mac':
        return this._validateMACAddress(input, options);
      case 'port':
        return this._validatePort(input, options);
      case 'timeout':
        return this._validateTimeout(input, options);
      case 'command':
        return this._validateCommand(input, options);
      case 'parameter':
        return this._validateParameter(input, options);
      case 'comment':
        return this._validateComment(input, options);
      case 'text':
        return this._validateText(input, options);
      case 'number':
        return this._validateNumber(input, options);
      case 'float':
        return this._validateFloat(input, options);
      case 'array':
        return this._validateArray(input, options);
      case 'object':
        return this._validateObject(input, options);
      default:
        result.errors.push(`Unknown validation type: ${type}`);
        return result;
    }
  }

  /**
   * Validate username
   */
  _validateUsername(input, options = {}) {
    const result = {
      value: input,
      sanitized: false,
      errors: [],
      warnings: []
    };

    if (typeof input !== 'string') {
      result.errors.push('Username must be a string');
      return result;
    }

    // Sanitize first
    const sanitized = this.sanitizeString(input, { trim: true });
    result.value = sanitized.value;
    result.sanitized = sanitized.sanitized;
    result.errors.push(...sanitized.errors);

    const userType = options.userType || 'hotspot';
    const pattern = this.patterns.username[userType];

    if (!pattern.test(result.value)) {
      result.errors.push(`Invalid ${userType} username format. Must be 3-32 characters, alphanumeric only with @._-`);
    }

    // Check for reserved usernames
    const reserved = ['admin', 'root', 'system', 'mikrotik'];
    if (reserved.includes(result.value.toLowerCase())) {
      result.warnings.push('Username is reserved and may conflict with system accounts');
    }

    return result;
  }

  /**
   * Validate password
   */
  _validatePassword(input, options = {}) {
    const result = {
      value: input,
      sanitized: false,
      errors: [],
      warnings: []
    };

    if (typeof input !== 'string') {
      result.errors.push('Password must be a string');
      return result;
    }

    // Check length
    const min = options.minLength || this.patterns.password.min;
    const max = options.maxLength || this.patterns.password.max;

    if (input.length < min) {
      result.errors.push(`Password must be at least ${min} characters long`);
    }

    if (input.length > max) {
      result.errors.push(`Password must not exceed ${max} characters`);
    }

    // For Mikrotik, we don't require complex passwords unless specified
    if (options.requireComplexity || this.patterns.password.requireComplexity) {
      if (!/[A-Z]/.test(input)) {
        result.warnings.push('Password should contain uppercase letters');
      }
      if (!/[a-z]/.test(input)) {
        result.warnings.push('Password should contain lowercase letters');
      }
      if (!/[0-9]/.test(input)) {
        result.warnings.push('Password should contain numbers');
      }
    }

    // Don't actually sanitize passwords for security
    result.value = input;

    return result;
  }

  /**
   * Validate IP address
   */
  _validateIPAddress(input, options = {}) {
    const result = {
      value: input,
      sanitized: false,
      errors: [],
      warnings: []
    };

    if (typeof input !== 'string') {
      result.errors.push('IP address must be a string');
      return result;
    }

    const sanitized = this.sanitizeString(input, { trim: true });
    result.value = sanitized.value;
    result.sanitized = sanitized.sanitized;
    result.errors.push(...sanitized.errors);

    if (!this.patterns.ipAddress.test(result.value)) {
      result.errors.push('Invalid IP address format');
    }

    // Check for private/reserved ranges
    const isPrivate = this._isPrivateIP(result.value);
    if (isPrivate && options.allowPrivate !== true) {
      result.warnings.push('IP address is in private range');
    }

    return result;
  }

  /**
   * Validate CIDR notation
   */
  _validateCIDR(input, options = {}) {
    const result = {
      value: input,
      sanitized: false,
      errors: [],
      warnings: []
    };

    if (typeof input !== 'string') {
      result.errors.push('CIDR must be a string');
      return result;
    }

    const sanitized = this.sanitizeString(input, { trim: true });
    result.value = sanitized.value;
    result.sanitized = sanitized.sanitized;
    result.errors.push(...sanitized.errors);

    if (!this.patterns.cidr.test(result.value)) {
      result.errors.push('Invalid CIDR notation format');
    }

    return result;
  }

  /**
   * Validate MAC address
   */
  _validateMACAddress(input, options = {}) {
    const result = {
      value: input,
      sanitized: false,
      errors: [],
      warnings: []
    };

    if (typeof input !== 'string') {
      result.errors.push('MAC address must be a string');
      return result;
    }

    const sanitized = this.sanitizeString(input, { trim: true });
    result.value = sanitized.value;
    result.sanitized = sanitized.sanitized;
    result.errors.push(...sanitized.errors);

    if (!this.patterns.macAddress.test(result.value)) {
      result.errors.push('Invalid MAC address format. Use XX:XX:XX:XX:XX:XX or XX-XX-XX-XX-XX-XX');
    }

    return result;
  }

  /**
   * Validate port number
   */
  _validatePort(input, options = {}) {
    const result = {
      value: input,
      sanitized: false,
      errors: [],
      warnings: []
    };

    // Convert to string if number
    const inputStr = input.toString();

    if (!this.patterns.port.test(inputStr)) {
      result.errors.push('Invalid port number. Must be between 1-65535');
      return result;
    }

    result.value = parseInt(inputStr);

    // Check for well-known ports
    if (options.checkWellKnown) {
      const wellKnownPorts = [21, 22, 23, 25, 53, 80, 110, 143, 443, 993, 995];
      if (wellKnownPorts.includes(result.value)) {
        result.warnings.push(`Port ${result.value} is a well-known port`);
      }
    }

    return result;
  }

  /**
   * Validate timeout value
   */
  _validateTimeout(input, options = {}) {
    const result = {
      value: input,
      sanitized: false,
      errors: [],
      warnings: []
    };

    if (!this.patterns.timeout.test(input.toString())) {
      result.errors.push('Timeout must be a positive number');
      return result;
    }

    result.value = parseInt(input.toString());

    const max = options.maxTimeout || 300000; // 5 minutes default max
    if (result.value > max) {
      result.warnings.push(`Timeout value ${result.value}ms is very large (max recommended: ${max}ms)`);
    }

    return result;
  }

  /**
   * Validate Mikrotik command
   */
  _validateCommand(input, options = {}) {
    const result = {
      value: input,
      sanitized: false,
      errors: [],
      warnings: []
    };

    if (typeof input !== 'string') {
      result.errors.push('Command must be a string');
      return result;
    }

    const sanitized = this.sanitizeString(input, { trim: true });
    result.value = sanitized.value;
    result.sanitized = sanitized.sanitized;
    result.errors.push(...sanitized.errors);

    if (!this.patterns.command.test(result.value)) {
      result.errors.push('Invalid command format. Only alphanumeric characters, /, _, -, and . are allowed');
    }

    // Check for dangerous commands
    const dangerousCommands = ['/system reboot', '/system shutdown', '/user remove', '/file remove'];
    if (dangerousCommands.some(cmd => result.value.includes(cmd))) {
      result.warnings.push('Command contains potentially dangerous operations');
    }

    return result;
  }

  /**
   * Validate parameter name
   */
  _validateParameter(input, options = {}) {
    const result = {
      value: input,
      sanitized: false,
      errors: [],
      warnings: []
    };

    if (typeof input !== 'string') {
      result.errors.push('Parameter must be a string');
      return result;
    }

    const sanitized = this.sanitizeString(input, { trim: true });
    result.value = sanitized.value;
    result.sanitized = sanitized.sanitized;
    result.errors.push(...sanitized.errors);

    if (!this.patterns.parameter.test(result.value)) {
      result.errors.push('Invalid parameter format. Only alphanumeric characters, _, -, and . are allowed');
    }

    return result;
  }

  /**
   * Validate comment
   */
  _validateComment(input, options = {}) {
    const result = {
      value: input,
      sanitized: false,
      errors: [],
      warnings: []
    };

    if (typeof input !== 'string') {
      result.errors.push('Comment must be a string');
      return result;
    }

    const sanitized = this.sanitizeString(input, { trim: true });
    result.value = sanitized.value;
    result.sanitized = sanitized.sanitized;
    result.errors.push(...sanitized.errors);

    if (!this.patterns.comment.test(result.value)) {
      result.errors.push('Comment contains invalid characters. HTML tags, quotes, and & are not allowed');
    }

    if (result.value.length > 200) {
      result.warnings.push('Comment is very long and may be truncated');
    }

    return result;
  }

  /**
   * Validate text input
   */
  _validateText(input, options = {}) {
    const result = {
      value: input,
      sanitized: false,
      errors: [],
      warnings: []
    };

    if (typeof input !== 'string') {
      result.errors.push('Text input must be a string');
      return result;
    }

    const sanitized = this.sanitizeString(input, options);
    result.value = sanitized.value;
    result.sanitized = sanitized.sanitized;
    result.errors.push(...sanitized.errors);

    if (options.strict && this.patterns.safeText) {
      if (!this.patterns.safeText.test(result.value)) {
        result.errors.push('Text contains invalid characters');
      }
    }

    return result;
  }

  /**
   * Validate number
   */
  _validateNumber(input, options = {}) {
    const result = {
      value: input,
      sanitized: false,
      errors: [],
      warnings: []
    };

    if (!this.patterns.number.test(input.toString())) {
      result.errors.push('Invalid number format');
      return result;
    }

    result.value = parseInt(input.toString());

    if (options.min !== undefined && result.value < options.min) {
      result.errors.push(`Number must be at least ${options.min}`);
    }

    if (options.max !== undefined && result.value > options.max) {
      result.errors.push(`Number must not exceed ${options.max}`);
    }

    return result;
  }

  /**
   * Validate float number
   */
  _validateFloat(input, options = {}) {
    const result = {
      value: input,
      sanitized: false,
      errors: [],
      warnings: []
    };

    if (!this.patterns.float.test(input.toString())) {
      result.errors.push('Invalid float number format');
      return result;
    }

    result.value = parseFloat(input.toString());

    if (options.min !== undefined && result.value < options.min) {
      result.errors.push(`Number must be at least ${options.min}`);
    }

    if (options.max !== undefined && result.value > options.max) {
      result.errors.push(`Number must not exceed ${options.max}`);
    }

    return result;
  }

  /**
   * Validate array
   */
  _validateArray(input, options = {}) {
    const result = {
      value: input,
      sanitized: false,
      errors: [],
      warnings: []
    };

    if (!Array.isArray(input)) {
      result.errors.push('Input must be an array');
      return result;
    }

    if (options.maxLength && input.length > options.maxLength) {
      result.errors.push(`Array length exceeds maximum of ${options.maxLength}`);
    }

    if (options.minLength && input.length < options.minLength) {
      result.errors.push(`Array length below minimum of ${options.minLength}`);
    }

    // Validate array elements if element type is specified
    if (options.elementType) {
      for (let i = 0; i < input.length; i++) {
        const elementValidation = this.validate(input[i], options.elementType, options.elementOptions);
        if (elementValidation.errors.length > 0) {
          result.errors.push(`Array element ${i}: ${elementValidation.errors.join(', ')}`);
        }
      }
    }

    return result;
  }

  /**
   * Validate object
   */
  _validateObject(input, options = {}) {
    const result = {
      value: input,
      sanitized: false,
      errors: [],
      warnings: []
    };

    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      result.errors.push('Input must be an object');
      return result;
    }

    if (options.requiredKeys) {
      for (const key of options.requiredKeys) {
        if (!(key in input)) {
          result.errors.push(`Missing required key: ${key}`);
        }
      }
    }

    if (options.allowedKeys) {
      for (const key of Object.keys(input)) {
        if (!options.allowedKeys.includes(key)) {
          result.warnings.push(`Unexpected key: ${key}`);
        }
      }
    }

    // Validate object properties if schema is provided
    if (options.schema) {
      for (const [key, schema] of Object.entries(options.schema)) {
        if (key in input) {
          const propertyValidation = this.validate(input[key], schema.type, schema.options);
          if (propertyValidation.errors.length > 0) {
            result.errors.push(`Property ${key}: ${propertyValidation.errors.join(', ')}`);
          }
        }
      }
    }

    return result;
  }

  /**
   * Detect potential attacks in input
   */
  _detectAttacks(input, type) {
    if (typeof input !== 'string') {
      return false;
    }

    const inputLower = input.toLowerCase();

    // Check XSS
    if (this.enableXSSProtection) {
      for (const pattern of this.attackPatterns.xss) {
        if (pattern.test(inputLower)) {
          return true;
        }
      }
    }

    // Check SQL Injection
    if (this.enableSQLInjectionProtection) {
      for (const pattern of this.attackPatterns.sqlInjection) {
        if (pattern.test(inputLower)) {
          return true;
        }
      }
    }

    // Check Command Injection
    for (const pattern of this.attackPatterns.commandInjection) {
      if (pattern.test(input)) {
        return true;
      }
    }

    // Check Path Traversal
    for (const pattern of this.attackPatterns.pathTraversal) {
      if (pattern.test(input)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if IP is in private range
   */
  _isPrivateIP(ip) {
    const parts = ip.split('.').map(Number);

    // 10.0.0.0/8
    if (parts[0] === 10) return true;

    // 172.16.0.0/12
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;

    // 192.168.0.0/16
    if (parts[0] === 192 && parts[1] === 168) return true;

    // 127.0.0.0/8 (localhost)
    if (parts[0] === 127) return true;

    return false;
  }

  /**
   * Get validation statistics
   */
  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.totalValidations > 0
        ? (this.stats.passedValidations / this.stats.totalValidations) * 100
        : 0,
      failureRate: this.stats.totalValidations > 0
        ? (this.stats.failedValidations / this.stats.totalValidations) * 100
        : 0,
      attackDetectionRate: this.stats.totalValidations > 0
        ? (this.stats.blockedAttacks / this.stats.totalValidations) * 100
        : 0
    };
  }

  /**
   * Clear statistics
   */
  clearStats() {
    this.stats = {
      totalValidations: 0,
      passedValidations: 0,
      failedValidations: 0,
      sanitizations: 0,
      blockedAttacks: 0,
      byType: {},
      byInputType: {}
    };
  }
}

module.exports = InputValidator;