# Integration Flows v2.0 - Alur Terintegrasi Sistem

## 1. Overview

Dokumen ini mendefinisikan alur end-to-end yang menghubungkan semua modul dalam sistem Mikrotik Billing v2.0. Setiap flow menggambarkan bagaimana data dan interaksi mengalir melalui berbagai komponen sistem.

## 2. Master Flow Architecture

### 2.1 System Flow Diagram
```
┌─────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│   Customer UI   │───▶│   Application     │───▶│  PostgreSQL DB   │
│                 │    │   Server          │    │                  │
└─────────────────┘    └─────────┬────────┘    └──────────────────┘
                               │
                    ┌────────▼────────┐
                    │  Mikrotik Router │
                    │   (RouterOS)     │
                    └──────────────────┘
                               │
                    ┌────────▼────────┐
                    │ WhatsApp Service │
                    │  (Multi-session)  │
                    └──────────────────┘
```

### 2.2 Key Integration Points
1. **Authentication Flow** → Semua request terautentikasi
2. **Payment Flow** → Payment Gateway → Invoice → Carry Over → Subscription
3. **Service Provisioning** → Voucher/PPPoE creation → Mikrotik sync
4. **Notification Flow** → Trigger events → WhatsApp queue → Multi-session delivery
5. **Monitoring Flow** → Metrics collection → Health checks → Alerts

## 3. Payment Flow Integration

### 3.1 Complete Payment Flow
```
┌──────────────────┐
│  Customer opens  │
│  Payment Link    │
└─────────┬────────┘
          │
          ▼
┌──────────────────┐
│ Payment Page UI  │◄──────────────┐
│  (QR Code +      │              │
│   Payment Methods)│              │
└─────────┬────────┘              │
          │                         │
          ▼                         │ Payment
┌──────────────────┐              │ Creation
│  PaymentPlugin   │───┐          │
│  .createPayment │   │          │
└─────────┬────────┘   │          │
          │           │          │
          ▼           │          │
┌──────────────────┐   │          │
│ Payment Gateway  │   │          │
│ (DuitK/Manual)   │   │          │
└─────────┬────────┘   │          │
          │           │          │
          ▼           │          │
┌──────────────────┐   │          │
│   Payment URL    │   │          │
│   Service        │   │          │
└─────────┬────────┘   │          │
          │           │          │
          ▼           │          │
┌──────────────────┐   │          │
│  Invoice Service  │◄─┘          │
│  .createInvoice  │              │
└─────────┬────────┘              │
          │                         │
          ▼                         │
┌──────────────────┐              │
│   Database       │              │
│   (invoices)     │              │
└──────────────────┘              │
                               │
        Callback/Status Check │
                               ▼
┌──────────────────┐    ┌──────────────────┐
│  Payment Status  │    │ Carry Over Logic │
│   Checker        │───▶│ (Partial →       │
│  (5min interval)  │    │  Balance Update) │
└─────────┬────────┘    └──────────────────┘
          │
          ▼
┌──────────────────┐
│ WhatsApp Notify  │
│  (Auto on Success)│
└──────────────────┘
```

### 3.2 Payment Flow Service Integration
```javascript
// src/services/PaymentFlowOrchestrator.js
class PaymentFlowOrchestrator {
  static async processPaymentFromLink(token, paymentMethod) {
    const transaction = await db.beginTransaction();

    try {
      // 1. Validate payment token
      const tokenData = await PaymentUrlService.validatePaymentToken(token);

      // 2. Get/Create invoice
      const invoice = await InvoiceService.getOrCreateInvoice(
        tokenData.invoiceId,
        tokenData
      );

      // 3. Load payment plugin
      const plugin = await PluginManager.getPlugin(paymentMethod);

      // 4. Create payment through plugin
      const payment = await plugin.createPayment({
        invoiceNumber: invoice.invoice_number,
        amount: invoice.total_amount,
        customer: invoice.customer,
        returnUrl: `${process.env.BASE_URL}/pay/${token}`,
        callbackUrl: `${process.env.BASE_URL}/api/payments/webhook/${paymentMethod}`
      });

      // 5. Update payment record
      await PaymentService.updatePaymentRecord(payment.id, {
        reference: payment.reference,
        paymentUrl: payment.paymentUrl,
        status: 'pending'
      });

      // 6. Schedule status checking
      StatusScheduler.scheduleCheck(payment.id);

      await transaction.commit();

      return {
        success: true,
        paymentUrl: payment.paymentUrl,
        reference: payment.reference
      };

    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  static async handlePaymentCallback(method, callbackData) {
    // 1. Verify callback signature
    const plugin = await PluginManager.getPlugin(method);
    const isValid = await plugin.verifyCallback(callbackData);

    if (!isValid) {
      throw new Error('Invalid callback signature');
    }

    // 2. Get payment record
    const payment = await PaymentService.getPaymentByReference(
      callbackData.reference
    );

    // 3. Update payment status
    await PaymentService.updatePaymentStatus(payment.id, {
      status: callbackData.status,
      paidAmount: callbackData.amount,
      paidAt: new Date()
    });

    // 4. Check if partial payment
    const invoice = await InvoiceService.getInvoice(payment.invoice_id);

    if (callbackData.amount < invoice.total_amount) {
      // Process carry over
      await CarryOverService.processPaymentCarryOver(
        payment.invoice_id,
        payment.id,
        callbackData.amount
      );
    } else {
      // Full payment - activate service
      await this.activateService(invoice.subscription_id);
    }

    // 5. Send WhatsApp notification
    await this.sendPaymentNotification(invoice, callbackData);

    return { success: true };
  }
}
```

## 4. Service Provisioning Flow

### 4.1 Voucher Creation Flow
```
┌──────────────────┐
│   Admin UI       │
│  (Create Voucher)│
└─────────┬────────┘
          │
          ▼
┌──────────────────┐
│ VoucherService   │
│ .createBatch     │
└─────────┬────────┘
          │
          ▼
┌──────────────────┐    ┌──────────────────┐
│ Number Generator │    │   Database       │
│ (Unique Codes)   │───▶│   (vouchers)      │
└──────────────────┘    └─────────┬────────┘
                               │
          ▼                  │
┌──────────────────┐          │
│ Transaction      │          │
│ Manager          │          │
│ (All-or-Nothing) │          │
└─────────┬────────┘          │
          │                  │
          ▼                  │
┌──────────────────┐          │
│  Mikrotik API    │──────────┘
│  (Create User)   │
│  + Comment      │
└─────────┬────────┘
          │
          ▼
┌──────────────────┐
│   Database       │
│  (Update Mikrotik│
│     ID)          │
└──────────────────┘
```

### 4.2 Voucher Activation Flow
```
┌──────────────────┐
│   Scheduler      │
│ (Every 30 sec)   │
└─────────┬────────┘
          │
          ▼
┌──────────────────┐
│  Monitor Users   │
│  getUserList()    │
└─────────┬────────┘
          │
          ▼
┌──────────────────┐
│ Filter Voucher   │
│ Profiles (*voucher*)│
└─────────┬────────┘
          │
          ▼
┌──────────────────┐    ┌──────────────────┐
│  Check First     │    │    Database      │
│  Login (uptime>0)│───▶│  (vouchers)      │
└─────────┬────────┘    └─────────┬────────┘
          │                         │
          ▼                         │
┌──────────────────┐               │
│  Activate Voucher │               │
│  (Update Status)  │               │
│  + Start Expiry   │               │
└─────────┬────────┘               │
          │                         │
          ▼                         │
┌──────────────────┐               │
│  Update Mikrotik │               │
│  Comment         │               │
└─────────┬────────┘               │
          │                         │
          ▼                         ▼
┌───────────────────────────────────────┐
│      Usage Tracking & Cleanup         │
└───────────────────────────────────────┘
```

## 5. WhatsApp Multi-Session Integration

### 5.1 WhatsApp Session Management
```
┌──────────────────┐
│   WhatsAppBot    │
│   Service        │
└─────────┬────────┘
          │
          ▼
┌──────────────────┐    ┌──────────────────┐
│ Session Manager  │───▶│  Session Pool    │
│ (Primary +       │    │ (Up to 5 sessions)│
│  Backup Sessions)│    └─────────┬────────┘
└─────────┬────────┘              │
          │                         │
          ▼                         │
┌──────────────────┐              │
│  Priority Queue  │◄─────────────┘
│  (High Priority)  │
└─────────┬────────┘
          │
          ▼
┌──────────────────┐    ┌──────────────────┐
│  Message Router  │───▶│  Available       │
│  (Load Balance)  │    │  Sessions        │
└─────────┬────────┘    └─────────┬────────┘
          │                         │
          ▼                         ▼
┌───────────────────────────────────────┐
│          WhatsApp API                 │
│     (Send Message)                   │
└───────────────────────────────────────┘
```

### 5.2 WhatsApp Integration Service
```javascript
// src/services/WhatsAppIntegrationService.js
class WhatsAppIntegrationService {
  static async sendNotification(customerId, template, data) {
    // 1. Get customer details
    const customer = await CustomerService.getById(customerId);

    // 2. Get template
    const templateData = await TemplateService.getTemplate(template);

    // 3. Process template variables
    const message = this.processTemplate(templateData, {
      customer: customer,
      ...data
    });

    // 4. Get available session
    const session = await SessionManager.getAvailableSession();

    // 5. Send message
    const result = await session.sendMessage(customer.whatsapp, message);

    // 6. Handle rate limiting
    if (result.rateLimited) {
      // Queue message for later
      await QueueService.enqueue({
        type: 'whatsapp',
        priority: 'normal',
        recipient: customer.whatsapp,
        message: message,
        template: template,
        data: data
      });
    }

    // 7. Log notification
    await NotificationLogService.log({
      customerId: customer.id,
      type: 'whatsapp',
      template: template,
      status: result.success ? 'sent' : 'failed',
      sessionId: session.id
    });

    return result;
  }

  static async handleSessionFailure(sessionId, error) {
    // 1. Mark session as failed
    await SessionManager.markSessionFailed(sessionId);

    // 2. Get backup session
    const backupSession = await SessionManager.getBackupSession();

    if (backupSession) {
      // 3. Promote backup to primary
      await SessionManager.promoteSession(backupSession.id);

      // 4. Reconnect
      await backupSession.reconnect();
    }

    // 5. Send alert to admin
    await AlertService.sendAlert({
      type: 'whatsapp_session_failure',
      severity: 'warning',
      message: `WhatsApp session ${sessionId} failed: ${error.message}`,
      metadata: { sessionId, error }
    });
  }
}
```

## 6. Mikrotik Integration Flow

### 6.1 Bidirectional Sync Flow
```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   App Server     │────▶│  Mikrotik Router │────▶│   Real-time UI    │
│                 │     │                  │     │                  │
│ 1. Create User   │     │ 2. Store User    │     │ 3. Display      │
│ 2. Update User   │     │ 3. Update User   │     │    Updates       │
│ 3. Delete User   │     │ 4. Delete User   │     │                  │
│ 4. Query Users   │     │ 5. Return Users  │     │                  │
└──────────────────┘     └──────────────────┘     └──────────────────┘
          ▲                                           ▲
          │                                           │
          └───────────────────────Sync─────────┘
```

### 6.2 Mikrotik Integration Service
```javascript
// src/services/MikrotikIntegrationService.js
class MikrotikIntegrationService {
  static async syncProfiles() {
    // 1. Get all profiles from Mikrotik
    const mikrotikProfiles = await MikrotikAPI.getProfiles();

    // 2. Filter by comment pattern
    const profiles = mikrotikProfiles.filter(p =>
      p.comment && (
        p.comment.includes('VOUCHER_SYSTEM') ||
        p.comment.includes('PPPOE_SYSTEM')
      )
    );

    // 3. Update local database
    for (const profile of profiles) {
      await ProfileService.updateFromMikrotik(profile);
    }

    // 4. Deactivate removed profiles
    await ProfileService.deactivateMissing(profiles);

    return profiles;
  }

  static async createUser(type, data) {
    // Common user creation logic
    const userData = {
      name: data.name,
      password: data.password || data.name,
      profile: data.profile,
      comment: this.buildComment(type, data),
      service: type === 'voucher' ? 'hotspot' : 'pppoe'
    };

    // Create in Mikrotik
    const mikrotikUser = await MikrotikAPI.addUser(userData);

    // Store in database
    const user = await this.storeUser(type, {
      ...data,
      mikrotikId: mikrotikUser['.id'],
      mikrotikComment: userData.comment
    });

    // Schedule monitoring
    MonitorService.trackUser(user.id, type);

    return user;
  }

  static buildComment(type, data) {
    const parts = [
      `${type.toUpperCase()}_SYSTEM`,
      data.customer_id || 'NULL',
      data.subscription_id || 'NULL',
      data.vendor_id || 'NULL',
      new Date().toISOString().split('T')[0],
      data.created_by || 'system'
    ];

    return parts.join('|');
  }

  static async monitorUsers() {
    // Monitor active users and sync status
    const activeUsers = await MikrotikAPI.getActiveUsers();

    for (const activeUser of activeUsers) {
      await this.updateUserStatus(activeUser);
    }

    // Check for first-time logins
    await this.checkFirstLogins(activeUsers);

    // Clean up expired users
    await this.cleanupExpiredUsers();
  }
}
```

## 7. Carry Over Integration Flow

### 7.1 Carry Over Flow with Multiple Components
```
┌──────────────────┐
│  Payment Link    │
│  (Customer pays) │
└─────────┬────────┘
          │
          ▼
┌──────────────────┐    ┌──────────────────┐
│ PaymentChecker   │───▶│  Payment Record  │
│  (5 min interval)│    │   Update         │
└─────────┬────────┘    └─────────┬────────┘
          │                         │
          ▼                         ▼
┌──────────────────┐         ┌──────────────────┐
│ Invoice Status   │         │  Calculate      │
│   Check         │         │  Difference     │
└─────────┬────────┘         └─────────┬────────┘
          │                             │
          ▼                             ▼
┌───────────────────────┐   ┌──────────────────┐
│  Partial Payment?    │   │  Update Balances │
│  Yes ──► No          │   │  (Customer +     │
│   │                  │   │   Subscription)  │
│   ▼                  │   └──────────────────┘
│┌─────────────────┐    │
││Carry Over Logic│───┘
│└─────────┬───────┘
          │
          ▼
┌──────────────────┐
│   WhatsApp       │
│  Notification    │
└──────────────────┘
```

### 7.2 Carry Over Integration Service
```javascript
// src/services/CarryOverIntegrationService.js
class CarryOverIntegrationService {
  static async processPaymentPayment(paymentId) {
    const transaction = await db.beginTransaction();

    try {
      // 1. Get payment details
      const payment = await PaymentService.getPayment(paymentId);
      const invoice = await InvoiceService.getInvoice(payment.invoice_id);

      // 2. Calculate carry over amount
      const carryOverAmount = payment.amount - invoice.total_amount;

      if (carryOverAmount === 0) {
        // Exact payment
        await this.activateService(invoice.subscription_id);
        await transaction.commit();
        return { type: 'exact' };
      }

      // 3. Update customer balance
      const newBalance = await BalanceService.updateBalance(
        invoice.customer_id,
        carryOverAmount,
        'payment_carry_over',
        `Carry over from invoice ${invoice.invoice_number}`,
        {
          invoice_id: invoice.id,
          payment_id: payment.id
        }
      );

      // 4. Update subscription balance
      await SubscriptionService.updateBalance(
        invoice.subscription_id,
        carryOverAmount
      );

      // 5. Create carry over record
      await this.createCarryOverRecord({
        invoiceId: invoice.id,
        paymentId: paymentId,
        amount: carryOverAmount,
        type: carryOverAmount > 0 ? 'overpayment' : 'partial_payment'
      });

      // 6. Log balance adjustment
      await BalanceAuditService.log({
        customerId: invoice.customer_id,
        subscriptionId: invoice.subscription_id,
        type: 'carry_over',
        amount: carryOverAmount,
        reference: `Invoice ${invoice.invoice_number}`,
        timestamp: new Date()
      });

      await transaction.commit();

      // 7. Send notification
      await this.sendCarryOverNotification(
        invoice.customer_id,
        {
          invoice: invoice,
          amount: carryOverAmount,
          newBalance: newBalance
        }
      );

      return {
        type: carryOverAmount > 0 ? 'overpayment' : 'partial_payment',
        amount: Math.abs(carryOverAmount),
        newBalance: newBalance
      };

    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  static async applyBalanceToInvoice(invoiceId) {
    // Check if customer has available balance
    const invoice = await InvoiceService.getInvoice(invoiceId);
    const balances = await BalanceService.getAvailableBalances(
      invoice.customer_id,
      invoice.subscription_id
    );

    const totalAvailable = balances.customer + balances.subscription;

    if (totalAvailable <= 0) {
      return { success: false, reason: 'No available balance' };
    }

    // Apply balance (prioritize subscription balance)
    const amountToApply = Math.min(
      totalAvailable,
      invoice.total_amount - (invoice.paid_amount || 0)
    );

    // Create balance payment record
    const payment = await PaymentService.createBalancePayment({
      invoiceId: invoiceId,
      amount: amountToApply,
      source: balances.subscription >= amountToApply ? 'subscription' : 'customer'
    });

    // Update invoice status
    await InvoiceService.updatePaidAmount(invoiceId, amountToApply);

    // Deduct from balance
    if (balances.subscription >= amountToApply) {
      await SubscriptionService.deductBalance(
        invoice.subscription_id,
        amountToApply
      );
    } else {
      await BalanceService.deductBalance(
        invoice.customer_id,
        amountToApply
      );
    }

    return {
      success: true,
      amountApplied: amountToApply,
      remainingBalance: totalAvailable - amountToApply
    };
  }
}
```

## 8. Authentication & Security Integration

### 8.1 Unified Authentication Flow
```
┌──────────────────┐
│   Login UI       │
└─────────┬────────┘
          │
          ▼
┌──────────────────┐    ┌──────────────────┐
│  Auth Service    │───▶│  JWT Token       │
│  .login()        │    │  Generation      │
└─────────┬────────┘    └─────────┬────────┘
          │                         │
          ▼                         ▼
┌──────────────────┐         ┌──────────────────┐
│  Token Store    │         │  Activity Log     │
│  (Redis/Session)│         │  (Login Event)    │
└─────────┬────────┘         └──────────────────┘
          │
          ▼
┌──────────────────┐
│   Return Token  │
└──────────────────┘
```

### 8.2 Security Integration Service
```javascript
// src/services/SecurityIntegrationService.js
class SecurityIntegrationService {
  static async authenticateUser(username, password, context) {
    // 1. Validate credentials
    const user = await UserAuthService.validateCredentials(username, password);

    if (!user) {
      // Log failed attempt
      await SecurityLogger.logFailedLogin({
        username,
        ip: context.ip,
        userAgent: context.userAgent,
        timestamp: new Date()
      });

      throw new Error('Invalid credentials');
    }

    // 2. Generate JWT token
    const token = jwt.sign({
      sub: user.id,
      username: user.username,
      role: user.role,
      permissions: this.getPermissions(user.role),
      sessionId: uuidv4()
    }, process.env.JWT_SECRET, { expiresIn: '30d' });

    // 3. Update last login
    await UserAuthService.updateLastLogin(user.id);

    // 4. Log successful login
    await ActivityLogger.log({
      userId: user.id,
      action: 'login',
      details: {
        ip: context.ip,
        userAgent: context.userAgent
      },
      timestamp: new Date()
    });

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role
      }
    };
  }

  static async authorizeRequest(token, requiredPermission) {
    try {
      // 1. Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // 2. Check user status
      const user = await UserAuthService.getUserById(decoded.sub);
      if (!user || !user.is_active) {
        throw new Error('User not found or inactive');
      }

      // 3. Check permission
      if (requiredPermission && !decoded.permissions.includes(requiredPermission)) {
        throw new Error('Insufficient permissions');
      }

      // 4. Log activity
      await ActivityLogger.log({
        userId: decoded.sub,
        action: 'api_access',
        details: {
          permission: requiredPermission,
          endpoint: this.getCurrentEndpoint()
        },
        timestamp: new Date()
      });

      return decoded;

    } catch (error) {
      // Log security event
      await SecurityLogger.logSecurityEvent({
        type: 'unauthorized_access',
        details: {
          error: error.message,
          token: token?.substring(0, 20) + '...',
          ip: this.getClientIP()
        },
        severity: 'medium',
        timestamp: new Date()
      });

      throw error;
    }
  }
}
```

## 9. Data Retention & Cleanup Integration

### 9.1 Automated Cleanup Flow
```
┌──────────────────┐
│   Scheduler      │
│  (Daily @ 2 AM)  │
└─────────┬────────┘
          │
          ▼
┌──────────────────┐
│  Retention       │
│  Service        │
│  .runCleanup()   │
└─────────┬────────┘
          │
          ▼
┌───────────────────────────────────────────────┐
│  Clean-up Tasks                         │
│───────────────────────────────────────────────┤
│ 1. Notification Logs (30 days)            │
│ 2. Activity Logs (1 year)                 │
│ 3. Temp Files (7 days)                     │
│ 4. Expired Vouchers (1 year after expiry)  │
│ 5. Session Data (24 hours)                 │
│ 6. Performance Logs (7 days)              │
└───────────────────────────────────────────────┘
          │
          ▼
┌──────────────────┐
│  Cleanup Report  │
│  (Email/WhatsApp)│
└──────────────────┘
```

## 10. Error Handling & Recovery Integration

### 10.1 Centralized Error Handling
```javascript
// src/services/ErrorIntegrationService.js
class ErrorIntegrationService {
  static async handleError(error, context) {
    // 1. Categorize error
    const errorCategory = this.categorizeError(error);

    // 2. Log error
    await this.logError(error, context, errorCategory);

    // 3. Attempt recovery
    const recovery = await this.attemptRecovery(error, context);

    // 4. Send notification if critical
    if (errorCategory.severity === 'critical') {
      await this.sendErrorAlert(error, context);
    }

    return recovery;
  }

  static async attemptRecovery(error, context) {
    // Mikrotik connection error
    if (error instanceof MikrotikConnectionError) {
      return await MikrotikIntegrationService.reconnect();
    }

    // Database connection error
    if (error instanceof DatabaseConnectionError) {
      return await DatabaseService.reconnect();
    }

    // WhatsApp session error
    if (error instanceof WhatsAppSessionError) {
      return await WhatsAppIntegrationService.handleSessionFailure(
        error.sessionId,
        error
      );
    }

    // Payment processing error
    if (error instanceof PaymentProcessingError) {
      return await PaymentService.rollbackTransaction(
        context.transactionId
      );
    }

    return { recovered: false };
  }

  static categorizeError(error) {
    const categories = {
      // Critical errors
      critical: [
        'DatabaseConnectionError',
        'MikrotikConnectionError',
        'PaymentProcessingError',
        'SecurityBreach'
      ],

      // High priority
      high: [
        'WhatsAppSessionError',
        'AuthenticationError',
        'SubscriptionError'
      ],

      // Medium priority
      medium: [
        'ValidationError',
        'RateLimitError',
        'TemporaryServiceError'
      ],

      // Low priority
      low: [
        'UIMissingData',
        'WarningMessage'
      ]
    };

    for (const [severity, types] of Object.entries(categories)) {
      if (types.some(type => error instanceof global[type])) {
        return { severity, type: error.constructor.name };
      }
    }

    return { severity: 'unknown', type: error.constructor.name };
  }
}
```

## 11. Real-time Status Updates

### 11.1 WebSocket Integration
```javascript
// src/services/RealtimeService.js
class RealtimeService {
  constructor(io) {
    this.io = io;
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    // Admin dashboard
    this.io.of('/admin').on('connection', (socket) => {
      socket.join('admin_dashboard');

      // Send initial data
      socket.emit('system_status', await this.getSystemStatus());
      socket.emit('active_users', await this.getActiveUsers());
    });

    // Monitoring dashboard
    this.io.of('/monitoring').on('connection', (socket) => {
      socket.join('monitoring');

      // Send metrics
      socket.emit('metrics', await this.getMetrics());
    });

    // Payment status updates
    this.io.of('/payments').on('connection', (socket) => {
      socket.on('subscribe_invoice', (invoiceId) => {
        socket.join(`invoice_${invoiceId}`);
      });
    });
  }

  async notifyPaymentStatus(invoiceId, status) {
    this.io.to(`invoice_${invoiceId}`).emit('payment_status', {
      invoiceId,
      status,
      timestamp: new Date()
    });

    // Also update admin dashboard
    this.io.to('admin_dashboard').emit('payment_update', {
      invoiceId,
      status,
      timestamp: new Date()
    });
  }

  async notifyUserStatus(userId, type, status) {
    this.io.to('admin_dashboard').emit('user_status', {
      userId,
      type, // 'voucher' or 'pppoe'
      status,
      timestamp: new Date()
    });
  }

  async notifySystemAlert(alert) {
    this.io.to('admin_dashboard').emit('system_alert', {
      ...alert,
      timestamp: new Date()
    });

    // Critical alerts to all admins
    if (alert.severity === 'critical') {
      this.io.emit('critical_alert', alert);
    }
  }
}
```

## 12. API Endpoint Integration Map

### 12.1 Unified API Structure
```
/api/
├── auth/
│   ├── POST /login                 # Authentication
│   ├── POST /logout                # Logout
│   └── POST /refresh               # Token refresh
│
├── admin/
│   ├── GET  /dashboard             # Admin dashboard data
│   ├── GET  /users                 # User management
│   ├── POST /users                 # Create user
│   └── GET  /settings              # System settings
│
├── customers/
│   ├── GET  /                      # List customers
│   ├── POST /                      # Create customer
│   ├── GET  /:id/balance           # Customer balance
│   └── POST /:id/balance           # Update balance
│
├── subscriptions/
│   ├── GET  /                      # List subscriptions
│   ├── POST /                      # Create subscription
│   ├── GET  /:id                  # Subscription details
│   └── POST /:id/renew             # Renew subscription
│
├── vouchers/
│   ├── GET  /                      # List vouchers
│   ├── POST /batch                 # Create batch
│   ├── GET  /:id/usage             # Voucher usage
│   └── GET  /unique-check         # Check code
│
├── pppoe/
│   ├── GET  /users                 # PPPoE users
│   ├── POST /users                 # Create user
│   ├── GET  /profiles              # Profiles
│   └── POST /profiles/sync         # Sync profiles
│
├── payments/
│   ├── POST /create                # Create payment
│   ├── GET  /:reference/status     # Check status
│   ├── POST /webhook/:method       # Payment callback
│   └── GET  /methods              # Available methods
│
├── invoices/
│   ├── GET  /:id                  # Invoice details
│   ├── GET  /:id/pay              # Get payment URL
│   └── GET  /:id/receipt          # Download receipt
│
├── whatsapp/
│   ├── POST /send                 # Send message
│   ├── GET  /status               # Service status
│   ├── POST /sessions/scan        # QR scan
│   └── GET  /templates            # Get templates
│
├── monitoring/
│   ├── GET  /health               # System health
│   ├── GET  /metrics              # System metrics
│   ├── GET  /alerts               # Active alerts
│   └── POST /alerts/rules          # Create alert rule
│
└── backups/
    ├── POST /create               # Create backup
    ├── GET  /                      # List backups
    ├── POST /restore/:id          # Restore backup
    └── GET  /:id/download          # Download backup
```

## 13. Database Transaction Patterns

### 13.1 Transaction Integration
```javascript
// src/services/TransactionService.js
class TransactionService {
  static async executeTransaction(operations, options = {}) {
    const transaction = await db.beginTransaction({
      isolationLevel: options.isolationLevel || 'READ_COMMITTED',
      readOnly: options.readOnly || false
    });

    try {
      const results = [];

      for (const operation of operations) {
        const result = await this.executeOperation(
          transaction,
          operation
        );
        results.push(result);
      }

      // Validate transaction invariants
      if (options.validate) {
        await this.validateTransaction(transaction, options.validate);
      }

      await transaction.commit();

      return {
        success: true,
        results
      };

    } catch (error) {
      await transaction.rollback();

      // Log transaction failure
      await this.logTransactionFailure(error, operations);

      throw error;
    }
  }

  static async executeOperation(transaction, operation) {
    switch (operation.type) {
      case 'query':
        return await transaction.query(operation.sql, operation.params);

      case 'insert':
        return await transaction.query(
          operation.sql,
          operation.params
        );

      case 'update':
        return await transaction.query(
          operation.sql,
          operation.params
        );

      case 'delete':
        return await transaction.query(
          operation.sql,
          operation.params
        );

      case 'custom':
        return await operation.handler(transaction);

      default:
        throw new Error(`Unknown operation type: ${operation.type}`);
    }
  }
}
```

## 14. Integration Testing Matrix

### 14.1 Test Integration Points
| Module               | Integration Point         | Test Requirement                     |
|----------------------|--------------------------|--------------------------------------|
| Authentication       | All API endpoints        | JWT token validation               |
| Payment Gateway     | Invoice → Carry Over     | Payment flow end-to-end             |
| WhatsApp            | All notifications        | Message delivery tracking          |
| Mikrotik            | Voucher/PPPoE provisioning | User creation/sync accuracy        |
| Customer Balance    | Payment → Subscription | Balance calculation consistency     |
| Data Retention      | All log tables            | Automated cleanup verification       |
| Backup & Recovery  | Database → Files          | Backup integrity verification        |
| Monitoring          | All system components   | Health check reliability          |
| Real-time Updates  | Dashboard ↔ Services     | WebSocket message delivery        |

## 15. Implementation Checklist

### 15.1 Integration Requirements
- [ ] Payment gateway plugin loaded with error handling
- [ ] Mikrotik connection pooling and retry logic
- [ ] WhatsApp session failover mechanism
- [ ] Carry over calculation validation
- [ ] Real-time status updates via WebSocket
- [ ] Unified error handling and recovery
- [ ] Database transaction consistency
- [ ] API rate limiting per endpoint type
- [ ] Audit trail for all operations
- [ ] Automated data retention cleanup
- [ ] Backup/restore verification
- [ ] Security event logging
- [ ] Performance metrics collection

## 16. Conclusion

Dengan integrasi yang terdefinisi ini, semua modul dalam sistem Mikrotik Billing v2.0 akan bekerja sebagai satu kesatuan yang kohesif. Alur data dan interaksi telah dirancang untuk memastikan:

1. **Konsistensi Data**: Data mengalir dengan validasi dan sinkronisasi yang tepat
2. **Error Recovery**: Sistem dapat pulih dari kegagalan otomatis
3. **Real-time Updates**: Status update dikirim secara real-time ke UI
4. **Scalability**: Arsitektur mendukung scaling horizontal
5. **Maintainability**: Setiap komponen dapat diperbarui secara independen
6. **Security**: Keamanan diterapkan di semua layer
7. **Audit Trail**: Semua aktivitas tercatat untuk tracing

---

*Version: 2.0.0*
*Last Updated: 2025-01-09*
*Status: Integration Complete*