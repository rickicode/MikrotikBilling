const BaseModel = require('./BaseModel');

class UserRole extends BaseModel {
  constructor() {
    super('user_roles');
  };

    // UI restrictions
    this.ui_theme = data.ui_theme || 'default';
    this.custom_css = data.custom_css || '';
    this.navigation_customization = data.navigation_customization || {};
    this.dashboard_widgets = data.dashboard_widgets || [];
    this.default_landing_page = data.default_landing_page || '/dashboard';

    // Data access limits
    this.data_access_level = data.data_access_level || 'own'; // own, team, department, all
    this.date_range_limit_days = data.date_range_limit_days || 365;
    this.export_limit_records = data.export_limit_records || 10000;
    this.api_rate_limit = data.api_rate_limit || 1000; // requests per hour

    // Business rules
    this.require_approval_for = data.require_approval_for || [];
    this.approval_required_amount = data.approval_required_amount || 0;
    this.budget_limits = data.budget_limits || {};
    this.workflow_permissions = data.workflow_permissions || {};

    // Monitoring and audit
    this.require_activity_log = data.require_activity_log !== undefined ? data.require_activity_log : true;
    this.audit_level = data.audit_level || 'standard'; // minimal, standard, detailed, comprehensive
    this.alert_thresholds = data.alert_thresholds || {};

    // Status and metadata
    this.is_active = data.is_active !== undefined ? data.is_active : true;
    this.is_system_role = data.is_system_role !== undefined ? data.is_system_role : false;
    this.is_default_role = data.is_default_role !== undefined ? data.is_default_role : false;
    this.role_category = data.role_category || 'custom'; // system, business, technical, custom

    // User assignment
    this.user_count = data.user_count || 0;
    this.last_used = data.last_used || null;
    this.usage_frequency = data.usage_frequency || 'unknown';

    // Audit fields
    this.created_at = data.created_at || new Date().toISOString();
    this.updated_at = data.updated_at || new Date().toISOString();
    this.created_by = data.created_by || 'system';
    this.updated_by = data.updated_by || null;
  }

  // Create new user role
  static async create(data) {
    const db = await Database.getInstance();
    const userRole = new UserRole(data);

    try {
      const result = await this.db.query(`
        INSERT INTO user_roles (
          role_name, display_name, description, level, parent_role_id,
          child_role_ids, inherits_permissions, permissions, page_access,
          api_access, feature_access, can_access_admin_panel, can_manage_users,
          can_manage_settings, can_view_reports, can_create_content,
          can_edit_content, can_delete_content, can_export_data, can_import_data,
          can_run_tests, can_view_test_results, can_create_test_sessions,
          can_delete_test_sessions, can_manage_bugs, can_manage_customers,
          can_manage_vouchers, can_manage_pppoe, can_manage_profiles,
          can_manage_payments, can_manage_whatsapp, can_view_system_info,
          can_manage_backups, can_view_logs, can_system_maintenance, max_sessions,
          session_timeout_minutes, require_2fa, allowed_ip_ranges,
          time_restrictions, ui_theme, custom_css, navigation_customization,
          dashboard_widgets, default_landing_page, data_access_level,
          date_range_limit_days, export_limit_records, api_rate_limit,
          require_approval_for, approval_required_amount, budget_limits,
          workflow_permissions, require_activity_log, audit_level,
          alert_thresholds, is_active, is_system_role, is_default_role,
          role_category, user_count, last_used, usage_frequency,
          created_at, updated_at, created_by, updated_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51, $52, $53, $54, $55, $56, $57, $58, $59, $60, $61, $62, $63, $64, $65, $66, $67, $68, $69, $70, $71, $72, $73, $74, $75)
        RETURNING id
      `, [
        userRole.role_name,
        userRole.display_name,
        userRole.description,
        userRole.level,
        userRole.parent_role_id,
        JSON.stringify(userRole.child_role_ids),
        userRole.inherits_permissions,
        JSON.stringify(userRole.permissions),
        JSON.stringify(userRole.page_access),
        JSON.stringify(userRole.api_access),
        JSON.stringify(userRole.feature_access),
        userRole.can_access_admin_panel,
        userRole.can_manage_users,
        userRole.can_manage_settings,
        userRole.can_view_reports,
        userRole.can_create_content,
        userRole.can_edit_content,
        userRole.can_delete_content,
        userRole.can_export_data,
        userRole.can_import_data,
        userRole.can_run_tests,
        userRole.can_view_test_results,
        userRole.can_create_test_sessions,
        userRole.can_delete_test_sessions,
        userRole.can_manage_bugs,
        userRole.can_manage_customers,
        userRole.can_manage_vouchers,
        userRole.can_manage_pppoe,
        userRole.can_manage_profiles,
        userRole.can_manage_payments,
        userRole.can_manage_whatsapp,
        userRole.can_view_system_info,
        userRole.can_manage_backups,
        userRole.can_view_logs,
        userRole.can_system_maintenance,
        userRole.max_sessions,
        userRole.session_timeout_minutes,
        userRole.require_2fa,
        JSON.stringify(userRole.allowed_ip_ranges),
        JSON.stringify(userRole.time_restrictions),
        userRole.ui_theme,
        userRole.custom_css,
        JSON.stringify(userRole.navigation_customization),
        JSON.stringify(userRole.dashboard_widgets),
        userRole.default_landing_page,
        userRole.data_access_level,
        userRole.date_range_limit_days,
        userRole.export_limit_records,
        userRole.api_rate_limit,
        JSON.stringify(userRole.require_approval_for),
        userRole.approval_required_amount,
        JSON.stringify(userRole.budget_limits),
        JSON.stringify(userRole.workflow_permissions),
        userRole.require_activity_log,
        userRole.audit_level,
        JSON.stringify(userRole.alert_thresholds),
        userRole.is_active,
        userRole.is_system_role,
        userRole.is_default_role,
        userRole.role_category,
        userRole.user_count,
        userRole.last_used,
        userRole.usage_frequency,
        userRole.created_at,
        userRole.updated_at,
        userRole.created_by,
        userRole.updated_by
      ]);

      userRole.id = result.rows[0].id;
      return userRole;

    } catch (error) {
      throw new Error(`Failed to create user role: ${error.message}`);
    }
  }

  // Find user role by ID
  static async findById(id) {
    const db = await Database.getInstance();

    try {
      const row = await db.queryOne(`
        SELECT * FROM user_roles WHERE id = $1
      `, [id]);

      return row ? UserRole.fromRow(row) : null;

    } catch (error) {
      throw new Error(`Failed to find user role: ${error.message}`);
    }
  }

  // Find user role by name
  static async findByName(roleName) {
    const db = await Database.getInstance();

    try {
      const row = await db.queryOne(`
        SELECT * FROM user_roles WHERE role_name = $1
      `, [roleName]);

      return row ? UserRole.fromRow(row) : null;

    } catch (error) {
      throw new Error(`Failed to find user role by name: ${error.message}`);
    }
  }

  // Get all active user roles
  static async findAll(options = {}) {
    const db = await Database.getInstance();
    const {
      limit = 100,
      offset = 0,
      is_active = null,
      is_system_role = null,
      role_category = null,
      order_by = 'level',
      order_dir = 'DESC'
    } = options;

    try {
      let query = `
        SELECT * FROM user_roles
        WHERE 1=1
      `;
      const params = [];
      let paramIndex = 1;

      if (is_active !== null) {
        query += ` AND is_active = $${paramIndex++}`;
        params.push(is_active);
      }

      if (is_system_role !== null) {
        query += ` AND is_system_role = $${paramIndex++}`;
        params.push(is_system_role);
      }

      if (role_category) {
        query += ` AND role_category = $${paramIndex++}`;
        params.push(role_category);
      }

      query += ` ORDER BY ${order_by} ${order_dir} LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
      params.push(limit, offset);

      const result = await this.db.query(query, params);

      return result.rows.map(row => UserRole.fromRow(row));

    } catch (error) {
      throw new Error(`Failed to find user roles: ${error.message}`);
    }
  }

  // Get role hierarchy
  static async getHierarchy() {
    const db = await Database.getInstance();

    try {
      const result = await this.db.query(`
        SELECT * FROM user_roles
        WHERE is_active = 1
        ORDER BY level ASC, role_name ASC
      `);

      const roles = result.rows.map(row => UserRole.fromRow(row));

      // Build hierarchy tree
      const hierarchy = this.buildHierarchy(roles);
      return hierarchy;

    } catch (error) {
      throw new Error(`Failed to get role hierarchy: ${error.message}`);
    }
  }

  // Build role hierarchy
  static buildHierarchy(roles, parentId = null) {
    const children = roles.filter(role =>
      (parentId === null && role.parent_role_id === null) ||
      (parentId !== null && role.parent_role_id === parentId)
    );

    return children.map(role => ({
      ...role.toJSON(),
      children: this.buildHierarchy(roles, role.id),
      inherited_permissions: role.getInheritedPermissions(roles)
    }));
  }

  // Get inherited permissions
  getInheritedPermissions(allRoles) {
    if (!this.inherits_permissions || !this.parent_role_id) {
      return [];
    }

    const parentRole = allRoles.find(role => role.id === this.parent_role_id);
    if (!parentRole) {
      return [];
    }

    const parentPermissions = parentRole.getInheritedPermissions(allRoles);
    return [...new Set([...parentPermissions, ...parentRole.permissions])];
  }

  // Check if role has specific permission
  hasPermission(permission) {
    return this.permissions.includes(permission);
  }

  // Check if role can access specific page
  canAccessPage(pageUrl) {
    return this.page_access.length === 0 || this.page_access.includes(pageUrl) || this.page_access.some(pattern => {
      // Support wildcard patterns
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return regex.test(pageUrl);
    });
  }

  // Check if role can access specific API endpoint
  canAccessApi(apiEndpoint) {
    return this.api_access.length === 0 || this.api_access.includes(apiEndpoint) || this.api_access.some(pattern => {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return regex.test(apiEndpoint);
    });
  }

  // Check if role can use specific feature
  canUseFeature(feature) {
    return this.feature_access.includes(feature);
  }

  // Update user role
  async update(data) {
    const db = await Database.getInstance();

    try {
      // Update object properties
      Object.assign(this, data);
      this.updated_at = new Date().toISOString();

      await this.db.query(`
        UPDATE user_roles SET
          display_name = $1, description = $2, level = $3, parent_role_id = $4,
          child_role_ids = $5, inherits_permissions = $6, permissions = $7,
          page_access = $8, api_access = $9, feature_access = $10, can_access_admin_panel = $11,
          can_manage_users = $12, can_manage_settings = $13, can_view_reports = $14,
          can_create_content = $15, can_edit_content = $16, can_delete_content = $17,
          can_export_data = $18, can_import_data = $19, can_run_tests = $20,
          can_view_test_results = $21, can_create_test_sessions = $22, can_delete_test_sessions = $23,
          can_manage_bugs = $24, can_manage_customers = $25, can_manage_vouchers = $26,
          can_manage_pppoe = $27, can_manage_profiles = $28, can_manage_payments = $29,
          can_manage_whatsapp = $30, can_view_system_info = $31, can_manage_backups = $32,
          can_view_logs = $33, can_system_maintenance = $34, max_sessions = $35,
          session_timeout_minutes = $36, require_2fa = $37, allowed_ip_ranges = $38,
          time_restrictions = $39, ui_theme = $40, custom_css = $41,
          navigation_customization = $42, dashboard_widgets = $43, default_landing_page = $44,
          data_access_level = $45, date_range_limit_days = $46, export_limit_records = $47,
          api_rate_limit = $48, require_approval_for = $49, approval_required_amount = $50,
          budget_limits = $51, workflow_permissions = $52, require_activity_log = $53,
          audit_level = $54, alert_thresholds = $55, is_active = $56, role_category = $57,
          user_count = $58, last_used = $59, usage_frequency = $60, updated_by = $61
        WHERE id = $62
      `, [
        this.display_name,
        this.description,
        this.level,
        this.parent_role_id,
        JSON.stringify(this.child_role_ids),
        this.inherits_permissions,
        JSON.stringify(this.permissions),
        JSON.stringify(this.page_access),
        JSON.stringify(this.api_access),
        JSON.stringify(this.feature_access),
        this.can_access_admin_panel,
        this.can_manage_users,
        this.can_manage_settings,
        this.can_view_reports,
        this.can_create_content,
        this.can_edit_content,
        this.can_delete_content,
        this.can_export_data,
        this.can_import_data,
        this.can_run_tests,
        this.can_view_test_results,
        this.can_create_test_sessions,
        this.can_delete_test_sessions,
        this.can_manage_bugs,
        this.can_manage_customers,
        this.can_manage_vouchers,
        this.can_manage_pppoe,
        this.can_manage_profiles,
        this.can_manage_payments,
        this.can_manage_whatsapp,
        this.can_view_system_info,
        this.can_manage_backups,
        this.can_view_logs,
        this.can_system_maintenance,
        this.max_sessions,
        this.session_timeout_minutes,
        this.require_2fa,
        JSON.stringify(this.allowed_ip_ranges),
        JSON.stringify(this.time_restrictions),
        this.ui_theme,
        this.custom_css,
        JSON.stringify(this.navigation_customization),
        JSON.stringify(this.dashboard_widgets),
        this.default_landing_page,
        this.data_access_level,
        this.date_range_limit_days,
        this.export_limit_records,
        this.api_rate_limit,
        JSON.stringify(this.require_approval_for),
        this.approval_required_amount,
        JSON.stringify(this.budget_limits),
        JSON.stringify(this.workflow_permissions),
        this.require_activity_log,
        this.audit_level,
        JSON.stringify(this.alert_thresholds),
        this.is_active,
        this.role_category,
        this.user_count,
        this.last_used,
        this.usage_frequency,
        this.updated_by,
        this.id
      ]);

      return this;

    } catch (error) {
      throw new Error(`Failed to update user role: ${error.message}`);
    }
  }

  // Add permission to role
  async addPermission(permission) {
    if (!this.permissions.includes(permission)) {
      this.permissions.push(permission);
      return this.update({ permissions: this.permissions });
    }
    return this;
  }

  // Remove permission from role
  async removePermission(permission) {
    this.permissions = this.permissions.filter(p => p !== permission);
    return this.update({ permissions: this.permissions });
  }

  // Add page access
  async addPageAccess(pageUrl) {
    if (!this.page_access.includes(pageUrl)) {
      this.page_access.push(pageUrl);
      return this.update({ page_access: this.page_access });
    }
    return this;
  }

  // Remove page access
  async removePageAccess(pageUrl) {
    this.page_access = this.page_access.filter(p => p !== pageUrl);
    return this.update({ page_access: this.page_access });
  }

  // Activate/deactivate role
  async activate() {
    return this.update({ is_active: true });
  }

  async deactivate() {
    return this.update({ is_active: false });
  }

  // Delete user role
  async delete() {
    const db = await Database.getInstance();

    try {
      // Check if role is assigned to users
      const userCount = await db.queryOne('SELECT COUNT(*) as count FROM admin_users WHERE role_id = $1', [this.id]);

      if (userCount.count > 0) {
        throw new Error('Cannot delete role that is assigned to users. Reassign users first.');
      }

      // Check if other roles depend on this role
      const childCount = await db.queryOne('SELECT COUNT(*) as count FROM user_roles WHERE parent_role_id = $1', [this.id]);

      if (childCount.count > 0) {
        throw new Error('Cannot delete role that has child roles. Update child roles first.');
      }

      const result = await this.db.query('DELETE FROM user_roles WHERE id = $1', [this.id]);

      return result.rowCount > 0;

    } catch (error) {
      throw new Error(`Failed to delete user role: ${error.message}`);
    }
  }

  // Update user count
  async updateUserCount() {
    const db = await Database.getInstance();

    try {
      const result = await db.queryOne('SELECT COUNT(*) as count FROM admin_users WHERE role_id = $1', [this.id]);

      return this.update({ user_count: result.count });

    } catch (error) {
      throw new Error(`Failed to update user count: ${error.message}`);
    }
  }

  // Get role statistics
  static async getStatistics() {
    const db = await Database.getInstance();

    try {
      const stats = await db.queryOne(`
        SELECT
          COUNT(*) as total_roles,
          COUNT(CASE WHEN is_active = 1 THEN 1 END) as active_roles,
          COUNT(CASE WHEN is_system_role = 1 THEN 1 END) as system_roles,
          COUNT(CASE WHEN is_default_role = 1 THEN 1 END) as default_roles,
          COUNT(CASE WHEN role_category = 'business' THEN 1 END) as business_roles,
          COUNT(CASE WHEN role_category = 'technical' THEN 1 END) as technical_roles,
          COUNT(CASE WHEN role_category = 'custom' THEN 1 END) as custom_roles,
          MAX(level) as max_level,
          MIN(level) as min_level,
          SUM(user_count) as total_assigned_users
        FROM user_roles
      `);

      return stats;

    } catch (error) {
      throw new Error(`Failed to get role statistics: ${error.message}`);
    }
  }

  // Search user roles
  static async search(searchTerm, options = {}) {
    const db = await Database.getInstance();
    const { limit = 50, offset = 0 } = options;

    try {
      const searchPattern = `%${searchTerm}%`;
      const result = await this.db.query(`
        SELECT * FROM user_roles
        WHERE role_name LIKE $1 OR display_name LIKE $2 OR description LIKE $3
        ORDER BY level DESC, role_name
        LIMIT $4 OFFSET $5
      `, [searchPattern, searchPattern, searchPattern, limit, offset]);

      return result.rows.map(row => UserRole.fromRow(row));

    } catch (error) {
      throw new Error(`Failed to search user roles: ${error.message}`);
    }
  }

  // Validate role structure
  static async validateStructure() {
    const db = await Database.getInstance();

    try {
      // Check for circular references
      const circularResult = await this.db.query(`
        SELECT r1.id, r1.role_name, r1.parent_role_id, r2.parent_role_id as parent_parent_id
        FROM user_roles r1
        LEFT JOIN user_roles r2 ON r1.parent_role_id = r2.id
        WHERE r1.parent_role_id = r1.id OR r2.parent_role_id = r1.id
      `);

      const circular = circularResult.rows;

      // Check for orphaned roles
      const orphanResult = await this.db.query(`
        SELECT * FROM user_roles
        WHERE parent_role_id IS NOT NULL
          AND parent_role_id NOT IN (SELECT id FROM user_roles WHERE is_active = 1)
      `);

      const orphans = orphanResult.rows;

      // Check for duplicate role names
      const duplicateResult = await this.db.query(`
        SELECT role_name, COUNT(*) as count
        FROM user_roles
        GROUP BY role_name
        HAVING COUNT(*) > 1
      `);

      const duplicates = duplicateResult.rows;

      return {
        circular_references: circular.length,
        orphaned_roles: orphans.length,
        duplicate_names: duplicates.length,
        details: {
          circular_references: circular,
          orphaned_roles: orphans,
          duplicate_names: duplicates
        }
      };

    } catch (error) {
      throw new Error(`Failed to validate role structure: ${error.message}`);
    }
  }

  // Convert database row to UserRole instance
  static fromRow(row) {
    return new UserRole({
      ...row,
      child_role_ids: row.child_role_ids ? JSON.parse(row.child_role_ids) : [],
      permissions: row.permissions ? JSON.parse(row.permissions) : [],
      page_access: row.page_access ? JSON.parse(row.page_access) : [],
      api_access: row.api_access ? JSON.parse(row.api_access) : [],
      feature_access: row.feature_access ? JSON.parse(row.feature_access) : [],
      allowed_ip_ranges: row.allowed_ip_ranges ? JSON.parse(row.allowed_ip_ranges) : [],
      time_restrictions: row.time_restrictions ? JSON.parse(row.time_restrictions) : {},
      navigation_customization: row.navigation_customization ? JSON.parse(row.navigation_customization) : {},
      dashboard_widgets: row.dashboard_widgets ? JSON.parse(row.dashboard_widgets) : [],
      require_approval_for: row.require_approval_for ? JSON.parse(row.require_approval_for) : [],
      budget_limits: row.budget_limits ? JSON.parse(row.budget_limits) : {},
      workflow_permissions: row.workflow_permissions ? JSON.parse(row.workflow_permissions) : {},
      alert_thresholds: row.alert_thresholds ? JSON.parse(row.alert_thresholds) : {}
    });
  }

  // Export to JSON
  toJSON() {
    return {
      id: this.id,
      role_name: this.role_name,
      display_name: this.display_name,
      description: this.description,
      level: this.level,
      parent_role_id: this.parent_role_id,
      child_role_ids: this.child_role_ids,
      inherits_permissions: this.inherits_permissions,
      permissions: this.permissions,
      page_access: this.page_access,
      api_access: this.api_access,
      feature_access: this.feature_access,
      can_access_admin_panel: this.can_access_admin_panel,
      can_manage_users: this.can_manage_users,
      can_manage_settings: this.can_manage_settings,
      can_view_reports: this.can_view_reports,
      can_create_content: this.can_create_content,
      can_edit_content: this.can_edit_content,
      can_delete_content: this.can_delete_content,
      can_export_data: this.can_export_data,
      can_import_data: this.can_import_data,
      can_run_tests: this.can_run_tests,
      can_view_test_results: this.can_view_test_results,
      can_create_test_sessions: this.can_create_test_sessions,
      can_delete_test_sessions: this.can_delete_test_sessions,
      can_manage_bugs: this.can_manage_bugs,
      can_manage_customers: this.can_manage_customers,
      can_manage_vouchers: this.can_manage_vouchers,
      can_manage_pppoe: this.can_manage_pppoe,
      can_manage_profiles: this.can_manage_profiles,
      can_manage_payments: this.can_manage_payments,
      can_manage_whatsapp: this.can_manage_whatsapp,
      can_view_system_info: this.can_view_system_info,
      can_manage_backups: this.can_manage_backups,
      can_view_logs: this.can_view_logs,
      can_system_maintenance: this.can_system_maintenance,
      max_sessions: this.max_sessions,
      session_timeout_minutes: this.session_timeout_minutes,
      require_2fa: this.require_2fa,
      allowed_ip_ranges: this.allowed_ip_ranges,
      time_restrictions: this.time_restrictions,
      ui_theme: this.ui_theme,
      custom_css: this.custom_css,
      navigation_customization: this.navigation_customization,
      dashboard_widgets: this.dashboard_widgets,
      default_landing_page: this.default_landing_page,
      data_access_level: this.data_access_level,
      date_range_limit_days: this.date_range_limit_days,
      export_limit_records: this.export_limit_records,
      api_rate_limit: this.api_rate_limit,
      require_approval_for: this.require_approval_for,
      approval_required_amount: this.approval_required_amount,
      budget_limits: this.budget_limits,
      workflow_permissions: this.workflow_permissions,
      require_activity_log: this.require_activity_log,
      audit_level: this.audit_level,
      alert_thresholds: this.alert_thresholds,
      is_active: this.is_active,
      is_system_role: this.is_system_role,
      is_default_role: this.is_default_role,
      role_category: this.role_category,
      user_count: this.user_count,
      last_used: this.last_used,
      usage_frequency: this.usage_frequency,
      created_at: this.created_at,
      updated_at: this.updated_at,
      created_by: this.created_by,
      updated_by: this.updated_by
    };
  }
}

module.exports = UserRole;