const PaymentManager = {
    currentPage: 1,
    pageSize: 20,
    searchQuery: '',
    statusFilter: '',
    methodFilter: '',
    startDate: '',
    endDate: '',
    sortBy: 'created_at',
    sortOrder: 'desc',
    selectedPayments: new Set(),

    init() {
        this.bindEvents();
        this.loadPayments();
        this.loadStatistics();
        this.loadTodaySummary();
        this.startAutoRefresh();
    },

    bindEvents() {
        // Search form
        document.getElementById('searchForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.searchQuery = document.getElementById('searchInput').value;
            this.statusFilter = document.getElementById('statusFilter').value;
            this.methodFilter = document.getElementById('methodFilter').value;
            this.startDate = document.getElementById('startDate').value;
            this.endDate = document.getElementById('endDate').value;
            this.currentPage = 1;
            this.loadPayments();
        });

        // Reset filter
        document.getElementById('resetFilterBtn')?.addEventListener('click', () => {
            document.getElementById('searchForm').reset();
            this.searchQuery = '';
            this.statusFilter = '';
            this.methodFilter = '';
            this.startDate = '';
            this.endDate = '';
            this.currentPage = 1;
            this.loadPayments();
        });

        // Refresh button
        document.getElementById('refreshBtn')?.addEventListener('click', () => {
            this.loadPayments();
            this.loadStatistics();
            this.loadTodaySummary();
        });

        // Export button
        document.getElementById('exportBtn')?.addEventListener('click', () => {
            this.exportPayments();
        });

        // Reconcile button
        document.getElementById('reconcileBtn')?.addEventListener('click', () => {
            this.reconcilePayments();
        });

        // Auto-reconcile button
        document.getElementById('autoReconcileBtn')?.addEventListener('click', () => {
            this.autoReconcile();
        });

        // Quick actions
        document.getElementById('processDuitKuBtn')?.addEventListener('click', () => {
            this.showProcessDuitKuModal();
        });

        document.getElementById('generateReportsBtn')?.addEventListener('click', () => {
            this.showReportsModal();
        });

        document.getElementById('checkOverdueBtn')?.addEventListener('click', () => {
            this.checkOverduePayments();
        });

        // Bulk actions
        document.getElementById('selectAllCheckbox')?.addEventListener('change', (e) => {
            this.toggleAllSelection(e.target.checked);
        });

        document.getElementById('bulkApproveSelected')?.addEventListener('click', () => {
            this.bulkApprovePayments();
        });

        document.getElementById('bulkRejectSelected')?.addEventListener('click', () => {
            this.bulkRejectPayments();
        });

        document.getElementById('bulkExportSelected')?.addEventListener('click', () => {
            this.bulkExportPayments();
        });

        document.getElementById('clearSelectionBtn')?.addEventListener('click', () => {
            this.clearSelection();
        });

        // Generate reports form
        document.getElementById('generateReportForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.generateReport();
        });

        // Report period change
        document.getElementById('reportPeriod')?.addEventListener('change', (e) => {
            const customRange = document.getElementById('customDateRange');
            customRange.style.display = e.target.value === 'custom' ? 'block' : 'none';
        });

        // Process DuitKu selected
        document.getElementById('processSelectedDuitKu')?.addEventListener('click', () => {
            this.processSelectedDuitKu();
        });
    },

    async loadPayments() {
        try {
            const tbody = document.getElementById('paymentsTableBody');
            if (!tbody) return;

            tbody.innerHTML = `
                <tr>
                    <td colspan="10" class="py-4 text-center">
                        <div class="spinner-border spinner-border-sm me-2" role="status"></div>
                        Memuat data...
                    </td>
                </tr>
            `;

            const params = new URLSearchParams({
                page: this.currentPage,
                limit: this.pageSize,
                search: this.searchQuery,
                status: this.statusFilter,
                method: this.methodFilter,
                start_date: this.startDate,
                end_date: this.endDate,
                sort_by: this.sortBy,
                sort_order: this.sortOrder
            });

            const response = await fetch(`/payments/api/payments?${params}`);
            const result = await response.json();

            if (result.success) {
                this.renderPayments(result.data.payments);
                this.renderPagination(result.data.pagination);
                this.updateResultCount(result.data.pagination.total);
            } else {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="10" class="py-4 text-center text-danger">
                            <i class="bi bi-exclamation-triangle me-2"></i>
                            ${result.message || 'Gagal memuat data pembayaran'}
                        </td>
                    </tr>
                `;
            }
        } catch (error) {
            console.error('Error loading payments:', error);
            const tbody = document.getElementById('paymentsTableBody');
            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="10" class="py-4 text-center text-danger">
                            <i class="bi bi-exclamation-triangle me-2"></i>
                            Gagal memuat data pembayaran
                        </td>
                    </tr>
                `;
            }
        }
    },

    renderPayments(payments) {
        const tbody = document.getElementById('paymentsTableBody');
        if (!tbody) return;

        if (payments.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="10" class="py-4 text-center text-muted">
                        <i class="bi bi-inbox me-2"></i>
                        Tidak ada data pembayaran
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = payments.map(payment => {
            const statusBadge = this.getStatusBadge(payment.payment_status);
            const methodBadge = this.getMethodBadge(payment.payment_method);
            const isSelected = this.selectedPayments.has(payment.id);

            return `
                <tr class="payment-row ${isSelected ? 'selected' : ''}" data-payment-id="${payment.id}">
                    <td>
                        <input type="checkbox" class="form-check-input payment-checkbox"
                               value="${payment.id}" ${isSelected ? 'checked' : ''}>
                    </td>
                    <td>
                        <span class="fw-bold">#${payment.id}</span>
                        ${payment.duitku_reference ? `<br><small class="text-muted">${payment.duitku_reference}</small>` : ''}
                    </td>
                    <td>
                        <div class="fw-bold">${payment.customer_name || '-'}</div>
                        ${payment.customer_phone ? `<small class="text-muted">${payment.customer_phone}</small>` : ''}
                    </td>
                    <td>${payment.subscription_name || '-'}</td>
                    <td class="payment-amount ${this.getAmountClass(payment.payment_status)}">
                        ${this.formatCurrency(payment.amount)}
                    </td>
                    <td>${methodBadge}</td>
                    <td>${statusBadge}</td>
                    <td>${this.formatDateTime(payment.created_at)}</td>
                    <td>
                        <div class="text-truncate" style="max-width: 200px;" title="${payment.description || '-'}">
                            ${payment.description || '-'}
                        </div>
                    </td>
                    <td>
                        <div class="btn-group btn-group-sm">
                            ${this.getPaymentActions(payment)}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        // Bind checkbox events
        tbody.querySelectorAll('.payment-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const paymentId = parseInt(e.target.value);
                if (e.target.checked) {
                    this.selectedPayments.add(paymentId);
                } else {
                    this.selectedPayments.delete(paymentId);
                }
                this.updateBulkActionsBar();
                this.updateRowSelection(paymentId);
            });
        });
    },

    getPaymentActions(payment) {
        let actions = `
            <button type="button" class="btn btn-outline-info btn-sm" onclick="PaymentManager.viewPayment(${payment.id})" title="Detail">
                <i class="bi bi-eye"></i>
            </button>
        `;

        if (payment.payment_status === 'pending') {
            actions += `
                <button type="button" class="btn btn-outline-success btn-sm" onclick="PaymentManager.approvePayment(${payment.id})" title="Approve">
                    <i class="bi bi-check-circle"></i>
                </button>
                <button type="button" class="btn btn-outline-warning btn-sm" onclick="PaymentManager.rejectPayment(${payment.id})" title="Reject">
                    <i class="bi bi-x-circle"></i>
                </button>
            `;
        }

        if (payment.payment_method === 'duitku' && payment.payment_status === 'pending') {
            actions += `
                <button type="button" class="btn btn-outline-primary btn-sm" onclick="PaymentManager.checkDuitKuStatus(${payment.id})" title="Check Status">
                    <i class="bi bi-arrow-repeat"></i>
                </button>
            `;
        }

        return actions;
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

    getAmountClass(status) {
        const classes = {
            'paid': 'success',
            'pending': 'warning',
            'failed': 'danger',
            'cancelled': 'secondary'
        };
        return classes[status] || '';
    },

    updateBulkActionsBar() {
        const bulkBar = document.getElementById('bulkActionsBar');
        const selectedCount = document.getElementById('selectedCount');

        if (this.selectedPayments.size > 0) {
            bulkBar.style.display = 'block';
            selectedCount.textContent = this.selectedPayments.size;
        } else {
            bulkBar.style.display = 'none';
        }
    },

    updateRowSelection(paymentId) {
        const row = document.querySelector(`tr[data-payment-id="${paymentId}"]`);
        if (row) {
            if (this.selectedPayments.has(paymentId)) {
                row.classList.add('selected');
            } else {
                row.classList.remove('selected');
            }
        }
    },

    toggleAllSelection(checked) {
        const checkboxes = document.querySelectorAll('.payment-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = checked;
            const paymentId = parseInt(checkbox.value);
            if (checked) {
                this.selectedPayments.add(paymentId);
            } else {
                this.selectedPayments.delete(paymentId);
            }
            this.updateRowSelection(paymentId);
        });
        this.updateBulkActionsBar();
    },

    clearSelection() {
        this.selectedPayments.clear();
        document.querySelectorAll('.payment-checkbox').forEach(checkbox => {
            checkbox.checked = false;
            this.updateRowSelection(parseInt(checkbox.value));
        });
        this.updateBulkActionsBar();
    },

    async loadStatistics() {
        try {
            const response = await fetch('/payments/api/payments/statistics');
            const result = await response.json();

            if (result.success) {
                document.getElementById('totalPayments').textContent = result.data.total_count || 0;
                document.getElementById('successfulPayments').textContent = result.data.successful_count || 0;
                document.getElementById('pendingPayments').textContent = result.data.pending_count || 0;
                document.getElementById('monthlyRevenue').textContent = this.formatCurrency(result.data.monthly_revenue || 0);
            }
        } catch (error) {
            console.error('Error loading statistics:', error);
        }
    },

    async loadTodaySummary() {
        try {
            const response = await fetch('/payments/api/payments/today-summary');
            const result = await response.json();

            if (result.success) {
                document.getElementById('todayCount').textContent = result.data.count || 0;
                document.getElementById('todayAmount').textContent = this.formatCurrency(result.data.amount || 0);
            }
        } catch (error) {
            console.error('Error loading today summary:', error);
        }
    },

    async approvePayment(paymentId) {
        if (!confirm('Apakah Anda yakin ingin menyetujui pembayaran ini?')) return;

        try {
            const response = await fetch(`/payments/api/payments/${paymentId}/approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            const result = await response.json();

            if (result.success) {
                if (window.showToast) {
                    window.showToast('Pembayaran berhasil disetujui', 'success');
                }
                this.loadPayments();
                this.loadStatistics();
                this.loadTodaySummary();
            } else {
                if (window.showToast) {
                    window.showToast(result.message || 'Gagal menyetujui pembayaran', 'error');
                }
            }
        } catch (error) {
            console.error('Error approving payment:', error);
            if (window.showToast) {
                window.showToast('Gagal menyetujui pembayaran', 'error');
            }
        }
    },

    async rejectPayment(paymentId) {
        if (!confirm('Apakah Anda yakin ingin menolak pembayaran ini?')) return;

        try {
            const response = await fetch(`/payments/api/payments/${paymentId}/reject`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            const result = await response.json();

            if (result.success) {
                if (window.showToast) {
                    window.showToast('Pembayaran berhasil ditolak', 'success');
                }
                this.loadPayments();
                this.loadStatistics();
                this.loadTodaySummary();
            } else {
                if (window.showToast) {
                    window.showToast(result.message || 'Gagal menolak pembayaran', 'error');
                }
            }
        } catch (error) {
            console.error('Error rejecting payment:', error);
            if (window.showToast) {
                window.showToast('Gagal menolak pembayaran', 'error');
            }
        }
    },

    async checkDuitKuStatus(paymentId) {
        try {
            const response = await fetch(`/payments/api/payments/${paymentId}/check-duitku`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            const result = await response.json();

            if (result.success) {
                if (window.showToast) {
                    window.showToast(`Status DuitKu: ${result.data.status}`, 'info');
                }
                this.loadPayments();
                this.loadStatistics();
                this.loadTodaySummary();
            } else {
                if (window.showToast) {
                    window.showToast(result.message || 'Gagal mengecek status DuitKu', 'error');
                }
            }
        } catch (error) {
            console.error('Error checking DuitKu status:', error);
            if (window.showToast) {
                window.showToast('Gagal mengecek status DuitKu', 'error');
            }
        }
    },

    async bulkApprovePayments() {
        if (this.selectedPayments.size === 0) {
            if (window.showToast) {
                window.showToast('Pilih pembayaran yang ingin disetujui', 'warning');
            }
            return;
        }

        if (!confirm(`Apakah Anda yakin ingin menyetujui ${this.selectedPayments.size} pembayaran?`)) return;

        try {
            const response = await fetch('/payments/api/payments/bulk-approve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ payment_ids: Array.from(this.selectedPayments) })
            });

            const result = await response.json();

            if (result.success) {
                if (window.showToast) {
                    window.showToast(`${result.data.processed_count} pembayaran berhasil disetujui`, 'success');
                }
                this.clearSelection();
                this.loadPayments();
                this.loadStatistics();
                this.loadTodaySummary();
            } else {
                if (window.showToast) {
                    window.showToast(result.message || 'Gagal menyetujui pembayaran', 'error');
                }
            }
        } catch (error) {
            console.error('Error bulk approving payments:', error);
            if (window.showToast) {
                window.showToast('Gagal menyetujui pembayaran', 'error');
            }
        }
    },

    async bulkRejectPayments() {
        if (this.selectedPayments.size === 0) {
            window.showToast('Pilih pembayaran yang ingin ditolak', 'warning');
            return;
        }

        if (!confirm(`Apakah Anda yakin ingin menolak ${this.selectedPayments.size} pembayaran?`)) return;

        try {
            const response = await fetch('/payments/api/payments/bulk-reject', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ payment_ids: Array.from(this.selectedPayments) })
            });

            const result = await response.json();

            if (result.success) {
                window.showToast( `${result.data.processed_count} pembayaran berhasil ditolak`);
                this.clearSelection();
                this.loadPayments();
                this.loadStatistics();
                this.loadTodaySummary();
            } else {
                window.showToast( result.message || 'Gagal menolak pembayaran');
            }
        } catch (error) {
            console.error('Error bulk rejecting payments:', error);
            window.showToast( 'Gagal menolak pembayaran');
        }
    },

    async showProcessDuitKuModal() {
        try {
            const response = await fetch('/payments/api/payments/duitku-pending');
            const result = await response.json();

            if (result.success) {
                this.renderDuitKuPendingList(result.data);
                const modal = new bootstrap.Modal(document.getElementById('processDuitKuModal'));
                modal.show();
            } else {
                window.showToast( result.message || 'Gagal memuat data DuitKu pending');
            }
        } catch (error) {
            console.error('Error loading DuitKu pending:', error);
            window.showToast( 'Gagal memuat data DuitKu pending');
        }
    },

    renderDuitKuPendingList(payments) {
        const container = document.getElementById('duitKuPendingList');
        if (!container) return;

        if (payments.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="bi bi-check-circle fs-1"></i>
                    <p>Tidak ada pembayaran DuitKu yang pending</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="table-responsive">
                <table class="table table-sm">
                    <thead>
                        <tr>
                            <th>Pilih</th>
                            <th>ID</th>
                            <th>Pelanggan</th>
                            <th>Jumlah</th>
                            <th>Referensi</th>
                            <th>Dibuat</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${payments.map(payment => `
                            <tr>
                                <td>
                                    <input type="checkbox" class="form-check-input duitku-checkbox"
                                           value="${payment.id}">
                                </td>
                                <td>#${payment.id}</td>
                                <td>${payment.customer_name || '-'}</td>
                                <td>${this.formatCurrency(payment.amount)}</td>
                                <td>${payment.duitku_reference || '-'}</td>
                                <td>${this.formatDateTime(payment.created_at)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    },

    async processSelectedDuitKu() {
        const selectedCheckboxes = document.querySelectorAll('.duitku-checkbox:checked');
        const paymentIds = Array.from(selectedCheckboxes).map(cb => parseInt(cb.value));

        if (paymentIds.length === 0) {
            window.showToast( 'Pilih pembayaran yang ingin diproses');
            return;
        }

        try {
            const response = await fetch('/payments/api/payments/bulk-check-duitku', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ payment_ids: paymentIds })
            });

            const result = await response.json();

            if (result.success) {
                window.showToast( `Berhasil memproses ${result.data.processed_count} pembayaran DuitKu`);
                bootstrap.Modal.getInstance(document.getElementById('processDuitKuModal')).hide();
                this.loadPayments();
                this.loadStatistics();
                this.loadTodaySummary();
            } else {
                window.showToast( result.message || 'Gagal memproses pembayaran DuitKu');
            }
        } catch (error) {
            console.error('Error processing DuitKu payments:', error);
            window.showToast( 'Gagal memproses pembayaran DuitKu');
        }
    },

    showReportsModal() {
        const modal = new bootstrap.Modal(document.getElementById('reportsModal'));
        modal.show();
    },

    async generateReport() {
        const form = document.getElementById('generateReportForm');
        const formData = new FormData(form);

        try {
            const response = await fetch('/payments/api/payments/generate-report', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                window.showToast( 'Laporan berhasil dibuat');
                // Download the report
                if (result.data.file_url) {
                    window.open(result.data.file_url, '_blank');
                }
                bootstrap.Modal.getInstance(document.getElementById('reportsModal')).hide();
            } else {
                window.showToast( result.message || 'Gagal membuat laporan');
            }
        } catch (error) {
            console.error('Error generating report:', error);
            window.showToast( 'Gagal membuat laporan');
        }
    },

    async checkOverduePayments() {
        try {
            const response = await fetch('/payments/api/payments/check-overdue', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            const result = await response.json();

            if (result.success) {
                window.showToast( `Ditemukan ${result.data.overdue_count} pembayaran terlambat`);
                this.loadPayments();
            } else {
                window.showToast( result.message || 'Gagal mengecek pembayaran terlambat');
            }
        } catch (error) {
            console.error('Error checking overdue payments:', error);
            window.showToast( 'Gagal mengecek pembayaran terlambat');
        }
    },

    async reconcilePayments() {
        if (!confirm('Apakah Anda yakin ingin merekonsiliasi semua pembayaran?')) return;

        try {
            const response = await fetch('/payments/api/payments/reconcile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            const result = await response.json();

            if (result.success) {
                window.showToast( `Rekonsiliasi berhasil: ${result.data.message}`);
                this.updateReconciliationStatus(result.data);
            } else {
                window.showToast( result.message || 'Gagal merekonsiliasi pembayaran');
            }
        } catch (error) {
            console.error('Error reconciling payments:', error);
            window.showToast( 'Gagal merekonsiliasi pembayaran');
        }
    },

    async autoReconcile() {
        try {
            const response = await fetch('/payments/api/payments/auto-reconcile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            const result = await response.json();

            if (result.success) {
                window.showToast( `Auto-reconcile berhasil: ${result.data.message}`);
                this.updateReconciliationStatus(result.data);
            } else {
                window.showToast( result.message || 'Gagal auto-reconcile');
            }
        } catch (error) {
            console.error('Error auto-reconciling payments:', error);
            window.showToast( 'Gagal auto-reconcile');
        }
    },

    updateReconciliationStatus(data) {
        document.getElementById('reconciliationStatus').textContent = data.status;
        document.getElementById('lastReconcile').textContent = this.formatDateTime(data.last_reconcile);

        const badge = document.getElementById('reconciliationBadge');
        badge.className = `badge bg-${data.status === 'Up to date' ? 'success' : 'warning'}`;
        badge.textContent = data.status === 'Up to date' ? 'OK' : 'Check';
    },

    async exportPayments() {
        try {
            const params = new URLSearchParams({
                search: this.searchQuery,
                status: this.statusFilter,
                method: this.methodFilter,
                start_date: this.startDate,
                end_date: this.endDate
            });

            window.open(`/payments/api/payments/export?${params}`, '_blank');
        } catch (error) {
            console.error('Error exporting payments:', error);
            window.showToast( 'Gagal mengekspor pembayaran');
        }
    },

    async bulkExportPayments() {
        if (this.selectedPayments.size === 0) {
            window.showToast( 'Pilih pembayaran yang ingin diekspor');
            return;
        }

        try {
            const response = await fetch('/payments/api/payments/bulk-export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ payment_ids: Array.from(this.selectedPayments) })
            });

            const result = await response.json();

            if (result.success) {
                window.open(result.data.file_url, '_blank');
                window.showToast( 'Export berhasil');
            } else {
                window.showToast( result.message || 'Gagal mengekspor pembayaran');
            }
        } catch (error) {
            console.error('Error bulk exporting payments:', error);
            window.showToast( 'Gagal mengekspor pembayaran');
        }
    },

    renderPagination(pagination) {
        const paginationContainer = document.querySelector('.pagination');
        if (!paginationContainer) return;

        const { page, totalPages, total } = pagination;

        let html = `
            <li class="page-item ${page === 1 ? 'disabled' : ''}">
                <a class="page-link" href="#" onclick="PaymentManager.goToPage(${page - 1}); return false;">
                    <i class="bi bi-chevron-left"></i>
                </a>
            </li>
        `;

        // Show page numbers
        const startPage = Math.max(1, page - 2);
        const endPage = Math.min(totalPages, page + 2);

        for (let i = startPage; i <= endPage; i++) {
            html += `
                <li class="page-item ${i === page ? 'active' : ''}">
                    <a class="page-link" href="#" onclick="PaymentManager.goToPage(${i}); return false;">
                        ${i}
                    </a>
                </li>
            `;
        }

        html += `
            <li class="page-item ${page === totalPages ? 'disabled' : ''}">
                <a class="page-link" href="#" onclick="PaymentManager.goToPage(${page + 1}); return false;">
                    <i class="bi bi-chevron-right"></i>
                </a>
            </li>
        `;

        paginationContainer.innerHTML = html;
    },

    goToPage(page) {
        this.currentPage = page;
        this.loadPayments();
    },

    updateResultCount(total) {
        const resultCount = document.getElementById('resultCount');
        if (resultCount) {
            resultCount.textContent = `${total} Hasil`;
        }
    },

    startAutoRefresh() {
        // Auto-refresh every 30 seconds
        setInterval(() => {
            this.loadPayments();
            this.loadStatistics();
            this.loadTodaySummary();
        }, 30000);
    },

    
    formatCurrency(amount) {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0
        }).format(amount || 0);
    },

    formatDateTime(timestamp) {
        return new Date(timestamp).toLocaleString('id-ID');
    },

    toggleAdvancedFilters() {
        const advancedFilters = document.getElementById('advancedFilters');
        const toggleBtn = document.getElementById('advancedFilterBtn');

        if (!advancedFilters) return;

        const isHidden = advancedFilters.classList.contains('hidden');

        if (isHidden) {
            advancedFilters.classList.remove('hidden');
            toggleBtn.innerHTML = '<i class="fas fa-times mr-1"></i>Sembunyikan Filter';
        } else {
            advancedFilters.classList.add('hidden');
            toggleBtn.innerHTML = '<i class="fas fa-filter mr-1"></i>Filter Lanjutan';
        }
    }
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    PaymentManager.init();
});