/**
 * Notifications JavaScript Module
 *
 * Handles notification interface functionality with WhatsApp Web JS integration
 * Updated to use WhatsApp-only API endpoints
 */

class NotificationManager {
    constructor() {
        this.currentPage = 1;
        this.itemsPerPage = 10;
        this.filters = {
            status: '',
            type: 'whatsapp', // Default to WhatsApp only
            date: ''
        };
        this.init();
    }

    init() {
        this.loadStatistics();
        this.loadNotifications();
        this.bindEvents();
        this.startAutoRefresh();
    }

    bindEvents() {
        // Refresh button
        document.getElementById('refreshNotificationsBtn')?.addEventListener('click', () => {
            this.refreshAll();
        });

        // Test notification button
        document.getElementById('testNotificationBtn')?.addEventListener('click', () => {
            this.showTestModal();
        });

        // Settings button
        document.getElementById('settingsBtn')?.addEventListener('click', () => {
            this.showWhatsAppSettings();
        });

        // Filter controls
        document.getElementById('filterStatus')?.addEventListener('change', (e) => {
            this.filters.status = e.target.value;
            this.loadNotifications();
        });

        document.getElementById('filterType')?.addEventListener('change', (e) => {
            this.filters.type = e.target.value; // Should always be 'whatsapp'
            this.loadNotifications();
        });

        document.getElementById('filterDate')?.addEventListener('change', (e) => {
            this.filters.date = e.target.value;
            this.loadNotifications();
        });

        document.getElementById('applyFilterBtn')?.addEventListener('click', () => {
            this.loadNotifications();
        });

        // Test notification form
        document.getElementById('sendTestNotificationBtn')?.addEventListener('click', () => {
            this.sendTestNotification();
        });

        // Message type toggle
        document.querySelectorAll('input[name="messageType"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.toggleMessageType(e.target.value);
            });
        });

        // Items per page
        document.querySelector('select[style="width: auto;"]')?.addEventListener('change', (e) => {
            this.itemsPerPage = parseInt(e.target.value);
            this.loadNotifications();
        });

        // Settings save
        document.getElementById('saveNotificationSettingsBtn')?.addEventListener('click', () => {
            this.saveSettings();
        });
    }

    async loadStatistics() {
        try {
            const response = await fetch('/whatsapp/statistics');
            if (!response.ok) throw new Error('Failed to load statistics');

            const data = await response.json();
            this.updateStatisticsUI(data);
        } catch (error) {
            console.error('Error loading WhatsApp statistics:', error);
            this.showError('Gagal memuat statistik WhatsApp');
        }
    }

    updateStatisticsUI(data) {
        // Update statistics cards with WhatsApp data
        const updateElement = (id, value) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value || '0';
                element.classList.remove('spinner-border', 'spinner-border-sm');
            }
        };

        updateElement('totalNotifications', data.queueStats?.total || 0);
        updateElement('sentNotifications', data.queueStats?.sent || 0);
        updateElement('queuedNotifications', data.queueStats?.pending || 0);
        updateElement('failedNotifications', data.queueStats?.failed || 0);
    }

    async loadNotifications() {
        try {
            const params = new URLSearchParams({
                page: this.currentPage,
                limit: this.itemsPerPage,
                ...this.filters
            });

            const response = await fetch(`/whatsapp/api/messages?${params}`);
            if (!response.ok) throw new Error('Failed to load notifications');

            const data = await response.json();
            this.updateNotificationsTable(data.messages || []);
            this.updatePagination(data.pagination || {});
        } catch (error) {
            console.error('Error loading WhatsApp messages:', error);
            this.showError('Gagal memuat data pesan WhatsApp');
        }
    }

    updateNotificationsTable(messages) {
        const tbody = document.getElementById('notificationsTableBody');
        if (!tbody) return;

        if (messages.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center text-muted">
                        Tidak ada data pesan WhatsApp
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = messages.map(message => `
            <tr>
                <td>
                    #${message.id}
                    ${message.source_type === 'queue' ? '<span class="badge bg-info ms-1">Queue</span>' : ''}
                </td>
                <td>${this.formatDateTime(message.timestamp || message.created_at)}</td>
                <td>
                    <span class="badge bg-success">WhatsApp</span>
                    ${message.template_name ? `<small class="text-muted d-block">Template: ${message.template_name}</small>` : ''}
                    ${message.source_type === 'queue' ? '<small class="text-muted d-block">Antrian</small>' : ''}
                </td>
                <td>
                    <div>${message.to_number}</div>
                    ${message.customer_name ? `<small class="text-muted">${message.customer_name}</small>` : ''}
                </td>
                <td>
                    <div class="text-truncate" style="max-width: 200px;" title="${message.content}">
                        ${message.content || '-'}
                    </div>
                </td>
                <td>
                    ${this.getStatusBadge(message.status)}
                    ${message.error_message ? `<small class="text-danger d-block">${message.error_message}</small>` : ''}
                </td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-primary" onclick="notificationManager.resendMessage(${message.id})"
                                ${message.status === 'sent' ? 'disabled' : ''}>
                            <i class="bi bi-arrow-clockwise"></i>
                        </button>
                        <button class="btn btn-outline-danger" onclick="notificationManager.deleteMessage(${message.id})"
                                ${message.source_type === 'queue' ? 'disabled' : ''}>
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    getStatusBadge(status) {
        const badges = {
            'sent': '<span class="badge bg-success">Terkirim</span>',
            'pending': '<span class="badge bg-warning">Menunggu</span>',
            'failed': '<span class="badge bg-danger">Gagal</span>',
            'retrying': '<span class="badge bg-info">Mengulang</span>',
            'processing': '<span class="badge bg-secondary">Memproses</span>'
        };
        return badges[status] || `<span class="badge bg-secondary">${status}</span>`;
    }

    formatDateTime(dateString) {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleString('id-ID');
    }

    updatePagination(pagination) {
        const nav = document.getElementById('notificationsPagination');
        if (!nav) return;

        const { current, total, from, to } = pagination;

        let html = '';

        // Previous button
        html += `
            <li class="page-item ${current === 1 ? 'disabled' : ''}">
                <a class="page-link" href="#" onclick="notificationManager.goToPage(${current - 1}); return false;">
                    <i class="bi bi-chevron-left"></i>
                </a>
            </li>
        `;

        // Page numbers
        for (let i = 1; i <= total; i++) {
            if (i === 1 || i === total || (i >= current - 2 && i <= current + 2)) {
                html += `
                    <li class="page-item ${i === current ? 'active' : ''}">
                        <a class="page-link" href="#" onclick="notificationManager.goToPage(${i}); return false;">
                            ${i}
                        </a>
                    </li>
                `;
            } else if (i === current - 3 || i === current + 3) {
                html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
            }
        }

        // Next button
        html += `
            <li class="page-item ${current === total ? 'disabled' : ''}">
                <a class="page-link" href="#" onclick="notificationManager.goToPage(${current + 1}); return false;">
                    <i class="bi bi-chevron-right"></i>
                </a>
            </li>
        `;

        nav.innerHTML = html;
    }

    goToPage(page) {
        this.currentPage = page;
        this.loadNotifications();
    }

    async resendMessage(messageId) {
        try {
            const response = await fetch(`/whatsapp/api/messages/${messageId}/retry`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const result = await response.json();

            if (result.success) {
                this.showSuccess('Pesan berhasil diantrekan ulang');
                this.loadNotifications();
                this.loadStatistics();
            } else {
                this.showError(result.error || 'Gagal mengirim ulang pesan');
            }
        } catch (error) {
            console.error('Error resending message:', error);
            this.showError('Terjadi kesalahan saat mengirim ulang pesan');
        }
    }

    async deleteMessage(messageId) {
        if (!confirm('Apakah Anda yakin ingin menghapus pesan ini?')) return;

        try {
            const response = await fetch(`/whatsapp/api/messages/${messageId}`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (result.success) {
                this.showSuccess('Pesan berhasil dihapus');
                this.loadNotifications();
                this.loadStatistics();
            } else {
                this.showError(result.error || 'Gagal menghapus pesan');
            }
        } catch (error) {
            console.error('Error deleting message:', error);
            this.showError('Terjadi kesalahan saat menghapus pesan');
        }
    }

    showTestModal() {
        const modal = new bootstrap.Modal(document.getElementById('testNotificationModal'));

        // Reset form
        const form = document.getElementById('testNotificationForm');
        if (form) form.reset();

        // Load WhatsApp templates
        this.loadTemplates();

        // Set default message type to direct
        this.toggleMessageType('direct');

        modal.show();
    }

    async loadTemplates() {
        try {
            const response = await fetch('/whatsapp/templates');
            if (!response.ok) throw new Error('Failed to load templates');

            const data = await response.json();
            const templateSelect = document.getElementById('testNotificationTemplate');

            if (templateSelect) {
                templateSelect.innerHTML = '<option value="">Select Template</option>';

                if (data.templates && data.templates.length > 0) {
                    data.templates.forEach(template => {
                        if (template.is_active) {
                            const option = document.createElement('option');
                            option.value = template.id;
                            option.textContent = `${template.name} (${template.type})`;
                            templateSelect.appendChild(option);
                        }
                    });
                }
            }
        } catch (error) {
            console.error('Error loading templates:', error);
        }
    }

    toggleMessageType(type) {
        const directContainer = document.getElementById('directMessageContainer');
        const templateContainer = document.getElementById('templateMessageContainer');
        const directMessage = document.getElementById('testNotificationMessage');
        const templateSelect = document.getElementById('testNotificationTemplate');

        if (type === 'direct') {
            directContainer?.classList.remove('d-none');
            templateContainer?.classList.add('d-none');
            if (directMessage) directMessage.required = true;
            if (templateSelect) templateSelect.required = false;
        } else {
            directContainer?.classList.add('d-none');
            templateContainer?.classList.remove('d-none');
            if (directMessage) directMessage.required = false;
            if (templateSelect) templateSelect.required = true;
        }
    }

    async sendTestNotification() {
        const messageType = document.querySelector('input[name="messageType"]:checked')?.value;
        const recipient = document.getElementById('testNotificationRecipient')?.value;

        let data = {
            to: recipient,
            priority: 'normal',
            test_phone: recipient // Mark as test message
        };

        if (messageType === 'direct') {
            const message = document.getElementById('testNotificationMessage')?.value;
            if (!message) {
                this.showError('Please enter a message');
                return;
            }
            data.test_message = message;
        } else {
            const templateId = document.getElementById('testNotificationTemplate')?.value;
            if (!templateId) {
                this.showError('Please select a template');
                return;
            }
            data.template_id = parseInt(templateId);
            data.template_variables = {
                customer_name: 'Test Customer',
                test_mode: true
            };
        }

        if (!recipient) {
            this.showError('Please enter a WhatsApp number');
            return;
        }

        // Show loading state
        const sendBtn = document.getElementById('sendTestNotificationBtn');
        const originalHtml = sendBtn.innerHTML;
        sendBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Sending...';
        sendBtn.disabled = true;

        try {
            const response = await fetch('/notifications/test', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (result.success) {
                this.showSuccess(`Test WhatsApp ${messageType === 'direct' ? 'message' : 'template'} sent successfully to ${recipient}`);
                bootstrap.Modal.getInstance(document.getElementById('testNotificationModal')).hide();
                this.loadStatistics();
                this.loadNotifications();
            } else {
                this.showError(result.error || 'Failed to send test WhatsApp');
            }
        } catch (error) {
            console.error('Error sending test notification:', error);
            this.showError('An error occurred while sending test WhatsApp');
        } finally {
            // Restore button state
            sendBtn.innerHTML = originalHtml;
            sendBtn.disabled = false;
        }
    }

    showWhatsAppSettings() {
        // Redirect to WhatsApp settings page
        window.location.href = '/whatsapp/settings';
    }

    async saveSettings() {
        // Settings are now handled in WhatsApp settings page
        this.showSuccess('Pengaturan notifikasi telah dipindahkan ke halaman WhatsApp Settings');
        setTimeout(() => {
            window.location.href = '/whatsapp/settings';
        }, 1500);
    }

    refreshAll() {
        this.loadStatistics();
        this.loadNotifications();

        // Show refresh feedback
        const btn = document.getElementById('refreshNotificationsBtn');
        if (btn) {
            const originalHtml = btn.innerHTML;
            btn.innerHTML = '<i class="bi bi-arrow-clockwise"></i> <span class="spinner-border spinner-border-sm"></span>';
            btn.disabled = true;

            setTimeout(() => {
                btn.innerHTML = originalHtml;
                btn.disabled = false;
            }, 1000);
        }
    }

    startAutoRefresh() {
        // Auto-refresh every 30 seconds
        setInterval(() => {
            this.loadStatistics();
        }, 30000);

        // Auto-refresh notifications every 60 seconds
        setInterval(() => {
            this.loadNotifications();
        }, 60000);
    }

    showSuccess(message) {
        this.showToast('success', 'Berhasil', message);
    }

    showError(message) {
        this.showToast('danger', 'Error', message);
    }

    showToast(type, title, message) {
        // Create toast container if it doesn't exist
        let container = document.getElementById('toastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toastContainer';
            container.className = 'toast-container position-fixed top-0 end-0 p-3';
            container.style.zIndex = '9999';
            document.body.appendChild(container);
        }

        const toastId = 'toast-' + Date.now();
        const toastHtml = `
            <div id="${toastId}" class="toast align-items-center text-white bg-${type} border-0" role="alert">
                <div class="d-flex">
                    <div class="toast-body">
                        <strong>${title}</strong><br>
                        ${message}
                    </div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
                </div>
            </div>
        `;

        container.insertAdjacentHTML('beforeend', toastHtml);

        const toastElement = document.getElementById(toastId);
        const toast = new bootstrap.Toast(toastElement, { delay: 5000 });
        toast.show();

        // Remove toast element after it's hidden
        toastElement.addEventListener('hidden.bs.toast', () => {
            toastElement.remove();
        });
    }

    async showQueueModal() {
        const modal = new bootstrap.Modal(document.getElementById('queueModal'));
        modal.show();

        // Load queue data when modal opens
        await this.refreshQueueStatus();
    }

    async refreshQueueStatus() {
        try {
            const response = await fetch('/whatsapp/queue-status');
            if (!response.ok) throw new Error('Failed to load queue status');

            const data = await response.json();
            this.updateQueueModalUI(data);
        } catch (error) {
            console.error('Error loading queue status:', error);
            this.showError('Gagal memuat status antrian');

            // Show error state in modal
            document.getElementById('queueMessagesBody').innerHTML = `
                <tr>
                    <td colspan="6" class="text-center text-danger">
                        <i class="bi bi-exclamation-triangle"></i>
                        Gagal memuat data antrian
                    </td>
                </tr>
            `;
        }
    }

    updateQueueModalUI(data) {
        // Update statistics
        document.getElementById('queuePendingCount').textContent = data.statistics?.pending || 0;
        document.getElementById('queueSentCount').textContent = data.statistics?.sent || 0;
        document.getElementById('queueFailedCount').textContent = data.statistics?.failed || 0;

        // Update messages table
        const tbody = document.getElementById('queueMessagesBody');
        const emptyState = document.getElementById('queueEmptyState');

        if (!data.pendingMessages || data.pendingMessages.length === 0) {
            tbody.innerHTML = '';
            emptyState.style.display = 'block';
        } else {
            emptyState.style.display = 'none';
            tbody.innerHTML = data.pendingMessages.map(message => `
                <tr>
                    <td>#${message.id}</td>
                    <td>${message.recipient}</td>
                    <td>
                        <div class="text-truncate" style="max-width: 200px;" title="${message.message}">
                            ${message.message}
                        </div>
                    </td>
                    <td>${this.getPriorityBadge(message.priority)}</td>
                    <td>${this.getStatusBadge(message.status)}</td>
                    <td>${this.formatDateTime(message.created_at)}</td>
                </tr>
            `).join('');
        }
    }

    getPriorityBadge(priority) {
        const badges = {
            'urgent': '<span class="badge bg-danger">Urgent</span>',
            'high': '<span class="badge bg-warning">High</span>',
            'normal': '<span class="badge bg-info">Normal</span>',
            'low': '<span class="badge bg-secondary">Low</span>',
            'bulk': '<span class="badge bg-primary">Bulk</span>'
        };
        return badges[priority] || `<span class="badge bg-secondary">${priority}</span>`;
    }
}

// Initialize notification manager when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    window.notificationManager = new NotificationManager();
});

// Export for module usage
export default NotificationManager;