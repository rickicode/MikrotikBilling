/**
 * Voucher Route Definitions
 * Voucher management and generation endpoints
 * @version 1.0.0
 */

const RouteMiddleware = require('../../middleware/route-middleware');

class VoucherRoutes {
  constructor() {
    this.routeInfo = [
      {
        method: 'GET',
        path: '/',
        summary: 'List vouchers',
        description: 'Get paginated list of vouchers with filtering',
        tags: ['vouchers']
      },
      {
        method: 'POST',
        path: '/generate',
        summary: 'Generate vouchers',
        description: 'Batch generate new vouchers',
        tags: ['vouchers']
      },
      {
        method: 'GET',
        path: '/profiles',
        summary: 'Get voucher profiles',
        description: 'Get available Mikrotik profiles for vouchers',
        tags: ['vouchers']
      },
      {
        method: 'POST',
        path: '/print',
        summary: 'Print vouchers',
        description: 'Generate printable vouchers',
        tags: ['vouchers']
      },
      {
        method: 'GET',
        path: '/:id',
        summary: 'Get voucher',
        description: 'Get voucher by ID',
        tags: ['vouchers']
      },
      {
        method: 'DELETE',
        path: '/:id',
        summary: 'Delete voucher',
        description: 'Delete voucher (admin only)',
        tags: ['vouchers']
      }
    ];
  }

  /**
   * Register all voucher routes
   */
  register(fastify, options = {}) {
    const middleware = new RouteMiddleware(fastify);
    const { getCommon } = middleware;
    const helpers = fastify.routeHelpers || fastify;

    // GET /vouchers - List vouchers
    fastify.get('/', {
      preHandler: [getCommon.authenticated, middleware.rateLimit({ max: 100 })],
      schema: {
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            search: { type: 'string', maxLength: 100 },
            status: { type: 'string', enum: ['active', 'used', 'expired'] },
            profile_id: { type: 'string', format: 'uuid' },
            generated_after: { type: 'string', format: 'date-time' },
            generated_before: { type: 'string', format: 'date-time' }
          }
        }
      }
    }, fastify.asyncHandler(async (request, reply) => {
      const { page, limit, offset } = helpers.getPaginationParams(request.query);
      const { search, searchClause, searchParams, filters } = helpers.getSearchParams(
        request.query,
        ['v.code', 'v.username', 'pr.name']
      );

      const result = await helpers.query(`
        SELECT v.*,
               pr.name as profile_name,
               pr.price_sell as profile_price,
               pr.validity as profile_validity
        FROM vouchers v
        LEFT JOIN profiles pr ON v.profile_id = pr.id
        WHERE 1=1
        ${searchClause}
        ${filters.status ? `AND v.status = '${filters.status}'` : ''}
        ${filters.profile_id ? `AND v.profile_id = '${filters.profile_id}'` : ''}
        ORDER BY v.created_at DESC
        LIMIT $${searchParams.length + 1} OFFSET $${searchParams.length + 2}
      `, [...searchParams, limit, offset]);

      const totalResult = await helpers.query(`
        SELECT COUNT(*) as count 
        FROM vouchers v 
        WHERE 1=1
        ${searchClause}
        ${filters.status ? `AND v.status = '${filters.status}'` : ''}
        ${filters.profile_id ? `AND v.profile_id = '${filters.profile_id}'` : ''}
      `, searchParams);

      const total = parseInt(totalResult.rows[0].count);

      // Publish event
      await helpers.publishEvent('vouchers.listed', {
        count: result.rows.length,
        total,
        filters
      });

      return reply.paginated(result.rows, total, page, limit, 'Vouchers retrieved successfully');
    }));

    // POST /vouchers/generate - Generate vouchers
    fastify.post('/generate', {
      preHandler: [getCommon.authenticated, middleware.requireRole(['admin', 'operator'])],
      schema: {
        body: {
          type: 'object',
          required: ['profile_id', 'quantity'],
          properties: {
            profile_id: { type: 'string', format: 'uuid' },
            quantity: { type: 'integer', minimum: 1, maximum: 1000 },
            prefix: { type: 'string', maxLength: 10, pattern: '^[A-Z0-9]+$' },
            price_sell: { type: 'number', minimum: 0 },
            valid_days: { type: 'integer', minimum: 1, maximum: 365 }
          }
        }
      }
    }, fastify.asyncHandler(async (request, reply) => {
      const { profile_id, quantity, prefix, price_sell, valid_days } = request.body;
      const user = request.user;

      // Get profile details
      const profileResult = await helpers.query(
        'SELECT * FROM profiles WHERE id = $1 AND enabled = true',
        [profile_id],
        { notFound: { resource: 'Profile' } }
      );

      const profile = profileResult.rows[0];

      // Generate vouchers
      const vouchers = [];
      const mikrotikBatch = [];

      for (let i = 0; i < quantity; i++) {
        const code = prefix ? `${prefix}-${Math.random().toString(36).substr(2, 8).toUpperCase()}` 
                           : Math.random().toString(36).substr(2, 10).toUpperCase();
        const username = `HS-${code}`;
        const password = Math.random().toString(36).substr(2, 12);

        const voucher = {
          code,
          username,
          password,
          profile_id,
          status: 'active',
          created_by: user.id,
          price_sell: price_sell || profile.price_sell,
          valid_until: new Date(Date.now() + (valid_days || profile.validity) * 24 * 60 * 60 * 1000)
        };

        vouchers.push(voucher);

        // Prepare Mikrotik batch data
        mikrotikBatch.push({
          name: username,
          password: password,
          profile: profile.name,
          comment: `VOUCHER_SYSTEM|${price_sell || profile.price_sell}|0|${voucher.valid_until.toISOString()}`
        });
      }

      // Store in database
      const result = await helpers.transaction(async (client) => {
        const insertedVouchers = [];
        
        for (const voucher of vouchers) {
          const insertResult = await client.query(`
            INSERT INTO vouchers (code, username, password, profile_id, status, created_by, 
                                price_sell, valid_until, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
            RETURNING *
          `, [
            voucher.code, voucher.username, voucher.password, voucher.profile_id,
            voucher.status, voucher.created_by, voucher.price_sell, voucher.valid_until
          ]);
          
          insertedVouchers.push(insertResultResult.rows[0]);
        }

        return insertedVouchers;
      });

      // Create Mikrotik users
      try {
        await fastify.mikrotikService.createHotspotUsers(mikrotikBatch);
      } catch (error) {
        fastify.log.error('Failed to create Mikrotik users', { error: error.message });
        // Don't fail the request, but log the error
      }

      // Publish event
      await helpers.publishEvent('vouchers.generated', {
        profileId: profile_id,
        profileName: profile.name,
        quantity,
        prefix,
        generatedBy: user.id,
        totalValue: quantity * (price_sell || profile.price_sell)
      });

      // Record metrics
      await helpers.recordMetric('vouchers_generated', quantity, {
        profile_id: profile_id,
        generated_by: user.id
      });

      return reply.code(201).send(helpers.success(result, 'Vouchers generated successfully'));
    }));

    // GET /vouchers/profiles - Get available profiles
    fastify.get('/profiles', {
      preHandler: [getCommon.authenticated, middleware.cache({ ttl: 600 })]
    }, fastify.asyncHandler(async (request, reply) => {
      const result = await helpers.query(`
        SELECT p.*, 
               COUNT(v.id) as voucher_count
        FROM profiles p
        LEFT JOIN vouchers v ON p.id = v.profile_id
        WHERE p.enabled = true 
        AND p.type = 'hotspot'
        AND p.comment LIKE '%VOUCHER_SYSTEM%'
        GROUP BY p.id
        ORDER BY p.name
      `);

      return reply.send(helpers.success(result.rows, 'Voucher profiles retrieved successfully'));
    }));

    // GET /vouchers/:id - Get voucher details
    fastify.get('/:id', {
      preHandler: [getCommon.authenticated],
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' }
          }
        }
      }
    }, fastify.asyncHandler(async (request, reply) => {
      const { id } = request.params;

      const result = await helpers.query(`
        SELECT v.*,
               pr.name as profile_name,
               pr.price_sell as profile_price,
               pr.validity as profile_validity,
               au.name as created_by_name
        FROM vouchers v
        LEFT JOIN profiles pr ON v.profile_id = pr.id
        LEFT JOIN admin_users au ON v.created_by = au.id
        WHERE v.id = $1
      `, [id], { notFound: { resource: 'Voucher' } });

      const voucher = result.rows[0];

      // Add usage info if used
      if (voucher.status === 'used') {
        const usageResult = await helpers.query(`
          SELECT first_login_at, last_logout_at, data_used
          FROM voucher_usage_logs
          WHERE voucher_id = $1
          ORDER BY first_login_at DESC
          LIMIT 1
        `, [id]);

        if (usageResult.rows.length > 0) {
          voucher.usage = usageResult.rows[0];
        }
      }

      return reply.send(helpers.success(voucher, 'Voucher retrieved successfully'));
    }));

    // DELETE /vouchers/:id - Delete voucher
    fastify.delete('/:id', {
      preHandler: [getCommon.authenticated, middleware.requireRole(['admin'])],
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' }
          }
        }
      }
    }, fastify.asyncHandler(async (request, reply) => {
      const { id } = request.params;

      // Check if voucher exists and can be deleted
      const voucherResult = await helpers.query(
        'SELECT * FROM vouchers WHERE id = $1',
        [id],
        { notFound: { resource: 'Voucher' } }
      );

      const voucher = voucherResult.rows[0];

      if (voucher.status === 'used') {
        return reply.code(400).send(helpers.error('Cannot delete used voucher'));
      }

      // Delete from Mikrotik
      try {
        await fastify.mikrotikService.deleteHotspotUser(voucher.username);
      } catch (error) {
        fastify.log.warn('Failed to delete Mikrotik user', { 
          username: voucher.username, 
          error: error.message 
        });
      }

      // Delete from database
      await helpers.query('DELETE FROM vouchers WHERE id = $1', [id]);

      // Publish event
      await helpers.publishEvent('vouchers.deleted', {
        voucherId: id,
        voucherCode: voucher.code,
        deletedBy: request.user.id
      });

      return reply.send(helpers.success(null, 'Voucher deleted successfully'));
    }));

    fastify.log.info('Voucher routes registered');
  }

  /**
   * Get route information for documentation
   */
  getRouteInfo() {
    return this.routeInfo;
  }
}

module.exports = new VoucherRoutes();