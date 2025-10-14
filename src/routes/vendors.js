const AuthMiddleware = require('../middleware/auth');
const { db } = require('../database/DatabaseManager');

// Helper functions for detailed error handling
function logDetailedError(fastify, error, request, context = {}) {
  fastify.log.error(`${context.operation || 'API Error'}:`, {
    error: error.message,
    stack: error.stack,
    url: request.url,
    method: request.method,
    ip: request.ip,
    query: request.query,
    params: request.params,
    body: context.body || {},
    ...context
  });
}

function sendDetailedError(reply, error, request, context = {}) {
  return reply.code(500).send({
    success: false,
    error: context.errorTitle || 'Database Operation Failed',
    details: {
      message: error.message,
      type: error.constructor.name,
      url: request.url,
      method: request.method,
      timestamp: new Date().toISOString(),
      ...context.details
    }
  });
}

async function vendorRoutes(fastify, options) {
  const auth = new AuthMiddleware(fastify);

  // Vendor list
  fastify.get('/', {
    preHandler: [auth.requireRole('admin')]
  }, async (request, reply) => {
    try {
      const page = parseInt(request.query.page) || 1;
      const limit = 20;
      const offset = (page - 1) * limit;
      const search = request.query.search || '';
      const status = request.query.status || '';

      let whereClause = 'WHERE 1=1';
      const params = [];
      let paramIndex = 0;

      if (search) {
        whereClause += ' AND (name LIKE $1 OR contact_person LIKE $2 OR phone LIKE $3 OR email LIKE $4)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        paramIndex = 4;
      }

      if (status) {
        whereClause += ` AND status = $${paramIndex + 1}`;
        params.push(status);
        paramIndex++;
      }

      // Remove duplicate DatabaseManager import, we already have it
      const vendors = await db.query(`
        SELECT v.*,
               (SELECT COUNT(*) FROM vouchers WHERE vendor_id = v.id) as total_vouchers,
               (SELECT COUNT(*) FROM vouchers WHERE vendor_id = v.id AND status = 'active') as active_vouchers
        FROM vendors v
        ${whereClause}
        ORDER BY v.created_at DESC
        LIMIT $${paramIndex + 1} OFFSET $${paramIndex + 2}
      `, [...params, limit, offset]);

      const totalResult = await db.query(`
        SELECT COUNT(*) as count
        FROM vendors v
        ${whereClause}
      `, params);

      return reply.view('vendors/index', {
        admin: request.admin,
        vendors: vendors.rows,
        pagination: {
          current: page,
          total: Math.ceil(totalResult.rows[0].count / limit),
          from: offset + 1,
          to: Math.min(offset + limit, totalResult.rows[0].count),
          total: totalResult.rows[0].count
        },
        search,
        status
      });
    } catch (error) {
      logDetailedError(fastify, error, request, { operation: 'Vendor List' });
      return sendDetailedError(reply, error, request, { errorTitle: 'Failed to load vendors' });
    }
  });

  // Create vendor form
  fastify.get('/create', {
    preHandler: [auth.requireRole('admin')]
  }, async (request, reply) => {
    try {
      return reply.view('vendors/create', {
        admin: request.admin
      });
    } catch (error) {
      logDetailedError(fastify, error, request, { operation: 'Create Vendor Form' });
      return reply.view('vendors/create', {
        admin: request.admin,
        error: 'Failed to load form'
      });
    }
  });

  // Create vendor
  fastify.post('/', {
    preHandler: [auth.requireRole('admin')]
  }, async (request, reply) => {
    const { name, contact_person, phone, email, address, status } = request.body;

    try {
      // Check if vendor name already exists
      const existingVendorResult = await db.query(
        'SELECT id FROM vendors WHERE name = $1',
        [name]
      );

      if (existingVendorResult.rows && existingVendorResult.rows.length > 0) {
        return reply.view('vendors/create', {
          admin: request.admin,
          error: 'Vendor dengan nama tersebut sudah ada',
          formData: request.body
        });
      }

      // Insert vendor
      const result = await db.query(`
        INSERT INTO vendors (name, contact_person, phone, email, address, status)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [name, contact_person, phone, email, address, status || 'active']);

      return reply.redirect('/vendors?success=Vendor berhasil ditambahkan');
    } catch (error) {
      logDetailedError(fastify, error, request, {
        operation: 'Create Vendor',
        body: request.body
      });
      return reply.view('vendors/create', {
        admin: request.admin,
        error: 'Failed to create vendor',
        formData: request.body
      });
    }
  });

  // Edit vendor form
  fastify.get('/:id/edit', {
    preHandler: [auth.requireRole('admin')]
  }, async (request, reply) => {
    try {
      const vendorResult = await db.query(
        'SELECT * FROM vendors WHERE id = $1',
        [request.params.id]
      );

      if (!vendorResult.rows || vendorResult.rows.length === 0) {
        return reply.redirect('/vendors?error=Vendor tidak ditemukan');
      }

      return reply.view('vendors/edit', {
        admin: request.admin,
        vendor: vendorResult.rows[0]
      });
    } catch (error) {
      logDetailedError(fastify, error, request, {
        operation: 'Edit Vendor Form',
        vendorId: request.params.id
      });
      return reply.redirect('/vendors?error=Failed to load vendor');
    }
  });

  // Update vendor
  fastify.post('/:id', {
    preHandler: [auth.requireRole('admin')]
  }, async (request, reply) => {
    const { name, contact_person, phone, email, address, status } = request.body;
    const vendorId = request.params.id;

    try {
      // Check if vendor name already exists (excluding current vendor)
      const existingVendorResult = await db.query(
        'SELECT id FROM vendors WHERE name = $1 AND id != $2',
        [name, vendorId]
      );

      if (existingVendorResult.rows && existingVendorResult.rows.length > 0) {
        const vendorResult = await db.query('SELECT * FROM vendors WHERE id = $1', [vendorId]);
        return reply.view('vendors/edit', {
          admin: request.admin,
          error: 'Vendor dengan nama tersebut sudah ada',
          vendor: vendorResult.rows && vendorResult.rows.length > 0 ? vendorResult.rows[0] : null,
          formData: request.body
        });
      }

      // Update vendor
      await db.query(`
        UPDATE vendors
        SET name = $1, contact_person = $2, phone = $3, email = $4, address = $5, status = $6
        WHERE id = $7
      `, [name, contact_person, phone, email, address, status, vendorId]);

      return reply.redirect('/vendors?success=Vendor berhasil diperbarui');
    } catch (error) {
      logDetailedError(fastify, error, request, {
        operation: 'Update Vendor',
        vendorId: vendorId,
        body: request.body
      });
      const vendorResult = await db.query('SELECT * FROM vendors WHERE id = $1', [vendorId]);
      return reply.view('vendors/edit', {
        admin: request.admin,
        error: 'Failed to update vendor',
        vendor: vendorResult.rows && vendorResult.rows.length > 0 ? vendorResult.rows[0] : null,
        formData: request.body
      });
    }
  });

  // Delete vendor
  fastify.post('/:id/delete', {
    preHandler: [auth.requireRole('admin')]
  }, async (request, reply) => {
    try {
      const vendorId = request.params.id;

      // Check if vendor has associated vouchers
      const voucherCountResult = await db.query(
        'SELECT COUNT(*) as count FROM vouchers WHERE vendor_id = $1',
        [vendorId]
      );

      if (voucherCountResult.rows && voucherCountResult.rows.length > 0 && voucherCountResult.rows[0].count > 0) {
        return reply.redirect('/vendors?error=Vendor tidak dapat dihapus karena masih memiliki voucher terkait');
      }

      // Delete vendor
      await db.query('DELETE FROM vendors WHERE id = $1', [vendorId]);

      return reply.redirect('/vendors?success=Vendor berhasil dihapus');
    } catch (error) {
      logDetailedError(fastify, error, request, {
        operation: 'Delete Vendor',
        vendorId: request.params.id
      });
      return reply.redirect('/vendors?error=Failed to delete vendor');
    }
  });

  // Toggle vendor status
  fastify.post('/:id/toggle', {
    preHandler: [auth.requireRole('admin')]
  }, async (request, reply) => {
    try {
      const vendorResult = await db.query(
        'SELECT status FROM vendors WHERE id = $1',
        [request.params.id]
      );

      if (!vendorResult.rows || vendorResult.rows.length === 0) {
        return reply.redirect('/vendors?error=Vendor tidak ditemukan');
      }

      const vendor = vendorResult.rows[0];
      const newStatus = vendor.status === 'active' ? 'inactive' : 'active';

      await db.query(
        'UPDATE vendors SET status = $1 WHERE id = $2',
        [newStatus, request.params.id]
      );

      return reply.redirect('/vendors?success=Status vendor berhasil diperbarui');
    } catch (error) {
      logDetailedError(fastify, error, request, {
        operation: 'Toggle Vendor Status',
        vendorId: request.params.id
      });
      return reply.redirect('/vendors?error=Failed to toggle vendor status');
    }
  });
}

module.exports = vendorRoutes;