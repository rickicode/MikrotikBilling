const { db } = require('../database/DatabaseManager');

/**
 * Base Model class using DatabaseManager
 * All models should extend this class
 */
class BaseModel {
  constructor(tableName) {
    this.tableName = tableName;
    this.db = db;
  }

  /**
   * Find a single record
   */
  async findById(id) {
    return await this.db.getOne(this.tableName, { id });
  }

  /**
   * Find record by field
   */
  async findBy(field, value) {
    return await this.db.getOne(this.tableName, { [field]: value });
  }

  /**
   * Find multiple records
   */
  async find(where = {}, options = {}) {
    return await this.db.getMany(this.tableName, where, options);
  }

  /**
   * Find multiple records with pagination
   */
  async paginate(where = {}, page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.db.getMany(this.tableName, where, { limit, offset, orderBy: 'id' }),
      this.db.count(this.tableName, where)
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    };
  }

  /**
   * Create new record
   */
  async create(data) {
    const result = await this.db.insert(this.tableName, data);
    return Array.isArray(result) ? result[0] : result;
  }

  /**
   * Create multiple records
   */
  async createMany(data) {
    return await this.db.insert(this.tableName, data);
  }

  /**
   * Update record
   */
  async update(id, data) {
    const result = await this.db.update(this.tableName, data, { id });
    return Array.isArray(result) ? result[0] : result;
  }

  /**
   * Update multiple records
   */
  async updateMany(where, data) {
    return await this.db.update(this.tableName, data, where);
  }

  /**
   * Delete record
   */
  async delete(id) {
    return await this.db.delete(this.tableName, { id });
  }

  /**
   * Delete multiple records
   */
  async deleteMany(where) {
    return await this.db.delete(this.tableName, where);
  }

  /**
   * Check if record exists
   */
  async exists(id) {
    return await this.db.exists(this.tableName, { id });
  }

  /**
   * Get count of records
   */
  async count(where = {}) {
    return await this.db.count(this.tableName, where);
  }

  /**
   * Update or insert (upsert)
   */
  async upsert(data, conflictColumns = ['id']) {
    const result = await this.db.upsert(this.tableName, data, conflictColumns);
    return Array.isArray(result) ? result[0] : result;
  }

  /**
   * Get table info
   */
  async getTableInfo() {
    return await this.db.getTableInfo(this.tableName);
  }

  /**
   * Raw SQL query
   */
  async raw(sql, params = []) {
    return await this.db.query(sql, params);
  }

  /**
   * Execute transaction
   */
  async transaction(callback) {
    return await this.db.transaction(callback);
  }

  /**
   * Get table reference for complex queries
   */
  getTable() {
    return this.db.table(this.tableName);
  }
}

module.exports = BaseModel;