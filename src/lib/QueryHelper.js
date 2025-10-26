/**
 * Global Query Helper - Easy Access Throughout Application
 * Single entry point for all database operations
 */

const { db } = require('../database/DatabaseManager');
const GlobalQuery = require('./GlobalQuery');

// Create global query instance
const query = new GlobalQuery(db);

/**
 * Global query helper - use this throughout the application
 * Provides automatic database type detection and syntax conversion
 */
const QueryHelper = {
  // Basic operations
  findOne: (table, where, options) => query.findOne(table, where, options),
  findMany: (table, where, options) => query.findMany(table, where, options),
  create: (table, data) => query.create(table, data),
  update: (table, data, where) => query.update(table, data, where),
  delete: (table, where) => query.delete(table, where),
  count: (table, where) => query.count(table, where),
  exists: (table, where) => query.exists(table, where),

  // Advanced operations
  raw: (sql, params) => query.raw(sql, params),
  getOne: (sql, params) => query.raw(sql, params).then(result => Array.isArray(result) ? result[0] : result),
  getMany: (sql, params) => query.raw(sql, params),
  execute: (sql, params) => query.raw(sql, params),
  query: (sql, params) => query.raw(sql, params),
  insert: (sql, params) => query.raw(sql, params),
  paginate: (table, where, options) => query.paginate(table, where, options),
  transaction: (callback) => query.transaction(callback),

  // Convenience methods
  findByUsername: (table, username) => query.findOne(table, { username }),
  findById: (table, id) => query.findOne(table, { id }),
  findAll: (table, options) => query.findMany(table, {}, options),

  // Database info
  getDatabaseType: () => query.dbType,
  getDatabase: () => db,

  // Helper for complex queries
  whereIn: (table, column, values, options = {}) => {
    return query.findMany(table, {}, { ...options, whereIn: { column, values } });
  },

  whereOr: (table, column, values, options = {}) => {
    return query.findMany(table, {}, { ...options, whereOr: { column, values } });
  }
};

// Export as default and named exports
module.exports = QueryHelper;
module.exports.QueryHelper = QueryHelper;
module.exports.query = QueryHelper;