const Database = require('../database/DatabasePostgreSQL');

class PageSpec {
  constructor(data = {}) {
    this.id = data.id || null;
    this.test_report_id = data.test_report_id || null;
    this.page_name = data.page_name || '';
    this.menu_path = data.menu_path || '';
    this.url_path = data.url_path || '';
    this.page_type = data.page_type || 'detail'; // dashboard, form, list, detail, settings, report
    this.priority = data.priority || 'medium'; // critical, high, medium, low
    this.business_function = data.business_function || '';

    // Implementation requirements
    this.required_permissions = data.required_permissions || ['super_admin'];
    this.status = data.status || 'specification'; // specification, in_progress, completed, tested

    // Discovery information
    this.discovered_from = data.discovered_from || 'navigation_analysis';
    this.discovery_date = data.discovery_date || new Date().toISOString();

    // Implementation planning
    this.estimated_complexity = data.estimated_complexity || 'moderate'; // simple, moderate, complex
    this.estimated_effort_hours = data.estimated_effort_hours || 4;
    this.file_path = data.file_path || '';

    // Dependencies and requirements
    this.required_components = data.required_components || [];
    this.dependencies = data.dependencies || [];
    this.acceptance_criteria = data.acceptance_criteria || [];

    // Development tracking
    this.developer_assigned = data.developer_assigned || null;
    this.start_date = data.start_date || null;
    self.target_date = data.target_date || null;
    this.completion_date = data.completion_date || null;

    // Quality assurance
    this.test_coverage = data.test_coverage || 0; // percentage
    this.code_review_status = data.code_review_status || 'pending'; // pending, approved, changes_requested
    this.bug_count = data.bug_count || 0;

    // Business value metrics
    this.business_value = data.business_value || 'Medium'; // High, Medium, Low
    this.user_impact = data.user_impact || 'medium'; // high, medium, low
    this.revenue_impact = data.revenue_impact || 0; // monetary value

    // Technical specifications
    this.responsive_requirements = data.responsive_requirements || ['mobile', 'tablet', 'desktop'];
    this.accessibility_level = data.accessibility_level || 'AA'; // A, AA, AAA
    this.performance_requirements = data.performance_requirements || {};
    this.security_requirements = data.security_requirements || [];

    // Content and features
    self.page_features = data.page_features || [];
    this.data_sources = data.data_sources || [];
    this.integrations = data.integrations || [];
    this.user_interactions = data.user_interactions || [];

    // Audit fields
    this.created_at = data.created_at || new Date().toISOString();
    this.updated_at = data.updated_at || new Date().toISOString();
    this.created_by = data.created_by || null;
    this.updated_by = data.updated_by || null;
  }

  // Create new page specification
  static async create(data) {
    const db = await Database.getInstance();
    const pageSpec = new PageSpec(data);

    try {
      const result = await db.query(`
        INSERT INTO page_specs (
          test_report_id, page_name, menu_path, url_path, page_type, priority,
          business_function, required_permissions, status, discovered_from,
          discovery_date, estimated_complexity, estimated_effort_hours, file_path,
          required_components, dependencies, acceptance_criteria, developer_assigned,
          start_date, target_date, completion_date, test_coverage,
          code_review_status, bug_count, business_value, user_impact,
          revenue_impact, responsive_requirements, accessibility_level,
          performance_requirements, security_requirements, page_features,
          data_sources, integrations, user_interactions, created_at, updated_at,
          created_by, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const dbResult = await db.query(
        pageSpec.test_report_id,
        pageSpec.page_name,
        pageSpec.menu_path,
        pageSpec.url_path,
        pageSpec.page_type,
        pageSpec.priority,
        pageSpec.business_function,
        JSON.stringify(pageSpec.required_permissions),
        pageSpec.status,
        pageSpec.discovered_from,
        pageSpec.discovery_date,
        pageSpec.estimated_complexity,
        pageSpec.estimated_effort_hours,
        pageSpec.file_path,
        JSON.stringify(pageSpec.required_components),
        JSON.stringify(pageSpec.dependencies),
        JSON.stringify(pageSpec.acceptance_criteria),
        pageSpec.developer_assigned,
        pageSpec.start_date,
        pageSpec.target_date,
        pageSpec.completion_date,
        pageSpec.test_coverage,
        pageSpec.code_review_status,
        pageSpec.bug_count,
        pageSpec.business_value,
        pageSpec.user_impact,
        pageSpec.revenue_impact,
        JSON.stringify(pageSpec.responsive_requirements),
        pageSpec.accessibility_level,
        JSON.stringify(pageSpec.performance_requirements),
        JSON.stringify(pageSpec.security_requirements),
        JSON.stringify(pageSpec.page_features),
        JSON.stringify(pageSpec.data_sources),
        JSON.stringify(pageSpec.integrations),
        JSON.stringify(pageSpec.user_interactions),
        pageSpec.created_at,
        pageSpec.updated_at,
        pageSpec.created_by,
        pageSpec.updated_by
      );

      pageSpec.id = dbResult.rows[0].id;
      return pageSpec;

    } catch (error) {
      throw new Error(`Failed to create page specification: ${error.message}`);
    }
  }

  // Find page specification by ID
  static async findById(id) {
    const db = await Database.getInstance();

    try {
      const result = await db.query(`
        SELECT * FROM page_specs WHERE id = ?
      `);

      const result = await db.queryOne(id);
      return result ? PageSpec.fromRow(result) : null;

    } catch (error) {
      throw new Error(`Failed to find page specification: ${error.message}`);
    }
  }

  // Find page specifications by test report ID
  static async findByTestReportId(testReportId) {
    const db = await Database.getInstance();

    try {
      const result = await db.query(`
        SELECT * FROM page_specs WHERE test_report_id = ? ORDER BY priority DESC, page_name
      `);

      const result = await db.query(testReportId);
      return result.rows.map(row => PageSpec.fromRow(row));

    } catch (error) {
      throw new Error(`Failed to find page specifications by test report: ${error.message}`);
    }
  }

  // Find page specifications by status
  static async findByStatus(status) {
    const db = await Database.getInstance();

    try {
      const result = await db.query(`
        SELECT * FROM page_specs WHERE status = ? ORDER BY priority DESC, created_at
      `);

      const result = await db.query(status);
      return result.rows.map(row => PageSpec.fromRow(row));

    } catch (error) {
      throw new Error(`Failed to find page specifications by status: ${error.message}`);
    }
  }

  // Find page specifications by priority
  static async findByPriority(priority) {
    const db = await Database.getInstance();

    try {
      const result = await db.query(`
        SELECT * FROM page_specs WHERE priority = ? ORDER BY created_at
      `);

      const result = await db.query(priority);
      return result.rows.map(row => PageSpec.fromRow(row));

    } catch (error) {
      throw new Error(`Failed to find page specifications by priority: ${error.message}`);
    }
  }

  // Find page specifications by developer
  static async findByDeveloper(developerId) {
    const db = await Database.getInstance();

    try {
      const result = await db.query(`
        SELECT * FROM page_specs WHERE developer_assigned = ? ORDER BY priority DESC, target_date
      `);

      const result = await db.query(developerId);
      return result.rows.map(row => PageSpec.fromRow(row));

    } catch (error) {
      throw new Error(`Failed to find page specifications by developer: ${error.message}`);
    }
  }

  // Get all page specifications with filtering
  static async findAll(options = {}) {
    const db = await Database.getInstance();
    const {
      limit = 100,
      offset = 0,
      status = null,
      priority = null,
      page_type = null,
      developer_assigned = null,
      created_by = null,
      start_date = null,
      end_date = null,
      order_by = 'created_at',
      order_dir = 'DESC'
    } = options;

    try {
      let query = `
        SELECT * FROM page_specs
        WHERE 1=1
      `;
      const params = [];

      if (status) {
        query += ' AND status = ?';
        params.push(status);
      }

      if (priority) {
        query += ' AND priority = ?';
        params.push(priority);
      }

      if (page_type) {
        query += ' AND page_type = ?';
        params.push(page_type);
      }

      if (developer_assigned) {
        query += ' AND developer_assigned = ?';
        params.push(developer_assigned);
      }

      if (created_by) {
        query += ' AND created_by = ?';
        params.push(created_by);
      }

      if (start_date) {
        query += ' AND created_at >= ?';
        params.push(start_date);
      }

      if (end_date) {
        query += ' AND created_at <= ?';
        params.push(end_date);
      }

      query += ` ORDER BY ${order_by} ${order_dir} LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const stmt = await db.prepare(query);
      const result = await db.query(...params);

      return result.rows.map(row => PageSpec.fromRow(row));

    } catch (error) {
      throw new Error(`Failed to find page specifications: ${error.message}`);
    }
  }

  // Update page specification
  async update(data) {
    const db = await Database.getInstance();

    try {
      // Update object properties
      Object.assign(this, data);
      this.updated_at = new Date().toISOString();

      const result = await db.query(`
        UPDATE page_specs SET
          page_name = ?, menu_path = ?, url_path = ?, page_type = ?, priority = ?,
          business_function = ?, required_permissions = ?, status = ?, file_path = ?,
          required_components = ?, dependencies = ?, acceptance_criteria = ?,
          developer_assigned = ?, start_date = ?, target_date = ?, completion_date = ?,
          test_coverage = ?, code_review_status = ?, bug_count = ?, business_value = ?,
          user_impact = ?, revenue_impact = ?, responsive_requirements = ?,
          accessibility_level = ?, performance_requirements = ?, security_requirements = ?,
          page_features = ?, data_sources = ?, integrations = ?, user_interactions = ?,
          updated_at = ?, updated_by = ?
        WHERE id = ?
      `);

      await stmt.run(
        this.page_name,
        this.menu_path,
        this.url_path,
        this.page_type,
        this.priority,
        this.business_function,
        JSON.stringify(this.required_permissions),
        this.status,
        this.file_path,
        JSON.stringify(this.required_components),
        JSON.stringify(this.dependencies),
        JSON.stringify(this.acceptance_criteria),
        this.developer_assigned,
        this.start_date,
        this.target_date,
        this.completion_date,
        this.test_coverage,
        this.code_review_status,
        this.bug_count,
        this.business_value,
        this.user_impact,
        this.revenue_impact,
        JSON.stringify(this.responsive_requirements),
        this.accessibility_level,
        JSON.stringify(this.performance_requirements),
        JSON.stringify(this.security_requirements),
        JSON.stringify(this.page_features),
        JSON.stringify(this.data_sources),
        JSON.stringify(this.integrations),
        JSON.stringify(this.user_interactions),
        this.updated_at,
        this.updated_by,
        this.id
      );

      return this;

    } catch (error) {
      throw new Error(`Failed to update page specification: ${error.message}`);
    }
  }

  // Start development
  async startDevelopment(developerId) {
    return this.update({
      status: 'in_progress',
      developer_assigned: developerId,
      start_date: new Date().toISOString()
    });
  }

  // Complete development
  async completeDevelopment() {
    return this.update({
      status: 'completed',
      completion_date: new Date().toISOString(),
      test_coverage: 100
    });
  }

  // Mark as tested
  async markAsTested() {
    return this.update({
      status: 'tested',
      test_coverage: 100,
      code_review_status: 'approved'
    });
  }

  // Add bug to specification
  async addBug() {
    return this.update({
      bug_count: this.bug_count + 1
    });
  }

  // Delete page specification
  async delete() {
    const db = await Database.getInstance();

    try {
      const stmt = await db.prepare('DELETE FROM page_specs WHERE id = ?');
      await stmt.run(this.id);

      return true;

    } catch (error) {
      throw new Error(`Failed to delete page specification: ${error.message}`);
    }
  }

  // Get statistics for page specifications
  static async getStatistics(filters = {}) {
    const db = await Database.getInstance();

    try {
      let whereClause = 'WHERE 1=1';
      const params = [];

      if (filters.created_by) {
        whereClause += ' AND created_by = ?';
        params.push(filters.created_by);
      }

      if (filters.developer_assigned) {
        whereClause += ' AND developer_assigned = ?';
        params.push(filters.developer_assigned);
      }

      const result = await db.query(`
        SELECT
          COUNT(*) as total_specs,
          COUNT(CASE WHEN status = 'specification' THEN 1 END) as specs_pending,
          COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as specs_in_progress,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as specs_completed,
          COUNT(CASE WHEN status = 'tested' THEN 1 END) as specs_tested,
          COUNT(CASE WHEN priority = 'critical' THEN 1 END) as critical_specs,
          COUNT(CASE WHEN priority = 'high' THEN 1 END) as high_specs,
          COUNT(CASE WHEN priority = 'medium' THEN 1 END) as medium_specs,
          COUNT(CASE WHEN priority = 'low' THEN 1 END) as low_specs,
          SUM(estimated_effort_hours) as total_estimated_hours,
          AVG(test_coverage) as avg_test_coverage,
          SUM(bug_count) as total_bugs
        FROM page_specs ${whereClause}
      `);

      const stats = await stmt.get(...params);
      return stats;

    } catch (error) {
      throw new Error(`Failed to get page specification statistics: ${error.message}`);
    }
  }

  // Get implementation roadmap
  static async getImplementationRoadmap(limit = 20) {
    const db = await Database.getInstance();

    try {
      const result = await db.query(`
        SELECT * FROM page_specs
        WHERE status IN ('specification', 'in_progress')
        ORDER BY
          CASE priority
            WHEN 'critical' THEN 1
            WHEN 'high' THEN 2
            WHEN 'medium' THEN 3
            WHEN 'low' THEN 4
          END,
          estimated_effort_hours ASC,
          created_at ASC
        LIMIT ?
      `);

      const result = await db.query(limit);
      return result.rows.map(row => PageSpec.fromRow(row));

    } catch (error) {
      throw new Error(`Failed to get implementation roadmap: ${error.message}`);
    }
  }

  // Search page specifications
  static async search(searchTerm, options = {}) {
    const db = await Database.getInstance();
    const { limit = 50, offset = 0 } = options;

    try {
      const result = await db.query(`
        SELECT * FROM page_specs
        WHERE page_name LIKE ? OR menu_path LIKE ? OR business_function LIKE ?
        ORDER BY priority DESC, page_name
        LIMIT ? OFFSET ?
      `);

      const searchPattern = `%${searchTerm}%`;
      const result = await db.query(searchPattern, searchPattern, searchPattern, limit, offset);

      return result.rows.map(row => PageSpec.fromRow(row));

    } catch (error) {
      throw new Error(`Failed to search page specifications: ${error.message}`);
    }
  }

  // Convert database row to PageSpec instance
  static fromRow(row) {
    return new PageSpec({
      ...row,
      required_permissions: row.required_permissions ? JSON.parse(row.required_permissions) : [],
      required_components: row.required_components ? JSON.parse(row.required_components) : [],
      dependencies: row.dependencies ? JSON.parse(row.dependencies) : [],
      acceptance_criteria: row.acceptance_criteria ? JSON.parse(row.acceptance_criteria) : [],
      responsive_requirements: row.responsive_requirements ? JSON.parse(row.responsive_requirements) : [],
      performance_requirements: row.performance_requirements ? JSON.parse(row.performance_requirements) : {},
      security_requirements: row.security_requirements ? JSON.parse(row.security_requirements) : [],
      page_features: row.page_features ? JSON.parse(row.page_features) : [],
      data_sources: row.data_sources ? JSON.parse(row.data_sources) : [],
      integrations: row.integrations ? JSON.parse(row.integrations) : [],
      user_interactions: row.user_interactions ? JSON.parse(row.user_interactions) : []
    });
  }

  // Export to JSON
  toJSON() {
    return {
      id: this.id,
      test_report_id: this.test_report_id,
      page_name: this.page_name,
      menu_path: this.menu_path,
      url_path: this.url_path,
      page_type: this.page_type,
      priority: this.priority,
      business_function: this.business_function,
      required_permissions: this.required_permissions,
      status: this.status,
      discovered_from: this.discovered_from,
      discovery_date: this.discovery_date,
      estimated_complexity: this.estimated_complexity,
      estimated_effort_hours: this.estimated_effort_hours,
      file_path: this.file_path,
      required_components: this.required_components,
      dependencies: this.dependencies,
      acceptance_criteria: this.acceptance_criteria,
      developer_assigned: this.developer_assigned,
      start_date: this.start_date,
      target_date: this.target_date,
      completion_date: this.completion_date,
      test_coverage: this.test_coverage,
      code_review_status: this.code_review_status,
      bug_count: this.bug_count,
      business_value: this.business_value,
      user_impact: this.user_impact,
      revenue_impact: this.revenue_impact,
      responsive_requirements: this.responsive_requirements,
      accessibility_level: this.accessibility_level,
      performance_requirements: this.performance_requirements,
      security_requirements: this.security_requirements,
      page_features: this.page_features,
      data_sources: this.data_sources,
      integrations: this.integrations,
      user_interactions: this.user_interactions,
      created_at: this.created_at,
      updated_at: this.updated_at,
      created_by: this.created_by,
      updated_by: this.updated_by
    };
  }
}

module.exports = PageSpec;