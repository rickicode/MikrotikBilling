# Payment Links & Invoice System v2.0 - Spesifikasi Lengkap

## 1. Overview

Sistem payment links v2.0 memungkinkan pembayaran invoice tanpa customer registration. Link invoice berisi QR code untuk pembayaran, notifikasi WhatsApp otomatis setelah pembayaran, dan dukungan untuk invoice yang lunas sebelum due date.

## 2. Key Features

### 2.1 Core Features
- **No Customer Registration**: Invoice dapat dibayar tanpa perlu akun customer
- **Permanent Active Link**: Link invoice selalu aktif untuk pembayaran
- **QR Code Support**: Setiap link memiliki QR code untuk kemudahan pembayaran
- **Automatic WhatsApp Notifications**: Notifikasi otomatis setelah pembayaran berhasil
- **Early Payment Support**: Pembayaran sebelum due date dengan automatic carry over
- **Payment URL Service**: Generate URL pembayaran untuk invoice
- **Online/Offline Tracking**: Status pembayaran real-time vs manual confirmation

### 2.2 Payment Flow
- Invoice generated dengan unique URL
- Customer dapat membayar melalui link kapan saja
- QR code otomatis ditampilkan untuk pembayaran mobile
- Sistem mengecek status pembayaran setiap 5 menit
- WhatsApp notification otomatis dikirim setelah pembayaran berhasil

## 3. Architecture

### 3.1 Components
```
src/services/PaymentUrlService.js  # Payment URL generation
src/services/InvoiceService.js     # Invoice management
src/services/PaymentService.js     # Payment processing
src/routes/payments.js             # Payment endpoints
src/routes/payment-gateway.js      # Gateway integration
views/payments/                    # Payment UI pages
public/js/payments.js              # Frontend payment logic
```

### 3.2 Payment URL Structure
```
Payment URL Format:
https://domain.com/pay/{invoice_token}

Invoice Token Structure:
JWT Signed dengan payload:
{
  invoiceId: "INV-2025-001",
  customerId: 12345,
  amount: 150000,
  currency: "IDR",
  createdAt: "2025-01-09T10:00:00Z",
  expiresAt: "2025-01-09T10:00:00Z", // null untuk permanent
  paymentMethods: ["duitku", "manual"]
}
```

### 3.3 Database Schema
```sql
-- Payment URLs/Tokens
CREATE TABLE payment_urls (
    id SERIAL PRIMARY KEY,
    invoice_id INTEGER UNIQUE NOT NULL,
    token VARCHAR(500) NOT NULL,
    qr_code_path VARCHAR(200),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL, -- NULL untuk permanent active
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id)
);

-- Payment Status Tracking
CREATE TABLE payment_status_logs (
    id SERIAL PRIMARY KEY,
    invoice_id INTEGER NOT NULL,
    reference VARCHAR(100),
    payment_method VARCHAR(50),
    status VARCHAR(20), -- pending, processing, success, failed
    check_type VARCHAR(20), -- online, offline, manual
    checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    response_data JSONB,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id)
);

-- Invoice Early Payments
CREATE TABLE invoice_early_payments (
    id SERIAL PRIMARY KEY,
    invoice_id INTEGER NOT NULL,
    payment_amount DECIMAL(10,2) NOT NULL,
    payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    payment_method VARCHAR(50),
    reference VARCHAR(100),
    carried_over_to DECIMAL(10,2),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id)
);
```

## 4. Payment URL Generation

### 4.1 URL Generation Service
```javascript
class PaymentUrlService {
  constructor() {
    this.jwtSecret = process.env.PAYMENT_URL_SECRET;
    this.baseUrl = process.env.BASE_URL;
  }

  async generatePaymentUrl(invoiceId, options = {}) {
    // 1. Get invoice details
    const invoice = await this.getInvoice(invoiceId);

    // 2. Get available payment methods
    const paymentMethods = await this.getPaymentMethods();

    // 3. Generate JWT token
    const token = jwt.sign(
      {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        amount: invoice.total_amount,
        currency: invoice.currency || 'IDR',
        customerName: invoice.customer_name,
        dueDate: invoice.due_date,
        createdAt: new Date(),
        // Set expiry to null for permanent active links
        expiresAt: options.expiresAt || null,
        paymentMethods: paymentMethods.map(p => p.name)
      },
      this.jwtSecret,
      {
        expiresIn: options.expiresAt ?
          Math.floor((new Date(options.expiresAt) - new Date()) / 1000) :
          '365d' // Default 1 year if expiry is set
      }
    );

    // 4. Save to database
    await this.savePaymentUrl({
      invoice_id: invoiceId,
      token: token,
      expires_at: options.expiresAt || null
    });

    // 5. Generate QR code
    const qrCodePath = await this.generateQRCode(
      `${this.baseUrl}/pay/${token}`
    );

    // 6. Update QR code path
    await this.updateQRCodePath(invoiceId, qrCodePath);

    return {
      paymentUrl: `${this.baseUrl}/pay/${token}`,
      qrCode: qrCodePath,
      invoiceNumber: invoice.invoice_number,
      amount: invoice.total_amount,
      dueDate: invoice.due_date,
      paymentMethods: paymentMethods,
      isActive: true
    };
  }

  async validatePaymentToken(token) {
    try {
      // Verify JWT token
      const decoded = jwt.verify(token, this.jwtSecret);

      // Check if URL is still active
      const paymentUrl = await db.query(
        'SELECT * FROM payment_urls WHERE token = ? AND is_active = true',
        [token]
      );

      if (paymentUrl.rows.length === 0) {
        throw new Error('Payment URL is inactive');
      }

      // Check expiry if set
      if (paymentUrl.rows[0].expires_at) {
        const now = new Date();
        const expiry = new Date(paymentUrl.rows[0].expires_at);

        if (now > expiry) {
          throw new Error('Payment URL has expired');
        }
      }

      return {
        ...decoded,
        paymentUrlId: paymentUrl.rows[0].id
      };

    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new Error('Payment token has expired');
      }
      throw error;
    }
  }
}
```

### 4.2 QR Code Generation
```javascript
const QRCode = require('qrcode');
const path = require('path');

class QRCodeService {
  static async generatePaymentQRCode(paymentUrl) {
    try {
      // Generate QR code with custom options
      const qrCodeDataUrl = await QRCode.toDataURL(paymentUrl, {
        width: 256,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        errorCorrectionLevel: 'M'
      });

      // Save QR code to file
      const fileName = `qr-${Date.now()}.png`;
      const filePath = path.join(process.env.QR_CODE_DIR, fileName);

      await QRCode.toFile(filePath, paymentUrl, {
        width: 256,
        margin: 2
      });

      return `/public/qrcodes/${fileName}`;

    } catch (error) {
      console.error('Error generating QR code:', error);
      throw new Error('Failed to generate QR code');
    }
  }
}
```

## 5. Payment Page Implementation

### 5.1 Payment Page UI
```html
<!-- views/payments/payment-page.ejs -->
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pembayaran Invoice <%= invoice.invoiceNumber %></title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <link href="/css/main.css" rel="stylesheet">
</head>
<body>
  <div class="container payment-container">
    <!-- Invoice Information -->
    <div class="card mb-4">
      <div class="card-header bg-primary text-white">
        <h5 class="mb-0">Informasi Invoice</h5>
      </div>
      <div class="card-body">
        <div class="row">
          <div class="col-md-6">
            <p><strong>No. Invoice:</strong> <%= invoice.invoiceNumber %></p>
            <p><strong>Nama:</strong> <%= invoice.customerName %></p>
            <p><strong>Jumlah:</strong> Rp <%= formatCurrency(invoice.amount) %></p>
          </div>
          <div class="col-md-6">
            <p><strong>Tanggal:</strong> <%= formatDate(invoice.createdAt) %></p>
            <p><strong>Jatuh Tempo:</strong> <%= formatDate(invoice.dueDate) %></p>
            <p><strong>Status:</strong>
              <span class="badge bg-<%= invoice.status === 'paid' ? 'success' : 'warning' %>">
                <%= invoice.status === 'paid' ? 'Lunas' : 'Belum Lunas' %>
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- QR Code Section -->
    <div class="card mb-4" id="qrSection">
      <div class="card-header">
        <h5 class="mb-0">Scan QR Code untuk Pembayaran</h5>
      </div>
      <div class="card-body text-center">
        <img src="<%= invoice.qrCode %>" alt="QR Code Pembayaran" class="qr-code-image">
        <p class="mt-2">Scan dengan aplikasi pembayaran atau klik tombol di bawah</p>
      </div>
    </div>

    <!-- Payment Methods -->
    <div class="card" id="paymentMethods">
      <div class="card-header">
        <h5 class="mb-0">Metode Pembayaran</h5>
      </div>
      <div class="card-body">
        <% if (invoice.status === 'paid') { %>
          <div class="alert alert-success">
            <i class="fas fa-check-circle"></i> Invoice ini sudah lunas
          </div>
        <% } else { %>
          <div class="row">
            <% paymentMethods.forEach(method => { %>
              <div class="col-md-4 mb-3">
                <div class="card payment-method-card" data-method="<%= method.name %>">
                  <div class="card-body text-center">
                    <img src="<%= method.logo %>" alt="<%= method.displayName %>" class="payment-logo">
                    <h6 class="mt-2"><%= method.displayName %></h6>
                    <button class="btn btn-primary btn-sm pay-btn" data-method="<%= method.name %>">
                      Bayar dengan <%= method.displayName %>
                    </button>
                  </div>
                </div>
              </div>
            <% }); %>
          </div>
        <% } %>
      </div>
    </div>

    <!-- Payment Status -->
    <div class="card mt-4" id="paymentStatus" style="display: none;">
      <div class="card-header">
        <h5 class="mb-0">Status Pembayaran</h5>
      </div>
      <div class="card-body">
        <div class="d-flex justify-content-center">
          <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">Memeriksa status...</span>
          </div>
        </div>
        <p class="text-center mt-2">Memeriksa status pembayaran...</p>
      </div>
    </div>

    <!-- Success Message -->
    <div class="alert alert-success mt-4" id="successMessage" style="display: none;">
      <h5><i class="fas fa-check-circle"></i> Pembayaran Berhasil!</h5>
      <p>Terima kasih, pembayaran Anda telah kami terima. Notifikasi akan dikirim ke WhatsApp.</p>
    </div>
  </div>

  <script src="/js/payments.js"></script>
  <script>
    // Auto-check payment status every 5 minutes
    const paymentToken = '<%= token %>';
    const invoiceId = '<%= invoice.invoiceId %>';

    // Initialize payment page
    PaymentPage.init(paymentToken, invoiceId);
  </script>
</body>
</html>
```

### 5.2 Frontend Payment Logic
```javascript
// public/js/payments.js
class PaymentPage {
  static init(token, invoiceId) {
    this.token = token;
    this.invoiceId = invoiceId;
    this.statusCheckInterval = null;

    // Bind payment method buttons
    this.bindPaymentMethods();

    // Start auto status checking
    this.startStatusCheck();
  }

  static bindPaymentMethods() {
    document.querySelectorAll('.pay-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const method = e.target.dataset.method;
        await this.processPayment(method);
      });
    });
  }

  static async processPayment(method) {
    try {
      // Show loading
      this.showPaymentStatus('processing');

      // Create payment
      const response = await fetch('/api/payments/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          token: this.token,
          method: method,
          returnUrl: window.location.href
        })
      });

      const result = await response.json();

      if (result.success) {
        // Redirect to payment gateway
        if (result.paymentUrl) {
          window.location.href = result.paymentUrl;
        } else {
          // Show payment instructions
          this.showPaymentInstructions(result);
        }
      } else {
        this.showError(result.error);
      }

    } catch (error) {
      console.error('Payment error:', error);
      this.showError('Terjadi kesalahan saat memproses pembayaran');
    }
  }

  static startStatusCheck() {
    // Check immediately
    this.checkPaymentStatus();

    // Then check every 5 minutes (300000 ms)
    this.statusCheckInterval = setInterval(() => {
      this.checkPaymentStatus();
    }, 300000);
  }

  static async checkPaymentStatus() {
    try {
      const response = await fetch(`/api/payments/status/${this.invoiceId}`);
      const result = await response.json();

      if (result.paid) {
        // Payment successful
        this.showSuccess();
        clearInterval(this.statusCheckInterval);

        // Show WhatsApp notification
        this.showWhatsAppNotification();
      }

    } catch (error) {
      console.error('Status check error:', error);
    }
  }

  static showSuccess() {
    // Hide payment methods
    document.getElementById('paymentMethods').style.display = 'none';
    document.getElementById('qrSection').style.display = 'none';

    // Show success message
    document.getElementById('successMessage').style.display = 'block';

    // Update invoice status
    document.querySelector('.badge').className = 'badge bg-success';
    document.querySelector('.badge').textContent = 'Lunas';
  }

  static showWhatsAppNotification() {
    // Show WhatsApp notification toast
    const toast = document.createElement('div');
    toast.className = 'toast-notification position-fixed bottom-0 end-0 p-3';
    toast.innerHTML = `
      <div class="toast show" role="alert">
        <div class="toast-header bg-success text-white">
          <i class="fab fa-whatsapp me-2"></i>
          <strong class="me-auto">WhatsApp Terkirim</strong>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast"></button>
        </div>
        <div class="toast-body">
          Notifikasi pembayaran berhasil telah dikirim ke WhatsApp customer
        </div>
      </div>
    `;
    document.body.appendChild(toast);

    // Auto remove after 5 seconds
    setTimeout(() => {
      toast.remove();
    }, 5000);
  }
}
```

## 6. Payment Processing & Status Checking

### 6.1 Payment Processing Service
```javascript
class PaymentProcessingService {
  async createPaymentFromLink(token, method, options = {}) {
    try {
      // 1. Validate token
      const tokenData = await this.paymentUrlService.validatePaymentToken(token);

      // 2. Get invoice
      const invoice = await this.getInvoice(tokenData.invoiceId);

      // 3. Check if already paid
      if (invoice.status === 'paid') {
        throw new Error('Invoice already paid');
      }

      // 4. Get payment plugin
      const plugin = await this.pluginManager.getPlugin(method);

      // 5. Create payment record
      const payment = await this.createPaymentRecord({
        invoice_id: invoice.id,
        method: method,
        amount: invoice.total_amount,
        reference: this.generateReference(),
        status: 'pending',
        created_from: 'payment_link',
        customer_info: {
          name: tokenData.customerName,
          email: invoice.customer_email,
          phone: invoice.customer_phone
        },
        callback_url: `${process.env.BASE_URL}/api/payments/webhook/${method}`,
        return_url: options.returnUrl || `${process.env.BASE_URL}/pay/${token}`
      });

      // 6. Process payment with plugin
      const paymentResult = await plugin.createPayment({
        invoiceNumber: invoice.invoice_number,
        amount: invoice.total_amount,
        currency: invoice.currency || 'IDR',
        customer: tokenData.customerName,
        email: invoice.customer_email,
        phone: invoice.customer_phone,
        description: `Pembayaran Invoice ${invoice.invoice_number}`,
        returnUrl: options.returnUrl,
        callbackUrl: `${process.env.BASE_URL}/api/payments/webhook/${method}`,
        reference: payment.reference
      });

      // 7. Update payment with plugin response
      await this.updatePaymentRecord(payment.id, {
        reference: paymentResult.reference,
        payment_url: paymentResult.paymentUrl,
        qr_code: paymentResult.qrCode,
        expiry_time: paymentResult.expiryTime,
        plugin_data: paymentResult
      });

      return {
        success: true,
        paymentId: payment.id,
        reference: paymentResult.reference,
        paymentUrl: paymentResult.paymentUrl,
        qrCode: paymentResult.qrCode,
        expiryTime: paymentResult.expiryTime,
        instructions: paymentResult.instructions
      };

    } catch (error) {
      console.error('Payment processing error:', error);
      throw error;
    }
  }

  async checkPaymentStatus(invoiceId) {
    try {
      // 1. Get invoice
      const invoice = await this.getInvoice(invoiceId);

      if (invoice.status === 'paid') {
        return { paid: true, invoice: invoice };
      }

      // 2. Get pending payments
      const payments = await this.getPendingPayments(invoiceId);

      let totalPaid = 0;
      let paymentUpdated = false;

      // 3. Check each payment status
      for (const payment of payments) {
        try {
          const plugin = await this.pluginManager.getPlugin(payment.method);
          const status = await plugin.checkStatus(payment.reference);

          if (status.status === 'success') {
            totalPaid += status.paidAmount;

            // Update payment status
            await this.updatePaymentStatus(payment.id, {
              status: 'success',
              paid_amount: status.paidAmount,
              payment_date: status.paymentDate,
              check_type: 'online',
              response_data: status
            });

            paymentUpdated = true;
          }

        } catch (error) {
          console.error(`Error checking payment ${payment.id}:`, error);

          // Log error but continue with other payments
          await this.logStatusCheckError(payment.id, error.message);
        }
      }

      // 4. Check if invoice is fully paid
      if (totalPaid >= invoice.total_amount) {
        await this.markInvoiceAsPaid(invoiceId, totalPaid);

        // Send WhatsApp notification
        await this.sendWhatsAppNotification(invoiceId, totalPaid);

        return { paid: true, invoice: await this.getInvoice(invoiceId) };
      }

      // 5. Check for partial payments (carry over logic)
      if (totalPaid > 0 && totalPaid < invoice.total_amount) {
        await this.processPartialPayment(invoiceId, totalPaid);
      }

      return {
        paid: false,
        totalPaid: totalPaid,
        remaining: invoice.total_amount - totalPaid,
        updated: paymentUpdated
      };

    } catch (error) {
      console.error('Status check error:', error);
      throw error;
    }
  }

  async processPartialPayment(invoiceId, paymentAmount) {
    const transaction = await db.beginTransaction();

    try {
      // 1. Get invoice
      const invoice = await transaction.query(
        'SELECT * FROM invoices WHERE id = ?',
        [invoiceId]
      );

      // 2. Calculate carry over
      const remainingAmount = invoice.total_amount - paymentAmount;

      if (remainingAmount > 0) {
        // Partial payment - add to subscription balance
        await transaction.query(`
          UPDATE subscriptions
          SET balance = balance + $1,
              updated_at = NOW()
          WHERE id = $2
        `, [paymentAmount, invoice.subscription_id]);

        // Log carry over
        await transaction.query(`
          INSERT INTO payment_carry_over
          (invoice_id, amount_paid, amount_carried, subscription_id, created_at)
          VALUES ($1, $2, $3, $4, NOW())
        `, [invoiceId, paymentAmount, paymentAmount, invoice.subscription_id]);
      }

      // 3. Log early payment
      await transaction.query(`
        INSERT INTO invoice_early_payments
        (invoice_id, payment_amount, payment_date, carried_over_to)
        VALUES ($1, $2, NOW(), $3)
      `, [invoiceId, paymentAmount, paymentAmount]);

      await transaction.commit();

      // Send partial payment notification
      await this.sendPartialPaymentNotification(invoiceId, paymentAmount, remainingAmount);

    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async sendWhatsAppNotification(invoiceId, amount) {
    try {
      // 1. Get invoice details
      const invoice = await db.query(`
        SELECT i.*, c.name as customer_name, c.whatsapp
        FROM invoices i
        LEFT JOIN customers c ON i.customer_id = c.id
        WHERE i.id = ?
      `, [invoiceId]);

      if (!invoice.rows[0]) {
        throw new Error('Invoice not found');
      }

      const inv = invoice.rows[0];

      // 2. Prepare notification data
      const notificationData = {
        type: 'payment_success',
        customer: inv.customer_name,
        invoice: {
          number: inv.invoice_number,
          amount: amount,
          paidDate: new Date()
        },
        subscription: {
          type: inv.subscription_type,
          period: inv.subscription_period
        }
      };

      // 3. Send via WhatsApp service
      await this.whatsappService.sendNotification(
        inv.whatsapp,
        'payment_success',
        notificationData
      );

      console.log(`WhatsApp notification sent for invoice ${inv.invoice_number}`);

    } catch (error) {
      console.error('Error sending WhatsApp notification:', error);
      // Don't throw - payment is still successful even if notification fails
    }
  }
}
```

## 7. API Endpoints

### 7.1 Payment URL Endpoints
```javascript
// Generate payment URL for invoice
POST /api/payments/generate-url
{
  invoiceId: 12345,
  options: {
    expiresAt: "2025-12-31T23:59:59Z" // Optional, null for permanent
  }
}

// Validate payment token
GET /api/payments/validate-token/{token}

// Get payment page details
GET /api/payments/page/{token}
```

### 7.2 Payment Processing Endpoints
```javascript
// Create payment from link
POST /api/payments/create
{
  token: "jwt-token",
  method: "duitku",
  returnUrl: "https://example.com/return"
}

// Check payment status
GET /api/payments/status/{invoiceId}

// Manual payment confirmation
POST /api/payments/confirm
{
  invoiceId: 12345,
  paymentId: 67890,
  amount: 150000,
  method: "manual",
  notes: "Pembayaran tunai di kasir"
}
```

### 7.3 Webhook Endpoints
```javascript
// Handle payment gateway webhook
POST /api/payments/webhook/{method}

// Handle return from payment gateway
GET /api/payments/return/{method}

// Check payment status manually
POST /api/payments/check-status
{
  invoiceId: 12345,
  paymentId: 67890
}
```

## 8. Security Considerations

### 8.1 Token Security
- JWT dengan secret key yang aman
- Token expiry configurable (default 1 tahun)
- Token blacklist untuk revoked tokens
- Secure storage di database dengan encryption

### 8.2 Payment Security
- Request signing untuk webhook validation
- Idempotency key untuk prevent duplicate payments
- Amount validation untuk prevent tampering
- HTTPS enforcement untuk semua payment URLs

### 8.3 Rate Limiting
- Per IP rate limiting untuk payment attempts
- Per invoice rate limiting untuk status checks
- Bot detection dan CAPTCHA jika needed
- Monitoring untuk suspicious activities

## 9. Error Handling

### 9.1 Common Error Scenarios
```javascript
// Invalid/expired token
{
  success: false,
  error: 'PAYMENT_URL_EXPIRED',
  message: 'Link pembayaran telah kadaluarsa'
}

// Already paid invoice
{
  success: false,
  error: 'INVOICE_ALREADY_PAID',
  message: 'Invoice ini sudah lunas'
}

// Payment method unavailable
{
  success: false,
  error: 'PAYMENT_METHOD_UNAVAILABLE',
  message: 'Metode pembayaran tidak tersedia'
}

// Payment processing error
{
  success: false,
  error: 'PAYMENT_PROCESSING_ERROR',
  message: 'Terjadi kesalahan saat memproses pembayaran',
  retryable: true
}
```

## 10. Testing Strategy

### 10.1 Unit Tests
- Token generation dan validation
- QR code generation
- Payment status checking logic
- Carry over calculation

### 10.2 Integration Tests
- Payment gateway integration
- WhatsApp notification flow
- Early payment processing
- Webhook handling

### 10.3 E2E Tests
- Complete payment flow
- QR code scanning simulation
- Status polling behavior
- Notification delivery

## 11. Monitoring & Analytics

### 11.1 Key Metrics
- Payment URL conversion rate
- Payment method distribution
- Average payment completion time
- QR code usage statistics
- Early payment percentage

### 11.2 Alerts
- Failed payment attempts above threshold
- Payment gateway downtime
- WhatsApp notification failures
- Unusual payment patterns

## 12. Future Enhancements

### 12.1 Planned Features
- Custom payment page branding
- Multiple invoice payments in one link
- Subscription payment links
- Payment reminders automation
- Advanced analytics dashboard

### 12.2 Integration Points
- Additional payment gateways
- SMS notification fallback
- Email notifications
- Accounting system integration

---

*Version: 2.0.0*
*Last Updated: 2025-01-09*
*Status: Ready for Implementation*