/**
 * Global Toast Helper untuk semua halaman
 * Bisa digunakan di mana saja dengan fungsi sederhana
 */

class ToastHelper {
    constructor() {
        this.defaultOptions = {
            duration: 3000,
            position: 'top-right',
            animation: 'slide'
        };
    }

    /**
     * Show toast notification
     * @param {string} message - Pesan yang akan ditampilkan
     * @param {string} type - Jenis toast (success, error, warning, info)
     * @param {Object} options - Opsi tambahan
     */
    show(message, type = 'info', options = {}) {
        const config = { ...this.defaultOptions, ...options };

        // Create toast element
        const toast = document.createElement('div');

        // Set classes untuk warna dan posisi
        const positionClasses = this.getPositionClasses(config.position);
        const colorClasses = this.getColorClasses(type);

        toast.className = `fixed z-50 px-4 py-3 rounded-lg shadow-lg transition-all duration-300 ease-in-out transform translate-x-full ${positionClasses} ${colorClasses}`;

        // Set icon berdasarkan type
        const icon = this.getIcon(type);

        toast.innerHTML = `
            <div class="flex items-center space-x-2">
                <i class="fas ${icon}"></i>
                <span class="font-medium">${message}</span>
                ${config.closable ? '<button type="button" class="ml-3 text-white/80 hover:text-white" onclick="this.parentElement.parentElement.remove()"><i class="fas fa-times"></i></button>' : ''}
            </div>
        `;

        // Add to body
        document.body.appendChild(toast);

        // Animate in
        setTimeout(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(0)';
        }, 10);

        // Auto hide
        if (config.duration > 0) {
            setTimeout(() => {
                this.hide(toast);
            }, config.duration);
        }

        return toast;
    }

    /**
     * Hide specific toast
     * @param {HTMLElement} toast - Toast element yang akan dihide
     */
    hide(toast) {
        if (toast && toast.parentNode) {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.remove();
                }
            }, 300);
        }
    }

    /**
     * Clear all toasts
     */
    clearAll() {
        const toasts = document.querySelectorAll('[data-toast]');
        toasts.forEach(toast => this.hide(toast));
    }

    /**
     * Get position classes
     */
    getPositionClasses(position) {
        const positions = {
            'top-right': 'top-4 right-4',
            'top-left': 'top-4 left-4',
            'top-center': 'top-4 left-1/2 transform -translate-x-1/2',
            'bottom-right': 'bottom-4 right-4',
            'bottom-left': 'bottom-4 left-4',
            'bottom-center': 'bottom-4 left-1/2 transform -translate-x-1/2'
        };
        return positions[position] || positions['top-right'];
    }

    /**
     * Get color classes
     */
    getColorClasses(type) {
        const colors = {
            success: 'bg-green-500 text-white',
            error: 'bg-red-500 text-white',
            warning: 'bg-yellow-500 text-white',
            info: 'bg-blue-500 text-white'
        };
        return colors[type] || colors.info;
    }

    /**
     * Get icon for type
     */
    getIcon(type) {
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };
        return icons[type] || icons.info;
    }

    // Shortcut methods
    success(message, options = {}) {
        return this.show(message, 'success', options);
    }

    error(message, options = {}) {
        return this.show(message, 'error', options);
    }

    warning(message, options = {}) {
        return this.show(message, 'warning', options);
    }

    info(message, options = {}) {
        return this.show(message, 'info', options);
    }
}

// Initialize global toast helper
window.ToastHelper = new ToastHelper();

// Global shortcuts untuk kemudahan
window.showToast = function(message, type, options) {
    return window.ToastHelper.show(message, type, options);
};

window.toast = {
    success: (message, options) => window.ToastHelper.success(message, options),
    error: (message, options) => window.ToastHelper.error(message, options),
    warning: (message, options) => window.ToastHelper.warning(message, options),
    info: (message, options) => window.ToastHelper.info(message, options),
    hide: (toast) => window.ToastHelper.hide(toast),
    clearAll: () => window.ToastHelper.clearAll()
};

// Initialize saat DOM ready
document.addEventListener('DOMContentLoaded', function() {
    // Log untuk debugging
    console.log('Toast Helper initialized - Ready to use!');
    console.log('Usage: showToast("message", "type") or toast.success("message")');
});

// Export untuk module systems (jika diperlukan)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ToastHelper;
}