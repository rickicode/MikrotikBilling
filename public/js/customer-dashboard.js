const CustomerDashboard = {
    customerId: null,
    customerData: null,

    init() {
        // Get customer ID from URL or session
        this.customerId = this.getCustomerIdFromUrl();
        if (!this.customerId) {
            this.showError('Customer ID not found');
            return;
        }

        this.bindEvents();
        this.loadCustomerData();
        this.loadStatistics();
        this.loadSubscriptions();
        this.loadRecentPayments();
        this.loadActivityTimeline();
        this.startAutoRefresh();
    },

    getCustomerIdFromUrl() {
        const pathParts = window.location.pathname.split('/');
        return pathParts[pathParts.length - 1] || null;
    },

    bindEvents() {
        // Add subscription form
        document.getElementById('addSubscriptionForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.addSubscriptionSubmit();
        });

        // Service type change
        document.getElementById('serviceType')?.addEventListener('change', (e) => {
            this.loadProfiles(e.target.value);
        });

        // Top up form
        document.getElementById('topUpCreditForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.topUpCreditSubmit();
        });

        // Make payment form
        document.getElementById('makePaymentForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.makePaymentSubmit();
        });

        // Payment method change
        document.getElementById('paymentMethod')?.addEventListener('change', (e) => {
            this.updatePaymentAmount(e.target.value);
        });
    },

    async loadCustomerData() {
        try {
            const response = await fetch(`/api/customers/${this.customerId}`);
            const result = await response.json();

            if (result.success) {
                this.customerData = result.data;
                this.renderCustomerInfo();
            } else {
                this.showError(result.message || 'Failed to load customer data');
            }
        } catch (error) {
            console.error('Error loading customer data:', error);
            this.showError('Failed to load customer data');
        }
    },

    renderCustomerInfo() {
        if (!this.customerData) return;

        document.getElementById('customerName').textContent = this.customerData.nama || '-';
        document.getElementById('customerPhone').textContent = this.customerData.nomor_hp || '-';
        document.getElementById('customerEmail').textContent = this.customerData.email || '-';
        document.getElementById('customerId').textContent = this.customerData.id;
        document.getElementById('customerStatus').textContent = this.customerData.status_aktif ? 'Aktif' : 'Tidak Aktif';
        document.getElementById('customerStatus').className = `badge bg-${this.customerData.status_aktif ? 'success' : 'secondary'}`;
        document.getElementById('creditBalance').textContent = this.formatCurrency(this.customerData.credit_balance || 0);
        document.getElementById('debtBalance').textContent = this.formatCurrency(this.customerData.debt_balance || 0);
    },

    async loadStatistics() {
        try {
            const response = await fetch(`/api/customers/${this.customerId}/statistics`);
            const result = await response.json();

            if (result.success) {
                document.getElementById('totalSubscriptions').textContent = result.data.total_subscriptions || 0;
                document.getElementById('activeSubscriptions').textContent = result.data.active_subscriptions || 0;
                document.getElementById('expiredSubscriptions').textContent = result.data.expired_subscriptions || 0;
                document.getElementById('totalPayments').textContent = result.data.total_payments || 0;
            }
        } catch (error) {
            console.error('Error loading statistics:', error);
        }
    },

    async loadSubscriptions() {
        try {
            const container = document.getElementById('subscriptionsList');
            if (!container) return;

            container.innerHTML = `
                <div class="py-4 text-center text-muted">
                    <div class="spinner-border spinner-border-sm me-2" role="status"></div>
                    Memuat data berlangganan...
                </div>
            `;

            const response = await fetch(`/api/customers/${this.customerId}/subscriptions?status=active&limit=5`);
            const result = await response.json();

            if (result.success) {
                this.renderSubscriptions(result.data);
            } else {
                container.innerHTML = `
                    <div class="py-4 text-center text-danger">
                        <i class="bi bi-exclamation-triangle me-2"></i>
                        ${result.message || 'Gagal memuat data berlangganan'}
                    </div>
                `;
            }
        } catch (error) {
            console.error('Error loading subscriptions:', error);
            const container = document.getElementById('subscriptionsList');
            if (container) {
                container.innerHTML = `
                    <div class="py-4 text-center text-danger">
                        <i class="bi bi-exclamation-triangle me-2"></i>
                        Gagal memuat data berlangganan
                    </div>
                `;
            }
        }
    },

    renderSubscriptions(subscriptions) {
        const container = document.getElementById('subscriptionsList');
        if (!container) return;

        if (subscriptions.length === 0) {
            container.innerHTML = `
                <div class="py-4 text-center text-muted">
                    <i class="bi bi-inbox me-2"></i>
                    Tidak ada berlangganan aktif
                </div>
            `;
            return;
        }

        container.innerHTML = subscriptions.map(subscription => {
            const statusClass = this.getSubscriptionStatusClass(subscription);
            const statusBadge = this.getSubscriptionStatusBadge(subscription);
            const expiryWarning = this.getExpiryWarning(subscription.expiry_date);

            return `
                <div class="card subscription-card ${statusClass}">
                    <div class="card-body">
                        <div class="row align-items-center">
                            <div class="col-md-6">
                                <h6 class="card-title mb-1">${subscription.profile_name || 'Unknown Package'}</h6>
                                <div class="text-muted">
                                    <i class="bi bi-person me-1"></i>${subscription.username}
                                    <span class="mx-2">•</span>
                                    <i class="bi bi-hdd-network me-1"></i>${subscription.service_type}
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="mb-1">
                                    <small class="text-muted">Status</small>
                                    <div>${statusBadge}</div>
                                </div>
                                <div>
                                    <small class="text-muted">Kadaluarsa</small>
                                    <div class="${expiryWarning.class}">
                                        ${this.formatDate(subscription.expiry_date)}
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-3 text-end">
                                <div class="mb-2">
                                    <strong>${this.formatCurrency(subscription.price_sell)}</strong>
                                    <small class="text-muted">/${subscription.billing_cycle}</small>
                                </div>
                                <div class="btn-group btn-group-sm">
                                    <button type="button" class="btn btn-outline-info" onclick="CustomerDashboard.renewSubscription(${subscription.id})" title="Perpanjang">
                                        <i class="bi bi-arrow-repeat"></i>
                                    </button>
                                    <button type="button" class="btn btn-outline-warning" onclick="CustomerDashboard.pauseSubscription(${subscription.id})" title="Pause">
                                        <i class="bi bi-pause-circle"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },

    async loadRecentPayments() {
        try {
            const container = document.getElementById('recentPaymentsList');
            if (!container) return;

            container.innerHTML = `
                <div class="py-4 text-center text-muted">
                    <div class="spinner-border spinner-border-sm me-2" role="status"></div>
                    Memuat data pembayaran...
                </div>
            `;

            const response = await fetch(`/api/customers/${this.customerId}/payments?limit=5`);
            const result = await response.json();

            if (result.success) {
                this.renderRecentPayments(result.data);
            } else {
                container.innerHTML = `
                    <div class="py-4 text-center text-danger">
                        <i class="bi bi-exclamation-triangle me-2"></i>
                        ${result.message || 'Gagal memuat data pembayaran'}
                    </div>
                `;
            }
        } catch (error) {
            console.error('Error loading recent payments:', error);
            const container = document.getElementById('recentPaymentsList');
            if (container) {
                container.innerHTML = `
                    <div class="py-4 text-center text-danger">
                        <i class="bi bi-exclamation-triangle me-2"></i>
                        Gagal memuat data pembayaran
                    </div>
                `;
            }
        }
    },

    renderRecentPayments(payments) {
        const container = document.getElementById('recentPaymentsList');
        if (!container) return;

        if (payments.length === 0) {
            container.innerHTML = `
                <div class="py-4 text-center text-muted">
                    <i class="bi bi-inbox me-2"></i>
                    Tidak ada pembayaran
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="table-responsive">
                <table class="table table-sm table-hover">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Jumlah</th>
                            <th>Metode</th>
                            <th>Status</th>
                            <th>Tanggal</th>
                            <th>Aksi</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${payments.map(payment => `
                            <tr class="payment-row">
                                <td>#${payment.id}</td>
                                <td class="fw-bold">${this.formatCurrency(payment.amount)}</td>
                                <td>${this.getMethodBadge(payment.payment_method)}</td>
                                <td>${this.getStatusBadge(payment.payment_status)}</td>
                                <td>${this.formatDate(payment.created_at)}</td>
                                <td>
                                    <button type="button" class="btn btn-outline-info btn-sm" onclick="CustomerDashboard.viewPayment(${payment.id})" title="Detail">
                                        <i class="bi bi-eye"></i>
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    },

    async loadActivityTimeline() {
        try {
            const container = document.getElementById('activityTimeline');
            if (!container) return;

            container.innerHTML = `
                <div class="py-4 text-center text-muted">
                    <div class="spinner-border spinner-border-sm me-2" role="status"></div>
                    Memuat data aktivitas...
                </div>
            `;

            const response = await fetch(`/api/customers/${this.customerId}/activity?limit=10`);
            const result = await response.json();

            if (result.success) {
                this.renderActivityTimeline(result.data);
            } else {
                container.innerHTML = `
                    <div class="py-4 text-center text-muted">
                        <i class="bi bi-clock-history me-2"></i>
                        Tidak ada aktivitas terbaru
                    </div>
                `;
            }
        } catch (error) {
            console.error('Error loading activity timeline:', error);
            const container = document.getElementById('activityTimeline');
            if (container) {
                container.innerHTML = `
                    <div class="py-4 text-center text-muted">
                        <i class="bi bi-clock-history me-2"></i>
                        Tidak ada aktivitas terbaru
                    </div>
                `;
            }
        }
    },

    renderActivityTimeline(activities) {
        const container = document.getElementById('activityTimeline');
        if (!container) return;

        if (activities.length === 0) {
            container.innerHTML = `
                <div class="py-4 text-center text-muted">
                    <i class="bi bi-clock-history me-2"></i>
                    Tidak ada aktivitas terbaru
                </div>
            `;
            return;
        }

        container.innerHTML = activities.map(activity => {
            const activityClass = this.getActivityClass(activity.type);
            const icon = this.getActivityIcon(activity.type);

            return `
                <div class="activity-item ${activityClass}">
                    <div class="d-flex justify-content-between align-items-start">
                        <div class="flex-grow-1">
                            <div class="d-flex align-items-center">
                                <i class="bi ${icon} me-2"></i>
                                <strong>${activity.title}</strong>
                            </div>
                            <div class="text-muted small mt-1">${activity.description}</div>
                        </div>
                        <small class="text-muted">${this.formatDateTime(activity.created_at)}</small>
                    </div>
                </div>
            `;
        }).join('');
    },

    addSubscription() {
        this.loadProfiles('hotspot'); // Default to hotspot
        const modal = new bootstrap.Modal(document.getElementById('addSubscriptionModal'));
        modal.show();
    },

    async loadProfiles(serviceType) {
        try {
            const response = await fetch(`/api/profiles?service_type=${serviceType}`);
            const result = await response.json();

            if (result.success) {
                const select = document.getElementById('profileId');
                select.innerHTML = '<option value="">Pilih Paket</option>' +
                    result.data.map(profile => `
                        <option value="${profile.id}" data-price="${profile.price_sell}">
                            ${profile.name} - ${this.formatCurrency(profile.price_sell)}
                        </option>
                    `).join('');
            }
        } catch (error) {
            console.error('Error loading profiles:', error);
        }
    },

    async addSubscriptionSubmit() {
        try {
            const form = document.getElementById('addSubscriptionForm');
            const formData = new FormData(form);
            formData.append('customer_id', this.customerId);

            const response = await fetch('/api/subscriptions', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                this.showAlert('success', 'Berlangganan berhasil ditambahkan');
                bootstrap.Modal.getInstance(document.getElementById('addSubscriptionModal')).hide();
                form.reset();
                this.loadSubscriptions();
                this.loadStatistics();
                this.loadActivityTimeline();
            } else {
                this.showAlert('danger', result.message || 'Gagal menambah berlangganan');
            }
        } catch (error) {
            console.error('Error adding subscription:', error);
            this.showAlert('danger', 'Gagal menambah berlangganan');
        }
    },

    topUpCredit() {
        const modal = new bootstrap.Modal(document.getElementById('topUpCreditModal'));
        modal.show();
    },

    async topUpCreditSubmit() {
        try {
            const form = document.getElementById('topUpCreditForm');
            const formData = new FormData(form);
            formData.append('customer_id', this.customerId);

            const response = await fetch('/api/payments/top-up', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                this.showAlert('success', 'Top up berhasil');
                bootstrap.Modal.getInstance(document.getElementById('topUpCreditModal')).hide();
                form.reset();
                this.loadCustomerData();
                this.loadRecentPayments();
                this.loadActivityTimeline();
            } else {
                this.showAlert('danger', result.message || 'Gagal melakukan top up');
            }
        } catch (error) {
            console.error('Error topping up credit:', error);
            this.showAlert('danger', 'Gagal melakukan top up');
        }
    },

    makePayment() {
        this.loadSubscriptionOptions();
        const modal = new bootstrap.Modal(document.getElementById('makePaymentModal'));
        modal.show();
    },

    async loadSubscriptionOptions() {
        try {
            const response = await fetch(`/api/customers/${this.customerId}/subscriptions?status=active`);
            const result = await response.json();

            if (result.success) {
                const select = document.getElementById('paymentSubscription');
                select.innerHTML = '<option value="">Pilih Berlangganan</option>' +
                    result.data.map(subscription => `
                        <option value="${subscription.id}" data-price="${subscription.price_sell}">
                            ${subscription.profile_name} - ${this.formatCurrency(subscription.price_sell)}
                        </option>
                    `).join('');

                // Update amount when subscription is selected
                select.addEventListener('change', (e) => {
                    const selectedOption = e.target.options[e.target.selectedIndex];
                    const price = selectedOption.dataset.price;
                    if (price) {
                        document.getElementById('paymentAmount').value = price;
                    }
                });
            }
        } catch (error) {
            console.error('Error loading subscription options:', error);
        }
    },

    async makePaymentSubmit() {
        try {
            const form = document.getElementById('makePaymentForm');
            const formData = new FormData(form);
            formData.append('customer_id', this.customerId);

            const response = await fetch('/api/payments', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                this.showAlert('success', 'Pembayaran berhasil dibuat');
                bootstrap.Modal.getInstance(document.getElementById('makePaymentModal')).hide();
                form.reset();
                this.loadCustomerData();
                this.loadRecentPayments();
                this.loadActivityTimeline();
            } else {
                this.showAlert('danger', result.message || 'Gagal membuat pembayaran');
            }
        } catch (error) {
            console.error('Error making payment:', error);
            this.showAlert('danger', 'Gagal membuat pembayaran');
        }
    },

    updatePaymentAmount(method) {
        // If credit method is selected, check if customer has enough balance
        if (method === 'credit' && this.customerData) {
            const amountInput = document.getElementById('paymentAmount');
            const amount = parseFloat(amountInput.value);
            const creditBalance = parseFloat(this.customerData.credit_balance || 0);

            if (amount > creditBalance) {
                this.showAlert('warning', `Saldo tidak mencukupi. Saldo tersedia: ${this.formatCurrency(creditBalance)}`);
            }
        }
    },

    viewHistory() {
        window.location.href = `/customers/${this.customerId}/activity`;
    },

    viewAllPayments() {
        window.location.href = `/customers/${this.customerId}/payments`;
    },

    async renewSubscription(subscriptionId) {
        try {
            const response = await fetch(`/api/subscriptions/${subscriptionId}/renew`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ duration: 30 })
            });

            const result = await response.json();

            if (result.success) {
                this.showAlert('success', 'Berlangganan berhasil diperpanjang');
                this.loadSubscriptions();
                this.loadStatistics();
                this.loadActivityTimeline();
            } else {
                this.showAlert('danger', result.message || 'Gagal memperpanjang berlangganan');
            }
        } catch (error) {
            console.error('Error renewing subscription:', error);
            this.showAlert('danger', 'Gagal memperpanjang berlangganan');
        }
    },

    async pauseSubscription(subscriptionId) {
        if (!confirm('Apakah Anda yakin ingin menonaktifkan berlangganan ini?')) return;

        try {
            const response = await fetch(`/api/subscriptions/${subscriptionId}/pause`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            const result = await response.json();

            if (result.success) {
                this.showAlert('success', 'Berlangganan berhasil dinonaktifkan');
                this.loadSubscriptions();
                this.loadStatistics();
                this.loadActivityTimeline();
            } else {
                this.showAlert('danger', result.message || 'Gagal menonaktifkan berlangganan');
            }
        } catch (error) {
            console.error('Error pausing subscription:', error);
            this.showAlert('danger', 'Gagal menonaktifkan berlangganan');
        }
    },

    async viewPayment(paymentId) {
        window.location.href = `/payments/${paymentId}`;
    },

    refreshSubscriptions() {
        this.loadSubscriptions();
    },

    refreshAll() {
        this.loadCustomerData();
        this.loadStatistics();
        this.loadSubscriptions();
        this.loadRecentPayments();
        this.loadActivityTimeline();
    },

    startAutoRefresh() {
        // Auto-refresh every 60 seconds
        setInterval(() => {
            this.refreshAll();
        }, 60000);
    },

    // Helper methods
    getSubscriptionStatusClass(subscription) {
        if (subscription.status !== 'active') return 'expired';
        const daysUntilExpiry = this.getDaysUntilExpiry(subscription.expiry_date);
        if (daysUntilExpiry < 0) return 'expired';
        if (daysUntilExpiry <= 3) return 'warning';
        return '';
    },

    getSubscriptionStatusBadge(subscription) {
        if (subscription.status !== 'active') {
            return '<span class="badge bg-secondary">Dinonaktifkan</span>';
        }
        const daysUntilExpiry = this.getDaysUntilExpiry(subscription.expiry_date);
        if (daysUntilExpiry < 0) {
            return '<span class="badge bg-danger">Kadaluarsa</span>';
        }
        if (daysUntilExpiry <= 3) {
            return '<span class="badge bg-warning">Kadaluarsa 3 Hari</span>';
        }
        return '<span class="badge bg-success">Aktif</span>';
    },

    getExpiryWarning(expiryDate) {
        const daysUntilExpiry = this.getDaysUntilExpiry(expiryDate);
        if (daysUntilExpiry < 0) {
            return { class: 'text-danger', text: `Kadaluarsa ${Math.abs(daysUntilExpiry)} hari yang lalu` };
        }
        if (daysUntilExpiry <= 3) {
            return { class: 'text-warning', text: `Kadaluarsa dalam ${daysUntilExpiry} hari` };
        }
        return { class: 'text-success', text: 'Aktif' };
    },

    getDaysUntilExpiry(expiryDate) {
        const today = new Date();
        const expiry = new Date(expiryDate);
        const diffTime = expiry - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays;
    },

    getStatusBadge(status) {
        const badges = {
            'pending': '<span class="badge bg-warning">Pending</span>',
            'paid': '<span class="badge bg-success">Lunas</span>',
            'failed': '<span class="badge bg-danger">Gagal</span>',
            'cancelled': '<span class="badge bg-secondary">Dibatalkan</span>'
        };
        return badges[status] || `<span class="badge bg-secondary">${status}</span>`;
    },

    getMethodBadge(method) {
        const badges = {
            'cash': '<span class="badge bg-success">Cash</span>',
            'transfer': '<span class="badge bg-info">Transfer</span>',
            'duitku': '<span class="badge bg-primary">DuitKu</span>',
            'credit': '<span class="badge bg-warning">Saldo</span>'
        };
        return badges[method] || `<span class="badge bg-secondary">${method}</span>`;
    },

    getActivityClass(type) {
        const classes = {
            'payment': 'success',
            'subscription': 'info',
            'topup': 'success',
            'renewal': 'warning',
            'warning': 'warning',
            'error': 'danger'
        };
        return classes[type] || '';
    },

    getActivityIcon(type) {
        const icons = {
            'payment': 'bi-cash',
            'subscription': 'bi-card-list',
            'topup': 'bi-wallet2',
            'renewal': 'bi-arrow-repeat',
            'warning': 'bi-exclamation-triangle',
            'error': 'bi-x-circle'
        };
        return icons[type] || 'bi-info-circle';
    },

    showAlert(type, message) {
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
        alertDiv.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
        alertDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        document.body.appendChild(alertDiv);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (alertDiv.parentNode) {
                alertDiv.parentNode.removeChild(alertDiv);
            }
        }, 5000);
    },

    showError(message) {
        const container = document.querySelector('.container-fluid');
        if (container) {
            container.innerHTML = `
                <div class="alert alert-danger">
                    <i class="bi bi-exclamation-triangle me-2"></i>
                    ${message}
                </div>
            `;
        }
    },

    formatCurrency(amount) {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0
        }).format(amount || 0);
    },

    formatDate(dateString) {
        return new Date(dateString).toLocaleDateString('id-ID');
    },

    formatDateTime(dateString) {
        return new Date(dateString).toLocaleString('id-ID');
    }
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    CustomerDashboard.init();
});