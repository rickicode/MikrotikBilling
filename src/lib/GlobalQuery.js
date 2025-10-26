/**
 * Global Query Helper System
 * Provides unified query interface for SQLite and PostgreSQL
 * Automatically handles syntax differences between databases
 */

class GlobalQuery {
    constructor(databaseManager) {
        this.db = databaseManager;
        this.dbType = databaseManager.type; // 'sqlite3' or 'pg'
    }

    /**
     * Convert binding parameters based on database type
     * SQLite uses ? placeholders
     * PostgreSQL uses $1, $2, etc.
     */
    _convertBindings(sql, params = []) {
        if (this.dbType === 'sqlite3') {
            // SQLite already uses ? placeholders
            return { sql, params };
        } else if (this.dbType === 'pg') {
            // Convert ? placeholders to $1, $2, etc.
            let paramIndex = 1;
            let convertedSql = sql.replace(/\?/g, () => `$${paramIndex++}`);
            return { sql: convertedSql, params };
        }
        return { sql, params };
    }

    /**
     * Execute raw query with automatic binding conversion
     */
    async raw(sql, params = []) {
        const { sql: convertedSql, params: convertedParams } = this._convertBindings(sql, params);
        return await this.db.query(convertedSql, convertedParams);
    }

    /**
     * Find single record
     */
    async findOne(table, where = {}, options = {}) {
        if (Object.keys(where).length === 0) {
            // Get first record
            const sql = `SELECT * FROM ${table} LIMIT 1`;
            return await this.raw(sql);
        }

        const whereKeys = Object.keys(where);
        const whereValues = Object.values(where);
        const whereClause = whereKeys.map(key => `${key} = ?`).join(' AND ');

        let sql = `SELECT * FROM ${table} WHERE ${whereClause}`;
        if (options.limit) {
            sql += ` LIMIT ${options.limit}`;
        } else {
            sql += ' LIMIT 1';
        }

        const result = await this.raw(sql, whereValues);
        return Array.isArray(result) ? result[0] : result;
    }

    /**
     * Find multiple records
     */
    async findMany(table, where = {}, options = {}) {
        let sql = `SELECT * FROM ${table}`;
        const params = [];

        if (Object.keys(where).length > 0) {
            const whereKeys = Object.keys(where);
            const whereValues = Object.values(where);
            const whereClause = whereKeys.map(key => `${key} = ?`).join(' AND ');
            sql += ` WHERE ${whereClause}`;
            params.push(...whereValues);
        }

        // Handle IN clause for array values
        if (options.whereIn) {
            const { column, values } = options.whereIn;
            const placeholders = values.map(() => '?').join(', ');
            const inClause = `${column} IN (${placeholders})`;

            if (params.length > 0) {
                sql += ` AND ${inClause}`;
            } else {
                sql += ` WHERE ${inClause}`;
            }
            params.push(...values);
        }

        // Handle OR clause for multiple status values
        if (options.whereOr) {
            const { column, values } = options.whereOr;
            const orClause = values.map(() => `${column} = ?`).join(' OR ');

            if (params.length > 0) {
                sql += ` AND (${orClause})`;
            } else {
                sql += ` WHERE (${orClause})`;
            }
            params.push(...values);
        }

        // Add ORDER BY
        if (options.orderBy) {
            if (Array.isArray(options.orderBy)) {
                const orderClauses = options.orderBy.map(order => {
                    if (typeof order === 'string') {
                        return order;
                    } else if (typeof order === 'object') {
                        const { column, direction = 'ASC' } = order;
                        return `${column} ${direction}`;
                    }
                }).join(', ');
                sql += ` ORDER BY ${orderClauses}`;
            } else {
                sql += ` ORDER BY ${options.orderBy}`;
            }
        }

        // Add LIMIT
        if (options.limit) {
            sql += ` LIMIT ${options.limit}`;
        }

        // Add OFFSET
        if (options.offset) {
            sql += ` OFFSET ${options.offset}`;
        }

        return await this.raw(sql, params);
    }

    /**
     * Create new record
     */
    async create(table, data) {
        const keys = Object.keys(data);
        const values = Object.values(data);
        const placeholders = keys.map(() => '?').join(', ');

        const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;

        // For PostgreSQL, add RETURNING clause to get the inserted record
        if (this.dbType === 'pg') {
            const returningSql = sql + ' RETURNING *';
            const result = await this.raw(returningSql, values);
            return Array.isArray(result) ? result[0] : result;
        }

        // For SQLite, execute insert and then return the inserted data
        await this.raw(sql, values);
        return data;
    }

    /**
     * Update records
     */
    async update(table, data, where) {
        const setKeys = Object.keys(data);
        const setValues = Object.values(data);
        const setClause = setKeys.map(key => `${key} = ?`).join(', ');

        const whereKeys = Object.keys(where);
        const whereValues = Object.values(where);
        const whereClause = whereKeys.map(key => `${key} = ?`).join(' AND ');

        const sql = `UPDATE ${table} SET ${setClause} WHERE ${whereClause}`;
        const params = [...setValues, ...whereValues];

        // For PostgreSQL, add RETURNING clause
        if (this.dbType === 'pg') {
            const returningSql = sql + ' RETURNING *';
            const result = await this.raw(returningSql, params);
            return Array.isArray(result) ? result : [result];
        }

        // For SQLite, execute update and return affected rows count
        return await this.raw(sql, params);
    }

    /**
     * Delete records
     */
    async delete(table, where) {
        const whereKeys = Object.keys(where);
        const whereValues = Object.values(where);
        const whereClause = whereKeys.map(key => `${key} = ?`).join(' AND ');

        const sql = `DELETE FROM ${table} WHERE ${whereClause}`;
        return await this.raw(sql, whereValues);
    }

    /**
     * Count records
     */
    async count(table, where = {}) {
        let sql = `SELECT COUNT(*) as count FROM ${table}`;
        const params = [];

        if (Object.keys(where).length > 0) {
            const whereKeys = Object.keys(where);
            const whereValues = Object.values(where);
            const whereClause = whereKeys.map(key => `${key} = ?`).join(' AND ');
            sql += ` WHERE ${whereClause}`;
            params.push(...whereValues);
        }

        const result = await this.raw(sql, params);
        const count = Array.isArray(result) ? result[0] : result;
        return count ? parseInt(count.count) : 0;
    }

    /**
     * Check if record exists
     */
    async exists(table, where) {
        const count = await this.count(table, where);
        return count > 0;
    }

    /**
     * Get paginated results
     */
    async paginate(table, where = {}, options = {}) {
        const {
            page = 1,
            limit = 10,
            orderBy = [{ column: 'id', direction: 'DESC' }]
        } = options;

        const offset = (page - 1) * limit;

        // Get total count
        const total = await this.count(table, where);

        // Get records
        const records = await this.findMany(table, where, {
            limit,
            offset,
            orderBy
        });

        return {
            records,
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
     * Execute transaction (for PostgreSQL)
     */
    async transaction(callback) {
        if (this.dbType !== 'pg') {
            // SQLite doesn't support transactions the same way, execute directly
            return await callback(this);
        }

        const trx = await this.db.transaction();
        try {
            const transactionQuery = new GlobalQuery(trx);
            const result = await callback(transactionQuery);
            await trx.commit();
            return result;
        } catch (error) {
            await trx.rollback();
            throw error;
        }
    }
}

module.exports = GlobalQuery;