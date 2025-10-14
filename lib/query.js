class Query {
  constructor(pool) {
    this.pool = pool;
  }

  async query(text, params) {
    const start = Date.now();
    try {
      const res = await this.pool.query(text, params);
      const duration = Date.now() - start;
      console.log('Executed query', { text, duration, rows: res.rowCount });
      return res;
    } catch (error) {
      console.error('Query error', { text, error });
      throw error;
    }
  }

  async transaction(callback) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getOne(text, params) {
    const res = await this.query(text, params);
    return res.rows[0] || null;
  }

  async getMany(text, params) {
    const res = await this.query(text, params);
    return res.rows;
  }

  async insert(text, params) {
    const res = await this.query(text, params);
    return res.rows[0] || res;
  }

  async update(text, params) {
    const res = await this.query(text, params);
    return res.rows[0] || res;
  }

  async delete(text, params) {
    const res = await this.query(text, params);
    return res.rowCount;
  }
}

module.exports = Query;