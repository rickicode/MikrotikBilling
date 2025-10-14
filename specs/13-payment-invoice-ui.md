# Payment & Invoice UI v2.0 - Spesifikasi Lengkap

## 1. Overview

UI untuk payment dan invoice v2.0 dirancang untuk kemudahan pembayaran dengan payment links, QR code support, dan notifikasi WhatsApp otomatis. Sistem mendukung pembayaran tanpa registrasi customer dengan permanent active links.

## 2. Key Features

### 2.1 Core UI Features
- **Payment Page**: Dedicated payment page dengan QR code
- **Invoice Management**: UI untuk create, view, dan manage invoices
- **Payment Status Tracking**: Real-time status updates setiap 5 menit
- **QR Code Integration**: QR code otomatis untuk setiap payment link
- **Mobile Responsive**: Optimized untuk mobile payments
- **WhatsApp Notifications**: Status pembayaran via WhatsApp
- **Multiple Payment Methods**: Dukungan berbagai payment gateway
- **Invoice History**: Complete payment history per invoice

### 2.2 UI/UX Principles
- **Simplicity**: Clean dan minimalis design
- **Mobile-First**: Optimized untuk mobile devices
- **Progressive Disclosure**: Informasi ditampilkan bertahap
- **Clear CTAs**: Tombol aksi yang jelas
- **Status Indicators**: Visual indicators untuk semua status
- **Error Handling**: Friendly error messages
- **Loading States**: Clear loading indicators

## 3. Payment Page UI

### 3.1 Payment Page Structure
```html
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pembayaran Invoice <%- invoice.invoiceNumber %></title>

  <!-- CSS -->
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
  <link href="/css/payment.css" rel="stylesheet">

  <!-- Meta Tags for SEO -->
  <meta name="description" content="Pembayaran Invoice <%- invoice.invoiceNumber %>">

  <!-- Open Graph Tags -->
  <meta property="og:title" content="Pembayaran Invoice <%- invoice.invoiceNumber %>">
  <meta property="og:description" content="Lakukan pembayaran dengan mudah dan aman">
  <meta property="og:image" content="<%- baseUrl %><%- invoice.qrCode %>">
</head>
<body>
  <!-- Header -->
  <header class="payment-header">
    <div class="container">
      <div class="row align-items-center">
        <div class="col">
          <img src="/images/logo.png" alt="Company Logo" class="logo">
        </div>
        <div class="col-auto">
          <span class="badge bg-success">
            <i class="fas fa-lock"></i> Pembayaran Aman
          </span>
        </div>
      </div>
    </div>
  </header>

  <!-- Main Content -->
  <main class="payment-main">
    <div class="container">
      <!-- Payment Status Alert -->
      <div id="paymentAlert" class="alert alert-info d-none" role="alert">
        <div class="d-flex align-items-center">
          <div class="spinner-border spinner-border-sm me-2" role="status"></div>
          <span>Memeriksa status pembayaran...</span>
        </div>
      </div>

      <!-- Invoice Information -->
      <section class="invoice-section">
        <div class="card">
          <div class="card-header bg-primary text-white">
            <h5 class="mb-0">
              <i class="fas fa-file-invoice me-2"></i>
              Informasi Invoice
            </h5>
          </div>
          <div class="card-body">
            <div class="row">
              <div class="col-md-6">
                <div class="invoice-detail">
                  <label class="text-muted">No. Invoice</label>
                  <p class="fw-bold"><%- invoice.invoiceNumber %></p>
                </div>
                <div class="invoice-detail">
                  <label class="text-muted">Nama Customer</label>
                  <p class="fw-bold"><%- invoice.customerName %></p>
                </div>
                <div class="invoice-detail">
                  <label class="text-muted">Tanggal</label>
                  <p><%- formatDate(invoice.createdAt) %></p>
                </div>
              </div>
              <div class="col-md-6">
                <div class="invoice-detail">
                  <label class="text-muted">Jumlah</label>
                  <p class="fw-bold fs-5 text-primary">Rp <%- formatCurrency(invoice.amount) %></p>
                </div>
                <div class="invoice-detail">
                  <label class="text-muted">Jatuh Tempo</label>
                  <p><%- formatDate(invoice.dueDate) %></p>
                </div>
                <div class="invoice-detail">
                  <label class="text-muted">Status</label>
                  <p>
                    <span class="badge bg-<%- invoice.status === 'paid' ? 'success' : 'warning' %> fs-6">
                      <i class="fas fa-<%- invoice.status === 'paid' ? 'check-circle' : 'clock' %> me-1"></i>
                      <%- invoice.status === 'paid' ? 'LUNAS' : 'BELUM LUNAS' %>
                    </span>
                  </p>
                </div>
              </div>
            </div>

            <!-- Invoice Items -->
            <% if (invoice.items && invoice.items.length > 0) { %>
            <div class="mt-3">
              <h6>Detail Pembayaran</h6>
              <div class="table-responsive">
                <table class="table table-sm">
                  <thead>
                    <tr>
                      <th>Deskripsi</th>
                      <th class="text-end">Jumlah</th>
                    </tr>
                  </thead>
                  <tbody>
                    <% invoice.items.forEach(item => { %>
                    <tr>
                      <td><%- item.description %></td>
                      <td class="text-end">Rp <%- formatCurrency(item.amount) %></td>
                    </tr>
                    <% }); %>
                    <tr class="table-primary">
                      <th>Total</th>
                      <th class="text-end">Rp <%- formatCurrency(invoice.amount) %></th>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <% } %>
          </div>
        </div>
      </section>

      <!-- QR Code Section -->
      <section class="qr-section" id="qrSection">
        <div class="card">
          <div class="card-header">
            <h5 class="mb-0">
              <i class="fas fa-qrcode me-2"></i>
              Scan QR Code untuk Pembayaran
            </h5>
          </div>
          <div class="card-body text-center">
            <div class="qr-container">
              <img src="<%- invoice.qrCode %>" alt="QR Code Pembayaran" class="qr-code">
              <div class="qr-overlay" id="qrOverlay">
                <i class="fas fa-check-circle"></i>
                <p>Pembayaran Berhasil!</p>
              </div>
            </div>
            <p class="mt-3 text-muted">
              <i class="fas fa-mobile-alt me-2"></i>
              Scan dengan aplikasi pembayaran atau klik tombol di bawah
            </p>

            <!-- Copy Link -->
            <div class="mt-3">
              <div class="input-group">
                <input type="text" class="form-control" value="<%- currentUrl %>" readonly id="paymentLink">
                <button class="btn btn-outline-secondary" type="button" onclick="copyPaymentLink()">
                  <i class="fas fa-copy"></i> Salin
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Payment Methods -->
      <section class="payment-methods-section" id="paymentMethodsSection">
        <div class="card">
          <div class="card-header">
            <h5 class="mb-0">
              <i class="fas fa-credit-card me-2"></i>
              Pilih Metode Pembayaran
            </h5>
          </div>
          <div class="card-body">
            <% if (invoice.status === 'paid') { %>
              <!-- Paid State -->
              <div class="text-center py-5">
                <i class="fas fa-check-circle text-success" style="font-size: 4rem;"></i>
                <h4 class="mt-3">Pembayaran Berhasil!</h4>
                <p class="text-muted">Terima kasih, pembayaran Anda telah kami terima.</p>

                <!-- Download Receipt -->
                <button class="btn btn-success" onclick="downloadReceipt()">
                  <i class="fas fa-download me-2"></i>
                  Download Bukti Pembayaran
                </button>
              </div>
            <% } else { %>
              <!-- Unpaid State -->
              <div class="row g-3" id="paymentMethodsGrid">
                <% paymentMethods.forEach(method => { %>
                <div class="col-md-4 col-sm-6">
                  <div class="payment-method-card" data-method="<%- method.name %>" onclick="selectPaymentMethod('<%- method.name %>')">
                    <div class="card h-100">
                      <div class="card-body text-center">
                        <img src="<%- method.logo %>" alt="<%- method.displayName %>" class="payment-logo">
                        <h6 class="mt-3 mb-1"><%- method.displayName %></h6>
                        <% if (method.fees) { %>
                        <small class="text-muted">
                          Biaya: <%- method.fees.type === 'percentage' ? method.fees.value + '%' : formatCurrency(method.fees.value) %>
                        </small>
                        <% } %>
                      </div>
                      <div class="card-footer bg-transparent border-0">
                        <button class="btn btn-primary w-100" onclick="processPayment('<%- method.name %>')">
                          Bayar dengan <%- method.displayName %>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                <% }); %>
              </div>

              <!-- Manual Payment Option -->
              <div class="mt-4">
                <div class="card border-success">
                  <div class="card-body">
                    <div class="row align-items-center">
                      <div class="col">
                        <h6 class="mb-1">Pembayaran Manual</h6>
                        <p class="mb-0 text-muted">Transfer bank atau tunai di kasir</p>
                      </div>
                      <div class="col-auto">
                        <button class="btn btn-outline-success" onclick="showManualPaymentInstructions()">
                          <i class="fas fa-info-circle me-2"></i>
                          Informasi
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            <% } %>
          </div>
        </div>
      </section>

      <!-- Payment Processing Modal -->
      <div class="modal fade" id="paymentModal" data-bs-backdrop="static" data-bs-keyboard="false">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Memproses Pembayaran</h5>
            </div>
            <div class="modal-body text-center py-4">
              <div class="spinner-border text-primary mb-3" role="status"></div>
              <p class="mb-0">Mengarahkan Anda ke halaman pembayaran...</p>
              <small class="text-muted">Mohon tunggu, jangan tutup halaman ini</small>
            </div>
          </div>
        </div>
      </div>

      <!-- Manual Payment Instructions Modal -->
      <div class="modal fade" id="manualPaymentModal">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Informasi Pembayaran Manual</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div class="mb-4">
                <h6>Transfer Bank</h6>
                <div class="bank-info">
                  <p class="mb-1"><strong>Bank:</strong> BCA</p>
                  <p class="mb-1"><strong>No. Rekening:</strong> 1234567890</p>
                  <p class="mb-1"><strong>Atas Nama:</strong> PT. Example Indonesia</p>
                  <p class="mb-0"><strong>Jumlah:</strong> Rp <%- formatCurrency(invoice.amount) %></p>
                </div>
              </div>

              <div class="mb-4">
                <h6>Pembayaran di Kasir</h6>
                <p>Anda dapat melakukan pembayaran langsung di kasir kami pada jam operasional:</p>
                <ul>
                  <li>Senin - Jumat: 09:00 - 18:00</li>
                  <li>Sabtu: 09:00 - 15:00</li>
                  <li>Minggu: Tutup</li>
                </ul>
              </div>

              <div class="alert alert-info">
                <i class="fas fa-info-circle me-2"></i>
                Setelah melakukan pembayaran, sistem akan otomatis mendeteksi dan memperbarui status pembayaran Anda.
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Tutup</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </main>

  <!-- Footer -->
  <footer class="payment-footer">
    <div class="container">
      <div class="row">
        <div class="col-md-6">
          <p class="mb-0">&copy; 2025 <%- companyName %>. All rights reserved.</p>
        </div>
        <div class="col-md-6 text-md-end">
          <a href="#" class="text-muted me-3">Bantuan</a>
          <a href="#" class="text-muted">Kebijakan Privasi</a>
        </div>
      </div>
    </div>
  </footer>

  <!-- WhatsApp Notification Toast -->
  <div id="whatsappToast" class="toast-notification position-fixed bottom-0 end-0 p-3" style="display: none;">
    <div class="toast show" role="alert">
      <div class="toast-header bg-success text-white">
        <i class="fab fa-whatsapp me-2"></i>
        <strong class="me-auto">WhatsApp Terkirim</strong>
        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast"></button>
      </div>
      <div class="toast-body">
        Notifikasi pembayaran berhasil telah dikirim ke WhatsApp Anda
      </div>
    </div>
  </div>

  <!-- JavaScript -->
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
  <script src="/js/payment.js"></script>
  <script>
    // Initialize payment page
    PaymentPage.init('<%- token %>', <%- JSON.stringify(invoice) %>);
  </script>
</body>
</html>
```

### 3.2 Payment Page CSS
```css
/* public/css/payment.css */
:root {
  --primary-color: #0d6efd;
  --success-color: #198754;
  --warning-color: #ffc107;
  --danger-color: #dc3545;
  --light-bg: #f8f9fa;
  --border-radius: 0.5rem;
}

body {
  background-color: var(--light-bg);
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

/* Header */
.payment-header {
  background: white;
  border-bottom: 1px solid #dee2e6;
  padding: 1rem 0;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.logo {
  height: 40px;
}

/* Main Content */
.payment-main {
  padding: 2rem 0;
  min-height: calc(100vh - 200px);
}

/* Invoice Section */
.invoice-section {
  margin-bottom: 2rem;
}

.invoice-detail {
  margin-bottom: 1rem;
}

.invoice-detail label {
  font-size: 0.875rem;
  margin-bottom: 0.25rem;
}

.invoice-detail p {
  margin-bottom: 0;
}

/* QR Code Section */
.qr-section {
  margin-bottom: 2rem;
}

.qr-container {
  position: relative;
  display: inline-block;
}

.qr-code {
  width: 256px;
  height: 256px;
  border: 2px solid #dee2e6;
  border-radius: var(--border-radius);
}

.qr-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(255, 255, 255, 0.95);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: var(--border-radius);
  opacity: 0;
  visibility: hidden;
  transition: all 0.3s ease;
}

.qr-overlay.show {
  opacity: 1;
  visibility: visible;
}

.qr-overlay i {
  font-size: 4rem;
  color: var(--success-color);
  margin-bottom: 1rem;
}

/* Payment Methods */
.payment-method-card {
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.payment-method-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 10px 25px rgba(0,0,0,0.1);
}

.payment-method-card.selected {
  border: 2px solid var(--primary-color);
  box-shadow: 0 0 0 0.2rem rgba(13, 110, 253, 0.25);
}

.payment-logo {
  height: 48px;
  object-fit: contain;
}

/* Loading Animation */
.payment-loading {
  display: none;
}

.payment-loading.show {
  display: block;
}

/* Status Indicators */
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-radius: 50px;
  font-weight: 600;
}

.status-badge.paid {
  background-color: #d1e7dd;
  color: #0f5132;
}

.status-badge.pending {
  background-color: #fff3cd;
  color: #664d03;
}

/* Responsive */
@media (max-width: 768px) {
  .payment-main {
    padding: 1rem 0;
  }

  .qr-code {
    width: 200px;
    height: 200px;
  }

  .payment-methods-section .col-md-4 {
    margin-bottom: 1rem;
  }
}

/* Animations */
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.fade-in {
  animation: fadeIn 0.5s ease;
}

/* Copy Button */
.copy-success {
  background-color: var(--success-color) !important;
  border-color: var(--success-color) !important;
  color: white !important;
}

/* Payment Processing */
.payment-processing {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(255, 255, 255, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.payment-processing.hide {
  display: none;
}

/* Error State */
.error-message {
  background-color: #f8d7da;
  border: 1px solid #f5c6cb;
  color: #721c24;
  padding: 1rem;
  border-radius: var(--border-radius);
  margin-bottom: 1rem;
}

/* Success Animation */
@keyframes checkmark {
  0% {
    stroke-dashoffset: 100;
  }
  100% {
    stroke-dashoffset: 0;
  }
}

.checkmark-circle {
  stroke-dasharray: 100;
  stroke-dashoffset: 100;
  animation: checkmark 0.5s ease forwards;
}
```

### 3.3 Payment Page JavaScript
```javascript
// public/js/payment.js
class PaymentPage {
  static token;
  static invoice;
  static statusCheckInterval;
  static selectedMethod = null;

  static init(token, invoice) {
    this.token = token;
    this.invoice = invoice;

    // Auto-check status every 5 minutes
    this.startStatusCheck();

    // Initialize tooltips
    this.initTooltips();

    // Add event listeners
    this.bindEvents();
  }

  static bindEvents() {
    // Copy link button
    const copyBtn = document.querySelector('[onclick="copyPaymentLink()"]');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => this.copyPaymentLink());
    }

    // Payment method selection
    document.querySelectorAll('.payment-method-card').forEach(card => {
      card.addEventListener('click', (e) => {
        const method = card.dataset.method;
        this.selectPaymentMethod(method);
      });
    });

    // Manual payment info
    const manualBtn = document.querySelector('[onclick="showManualPaymentInstructions()"]');
    if (manualBtn) {
      manualBtn.addEventListener('click', () => this.showManualPaymentInstructions());
    }
  }

  static selectPaymentMethod(method) {
    // Remove previous selection
    document.querySelectorAll('.payment-method-card').forEach(card => {
      card.classList.remove('selected');
    });

    // Add selection to clicked card
    const selectedCard = document.querySelector(`[data-method="${method}"]`);
    if (selectedCard) {
      selectedCard.classList.add('selected');
    }

    this.selectedMethod = method;
  }

  static async processPayment(method) {
    try {
      // Show processing modal
      this.showProcessingModal();

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
        this.hideProcessingModal();
      }

    } catch (error) {
      console.error('Payment error:', error);
      this.showError('Terjadi kesalahan saat memproses pembayaran');
      this.hideProcessingModal();
    }
  }

  static showProcessingModal() {
    const modal = new bootstrap.Modal(document.getElementById('paymentModal'));
    modal.show();
  }

  static hideProcessingModal() {
    const modal = bootstrap.Modal.getInstance(document.getElementById('paymentModal'));
    if (modal) {
      modal.hide();
    }
  }

  static showPaymentInstructions(data) {
    this.hideProcessingModal();

    // Hide payment methods
    document.getElementById('paymentMethodsSection').style.display = 'none';

    // Show instructions
    const instructionsHtml = `
      <div class="card">
        <div class="card-header">
          <h5 class="mb-0">Instruksi Pembayaran</h5>
        </div>
        <div class="card-body">
          ${data.instructions ? `
            <div class="alert alert-info">
              <h6>${data.instructions.title}</h6>
              <p>${data.instructions.description}</p>
              ${data.instructions.methods ? `
                <ul>
                  ${data.instructions.methods.map(method => `<li>${method}</li>`).join('')}
                </ul>
              ` : ''}
              ${data.instructions.note ? `<p class="mb-0"><small>${data.instructions.note}</small></p>` : ''}
            </div>
          ` : ''}

          <div class="text-center">
            <button class="btn btn-primary" onclick="checkPaymentStatus()">
              <i class="fas fa-sync me-2"></i>
              Cek Status Pembayaran
            </button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('paymentMethodsSection').innerHTML = instructionsHtml;
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
      const response = await fetch(`/api/payments/status/${this.invoice.id}`);
      const result = await response.json();

      if (result.paid) {
        // Payment successful
        this.showSuccess();
        clearInterval(this.statusCheckInterval);
      }

    } catch (error) {
      console.error('Status check error:', error);
    }
  }

  static showSuccess() {
    // Hide QR code
    document.getElementById('qrSection').style.display = 'none';

    // Hide payment methods
    document.getElementById('paymentMethodsSection').style.display = 'none';

    // Update invoice status
    const statusBadge = document.querySelector('.badge');
    if (statusBadge) {
      statusBadge.className = 'badge bg-success fs-6';
      statusBadge.innerHTML = '<i class="fas fa-check-circle me-1"></i>LUNAS';
    }

    // Show success animation
    this.showSuccessAnimation();

    // Show WhatsApp notification
    this.showWhatsAppNotification();

    // Show download receipt option
    this.showDownloadReceipt();
  }

  static showSuccessAnimation() {
    // Create success overlay on QR
    const qrOverlay = document.getElementById('qrOverlay');
    if (qrOverlay) {
      qrOverlay.classList.add('show');
    }

    // Create confetti effect
    this.createConfetti();
  }

  static createConfetti() {
    // Simple confetti animation
    const colors = ['#0d6efd', '#198754', '#ffc107', '#dc3545'];
    const confettiCount = 50;

    for (let i = 0; i < confettiCount; i++) {
      const confetti = document.createElement('div');
      confetti.style.cssText = `
        position: fixed;
        width: 10px;
        height: 10px;
        background: ${colors[Math.floor(Math.random() * colors.length)]};
        left: ${Math.random() * 100}%;
        top: -10px;
        opacity: ${Math.random() + 0.5};
        transform: rotate(${Math.random() * 360}deg);
        animation: fall ${Math.random() * 3 + 2}s linear;
        z-index: 9999;
      `;
      document.body.appendChild(confetti);

      setTimeout(() => confetti.remove(), 5000);
    }

    // Add fall animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fall {
        to {
          top: 100vh;
          transform: rotate(${Math.random() * 720}deg);
        }
      }
    `;
    document.head.appendChild(style);
  }

  static showWhatsAppNotification() {
    const toast = document.getElementById('whatsappToast');
    if (toast) {
      toast.style.display = 'block';

      // Auto hide after 5 seconds
      setTimeout(() => {
        toast.style.display = 'none';
      }, 5000);
    }
  }

  static showDownloadReceipt() {
    const downloadSection = document.createElement('section');
    downloadSection.className = 'text-center mt-4 fade-in';
    downloadSection.innerHTML = `
      <div class="card">
        <div class="card-body">
          <i class="fas fa-download text-primary" style="font-size: 3rem;"></i>
          <h5 class="mt-3">Download Bukti Pembayaran</h5>
          <p class="text-muted">Anda dapat mendownload bukti pembayaran untuk arsip Anda.</p>
          <button class="btn btn-primary" onclick="downloadReceipt()">
            <i class="fas fa-file-pdf me-2"></i>
            Download PDF
          </button>
        </div>
      </div>
    `;

    document.querySelector('.payment-main .container').appendChild(downloadSection);
  }

  static async copyPaymentLink() {
    const input = document.getElementById('paymentLink');
    const button = event.target.closest('button');

    try {
      await navigator.clipboard.writeText(input.value);

      // Visual feedback
      button.classList.add('copy-success');
      button.innerHTML = '<i class="fas fa-check me-2"></i>Tersalin!';

      setTimeout(() => {
        button.classList.remove('copy-success');
        button.innerHTML = '<i class="fas fa-copy me-2"></i>Salin';
      }, 2000);

    } catch (err) {
      console.error('Failed to copy:', err);
      // Fallback for older browsers
      input.select();
      document.execCommand('copy');
    }
  }

  static showManualPaymentInstructions() {
    const modal = new bootstrap.Modal(document.getElementById('manualPaymentModal'));
    modal.show();
  }

  static downloadReceipt() {
    // Open receipt in new tab
    window.open(`/api/invoices/${this.invoice.id}/receipt`, '_blank');
  }

  static showError(message) {
    // Create error alert
    const alert = document.createElement('div');
    alert.className = 'alert alert-danger alert-dismissible fade show';
    alert.innerHTML = `
      <i class="fas fa-exclamation-triangle me-2"></i>
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;

    // Insert at top of main content
    const main = document.querySelector('.payment-main .container');
    main.insertBefore(alert, main.firstChild);

    // Auto remove after 5 seconds
    setTimeout(() => {
      alert.remove();
    }, 5000);
  }

  static initTooltips() {
    // Initialize Bootstrap tooltips
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function (tooltipTriggerEl) {
      return new bootstrap.Tooltip(tooltipTriggerEl);
    });
  }
}

// Global functions for inline event handlers
function processPayment(method) {
  PaymentPage.processPayment(method);
}

function selectPaymentMethod(method) {
  PaymentPage.selectPaymentMethod(method);
}

function copyPaymentLink() {
  PaymentPage.copyPaymentLink();
}

function showManualPaymentInstructions() {
  PaymentPage.showManualPaymentInstructions();
}

function checkPaymentStatus() {
  PaymentPage.checkPaymentStatus();
}

function downloadReceipt() {
  PaymentPage.downloadReceipt();
}
```

## 4. Invoice Management UI

### 4.1 Invoice List UI
```html
<!-- views/invoices/index.ejs -->
<div class="container-fluid">
  <!-- Header Actions -->
  <div class="d-flex justify-content-between align-items-center mb-4">
    <h4>Manajemen Invoice</h4>
    <div>
      <button class="btn btn-success" data-bs-toggle="modal" data-bs-target="#createInvoiceModal">
        <i class="fas fa-plus me-2"></i>Buat Invoice
      </button>
      <button class="btn btn-primary" onclick="exportInvoices()">
        <i class="fas fa-download me-2"></i>Export
      </button>
    </div>
  </div>

  <!-- Filter Bar -->
  <div class="card mb-4">
    <div class="card-body">
      <form id="invoiceFilterForm" class="row g-3">
        <div class="col-md-2">
          <input type="text" class="form-control" name="invoiceNumber" placeholder="No. Invoice">
        </div>
        <div class="col-md-2">
          <select class="form-select" name="status">
            <option value="">Semua Status</option>
            <option value="pending">Menunggu</option>
            <option value="partial_paid">Sebagian</option>
            <option value="paid">Lunas</option>
            <option value="overdue">Terlambat</option>
          </select>
        </div>
        <div class="col-md-2">
          <select class="form-select" name="customer">
            <option value="">Semua Customer</option>
            <!-- Customers loaded dynamically -->
          </select>
        </div>
        <div class="col-md-2">
          <input type="date" class="form-control" name="startDate">
        </div>
        <div class="col-md-2">
          <input type="date" class="form-control" name="endDate">
        </div>
        <div class="col-md-2">
          <button type="submit" class="btn btn-primary">
            <i class="fas fa-search me-2"></i>Filter
          </button>
          <button type="button" class="btn btn-outline-secondary ms-1" onclick="resetFilters()">
            Reset
          </button>
        </div>
      </form>
    </div>
  </div>

  <!-- Statistics Cards -->
  <div class="row mb-4">
    <div class="col-md-3">
      <div class="card bg-primary text-white">
        <div class="card-body">
          <h5 class="card-title">Total Invoice</h5>
          <h2 id="totalInvoices">0</h2>
        </div>
      </div>
    </div>
    <div class="col-md-3">
      <div class="card bg-warning text-white">
        <div class="card-body">
          <h5 class="card-title">Menunggu Pembayaran</h5>
          <h2 id="pendingInvoices">0</h2>
        </div>
      </div>
    </div>
    <div class="col-md-3">
      <div class="card bg-success text-white">
        <div class="card-body">
          <h5 class="card-title">Lunas Bulan Ini</h5>
          <h2 id="paidThisMonth">0</h2>
        </div>
      </div>
    </div>
    <div class="col-md-3">
      <div class="card bg-info text-white">
        <div class="card-body">
          <h5 class="card-title">Total Revenue</h5>
          <h2 id="totalRevenue">Rp 0</h2>
        </div>
      </div>
    </div>
  </div>

  <!-- Invoice Table -->
  <div class="card">
    <div class="card-body">
      <div class="table-responsive">
        <table class="table table-hover" id="invoiceTable">
          <thead>
            <tr>
              <th>
                <input type="checkbox" class="form-check-input" id="selectAll">
              </th>
              <th>No. Invoice</th>
              <th>Customer</th>
              <th>Jumlah</th>
              <th>Dibayar</th>
              <th>Status</th>
              <th>Jatuh Tempo</th>
              <th>Payment Link</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody id="invoiceTableBody">
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

<!-- Invoice Detail Modal -->
<div class="modal fade" id="invoiceDetailModal" tabindex="-1">
  <div class="modal-dialog modal-lg">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">Detail Invoice</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body" id="invoiceDetailContent">
        <!-- Content loaded dynamically -->
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Tutup</button>
        <button type="button" class="btn btn-primary" id="sendReminderBtn">Kirim Reminder</button>
      </div>
    </div>
  </div>
</div>
```

### 4.2 Invoice Management JavaScript
```javascript
// public/js/invoices.js
class InvoiceManager {
  static currentPage = 1;
  static filters = {};

  static init() {
    this.loadInvoices();
    this.loadStatistics();
    this.bindEvents();
  }

  static bindEvents() {
    // Filter form
    document.getElementById('invoiceFilterForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this.applyFilters();
    });

    // Select all checkbox
    document.getElementById('selectAll').addEventListener('change', (e) => {
      const checkboxes = document.querySelectorAll('tbody input[type="checkbox"]');
      checkboxes.forEach(cb => cb.checked = e.target.checked);
    });
  }

  static async loadInvoices() {
    try {
      this.showLoading();

      const params = new URLSearchParams({
        page: this.currentPage,
        ...this.filters
      });

      const response = await fetch(`/api/invoices?${params}`);
      const data = await response.json();

      this.renderInvoiceTable(data.invoices);
      this.renderPagination(data.pagination);

    } catch (error) {
      console.error('Error loading invoices:', error);
      this.showError('Gagal memuat invoice');
    } finally {
      this.hideLoading();
    }
  }

  static renderInvoiceTable(invoices) {
    const tbody = document.getElementById('invoiceTableBody');

    if (invoices.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="text-center">Tidak ada invoice</td></tr>';
      return;
    }

    tbody.innerHTML = invoices.map(invoice => `
      <tr>
        <td>
          <input type="checkbox" class="form-check-input" value="${invoice.id}">
        </td>
        <td>
          <div class="d-flex align-items-center">
            <div class="me-2">
              ${this.getStatusIcon(invoice.status)}
            </div>
            <div>
              <div class="fw-bold">${invoice.invoice_number}</div>
              <small class="text-muted">${this.formatDate(invoice.created_at)}</small>
            </div>
          </div>
        </td>
        <td>
          <div>${invoice.customer_name}</div>
          ${invoice.subscription_type ? `<small class="text-muted">${invoice.subscription_type}</small>` : ''}
        </td>
        <td class="text-end fw-bold">Rp ${this.formatCurrency(invoice.total_amount)}</td>
        <td class="text-end">
          <span class="${invoice.paid_amount > 0 ? 'text-success' : ''}">
            Rp ${this.formatCurrency(invoice.paid_amount || 0)}
          </span>
        </td>
        <td>
          ${this.getStatusBadge(invoice.status)}
        </td>
        <td>
          <div>${this.formatDate(invoice.due_date)}</div>
          ${invoice.days_overdue ? `<small class="text-danger">${invoice.days_overdue} hari terlambat</small>` : ''}
        </td>
        <td>
          ${invoice.payment_url ? `
            <div class="btn-group">
              <button class="btn btn-sm btn-outline-primary" onclick="copyPaymentLink('${invoice.payment_url}')" title="Salin Link">
                <i class="fas fa-copy"></i>
              </button>
              <button class="btn btn-sm btn-outline-success" onclick="openPaymentLink('${invoice.payment_url}')" title="Buka Link">
                <i class="fas fa-external-link-alt"></i>
              </button>
            </div>
          ` : '-'}
        </td>
        <td>
          <div class="btn-group">
            <button class="btn btn-sm btn-outline-info" onclick="viewInvoiceDetail(${invoice.id})">
              <i class="fas fa-eye"></i>
            </button>
            <button class="btn btn-sm btn-outline-primary" onclick="sendInvoice(${invoice.id})">
              <i class="fas fa-paper-plane"></i>
            </button>
            <button class="btn btn-sm btn-outline-warning" onclick="editInvoice(${invoice.id})">
              <i class="fas fa-edit"></i>
            </button>
            <div class="btn-group">
              <button type="button" class="btn btn-sm btn-outline-secondary dropdown-toggle" data-bs-toggle="dropdown">
                <i class="fas fa-ellipsis-v"></i>
              </button>
              <ul class="dropdown-menu">
                <li><a class="dropdown-item" href="#" onclick="downloadInvoice(${invoice.id})">
                  <i class="fas fa-download me-2"></i>Download PDF
                </a></li>
                <li><a class="dropdown-item" href="#" onclick="printInvoice(${invoice.id})">
                  <i class="fas fa-print me-2"></i>Cetak
                </a></li>
                <li><hr class="dropdown-divider"></li>
                <li><a class="dropdown-item text-danger" href="#" onclick="deleteInvoice(${invoice.id})">
                  <i class="fas fa-trash me-2"></i>Hapus
                </a></li>
              </ul>
            </div>
          </div>
        </td>
      </tr>
    `).join('');
  }

  static getStatusIcon(status) {
    const icons = {
      'pending': '<i class="fas fa-clock text-warning"></i>',
      'partial_paid': '<i class="fas fa-hourglass-half text-info"></i>',
      'paid': '<i class="fas fa-check-circle text-success"></i>',
      'overdue': '<i class="fas fa-exclamation-triangle text-danger"></i>',
      'cancelled': '<i class="fas fa-times-circle text-secondary"></i>'
    };
    return icons[status] || '<i class="fas fa-question-circle text-muted"></i>';
  }

  static getStatusBadge(status) {
    const badges = {
      'pending': '<span class="badge bg-warning">Menunggu</span>',
      'partial_paid': '<span class="badge bg-info">Sebagian</span>',
      'paid': '<span class="badge bg-success">Lunas</span>',
      'overdue': '<span class="badge bg-danger">Terlambat</span>',
      'cancelled': '<span class="badge bg-secondary">Dibatalkan</span>'
    };
    return badges[status] || '<span class="badge bg-secondary">Unknown</span>';
  }

  static async viewInvoiceDetail(invoiceId) {
    try {
      const response = await fetch(`/api/invoices/${invoiceId}`);
      const invoice = await response.json();

      const content = `
        <div class="row">
          <div class="col-md-6">
            <h6>Informasi Invoice</h6>
            <table class="table table-sm">
              <tr>
                <td>No. Invoice:</td>
                <td class="fw-bold">${invoice.invoice_number}</td>
              </tr>
              <tr>
                <td>Tanggal:</td>
                <td>${this.formatDate(invoice.created_at)}</td>
              </tr>
              <tr>
                <td>Jatuh Tempo:</td>
                <td>${this.formatDate(invoice.due_date)}</td>
              </tr>
              <tr>
                <td>Status:</td>
                <td>${this.getStatusBadge(invoice.status)}</td>
              </tr>
            </table>
          </div>
          <div class="col-md-6">
            <h6>Informasi Customer</h6>
            <table class="table table-sm">
              <tr>
                <td>Nama:</td>
                <td>${invoice.customer_name}</td>
              </tr>
              <tr>
                <td>WhatsApp:</td>
                <td>${invoice.customer_whatsapp}</td>
              </tr>
              <tr>
                <td>Email:</td>
                <td>${invoice.customer_email || '-'}</td>
              </tr>
            </table>
          </div>
        </div>

        <h6 class="mt-3">Detail Pembayaran</h6>
        <div class="table-responsive">
          <table class="table">
            <thead>
              <tr>
                <th>Deskripsi</th>
                <th class="text-end">Jumlah</th>
              </tr>
            </thead>
            <tbody>
              ${invoice.items.map(item => `
                <tr>
                  <td>${item.description}</td>
                  <td class="text-end">Rp ${this.formatCurrency(item.amount)}</td>
                </tr>
              `).join('')}
              <tr class="table-primary">
                <th>Total</th>
                <th class="text-end">Rp ${this.formatCurrency(invoice.total_amount)}</th>
              </tr>
            </tbody>
          </table>
        </div>

        ${invoice.payments && invoice.payments.length > 0 ? `
          <h6 class="mt-3">Riwayat Pembayaran</h6>
          <div class="table-responsive">
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Metode</th>
                  <th class="text-end">Jumlah</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${invoice.payments.map(payment => `
                  <tr>
                    <td>${this.formatDate(payment.created_at)}</td>
                    <td>${payment.method}</td>
                    <td class="text-end">Rp ${this.formatCurrency(payment.amount)}</td>
                    <td>${this.getStatusBadge(payment.status)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : ''}

        ${invoice.payment_url ? `
          <div class="mt-3">
            <h6>Payment Link</h6>
            <div class="input-group">
              <input type="text" class="form-control" value="${invoice.payment_url}" readonly>
              <button class="btn btn-outline-secondary" onclick="copyPaymentLink('${invoice.payment_url}')">
                <i class="fas fa-copy"></i> Salin
              </button>
              <button class="btn btn-primary" onclick="openPaymentLink('${invoice.payment_url}')">
                <i class="fas fa-external-link-alt"></i> Buka
              </button>
            </div>
          </div>
        ` : ''}
      `;

      document.getElementById('invoiceDetailContent').innerHTML = content;

      const modal = new bootstrap.Modal(document.getElementById('invoiceDetailModal'));
      modal.show();

    } catch (error) {
      console.error('Error loading invoice detail:', error);
      this.showError('Gagal memuat detail invoice');
    }
  }

  static async sendInvoice(invoiceId) {
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/send`, {
        method: 'POST'
      });

      const result = await response.json();

      if (result.success) {
        this.showSuccess('Invoice berhasil dikirim ke WhatsApp');
      } else {
        this.showError(result.error);
      }

    } catch (error) {
      console.error('Error sending invoice:', error);
      this.showError('Gagal mengirim invoice');
    }
  }

  static async copyPaymentLink(url) {
    try {
      await navigator.clipboard.writeText(url);
      this.showSuccess('Payment link disalin');
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }

  static openPaymentLink(url) {
    window.open(url, '_blank');
  }

  static showLoading() {
    // Implement loading indicator
  }

  static hideLoading() {
    // Hide loading indicator
  }

  static showError(message) {
    // Show error toast/alert
    alert(message);
  }

  static showSuccess(message) {
    // Show success toast/alert
    alert(message);
  }

  static formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('id-ID');
  }

  static formatCurrency(amount) {
    return new Intl.NumberFormat('id-ID').format(amount);
  }
}

// Global functions
function viewInvoiceDetail(invoiceId) {
  InvoiceManager.viewInvoiceDetail(invoiceId);
}

function sendInvoice(invoiceId) {
  InvoiceManager.sendInvoice(invoiceId);
}

function copyPaymentLink(url) {
  InvoiceManager.copyPaymentLink(url);
}

function openPaymentLink(url) {
  InvoiceManager.openPaymentLink(url);
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  InvoiceManager.init();
});
```

## 5. Payment Dashboard UI

### 5.1 Payment Statistics Dashboard
```html
<!-- views/payments/dashboard.ejs -->
<div class="container-fluid">
  <h4 class="mb-4">Payment Dashboard</h4>

  <!-- Summary Cards -->
  <div class="row mb-4">
    <div class="col-xl-3 col-md-6 mb-4">
      <div class="card border-left-primary shadow h-100 py-2">
        <div class="card-body">
          <div class="row no-gutters align-items-center">
            <div class="col mr-2">
              <div class="text-xs font-weight-bold text-primary text-uppercase mb-1">
                Total Revenue (Bulan Ini)
              </div>
              <div class="h5 mb-0 font-weight-bold text-gray-800">Rp <span id="monthlyRevenue">0</span></div>
            </div>
            <div class="col-auto">
              <i class="fas fa-calendar fa-2x text-gray-300"></i>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="col-xl-3 col-md-6 mb-4">
      <div class="card border-left-success shadow h-100 py-2">
        <div class="card-body">
          <div class="row no-gutters align-items-center">
            <div class="col mr-2">
              <div class="text-xs font-weight-bold text-success text-uppercase mb-1">
                Pembayaran Sukses
              </div>
              <div class="h5 mb-0 font-weight-bold text-gray-800"><span id="successfulPayments">0</span></div>
            </div>
            <div class="col-auto">
              <i class="fas fa-check fa-2x text-gray-300"></i>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="col-xl-3 col-md-6 mb-4">
      <div class="card border-left-info shadow h-100 py-2">
        <div class="card-body">
          <div class="row no-gutters align-items-center">
            <div class="col mr-2">
              <div class="text-xs font-weight-bold text-info text-uppercase mb-1">
                Menunggu Pembayaran
              </div>
              <div class="h5 mb-0 font-weight-bold text-gray-800"><span id="pendingPayments">0</span></div>
            </div>
            <div class="col-auto">
              <i class="fas fa-clock fa-2x text-gray-300"></i>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="col-xl-3 col-md-6 mb-4">
      <div class="card border-left-warning shadow h-100 py-2">
        <div class="card-body">
          <div class="row no-gutters align-items-center">
            <div class="col mr-2">
              <div class="text-xs font-weight-bold text-warning text-uppercase mb-1">
                Jatuh Tempo
              </div>
              <div class="h5 mb-0 font-weight-bold text-gray-800"><span id="overdueInvoices">0</span></div>
            </div>
            <div class="col-auto">
              <i class="fas fa-exclamation-triangle fa-2x text-gray-300"></i>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Charts Row -->
  <div class="row mb-4">
    <!-- Revenue Chart -->
    <div class="col-xl-8 col-lg-7">
      <div class="card shadow mb-4">
        <div class="card-header py-3 d-flex flex-row align-items-center justify-content-between">
          <h6 class="m-0 font-weight-bold text-primary">Revenue Trend</h6>
          <div class="dropdown no-arrow">
            <a class="dropdown-toggle" href="#" role="button" id="dropdownMenuLink" data-bs-toggle="dropdown">
              <i class="fas fa-ellipsis-v fa-sm fa-fw text-gray-400"></i>
            </a>
            <div class="dropdown-menu dropdown-menu-right shadow animated--fade-in">
              <a class="dropdown-item" href="#" onclick="updateRevenueChart('7d')">7 Hari</a>
              <a class="dropdown-item" href="#" onclick="updateRevenueChart('30d')">30 Hari</a>
              <a class="dropdown-item" href="#" onclick="updateRevenueChart('90d')">90 Hari</a>
            </div>
          </div>
        </div>
        <div class="card-body">
          <div class="chart-area">
            <canvas id="revenueChart"></canvas>
          </div>
        </div>
      </div>
    </div>

    <!-- Payment Methods Chart -->
    <div class="col-xl-4 col-lg-5">
      <div class="card shadow mb-4">
        <div class="card-header py-3">
          <h6 class="m-0 font-weight-bold text-primary">Metode Pembayaran</h6>
        </div>
        <div class="card-body">
          <div class="chart-pie pt-4 pb-2">
            <canvas id="paymentMethodsChart"></canvas>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Recent Transactions -->
  <div class="card shadow mb-4">
    <div class="card-header py-3">
      <h6 class="m-0 font-weight-bold text-primary">Transaksi Terakhir</h6>
    </div>
    <div class="card-body">
      <div class="table-responsive">
        <table class="table table-bordered" id="recentTransactions" width="100%" cellspacing="0">
          <thead>
            <tr>
              <th>ID</th>
              <th>Invoice</th>
              <th>Customer</th>
              <th>Metode</th>
              <th>Jumlah</th>
              <th>Status</th>
              <th>Tanggal</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            <!-- Data loaded dynamically -->
          </tbody>
        </table>
      </div>
    </div>
  </div>
</div>
```

## 6. Best Practices & Guidelines

### 6.1 UI/UX Best Practices
1. **Mobile First**: Design for mobile first, then desktop
2. **Progressive Enhancement**: Ensure functionality without JavaScript
3. **Clear Visual Hierarchy**: Important elements stand out
4. **Consistent Design**: Use consistent colors, fonts, and spacing
5. **Feedback**: Provide immediate feedback for all actions
6. **Error Prevention**: Prevent errors before they happen
7. **Accessibility**: Ensure WCAG 2.1 AA compliance

### 6.2 Performance Optimization
1. **Lazy Loading**: Load images and content as needed
2. **Minimize HTTP Requests**: Bundle CSS and JS files
3. **Optimize Images**: Use WebP format with fallbacks
4. **CDN Usage**: Use CDN for static assets
5. **Caching**: Implement proper caching headers
6. **Minify Code**: Minify HTML, CSS, and JavaScript

### 6.3 Security Considerations
1. **HTTPS Only**: Enforce HTTPS for all payment pages
2. **CSP Headers**: Implement Content Security Policy
3. **XSS Prevention**: Sanitize all user inputs
4. **CSRF Protection**: Use CSRF tokens for forms
5. **Input Validation**: Validate all inputs on client and server
6. **Secure Cookies**: Use secure, httpOnly cookies

---

*Version: 2.0.0*
*Last Updated: 2025-01-09*
*Status: Ready for Implementation*