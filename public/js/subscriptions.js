// Subscriptions Page JavaScript
document.addEventListener('DOMContentLoaded', function() {
    'use strict';

    // Utility functions
    const Utils = {
        sanitizeInput(input) {
            if (!input) return '';
            const div = document.createElement('div');
            div.textContent = input;
            return div.innerHTML;
        },

        formatCurrency(amount) {
            return new Intl.NumberFormat('id-ID', {
                style: 'currency',
                currency: 'IDR',
                minimumFractionDigits: 0
            }).format(amount || 0);
        },

        formatDate(dateString) {
            if (!dateString) return '-';
            const date = new Date(dateString);
            return date.toLocaleDateString('id-ID', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        },

        formatDateTime(dateString) {
            if (!dateString) return '-';
            const date = new Date(dateString);
            return date.toLocaleString('id-ID', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        },

        isExpiringSoon(dateString, days = 3) {
            if (!dateString) return false;
            const expiry = new Date(dateString);
            const now = new Date();
            const diffTime = expiry - now;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return diffDays <= days && diffDays >= 0;
        },

        isExpired(dateString) {
            if (!dateString) return false;
            const expiry = new Date(dateString);
            const now = new Date();
            return expiry < now;
        },

        debounce(func, wait) {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        }
    };

    // Subscription Management System
    const SubscriptionManager = {
        currentPage: 1,
        pageSize: 20,
        searchQuery: '',
        statusFilter: '',
        serviceFilter: '',
        expiryFilter: '',
        sortBy: 'expiry_date',
        sortOrder: 'asc',
        selectedSubscriptions: new Set(),

        init() {
            this.setupEventListeners();
            this.loadSubscriptions();
            this.loadStatistics();
        },

        setupEventListeners() {
            // Export button
            const exportBtn = document.getElementById('exportBtn');
            if (exportBtn) {
                exportBtn.addEventListener('click', () => this.exportSubscriptions());
            }

            // Bulk renew button
            const bulkRenewBtn = document.getElementById('bulkRenewBtn');
            if (bulkRenewBtn) {
                bulkRenewBtn.addEventListener('click', () => this.showBulkRenewModal());
            }

            // Search functionality
            const searchInput = document.getElementById('searchInput');
            if (searchInput) {
                searchInput.addEventListener('input', Utils.debounce(() => {
                    this.searchQuery = searchInput.value.trim();
                    this.currentPage = 1;
                    this.loadSubscriptions();
                }, 300));
            }

            // Filters
            ['statusFilter', 'serviceFilter', 'expiryFilter'].forEach(filterId => {
                const filter = document.getElementById(filterId);
                if (filter) {
                    filter.addEventListener('change', () => {
                        this[filterId.replace('Filter', '')] = filter.value;
                        this.currentPage = 1;
                        this.loadSubscriptions();
                    });
                }
            });

            // Search form
            const searchForm = document.getElementById('searchForm');
            if (searchForm) {
                searchForm.addEventListener('submit', (e) => {
                    e.preventDefault();
                    this.currentPage = 1;
                    this.loadSubscriptions();
                });
            }

            // Reset filter button
            const resetFilterBtn = document.getElementById('resetFilterBtn');
            if (resetFilterBtn) {
                resetFilterBtn.addEventListener('click', () => this.resetFilters());
            }

            // Refresh button
            const refreshBtn = document.getElementById('refreshBtn');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', () => this.loadSubscriptions());
            }

            // Sync Mikrotik button
            const syncMikrotikBtn = document.getElementById('syncMikrotikBtn');
            if (syncMikrotikBtn) {
                syncMikrotikBtn.addEventListener('click', () => this.syncWithMikrotik());
            }

            // Select all checkbox
            const selectAllCheckbox = document.getElementById('selectAllCheckbox');
            if (selectAllCheckbox) {
                selectAllCheckbox.addEventListener('change', () => this.toggleSelectAll());
            }

            // Bulk action buttons
            const bulkActionButtons = [
                'bulkRenewSelected',
                'bulkDisableSelected',
                'bulkReminderSelected',
                'bulkDeleteSelected'
            ];
            bulkActionButtons.forEach(buttonId => {
                const button = document.getElementById(buttonId);
                if (button) {
                    button.addEventListener('click', () => this.handleBulkAction(buttonId.replace('bulkSelected', '').toLowerCase()));
                }
            });

            // Clear selection button
            const clearSelectionBtn = document.getElementById('clearSelectionBtn');
            if (clearSelectionBtn) {
                clearSelectionBtn.addEventListener('click', () => this.clearSelection());
            }

            // Renew subscription form
            const renewSubscriptionForm = document.getElementById('renewSubscriptionForm');
            if (renewSubscriptionForm) {
                renewSubscriptionForm.addEventListener('submit', (e) => {
                    e.preventDefault();
                    this.renewSubscription();
                });
            }

            // Bulk renew form
            const bulkRenewForm = document.getElementById('bulkRenewForm');
            if (bulkRenewForm) {
                bulkRenewForm.addEventListener('submit', (e) => {
                    e.preventDefault();
                    this.bulkRenewSubscriptions();
                });
            }

            // Event delegation for dynamic elements
            document.addEventListener('click', (e) => {
                // Subscription action buttons
                if (e.target.matches('.renew-subscription-btn')) {
                    e.preventDefault();
                    const subscriptionId = e.target.closest('.renew-subscription-btn').dataset.subscriptionId;
                    this.showRenewModal(subscriptionId);
                }

                if (e.target.matches('.edit-subscription-btn')) {
                    e.preventDefault();
                    const subscriptionId = e.target.closest('.edit-subscription-btn').dataset.subscriptionId;
                    this.editSubscription(subscriptionId);
                }

                if (e.target.matches('.disable-subscription-btn')) {
                    e.preventDefault();
                    const subscriptionId = e.target.closest('.disable-subscription-btn').dataset.subscriptionId;
                    this.disableSubscription(subscriptionId);
                }

                if (e.target.matches('.delete-subscription-btn')) {
                    e.preventDefault();
                    const subscriptionId = e.target.closest('.delete-subscription-btn').dataset.subscriptionId;
                    this.deleteSubscription(subscriptionId);
                }

                if (e.target.matches('.sync-subscription-btn')) {
                    e.preventDefault();
                    const subscriptionId = e.target.closest('.sync-subscription-btn').dataset.subscriptionId;
                    this.syncSubscription(subscriptionId);
                }

                // Subscription checkbox
                if (e.target.matches('.subscription-checkbox')) {
                    this.toggleSubscriptionSelection(e.target);
                }

                // Pagination links
                if (e.target.matches('.pagination-link')) {
                    e.preventDefault();
                    const page = parseInt(e.target.dataset.page);
                    this.goToPage(page);
                }
            });
        },

        async loadSubscriptions() {
            try {
                const params = new URLSearchParams({
                    page: this.currentPage,
                    page_size: this.pageSize,
                    search: this.searchQuery,
                    status: this.statusFilter,
                    service: this.serviceFilter,
                    expiry: this.expiryFilter,
                    sort_by: this.sortBy,
                    sort_order: this.sortOrder
                });

                const response = await fetch(`/api/subscriptions?${params}`);
                const data = await response.json();

                if (data.subscriptions) {
                    this.renderSubscriptionsTable(data.subscriptions);
                    this.renderPagination(data.pagination);
                    this.updateResultCount(data.subscriptions.length);
                } else {
                    this.showToast('error', 'Gagal memuat data berlangganan');
                }
            } catch (error) {
                console.error('Error loading subscriptions:', error);
                this.showToast('error', 'Terjadi kesalahan saat memuat data');
            }
        },

        async loadStatistics() {
            try {
                const response = await fetch('/api/subscriptions/statistics');
                const data = await response.json();

                if (data) {
                    this.updateStatistics(data);
                }
            } catch (error) {
                console.error('Error loading statistics:', error);
            }
        },

        renderSubscriptionsTable(subscriptions) {
            const tbody = document.getElementById('subscriptionsTableBody');
            if (!tbody) return;

            if (!subscriptions || subscriptions.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="11" class="text-center py-4">
                            <div class="text-muted">
                                <i class="bi bi-inbox fs-1 d-block mb-2"></i>
                                <p>Tidak ada data berlangganan</p>
                                ${this.searchQuery || this.statusFilter || this.serviceFilter || this.expiryFilter ?
                                    '<button class="btn btn-outline-primary btn-sm reset-filters-btn">Reset Filter</button>' :
                                    ''
                                }
                            </div>
                        </td>
                    </tr>
                `;
                return;
            }

            tbody.innerHTML = subscriptions.map(subscription => {
                const isExpiring = Utils.isExpiringSoon(subscription.expiry_date);
                const isExpired = Utils.isExpired(subscription.expiry_date);
                const expiryClass = isExpired ? 'expiry-danger' : isExpiring ? 'expiry-warning' : '';

                return `
                    <tr class="subscription-row ${this.selectedSubscriptions.has(subscription.id) ? 'selected' : ''}">
                        <td>
                            <input type="checkbox" class="form-check-input subscription-checkbox"
                                   value="${subscription.id}" ${this.selectedSubscriptions.has(subscription.id) ? 'checked' : ''}>
                        </td>
                        <td>${subscription.id}</td>
                        <td>
                            <div class="d-flex align-items-center">
                                <div class="avatar-circle me-2" style="width: 32px; height: 32px; font-size: 14px;">
                                    ${subscription.customer_name ? subscription.customer_name.charAt(0).toUpperCase() : '?'}
                                </div>
                                <div>
                                    <div class="fw-semibold">${Utils.sanitizeInput(subscription.customer_name || '-')}</div>
                                    <div class="text-muted small">${Utils.sanitizeInput(subscription.customer_phone || '-')}</div>
                                </div>
                            </div>
                        </td>
                        <td>
                            <span class="badge subscription-badge bg-${subscription.service_type === 'hotspot' ? 'primary' : 'success'}">
                                <i class="bi bi-${subscription.service_type === 'hotspot' ? 'wifi' : 'router'} me-1"></i>
                                ${subscription.service_type.toUpperCase()}
                            </span>
                        </td>
                        <td>${Utils.sanitizeInput(subscription.profile_name || '-')}</td>
                        <td>
                            <span class="badge ${subscription.status === 'active' ? 'bg-success' : subscription.status === 'disabled' ? 'bg-warning' : 'bg-danger'}">
                                ${subscription.status === 'active' ? 'Aktif' : subscription.status === 'disabled' ? 'Dinonaktifkan' : 'Kadaluarsa'}
                            </span>
                        </td>
                        <td>${this.formatBillingCycle(subscription.billing_cycle)}</td>
                        <td class="${expiryClass}">
                            ${Utils.formatDate(subscription.expiry_date)}
                            ${isExpiring ? '<i class="bi bi-exclamation-triangle ms-1"></i>' : ''}
                            ${isExpired ? '<i class="bi bi-x-circle ms-1"></i>' : ''}
                        </td>
                        <td>
                            <span class="badge ${subscription.auto_renew ? 'bg-success' : 'bg-secondary'}">
                                ${subscription.auto_renew ? 'Ya' : 'Tidak'}
                            </span>
                        </td>
                        <td class="fw-bold">${Utils.formatCurrency(subscription.price_sell)}</td>
                        <td>
                            <div class="btn-group btn-group-sm" role="group">
                                <button class="btn btn-outline-success renew-subscription-btn"
                                        data-subscription-id="${subscription.id}"
                                        title="Perpanjang">
                                    <i class="bi bi-arrow-repeat"></i>
                                </button>
                                <button class="btn btn-outline-primary edit-subscription-btn"
                                        data-subscription-id="${subscription.id}"
                                        title="Edit">
                                    <i class="bi bi-pencil"></i>
                                </button>
                                <button class="btn btn-outline-info sync-subscription-btn"
                                        data-subscription-id="${subscription.id}"
                                        title="Sync Mikrotik">
                                    <i class="bi bi-cloud-download"></i>
                                </button>
                                <button class="btn btn-outline-warning disable-subscription-btn"
                                        data-subscription-id="${subscription.id}"
                                        title="Nonaktifkan">
                                    <i class="bi bi-pause-circle"></i>
                                </button>
                                <button class="btn btn-outline-danger delete-subscription-btn"
                                        data-subscription-id="${subscription.id}"
                                        title="Hapus">
                                    <i class="bi bi-trash"></i>
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
        },

        formatBillingCycle(cycle) {
            const cycles = {
                'weekly': 'Mingguan',
                'monthly': 'Bulanan',
                'quarterly': '3 Bulanan',
                'semiannual': '6 Bulanan',
                'yearly': 'Tahunan',
                'custom': 'Kustom'
            };
            return cycles[cycle] || cycle;
        },

        updateStatistics(stats) {
            const elements = {
                totalSubscriptions: document.getElementById('totalSubscriptions'),
                activeSubscriptions: document.getElementById('activeSubscriptions'),
                expiredSubscriptions: document.getElementById('expiredSubscriptions'),
                monthlyRevenue: document.getElementById('monthlyRevenue')
            };

            Object.keys(elements).forEach(key => {
                if (elements[key]) {
                    if (key === 'monthlyRevenue') {
                        elements[key].textContent = Utils.formatCurrency(stats[key] || 0);
                    } else {
                        elements[key].textContent = stats[key] || 0;
                    }
                }
            });
        },

        updateResultCount(count) {
            const resultCount = document.getElementById('resultCount');
            if (resultCount) {
                resultCount.textContent = `${count} Hasil`;
            }
        },

        toggleSelectAll() {
            const selectAllCheckbox = document.getElementById('selectAllCheckbox');
            const checkboxes = document.querySelectorAll('.subscription-checkbox');

            checkboxes.forEach(checkbox => {
                checkbox.checked = selectAllCheckbox.checked;
                const subscriptionId = parseInt(checkbox.value);
                if (selectAllCheckbox.checked) {
                    this.selectedSubscriptions.add(subscriptionId);
                } else {
                    this.selectedSubscriptions.delete(subscriptionId);
                }
            });

            this.updateBulkActionsBar();
        },

        toggleSubscriptionSelection(checkbox) {
            const subscriptionId = parseInt(checkbox.value);

            if (checkbox.checked) {
                this.selectedSubscriptions.add(subscriptionId);
            } else {
                this.selectedSubscriptions.delete(subscriptionId);
            }

            this.updateBulkActionsBar();
            this.updateSelectAllCheckbox();
        },

        updateSelectAllCheckbox() {
            const selectAllCheckbox = document.getElementById('selectAllCheckbox');
            const checkboxes = document.querySelectorAll('.subscription-checkbox');
            const checkedBoxes = document.querySelectorAll('.subscription-checkbox:checked');

            if (checkedBoxes.length === 0) {
                selectAllCheckbox.indeterminate = false;
                selectAllCheckbox.checked = false;
            } else if (checkedBoxes.length === checkboxes.length) {
                selectAllCheckbox.indeterminate = false;
                selectAllCheckbox.checked = true;
            } else {
                selectAllCheckbox.indeterminate = true;
            }
        },

        updateBulkActionsBar() {
            const bulkActionsBar = document.getElementById('bulkActionsBar');
            const selectedCount = document.getElementById('selectedCount');

            if (this.selectedSubscriptions.size > 0) {
                bulkActionsBar.style.display = 'block';
                selectedCount.textContent = this.selectedSubscriptions.size;
            } else {
                bulkActionsBar.style.display = 'none';
            }
        },

        clearSelection() {
            this.selectedSubscriptions.clear();
            document.querySelectorAll('.subscription-checkbox').forEach(checkbox => {
                checkbox.checked = false;
            });
            document.getElementById('selectAllCheckbox').checked = false;
            document.getElementById('selectAllCheckbox').indeterminate = false;
            this.updateBulkActionsBar();
        },

        async showRenewModal(subscriptionId) {
            try {
                const response = await fetch(`/api/subscriptions/${subscriptionId}`);
                const data = await response.json();

                if (data.subscription) {
                    const subscription = data.subscription;
                    const modal = document.getElementById('renewSubscriptionModal');

                    // Populate modal with subscription info
                    document.getElementById('renewCustomerName').textContent = subscription.customer_name;
                    document.getElementById('renewServiceInfo').textContent = `${subscription.service_type} - ${subscription.profile_name}`;
                    document.getElementById('renewCurrentPrice').textContent = Utils.formatCurrency(subscription.price_sell);

                    // Set amount based on duration
                    this.updateRenewAmount(subscription.price_sell);

                    // Store subscription ID
                    document.getElementById('renewSubscriptionForm').dataset.subscriptionId = subscriptionId;

                    const bsModal = new bootstrap.Modal(modal);
                    bsModal.show();
                } else {
                    this.showToast('error', 'Data berlangganan tidak ditemukan');
                }
            } catch (error) {
                console.error('Error loading subscription:', error);
                this.showToast('error', 'Terjadi kesalahan');
            }
        },

        updateRenewAmount(basePrice) {
            const duration = parseInt(document.getElementById('renewDuration').value);
            const amount = basePrice * (duration / 30); // Pro-rate calculation
            document.getElementById('renewAmount').value = amount;
        },

        async renewSubscription() {
            const form = document.getElementById('renewSubscriptionForm');
            const subscriptionId = form.dataset.subscriptionId;
            const formData = new FormData(form);

            try {
                const response = await fetch(`/api/subscriptions/${subscriptionId}/renew`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(Object.fromEntries(formData))
                });

                const data = await response.json();

                if (response.ok) {
                    this.showToast('success', 'Berlangganan berhasil diperpanjang');
                    this.loadSubscriptions();
                    this.loadStatistics();

                    const modal = document.getElementById('renewSubscriptionModal');
                    const bsModal = bootstrap.Modal.getInstance(modal);
                    bsModal.hide();
                } else {
                    this.showToast('error', data.message || 'Gagal memperpanjang berlangganan');
                }
            } catch (error) {
                console.error('Error renewing subscription:', error);
                this.showToast('error', 'Terjadi kesalahan');
            }
        },

        showBulkRenewModal() {
            if (this.selectedSubscriptions.size === 0) {
                this.showToast('warning', 'Pilih berlangganan yang akan diperpanjang');
                return;
            }

            const modal = document.getElementById('bulkRenewModal');
            document.getElementById('bulkRenewCount').textContent = this.selectedSubscriptions.size;

            // Populate selected subscriptions list
            this.populateBulkRenewList();

            const bsModal = new bootstrap.Modal(modal);
            bsModal.show();
        },

        async populateBulkRenewList() {
            try {
                const subscriptionIds = Array.from(this.selectedSubscriptions).join(',');
                const response = await fetch(`/api/subscriptions?ids=${subscriptionIds}`);
                const data = await response.json();

                if (data.subscriptions) {
                    const list = document.getElementById('bulkRenewList');
                    let totalPrice = 0;

                    list.innerHTML = data.subscriptions.map(subscription => {
                        totalPrice += subscription.price_sell;
                        return `
                            <tr>
                                <td>${subscription.customer_name}</td>
                                <td>${subscription.service_type} - ${subscription.profile_name}</td>
                                <td>${Utils.formatDate(subscription.expiry_date)}</td>
                            </tr>
                        `;
                    }).join('');

                    document.getElementById('bulkRenewTotal').textContent = Utils.formatCurrency(totalPrice);
                }
            } catch (error) {
                console.error('Error loading subscriptions for bulk renew:', error);
            }
        },

        async bulkRenewSubscriptions() {
            const form = document.getElementById('bulkRenewForm');
            const formData = new FormData(form);

            try {
                const response = await fetch('/api/subscriptions/bulk-renew', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        ...Object.fromEntries(formData),
                        subscription_ids: Array.from(this.selectedSubscriptions)
                    })
                });

                const data = await response.json();

                if (response.ok) {
                    this.showToast('success', `${data.renewed_count} berlangganan berhasil diperpanjang`);
                    this.loadSubscriptions();
                    this.loadStatistics();
                    this.clearSelection();

                    const modal = document.getElementById('bulkRenewModal');
                    const bsModal = bootstrap.Modal.getInstance(modal);
                    bsModal.hide();
                } else {
                    this.showToast('error', data.message || 'Gagal memperpanjang berlangganan');
                }
            } catch (error) {
                console.error('Error bulk renewing subscriptions:', error);
                this.showToast('error', 'Terjadi kesalahan');
            }
        },

        async handleBulkAction(action) {
            if (this.selectedSubscriptions.size === 0) {
                this.showToast('warning', 'Pilih berlangganan terlebih dahulu');
                return;
            }

            const actions = {
                renew: () => this.showBulkRenewModal(),
                disable: () => this.bulkDisableSubscriptions(),
                reminder: () => this.bulkSendReminders(),
                delete: () => this.bulkDeleteSubscriptions()
            };

            if (actions[action]) {
                actions[action]();
            }
        },

        async bulkDisableSubscriptions() {
            if (!confirm(`Nonaktifkan ${this.selectedSubscriptions.size} berlangganan?`)) {
                return;
            }

            try {
                const response = await fetch('/api/subscriptions/bulk-disable', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        subscription_ids: Array.from(this.selectedSubscriptions)
                    })
                });

                const data = await response.json();

                if (response.ok) {
                    this.showToast('success', `${data.disabled_count} berlangganan berhasil dinonaktifkan`);
                    this.loadSubscriptions();
                    this.loadStatistics();
                    this.clearSelection();
                } else {
                    this.showToast('error', data.message || 'Gagal menonaktifkan berlangganan');
                }
            } catch (error) {
                console.error('Error bulk disabling subscriptions:', error);
                this.showToast('error', 'Terjadi kesalahan');
            }
        },

        async bulkSendReminders() {
            try {
                const response = await fetch('/api/subscriptions/bulk-reminder', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        subscription_ids: Array.from(this.selectedSubscriptions)
                    })
                });

                const data = await response.json();

                if (response.ok) {
                    this.showToast('success', `Reminder dikirim ke ${data.sent_count} pelanggan`);
                    this.clearSelection();
                } else {
                    this.showToast('error', data.message || 'Gagal mengirim reminder');
                }
            } catch (error) {
                console.error('Error sending bulk reminders:', error);
                this.showToast('error', 'Terjadi kesalahan');
            }
        },

        async bulkDeleteSubscriptions() {
            if (!confirm(`Hapus ${this.selectedSubscriptions.size} berlangganan? Tindakan ini tidak dapat dibatalkan!`)) {
                return;
            }

            try {
                const response = await fetch('/api/subscriptions/bulk-delete', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        subscription_ids: Array.from(this.selectedSubscriptions)
                    })
                });

                const data = await response.json();

                if (response.ok) {
                    this.showToast('success', `${data.deleted_count} berlangganan berhasil dihapus`);
                    this.loadSubscriptions();
                    this.loadStatistics();
                    this.clearSelection();
                } else {
                    this.showToast('error', data.message || 'Gagal menghapus berlangganan');
                }
            } catch (error) {
                console.error('Error bulk deleting subscriptions:', error);
                this.showToast('error', 'Terjadi kesalahan');
            }
        },

        async syncWithMikrotik() {
            try {
                const response = await fetch('/api/subscriptions/sync-mikrotik', {
                    method: 'POST'
                });

                const data = await response.json();

                if (response.ok) {
                    this.showToast('success', `Sinkronisasi selesai: ${data.synced_count} diperbarui`);
                    this.loadSubscriptions();
                } else {
                    this.showToast('error', data.message || 'Gagal sinkronisasi dengan Mikrotik');
                }
            } catch (error) {
                console.error('Error syncing with Mikrotik:', error);
                this.showToast('error', 'Terjadi kesalahan sinkronisasi');
            }
        },

        async syncSubscription(subscriptionId) {
            try {
                const response = await fetch(`/api/subscriptions/${subscriptionId}/sync-mikrotik`, {
                    method: 'POST'
                });

                const data = await response.json();

                if (response.ok) {
                    this.showToast('success', 'Berlangganan berhasil disinkronisasi');
                    this.loadSubscriptions();
                } else {
                    this.showToast('error', data.message || 'Gagal sinkronisasi berlangganan');
                }
            } catch (error) {
                console.error('Error syncing subscription:', error);
                this.showToast('error', 'Terjadi kesalahan');
            }
        },

        async disableSubscription(subscriptionId) {
            if (!confirm('Nonaktifkan berlangganan ini?')) {
                return;
            }

            try {
                const response = await fetch(`/api/subscriptions/${subscriptionId}/disable`, {
                    method: 'POST'
                });

                const data = await response.json();

                if (response.ok) {
                    this.showToast('success', 'Berlangganan berhasil dinonaktifkan');
                    this.loadSubscriptions();
                    this.loadStatistics();
                } else {
                    this.showToast('error', data.message || 'Gagal menonaktifkan berlangganan');
                }
            } catch (error) {
                console.error('Error disabling subscription:', error);
                this.showToast('error', 'Terjadi kesalahan');
            }
        },

        async deleteSubscription(subscriptionId) {
            if (!confirm('Hapus berlangganan ini? Tindakan ini tidak dapat dibatalkan!')) {
                return;
            }

            try {
                const response = await fetch(`/api/subscriptions/${subscriptionId}`, {
                    method: 'DELETE'
                });

                const data = await response.json();

                if (response.ok) {
                    this.showToast('success', 'Berlangganan berhasil dihapus');
                    this.loadSubscriptions();
                    this.loadStatistics();
                } else {
                    this.showToast('error', data.message || 'Gagal menghapus berlangganan');
                }
            } catch (error) {
                console.error('Error deleting subscription:', error);
                this.showToast('error', 'Terjadi kesalahan');
            }
        },

        async editSubscription(subscriptionId) {
            // Navigate to edit page or show edit modal
            window.location.href = `/subscriptions/${subscriptionId}/edit`;
        },

        resetFilters() {
            this.searchQuery = '';
            this.statusFilter = '';
            this.serviceFilter = '';
            this.expiryFilter = '';
            this.currentPage = 1;

            // Reset form elements
            const filters = ['searchInput', 'statusFilter', 'serviceFilter', 'expiryFilter'];
            filters.forEach(filterId => {
                const element = document.getElementById(filterId);
                if (element) element.value = '';
            });

            this.loadSubscriptions();
        },

        goToPage(page) {
            this.currentPage = page;
            this.loadSubscriptions();
        },

        renderPagination(pagination) {
            const container = document.getElementById('paginationNav');
            if (!container) return;

            const { current_page, total_pages, total_items } = pagination;
            let paginationHTML = '';

            // Previous button
            paginationHTML += `
                <li class="page-item ${current_page === 1 ? 'disabled' : ''}">
                    <a class="page-link pagination-link" href="#" data-page="${current_page - 1}" aria-label="Previous">
                        <i class="bi bi-chevron-left"></i>
                    </a>
                </li>
            `;

            // Page numbers with ellipsis
            const startPage = Math.max(1, current_page - 2);
            const endPage = Math.min(total_pages, current_page + 2);

            if (startPage > 1) {
                paginationHTML += `
                    <li class="page-item">
                        <a class="page-link pagination-link" href="#" data-page="1">1</a>
                    </li>
                `;
                if (startPage > 2) {
                    paginationHTML += `
                        <li class="page-item disabled">
                            <span class="page-link">...</span>
                        </li>
                    `;
                }
            }

            for (let i = startPage; i <= endPage; i++) {
                if (i > 0 && i <= total_pages) {
                    paginationHTML += `
                        <li class="page-item ${i === current_page ? 'active' : ''}">
                            <a class="page-link pagination-link" href="#" data-page="${i}">${i}</a>
                        </li>
                    `;
                }
            }

            if (endPage < total_pages) {
                if (endPage < total_pages - 1) {
                    paginationHTML += `
                        <li class="page-item disabled">
                            <span class="page-link">...</span>
                        </li>
                    `;
                }
                paginationHTML += `
                    <li class="page-item">
                        <a class="page-link pagination-link" href="#" data-page="${total_pages}">${total_pages}</a>
                    </li>
                `;
            }

            // Next button
            paginationHTML += `
                <li class="page-item ${current_page === total_pages ? 'disabled' : ''}">
                    <a class="page-link pagination-link" href="#" data-page="${current_page + 1}" aria-label="Next">
                        <i class="bi bi-chevron-right"></i>
                    </a>
                </li>
            `;

            container.innerHTML = paginationHTML;
            this.updatePaginationInfo(pagination);
        },

        updatePaginationInfo(pagination) {
            const { current_page, total_pages, total_items, page_size } = pagination;

            const currentPage = parseInt(current_page) || 1;
            const pageSize = parseInt(page_size) || this.pageSize || 20;
            const totalPages = parseInt(total_pages) || 1;
            const totalItems = parseInt(total_items) || 0;

            const startItem = totalItems > 0 ? ((currentPage - 1) * pageSize) + 1 : 0;
            const endItem = Math.min(currentPage * pageSize, totalItems);

            const startElement = document.getElementById('startItem');
            const endElement = document.getElementById('endItem');
            const totalElement = document.getElementById('totalItems');

            if (startElement) startElement.textContent = startItem;
            if (endElement) endElement.textContent = endItem;
            if (totalElement) totalElement.textContent = totalItems;

            // Update page size selector
            const pageSizeSelect = document.getElementById('pageSizeSelect');
            if (pageSizeSelect) {
                pageSizeSelect.value = pageSize;
            }

            // Hide pagination container if only one page or no items
            const paginationContainer = document.querySelector('.pagination-container');
            if (paginationContainer) {
                if (totalPages <= 1 || totalItems === 0) {
                    paginationContainer.style.display = 'none';
                } else {
                    paginationContainer.style.display = 'flex';
                }
            }
        },

        exportSubscriptions() {
            const params = new URLSearchParams({
                search: this.searchQuery,
                status: this.statusFilter,
                service: this.serviceFilter,
                expiry: this.expiryFilter,
                format: 'csv'
            });

            window.location.href = `/api/subscriptions/export?${params}`;
        },

        showToast(type, message) {
            const toastContainer = document.getElementById('toastContainer') || this.createToastContainer();
            const toastId = 'toast-' + Date.now();

            const toastHTML = `
                <div id="${toastId}" class="toast" role="alert" aria-live="assertive" aria-atomic="true">
                    <div class="toast-header">
                        <i class="bi bi-${type === 'success' ? 'check-circle-fill text-success' : type === 'error' ? 'exclamation-triangle-fill text-danger' : 'info-circle-fill text-info'} me-2"></i>
                        <strong class="me-auto">${type === 'success' ? 'Sukses' : type === 'error' ? 'Error' : 'Info'}</strong>
                        <button type="button" class="btn-close" data-bs-dismiss="toast"></button>
                    </div>
                    <div class="toast-body">
                        ${message}
                    </div>
                </div>
            `;

            toastContainer.insertAdjacentHTML('beforeend', toastHTML);
            const toastElement = document.getElementById(toastId);
            const toast = new bootstrap.Toast(toastElement);
            toast.show();

            toastElement.addEventListener('hidden.bs.toast', () => {
                toastElement.remove();
            });
        },

        createToastContainer() {
            const container = document.createElement('div');
            container.id = 'toastContainer';
            container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
            container.style.zIndex = '1055';
            document.body.appendChild(container);
            return container;
        }
    };

    // Add event listener for duration change in renew modal
    document.getElementById('renewDuration')?.addEventListener('change', function() {
        const basePrice = parseFloat(document.getElementById('renewCurrentPrice').textContent.replace(/[^0-9]/g, ''));
        if (basePrice) {
            const duration = parseInt(this.value);
            const amount = basePrice * (duration / 30);
            document.getElementById('renewAmount').value = amount;
        }
    });

    // Initialize the subscription manager
    SubscriptionManager.init();
});