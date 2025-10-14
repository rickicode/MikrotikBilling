# Subscription Management v2.0 - dengan Carry Over Logic

## 1. Overview

Sistem subscription management v2.0 mengelola langganan pelanggan untuk PPPoE dan hotspot berlangganan dengan fitur carry over logic untuk pembayaran parsial. Sistem tidak memiliki grace period; invoice URL selalu aktif untuk pembayaran.

## 2. Key Features

### 2.1 Core Features
- **Subscription Types**: PPPoE dan Hotspot berlangganan
- **Carry Over Logic**: Pembayaran parsial ditanggung ke periode berikutnya
- **No Grace Period**: Invoice tetap aktif setelah expiry
- **Auto-Invoicing**: Generate invoice otomatis setiap periode
- **Package Management**: Paket berlangganan mingguan/bulanan
- **Proration**: Pembayaran parsial dengan prorata calculation

### 2.2 Business Logic
- Invoice dibuat 7 hari sebelum expiry
- Pembayaran parsial akan ditambah ke saldo
- Sisa saldo digunakan untuk periode berikutnya
- Invoice URL selalu dapat diakses
- Tidak ada auto-renewal tanpa pembayaran

## 3. Architecture

### 3.1 Components
```
src/routes/subscriptions.js        # Subscription management routes
src/services/SubscriptionEngine.js # Core subscription logic
src/services/InvoiceGenerator.js   # Invoice generation
src/services/CarryOverCalculator.js # Carry over calculation
src/services/Scheduler.js         # Background tasks
src/lib/SubscriptionHelper.js     # Utility functions
views/subscriptions/               # Subscription management UI
```

### 3.2 Subscription Flow
```
[Create Customer] → [Choose Package] → [Create Subscription] → [Generate Invoice]
       ↓                      ↓                    ↓                    ↓
[Assign PPPoE User] → [Set Expiry Date] → [Send WhatsApp] → [Monitor Payment]
                                                          ↓
                                             [Payment Received] → [Update Balance]
                                                          ↓
                                             [Check Full/Payment] → [Apply or Carry Over]
```

## 4. Database Schema

### 4.1 Tables
```sql
-- Subscription packages
CREATE TABLE subscription_packages (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL, -- 'pppoe' or 'hotspot'
    profile_id INTEGER REFERENCES mikrotik_profiles(id),
    price DECIMAL(10,2) NOT NULL,
    cost_price DECIMAL(10,2) NOT NULL,
    billing_cycle VARCHAR(20) NOT NULL, -- 'weekly', 'monthly'
    duration_days INTEGER NOT NULL,
    data_cap BIGINT, -- in bytes
    speed_limit_upload INTEGER,
    speed_limit_download INTEGER,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Customer subscriptions
CREATE TABLE subscriptions (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    package_id INTEGER NOT NULL REFERENCES subscription_packages(id),
    pppoe_username VARCHAR(100) UNIQUE,
    pppoe_password VARCHAR(100),
    status VARCHAR(20) DEFAULT 'active', -- active, suspended, cancelled
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    last_invoice_date DATE,
    balance DECIMAL(10,2) DEFAULT 0,
    carried_over DECIMAL(10,2) DEFAULT 0,
    auto_renew BOOLEAN DEFAULT false,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Invoices
CREATE TABLE invoices (
    id SERIAL PRIMARY KEY,
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    subscription_id INTEGER NOT NULL REFERENCES subscriptions(id),
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    package_id INTEGER NOT NULL REFERENCES subscription_packages(id),
    amount DECIMAL(10,2) NOT NULL,
    amount_paid DECIMAL(10,2) DEFAULT 0,
    balance_carried_over DECIMAL(10,2) DEFAULT 0,
    due_date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'pending', -- pending, paid, partially_paid, cancelled
    payment_url VARCHAR(500),
    whatsapp_sent BOOLEAN DEFAULT false,
    whatsapp_sent_at TIMESTAMP,
    paid_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Invoice payments
CREATE TABLE invoice_payments (
    id SERIAL PRIMARY KEY,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id),
    payment_reference VARCHAR(100) UNIQUE,
    amount DECIMAL(10,2) NOT NULL,
    payment_method VARCHAR(50),
    payment_date TIMESTAMP,
    status VARCHAR(20) DEFAULT 'pending',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Subscription usage tracking
CREATE TABLE subscription_usage (
    id SERIAL PRIMARY KEY,
    subscription_id INTEGER NOT NULL REFERENCES subscriptions(id),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    bytes_used BIGINT DEFAULT 0,
    bytes_download BIGINT DEFAULT 0,
    bytes_upload BIGINT DEFAULT 0,
    uptime_seconds INTEGER DEFAULT 0,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 5. Subscription Management

### 5.1 Create Subscription
```javascript
async function createSubscription(customerId, packageId, options = {}) {
  const transaction = await db.beginTransaction();

  try {
    // 1. Get package details
    const pkg = await transaction.query(
      'SELECT * FROM subscription_packages WHERE id = $1',
      [packageId]
    );

    if (!pkg.rows[0]) {
      throw new Error('Package not found');
    }

    const packageData = pkg.rows[0];

    // 2. Calculate dates
    const startDate = options.startDate || new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + packageData.duration_days);

    // 3. Generate PPPoE credentials if needed
    let pppoeUsername = null;
    let pppoePassword = null;

    if (packageData.type === 'pppoe') {
      pppoeUsername = generatePPPoEUsername(customerId);
      pppoePassword = generateSecurePassword();

      // Create in Mikrotik
      await mikrotik.createPPPoEUser({
        name: pppoeUsername,
        password: pppoePassword,
        profile: packageData.profile_name,
        comment: buildComment({
          system: 'PPPOE_SYSTEM',
          customer_id: customerId,
          package_id: packageId,
          subscription_id: 'pending',
          created_date: new Date().toISOString().split('T')[0]
        })
      });
    }

    // 4. Create subscription
    const subscription = await transaction.query(`
      INSERT INTO subscriptions
      (customer_id, package_id, pppoe_username, pppoe_password,
       start_date, end_date, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'active')
      RETURNING *
    `, [
      customerId,
      packageId,
      pppoeUsername,
      pppoePassword,
      startDate,
      endDate
    ]);

    const newSubscription = subscription.rows[0];

    // 5. Update Mikrotik comment with subscription ID
    if (pppoeUsername) {
      await mikrotik.updateUserComment(pppoeUsername, {
        system: 'PPPOE_SYSTEM',
        customer_id: customerId,
        package_id: packageId,
        subscription_id: newSubscription.id,
        created_date: new Date().toISOString().split('T')[0]
      });
    }

    // 6. Generate first invoice
    const invoice = await generateInvoice(newSubscription, {
      dueDate: new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000), // 7 days before expiry
      carryOver: 0
    });

    await transaction.commit();

    // 7. Send WhatsApp notification
    await whatsappService.sendMessage(customer.whatsapp, {
      template: 'subscription_created',
      data: {
        customer_name: customer.name,
        package_name: packageData.name,
        start_date: formatDate(startDate),
        end_date: formatDate(endDate),
        pppoe_username: pppoeUsername,
        pppoe_password: pppoePassword,
        payment_url: invoice.payment_url
      }
    });

    return {
      success: true,
      subscription: newSubscription,
      invoice: invoice
    };

  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
```

### 5.2 Renewal Process
```javascript
async function processSubscriptionRenewal(subscriptionId) {
  const transaction = await db.beginTransaction();

  try {
    // 1. Get subscription details
    const subscription = await transaction.query(`
      SELECT s.*, c.name as customer_name, c.whatsapp, p.name as package_name,
             p.duration_days, p.price, p.profile_id, p.profile_name
      FROM subscriptions s
      JOIN customers c ON s.customer_id = c.id
      JOIN subscription_packages p ON s.package_id = p.id
      WHERE s.id = $1
    `, [subscriptionId]);

    if (!subscription.rows[0]) {
      throw new Error('Subscription not found');
    }

    const sub = subscription.rows[0];

    // 2. Calculate carry over amount
    const carryOver = Math.max(0, sub.balance);

    // 3. Extend subscription if balance >= package price
    let newEndDate = new Date(sub.end_date);
    let invoiceGenerated = false;

    if (carryOver >= sub.price) {
      // Full renewal with balance
      const renewalDays = Math.floor(carryOver / sub.price * sub.duration_days);
      newEndDate.setDate(newEndDate.getDate() + renewalDays);

      await transaction.query(`
        UPDATE subscriptions
        SET end_date = $1,
            balance = balance - $2,
            carried_over = 0,
            updated_at = NOW()
        WHERE id = $3
      `, [newEndDate, sub.price, subscriptionId]);

      // Update Mikrotik expiry
      if (sub.pppoe_username) {
        await mikrotik.updatePPPoEUser(sub.pppoe_username, {
          profile: sub.profile_name
        });
      }

    } else {
      // Partial payment or no payment
      const invoice = await generateInvoice(sub, {
        dueDate: new Date(),
        carryOver: carryOver
      });

      invoiceGenerated = true;

      // Keep subscription active but note the debt
      await transaction.query(`
        UPDATE subscriptions
        SET balance = balance - $1,
            carried_over = $1,
            updated_at = NOW()
        WHERE id = $2
      `, [carryOver, subscriptionId]);
    }

    await transaction.commit();

    // 4. Send WhatsApp notification
    if (invoiceGenerated) {
      await whatsappService.sendMessage(sub.whatsapp, {
        template: 'renewal_invoice',
        data: {
          customer_name: sub.customer_name,
          package_name: sub.package_name,
          end_date: formatDate(sub.end_date),
          amount: sub.price,
          carried_over: formatCurrency(carryOver),
          payment_url: invoice.payment_url
        }
      });
    } else {
      await whatsappService.sendMessage(sub.whatsapp, {
        template: 'subscription_renewed',
        data: {
          customer_name: sub.customer_name,
          package_name: sub.package_name,
          new_end_date: formatDate(newEndDate),
          days_added: Math.floor((newEndDate - sub.end_date) / (24 * 60 * 60 * 1000))
        }
      });
    }

    return {
      success: true,
      renewedUntil: newEndDate,
      carryOverApplied: carryOver
    };

  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
```

## 6. Invoice Management

### 6.1 Invoice Generation
```javascript
async function generateInvoice(subscription, options = {}) {
  const { dueDate, carryOver = 0 } = options;

  // Generate invoice number
  const invoiceNumber = await generateInvoiceNumber();

  // Calculate amount due
  const amountDue = Math.max(0, subscription.price - carryOver);

  // Create invoice record
  const invoice = await db.query(`
    INSERT INTO invoices
    (invoice_number, subscription_id, customer_id, package_id,
     amount, balance_carried_over, due_date, status, payment_url)
    VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8)
    RETURNING *
  `, [
    invoiceNumber,
    subscription.id,
    subscription.customer_id,
    subscription.package_id,
    subscription.price,
    carryOver,
    dueDate,
    `${process.env.BASE_URL}/pay/${invoiceNumber}`
  ]);

  return invoice.rows[0];
}

async function generateInvoiceNumber() {
  const prefix = 'INV';
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  const result = await db.query(
    `SELECT COUNT(*) as count
     FROM invoices
     WHERE invoice_number LIKE '${prefix}${date}%'`
  );

  const sequence = (result.rows[0].count || 0) + 1;
  return `${prefix}${date}${sequence.toString().padStart(4, '0')}`;
}
```

### 6.2 Payment Processing with Carry Over
```javascript
async function processPayment(invoiceId, paymentData) {
  const transaction = await db.beginTransaction();

  try {
    // 1. Get invoice details
    const invoice = await transaction.query(`
      SELECT i.*, s.balance as subscription_balance, s.end_date,
             p.duration_days, p.price as package_price
      FROM invoices i
      JOIN subscriptions s ON i.subscription_id = s.id
      JOIN subscription_packages p ON s.package_id = p.id
      WHERE i.id = $1
    `, [invoiceId]);

    if (!invoice.rows[0]) {
      throw new Error('Invoice not found');
    }

    const inv = invoice.rows[0];
    const paymentAmount = paymentData.amount;

    // 2. Record payment
    const payment = await transaction.query(`
      INSERT INTO invoice_payments
      (invoice_id, payment_reference, amount, payment_method,
       payment_date, status)
      VALUES ($1, $2, $3, $4, NOW(), 'confirmed')
      RETURNING *
    `, [
      invoiceId,
      paymentData.reference,
      paymentAmount,
      paymentData.method
    ]);

    // 3. Update invoice
    const totalPaid = inv.amount_paid + paymentAmount;
    const remainingAmount = inv.amount - totalPaid;

    await transaction.query(`
      UPDATE invoices
      SET amount_paid = $1,
          status = $2,
          paid_at = CASE WHEN $2 = 'paid' THEN NOW() ELSE paid_at END,
          updated_at = NOW()
      WHERE id = $3
    `, [
      totalPaid,
      remainingAmount <= 0 ? 'paid' : 'partially_paid',
      invoiceId
    ]);

    // 4. Handle carry over logic
    if (remainingAmount > 0) {
      // Partial payment - add to subscription balance
      await transaction.query(`
        UPDATE subscriptions
        SET balance = balance + $1,
            updated_at = NOW()
        WHERE id = $2
      `, [paymentAmount, inv.subscription_id]);

    } else if (remainingAmount < 0) {
      // Overpayment - add excess to balance
      const excess = Math.abs(remainingAmount);
      await transaction.query(`
        UPDATE subscriptions
        SET balance = balance + $1,
            updated_at = NOW()
        WHERE id = $2
      `, [excess, inv.subscription_id]);

      // Extend subscription
      const daysToAdd = Math.floor(excess / inv.package_price * inv.duration_days);
      const newEndDate = new Date(inv.end_date);
      newEndDate.setDate(newEndDate.getDate() + daysToAdd);

      await transaction.query(`
        UPDATE subscriptions
        SET end_date = $1,
            updated_at = NOW()
        WHERE id = $2
      `, [newEndDate, inv.subscription_id]);
    }

    await transaction.commit();

    // 5. Update Mikrotik if paid
    if (remainingAmount <= 0) {
      const subscription = await db.query(
        'SELECT * FROM subscriptions WHERE id = $1',
        [inv.subscription_id]
      );

      if (subscription.rows[0].pppoe_username) {
        await mikrotik.enablePPPoEUser(subscription.rows[0].pppoe_username);
      }
    }

    // 6. Send WhatsApp confirmation
    const customer = await db.query(
      'SELECT * FROM customers WHERE id = $1',
      [inv.customer_id]
    );

    await whatsappService.sendMessage(customer.rows[0].whatsapp, {
      template: remainingAmount <= 0 ? 'payment_success' : 'partial_payment',
      data: {
        customer_name: customer.rows[0].name,
        invoice_number: inv.invoice_number,
        amount_paid: formatCurrency(paymentAmount),
        remaining_balance: formatCurrency(Math.max(0, remainingAmount)),
        excess_amount: formatCurrency(Math.max(0, -remainingAmount))
      }
    });

    return {
      success: true,
      payment: payment.rows[0],
      invoiceStatus: remainingAmount <= 0 ? 'paid' : 'partially_paid',
      carryOverAmount: Math.max(0, remainingAmount)
    };

  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
```

## 7. Background Tasks

### 7.1 Subscription Monitoring
```javascript
// Runs daily at 00:00
async function checkSubscriptionExpiry() {
  const today = new Date();
  const warningDays = [7, 3, 1]; // Send warnings on these days

  // Check subscriptions expiring soon
  for (const days of warningDays) {
    const checkDate = new Date(today);
    checkDate.setDate(checkDate.getDate() + days);

    const expiringSoon = await db.query(`
      SELECT s.*, c.name, c.whatsapp, p.name as package_name
      FROM subscriptions s
      JOIN customers c ON s.customer_id = c.id
      JOIN subscription_packages p ON s.package_id = p.id
      WHERE s.end_date = $1 AND s.status = 'active'
      AND s.id NOT IN (
        SELECT subscription_id FROM invoices
        WHERE due_date = $1
      )
    `, [checkDate]);

    for (const sub of expiringSoon.rows) {
      // Generate invoice
      const invoice = await generateInvoice(sub, {
        dueDate: new Date(today),
        carryOver: sub.balance
      });

      // Send WhatsApp notification
      await whatsappService.sendMessage(sub.whatsapp, {
        template: 'expiry_warning',
        data: {
          customer_name: sub.name,
          package_name: sub.package_name,
          days_remaining: days,
          expiry_date: formatDate(sub.end_date),
          amount: formatCurrency(sub.price - sub.balance),
          payment_url: invoice.payment_url
        }
      });
    }
  }

  // Check expired subscriptions
  const expired = await db.query(`
    SELECT s.*, c.whatsapp, p.profile_name
    FROM subscriptions s
    JOIN customers c ON s.customer_id = c.id
    JOIN subscription_packages p ON s.package_id = p.id
    WHERE s.end_date < $2 AND s.status = 'active'
  `, [today, today]);

  for (const sub of expired.rows) {
    // Update status
    await db.query(
      'UPDATE subscriptions SET status = $1 WHERE id = $2',
      ['suspended', sub.id]
    );

    // Disable in Mikrotik
    if (sub.pppoe_username) {
      await mikrotik.disablePPPoEUser(sub.pppoe_username);
    }

    // Generate final invoice (if balance exists)
    if (sub.balance > 0) {
      const invoice = await generateInvoice(sub, {
        dueDate: new Date(),
        carryOver: sub.balance
      });

      // Send notification
      await whatsappService.sendMessage(sub.whatsapp, {
        template: 'subscription_expired',
        data: {
          customer_name: sub.name,
          package_name: sub.package_name,
          expired_date: formatDate(sub.end_date),
          has_balance: true,
          payment_url: invoice.payment_url
        }
      });
    }
  }
}
```

## 8. API Endpoints

### 8.1 Subscription Operations
```javascript
// Create new subscription
POST /api/subscriptions
{
  customer_id: 123,
  package_id: 456,
  start_date: "2025-01-09",
  notes: "Special request"
}

// Get subscription details
GET /api/subscriptions/:id

// Update subscription
PUT /api/subscriptions/:id
{
  package_id: 789,
  auto_renew: true
}

// Cancel subscription
DELETE /api/subscriptions/:id
{
  reason: "Customer request",
  immediate: false
}

// Get customer subscriptions
GET /api/customers/:id/subscriptions
```

### 8.2 Invoice Operations
```javascript
// Get invoice details
GET /api/invoices/:id

// Get customer invoices
GET /api/customers/:id/invoices?status=pending

// Create manual invoice
POST /api/invoices/manual
{
  customer_id: 123,
  package_id: 456,
  amount: 150000,
  due_date: "2025-01-16"
}

// Mark invoice as paid (manual)
POST /api/invoices/:id/mark-paid
{
  payment_method: "cash",
  notes: "Payment received at counter"
}

// Send invoice via WhatsApp
POST /api/invoices/:id/send-whatsapp
```

### 8.3 Payment Processing
```javascript
// Process payment (callback from gateway)
POST /api/payments/process
{
  invoice_number: "INV20250109001",
  payment_reference: "PAY123456",
  amount: 150000,
  payment_method: "duitku",
  status: "success"
}

// Get payment status
GET /api/payments/:reference/status

// Apply carry over
POST /api/subscriptions/:id/apply-carry-over
{
  target_subscription_id: 789
}
```

## 9. Carry Over Logic Implementation

### 9.1 Carry Over Calculator
```javascript
class CarryOverCalculator {
  static calculate(packagePrice, amountPaid, currentBalance = 0) {
    const totalAvailable = amountPaid + currentBalance;
    const fullPackages = Math.floor(totalAvailable / packagePrice);
    const remainder = totalAvailable % packagePrice;

    return {
      fullRenewals: fullPackages,
      carryOverAmount: remainder,
      totalDays: fullPackages * 30, // Assuming 30-day packages
      deficit: Math.max(0, packagePrice - totalAvailable)
    };
  }

  static async applyCarryOver(subscriptionId, carryOverAmount) {
    const transaction = await db.beginTransaction();

    try {
      // Get subscription
      const sub = await transaction.query(
        'SELECT * FROM subscriptions WHERE id = $1',
        [subscriptionId]
      );

      if (carryOverAmount > 0) {
        // Add to balance
        await transaction.query(`
          UPDATE subscriptions
          SET balance = balance + $1,
              carried_over = carried_over + $1,
              updated_at = NOW()
          WHERE id = $2
        `, [carryOverAmount, subscriptionId]);

        // Log carry over
        await transaction.query(`
          INSERT INTO carry_over_log
          (subscription_id, amount, source, created_at)
          VALUES ($1, $2, 'payment_partial', NOW())
        `, [subscriptionId, carryOverAmount]);
      }

      await transaction.commit();
      return true;

    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}
```

## 10. Reporting

### 10.1 Subscription Analytics
```javascript
async function getSubscriptionReport(filters = {}) {
  const { startDate, endDate, packageId, status } = filters;

  const whereClause = [];
  const params = [];
  let paramIndex = 1;

  if (startDate) {
    whereClause.push(`DATE(s.created_at) >= $${paramIndex++}`);
    params.push(startDate);
  }

  if (endDate) {
    whereClause.push(`DATE(s.created_at) <= $${paramIndex++}`);
    params.push(endDate);
  }

  if (packageId) {
    whereClause.push(`s.package_id = $${paramIndex++}`);
    params.push(packageId);
  }

  if (status) {
    whereClause.push(`s.status = $${paramIndex++}`);
    params.push(status);
  }

  const whereSql = whereClause.length > 0 ? `WHERE ${whereClause.join(' AND ')}` : '';

  const report = await db.query(`
    SELECT
      COUNT(*) as total_subscriptions,
      COUNT(CASE WHEN s.status = 'active' THEN 1 END) as active_count,
      COUNT(CASE WHEN s.status = 'suspended' THEN 1 END) as suspended_count,
      COUNT(CASE WHEN s.status = 'cancelled' THEN 1 END) as cancelled_count,
      SUM(s.balance) as total_balance,
      SUM(s.carried_over) as total_carried_over,
      AVG(p.price) as avg_package_price
    FROM subscriptions s
    JOIN subscription_packages p ON s.package_id = p.id
    ${whereSql}
  `, params);

  const monthlyStats = await db.query(`
    SELECT
      DATE_TRUNC('month', s.created_at) as month,
      COUNT(*) as new_subscriptions,
      SUM(p.price) as total_revenue
    FROM subscriptions s
    JOIN subscription_packages p ON s.package_id = p.id
    ${whereSql}
    GROUP BY DATE_TRUNC('month', s.created_at)
    ORDER BY month DESC
  `, params);

  return {
    summary: report.rows[0],
    monthlyBreakdown: monthlyStats.rows
  };
}
```

## 11. Customer Self-Service

### 11.1 Balance Check
```javascript
// GET /api/customer/balance
async function getCustomerBalance(customerId) {
  const result = await db.query(`
    SELECT
      s.id,
      s.pppoe_username,
      s.end_date,
      s.balance,
      s.carried_over,
      p.name as package_name,
      p.price as package_price,
      i.invoice_number,
      i.amount as invoice_amount,
      i.amount_paid,
      i.due_date,
      i.payment_url
    FROM subscriptions s
    JOIN subscription_packages p ON s.package_id = p.id
    LEFT JOIN invoices i ON s.id = i.subscription_id AND i.status = 'pending'
    WHERE s.customer_id = $1 AND s.status = 'active'
    ORDER BY s.end_date DESC
    LIMIT 1
  `, [customerId]);

  if (result.rows.length === 0) {
    return { error: 'No active subscription found' };
  }

  const sub = result.rows[0];

  return {
    subscription: {
      id: sub.id,
      package: sub.package_name,
      username: sub.pppoe_username,
      end_date: sub.end_date,
      balance: sub.balance,
      carried_over: sub.carried_over
    },
    current_invoice: sub.invoice_number ? {
      number: sub.invoice_number,
      amount: sub.invoice_amount,
      paid: sub.amount_paid,
      remaining: sub.invoice_amount - sub.amount_paid,
      due_date: sub.due_date,
      payment_url: sub.payment_url
    } : null
  };
}
```

## 12. Integration Points

### 12.1 Mikrotik Integration
```javascript
// On user authentication check
async function onPPPoELogin(username) {
  const user = await db.query(`
    SELECT s.*, c.name, p.name as package_name
    FROM subscriptions s
    JOIN customers c ON s.customer_id = c.id
    JOIN subscription_packages p ON s.package_id = p.id
    WHERE s.pppoe_username = $1
  `, [username]);

  if (user.rows.length > 0) {
    const sub = user.rows[0];

    // Check if subscription is expired
    if (new Date() > sub.end_date && sub.balance < sub.package_price) {
      return {
        allowed: false,
        reason: 'Subscription expired',
        payment_url: await getLatestPaymentUrl(sub.id)
      };
    }

    // Update last login
    await db.query(
      'UPDATE subscriptions SET last_login = NOW() WHERE id = $1',
      [sub.id]
    );

    return { allowed: true };
  }

  return { allowed: false, reason: 'User not found' };
}
```

---

*Version: 2.0.0*
*Last Updated: 2025-01-09*
*Status: Ready for Implementation*