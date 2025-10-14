# Customer Management v2.0 - Spesifikasi Lengkap

## 1. Overview

Sistem customer management v2.0 mengelola database customer untuk subscription management. Customer wajib dibuat untuk subscription, namun voucher dapat dibuat tanpa customer assignment. Tidak ada self-service portal untuk customer.

## 2. Key Features

### 2.1 Core Features
- **Customer Database**: Centralized customer information storage
- **Balance Tracking**: Credit/debt management per customer
- **Multiple Users Support**: Multiple subscriptions per customer
- **Contact Management**: WhatsApp, email, dan phone number tracking
- **No Self-Service Portal**: Admin-only access untuk customer management
- **Mandatory for Subscriptions**: Customer harus ada untuk subscription creation
- **Optional for Vouchers**: Voucher dapat dibuat tanpa customer

### 2.2 Business Rules
- Customer harus unique berdasarkan WhatsApp number
- Satu customer dapat memiliki multiple subscriptions
- Customer balance digunakan untuk carry over logic
- Customer tidak dapat mengakses portal sendiri
- Admin dapat create, edit, dan delete customer
- Customer history tracking untuk semua perubahan

## 3. Architecture

### 3.1 Components
```
src/routes/customers.js           # Customer management routes
src/models/Customer.js            # Customer data model
src/services/CustomerService.js   # Customer business logic
views/customers/                   # Customer management UI
  ├── index.ejs                  # Customer list
  ├── create.ejs                 # Create customer form
  ├── edit.ejs                   # Edit customer form
  └── detail.ejs                 # Customer detail view
public/js/customers.js            # Frontend customer logic
```

### 3.2 Customer Data Model
```javascript
// Customer Structure
{
  id: 12345,
  name: "John Doe",
  whatsapp: "+62812345678",
  email: "john@example.com",
  phone: "+62812345678",
  address: "Jl. Example No. 123",
  balance: 0,           // Positive = credit, Negative = debt
  total_spent: 1500000,
  subscription_count: 3,
  status: "active",     // active, inactive, blacklisted
  notes: "Customer notes",
  created_at: "2025-01-09T10:00:00Z",
  updated_at: "2025-01-09T10:00:00Z",
  created_by: "admin"
}
```

### 3.3 Database Schema
```sql
-- Customers table
CREATE TABLE customers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    whatsapp VARCHAR(20) UNIQUE NOT NULL, -- Primary contact
    email VARCHAR(100),
    phone VARCHAR(20),
    address TEXT,
    balance DECIMAL(10,2) DEFAULT 0, -- Positive: credit, Negative: debt
    total_spent DECIMAL(12,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'blacklisted')),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(50) NOT NULL
);

-- Customer balance history
CREATE TABLE customer_balance_history (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    type VARCHAR(20) NOT NULL CHECK (type IN ('credit', 'debit', 'carry_over')),
    amount DECIMAL(10,2) NOT NULL,
    previous_balance DECIMAL(10,2) NOT NULL,
    new_balance DECIMAL(10,2) NOT NULL,
    description TEXT,
    reference_id INTEGER, -- Can reference payment_id, subscription_id, etc
    reference_type VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(50)
);

-- Customer contacts (additional contacts)
CREATE TABLE customer_contacts (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    type VARCHAR(20) NOT NULL CHECK (type IN ('whatsapp', 'email', 'phone')),
    value VARCHAR(100) NOT NULL,
    is_primary BOOLEAN DEFAULT false,
    notes VARCHAR(200),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Customer tags (for categorization)
CREATE TABLE customer_tags (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    tag VARCHAR(50) NOT NULL,
    color VARCHAR(7) DEFAULT '#007bff', -- Hex color
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Customer activity log
CREATE TABLE customer_activity_log (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    action VARCHAR(50) NOT NULL, -- created, updated, balance_changed, subscription_created, etc
    details JSONB,
    admin_id INTEGER REFERENCES admin_users(id),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 4. Customer CRUD Operations

### 4.1 Customer Creation
```javascript
// src/services/CustomerService.js
class CustomerService {
  static async createCustomer(data, createdBy) {
    const transaction = await db.beginTransaction();

    try {
      // 1. Validate WhatsApp uniqueness
      const existingCustomer = await transaction.query(
        'SELECT id FROM customers WHERE whatsapp = ?',
        [data.whatsapp]
      );

      if (existingCustomer.rows.length > 0) {
        throw new Error('Customer with this WhatsApp number already exists');
      }

      // 2. Validate required fields
      if (!data.name || !data.whatsapp) {
        throw new Error('Name and WhatsApp are required');
      }

      // 3. Format WhatsApp number
      const formattedWhatsApp = this.formatWhatsAppNumber(data.whatsapp);

      // 4. Create customer
      const result = await transaction.query(`
        INSERT INTO customers
        (name, whatsapp, email, phone, address, notes, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [
        data.name,
        formattedWhatsApp,
        data.email || null,
        data.phone || null,
        data.address || null,
        data.notes || null,
        createdBy
      ]);

      const customer = result.rows[0];

      // 5. Add initial balance if provided
      if (data.initial_balance && data.initial_balance !== 0) {
        await this.updateBalance(
          transaction,
          customer.id,
          data.initial_balance,
          'credit',
          'Initial balance',
          null,
          createdBy
        );
      }

      // 6. Add tags if provided
      if (data.tags && data.tags.length > 0) {
        for (const tag of data.tags) {
          await transaction.query(`
            INSERT INTO customer_tags (customer_id, tag, color)
            VALUES ($1, $2, $3)
          `, [customer.id, tag.name, tag.color || '#007bff']);
        }
      }

      // 7. Log activity
      await this.logActivity({
        customer_id: customer.id,
        action: 'created',
        details: { new_customer: customer },
        admin_id: createdBy
      });

      await transaction.commit();

      // 8. Send welcome WhatsApp if enabled
      if (data.send_welcome) {
        await this.sendWelcomeWhatsApp(customer);
      }

      return {
        success: true,
        customer: await this.getCustomerById(customer.id)
      };

    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  static formatWhatsAppNumber(number) {
    // Remove all non-digit characters
    let cleaned = number.replace(/\D/g, '');

    // Add country code if missing (Indonesia default)
    if (cleaned.startsWith('0')) {
      cleaned = '62' + cleaned.substring(1);
    }

    // Add + prefix if missing
    if (!cleaned.startsWith('+')) {
      cleaned = '+' + cleaned;
    }

    return cleaned;
  }
}
```

### 4.2 Customer Search & Filtering
```javascript
// Advanced customer search
class CustomerService {
  static async searchCustomers(filters = {}) {
    let sql = `
      SELECT
        c.*,
        COUNT(s.id) as subscription_count,
        COUNT(DISTINCT p.id) as payment_count
      FROM customers c
      LEFT JOIN subscriptions s ON c.id = s.customer_id
      LEFT JOIN payments p ON c.id = p.customer_id
      WHERE 1=1
    `;
    const params = [];
    let index = 1;

    // Search by name
    if (filters.search) {
      sql += ` AND (
        c.name ILIKE $${index} OR
        c.whatsapp ILIKE $${index} OR
        c.email ILIKE $${index}
      )`;
      params.push(`%${filters.search}%`);
      index++;
    }

    // Filter by status
    if (filters.status) {
      sql += ` AND c.status = $${index}`;
      params.push(filters.status);
      index++;
    }

    // Filter by balance range
    if (filters.balance_min !== undefined) {
      sql += ` AND c.balance >= $${index}`;
      params.push(filters.balance_min);
      index++;
    }

    if (filters.balance_max !== undefined) {
      sql += ` AND c.balance <= $${index}`;
      params.push(filters.balance_max);
      index++;
    }

    // Filter by tags
    if (filters.tags && filters.tags.length > 0) {
      sql += ` AND c.id IN (
        SELECT customer_id FROM customer_tags
        WHERE tag IN (${filters.tags.map((_, i) => `$${index + i}`).join(', ')})
      )`;
      params.push(...filters.tags);
      index += filters.tags.length;
    }

    // Filter by date range
    if (filters.created_after) {
      sql += ` AND c.created_at >= $${index}`;
      params.push(filters.created_after);
      index++;
    }

    if (filters.created_before) {
      sql += ` AND c.created_at <= $${index}`;
      params.push(filters.created_before);
      index++;
    }

    // Group and order
    sql += `
      GROUP BY c.id
      ORDER BY
        CASE WHEN c.balance < 0 THEN 1 ELSE 0 END, -- Debt first
        c.updated_at DESC
    `;

    // Pagination
    const limit = Math.min(filters.limit || 50, 200);
    const offset = (filters.page - 1) * limit;

    sql += ` LIMIT $${index} OFFSET $${index + 1}`;
    params.push(limit, offset);

    const result = await db.query(sql, params);

    // Get total count
    const countResult = await db.query(
      sql.replace(/SELECT.*?FROM/, 'SELECT COUNT(DISTINCT c.id) FROM').replace(/GROUP BY.*$/, ''),
      params.slice(0, -2)
    );

    return {
      customers: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: filters.page || 1,
      totalPages: Math.ceil(countResult.rows[0].count / limit)
    };
  }

  static async getCustomerStats() {
    const stats = await db.query(`
      SELECT
        COUNT(*) as total_customers,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_customers,
        COUNT(CASE WHEN balance < 0 THEN 1 END) as customers_with_debt,
        SUM(CASE WHEN balance < 0 THEN balance ELSE 0 END) as total_debt,
        SUM(CASE WHEN balance > 0 THEN balance ELSE 0 END) as total_credit,
        AVG(total_spent) as avg_spent,
        MAX(total_spent) as max_spent
      FROM customers
    `);

    return stats.rows[0];
  }
}
```

## 5. Balance Management

### 5.1 Balance Operations
```javascript
// Balance tracking service
class BalanceService {
  static async updateBalance(customerId, amount, type, description, reference = null, updatedBy = null) {
    const transaction = await db.beginTransaction();

    try {
      // 1. Get current balance
      const current = await transaction.query(
        'SELECT balance FROM customers WHERE id = ?',
        [customerId]
      );

      if (!current.rows.length) {
        throw new Error('Customer not found');
      }

      const previousBalance = parseFloat(current.rows[0].balance);
      let newBalance;

      // 2. Calculate new balance
      if (type === 'credit') {
        newBalance = previousBalance + amount;
      } else if (type === 'debit') {
        newBalance = previousBalance - amount;
      } else if (type === 'carry_over') {
        newBalance = previousBalance + amount; // Carry over adds to balance
      }

      // 3. Update customer balance
      await transaction.query(
        'UPDATE customers SET balance = ?, updated_at = NOW() WHERE id = ?',
        [newBalance, customerId]
      );

      // 4. Create balance history record
      await transaction.query(`
        INSERT INTO customer_balance_history
        (customer_id, type, amount, previous_balance, new_balance, description, reference_id, reference_type, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        customerId,
        type,
        amount,
        previousBalance,
        newBalance,
        description,
        reference?.id || null,
        reference?.type || null,
        updatedBy
      ]);

      // 5. Log activity
      await this.logActivity({
        customer_id: customerId,
        action: 'balance_changed',
        details: {
          type,
          amount,
          previous_balance: previousBalance,
          new_balance: newBalance,
          description
        },
        admin_id: updatedBy
      });

      await transaction.commit();

      return {
        success: true,
        previous_balance: previousBalance,
        new_balance: newBalance,
        change: amount
      };

    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  static async getBalanceHistory(customerId, options = {}) {
    let sql = `
      SELECT cbh.*, a.name as admin_name
      FROM customer_balance_history cbh
      LEFT JOIN admin_users a ON cbh.created_by = a.username
      WHERE cbh.customer_id = ?
    `;
    const params = [customerId];

    if (options.type) {
      sql += ' AND cbh.type = ?';
      params.push(options.type);
    }

    if (options.start_date) {
      sql += ' AND cbh.created_at >= ?';
      params.push(options.start_date);
    }

    if (options.end_date) {
      sql += ' AND cbh.created_at <= ?';
      params.push(options.end_date);
    }

    sql += ' ORDER BY cbh.created_at DESC';

    if (options.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    const result = await db.query(sql, params);

    return result.rows;
  }

  static async processCarryOver(invoiceId, paymentAmount) {
    const transaction = await db.beginTransaction();

    try {
      // 1. Get invoice details
      const invoice = await transaction.query(`
        SELECT i.*, s.customer_id
        FROM invoices i
        JOIN subscriptions s ON i.subscription_id = s.id
        WHERE i.id = ?
      `, [invoiceId]);

      if (!invoice.rows.length) {
        throw new Error('Invoice not found');
      }

      const inv = invoice.rows[0];
      const remainingAmount = inv.total_amount - paymentAmount;

      if (remainingAmount > 0) {
        // Partial payment - carry over to customer balance
        await this.updateBalance(
          transaction,
          inv.customer_id,
          paymentAmount,
          'carry_over',
          `Carry over from invoice ${inv.invoice_number}`,
          { id: invoiceId, type: 'invoice' }
        );

        // Update subscription balance
        await transaction.query(`
          UPDATE subscriptions
          SET balance = balance + $1,
              updated_at = NOW()
          WHERE id = $2
        `, [paymentAmount, inv.subscription_id]);
      }

      await transaction.commit();

      return { success: true, carriedOver: paymentAmount };

    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}
```

## 6. Customer Relationship Management

### 6.1 Customer Tags & Categories
```javascript
// Customer tagging system
class CustomerTagService {
  static async addTag(customerId, tag, color = '#007bff') {
    try {
      // Check if tag already exists
      const existing = await db.query(
        'SELECT id FROM customer_tags WHERE customer_id = ? AND tag = ?',
        [customerId, tag]
      );

      if (existing.rows.length > 0) {
        throw new Error('Tag already exists for this customer');
      }

      // Add tag
      await db.query(
        'INSERT INTO customer_tags (customer_id, tag, color) VALUES (?, ?, ?)',
        [customerId, tag, color]
      );

      return { success: true };

    } catch (error) {
      console.error('Error adding tag:', error);
      throw error;
    }
  }

  static async getPopularTags(limit = 20) {
    const result = await db.query(`
      SELECT tag, color, COUNT(*) as usage_count
      FROM customer_tags
      GROUP BY tag, color
      ORDER BY usage_count DESC
      LIMIT ?
    `, [limit]);

    return result.rows;
  }

  static async getCustomersByTag(tag) {
    const result = await db.query(`
      SELECT c.*
      FROM customers c
      JOIN customer_tags ct ON c.id = ct.customer_id
      WHERE ct.tag = ?
      ORDER BY c.name
    `, [tag]);

    return result.rows;
  }
}
```

### 6.2 Customer Communication
```javascript
// WhatsApp communication service
class CustomerCommunicationService {
  static async sendWhatsAppNotification(customerId, template, data = {}) {
    try {
      // 1. Get customer
      const customer = await db.query(
        'SELECT * FROM customers WHERE id = ?',
        [customerId]
      );

      if (!customer.rows.length) {
        throw new Error('Customer not found');
      }

      const c = customer.rows[0];

      // 2. Prepare notification data
      const notificationData = {
        customerName: c.name,
        customerWhatsApp: c.whatsapp,
        ...data
      };

      // 3. Send via WhatsApp service
      await whatsappService.sendNotification(
        c.whatsapp,
        template,
        notificationData
      );

      // 4. Log communication
      await db.query(`
        INSERT INTO customer_communications
        (customer_id, type, template, data, sent_at)
        VALUES (?, ?, ?, ?, NOW())
      `, [customerId, 'whatsapp', template, JSON.stringify(notificationData)]);

      return { success: true };

    } catch (error) {
      console.error('Error sending WhatsApp:', error);
      throw error;
    }
  }

  static async sendBulkWhatsAppNotification(customerIds, template, data = {}) {
    const results = [];

    for (const customerId of customerIds) {
      try {
        const result = await this.sendWhatsAppNotification(customerId, template, data);
        results.push({ customerId, success: true });
      } catch (error) {
        results.push({
          customerId,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }
}
```

## 7. Customer Analytics & Reports

### 7.1 Customer Analytics
```javascript
// Customer analytics service
class CustomerAnalyticsService {
  static async getCustomerMetrics(dateRange = '30d') {
    const dateFilter = this.getDateFilter(dateRange);

    const metrics = await db.query(`
      SELECT
        -- New customers
        COUNT(CASE WHEN c.created_at >= ${dateFilter} THEN 1 END) as new_customers,

        -- Active customers (with subscriptions)
        COUNT(DISTINCT CASE WHEN s.status = 'active' THEN c.id END) as active_customers,

        -- Churned customers (no active subscriptions)
        COUNT(CASE WHEN
          c.status = 'active'
          AND NOT EXISTS (SELECT 1 FROM subscriptions s2 WHERE s2.customer_id = c.id AND s2.status = 'active')
          AND s.last_payment_at < NOW() - INTERVAL '30 days'
        THEN 1 END) as churned_customers,

        -- Average revenue per customer
        COALESCE(AVG(customer_revenue.total_revenue), 0) as avg_revenue_per_customer,

        -- Customer lifetime value
        COALESCE(AVG(lifetime_value.ltv), 0) as avg_customer_lifetime_value,

        -- Debt statistics
        COUNT(CASE WHEN c.balance < 0 THEN 1 END) as customers_with_debt,
        SUM(CASE WHEN c.balance < 0 THEN ABS(c.balance) ELSE 0 END) as total_debt

      FROM customers c
      LEFT JOIN subscriptions s ON c.id = s.customer_id
      LEFT JOIN (
        SELECT
          s.customer_id,
          SUM(p.amount) as total_revenue
        FROM subscriptions s
        JOIN payments p ON s.id = p.subscription_id
        WHERE p.status = 'success'
        GROUP BY s.customer_id
      ) customer_revenue ON c.id = customer_revenue.customer_id
      LEFT JOIN (
        SELECT
          c.id,
          SUM(p.amount) as ltv
        FROM customers c
        JOIN subscriptions s ON c.id = s.customer_id
        JOIN payments p ON s.id = p.subscription_id
        WHERE p.status = 'success'
        GROUP BY c.id
      ) lifetime_value ON c.id = lifetime_value.id
    `);

    return metrics.rows[0];
  }

  static async getTopCustomers(by = 'revenue', limit = 10, dateRange = '30d') {
    const dateFilter = this.getDateFilter(dateRange);

    let sql, params;

    if (by === 'revenue') {
      sql = `
        SELECT
          c.*,
          SUM(p.amount) as total_revenue,
          COUNT(p.id) as payment_count
        FROM customers c
        JOIN subscriptions s ON c.id = s.customer_id
        JOIN payments p ON s.id = p.subscription_id
        WHERE p.status = 'success'
        AND p.created_at >= ${dateFilter}
        GROUP BY c.id
        ORDER BY total_revenue DESC
        LIMIT ?
      `;
    } else if (by === 'subscriptions') {
      sql = `
        SELECT
          c.*,
          COUNT(s.id) as total_subscriptions,
          COUNT(CASE WHEN s.status = 'active' THEN 1 END) as active_subscriptions
        FROM customers c
        LEFT JOIN subscriptions s ON c.id = s.customer_id
        GROUP BY c.id
        ORDER BY total_subscriptions DESC
        LIMIT ?
      `;
    } else if (by === 'balance') {
      sql = `
        SELECT *
        FROM customers
        WHERE balance != 0
        ORDER BY ABS(balance) DESC
        LIMIT ?
      `;
    }

    const result = await db.query(sql, [limit]);

    return result.rows;
  }

  static getDateFilter(range) {
    const intervals = {
      '7d': "NOW() - INTERVAL '7 days'",
      '30d': "NOW() - INTERVAL '30 days'",
      '90d': "NOW() - INTERVAL '90 days'",
      '1y': "NOW() - INTERVAL '1 year'",
      'all': "'1970-01-01'"
    };

    return intervals[range] || intervals['30d'];
  }
}
```

## 8. API Endpoints

### 8.1 Customer Management Endpoints
```javascript
// CRUD operations
POST   /api/customers                    // Create new customer
GET    /api/customers                    // List customers with filters
GET    /api/customers/:id                // Get customer details
PUT    /api/customers/:id                // Update customer
DELETE /api/customers/:id                // Delete customer (soft delete)

// Balance management
POST   /api/customers/:id/balance        // Update balance
GET    /api/customers/:id/balance/history // Get balance history
POST   /api/customers/:id/payment        // Record payment

// Search & analytics
GET    /api/customers/search             // Search customers
GET    /api/customers/stats              // Get customer statistics
GET    /api/customers/analytics          // Get customer analytics
GET    /api/customers/top                // Get top customers

// Tags & categorization
POST   /api/customers/:id/tags           // Add tag
DELETE /api/customers/:id/tags/:tag      // Remove tag
GET    /api/customers/tags/popular       // Get popular tags

// Communications
POST   /api/customers/:id/notify         // Send WhatsApp notification
POST   /api/customers/bulk-notify        // Send bulk notifications

// Import/Export
POST   /api/customers/import             // Import customers from CSV
GET    /api/customers/export             // Export customers to CSV
```

### 8.2 Request/Response Examples
```javascript
// Create customer
POST /api/customers
{
  "name": "John Doe",
  "whatsapp": "+62812345678",
  "email": "john@example.com",
  "phone": "+62812345678",
  "address": "Jl. Example No. 123",
  "initial_balance": 50000,
  "tags": [
    { "name": "VIP", "color": "#gold" },
    { "name": "Corporate", "color": "#blue" }
  ],
  "send_welcome": true
}

// Response
{
  "success": true,
  "customer": {
    "id": 12345,
    "name": "John Doe",
    "whatsapp": "+62812345678",
    "balance": 50000,
    "status": "active",
    "subscription_count": 0,
    "created_at": "2025-01-09T10:00:00Z"
  }
}

// Search customers
GET /api/customers?search=john&status=active&balance_min=0&tags=VIP&page=1&limit=20

// Response
{
  "customers": [...],
  "total": 1,
  "page": 1,
  "totalPages": 1
}
```

## 9. Frontend Implementation

### 9.1 Customer List UI
```html
<!-- views/customers/index.ejs -->
<div class="container-fluid">
  <!-- Search and Filters -->
  <div class="card mb-3">
    <div class="card-body">
      <form id="searchForm" class="row g-3">
        <div class="col-md-3">
          <input type="text" class="form-control" name="search" placeholder="Search name, WhatsApp, email...">
        </div>
        <div class="col-md-2">
          <select class="form-select" name="status">
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="blacklisted">Blacklisted</option>
          </select>
        </div>
        <div class="col-md-2">
          <select class="form-select" name="balance_filter">
            <option value="">All Balance</option>
            <option value="credit">Credit Only</option>
            <option value="debt">Debt Only</option>
            <option value="zero">Zero Balance</option>
          </select>
        </div>
        <div class="col-md-2">
          <select class="form-select" name="tags" multiple data-live-search="true">
            <!-- Tags loaded dynamically -->
          </select>
        </div>
        <div class="col-md-3">
          <button type="submit" class="btn btn-primary">
            <i class="fas fa-search"></i> Search
          </button>
          <button type="button" class="btn btn-success ms-1" data-bs-toggle="modal" data-bs-target="#createCustomerModal">
            <i class="fas fa-plus"></i> New Customer
          </button>
        </div>
      </form>
    </div>
  </div>

  <!-- Customer Statistics -->
  <div class="row mb-3">
    <div class="col-md-3">
      <div class="card bg-primary text-white">
        <div class="card-body">
          <h5 class="card-title">Total Customers</h5>
          <h2 id="totalCustomers">-</h2>
        </div>
      </div>
    </div>
    <div class="col-md-3">
      <div class="card bg-success text-white">
        <div class="card-body">
          <h5 class="card-title">Active Customers</h5>
          <h2 id="activeCustomers">-</h2>
        </div>
      </div>
    </div>
    <div class="col-md-3">
      <div class="card bg-warning text-white">
        <div class="card-body">
          <h5 class="card-title">Total Debt</h5>
          <h2 id="totalDebt">-</h2>
        </div>
      </div>
    </div>
    <div class="col-md-3">
      <div class="card bg-info text-white">
        <div class="card-body">
          <h5 class="card-title">Avg Spending</h5>
          <h2 id="avgSpending">-</h2>
        </div>
      </div>
    </div>
  </div>

  <!-- Customer Table -->
  <div class="card">
    <div class="card-body">
      <div class="table-responsive">
        <table class="table table-hover">
          <thead>
            <tr>
              <th>Name</th>
              <th>WhatsApp</th>
              <th>Balance</th>
              <th>Total Spent</th>
              <th>Subscriptions</th>
              <th>Status</th>
              <th>Tags</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="customerTableBody">
            <!-- Data loaded dynamically -->
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <nav class="mt-3">
        <ul class="pagination" id="pagination">
          <!-- Pagination loaded dynamically -->
        </ul>
      </nav>
    </div>
  </div>
</div>
```

### 9.2 Customer Detail View
```javascript
// public/js/customers.js
class CustomerManager {
  static async loadCustomerDetails(customerId) {
    try {
      // Load customer data
      const customer = await this.apiCall(`/api/customers/${customerId}`);

      // Update UI
      document.getElementById('customerName').textContent = customer.name;
      document.getElementById('customerWhatsApp').textContent = customer.whatsapp;
      document.getElementById('customerBalance').textContent = this.formatCurrency(customer.balance);

      // Load subscriptions
      const subscriptions = await this.apiCall(`/api/subscriptions?customer_id=${customerId}`);
      this.renderSubscriptions(subscriptions);

      // Load balance history
      const balanceHistory = await this.apiCall(`/api/customers/${customerId}/balance/history`);
      this.renderBalanceHistory(balanceHistory);

      // Load activity log
      const activityLog = await this.apiCall(`/api/customers/${customerId}/activity`);
      this.renderActivityLog(activityLog);

    } catch (error) {
      console.error('Error loading customer:', error);
      this.showAlert('Error loading customer details', 'danger');
    }
  }

  static renderSubscriptions(subscriptions) {
    const container = document.getElementById('subscriptionList');

    if (subscriptions.length === 0) {
      container.innerHTML = '<p class="text-muted">No subscriptions found</p>';
      return;
    }

    container.innerHTML = subscriptions.map(sub => `
      <div class="card mb-2">
        <div class="card-body">
          <div class="row align-items-center">
            <div class="col-md-3">
              <strong>${sub.type}</strong>
              <br>
              <small class="text-muted">${sub.profile_name}</small>
            </div>
            <div class="col-md-2">
              <span class="badge bg-${sub.status === 'active' ? 'success' : 'secondary'}">
                ${sub.status}
              </span>
            </div>
            <div class="col-md-2">
              Rp ${this.formatCurrency(sub.price)}
            </div>
            <div class="col-md-2">
              ${sub.next_billing || '-'}
            </div>
            <div class="col-md-3">
              <button class="btn btn-sm btn-primary" onclick="editSubscription(${sub.id})">
                Edit
              </button>
              <button class="btn btn-sm btn-info" onclick="viewInvoices(${sub.id})">
                Invoices
              </button>
            </div>
          </div>
        </div>
      </div>
    `).join('');
  }

  static async updateBalance(customerId, amount, type) {
    try {
      const response = await this.apiCall(`/api/customers/${customerId}/balance`, {
        method: 'POST',
        body: JSON.stringify({
          amount: amount,
          type: type,
          description: `${type === 'credit' ? 'Add credit' : 'Payment'} via admin panel`
        })
      });

      if (response.success) {
        this.showAlert('Balance updated successfully', 'success');
        // Reload customer data
        this.loadCustomerDetails(customerId);
      }
    } catch (error) {
      console.error('Error updating balance:', error);
      this.showAlert('Error updating balance', 'danger');
    }
  }
}
```

## 10. Import/Export Functionality

### 10.1 Customer Import
```javascript
// CSV Import service
class CustomerImportService {
  static async importFromCSV(file, options = {}) {
    const results = {
      total: 0,
      imported: 0,
      failed: 0,
      errors: []
    };

    try {
      // 1. Parse CSV
      const csvData = await this.parseCSV(file);
      results.total = csvData.length;

      // 2. Process each row
      for (let i = 0; i < csvData.length; i++) {
        const row = csvData[i];

        try {
          // 3. Validate and format data
          const customerData = this.validateAndFormatCustomer(row, options);

          // 4. Create customer
          await CustomerService.createCustomer(customerData, options.importedBy);
          results.imported++;

        } catch (error) {
          results.failed++;
          results.errors.push({
            row: i + 2, // CSV row number (header + 1-indexed)
            error: error.message,
            data: row
          });
        }
      }

      // 5. Return results
      return results;

    } catch (error) {
      console.error('Import error:', error);
      throw error;
    }
  }

  static validateAndFormatCustomer(row, options) {
    // Required fields
    if (!row.name || !row.whatsapp) {
      throw new Error('Name and WhatsApp are required');
    }

    // Format WhatsApp
    const whatsapp = CustomerService.formatWhatsAppNumber(row.whatsapp);

    // Check for duplicates if option is set
    if (options.checkDuplicates) {
      const existing = await db.query(
        'SELECT id FROM customers WHERE whatsapp = ?',
        [whatsapp]
      );

      if (existing.rows.length > 0) {
        throw new Error('Customer with this WhatsApp already exists');
      }
    }

    return {
      name: row.name.trim(),
      whatsapp: whatsapp,
      email: row.email || null,
      phone: row.phone || null,
      address: row.address || null,
      initial_balance: parseFloat(row.initial_balance) || 0,
      tags: row.tags ? row.tags.split(',').map(t => t.trim()) : [],
      notes: row.notes || null
    };
  }
}
```

## 11. Data Privacy & GDPR Considerations

### 11.1 Data Privacy Features
```javascript
// Data privacy service
class DataPrivacyService {
  static async exportCustomerData(customerId) {
    try {
      // Get all customer data
      const customer = await db.query('SELECT * FROM customers WHERE id = ?', [customerId]);
      const subscriptions = await db.query('SELECT * FROM subscriptions WHERE customer_id = ?', [customerId]);
      const payments = await db.query('SELECT * FROM payments WHERE customer_id = ?', [customerId]);
      const balanceHistory = await db.query('SELECT * FROM customer_balance_history WHERE customer_id = ?', [customerId]);
      const activityLog = await db.query('SELECT * FROM customer_activity_log WHERE customer_id = ?', [customerId]);

      return {
        customer: customer.rows[0],
        subscriptions: subscriptions.rows,
        payments: payments.rows,
        balanceHistory: balanceHistory.rows,
        activityLog: activityLog.rows,
        exportDate: new Date().toISOString()
      };

    } catch (error) {
      console.error('Error exporting data:', error);
      throw error;
    }
  }

  static async anonymizeCustomerData(customerId) {
    const transaction = await db.beginTransaction();

    try {
      // Anonymize personal data
      await transaction.query(`
        UPDATE customers
        SET
          name = 'Anonymous Customer',
          whatsapp = CONCAT('+628', LPAD(?, 9, '0')),
          email = NULL,
          phone = NULL,
          address = NULL,
          notes = 'Data anonymized on ' || CURRENT_DATE,
          status = 'inactive',
          updated_at = NOW()
        WHERE id = ?
      `, [customerId, customerId]);

      // Log anonymization
      await transaction.query(`
        INSERT INTO customer_activity_log
        (customer_id, action, details, timestamp)
        VALUES (?, 'anonymized', ?, NOW())
      `, [customerId, JSON.stringify({ action: 'gdpr_anonymization' })]);

      await transaction.commit();

      return { success: true };

    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  static async deleteCustomerData(customerId, hardDelete = false) {
    if (hardDelete) {
      // Hard delete - completely remove data
      await db.query('DELETE FROM customers WHERE id = ?', [customerId]);
      // Related data will be deleted due to foreign key constraints
    } else {
      // Soft delete - mark as deleted
      await db.query(`
        UPDATE customers
        SET status = 'deleted', updated_at = NOW()
        WHERE id = ?
      `, [customerId]);
    }

    return { success: true };
  }
}
```

## 12. Testing Strategy

### 12.1 Unit Tests
```javascript
// Customer service tests
describe('CustomerService', () => {
  test('Should create customer with valid data', async () => {
    const customerData = {
      name: 'Test Customer',
      whatsapp: '+62812345678',
      email: 'test@example.com'
    };

    const result = await CustomerService.createCustomer(customerData, 'test-admin');

    expect(result.success).toBe(true);
    expect(result.customer.name).toBe('Test Customer');
    expect(result.customer.whatsapp).toBe('+62812345678');
  });

  test('Should reject duplicate WhatsApp', async () => {
    const customerData = {
      name: 'Test Customer 2',
      whatsapp: '+62812345678' // Already exists
    };

    await expect(
      CustomerService.createCustomer(customerData, 'test-admin')
    ).rejects.toThrow('Customer with this WhatsApp number already exists');
  });

  test('Should update balance correctly', async () => {
    const result = await BalanceService.updateBalance(
      1,
      50000,
      'credit',
      'Test credit'
    );

    expect(result.success).toBe(true);
    expect(result.new_balance).toBe(50000);
  });
});
```

## 13. Best Practices & Guidelines

### 13.1 Customer Management Best Practices
1. **WhatsApp as Primary Contact**: Always validate and format WhatsApp numbers
2. **Unique Identifier**: WhatsApp number must be unique per customer
3. **Balance Accuracy**: Always log balance changes with proper audit trail
4. **Data Validation**: Validate all inputs before saving to database
5. **Activity Logging**: Log all customer-related activities
6. **Privacy Protection**: Implement proper data privacy measures

### 13.2 Common Pitfalls & Solutions
1. **Duplicate Customers**: Always check WhatsApp uniqueness
2. **Balance Errors**: Use transactions for balance operations
3. **Invalid WhatsApp**: Implement proper formatting and validation
4. **Missing History**: Always create audit trail for changes
5. **Performance Issues**: Implement proper indexing and pagination

---

*Version: 2.0.0*
*Last Updated: 2025-01-09*
*Status: Ready for Implementation*