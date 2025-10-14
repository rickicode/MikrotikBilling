const BaseModel = require('./BaseModel');

class NavigationMenu extends BaseModel {
  constructor() {
    super('navigation_menus');
  };
    this.automation_coverage = data.automation_coverage || 0; // percentage

    // Content and features
    this.description = data.description || '';
    this.keywords = data.keywords || [];
    this.content_type = data.content_type || 'page'; // page, modal, popup, download, external
    this.functionality_type = data.functionality_type || 'navigation'; // navigation, action, toggle, dropdown

    // UI/UX properties
    this.css_classes = data.css_classes || [];
    this.data_attributes = data.data_attributes || {};
    this.responsive_behavior = data.responsive_behavior || 'visible'; // visible, hidden, collapsed, transformed
    this.mobile_behavior = data.mobile_behavior || 'visible'; // visible, hidden, hamburger_menu, drawer

    // Performance metrics
    this.page_weight = data.page_weight || null; // bytes
    this.resource_count = data.resource_count || 0;
    self.dom_complexity = data.dom_complexity || 0; // number of DOM elements
    this.accessibility_score = data.accessibility_score || 0; // 0-100

    // Business metrics
    this.usage_frequency = data.usage_frequency || 'unknown'; // high, medium, low, unknown
    this.business_criticality = data.business_criticality || 'medium'; // high, medium, low
    this.user_satisfaction = data.user_satisfaction || 0; // 1-5 scale
    this.conversion_impact = data.conversion_impact || 0; // 0-1 scale

    // Dependencies and relationships
    this.dependencies = data.dependencies || []; // Other menu items this depends on
    this.dependents = data.dependents || []; // Menu items that depend on this
    this.related_pages = data.related_pages || []; // Related but not in navigation
    this.external_links = data.external_links || []; // External URLs this page links to

    // Development metadata
    this.template_file = data.template_file || '';
    this.route_handler = data.route_handler || '';
    this.controller = data.controller || '';
    this.last_modified = data.last_modified || null;
    this.version = data.version || '1.0.0';

    // Audit fields
    this.created_at = data.created_at || new Date().toISOString();
    this.updated_at = data.updated_at || new Date().toISOString();
    this.created_by = data.created_by || 'system_scan';
    this.updated_by = data.updated_by || null;
  }

  // Create new navigation menu item
  static async create(data) {
    const db = await Database.getInstance();
    const navMenu = new NavigationMenu(data);

    try {
      const result = await this.db.query(`
        INSERT INTO navigation_menus (
          menu_text, url_path, menu_type, menu_order, parent_id, menu_depth,
          menu_path, icon_class, badge_text, target, required_permissions,
          required_roles, is_active, is_visible, page_exists, page_status,
          last_checked, response_code, load_time, test_status, last_tested,
          test_results_summary, automation_coverage, description, keywords,
          content_type, functionality_type, css_classes, data_attributes,
          responsive_behavior, mobile_behavior, page_weight, resource_count,
          dom_complexity, accessibility_score, usage_frequency,
          business_criticality, user_satisfaction, conversion_impact,
          dependencies, dependents, related_pages, external_links,
          template_file, route_handler, controller, last_modified, version,
          created_at, updated_at, created_by, updated_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51, $52, $53, $54, $55, $56, $57)
        RETURNING id
      `, [
        navMenu.menu_text,
        navMenu.url_path,
        navMenu.menu_type,
        navMenu.menu_order,
        navMenu.parent_id,
        navMenu.menu_depth,
        navMenu.menu_path,
        navMenu.icon_class,
        navMenu.badge_text,
        navMenu.target,
        JSON.stringify(navMenu.required_permissions),
        JSON.stringify(navMenu.required_roles),
        navMenu.is_active,
        navMenu.is_visible,
        navMenu.page_exists,
        navMenu.page_status,
        navMenu.last_checked,
        navMenu.response_code,
        navMenu.load_time,
        navMenu.test_status,
        navMenu.last_tested,
        JSON.stringify(navMenu.test_results_summary),
        navMenu.automation_coverage,
        navMenu.description,
        JSON.stringify(navMenu.keywords),
        navMenu.content_type,
        navMenu.functionality_type,
        JSON.stringify(navMenu.css_classes),
        JSON.stringify(navMenu.data_attributes),
        navMenu.responsive_behavior,
        navMenu.mobile_behavior,
        navMenu.page_weight,
        navMenu.resource_count,
        navMenu.dom_complexity,
        navMenu.accessibility_score,
        navMenu.usage_frequency,
        navMenu.business_criticality,
        navMenu.user_satisfaction,
        navMenu.conversion_impact,
        JSON.stringify(navMenu.dependencies),
        JSON.stringify(navMenu.dependents),
        JSON.stringify(navMenu.related_pages),
        JSON.stringify(navMenu.external_links),
        navMenu.template_file,
        navMenu.route_handler,
        navMenu.controller,
        navMenu.last_modified,
        navMenu.version,
        navMenu.created_at,
        navMenu.updated_at,
        navMenu.created_by,
        navMenu.updated_by
      ]);

      navMenu.id = result.rows[0].id;
      return navMenu;

    } catch (error) {
      throw new Error(`Failed to create navigation menu item: ${error.message}`);
    }
  }

  // Find navigation menu item by ID
  static async findById(id) {
    const db = await Database.getInstance();

    try {
      const row = await db.queryOne(`
        SELECT * FROM navigation_menus WHERE id = $1
      `, [id]);

      return row ? NavigationMenu.fromRow(row) : null;

    } catch (error) {
      throw new Error(`Failed to find navigation menu item: ${error.message}`);
    }
  }

  // Find navigation menu item by URL path
  static async findByUrlPath(urlPath) {
    const db = await Database.getInstance();

    try {
      const result = await this.db.query(`
        SELECT * FROM navigation_menus WHERE url_path = $1 ORDER BY menu_depth, menu_order
      `, [urlPath]);

      return result.rows.map(row => NavigationMenu.fromRow(row));

    } catch (error) {
      throw new Error(`Failed to find navigation menu items by URL: ${error.message}`);
    }
  }

  // Get root navigation items (no parent)
  static async findRootItems() {
    const db = await Database.getInstance();

    try {
      const result = await this.db.query(`
        SELECT * FROM navigation_menus
        WHERE parent_id IS NULL AND is_active = 1 AND is_visible = 1
        ORDER BY menu_order, menu_text
      `);

      return result.rows.map(row => NavigationMenu.fromRow(row));

    } catch (error) {
      throw new Error(`Failed to find root navigation items: ${error.message}`);
    }
  }

  // Get child navigation items
  static async findChildItems(parentId) {
    const db = await Database.getInstance();

    try {
      const result = await this.db.query(`
        SELECT * FROM navigation_menus
        WHERE parent_id = $1 AND is_active = 1 AND is_visible = 1
        ORDER BY menu_order, menu_text
      `, [parentId]);

      return result.rows.map(row => NavigationMenu.fromRow(row));

    } catch (error) {
      throw new Error(`Failed to find child navigation items: ${error.message}`);
    }
  }

  // Get complete navigation hierarchy
  static async getHierarchy() {
    const db = await Database.getInstance();

    try {
      const result = await this.db.query(`
        SELECT * FROM navigation_menus
        WHERE is_active = 1 AND is_visible = 1
        ORDER BY menu_depth, menu_order, menu_text
      `);

      const items = result.rows.map(row => NavigationMenu.fromRow(row));

      // Build hierarchy
      const hierarchy = this.buildHierarchy(items);
      return hierarchy;

    } catch (error) {
      throw new Error(`Failed to get navigation hierarchy: ${error.message}`);
    }
  }

  // Build hierarchical structure from flat items
  static buildHierarchy(items, parentId = null, depth = 0) {
    const children = items.filter(item =>
      (parentId === null && item.parent_id === null) ||
      (parentId !== null && item.parent_id === parentId)
    );

    return children.map(item => ({
      ...item.toJSON(),
      children: this.buildHierarchy(items, item.id, depth + 1),
      depth: depth
    }));
  }

  // Find navigation items by menu type
  static async findByMenuType(menuType) {
    const db = await Database.getInstance();

    try {
      const result = await this.db.query(`
        SELECT * FROM navigation_menus
        WHERE menu_type = $1 AND is_active = 1
        ORDER BY menu_depth, menu_order, menu_text
      `, [menuType]);

      return result.rows.map(row => NavigationMenu.fromRow(row));

    } catch (error) {
      throw new Error(`Failed to find navigation items by type: ${error.message}`);
    }
  }

  // Find navigation items with missing pages
  static async findMissingPages() {
    const db = await Database.getInstance();

    try {
      const result = await this.db.query(`
        SELECT * FROM navigation_menus
        WHERE page_exists = 0 OR page_status = 'missing'
        ORDER BY business_criticality DESC, menu_depth, menu_order
      `);

      return result.rows.map(row => NavigationMenu.fromRow(row));

    } catch (error) {
      throw new Error(`Failed to find missing pages: ${error.message}`);
    }
  }

  // Find navigation items with test failures
  static async findTestFailures() {
    const db = await Database.getInstance();

    try {
      const result = await this.db.query(`
        SELECT * FROM navigation_menus
        WHERE test_status = 'failed'
        ORDER BY business_criticality DESC, menu_depth, menu_order
      `);

      return result.rows.map(row => NavigationMenu.fromRow(row));

    } catch (error) {
      throw new Error(`Failed to find test failures: ${error.message}`);
    }
  }

  // Get navigation items for specific role
  static async findByRole(role) {
    const db = await Database.getInstance();

    try {
      const result = await this.db.query(`
        SELECT * FROM navigation_menus
        WHERE is_active = 1 AND is_visible = 1
          AND (jsonb_array_length(required_roles) = 0 OR $1 = ANY (SELECT value FROM jsonb_array_elements_text(required_roles)))
        ORDER BY menu_depth, menu_order, menu_text
      `, [role]);

      return result.rows.map(row => NavigationMenu.fromRow(row));

    } catch (error) {
      // Fallback for databases without JSON support
      try {
        const result = await this.db.query(`
          SELECT * FROM navigation_menus
          WHERE is_active = 1 AND is_visible = 1
          ORDER BY menu_depth, menu_order, menu_text
        `);

        return result.rows.map(row => {
          const item = NavigationMenu.fromRow(row);
          // Check if role is in required_roles
          if (item.required_roles.length === 0 || item.required_roles.includes(role)) {
            return item;
          }
          return null;
        }).filter(item => item !== null);

      } catch (fallbackError) {
        throw new Error(`Failed to find navigation items by role: ${error.message}`);
      }
    }
  }

  // Update navigation menu item
  async update(data) {
    const db = await Database.getInstance();

    try {
      // Update object properties
      Object.assign(this, data);
      this.updated_at = new Date().toISOString();

      await this.db.query(`
        UPDATE navigation_menus SET
          menu_text = $1, url_path = $2, menu_type = $3, menu_order = $4, parent_id = $5,
          menu_depth = $6, menu_path = $7, icon_class = $8, badge_text = $9, target = $10,
          required_permissions = $11, required_roles = $12, is_active = $13, is_visible = $14,
          page_exists = $15, page_status = $16, last_checked = $17, response_code = $18,
          load_time = $19, test_status = $20, last_tested = $21, test_results_summary = $22,
          automation_coverage = $23, description = $24, keywords = $25, content_type = $26,
          functionality_type = $27, css_classes = $28, data_attributes = $29,
          responsive_behavior = $30, mobile_behavior = $31, page_weight = $32,
          resource_count = $33, dom_complexity = $34, accessibility_score = $35,
          usage_frequency = $36, business_criticality = $37, user_satisfaction = $38,
          conversion_impact = $39, dependencies = $40, dependents = $41, related_pages = $42,
          external_links = $43, template_file = $44, route_handler = $45, controller = $46,
          last_modified = $47, version = $48, updated_by = $49
        WHERE id = $50
      `, [
        this.menu_text,
        this.url_path,
        this.menu_type,
        this.menu_order,
        this.parent_id,
        this.menu_depth,
        this.menu_path,
        this.icon_class,
        this.badge_text,
        this.target,
        JSON.stringify(this.required_permissions),
        JSON.stringify(this.required_roles),
        this.is_active,
        this.is_visible,
        this.page_exists,
        this.page_status,
        this.last_checked,
        this.response_code,
        this.load_time,
        this.test_status,
        this.last_tested,
        JSON.stringify(this.test_results_summary),
        this.automation_coverage,
        this.description,
        JSON.stringify(this.keywords),
        this.content_type,
        this.functionality_type,
        JSON.stringify(this.css_classes),
        JSON.stringify(this.data_attributes),
        this.responsive_behavior,
        this.mobile_behavior,
        this.page_weight,
        this.resource_count,
        this.dom_complexity,
        this.accessibility_score,
        this.usage_frequency,
        this.business_criticality,
        this.user_satisfaction,
        this.conversion_impact,
        JSON.stringify(this.dependencies),
        JSON.stringify(this.dependents),
        JSON.stringify(this.related_pages),
        JSON.stringify(this.external_links),
        this.template_file,
        this.route_handler,
        this.controller,
        this.last_modified,
        this.version,
        this.updated_by,
        this.id
      ]);

      return this;

    } catch (error) {
      throw new Error(`Failed to update navigation menu item: ${error.message}`);
    }
  }

  // Update page status after checking
  async updatePageStatus(pageExists, responseCode = null, loadTime = null) {
    return this.update({
      page_exists: pageExists,
      page_status: pageExists ? 'working' : 'missing',
      response_code: responseCode,
      load_time: loadTime,
      last_checked: new Date().toISOString()
    });
  }

  // Update test results
  async updateTestResults(testStatus, testResults = {}) {
    return this.update({
      test_status: testStatus,
      last_tested: new Date().toISOString(),
      test_results_summary: testResults
    });
  }

  // Activate/deactivate navigation item
  async activate() {
    return this.update({ is_active: true });
  }

  async deactivate() {
    return this.update({ is_active: false });
  }

  // Show/hide navigation item
  async show() {
    return this.update({ is_visible: true });
  }

  async hide() {
    return this.update({ is_visible: false });
  }

  // Delete navigation menu item
  async delete() {
    const db = await Database.getInstance();

    try {
      // Check for child items first
      const childCount = await db.queryOne('SELECT COUNT(*) as count FROM navigation_menus WHERE parent_id = $1', [this.id]);

      if (childCount.count > 0) {
        throw new Error('Cannot delete navigation item with child items. Delete children first.');
      }

      const result = await this.db.query('DELETE FROM navigation_menus WHERE id = $1', [this.id]);

      return result.rowCount > 0;

    } catch (error) {
      throw new Error(`Failed to delete navigation menu item: ${error.message}`);
    }
  }

  // Get navigation statistics
  static async getStatistics() {
    const db = await Database.getInstance();

    try {
      const stats = await db.queryOne(`
        SELECT
          COUNT(*) as total_menu_items,
          COUNT(CASE WHEN is_active = 1 THEN 1 END) as active_items,
          COUNT(CASE WHEN is_visible = 1 THEN 1 END) as visible_items,
          COUNT(CASE WHEN page_exists = 1 THEN 1 END) as pages_exist,
          COUNT(CASE WHEN page_exists = 0 THEN 1 END) as pages_missing,
          COUNT(CASE WHEN test_status = 'passed' THEN 1 END) as tests_passed,
          COUNT(CASE WHEN test_status = 'failed' THEN 1 END) as tests_failed,
          COUNT(CASE WHEN test_status = 'untested' THEN 1 END) as tests_untested,
          AVG(automation_coverage) as avg_automation_coverage,
          MAX(menu_depth) as max_depth,
          COUNT(CASE WHEN parent_id IS NULL THEN 1 END) as root_items
        FROM navigation_menus
      `);

      return stats;

    } catch (error) {
      throw new Error(`Failed to get navigation statistics: ${error.message}`);
    }
  }

  // Search navigation items
  static async search(searchTerm, options = {}) {
    const db = await Database.getInstance();
    const { limit = 50, offset = 0 } = options;

    try {
      const searchPattern = `%${searchTerm}%`;
      const result = await this.db.query(`
        SELECT * FROM navigation_menus
        WHERE menu_text LIKE $1 OR description LIKE $2 OR url_path LIKE $3
        ORDER BY business_criticality DESC, menu_depth, menu_order
        LIMIT $4 OFFSET $5
      `, [searchPattern, searchPattern, searchPattern, limit, offset]);

      return result.rows.map(row => NavigationMenu.fromRow(row));

    } catch (error) {
      throw new Error(`Failed to search navigation items: ${error.message}`);
    }
  }

  // Validate navigation structure
  static async validateStructure() {
    const db = await Database.getInstance();

    try {
      // Check for orphaned items (children without valid parents)
      const orphanResult = await this.db.query(`
        SELECT * FROM navigation_menus
        WHERE parent_id IS NOT NULL
          AND parent_id NOT IN (SELECT id FROM navigation_menus WHERE is_active = 1)
      `);

      const orphans = orphanResult.rows;

      // Check for circular references
      const circularResult = await this.db.query(`
        SELECT n1.id, n1.menu_text, n1.parent_id, n2.parent_id as parent_parent_id
        FROM navigation_menus n1
        LEFT JOIN navigation_menus n2 ON n1.parent_id = n2.id
        WHERE n1.parent_id = n1.id OR n2.parent_id = n1.id
      `);

      const circular = circularResult.rows;

      // Check for duplicate URLs
      const duplicateResult = await this.db.query(`
        SELECT url_path, COUNT(*) as count
        FROM navigation_menus
        WHERE url_path != '' AND is_active = 1
        GROUP BY url_path
        HAVING COUNT(*) > 1
      `);

      const duplicates = duplicateResult.rows;

      // Check for invalid menu orders
      const invalidOrderResult = await this.db.query(`
        SELECT * FROM navigation_menus
        WHERE menu_order < 0 OR menu_order > 9999
      `);

      const invalidOrders = invalidOrderResult.rows;

      return {
        orphans: orphans.length,
        circular_references: circular.length,
        duplicate_urls: duplicates.length,
        invalid_orders: invalidOrders.length,
        details: {
          orphans,
          circular_references: circular,
          duplicate_urls: duplicates,
          invalid_orders: invalidOrders
        }
      };

    } catch (error) {
      throw new Error(`Failed to validate navigation structure: ${error.message}`);
    }
  }

  // Convert database row to NavigationMenu instance
  static fromRow(row) {
    return new NavigationMenu({
      ...row,
      required_permissions: row.required_permissions ? JSON.parse(row.required_permissions) : [],
      required_roles: row.required_roles ? JSON.parse(row.required_roles) : [],
      test_results_summary: row.test_results_summary ? JSON.parse(row.test_results_summary) : {},
      keywords: row.keywords ? JSON.parse(row.keywords) : [],
      css_classes: row.css_classes ? JSON.parse(row.css_classes) : [],
      data_attributes: row.data_attributes ? JSON.parse(row.data_attributes) : {},
      dependencies: row.dependencies ? JSON.parse(row.dependencies) : [],
      dependents: row.dependents ? JSON.parse(row.dependents) : [],
      related_pages: row.related_pages ? JSON.parse(row.related_pages) : [],
      external_links: row.external_links ? JSON.parse(row.external_links) : []
    });
  }

  // Export to JSON
  toJSON() {
    return {
      id: this.id,
      menu_text: this.menu_text,
      url_path: this.url_path,
      menu_type: this.menu_type,
      menu_order: this.menu_order,
      parent_id: this.parent_id,
      menu_depth: this.menu_depth,
      menu_path: this.menu_path,
      icon_class: this.icon_class,
      badge_text: this.badge_text,
      target: this.target,
      required_permissions: this.required_permissions,
      required_roles: this.required_roles,
      is_active: this.is_active,
      is_visible: this.is_visible,
      page_exists: this.page_exists,
      page_status: this.page_status,
      last_checked: this.last_checked,
      response_code: this.response_code,
      load_time: this.load_time,
      test_status: this.test_status,
      last_tested: this.last_tested,
      test_results_summary: this.test_results_summary,
      automation_coverage: this.automation_coverage,
      description: this.description,
      keywords: this.keywords,
      content_type: this.content_type,
      functionality_type: this.functionality_type,
      css_classes: this.css_classes,
      data_attributes: this.data_attributes,
      responsive_behavior: this.responsive_behavior,
      mobile_behavior: this.mobile_behavior,
      page_weight: this.page_weight,
      resource_count: this.resource_count,
      dom_complexity: this.dom_complexity,
      accessibility_score: this.accessibility_score,
      usage_frequency: this.usage_frequency,
      business_criticality: this.business_criticality,
      user_satisfaction: this.user_satisfaction,
      conversion_impact: this.conversion_impact,
      dependencies: this.dependencies,
      dependents: this.dependents,
      related_pages: this.related_pages,
      external_links: this.external_links,
      template_file: this.template_file,
      route_handler: this.route_handler,
      controller: this.controller,
      last_modified: this.last_modified,
      version: this.version,
      created_at: this.created_at,
      updated_at: this.updated_at,
      created_by: this.created_by,
      updated_by: this.updated_by
    };
  }
}

module.exports = NavigationMenu;