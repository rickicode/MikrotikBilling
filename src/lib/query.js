/**
 * PostgreSQL Query Builder
 * Provides a simplified interface for database operations
 */
class Query {
    constructor(pool) {
        this.pool = pool;
    }

    /**
     * Execute a query and return all rows
     */
    async getMany(sql, params = []) {
        const client = await this.pool.connect();
        try {
            const result = await client.query(sql, params);
            return result.rows;
        } catch (error) {
            console.error('Query error:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Execute a query and return first row
     */
    async getOne(sql, params = []) {
        const rows = await this.getMany(sql, params);
        return rows.length > 0 ? rows[0] : null;
    }

    /**
     * Execute a query and return scalar value
     */
    async getScalar(sql, params = []) {
        const row = await this.getOne(sql, params);
        if (!row) return null;

        const keys = Object.keys(row);
        return row[keys[0]];
    }

    /**
     * Execute a query (INSERT, UPDATE, DELETE)
     */
    async query(sql, params = []) {
        const client = await this.pool.connect();
        try {
            const result = await client.query(sql, params);
            return {
                rows: result.rows,
                rowCount: result.rowCount
            };
        } catch (error) {
            console.error('Query error:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Insert a record and return ID
     */
    async insert(table, data) {
        const keys = Object.keys(data);
        const values = Object.values(data);
        const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

        const sql = `
            INSERT INTO ${table} (${keys.join(', ')})
            VALUES (${placeholders})
            RETURNING id
        `;

        const result = await this.getOne(sql, values);
        return result.id;
    }

    /**
     * Update records and return affected count
     */
    async update(table, data, where, whereParams = []) {
        const keys = Object.keys(data);
        const values = Object.values(data);
        const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');

        const sql = `
            UPDATE ${table}
            SET ${setClause}
            ${where ? `WHERE ${where}` : ''}
        `;

        const allParams = [...values, ...whereParams];
        const result = await this.query(sql, allParams);
        return result.rowCount;
    }

    /**
     * Delete records and return affected count
     */
    async delete(table, where, params = []) {
        const sql = `DELETE FROM ${table} WHERE ${where}`;
        const result = await this.query(sql, params);
        return result.rowCount;
    }

    /**
     * Check if record exists
     */
    async exists(table, where, params = []) {
        const sql = `SELECT 1 FROM ${table} WHERE ${where} LIMIT 1`;
        const result = await this.getOne(sql, params);
        return !!result;
    }

    /**
     * Count records
     */
    async count(table, where = '1=1', params = []) {
        const sql = `SELECT COUNT(*) as count FROM ${table} WHERE ${where}`;
        const result = await this.getOne(sql, params);
        return parseInt(result.count) || 0;
    }

    /**
     * Get max value of a column
     */
    async max(table, column, where = '1=1', params = []) {
        const sql = `SELECT MAX(${column}) as max FROM ${table} WHERE ${where}`;
        const result = await this.getOne(sql, params);
        return result.max;
    }

    /**
     * Get sum of a column
     */
    async sum(table, column, where = '1=1', params = []) {
        const sql = `SELECT SUM(${column}) as sum FROM ${table} WHERE ${where}`;
        const result = await this.getOne(sql, params);
        return result.sum || 0;
    }

    /**
     * Paginate results
     */
    async paginate(table, options = {}) {
        const {
            where = '1=1',
            whereParams = [],
            orderBy = 'id',
            order = 'ASC',
            page = 1,
            limit = 20,
            select = '*'
        } = options;

        // Get total count
        const countSql = `SELECT COUNT(*) as total FROM ${table} WHERE ${where}`;
        const countResult = await this.getOne(countSql, whereParams);
        const total = parseInt(countResult.total);

        // Calculate pagination
        const offset = (page - 1) * limit;
        const totalPages = Math.ceil(total / limit);

        // Get data
        const dataSql = `
            SELECT ${select}
            FROM ${table}
            WHERE ${where}
            ORDER BY ${orderBy} ${order}
            LIMIT $${whereParams.length + 1} OFFSET $${whereParams.length + 2}
        `;

        const data = await this.getMany(dataSql, [...whereParams, limit, offset]);

        return {
            data,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1
            }
        };
    }

    /**
     * Batch insert
     */
    async batchInsert(table, records) {
        if (records.length === 0) return [];

        const keys = Object.keys(records[0]);
        const columns = keys.join(', ');
        const valueGroups = [];

        let paramIndex = 1;
        const values = [];

        for (const record of records) {
            const placeholders = keys.map(() => `$${paramIndex++}`);
            valueGroups.push(`(${placeholders.join(', ')})`);
            values.push(...Object.values(record));
        }

        const sql = `
            INSERT INTO ${table} (${columns})
            VALUES ${valueGroups.join(', ')}
            RETURNING id
        `;

        const result = await this.query(sql, values);
        return result.rows.map(row => row.id);
    }

    /**
     * Transaction helper
     */
    async transaction(callback) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            // Create transaction query helper
            const txQuery = {
                query: async (sql, params) => {
                    const result = await client.query(sql, params);
                    return {
                        rows: result.rows,
                        rowCount: result.rowCount
                    };
                },
                getOne: async (sql, params) => {
                    const result = await client.query(sql, params);
                    return result.rows[0] || null;
                },
                getMany: async (sql, params) => {
                    const result = await client.query(sql, params);
                    return result.rows;
                }
            };

            const result = await callback(txQuery);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
}

module.exports = Query;