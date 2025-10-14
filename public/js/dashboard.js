/**
 * Mikrotik Billing System - Dashboard JavaScript
 * Handles dashboard-specific functionality including charts, real-time updates, and statistics
 */

class DashboardManager {
    constructor() {
        this.charts = {};
        this.refreshIntervals = new Map();
        this.currentFilters = {
            period: '7days',
            service: 'all'
        };
        this.init();
    }

    init() {
        this.setupCharts();
        this.loadInitialData();
        this.startRealtimeUpdates();
        this.setupEventListeners();
        this.setupKeyboardShortcuts();
    }

    setupCharts() {
        this.initializeRevenueChart();
        this.initializeServiceChart();
        this.initializeActivityChart();
    }

    initializeRevenueChart() {
        const ctx = document.getElementById('revenueChart');
        if (!ctx) return;

        this.charts.revenue = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Pendapatan',
                    data: [],
                    borderColor: 'rgb(102, 126, 234)',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    tension: 0.1,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                return 'Pendapatan: ' + window.utils.formatCurrency(context.parsed.y);
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: (value) => {
                                return 'Rp ' + value.toLocaleString('id-ID');
                            }
                        }
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                }
            }
        });
    }

    initializeServiceChart() {
        const ctx = document.getElementById('serviceChart');
        if (!ctx) return;

        this.charts.service = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Hotspot', 'PPPoE'],
                datasets: [{
                    data: [0, 0],
                    backgroundColor: [
                        'rgb(16, 185, 129)',
                        'rgb(245, 158, 11)'
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 20,
                            usePointStyle: true
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const label = context.label || '';
                                const value = context.parsed;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = ((value / total) * 100).toFixed(1);
                                return `${label}: ${value} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    initializeActivityChart() {
        const ctx = document.getElementById('activityChart');
        if (!ctx) return;

        this.charts.activity = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'Aktivitas',
                    data: [],
                    backgroundColor: 'rgba(102, 126, 234, 0.8)',
                    borderColor: 'rgb(102, 126, 234)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1
                        }
                    }
                }
            }
        });
    }

    async loadInitialData() {
        try {
            await Promise.all([
                this.loadStatistics(),
                this.loadRevenueData(),
                this.loadServiceData(),
                this.loadRecentActivity(),
                this.loadSystemStatus()
            ]);
        } catch (error) {
            console.error('Error loading initial dashboard data:', error);
            window.toastSystem.error('Failed to load dashboard data');
        }
    }

    async loadStatistics() {
        try {
            const response = await fetch('/api/dashboard/statistics');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            this.updateStatisticsCards(data);
        } catch (error) {
            console.error('Error loading statistics:', error);
        }
    }

    updateStatisticsCards(data) {
        const updates = [
            { id: 'totalCustomers', value: data.total_customers || 0 },
            { id: 'activeHotspot', value: data.active_hotspot || 0 },
            { id: 'activePPPoE', value: data.active_pppoe || 0 },
            { id: 'totalRevenue', value: this.formatCurrency(data.total_revenue || 0) }
        ];

        updates.forEach(({ id, value }) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
                element.classList.add('animate__animated', 'animate__fadeIn');
                setTimeout(() => {
                    element.classList.remove('animate__animated', 'animate__fadeIn');
                }, 1000);
            }
        });
    }

    async loadRevenueData(period = this.currentFilters.period) {
        try {
            const response = await fetch(`/api/dashboard/revenue?period=${period}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            this.updateRevenueChart(data);
        } catch (error) {
            console.error('Error loading revenue data:', error);
        }
    }

    updateRevenueChart(data) {
        const chart = this.charts.revenue;
        if (!chart) return;

        chart.data.labels = data.labels;
        chart.data.datasets[0].data = data.values;
        chart.update('active');
    }

    async loadServiceData() {
        try {
            const response = await fetch('/api/dashboard/service-distribution');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            this.updateServiceChart(data);
        } catch (error) {
            console.error('Error loading service data:', error);
        }
    }

    updateServiceChart(data) {
        const chart = this.charts.service;
        if (!chart) return;

        chart.data.datasets[0].data = [data.hotspot || 0, data.pppoe || 0];
        chart.update('active');
    }

    async loadRecentActivity() {
        try {
            const response = await fetch('/api/dashboard/recent-activity');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const activities = await response.json();
            this.updateActivityTable(activities);
        } catch (error) {
            console.error('Error loading recent activity:', error);
        }
    }

    updateActivityTable(activities) {
        const tbody = document.getElementById('activityTableBody');
        if (!tbody) return;

        if (activities.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center text-muted">
                        <i class="bi bi-inbox fs-1 d-block mb-2"></i>
                        Tidak ada aktivitas terbaru
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = activities.map(activity => `
            <tr class="activity-row ${this.getActivityRowClass(activity)}">
                <td>${this.formatDateTime(activity.created_at)}</td>
                <td>${this.getActivityTypeIcon(activity.type)} ${activity.type}</td>
                <td>${activity.username || activity.customer_name || '-'}</td>
                <td>${activity.action}</td>
                <td>${this.getStatusBadge(activity.status)}</td>
            </tr>
        `).join('');

        // Add click handlers for activity rows
        tbody.querySelectorAll('.activity-row').forEach(row => {
            row.addEventListener('click', () => this.showActivityDetails(activities.find(a =>
                a.created_at === row.querySelector('td').textContent
            )));
        });
    }

    getActivityRowClass(activity) {
        const classes = [];
        if (activity.status === 'error') classes.push('table-danger');
        else if (activity.status === 'warning') classes.push('table-warning');
        else if (activity.status === 'success') classes.push('table-success');
        return classes.join(' ');
    }

    getActivityTypeIcon(type) {
        const icons = {
            'voucher': '<i class="bi bi-ticket-perforated text-primary"></i>',
            'pppoe': '<i class="bi bi-ethernet text-warning"></i>',
            'customer': '<i class="bi bi-person text-info"></i>',
            'payment': '<i class="bi bi-currency-dollar text-success"></i>',
            'system': '<i class="bi bi-gear text-secondary"></i>'
        };
        return icons[type] || '<i class="bi bi-circle text-muted"></i>';
    }

    getStatusBadge(status) {
        const badges = {
            'success': '<span class="badge bg-success">Success</span>',
            'warning': '<span class="badge bg-warning">Warning</span>',
            'error': '<span class="badge bg-danger">Error</span>',
            'info': '<span class="badge bg-info">Info</span>'
        };
        return badges[status] || `<span class="badge bg-secondary">${status}</span>`;
    }

    async loadSystemStatus() {
        try {
            const response = await fetch('/api/system/status');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const status = await response.json();
            this.updateSystemStatus(status);
        } catch (error) {
            console.error('Error loading system status:', error);
        }
    }

    updateSystemStatus(status) {
        // Update Mikrotik status
        const mikrotikStatus = document.getElementById('mikrotikStatus');
        if (mikrotikStatus) {
            const mikrotikInfo = status.mikrotik || {};
            let statusHTML = '';
            let statusClass = 'badge bg-';

            if (mikrotikInfo.isOffline) {
                statusHTML = '<i class="bi bi-circle-fill text-warning"></i> Offline';
                statusClass += 'warning';
                // Add tooltip with last error
                if (mikrotikInfo.lastError) {
                    mikrotikStatus.title = `Last error: ${mikrotikInfo.lastError}`;
                }
            } else if (mikrotikInfo.connected) {
                statusHTML = '<i class="bi bi-circle-fill text-success"></i> Connected';
                statusClass += 'success';
                mikrotikStatus.title = 'Mikrotik is connected and online';
            } else {
                statusHTML = '<i class="bi bi-circle-fill text-danger"></i> Disconnected';
                statusClass += 'danger';
                mikrotikStatus.title = 'Mikrotik is disconnected';
            }

            mikrotikStatus.innerHTML = statusHTML;
            mikrotikStatus.className = statusClass;
        }

        // Update database status
        const databaseStatus = document.getElementById('databaseStatus');
        if (databaseStatus) {
            const isHealthy = status.database?.healthy || false;
            databaseStatus.innerHTML = isHealthy
                ? '<i class="bi bi-circle-fill text-success"></i> Healthy'
                : '<i class="bi bi-circle-fill text-danger"></i> Error';
            databaseStatus.className = `badge bg-${isHealthy ? 'success' : 'danger'}`;
        }

        // Update memory usage
        const memoryStatus = document.getElementById('memoryStatus');
        if (memoryStatus && status.system?.memory) {
            const memoryUsage = status.system.memory.usage || 0;
            memoryStatus.textContent = `${memoryUsage}%`;
            memoryStatus.className = `badge bg-${memoryUsage > 80 ? 'danger' : memoryUsage > 60 ? 'warning' : 'info'}`;
        }

        // Update last sync time
        const lastSync = document.getElementById('lastSync');
        if (lastSync && status.system?.last_sync) {
            lastSync.textContent = this.getTimeAgo(new Date(status.system.last_sync));
        }
    }

    startRealtimeUpdates() {
        // Update statistics every 30 seconds
        this.refreshIntervals.set('statistics', setInterval(() => {
            this.loadStatistics();
        }, 30000));

        // Update revenue chart every 5 minutes
        this.refreshIntervals.set('revenue', setInterval(() => {
            this.loadRevenueData();
        }, 300000));

        // Update service distribution every 2 minutes
        this.refreshIntervals.set('service', setInterval(() => {
            this.loadServiceData();
        }, 120000));

        // Update recent activity every 15 seconds
        this.refreshIntervals.set('activity', setInterval(() => {
            this.loadRecentActivity();
        }, 15000));

        // Update system status every 30 seconds
        this.refreshIntervals.set('system', setInterval(() => {
            this.loadSystemStatus();
        }, 30000));

        // Update last sync time every minute
        this.refreshIntervals.set('lastSync', setInterval(() => {
            this.updateLastSyncTime();
        }, 60000));
    }

    setupEventListeners() {
        // Refresh dashboard button
        const refreshBtn = document.getElementById('refreshDashboardBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refreshAll());
        }

        // Quick actions button
        const quickActionsBtn = document.getElementById('showQuickActionsBtn');
        if (quickActionsBtn) {
            quickActionsBtn.addEventListener('click', () => this.showQuickActions());
        }

        // System check button
        const systemCheckBtn = document.getElementById('runSystemCheckBtn');
        if (systemCheckBtn) {
            systemCheckBtn.addEventListener('click', () => this.runSystemCheck());
        }

        // Revenue period links
        document.addEventListener('click', (e) => {
            if (e.target.closest('.revenue-period-link')) {
                e.preventDefault();
                const period = e.target.closest('.revenue-period-link').dataset.period;
                this.currentFilters.period = period;
                this.loadRevenueData(period);
            }
        });

        // Quick action cards
        document.addEventListener('click', (e) => {
            if (e.target.closest('.quick-action-card')) {
                const card = e.target.closest('.quick-action-card');
                const url = card.dataset.url;
                if (url) {
                    window.location.href = url;
                }
            }
        });

        // Period selector
        const periodSelect = document.getElementById('revenuePeriod');
        if (periodSelect) {
            periodSelect.addEventListener('change', (e) => {
                this.currentFilters.period = e.target.value;
                this.loadRevenueData(e.target.value);
            });
        }

        // Service filter
        const serviceFilter = document.getElementById('serviceFilter');
        if (serviceFilter) {
            serviceFilter.addEventListener('change', (e) => {
                this.currentFilters.service = e.target.value;
                this.loadRevenueData(this.currentFilters.period);
            });
        }

        // Handle visibility change for performance
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.stopRealtimeUpdates();
            } else {
                this.startRealtimeUpdates();
            }
        });
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // R to refresh dashboard
            if (e.key === 'r' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                this.refreshAll();
            }

            // 1-4 for quick stats
            if (e.key >= '1' && e.key <= '4') {
                const statIndex = parseInt(e.key) - 1;
                const statElements = ['totalCustomers', 'activeHotspot', 'activePPPoE', 'totalRevenue'];
                const element = document.getElementById(statElements[statIndex]);
                if (element) {
                    element.classList.add('animate__animated', 'animate__pulse');
                    setTimeout(() => {
                        element.classList.remove('animate__animated', 'animate__pulse');
                    }, 1000);
                }
            }
        });
    }

    refreshData(target) {
        switch (target) {
            case 'statistics':
                this.loadStatistics();
                break;
            case 'revenue':
                this.loadRevenueData();
                break;
            case 'service':
                this.loadServiceData();
                break;
            case 'activity':
                this.loadRecentActivity();
                break;
            case 'system':
                this.loadSystemStatus();
                break;
            default:
                this.refreshAll();
        }
    }

    refreshAll() {
        this.showToast('Refreshing dashboard...', 'info');

        Promise.all([
            this.loadStatistics(),
            this.loadRevenueData(),
            this.loadServiceData(),
            this.loadRecentActivity(),
            this.loadSystemStatus()
        ]).then(() => {
            this.showToast('Dashboard refreshed successfully', 'success');
        }).catch((error) => {
            console.error('Error refreshing dashboard:', error);
            this.showToast('Error refreshing dashboard', 'danger');
        });
    }

    stopRealtimeUpdates() {
        this.refreshIntervals.forEach((interval) => {
            clearInterval(interval);
        });
        this.refreshIntervals.clear();
    }

    async exportData(format) {
        try {
            const params = {
                format,
                ...this.currentFilters
            };

            const response = await window.apiClient.get('/dashboard/export', params);

            // Create download link
            const blob = new Blob([response.data], {
                type: response.headers['content-type']
            });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `dashboard-export-${new Date().toISOString().split('T')[0]}.${format}`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            window.toastSystem.success(`Dashboard exported as ${format.toUpperCase()}`);
        } catch (error) {
            console.error('Error exporting dashboard data:', error);
            window.toastSystem.error('Failed to export dashboard data');
        }
    }

    executeQuickAction(action) {
        switch (action) {
            case 'create-voucher':
                window.location.href = '/vouchers/create';
                break;
            case 'create-pppoe':
                window.location.href = '/pppoe/create';
                break;
            case 'create-customer':
                window.location.href = '/customers/create';
                break;
            case 'view-reports':
                window.location.href = '/reports';
                break;
            case 'system-check':
                this.runSystemCheck();
                break;
            default:
                console.warn('Unknown quick action:', action);
        }
    }

    showQuickActions() {
        const quickActionsModal = new bootstrap.Modal(document.getElementById('quickActionsModal'));
        quickActionsModal.show();
    }

    async runSystemCheck() {
        try {
            const response = await fetch('/api/system/check');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const result = await response.json();

            if (result.success) {
                this.showToast('System check completed successfully', 'success');
                this.loadSystemStatus();
            } else {
                this.showToast('System check failed', 'danger');
            }
        } catch (error) {
            console.error('Error running system check:', error);
            this.showToast('Failed to run system check', 'danger');
        }
    }

    showToast(message, type = 'info') {
        // Simple toast implementation
        const toastContainer = document.getElementById('toastContainer') || this.createToastContainer();
        const toastId = 'toast-' + Date.now();

        const toastHTML = `
            <div id="${toastId}" class="toast align-items-center text-white bg-${type} border-0" role="alert">
                <div class="d-flex">
                    <div class="toast-body">
                        ${message}
                    </div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
                </div>
            </div>
        `;

        toastContainer.insertAdjacentHTML('beforeend', toastHTML);

        const toastElement = document.getElementById(toastId);
        if (typeof bootstrap !== 'undefined') {
            const toast = new bootstrap.Toast(toastElement, {
                autohide: true,
                delay: 3000
            });
            toast.show();

            toastElement.addEventListener('hidden.bs.toast', () => {
                toastElement.remove();
            });
        } else {
            // Fallback - just remove after timeout
            setTimeout(() => {
                toastElement.remove();
            }, 3000);
        }
    }

    createToastContainer() {
        const container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
        container.style.zIndex = '1055';
        document.body.appendChild(container);
        return container;
    }

    showActivityDetails(activity) {
        if (!activity) return;

        // For now, just log activity details since ModalSystem may not exist
        console.log('Activity details:', activity);
        this.showToast('Activity details logged to console', 'info');
    }

    renderActivityDetails(activity) {
        return `
            <div class="row">
                <div class="col-md-6">
                    <h6>Activity Information</h6>
                    <table class="table table-sm">
                        <tr>
                            <td width="120">Type:</td>
                            <td>${this.getActivityTypeIcon(activity.type)} ${activity.type}</td>
                        </tr>
                        <tr>
                            <td>Action:</td>
                            <td>${activity.action}</td>
                        </tr>
                        <tr>
                            <td>Status:</td>
                            <td>${this.getStatusBadge(activity.status)}</td>
                        </tr>
                        <tr>
                            <td>Time:</td>
                            <td>${this.formatDateTime(activity.created_at)}</td>
                        </tr>
                    </table>
                </div>
                <div class="col-md-6">
                    <h6>User Information</h6>
                    <table class="table table-sm">
                        ${activity.username ? `
                            <tr>
                                <td width="120">Username:</td>
                                <td>${activity.username}</td>
                            </tr>
                        ` : ''}
                        ${activity.customer_name ? `
                            <tr>
                                <td>Customer:</td>
                                <td>${activity.customer_name}</td>
                            </tr>
                        ` : ''}
                        ${activity.ip_address ? `
                            <tr>
                                <td>IP Address:</td>
                                <td>${activity.ip_address}</td>
                            </tr>
                        ` : ''}
                    </table>
                </div>
            </div>
            ${activity.description ? `
                <div class="mt-3">
                    <h6>Description</h6>
                    <p class="text-muted">${activity.description}</p>
                </div>
            ` : ''}
            ${activity.metadata ? `
                <div class="mt-3">
                    <h6>Additional Details</h6>
                    <pre class="bg-light p-3 rounded"><code>${JSON.stringify(activity.metadata, null, 2)}</code></pre>
                </div>
            ` : ''}
        `;
    }

    updateLastSyncTime() {
        const lastSync = document.getElementById('lastSync');
        if (lastSync && lastSync.dataset.timestamp) {
            lastSync.textContent = this.getTimeAgo(new Date(lastSync.dataset.timestamp));
        }
    }

    getTimeAgo(date) {
        const seconds = Math.floor((new Date() - date) / 1000);

        const intervals = {
            tahun: 31536000,
            bulan: 2592000,
            minggu: 604800,
            hari: 86400,
            jam: 3600,
            menit: 60
        };

        for (const [unit, secondsInUnit] of Object.entries(intervals)) {
            const interval = Math.floor(seconds / secondsInUnit);
            if (interval >= 1) {
                return `${interval} ${unit} yang lalu`;
            }
        }

        return 'Baru saja';
    }

    formatCurrency(amount) {
        if (typeof amount !== 'number') {
            amount = parseFloat(amount) || 0;
        }

        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR'
        }).format(amount);
    }

    formatDateTime(dateString) {
        if (!dateString) return '-';

        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '-';

        return date.toLocaleString('id-ID', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    // Cleanup
    destroy() {
        this.stopRealtimeUpdates();

        // Destroy charts
        Object.values(this.charts).forEach(chart => {
            if (chart && typeof chart.destroy === 'function') {
                chart.destroy();
            }
        });
        this.charts = {};
    }
}

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Initialize dashboard if we have dashboard elements on the page
    if (document.getElementById('totalCustomers') || document.querySelector('[data-dashboard]')) {
        window.dashboardManager = new DashboardManager();
    }
});

// Global wrapper functions for onclick handlers
function refreshDashboard() {
    if (window.dashboardManager) {
        window.dashboardManager.refreshAllData();
    }
}

function showQuickActions() {
    if (window.dashboardManager) {
        window.dashboardManager.showQuickActions();
    }
}

function updateRevenueChart(period) {
    if (window.dashboardManager) {
        window.dashboardManager.updateRevenueChart(period);
    }
}

function runSystemCheck() {
    if (window.dashboardManager) {
        window.dashboardManager.runSystemCheck();
    }
}

// Export for ES6 modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DashboardManager;
}