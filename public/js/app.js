// Main Application JavaScript
document.addEventListener('DOMContentLoaded', function() {
    'use strict';

    // Global Authentication Helper
    window.AuthHelper = {
        // Get authentication token from cookie
        getToken() {
            const cookies = document.cookie.split(';');
            for (let cookie of cookies) {
                const [name, value] = cookie.trim().split('=');
                if (name === 'token') {
                    return value;
                }
            }
            return null;
        },

        // Get headers for authenticated API requests
        getAuthHeaders() {
            const token = this.getToken();
            const headers = {
                'Content-Type': 'application/json'
            };

            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            return headers;
        },

        // Make authenticated API request
        async fetchAuth(url, options = {}) {
            const token = this.getToken();
            const headers = {
                'Content-Type': 'application/json',
                ...options.headers
            };

            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const response = await fetch(url, {
                ...options,
                headers
            });

            // Handle authentication errors
            if (response.status === 401) {
                window.location.href = '/login';
                return null;
            }

            return response;
        }
    };

    // Theme Management
    const ThemeManager = {
        init() {
            this.loadTheme();
            this.setupEventListeners();
        },

        loadTheme() {
            const savedTheme = localStorage.getItem('theme') || 'light';
            document.documentElement.setAttribute('data-theme', savedTheme);
        },

        setupEventListeners() {
            // Theme toggle functionality can be added here
            const themeToggle = document.getElementById('themeToggle');
            if (themeToggle) {
                themeToggle.addEventListener('click', () => this.toggleTheme());
            }
        },

        toggleTheme() {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'light' ? 'dark' : 'light';

            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);

            // Add transition effect
            document.body.style.transition = 'background-color 0.3s ease';
        }
    };

    // Modal System
    const ModalSystem = {
        modals: {},

        init() {
            this.setupEventListeners();
        },

        setupEventListeners() {
            // Close modals when clicking outside
            document.addEventListener('click', (e) => {
                if (e.target.classList.contains('modal')) {
                    this.close(e.target.id);
                }
            });

            // Close modals with Escape key
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    const openModal = document.querySelector('.modal.show');
                    if (openModal) {
                        this.close(openModal.id);
                    }
                }
            });
        },

        show(modalId) {
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.classList.add('show');
                modal.style.display = 'block';
                document.body.style.overflow = 'hidden';

                // Focus on first focusable element
                const focusable = modal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
                if (focusable) {
                    focusable.focus();
                }
            }
        },

        close(modalId) {
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.classList.remove('show');
                modal.style.display = 'none';
                document.body.style.overflow = '';
            }
        },

        create(title, content, options = {}) {
            const modalId = options.id || 'modal-' + Date.now();
            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.id = modalId;

            modal.innerHTML = `
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">${title}</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            ${content}
                        </div>
                        ${options.footer ? `<div class="modal-footer">${options.footer}</div>` : ''}
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
            this.show(modalId);

            return modalId;
        }
    };

    // Toast Notification System
    const ToastSystem = {
        container: null,
        toasts: [],

        init() {
            this.createContainer();
            this.setupEventListeners();
        },

        createContainer() {
            // Use existing container from template
            this.container = document.getElementById('toastContainer');
            if (!this.container) {
                // Fallback: create container if not found in template
                this.container = document.createElement('div');
                this.container.className = 'toast-container';
                this.container.style.cssText = 'position: fixed; top: 80px; right: 20px; z-index: 1060; max-width: 350px; width: 100%;';
                document.body.appendChild(this.container);
            }
        },

        setupEventListeners() {
            // Auto-remove toasts
            this.container.addEventListener('click', (e) => {
                if (e.target.classList.contains('btn-close')) {
                    const toast = e.target.closest('.toast');
                    this.remove(toast);
                }
            });
        },

        show(title, message, options = {}) {
            const { type = 'info', duration = 5000, icon = null } = options;

            const toast = document.createElement('div');
            toast.className = `toast toast-${type}`;
            toast.setAttribute('role', 'alert');

            const toastId = 'toast-' + Date.now();
            toast.id = toastId;

            // Determine icon based on type if not provided
            const iconClass = icon || this.getDefaultIcon(type);

            toast.innerHTML = `
                <div class="toast-icon">
                    <i class="bi bi-${iconClass}"></i>
                </div>
                <div class="toast-content">
                    <div class="toast-title">${title}</div>
                    <div class="toast-message">${message}</div>
                </div>
                <button type="button" class="toast-close" onclick="document.getElementById('${toastId}').remove()">
                    <i class="bi bi-x"></i>
                </button>
            `;

            this.container.appendChild(toast);
            this.toasts.push(toast);

            // Auto-remove after duration
            if (duration > 0) {
                setTimeout(() => {
                    this.remove(toast);
                }, duration);
            }

            return toastId;
        },

        getDefaultIcon(type) {
            const icons = {
                'success': 'check-circle-fill',
                'error': 'exclamation-triangle-fill',
                'warning': 'exclamation-triangle-fill',
                'info': 'info-circle-fill'
            };
            return icons[type] || icons.info;
        },

        success(title, message, duration) {
            return this.show(title, message, { type: 'success', duration });
        },

        error(title, message, duration) {
            return this.show(title, message, { type: 'error', duration });
        },

        warning(title, message, duration) {
            return this.show(title, message, { type: 'warning', duration });
        },

        info(title, message, duration) {
            return this.show(title, message, { type: 'info', duration });
        },

        remove(toast) {
            if (toast && toast.parentNode) {
                toast.classList.add('hiding');
                setTimeout(() => {
                    if (toast.parentNode) {
                        toast.parentNode.removeChild(toast);
                    }
                    const index = this.toasts.indexOf(toast);
                    if (index > -1) {
                        this.toasts.splice(index, 1);
                    }
                }, 300);
            }
        },

        clear() {
            this.toasts.forEach(toast => this.remove(toast));
        }
    };

    // Status Monitor
    const StatusMonitor = {
        connectionStatus: 'unknown',
        mikrotikStatus: 'unknown',
        notificationCount: 0,

        init() {
            this.setupEventListeners();
            this.startMonitoring();
        },

        setupEventListeners() {
            // Connection status updates can be handled here
        },

        startMonitoring() {
            // Update current time
            this.updateTime();
            setInterval(() => this.updateTime(), 1000);

            // Check Mikrotik connection
            this.checkMikrotikConnection();
            setInterval(() => this.checkMikrotikConnection(), 30000);

            // Notification count is now handled by WhatsAppNotificationManager
            // No need to update legacy notification count
        },

        updateTime() {
            const now = new Date();
            const timeElement = document.getElementById('currentTime');
            if (timeElement) {
                timeElement.textContent = now.toLocaleString('id-ID');
            }
        },

        async checkMikrotikConnection() {
            try {
                const response = await fetch('/api/public/system/connection');
                const data = await response.json();
                const statusElement = document.getElementById('mikrotikStatus');

                if (data.connected) {
                    statusElement.textContent = 'Connected';
                    statusElement.className = 'text-success';
                    this.mikrotikStatus = 'connected';
                } else {
                    statusElement.textContent = 'Disconnected';
                    statusElement.className = 'text-danger';
                    this.mikrotikStatus = 'disconnected';
                }
            } catch (error) {
                const statusElement = document.getElementById('mikrotikStatus');
                if (statusElement) {
                    statusElement.textContent = 'Error';
                    statusElement.className = 'text-danger';
                }
                this.mikrotikStatus = 'error';
            }
        },

  
        updateConnectionStatus(status) {
            this.connectionStatus = status;
            // Update UI if needed
        }
    };

    // Form Handler
    const FormHandler = {
        init() {
            this.setupEventListeners();
        },

        setupEventListeners() {
            // Handle form submissions with HTMX
            document.addEventListener('htmx:afterRequest', (evt) => {
                if (evt.detail.target.form) {
                    this.handleFormResponse(evt);
                }
            });

            // Handle validation errors
            document.addEventListener('htmx:responseError', (evt) => {
                this.handleFormError(evt);
            });
        },

        handleFormResponse(evt) {
            const response = evt.detail.xhr.response;

            try {
                const data = JSON.parse(response);
                if (data.success) {
                    ToastSystem.success(data.message || 'Operasi berhasil');
                    if (data.redirect) {
                        setTimeout(() => {
                            window.location.href = data.redirect;
                        }, 1000);
                    }
                }
            } catch (e) {
                // Not JSON, handle as HTML response
            }
        },

        handleFormError(evt) {
            const error = evt.detail.error;
            ToastSystem.error('Terjadi kesalahan: ' + error);
        },

        validateForm(form) {
            const inputs = form.querySelectorAll('input[required], select[required], textarea[required]');
            let isValid = true;

            inputs.forEach(input => {
                if (!input.value.trim()) {
                    input.classList.add('is-invalid');
                    isValid = false;
                } else {
                    input.classList.remove('is-invalid');
                }
            });

            return isValid;
        },

        resetForm(form) {
            form.reset();
            form.querySelectorAll('.is-invalid').forEach(input => {
                input.classList.remove('is-invalid');
            });
        }
    };

    // HTMX Integration
    const HTMXIntegration = {
        init() {
            this.setupEventListeners();
            this.configureHTMX();
        },

        setupEventListeners() {
            // Show loading indicator
            document.addEventListener('htmx:beforeRequest', (evt) => {
                document.body.style.cursor = 'wait';
                this.showLoadingIndicator(evt.target);
            });

            document.addEventListener('htmx:afterRequest', (evt) => {
                document.body.style.cursor = 'default';
                this.hideLoadingIndicator(evt.target);
            });

            document.addEventListener('htmx:responseError', (evt) => {
                this.hideLoadingIndicator(evt.target);
                ToastSystem.error('Terjadi kesalahan pada permintaan');
            });

            // Handle redirects
            document.addEventListener('htmx:afterSwap', (evt) => {
                const response = evt.detail.xhr.response;
                if (response.includes('window.location.href')) {
                    const match = response.match(/window\.location\.href\s*=\s*["']([^"']+)["']/);
                    if (match) {
                        setTimeout(() => {
                            window.location.href = match[1];
                        }, 100);
                    }
                }
            });
        },

        configureHTMX() {
            // Configure HTMX globally
            if (typeof htmx !== 'undefined') {
                htmx.config.globalViewTransitions = true;
                htmx.config.useTemplateFragments = true;

                // Add CSRF token to all HTMX requests
                htmx.defineExtension('csrf-token', {
                    onEvent: function(name, evt) {
                        if (name === 'htmx:configRequest') {
                            const csrfToken = document.querySelector('meta[name="csrf-token"]');
                            if (csrfToken) {
                                evt.detail.headers['X-CSRF-Token'] = csrfToken.getAttribute('content');
                            }
                        }
                    }
                });
            }
        },

        showLoadingIndicator(element) {
            const indicator = document.createElement('div');
            indicator.className = 'htmx-indicator';
            indicator.innerHTML = '<div class="spinner-border spinner-border-sm me-2"></div>Loading...';
            indicator.style.position = 'absolute';
            indicator.style.top = '50%';
            indicator.style.left = '50%';
            indicator.style.transform = 'translate(-50%, -50%)';

            element.style.position = 'relative';
            element.appendChild(indicator);
        },

        hideLoadingIndicator(element) {
            const indicator = element.querySelector('.htmx-indicator');
            if (indicator) {
                indicator.remove();
            }
        }
    };

    // Event Delegation
    const EventDelegation = {
        init() {
            this.setupEventListeners();
        },

        setupEventListeners() {
            // Handle click events
            document.addEventListener('click', (e) => {
                this.handleClick(e);
            });

            // Handle form events
            document.addEventListener('submit', (e) => {
                this.handleSubmit(e);
            });

            // Handle input events
            document.addEventListener('input', (e) => {
                this.handleInput(e);
            });
        },

        handleClick(e) {
            // Handle delete confirmations
            if (e.target.matches('[data-confirm-delete]')) {
                e.preventDefault();
                const deleteUrl = e.target.href;
                const message = e.target.getAttribute('data-confirm-delete') || 'Apakah Anda yakin ingin menghapus item ini?';

                ModalSystem.create('Konfirmasi Hapus', `
                    <p>${message}</p>
                    <div class="alert alert-warning">
                        <i class="bi bi-exclamation-triangle"></i> Tindakan ini tidak dapat dibatalkan.
                    </div>
                `, {
                    footer: `
                        <button type="button" class="btn btn-secondary modal-close-btn">Batal</button>
                        <button type="button" class="btn btn-danger modal-confirm-delete-btn" data-delete-url="${deleteUrl}">Hapus</button>
                    `
                });
            }

            // Handle modal close buttons
            if (e.target.matches('.modal-close-btn')) {
                e.preventDefault();
                const modal = e.target.closest('.modal');
                if (modal) {
                    ModalSystem.close(modal.id);
                }
            }

            // Handle modal confirm delete buttons
            if (e.target.matches('.modal-confirm-delete-btn')) {
                e.preventDefault();
                const deleteUrl = e.target.dataset.deleteUrl;
                if (deleteUrl) {
                    window.location.href = deleteUrl;
                }
            }

            // Handle modal triggers
            if (e.target.matches('[data-modal]')) {
                e.preventDefault();
                const modalId = e.target.getAttribute('data-modal');
                ModalSystem.show(modalId);
            }

            // Handle toast triggers
            if (e.target.matches('[data-toast]')) {
                e.preventDefault();
                const message = e.target.getAttribute('data-toast');
                const type = e.target.getAttribute('data-toast-type') || 'info';
                ToastSystem.show(message, type);
            }
        },

        handleSubmit(e) {
            const form = e.target;

            // Add client-side validation
            if (!FormHandler.validateForm(form)) {
                e.preventDefault();
                ToastSystem.warning('Silakan lengkapi semua field yang required');
                return;
            }

            // Show loading state
            const submitBtn = form.querySelector('[type="submit"]');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Memproses...';

                // Re-enable after timeout (fallback)
                setTimeout(() => {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = submitBtn.getAttribute('data-original-text') || 'Submit';
                }, 5000);
            }
        },

        handleInput(e) {
            // Handle real-time validation
            const input = e.target;
            if (input.hasAttribute('required') && input.value.trim()) {
                input.classList.remove('is-invalid');
            }

            // Handle input masking if needed
            if (input.hasAttribute('data-mask')) {
                this.applyMask(input);
            }
        },

        applyMask(input) {
            const mask = input.getAttribute('data-mask');
            // Implement masking logic here
        }
    };

    // Cache Management
    const CacheManager = {
        cache: new Map(),
        defaultTTL: 300000, // 5 minutes

        set(key, value, ttl = this.defaultTTL) {
            const item = {
                value,
                expiry: Date.now() + ttl
            };
            this.cache.set(key, item);
        },

        get(key) {
            const item = this.cache.get(key);
            if (!item) return null;

            if (Date.now() > item.expiry) {
                this.cache.delete(key);
                return null;
            }

            return item.value;
        },

        remove(key) {
            this.cache.delete(key);
        },

        clear() {
            this.cache.clear();
        },

        // Cache API responses
        async fetch(url, options = {}) {
            const cacheKey = url + JSON.stringify(options);
            const cached = this.get(cacheKey);

            if (cached && !options.forceRefresh) {
                return cached;
            }

            try {
                const response = await fetch(url, options);
                const data = await response.json();
                this.set(cacheKey, data);
                return data;
            } catch (error) {
                if (cached) {
                    return cached; // Fallback to cached data
                }
                throw error;
            }
        }
    };

    // Utility Functions
    const Utils = {
        formatCurrency(amount) {
            return new Intl.NumberFormat('id-ID', {
                style: 'currency',
                currency: 'IDR'
            }).format(amount);
        },

        formatDate(date) {
            return new Date(date).toLocaleDateString('id-ID', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        },

        formatDateTime(date) {
            return new Date(date).toLocaleString('id-ID');
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
        },

        throttle(func, limit) {
            let inThrottle;
            return function(...args) {
                if (!inThrottle) {
                    func.apply(this, args);
                    inThrottle = true;
                    setTimeout(() => inThrottle = false, limit);
                }
            };
        },

        sanitizeInput(input) {
            const div = document.createElement('div');
            div.textContent = input;
            return div.innerHTML;
        },

        copyToClipboard(text) {
            return navigator.clipboard.writeText(text).then(() => {
                ToastSystem.success('Teks disalin ke clipboard');
            }).catch(() => {
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = text;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                ToastSystem.success('Teks disalin ke clipboard');
            });
        },

        downloadFile(content, filename, contentType = 'text/plain') {
            const blob = new Blob([content], { type: contentType });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }
    };

    // WhatsApp Notification Manager
    const WhatsAppNotificationManager = {
        notifications: [],
        unreadCount: 0,
        isOpen: false,

        init() {
            this.setupEventListeners();
            this.startPolling();
        },

        setupEventListeners() {
            const toggle = document.getElementById('whatsappNotificationToggle');
            const container = document.getElementById('whatsappNotificationContainer');

            if (toggle) {
                toggle.addEventListener('click', () => this.togglePanel());
            }

            // Close panel when clicking outside
            document.addEventListener('click', (e) => {
                if (container && !container.contains(e.target)) {
                    this.closePanel();
                }
            });

            // Mark notifications as read when panel is opened
            const panel = document.getElementById('whatsappNotificationPanel');
            if (panel) {
                panel.addEventListener('transitionend', () => {
                    if (this.isOpen && this.unreadCount > 0) {
                        this.markAllAsRead();
                    }
                });
            }
        },

        togglePanel() {
            const panel = document.getElementById('whatsappNotificationPanel');
            if (!panel) return;

            this.isOpen = !this.isOpen;

            if (this.isOpen) {
                panel.classList.remove('d-none');
                this.refreshNotifications();
            } else {
                panel.classList.add('d-none');
            }
        },

        closePanel() {
            const panel = document.getElementById('whatsappNotificationPanel');
            if (panel) {
                panel.classList.add('d-none');
                this.isOpen = false;
            }
        },

        async startPolling() {
            // Check for new notifications every 30 seconds
            setInterval(() => {
                if (!this.isOpen) {
                    this.checkNewNotifications();
                }
            }, 30000);

            // Initial check
            this.checkNewNotifications();
        },

        async checkNewNotifications() {
            try {
                const response = await AuthHelper.fetchAuth('/api/whatsapp/notifications');
                if (response && response.ok) {
                    const data = await response.json();
                    if (data.notifications) {
                        this.addNotifications(data.notifications);
                    }
                }
            } catch (error) {
                console.error('Error checking WhatsApp notifications:', error);
            }
        },

        async refreshNotifications() {
            try {
                const response = await AuthHelper.fetchAuth('/api/whatsapp/notifications?all=true');
                if (response && response.ok) {
                    const data = await response.json();
                    if (data.notifications) {
                        this.notifications = data.notifications;
                        this.renderNotifications();
                        this.updateBadge();
                    }
                }
            } catch (error) {
                console.error('Error refreshing WhatsApp notifications:', error);
            }
        },

        addNotifications(newNotifications) {
            // Add only new notifications (avoid duplicates)
            const existingIds = this.notifications.map(n => n.id);
            const trulyNew = newNotifications.filter(n => !existingIds.includes(n.id));

            if (trulyNew.length > 0) {
                this.notifications.unshift(...trulyNew);
                this.unreadCount += trulyNew.length;
                this.updateBadge();

                // Show toast for new notifications
                trulyNew.forEach(notification => {
                    this.showNotificationToast(notification);
                });
            }
        },

        updateBadge() {
            const badge = document.getElementById('whatsappNotificationBadge');
            if (badge) {
                if (this.unreadCount > 0) {
                    badge.textContent = this.unreadCount > 99 ? '99+' : this.unreadCount;
                    badge.classList.remove('d-none');
                } else {
                    badge.classList.add('d-none');
                }
            }
        },

        renderNotifications() {
            const list = document.getElementById('whatsappNotificationList');
            if (!list) return;

            if (this.notifications.length === 0) {
                list.innerHTML = `
                    <div class="whatsapp-notification-empty">
                        <i class="bi bi-bell-slash"></i>
                        <p class="mb-0">Tidak ada notifikasi</p>
                        <small>Semua notifikasi WhatsApp akan muncul di sini</small>
                    </div>
                `;
                return;
            }

            list.innerHTML = this.notifications.map(notification => `
                <div class="whatsapp-notification-item ${notification.read ? '' : 'unread'}"
                     onclick="window.whatsAppNotificationManager.handleNotificationClick(${notification.id})">
                    <div class="whatsapp-notification-icon">
                        <i class="bi bi-${this.getNotificationIcon(notification.type)}"></i>
                    </div>
                    <div class="whatsapp-notification-content">
                        <div class="whatsapp-notification-title">${notification.title}</div>
                        <div class="whatsapp-notification-message">${notification.message}</div>
                        <div class="whatsapp-notification-time">${this.formatTime(notification.timestamp)}</div>
                    </div>
                </div>
            `).join('');
        },

        getNotificationIcon(type) {
            const icons = {
                'message_sent': 'send-check',
                'message_received': 'receive',
                'connection': 'wifi',
                'error': 'exclamation-triangle',
                'success': 'check-circle',
                'voucher': 'ticket',
                'payment': 'credit-card',
                'expiry': 'clock',
                'default': 'bell'
            };
            return icons[type] || icons.default;
        },

        formatTime(timestamp) {
            const date = new Date(timestamp);
            const now = new Date();
            const diff = now - date;

            if (diff < 60000) { // Less than 1 minute
                return 'Baru saja';
            } else if (diff < 3600000) { // Less than 1 hour
                return `${Math.floor(diff / 60000)} menit lalu`;
            } else if (diff < 86400000) { // Less than 1 day
                return `${Math.floor(diff / 3600000)} jam lalu`;
            } else {
                return date.toLocaleDateString('id-ID', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            }
        },

        async handleNotificationClick(notificationId) {
            const notification = this.notifications.find(n => n.id === notificationId);
            if (notification && !notification.read) {
                await this.markAsRead(notificationId);
            }

            // Handle notification action if available
            if (notification.actionUrl) {
                window.location.href = notification.actionUrl;
            }
        },

        async markAsRead(notificationId) {
            try {
                await AuthHelper.fetchAuth(`/api/whatsapp/notifications/${notificationId}/read`, {
                    method: 'POST'
                });

                const notification = this.notifications.find(n => n.id === notificationId);
                if (notification) {
                    notification.read = true;
                    this.unreadCount = Math.max(0, this.unreadCount - 1);
                    this.updateBadge();
                    this.renderNotifications();
                }
            } catch (error) {
                console.error('Error marking notification as read:', error);
            }
        },

        async markAllAsRead() {
            try {
                await AuthHelper.fetchAuth('/api/whatsapp/notifications/read-all', {
                    method: 'POST'
                });

                this.notifications.forEach(n => n.read = true);
                this.unreadCount = 0;
                this.updateBadge();
                this.renderNotifications();
            } catch (error) {
                console.error('Error marking all notifications as read:', error);
            }
        },

        showNotificationToast(notification) {
            const toast = ToastSystem.show(`${notification.title}`, notification.message, {
                type: 'success',
                duration: 5000,
                icon: this.getNotificationIcon(notification.type)
            });
        },

        // Public method to add notification from external sources
        addNotification(title, message, type = 'default', actionUrl = null) {
            const notification = {
                id: Date.now(),
                title,
                message,
                type,
                actionUrl,
                timestamp: new Date().toISOString(),
                read: false
            };

            this.addNotifications([notification]);
        }
    };

    // Initialize all components
    function initializeApp() {
        ThemeManager.init();
        ModalSystem.init();
        ToastSystem.init();
        StatusMonitor.init();
        FormHandler.init();
        HTMXIntegration.init();
        EventDelegation.init();
        WhatsAppNotificationManager.init();

        // Make utilities available globally
        window.ToastSystem = ToastSystem;
        window.ModalSystem = ModalSystem;
        window.Utils = Utils;
        window.CacheManager = CacheManager;

        // Auto-hide alerts after 5 seconds
        setTimeout(() => {
            const alerts = document.querySelectorAll('.alert:not(.alert-persistent)');
            alerts.forEach(alert => {
                const bsAlert = new bootstrap.Alert(alert);
                bsAlert.close();
            });
        }, 5000);

        console.log('Mikrotik Billing System initialized successfully');
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeApp);
    } else {
        initializeApp();
    }

  
    // Global functions for backward compatibility
    window.showModal = ModalSystem.show.bind(ModalSystem);
    window.hideModal = ModalSystem.close.bind(ModalSystem);
    window.showToast = ToastSystem.show.bind(ToastSystem);
    window.formatCurrency = Utils.formatCurrency.bind(Utils);
    window.formatDate = Utils.formatDate.bind(Utils);
    window.copyToClipboard = Utils.copyToClipboard.bind(Utils);

    // WhatsApp notification global function
    window.toggleWhatsAppNotifications = () => WhatsAppNotificationManager.togglePanel();
    window.whatsAppNotificationManager = WhatsAppNotificationManager;
});

// Global confirm delete function
function confirmDelete(url) {
    if (url) {
        window.location.href = url;
    }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ThemeManager,
        ModalSystem,
        ToastSystem,
        StatusMonitor,
        FormHandler,
        HTMXIntegration,
        EventDelegation,
        CacheManager,
        Utils
    };
}