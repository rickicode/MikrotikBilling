# Carry Over Logic v2.0 - Spesifikasi Lengkap

## 1. Overview

Sistem carry over v2.0 mengelola pembayaran parsial untuk invoice dengan automatic carry over ke subscription balance. Ketika customer membayar kurang dari jumlah invoice, selisihnya ditambahkan ke balance subscription untuk periode berikutnya.

## 2. Key Features

### 2.1 Core Features
- **Automatic Carry Over**: Pembayaran parsial otomatis ditambah ke balance
- **No Grace Period**: Tidak ada grace period, invoice URL selalu aktif
- **Balance Tracking**: Positive balance untuk credit, negative untuk debt
- **Multi-Payment Support**: Beberapa pembayaran untuk satu invoice
- **Transparent Calculation**: Jelas terlihat berapa yang ter-carry over
- **Audit Trail**: Semua carry over transactions tercatat
- **Notification System**: Notifikasi otomatis untuk pembayaran parsial

### 2.2 Business Logic
- Pembayaran kurang dari invoice = carry over ke balance
- Pembayaran lebih dari invoice = excess ke balance
- Balance digunakan untuk potong invoice berikutnya
- Customer balance ter-tracking per customer
- Tidak ada pembayaran otomatis (manual payment required)
- System notifications, bukan admin notifications

## 3. Architecture

### 3.1 Components
```
src/services/CarryOverService.js     # Core carry over logic
src/services/InvoiceService.js       # Invoice management
src/services/PaymentService.js       # Payment processing
src/services/BalanceService.js       # Balance management
src/models/CreditBalance.js          # Credit balance model
src/routes/payments.js               # Payment endpoints
src/routes/subscriptions.js          # Subscription management
```

### 3.2 Data Flow
```
Payment Process:
1. Customer pays via payment link
2. System checks payment amount vs invoice amount
3. If partial:
   - Update invoice status (partial_paid)
   - Add difference to customer balance
   - Add to subscription balance
   - Send partial payment notification
4. If overpaid:
   - Update invoice status (paid)
   - Add excess to customer balance
   - Send overpayment notification
5. Create carry over record
6. Update audit log
```

### 3.3 Database Schema
```sql
-- Credit balance per customer
CREATE TABLE credit_balances (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    balance DECIMAL(10,2) DEFAULT 0, -- Positive: credit, Negative: debt
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(50),
    UNIQUE(customer_id)
);

-- Subscription balance (for carry over)
CREATE TABLE subscription_balances (
    id SERIAL PRIMARY KEY,
    subscription_id INTEGER NOT NULL REFERENCES subscriptions(id),
    balance DECIMAL(10,2) DEFAULT 0,
    last_invoice_id INTEGER,
    last_payment_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(subscription_id)
);

-- Carry over transactions
CREATE TABLE carry_over_transactions (
    id SERIAL PRIMARY KEY,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id),
    payment_id INTEGER NOT NULL REFERENCES payments(id),
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    subscription_id INTEGER NOT NULL REFERENCES subscriptions(id),

    -- Payment details
    invoice_amount DECIMAL(10,2) NOT NULL,
    payment_amount DECIMAL(10,2) NOT NULL,
    carry_over_amount DECIMAL(10,2) NOT NULL, -- Amount carried over (can be negative)

    -- Balance updates
    previous_balance DECIMAL(10,2) NOT NULL,
    new_balance DECIMAL(10,2) NOT NULL,

    -- Status and notes
    carry_over_type VARCHAR(20) NOT NULL CHECK (carry_over_type IN ('partial_payment', 'overpayment', 'exact_payment')),
    status VARCHAR(20) DEFAULT 'processed' CHECK (status IN ('processed', 'reverted', 'failed')),
    notes TEXT,

    -- Timestamps
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_by VARCHAR(50) NOT NULL,

    -- Reference for reversal
    parent_transaction_id INTEGER REFERENCES carry_over_transactions(id)
);

-- Invoice carry over tracking
CREATE TABLE invoice_carry_over (
    id SERIAL PRIMARY KEY,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id),
    total_payments DECIMAL(10,2) DEFAULT 0,
    total_carried_over DECIMAL(10,2) DEFAULT 0,
    remaining_balance DECIMAL(10,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'partial_paid', 'fully_paid', 'overpaid')),
    last_payment_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Balance adjustment log
CREATE TABLE balance_adjustments (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    subscription_id INTEGER REFERENCES subscriptions(id),
    adjustment_type VARCHAR(20) NOT NULL CHECK (adjustment_type IN ('payment', 'carry_over', 'refund', 'manual_adjustment')),
    amount DECIMAL(10,2) NOT NULL,
    previous_balance DECIMAL(10,2) NOT NULL,
    new_balance DECIMAL(10,2) NOT NULL,
    description TEXT,
    reference_id INTEGER, -- Can reference payment_id, carry_over_id, etc
    reference_type VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(50)
);
```

## 4. Carry Over Implementation

### 4.1 Core Carry Over Service
```javascript
// src/services/CarryOverService.js
class CarryOverService {
  static async processPaymentCarryOver(invoiceId, paymentId, paymentAmount, processedBy = 'system') {
    const transaction = await db.beginTransaction();

    try {
      // 1. Get invoice details
      const invoice = await transaction.query(`
        SELECT i.*, s.customer_id, s.id as subscription_id
        FROM invoices i
        JOIN subscriptions s ON i.subscription_id = s.id
        WHERE i.id = $1
      `, [invoiceId]);

      if (!invoice.rows.length) {
        throw new Error('Invoice not found');
      }

      const inv = invoice.rows[0];
      const invoiceAmount = parseFloat(inv.total_amount);
      const paymentAmountFloat = parseFloat(paymentAmount);

      // 2. Calculate carry over amount
      let carryOverAmount = 0;
      let carryOverType = 'exact_payment';

      if (paymentAmountFloat < invoiceAmount) {
        // Partial payment - carry over the negative difference
        carryOverAmount = paymentAmountFloat - invoiceAmount; // Negative value
        carryOverType = 'partial_payment';
      } else if (paymentAmountFloat > invoiceAmount) {
        // Overpayment - carry over the excess
        carryOverAmount = paymentAmountFloat - invoiceAmount; // Positive value
        carryOverType = 'overpayment';
      }

      // 3. Get current balances
      const [customerBalance, subscriptionBalance] = await Promise.all([
        this.getCustomerBalance(transaction, inv.customer_id),
        this.getSubscriptionBalance(transaction, inv.subscription_id)
      ]);

      // 4. Update balances if there's carry over
      if (carryOverAmount !== 0) {
        // Update customer balance
        const newCustomerBalance = customerBalance + carryOverAmount;
        await this.updateCustomerBalance(
          transaction,
          inv.customer_id,
          newCustomerBalance,
          `Carry over from invoice ${inv.invoice_number}`,
          {
            invoice_id: invoiceId,
            payment_id: paymentId,
            type: carryOverType
          },
          processedBy
        );

        // Update subscription balance
        const newSubscriptionBalance = subscriptionBalance + carryOverAmount;
        await this.updateSubscriptionBalance(
          transaction,
          inv.subscription_id,
          newSubscriptionBalance,
          invoiceId,
          paymentId
        );
      }

      // 5. Create carry over transaction record
      const carryOverRecord = await transaction.query(`
        INSERT INTO carry_over_transactions
        (invoice_id, payment_id, customer_id, subscription_id,
         invoice_amount, payment_amount, carry_over_amount,
         previous_balance, new_balance, carry_over_type,
         processed_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `, [
        invoiceId,
        paymentId,
        inv.customer_id,
        inv.subscription_id,
        invoiceAmount,
        paymentAmountFloat,
        carryOverAmount,
        customerBalance,
        customerBalance + carryOverAmount,
        carryOverType,
        processedBy
      ]);

      // 6. Update invoice carry over tracking
      await this.updateInvoiceCarryOver(
        transaction,
        invoiceId,
        paymentAmountFloat,
        carryOverAmount
      );

      // 7. Log balance adjustment
      await transaction.query(`
        INSERT INTO balance_adjustments
        (customer_id, subscription_id, adjustment_type, amount,
         previous_balance, new_balance, description, reference_id, reference_type, created_by)
        VALUES ($1, $2, 'carry_over', $3, $4, $5, $6, $7, $8, $9)
      `, [
        inv.customer_id,
        inv.subscription_id,
        carryOverAmount,
        customerBalance,
        customerBalance + carryOverAmount,
        `${carryOverType} for invoice ${inv.invoice_number}`,
        carryOverRecord.rows[0].id,
        'carry_over_transaction',
        processedBy
      ]);

      await transaction.commit();

      // 8. Send notification based on type
      await this.sendCarryOverNotification(
        inv.customer_id,
        carryOverType,
        {
          invoice: inv,
          paymentAmount: paymentAmountFloat,
          carryOverAmount: Math.abs(carryOverAmount),
          newBalance: customerBalance + carryOverAmount
        }
      );

      return {
        success: true,
        carryOverAmount: carryOverAmount,
        carryOverType: carryOverType,
        newBalance: customerBalance + carryOverAmount,
        transactionId: carryOverRecord.rows[0].id
      };

    } catch (error) {
      await transaction.rollback();
      console.error('Carry over processing error:', error);
      throw error;
    }
  }

  static async getCustomerBalance(transaction, customerId) {
    const result = await transaction.query(
      'SELECT balance FROM credit_balances WHERE customer_id = ?',
      [customerId]
    );

    return result.rows.length > 0 ? parseFloat(result.rows[0].balance) : 0;
  }

  static async getSubscriptionBalance(transaction, subscriptionId) {
    const result = await transaction.query(
      'SELECT balance FROM subscription_balances WHERE subscription_id = ?',
      [subscriptionId]
    );

    return result.rows.length > 0 ? parseFloat(result.rows[0].balance) : 0;
  }

  static async updateCustomerBalance(transaction, customerId, newBalance, description, reference, updatedBy) {
    await transaction.query(`
      INSERT INTO credit_balances (customer_id, balance, updated_by)
      VALUES ($1, $2, $4)
      ON CONFLICT (customer_id) DO UPDATE SET
        balance = EXCLUDED.balance,
        last_updated = NOW(),
        updated_by = EXCLUDED.updated_by
    `, [customerId, newBalance, description, updatedBy]);

    // Also update customers table
    await transaction.query(
      'UPDATE customers SET balance = ?, updated_at = NOW() WHERE id = ?',
      [newBalance, customerId]
    );
  }

  static async updateSubscriptionBalance(transaction, subscriptionId, newBalance, invoiceId, paymentId) {
    await transaction.query(`
      INSERT INTO subscription_balances
      (subscription_id, balance, last_invoice_id, last_payment_id)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (subscription_id) DO UPDATE SET
        balance = EXCLUDED.balance,
        last_invoice_id = EXCLUDED.last_invoice_id,
        last_payment_id = EXCLUDED.last_payment_id,
        updated_at = NOW()
    `, [subscriptionId, newBalance, invoiceId, paymentId]);
  }

  static async updateInvoiceCarryOver(transaction, invoiceId, paymentAmount, carryOverAmount) {
    // Get current carry over tracking
    const current = await transaction.query(
      'SELECT * FROM invoice_carry_over WHERE invoice_id = ?',
      [invoiceId]
    );

    if (current.rows.length === 0) {
      // Create new tracking record
      await transaction.query(`
        INSERT INTO invoice_carry_over
        (invoice_id, total_payments, total_carried_over, remaining_balance, status, last_payment_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
      `, [
        invoiceId,
        paymentAmount,
        Math.abs(carryOverAmount),
        carryOverAmount < 0 ? -carryOverAmount : 0,
        carryOverAmount === 0 ? 'fully_paid' : 'partial_paid'
      ]);
    } else {
      // Update existing record
      const tracking = current.rows[0];
      const newTotalPayments = tracking.total_payments + paymentAmount;
      const newTotalCarried = tracking.total_carried_over + Math.abs(carryOverAmount);
      const newRemaining = tracking.remaining_balance + (carryOverAmount < 0 ? -carryOverAmount : 0);

      await transaction.query(`
        UPDATE invoice_carry_over
        SET
          total_payments = $1,
          total_carried_over = $2,
          remaining_balance = $3,
          status = $4,
          last_payment_at = NOW(),
          updated_at = NOW()
        WHERE invoice_id = $5
      `, [
        newTotalPayments,
        newTotalCarried,
        newRemaining,
        carryOverAmount === 0 && newRemaining === 0 ? 'fully_paid' :
        newRemaining === 0 ? 'fully_paid' : 'partial_paid',
        invoiceId
      ]);
    }
  }
}
```

### 4.2 Balance Application Service
```javascript
// src/services/BalanceApplicationService.js
class BalanceApplicationService {
  static async applyBalanceToInvoice(invoiceId) {
    const transaction = await db.beginTransaction();

    try {
      // 1. Get invoice details
      const invoice = await transaction.query(`
        SELECT i.*, s.customer_id, s.id as subscription_id
        FROM invoices i
        JOIN subscriptions s ON i.subscription_id = s.id
        WHERE i.id = $1 AND i.status IN ('pending', 'partial_paid')
      `, [invoiceId]);

      if (!invoice.rows.length) {
        throw new Error('Invoice not found or already paid');
      }

      const inv = invoice.rows[0];

      // 2. Get customer and subscription balances
      const [customerBalance, subscriptionBalance] = await Promise.all([
        CarryOverService.getCustomerBalance(transaction, inv.customer_id),
        CarryOverService.getSubscriptionBalance(transaction, inv.subscription_id)
      ]);

      // 3. Calculate available balance
      // Prioritize subscription balance over customer balance
      const availableBalance = subscriptionBalance || customerBalance;

      if (availableBalance <= 0) {
        await transaction.rollback();
        return { success: false, reason: 'No available balance' };
      }

      // 4. Calculate amount to apply
      const remainingInvoice = parseFloat(inv.total_amount) - parseFloat(inv.paid_amount || 0);
      const amountToApply = Math.min(availableBalance, remainingInvoice);

      // 5. Create payment record for balance application
      const payment = await transaction.query(`
        INSERT INTO payments
        (invoice_id, customer_id, amount, method, status, reference, notes, created_at, created_by)
        VALUES ($1, $2, $3, 'balance', 'success', $4, $5, NOW(), $6)
        RETURNING *
      `, [
        invoiceId,
        inv.customer_id,
        amountToApply,
        `BAL-${Date.now()}`,
        `Payment using available balance`,
        'system'
      ]);

      // 6. Update invoice paid amount
      const newPaidAmount = parseFloat(inv.paid_amount || 0) + amountToApply;
      const invoiceStatus = newPaidAmount >= parseFloat(inv.total_amount) ? 'paid' : 'partial_paid';

      await transaction.query(`
        UPDATE invoices
        SET
          paid_amount = $1,
          status = $2,
          updated_at = NOW()
        WHERE id = $3
      `, [newPaidAmount, invoiceStatus, invoiceId]);

      // 7. Deduct from balance
      // Use subscription balance first if available
      if (subscriptionBalance >= amountToApply) {
        const newSubscriptionBalance = subscriptionBalance - amountToApply;
        await CarryOverService.updateSubscriptionBalance(
          transaction,
          inv.subscription_id,
          newSubscriptionBalance,
          invoiceId,
          payment.rows[0].id
        );
      } else {
        // Use customer balance
        const newCustomerBalance = customerBalance - amountToApply;
        await CarryOverService.updateCustomerBalance(
          transaction,
          inv.customer_id,
          newCustomerBalance,
          `Payment for invoice ${inv.invoice_number}`,
          {
            invoice_id: invoiceId,
            payment_id: payment.rows[0].id,
            type: 'balance_application'
          },
          'system'
        );
      }

      // 8. Log balance application
      await transaction.query(`
        INSERT INTO balance_adjustments
        (customer_id, subscription_id, adjustment_type, amount,
         previous_balance, new_balance, description, reference_id, reference_type, created_by)
        VALUES ($1, $2, 'payment', $3, $4, $5, $6, $7, $8, $9)
      `, [
        inv.customer_id,
        inv.subscription_id,
        -amountToApply, // Negative because it's a deduction
        subscriptionBalance >= amountToApply ? subscriptionBalance : customerBalance,
        subscriptionBalance >= amountToApply ? subscriptionBalance - amountToApply : customerBalance - amountToApply,
        `Balance application for invoice ${inv.invoice_number}`,
        payment.rows[0].id,
        'payment',
        'system'
      ]);

      await transaction.commit();

      // 9. Send notification
      await this.sendBalanceApplicationNotification(
        inv.customer_id,
        {
          invoice: inv,
          amountApplied: amountToApply,
          remainingBalance: subscriptionBalance >= amountToApply ?
            subscriptionBalance - amountToApply :
            customerBalance - amountToApply,
          invoiceStatus: invoiceStatus
        }
      );

      return {
        success: true,
        amountApplied: amountToApply,
        invoiceStatus: invoiceStatus,
        paymentId: payment.rows[0].id
      };

    } catch (error) {
      await transaction.rollback();
      console.error('Balance application error:', error);
      throw error;
    }
  }

  static async checkAndApplyBalanceAutomatically() {
    // Check all pending invoices and apply balance if available
    const pendingInvoices = await db.query(`
      SELECT i.id, i.total_amount, i.paid_amount, i.due_date,
             s.customer_id, s.id as subscription_id
      FROM invoices i
      JOIN subscriptions s ON i.subscription_id = s.id
      WHERE i.status IN ('pending', 'partial_paid')
      AND i.due_date <= NOW()
      ORDER BY i.due_date ASC
    `);

    const results = [];

    for (const invoice of pendingInvoices.rows) {
      try {
        const result = await this.applyBalanceToInvoice(invoice.id);
        if (result.success) {
          results.push({
            invoiceId: invoice.id,
            applied: result.amountApplied,
            status: 'success'
          });
        }
      } catch (error) {
        console.error(`Error applying balance to invoice ${invoice.id}:`, error);
        results.push({
          invoiceId: invoice.id,
          status: 'failed',
          error: error.message
        });
      }
    }

    return results;
  }
}
```

## 5. Notification System

### 5.1 Carry Over Notifications
```javascript
// src/services/CarryOverNotificationService.js
class CarryOverNotificationService {
  static async sendCarryOverNotification(customerId, type, data) {
    try {
      // Get customer details
      const customer = await db.query(
        'SELECT * FROM customers WHERE id = ?',
        [customerId]
      );

      if (!customer.rows.length || !customer.rows[0].whatsapp) {
        return; // No WhatsApp number
      }

      const c = customer.rows[0];
      let template, messageData;

      switch (type) {
        case 'partial_payment':
          template = 'partial_payment_carry_over';
          messageData = {
            customerName: c.name,
            invoiceNumber: data.invoice.invoice_number,
            invoiceAmount: this.formatCurrency(data.invoice.total_amount),
            paymentAmount: this.formatCurrency(data.paymentAmount),
            remainingAmount: this.formatCurrency(data.invoice.total_amount - data.paymentAmount),
            carryOverAmount: this.formatCurrency(data.carryOverAmount),
            newBalance: this.formatCurrency(data.newBalance),
            nextInvoiceDate: this.formatDate(data.invoice.next_billing)
          };
          break;

        case 'overpayment':
          template = 'payment_overpayment';
          messageData = {
            customerName: c.name,
            invoiceNumber: data.invoice.invoice_number,
            invoiceAmount: this.formatCurrency(data.invoice.total_amount),
            paymentAmount: this.formatCurrency(data.paymentAmount),
            excessAmount: this.formatCurrency(data.carryOverAmount),
            newBalance: this.formatCurrency(data.newBalance)
          };
          break;

        case 'balance_applied':
          template = 'balance_payment_applied';
          messageData = {
            customerName: c.name,
            invoiceNumber: data.invoice.invoice_number,
            amountApplied: this.formatCurrency(data.amountApplied),
            remainingBalance: this.formatCurrency(data.remainingBalance),
            invoiceStatus: data.invoiceStatus === 'paid' ? 'Lunas' : 'Belum Lunas'
          };
          break;
      }

      // Send WhatsApp notification
      await whatsappService.sendNotification(
        c.whatsapp,
        template,
        messageData
      );

      // Log notification
      await db.query(`
        INSERT INTO notification_logs
        (customer_id, type, template, data, sent_at, status)
        VALUES ($1, 'carry_over', $2, $3, NOW(), 'sent')
      `, [customerId, template, JSON.stringify(messageData)]);

    } catch (error) {
      console.error('Error sending carry over notification:', error);
    }
  }

  static async sendBalanceApplicationNotification(customerId, data) {
    await this.sendCarryOverNotification(customerId, 'balance_applied', data);
  }

  static formatCurrency(amount) {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR'
    }).format(amount);
  }

  static formatDate(date) {
    return new Date(date).toLocaleDateString('id-ID', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }
}
```

## 6. API Endpoints

### 6.1 Carry Over Management Endpoints
```javascript
// Process carry over (internal use, called by payment system)
POST /api/carry-over/process
{
  invoiceId: 12345,
  paymentId: 67890,
  paymentAmount: 100000,
  processedBy: "system"
}

// Apply balance to invoice
POST /api/carry-over/apply-balance
{
  invoiceId: 12345
}

// Get customer balance details
GET /api/customers/:id/balance
// Response:
{
  "balance": 50000,
  "subscription_balances": [
    {
      "subscription_id": 123,
      "balance": 25000,
      "subscription_name": "Internet 10Mbps"
    }
  ],
  "carry_over_history": [...]
}

// Get carry over history
GET /api/carry-over/history?customer_id=123&start_date=2025-01-01&end_date=2025-01-31

// Manual balance adjustment (admin only)
POST /api/carry-over/manual-adjustment
{
  customerId: 12345,
  subscriptionId: 67890, // Optional
  amount: -50000, // Negative = deduction, Positive = addition
  reason: "Manual adjustment for refund",
  adjustedBy: "admin"
}

// Get carry over statistics
GET /api/carry-over/statistics?period=30d
// Response:
{
  "total_carried_over": 15000000,
  "partial_payments": 150,
  "overpayments": 25,
  "balance_utilized": 12000000,
  "active_balances": 75
}
```

## 7. Reporting & Analytics

### 7.1 Carry Over Reports
```javascript
// src/services/CarryOverReportService.js
class CarryOverReportService {
  static async generateCarryOverReport(startDate, endDate) {
    try {
      const report = await db.query(`
        SELECT
          DATE(ct.processed_at) as date,
          COUNT(*) as total_transactions,
          COUNT(CASE WHEN ct.carry_over_type = 'partial_payment' THEN 1 END) as partial_payments,
          COUNT(CASE WHEN ct.carry_over_type = 'overpayment' THEN 1 END) as overpayments,
          SUM(ABS(ct.carry_over_amount)) as total_carried_over,
          AVG(ABS(ct.carry_over_amount)) as avg_carry_over,
          MAX(ABS(ct.carry_over_amount)) as max_carry_over,
          SUM(CASE WHEN ct.carry_over_amount > 0 THEN ct.carry_over_amount ELSE 0 END) as total_credit,
          SUM(CASE WHEN ct.carry_over_amount < 0 THEN ABS(ct.carry_over_amount) ELSE 0 END) as total_debt
        FROM carry_over_transactions ct
        WHERE ct.processed_at BETWEEN $1 AND $2
        GROUP BY DATE(ct.processed_at)
        ORDER BY date ASC
      `, [startDate, endDate]);

      return report.rows;
    } catch (error) {
      console.error('Error generating carry over report:', error);
      throw error;
    }
  }

  static async getBalanceSummary() {
    const summary = await db.query(`
      SELECT
        COUNT(CASE WHEN cb.balance > 0 THEN 1 END) as customers_with_credit,
        COUNT(CASE WHEN cb.balance < 0 THEN 1 END) as customers_with_debt,
        COUNT(CASE WHEN cb.balance = 0 THEN 1 END) as customers_zero_balance,
        SUM(CASE WHEN cb.balance > 0 THEN cb.balance ELSE 0 END) as total_credit_balance,
        SUM(CASE WHEN cb.balance < 0 THEN ABS(cb.balance) ELSE 0 END) as total_debt_balance,
        AVG(cb.balance) as avg_balance,
        MAX(cb.balance) as max_balance,
        MIN(cb.balance) as min_balance
      FROM credit_balances cb
      JOIN customers c ON cb.customer_id = c.id
      WHERE c.status = 'active'
    `);

    return summary.rows[0];
  }

  static async getTopBalanceCustomers(limit = 10) {
    const topCustomers = await db.query(`
      SELECT
        c.id,
        c.name,
        c.whatsapp,
        cb.balance,
        COUNT(ct.id) as carry_over_count,
        SUM(ABS(ct.carry_over_amount)) as total_carried_over
      FROM customers c
      JOIN credit_balances cb ON c.id = cb.customer_id
      LEFT JOIN carry_over_transactions ct ON c.id = ct.customer_id
      WHERE c.status = 'active' AND cb.balance != 0
      GROUP BY c.id, cb.balance
      ORDER BY ABS(cb.balance) DESC
      LIMIT ?
    `, [limit]);

    return topCustomers.rows;
  }
}
```

## 8. Frontend Implementation

### 8.1 Balance Dashboard UI
```html
<!-- views/customers/balance.ejs -->
<div class="container-fluid">
  <div class="row">
    <!-- Customer Balance Overview -->
    <div class="col-md-4">
      <div class="card">
        <div class="card-header">
          <h5 class="mb-0">Customer Balance</h5>
        </div>
        <div class="card-body">
          <div class="text-center mb-3">
            <h2 class="mb-0" id="customerBalance">Rp 0</h2>
            <small class="text-muted" id="balanceType">No Balance</small>
          </div>
          <div class="d-grid">
            <button class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#adjustBalanceModal">
              Adjust Balance
            </button>
          </div>
        </div>
      </div>

      <!-- Balance Statistics -->
      <div class="card mt-3">
        <div class="card-body">
          <h6>Balance Statistics</h6>
          <div class="row text-center">
            <div class="col-6">
              <small class="text-muted">Total Credit</small>
              <div id="totalCredit">Rp 0</div>
            </div>
            <div class="col-6">
              <small class="text-muted">Total Debt</small>
              <div id="totalDebt">Rp 0</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Carry Over History -->
    <div class="col-md-8">
      <div class="card">
        <div class="card-header d-flex justify-content-between">
          <h5 class="mb-0">Carry Over History</h5>
          <button class="btn btn-sm btn-outline-primary" onclick="refreshHistory()">
            <i class="fas fa-sync"></i>
          </button>
        </div>
        <div class="card-body">
          <div class="table-responsive">
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Invoice</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Balance After</th>
                </tr>
              </thead>
              <tbody id="carryOverHistory">
                <!-- Data loaded dynamically -->
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Subscription Balances -->
      <div class="card mt-3">
        <div class="card-header">
          <h5 class="mb-0">Subscription Balances</h5>
        </div>
        <div class="card-body">
          <div id="subscriptionBalances">
            <!-- Data loaded dynamically -->
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- Balance Adjustment Modal -->
<div class="modal fade" id="adjustBalanceModal">
  <div class="modal-dialog">
    <div class="modal-content">
      <form id="adjustBalanceForm">
        <div class="modal-header">
          <h5 class="modal-title">Adjust Balance</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body">
          <div class="mb-3">
            <label class="form-label">Adjustment Type</label>
            <select class="form-select" name="adjustmentType" required>
              <option value="">Select type</option>
              <option value="credit">Add Credit</option>
              <option value="debit">Add Debt</option>
            </select>
          </div>
          <div class="mb-3">
            <label class="form-label">Amount</label>
            <input type="number" class="form-control" name="amount" required min="0" step="0.01">
          </div>
          <div class="mb-3">
            <label class="form-label">Reason</label>
            <textarea class="form-control" name="reason" rows="3" required></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
          <button type="submit" class="btn btn-primary">Adjust Balance</button>
        </div>
      </form>
    </div>
  </div>
</div>
```

### 8.2 Frontend JavaScript
```javascript
// public/js/balance.js
class BalanceManager {
  static async loadCustomerBalance(customerId) {
    try {
      const balance = await this.apiCall(`/api/customers/${customerId}/balance`);

      // Update balance display
      const balanceElement = document.getElementById('customerBalance');
      const typeElement = document.getElementById('balanceType');

      balanceElement.textContent = this.formatCurrency(balance.balance);

      if (balance.balance > 0) {
        balanceElement.className = 'text-success';
        typeElement.textContent = 'Credit Balance';
      } else if (balance.balance < 0) {
        balanceElement.className = 'text-danger';
        typeElement.textContent = 'Outstanding Debt';
      } else {
        balanceElement.className = 'text-muted';
        typeElement.textContent = 'No Balance';
      }

      // Update statistics
      document.getElementById('totalCredit').textContent = this.formatCurrency(balance.total_credit || 0);
      document.getElementById('totalDebt').textContent = this.formatCurrency(balance.total_debt || 0);

      // Render carry over history
      this.renderCarryOverHistory(balance.carry_over_history || []);

      // Render subscription balances
      this.renderSubscriptionBalances(balance.subscription_balances || []);

    } catch (error) {
      console.error('Error loading balance:', error);
      this.showAlert('Error loading balance data', 'danger');
    }
  }

  static renderCarryOverHistory(history) {
    const tbody = document.getElementById('carryOverHistory');

    if (history.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No carry over history</td></tr>';
      return;
    }

    tbody.innerHTML = history.map(item => `
      <tr>
        <td>${this.formatDate(item.processed_at)}</td>
        <td>${item.invoice_number}</td>
        <td>
          <span class="badge bg-${item.carry_over_type === 'overpayment' ? 'success' : 'warning'}">
            ${item.carry_over_type.replace('_', ' ')}
          </span>
        </td>
        <td class="${item.carry_over_amount > 0 ? 'text-success' : 'text-danger'}">
          ${item.carry_over_amount > 0 ? '+' : ''}${this.formatCurrency(Math.abs(item.carry_over_amount))}
        </td>
        <td class="${item.new_balance > 0 ? 'text-success' : item.new_balance < 0 ? 'text-danger' : ''}">
          ${this.formatCurrency(item.new_balance)}
        </td>
      </tr>
    `).join('');
  }

  static renderSubscriptionBalances(balances) {
    const container = document.getElementById('subscriptionBalances');

    if (balances.length === 0) {
      container.innerHTML = '<p class="text-muted">No subscription balances</p>';
      return;
    }

    container.innerHTML = balances.map(balance => `
      <div class="d-flex justify-content-between align-items-center mb-2">
        <div>
          <strong>${balance.subscription_name}</strong>
          <br>
          <small class="text-muted">Last invoice: ${balance.last_invoice_number || '-'}</small>
        </div>
        <div class="text-end">
          <strong class="${balance.balance > 0 ? 'text-success' : 'text-danger'}">
            ${this.formatCurrency(balance.balance)}
          </strong>
        </div>
      </div>
    `).join('');
  }

  static async adjustBalance(customerId, formData) {
    try {
      const adjustmentType = formData.get('adjustmentType');
      const amount = parseFloat(formData.get('amount'));
      const reason = formData.get('reason');

      // Calculate signed amount
      const signedAmount = adjustmentType === 'credit' ? amount : -amount;

      const response = await this.apiCall('/api/carry-over/manual-adjustment', {
        method: 'POST',
        body: JSON.stringify({
          customerId: customerId,
          amount: signedAmount,
          reason: reason
        })
      });

      if (response.success) {
        this.showAlert('Balance adjusted successfully', 'success');
        this.loadCustomerBalance(customerId);

        // Close modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('adjustBalanceModal'));
        modal.hide();
      }

    } catch (error) {
      console.error('Error adjusting balance:', error);
      this.showAlert('Error adjusting balance', 'danger');
    }
  }
}
```

## 9. Testing Strategy

### 9.1 Unit Tests
```javascript
// Carry over service tests
describe('CarryOverService', () => {
  test('Should process partial payment carry over correctly', async () => {
    const invoice = {
      id: 1,
      total_amount: 100000,
      customer_id: 123,
      subscription_id: 456
    };

    const result = await CarryOverService.processPaymentCarryOver(
      invoice.id,
      1,
      80000, // Paid 80k out of 100k
      'system'
    );

    expect(result.carryOverType).toBe('partial_payment');
    expect(result.carryOverAmount).toBe(-20000); // Negative = debt
    expect(result.newBalance).toBe(-20000);
  });

  test('Should process overpayment correctly', async () => {
    const invoice = {
      id: 2,
      total_amount: 100000,
      customer_id: 123,
      subscription_id: 456
    };

    const result = await CarryOverService.processPaymentCarryOver(
      invoice.id,
      2,
      120000, // Paid 120k for 100k invoice
      'system'
    );

    expect(result.carryOverType).toBe('overpayment');
    expect(result.carryOverAmount).toBe(20000); // Positive = credit
    expect(result.newBalance).toBe(20000);
  });

  test('Should apply balance to pending invoice', async () => {
    // Create invoice with existing balance
    const result = await BalanceApplicationService.applyBalanceToInvoice(3);

    expect(result.success).toBe(true);
    expect(result.amountApplied).toBeGreaterThan(0);
    expect(result.invoiceStatus).toMatch(/paid|partial_paid/);
  });
});
```

## 10. Scheduled Tasks

### 10.1 Automated Carry Over Tasks
```javascript
// src/services/CarryOverScheduler.js
class CarryOverScheduler {
  static async runDailyTasks() {
    console.log('Running daily carry over tasks...');

    try {
      // 1. Check and apply balance to overdue invoices
      const balanceApplications = await BalanceApplicationService.checkAndApplyBalanceAutomatically();
      console.log(`Applied balance to ${balanceApplications.filter(r => r.status === 'success').length} invoices`);

      // 2. Generate daily carry over report
      await this.generateDailyReport();

      // 3. Check for negative balances
      await this.checkNegativeBalances();

      // 4. Send balance reminders
      await this.sendBalanceReminders();

      console.log('Daily carry over tasks completed');

    } catch (error) {
      console.error('Error in daily tasks:', error);
    }
  }

  static async checkNegativeBalances() {
    // Find customers with high debt
    const highDebtCustomers = await db.query(`
      SELECT c.id, c.name, c.whatsapp, cb.balance
      FROM customers c
      JOIN credit_balances cb ON c.id = cb.customer_id
      WHERE cb.balance < -500000 -- More than 500k debt
      AND c.status = 'active'
    `);

    for (const customer of highDebtCustomers.rows) {
      // Send high debt alert
      await this.sendHighDebtAlert(customer);
    }
  }

  static async sendBalanceReminders() {
    // Send reminders to customers with positive balance
    const customersWithCredit = await db.query(`
      SELECT c.id, c.name, c.whatsapp, cb.balance
      FROM customers c
      JOIN credit_balances cb ON c.id = cb.customer_id
      WHERE cb.balance > 0
      AND c.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM notification_logs nl
        WHERE nl.customer_id = c.id
        AND nl.type = 'balance_reminder'
        AND nl.sent_at > CURRENT_DATE - INTERVAL '7 days'
      )
    `);

    for (const customer of customersWithCredit.rows) {
      await whatsappService.sendNotification(
        customer.whatsapp,
        'balance_reminder',
        {
          customerName: customer.name,
          balanceAmount: this.formatCurrency(customer.balance)
        }
      );
    }
  }
}
```

## 11. Edge Cases & Error Handling

### 11.1 Common Scenarios
```javascript
// Edge case handling
class CarryOverEdgeCases {
  static async handleZeroAmountPayment(invoiceId, paymentId) {
    // Record zero payment but no carry over
    await db.query(`
      INSERT INTO carry_over_transactions
      (invoice_id, payment_id, customer_id, subscription_id,
       invoice_amount, payment_amount, carry_over_amount,
       previous_balance, new_balance, carry_over_type, notes)
      SELECT $1, $2, s.customer_id, s.id,
             i.total_amount, 0, 0,
             COALESCE(cb.balance, 0), COALESCE(cb.balance, 0),
             'exact_payment', 'Zero payment recorded'
      FROM invoices i
      JOIN subscriptions s ON i.subscription_id = s.id
      LEFT JOIN credit_balances cb ON s.customer_id = cb.customer_id
      WHERE i.id = $1
    `, [invoiceId, paymentId]);

    return { success: true, message: 'Zero payment recorded' };
  }

  static async handleCurrencyMismatch(invoiceId, paymentAmount, paymentCurrency) {
    // Handle different currencies (future feature)
    const invoice = await db.query(
      'SELECT currency FROM invoices WHERE id = ?',
      [invoiceId]
    );

    if (invoice.rows[0].currency !== paymentCurrency) {
      // Get exchange rate and convert
      const exchangeRate = await this.getExchangeRate(paymentCurrency, invoice.rows[0].currency);
      const convertedAmount = paymentAmount * exchangeRate;

      return {
        originalAmount: paymentAmount,
        convertedAmount: convertedAmount,
        exchangeRate: exchangeRate
      };
    }

    return { convertedAmount: paymentAmount };
  }

  static async handleCarryOverReversal(transactionId, reason) {
    // Reverse a carry over transaction
    const transaction = await db.query(
      'SELECT * FROM carry_over_transactions WHERE id = ?',
      [transactionId]
    );

    if (!transaction.rows.length) {
      throw new Error('Transaction not found');
    }

    const t = transaction.rows[0];

    // Create reversal transaction
    await db.query(`
      INSERT INTO carry_over_transactions
      (invoice_id, payment_id, customer_id, subscription_id,
       invoice_amount, payment_amount, carry_over_amount,
       previous_balance, new_balance, carry_over_type, notes,
       processed_by, parent_transaction_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `, [
      t.invoice_id,
      t.payment_id,
      t.customer_id,
      t.subscription_id,
      t.invoice_amount,
      t.payment_amount,
      -t.carry_over_amount, // Reverse the amount
      t.new_balance,
      t.previous_balance,
      'reversal',
      `Reversal: ${reason}`,
      'system',
      t.id
    ]);

    // Update customer balance
    await db.query(
      'UPDATE credit_balances SET balance = ? WHERE customer_id = ?',
      [t.previous_balance, t.customer_id]
    );

    return { success: true, reversedAmount: t.carry_over_amount };
  }
}
```

## 12. Performance Optimizations

### 12.1 Database Optimizations
```sql
-- Indexes for carry over queries
CREATE INDEX idx_carry_over_transactions_customer_id ON carry_over_transactions(customer_id);
CREATE INDEX idx_carry_over_transactions_subscription_id ON carry_over_transactions(subscription_id);
CREATE INDEX idx_carry_over_transactions_processed_at ON carry_over_transactions(processed_at);
CREATE INDEX idx_credit_balances_customer_id ON credit_balances(customer_id);
CREATE INDEX idx_subscription_balances_subscription_id ON subscription_balances(subscription_id);

-- Materialized view for balance summary
CREATE MATERIALIZED VIEW balance_summary AS
SELECT
  c.id as customer_id,
  c.name,
  COALESCE(cb.balance, 0) as balance,
  COUNT(ct.id) as carry_over_count,
  SUM(ABS(ct.carry_over_amount)) as total_carried_over
FROM customers c
LEFT JOIN credit_balances cb ON c.id = cb.customer_id
LEFT JOIN carry_over_transactions ct ON c.id = ct.customer_id
GROUP BY c.id, c.name, cb.balance;

-- Refresh materialized view
CREATE OR REPLACE FUNCTION refresh_balance_summary()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY balance_summary;
END;
$$ LANGUAGE plpgsql;
```

## 13. Best Practices

### 13.1 Carry Over Best Practices
1. **Transparent Calculations**: Always show clear breakdown of carry over
2. **Proper Notifications**: Notify customers of all carry over activities
3. **Audit Trail**: Maintain complete audit trail of all transactions
4. **Balance Priority**: Use subscription balance before customer balance
5. **Regular Reconciliation**: Reconcile balances regularly
6. **Edge Case Handling**: Handle all edge cases gracefully

### 13.2 Common Pitfalls
1. **Double Application**: Prevent applying balance twice
2. **Negative Balances**: Monitor and handle negative balances
3. **Currency Mismatch**: Handle multi-currency scenarios
4. **Transaction Isolation**: Use proper transaction isolation
5. **Performance**: Optimize for high volume transactions

---

*Version: 2.0.0*
*Last Updated: 2025-01-09*
*Status: Ready for Implementation*