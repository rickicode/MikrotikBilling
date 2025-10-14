/**
 * Mikrotik Billing System - Main JavaScript Utilities
 * Core utilities for HTMX integration, theme management, and common functionality
 */

// Configuration
const CONFIG = {
    API_BASE_URL: '/api',
    HTMX_TIMEOUT: 10000,
    TOAST_DURATION: 3000,
    DEBOUNCE_DELAY: 300,
    CACHE_TTL: 300000, // 5 minutes
    THEME_STORAGE_KEY: 'mikrotik_billing_theme'
};

// Theme Management System
class ThemeManager {
    constructor() {
        this.currentTheme = localStorage.getItem(CONFIG.THEME_STORAGE_KEY) || 'light';
        this.initializeTheme();
    }

    initializeTheme() {
        this.applyTheme(this.currentTheme);
        this.setupThemeToggle();
    }

    applyTheme(theme) {
        document.documentElement.setAttribute('data-bs-theme', theme);
        this.currentTheme = theme;
        localStorage.setItem(CONFIG.THEME_STORAGE_KEY, theme);

        // Update theme toggle button
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.innerHTML = theme === 'light'
                ? '<i class="bi bi-moon-stars"></i>'
                : '<i class="bi bi-sun"></i>';
        }
    }

    setupThemeToggle() {
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => {
                const newTheme = this.currentTheme === 'light' ? 'dark' : 'light';
                this.applyTheme(newTheme);
            });
        }
    }

    toggleTheme() {
        const newTheme = this.currentTheme === 'light' ? 'dark' : 'light';
        this.applyTheme(newTheme);
    }
}

// Toast Notification System (Tailwind CSS Only)
class ToastSystem {
    constructor() {
        this.container = this.createContainer();
        this.queue = [];
        this.isShowing = false;
    }

    createContainer() {
        let container = document.getElementById('toastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toastContainer';
            container.className = 'fixed top-4 right-4 z-50 space-y-2';
            container.style.zIndex = '9999';
            document.body.appendChild(container);
        }
        return container;
    }

    show(message, type = 'info', duration = CONFIG.TOAST_DURATION) {
        const toast = this.createToast(message, type);
        this.container.appendChild(toast);

        // Custom Tailwind toast animation
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';

        setTimeout(() => {
            toast.style.transition = 'all 0.3s ease-in-out';
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(0)';
        }, 10);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.remove();
                }
            }, 300);
        }, duration);

        return { hide: () => toast.remove() };
    }

    createToast(message, type) {
        const toastId = 'toast-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        const toast = document.createElement('div');
        toast.id = toastId;
        toast.className = this.getTailwindClasses(type);
        toast.setAttribute('role', 'alert');

        const icon = this.getIcon(type);
        toast.innerHTML = `
            <div class="flex items-center p-4">
                <div class="flex-shrink-0">
                    ${icon}
                </div>
                <div class="ml-3 flex-1">
                    <p class="text-sm font-medium text-white">${message}</p>
                </div>
                <div class="ml-4 flex-shrink-0">
                    <button onclick="this.parentElement.parentElement.remove()" class="inline-flex text-white hover:text-gray-200 focus:outline-none transition-colors">
                        <svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            </div>
        `;

        return toast;
    }

    getTailwindClasses(type) {
        const classes = {
            success: 'bg-green-600 border border-green-400 rounded-lg shadow-lg min-w-[300px] max-w-md',
            error: 'bg-red-600 border border-red-400 rounded-lg shadow-lg min-w-[300px] max-w-md',
            warning: 'bg-yellow-600 border border-yellow-400 rounded-lg shadow-lg min-w-[300px] max-w-md',
            info: 'bg-blue-600 border border-blue-400 rounded-lg shadow-lg min-w-[300px] max-w-md',
            danger: 'bg-red-600 border border-red-400 rounded-lg shadow-lg min-w-[300px] max-w-md'
        };
        return classes[type] || classes.info;
    }

    getIcon(type) {
        const icons = {
            success: '<svg class="h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>',
            error: '<svg class="h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>',
            warning: '<svg class="h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.314 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>',
            info: '<svg class="h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>',
            danger: '<svg class="h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>'
        };
        return icons[type] || icons.info;
    }

    success(message, duration) {
        return this.show(message, 'success', duration);
    }

    error(message, duration) {
        return this.show(message, 'error', duration);
    }

    warning(message, duration) {
        return this.show(message, 'warning', duration);
    }

    info(message, duration) {
        return this.show(message, 'info', duration);
    }
}

// Modal System
class ModalSystem {
    static show(modalId, options = {}) {
        const modalElement = document.getElementById(modalId);
        if (!modalElement) {
            console.error(`Modal with id '${modalId}' not found`);
            return null;
        }

        const modal = new bootstrap.Modal(modalElement, options);
        modal.show();
        return modal;
    }

    static hide(modalId) {
        const modalElement = document.getElementById(modalId);
        if (!modalElement) return;

        const modal = bootstrap.Modal.getInstance(modalElement);
        if (modal) {
            modal.hide();
        }
    }

    static confirm(title, message, onConfirm, onCancel) {
        const modalId = 'confirmModal';
        let modal = document.getElementById(modalId);

        if (!modal) {
            modal = document.createElement('div');
            modal.id = modalId;
            modal.className = 'modal fade';
            modal.innerHTML = `
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">${title}</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            ${message}
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" id="confirmBtn">Confirm</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        const confirmBtn = modal.querySelector('#confirmBtn');
        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

        newConfirmBtn.addEventListener('click', () => {
            if (onConfirm) onConfirm();
            bootstrap.Modal.getInstance(modal).hide();
        });

        modal.addEventListener('hidden.bs.modal', () => {
            if (onCancel) onCancel();
        });

        return this.show(modalId);
    }
}

// Loading State Manager
class LoadingManager {
    constructor() {
        this.indicators = new Map();
    }

    show(elementId, message = 'Loading...') {
        const element = document.getElementById(elementId);
        if (!element) return;

        const originalContent = element.innerHTML;
        this.indicators.set(elementId, originalContent);

        element.innerHTML = `
            <div class="d-flex justify-content-center align-items-center">
                <div class="spinner-border spinner-border-sm me-2" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                ${message}
            </div>
        `;
        element.disabled = true;
    }

    hide(elementId) {
        const element = document.getElementById(elementId);
        if (!element) return;

        const originalContent = this.indicators.get(elementId);
        if (originalContent) {
            element.innerHTML = originalContent;
            this.indicators.delete(elementId);
        }
        element.disabled = false;
    }

    showGlobal(message = 'Loading...') {
        this.show('globalLoading', message);
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.style.display = 'flex';
        }
    }

    hideGlobal() {
        this.hide('globalLoading');
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    }
}

// API Client with caching and error handling
class APIClient {
    constructor(baseURL = CONFIG.API_BASE_URL) {
        this.baseURL = baseURL;
        this.cache = new Map();
        this.defaultHeaders = {
            'Content-Type': 'application/json'
        };
    }

    async request(endpoint, options = {}) {
        const url = this.baseURL + endpoint;
        const cacheKey = options.method ? `${options.method}:${url}` : `GET:${url}`;

        // Check cache for GET requests
        if (!options.method || options.method.toUpperCase() === 'GET') {
            const cached = this.cache.get(cacheKey);
            if (cached && !this.isExpired(cached)) {
                return cached.data;
            }
        }

        const config = {
            headers: { ...this.defaultHeaders, ...(options.headers || {}) },
            ...options
        };

        try {
            const response = await fetch(url, config);

            if (!response.ok) {
                const error = await response.json().catch(() => ({ message: 'Network error' }));
                throw new Error(error.message || `HTTP ${response.status}`);
            }

            const data = await response.json();

            // Cache successful GET requests
            if (!options.method || options.method.toUpperCase() === 'GET') {
                this.cache.set(cacheKey, {
                    data,
                    timestamp: Date.now()
                });
            }

            return data;
        } catch (error) {
            console.error(`API request failed: ${url}`, error);
            throw error;
        }
    }

    async get(endpoint, params = {}) {
        const url = new URL(endpoint, window.location.origin);
        Object.keys(params).forEach(key => {
            if (params[key] !== undefined && params[key] !== null) {
                url.searchParams.append(key, params[key]);
            }
        });

        return this.request(url.pathname + url.search, { method: 'GET' });
    }

    async post(endpoint, data = {}) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    async put(endpoint, data = {}) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    async delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    }

    isExpired(cachedItem) {
        return Date.now() - cachedItem.timestamp > CONFIG.CACHE_TTL;
    }

    clearCache() {
        this.cache.clear();
    }
}

// Form Validation and Handler
class FormHandler {
    constructor(formId, options = {}) {
        this.form = document.getElementById(formId);
        this.options = {
            validateOnBlur: true,
            showErrors: true,
            ...options
        };

        if (this.form) {
            this.initialize();
        }
    }

    initialize() {
        this.form.addEventListener('submit', this.handleSubmit.bind(this));

        if (this.options.validateOnBlur) {
            this.form.querySelectorAll('input, select, textarea').forEach(field => {
                field.addEventListener('blur', () => this.validateField(field));
            });
        }
    }

    handleSubmit(e) {
        e.preventDefault();

        if (this.validate()) {
            this.onSubmit();
        }
    }

    validate() {
        let isValid = true;
        const fields = this.form.querySelectorAll('input, select, textarea');

        fields.forEach(field => {
            if (!this.validateField(field)) {
                isValid = false;
            }
        });

        return isValid;
    }

    validateField(field) {
        const value = field.value.trim();
        let isValid = true;
        let errorMessage = '';

        // Required validation
        if (field.hasAttribute('required') && !value) {
            isValid = false;
            errorMessage = 'This field is required';
        }

        // Pattern validation
        if (value && field.pattern) {
            const pattern = new RegExp(field.pattern);
            if (!pattern.test(value)) {
                isValid = false;
                errorMessage = field.title || 'Invalid format';
            }
        }

        // Min/Max length validation
        if (value) {
            if (field.minLength && value.length < parseInt(field.minLength)) {
                isValid = false;
                errorMessage = `Minimum ${field.minLength} characters required`;
            }

            if (field.maxLength && value.length > parseInt(field.maxLength)) {
                isValid = false;
                errorMessage = `Maximum ${field.maxLength} characters allowed`;
            }
        }

        // Email validation
        if (value && field.type === 'email') {
            const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailPattern.test(value)) {
                isValid = false;
                errorMessage = 'Invalid email address';
            }
        }

        this.showFieldError(field, isValid, errorMessage);
        return isValid;
    }

    showFieldError(field, isValid, errorMessage) {
        const feedback = field.nextElementSibling;
        const isFeedback = feedback && feedback.classList.contains('invalid-feedback');

        if (!isValid) {
            field.classList.add('is-invalid');
            if (isFeedback) {
                feedback.textContent = errorMessage;
            }
        } else {
            field.classList.remove('is-invalid');
            if (isFeedback) {
                feedback.textContent = '';
            }
        }
    }

    onSubmit() {
        const formData = new FormData(this.form);
        const data = Object.fromEntries(formData.entries());

        if (this.options.onSubmit) {
            this.options.onSubmit(data);
        }
    }

    reset() {
        this.form.reset();
        this.form.querySelectorAll('.is-invalid').forEach(field => {
            field.classList.remove('is-invalid');
        });
    }
}

// Utility Functions
const Utils = {
    // Debounce function for performance optimization
    debounce(func, wait = CONFIG.DEBOUNCE_DELAY) {
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

    // Throttle function for rate limiting
    throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    // Format currency for Indonesian Rupiah
    formatCurrency(amount) {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0
        }).format(amount);
    },

    // Format date for Indonesian locale
    formatDate(dateString, options = {}) {
        const date = new Date(dateString);
        const defaultOptions = {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        };
        return date.toLocaleDateString('id-ID', { ...defaultOptions, ...options });
    },

    // Format date and time
    formatDateTime(dateString) {
        return this.formatDate(dateString, {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    // Format file size
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    // Generate random string
    generateRandomString(length = 8) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    },

    // Copy to clipboard
    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                return true;
            } catch (err) {
                console.error('Failed to copy to clipboard:', err);
                return false;
            } finally {
                document.body.removeChild(textArea);
            }
        }
    },

    // Check if element is in viewport
    isInViewport(element) {
        const rect = element.getBoundingClientRect();
        return (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth)
        );
    },

    // Scroll to element
    scrollToElement(element, behavior = 'smooth') {
        if (typeof element === 'string') {
            element = document.querySelector(element);
        }
        if (element) {
            element.scrollIntoView({ behavior, block: 'start' });
        }
    },

    // Parse URL parameters
    getUrlParams() {
        const params = {};
        const urlParams = new URLSearchParams(window.location.search);
        for (const [key, value] of urlParams) {
            params[key] = value;
        }
        return params;
    },

    // Update URL parameters without reloading
    updateUrlParams(params) {
        const url = new URL(window.location);
        Object.keys(params).forEach(key => {
            if (params[key] === null || params[key] === undefined) {
                url.searchParams.delete(key);
            } else {
                url.searchParams.set(key, params[key]);
            }
        });
        window.history.pushState({}, '', url);
    }
};

// HTMX Extensions and Enhancements
class HTMXExtensions {
    static init() {
        this.setupGlobalEventListeners();
        this.setupLoadingIndicators();
        this.setupErrorHandling();
    }

    static setupGlobalEventListeners() {
        // Handle all HTMX requests
        document.addEventListener('htmx:beforeRequest', (evt) => {
            console.log('HTMX request:', evt.detail.target);
        });

        // Handle successful responses
        document.addEventListener('htmx:afterRequest', (evt) => {
            if (evt.detail.successful) {
                console.log('HTMX request successful');
            }
        });

        // Handle errors
        document.addEventListener('htmx:responseError', (evt) => {
            console.error('HTMX error:', evt.detail);
            window.toastSystem.error('Request failed. Please try again.');
        });

        // Handle swap errors
        document.addEventListener('htmx:swapError', (evt) => {
            console.error('HTMX swap error:', evt.detail);
            window.toastSystem.error('Failed to update content.');
        });
    }

    static setupLoadingIndicators() {
        // Show loading state for all HTMX requests
        document.addEventListener('htmx:beforeRequest', (evt) => {
            const target = evt.detail.target;
            if (target && target.id) {
                window.loadingManager.show(target.id + '-loading');
            }
        });

        document.addEventListener('htmx:afterRequest', (evt) => {
            const target = evt.detail.target;
            if (target && target.id) {
                window.loadingManager.hide(target.id + '-loading');
            }
        });
    }

    static setupErrorHandling() {
        // Global error handler for HTMX
        document.addEventListener('htmx:configRequest', (evt) => {
            // Add CSRF token if available
            const csrfToken = document.querySelector('meta[name="csrf-token"]');
            if (csrfToken) {
                evt.detail.headers['X-CSRF-Token'] = csrfToken.getAttribute('content');
            }
        });
    }
}

// Performance Optimizations
class PerformanceOptimizer {
    constructor() {
        this.observers = new Map();
        this.init();
    }

    init() {
        this.setupIntersectionObserver();
        this.setupLazyLoading();
        this.setupImageOptimization();
    }

    setupIntersectionObserver() {
        this.observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    this.loadElement(entry.target);
                    this.observer.unobserve(entry.target);
                }
            });
        }, {
            rootMargin: '50px 0px'
        });
    }

    setupLazyLoading() {
        // Lazy load images
        document.querySelectorAll('img[data-src]').forEach(img => {
            this.observer.observe(img);
        });

        // Lazy load iframes
        document.querySelectorAll('iframe[data-src]').forEach(iframe => {
            this.observer.observe(iframe);
        });
    }

    setupImageOptimization() {
        // Add loading="lazy" to all images
        document.querySelectorAll('img:not([loading])').forEach(img => {
            img.loading = 'lazy';
        });
    }

    loadElement(element) {
        if (element.dataset.src) {
            element.src = element.dataset.src;
            element.removeAttribute('data-src');
        }
    }

    observe(element, callback) {
        this.observer.observe(element);
        if (callback) {
            this.observers.set(element, callback);
        }
    }
}

// Initialize global objects when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Initialize core systems
    window.themeManager = new ThemeManager();
    window.toastSystem = new ToastSystem();
    window.loadingManager = new LoadingManager();
    window.apiClient = new APIClient();
    window.performanceOptimizer = new PerformanceOptimizer();

    // Initialize HTMX extensions
    HTMXExtensions.init();

    // Setup global utility functions
    window.utils = Utils;
    window.ModalSystem = ModalSystem;
    window.FormHandler = FormHandler;

    // Initialize tooltips
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });

    // Initialize popovers
    const popoverTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="popover"]'));
    popoverTriggerList.map(function (popoverTriggerEl) {
        return new bootstrap.Popover(popoverTriggerEl);
    });

    // Setup auto-refresh for real-time data
    setupAutoRefresh();

    // Setup keyboard shortcuts
    setupKeyboardShortcuts();

    console.log('Mikrotik Billing System initialized successfully');
});

// Auto-refresh functionality
function setupAutoRefresh() {
    const autoRefreshElements = document.querySelectorAll('[data-auto-refresh]');

    autoRefreshElements.forEach(element => {
        const interval = parseInt(element.dataset.autoRefresh) || 30000;

        setInterval(() => {
            if (document.visibilityState === 'visible') {
                if (element.tagName === 'TABLE') {
                    htmx.ajax('GET', element.dataset.src || window.location.href, {
                        target: element,
                        swap: 'innerHTML'
                    });
                }
            }
        }, interval);
    });
}

// Keyboard shortcuts
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + K for search
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            const searchInput = document.querySelector('input[type="search"], #searchInput');
            if (searchInput) {
                searchInput.focus();
                searchInput.select();
            }
        }

        // Escape to close modals
        if (e.key === 'Escape') {
            const openModal = document.querySelector('.modal.show');
            if (openModal) {
                const modal = bootstrap.Modal.getInstance(openModal);
                if (modal) modal.hide();
            }
        }

        // Ctrl/Cmd + S to save forms
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            const form = document.querySelector('form');
            if (form) {
                form.dispatchEvent(new Event('submit'));
            }
        }
    });
}

// Mikrotik Status Monitor
class MikrotikStatusMonitor {
    constructor() {
        this.statusCheckInterval = null;
        this.isMonitoring = false;
        this.init();
    }

    init() {
        // Start monitoring if we're on settings page
        if (document.getElementById('mikrotik-tab')) {
            this.startMonitoring();
        }
    }

    startMonitoring() {
        if (this.isMonitoring) return;
        
        this.isMonitoring = true;
        console.log('🔍 Starting Mikrotik status monitoring...');
        
        // Check status immediately
        this.checkStatus();
        
        // Then check every 30 seconds
        this.statusCheckInterval = setInterval(() => {
            this.checkStatus();
        }, 30000);
    }

    stopMonitoring() {
        if (this.statusCheckInterval) {
            clearInterval(this.statusCheckInterval);
            this.statusCheckInterval = null;
        }
        this.isMonitoring = false;
        console.log('⏹️ Stopped Mikrotik status monitoring');
    }

    async checkStatus() {
        try {
            const response = await fetch('/refresh-mikrotik-status', {
                method: 'POST',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });

            if (response.ok) {
                const result = await response.json();
                this.updateStatusUI(result.details || { connected: false });
            } else {
                this.updateStatusUI({ connected: false, error: 'Request failed' });
            }
        } catch (error) {
            console.warn('Could not check Mikrotik status:', error.message);
            this.updateStatusUI({ connected: false, error: 'Network error' });
        }
    }

    updateStatusUI(details) {
        // Update header status indicator
        const statusIndicator = document.querySelector('.mikrotik-status-indicator');
        if (statusIndicator) {
            // Remove all status classes
            statusIndicator.classList.remove('status-connected', 'status-disconnected', 'status-checking');
            
            if (details.connected) {
                statusIndicator.classList.add('status-connected');
                statusIndicator.textContent = 'Connected';
            } else {
                statusIndicator.classList.add('status-disconnected');
                statusIndicator.textContent = 'Disconnected';
            }
        }

        // Update global status indicator (if exists)
        const globalStatus = document.querySelector('[data-mikrotik-status]');
        if (globalStatus) {
            globalStatus.setAttribute('data-mikrotik-status', details.connected ? 'connected' : 'disconnected');
            globalStatus.textContent = details.connected ? 'Connected' : 'Disconnected';
        }
    }

    // Public method to manually refresh status
    async refreshStatus() {
        await this.checkStatus();
    }
}

// Initialize Mikrotik status monitor
document.addEventListener('DOMContentLoaded', () => {
    window.mikrotikStatusMonitor = new MikrotikStatusMonitor();
});

// Export for ES6 modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ThemeManager,
        ToastSystem,
        ModalSystem,
        LoadingManager,
        APIClient,
        FormHandler,
        Utils,
        HTMXExtensions,
        PerformanceOptimizer,
        MikrotikStatusMonitor
    };
}