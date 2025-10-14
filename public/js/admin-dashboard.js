// Admin Dashboard JavaScript - Enhanced for Tailwind CSS Dark Theme

// Global variables
let revenueChart = null;
let currentPeriod = 7;

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeDashboard();
});

// Main dashboard initialization
function initializeDashboard() {
    initializeRevenueChart();
    initializeStatCounters();
    initializePeriodSelector();
    initializeQuickActions();
    initializeRealTimeUpdates();
    initializeSystemStatus();
    updateLastUpdateTime();
}

// Initialize revenue chart with dark theme
function initializeRevenueChart() {
    const ctx = document.getElementById('revenueChart');
    if (!ctx) return;

    // Set dark theme for Chart.js
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.borderColor = '#334155';

    revenueChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: generateDateLabels(currentPeriod),
            datasets: [{
                label: 'Pendapatan (Rp)',
                data: generateMockRevenueData(currentPeriod),
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#3b82f6',
                pointBorderColor: '#1e293b',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6
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
                    backgroundColor: '#1e293b',
                    titleColor: '#f1f5f9',
                    bodyColor: '#cbd5e1',
                    borderColor: '#334155',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: false,
                    callbacks: {
                        label: function(context) {
                            return 'Pendapatan: ' + formatCurrency(context.parsed.y);
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: '#334155',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#94a3b8'
                    }
                },
                y: {
                    grid: {
                        color: '#334155',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#94a3b8',
                        callback: function(value) {
                            return formatCurrency(value, true);
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

// Generate date labels for chart
function generateDateLabels(days) {
    const labels = [];
    const today = new Date();

    for (let i = days - 1; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        labels.push(date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }));
    }

    return labels;
}

// Generate mock revenue data for demonstration
function generateMockRevenueData(days) {
    const data = [];
    let baseRevenue = 1000000;

    for (let i = 0; i < days; i++) {
        // Simulate revenue variation
        const variation = (Math.random() - 0.5) * 500000;
        baseRevenue += variation;
        data.push(Math.max(500000, baseRevenue));
    }

    return data;
}

// Initialize stat counters with animation
function initializeStatCounters() {
    const counters = [
        { id: 'totalCustomers', target: 245, current: 0 },
        { id: 'activeSubscriptions', target: 189, current: 0 },
        { id: 'pendingPayments', target: 12, current: 0 }
    ];

    counters.forEach(counter => {
        animateCounter(counter);
    });
}

// Animate counter from 0 to target
function animateCounter(counter) {
    const element = document.getElementById(counter.id);
    if (!element) return;

    const increment = counter.target / 50;
    const timer = setInterval(() => {
        counter.current += increment;
        if (counter.current >= counter.target) {
            counter.current = counter.target;
            clearInterval(timer);
        }
        element.textContent = Math.floor(counter.current).toLocaleString('id-ID');
    }, 30);
}

// Initialize period selector for revenue chart
function initializePeriodSelector() {
    const selector = document.getElementById('chartPeriod');
    if (!selector) return;

    selector.addEventListener('change', function() {
        currentPeriod = parseInt(this.value);
        updateRevenueChart();
    });
}

// Update revenue chart with new period
function updateRevenueChart() {
    if (!revenueChart) return;

    showLoading();

    // Simulate API call
    setTimeout(() => {
        revenueChart.data.labels = generateDateLabels(currentPeriod);
        revenueChart.data.datasets[0].data = generateMockRevenueData(currentPeriod);
        revenueChart.update();
        hideLoading();
    }, 500);
}

// Initialize quick actions
function initializeQuickActions() {
    // Add click handlers for quick action buttons if needed
    const quickActions = document.querySelectorAll('a[href*="/create"], a[href="/payments"]');
    quickActions.forEach(action => {
        action.addEventListener('click', function(e) {
            // Add loading state or confirmation if needed
            const href = this.getAttribute('href');
            if (href.includes('/create')) {
                // Could add confirmation dialog here
            }
        });
    });
}

// Initialize real-time updates
function initializeRealTimeUpdates() {
    // Update stats every 30 seconds
    setInterval(() => {
        if (document.hasFocus()) {
            updateDashboardStats();
        }
    }, 30000);

    // Update time every second
    setInterval(updateCurrentTime, 1000);
}

// Update dashboard stats with animation
function updateDashboardStats() {
    // Simulate stat updates
    const stats = {
        totalCustomers: Math.floor(Math.random() * 10) + 240,
        activeSubscriptions: Math.floor(Math.random() * 5) + 185,
        pendingPayments: Math.floor(Math.random() * 3) + 10,
        todayRevenue: Math.floor(Math.random() * 500000) + 1500000
    };

    // Update with animation
    updateStatWithAnimation('totalCustomers', stats.totalCustomers);
    updateStatWithAnimation('activeSubscriptions', stats.activeSubscriptions);
    updateStatWithAnimation('pendingPayments', stats.pendingPayments);

    // Update revenue
    const revenueElement = document.getElementById('todayRevenue');
    if (revenueElement) {
        revenueElement.textContent = 'Rp ' + stats.todayRevenue.toLocaleString('id-ID');
    }
}

// Update single stat with animation
function updateStatWithAnimation(elementId, newValue) {
    const element = document.getElementById(elementId);
    if (!element) return;

    const currentValue = parseInt(element.textContent.replace(/\D/g, '')) || 0;
    const increment = (newValue - currentValue) / 20;
    let current = currentValue;

    const timer = setInterval(() => {
        current += increment;
        if ((increment > 0 && current >= newValue) || (increment < 0 && current <= newValue)) {
            current = newValue;
            clearInterval(timer);
        }
        element.textContent = Math.floor(current).toLocaleString('id-ID');
    }, 50);
}

// Update current time display
function updateCurrentTime() {
    const timeElements = document.querySelectorAll('#currentTime');
    timeElements.forEach(element => {
        if (element) {
            element.textContent = new Date().toLocaleString('id-ID');
        }
    });
}

// Format currency helper
function formatCurrency(amount, short = false) {
    if (short && amount >= 1000000) {
        return 'Rp ' + (amount / 1000000).toFixed(1) + 'jt';
    }
    return 'Rp ' + amount.toLocaleString('id-ID');
}

// Show loading overlay
function showLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.remove('hidden');
    }
}

// Hide loading overlay
function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.add('hidden');
    }
}

// Show toast notification
function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) return;

    const toast = document.createElement('div');

    const bgColors = {
        success: 'bg-green-600',
        error: 'bg-red-600',
        warning: 'bg-yellow-600',
        info: 'bg-blue-600'
    };

    const icons = {
        success: 'fas fa-check-circle',
        error: 'fas fa-exclamation-circle',
        warning: 'fas fa-exclamation-triangle',
        info: 'fas fa-info-circle'
    };

    toast.className = `${bgColors[type]} text-white px-6 py-4 rounded-lg shadow-lg transform transition-all duration-300 translate-x-full mb-2`;
    toast.innerHTML = `
        <div class="flex items-center space-x-3">
            <i class="${icons[type]}"></i>
            <span class="flex-1">${message}</span>
            <button onclick="this.parentElement.parentElement.remove()" class="ml-4 text-white hover:text-gray-200">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;

    toastContainer.appendChild(toast);

    // Animate in
    setTimeout(() => {
        toast.classList.remove('translate-x-full');
        toast.classList.add('translate-x-0');
    }, 100);

    // Auto remove after 5 seconds
    setTimeout(() => {
        toast.classList.add('translate-x-full');
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

// Handle keyboard shortcuts
document.addEventListener('keydown', function(e) {
    // Ctrl/Cmd + K for quick actions
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        focusQuickAction();
    }

    // Escape to close loading overlay
    if (e.key === 'Escape') {
        hideLoading();
    }
});

// Focus quick action button
function focusQuickAction() {
    const quickActions = document.querySelector('a[href*="/create"]');
    if (quickActions) {
        quickActions.focus();
        quickActions.classList.add('ring-2', 'ring-blue-400');
        setTimeout(() => {
            quickActions.classList.remove('ring-2', 'ring-blue-400');
        }, 2000);
    }
}

// Initialize system status indicators
function initializeSystemStatus() {
    updateSystemStatus();
    // Update system status every 60 seconds
    setInterval(updateSystemStatus, 60000);
}

// Update system status indicators
function updateSystemStatus() {
    // Simulate system status checks
    const statusChecks = {
        mikrotik: {
            element: 'mikrotikStatus',
            check: () => Math.random() > 0.1 // 90% uptime simulation
        },
        database: {
            element: 'dbStatus',
            check: () => Math.random() > 0.05 // 95% uptime simulation
        },
        whatsapp: {
            element: 'whatsappStatus',
            check: () => Math.random() > 0.2 // 80% uptime simulation
        }
    };

    Object.entries(statusChecks).forEach(([service, config]) => {
        const element = document.getElementById(config.element);
        if (element) {
            const isOnline = config.check();

            // Update status indicator
            element.className = `w-2 h-2 rounded-full ${
                isOnline ? 'bg-green-400' : 'bg-red-400'
            } ${isOnline ? 'animate-pulse' : ''}`;

            // Add tooltip functionality
            element.setAttribute('title', `${service.charAt(0).toUpperCase() + service.slice(1)} Service: ${isOnline ? 'Online' : 'Offline'}`);
            element.setAttribute('data-service', service);
            element.setAttribute('data-status', isOnline ? 'online' : 'offline');
        }
    });
}

// Update last update time
function updateLastUpdateTime() {
    const lastUpdateElement = document.getElementById('lastUpdate');
    if (lastUpdateElement) {
        lastUpdateElement.textContent = new Date().toLocaleString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }
}

// Enhanced revenue chart with target dataset
function updateRevenueChart() {
    if (!revenueChart) return;

    showLoading();

    // Simulate API call
    setTimeout(() => {
        const labels = generateDateLabels(currentPeriod);
        const revenueData = generateMockRevenueData(currentPeriod);
        const targetData = generateTargetData(currentPeriod);

        revenueChart.data.labels = labels;
        revenueChart.data.datasets = [
            {
                label: 'Pendapatan',
                data: revenueData,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#3b82f6',
                pointBorderColor: '#1e293b',
                pointBorderWidth: 2,
                pointRadius: 5,
                pointHoverRadius: 7
            },
            {
                label: 'Target',
                data: targetData,
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                borderWidth: 2,
                borderDash: [5, 5],
                fill: false,
                tension: 0.4,
                pointBackgroundColor: '#10b981',
                pointBorderColor: '#1e293b',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6
            }
        ];
        revenueChart.update();
        updateLastUpdateTime();
        hideLoading();
        showToast('Chart updated successfully', 'success');
    }, 500);
}

// Generate target data for comparison
function generateTargetData(days) {
    const data = [];
    const targetDaily = 1200000; // Target per day

    for (let i = 0; i < days; i++) {
        // Add some variation to target
        const variation = (Math.random() - 0.5) * 100000;
        data.push(targetDaily + variation);
    }

    return data;
}

// Enhanced stat counter animation with percentage changes
function initializeStatCounters() {
    const counters = [
        {
            id: 'totalCustomers',
            target: parseInt(document.getElementById('totalCustomers')?.textContent?.replace(/\D/g, '') || 245),
            current: 0,
            growthElement: 'customersGrowth'
        },
        {
            id: 'activeSubscriptions',
            target: parseInt(document.getElementById('activeSubscriptions')?.textContent?.replace(/\D/g, '') || 189),
            current: 0,
            growthElement: 'subscriptionsGrowth'
        },
        {
            id: 'pendingPayments',
            target: parseInt(document.getElementById('pendingPayments')?.textContent?.replace(/\D/g, '') || 12),
            current: 0,
            growthElement: 'paymentsTrend'
        }
    ];

    counters.forEach(counter => {
        animateCounter(counter);
        // Animate growth indicators
        if (counter.growthElement) {
            animateGrowthIndicator(counter.growthElement);
        }
    });
}

// Animate growth indicator
function animateGrowthIndicator(elementId) {
    const element = document.getElementById(elementId);
    if (!element) return;

    element.style.opacity = '0';
    element.style.transform = 'translateY(-10px)';

    setTimeout(() => {
        element.style.transition = 'all 0.5s ease-out';
        element.style.opacity = '1';
        element.style.transform = 'translateY(0)';
    }, 500 + Math.random() * 1000);
}

// Export functions for global access
window.dashboard = {
    updateStats: updateDashboardStats,
    showLoading: showLoading,
    hideLoading: hideLoading,
    showToast: showToast,
    updateChart: updateRevenueChart,
    updateSystemStatus: updateSystemStatus,
    updateLastUpdateTime: updateLastUpdateTime
};

// Global chart functions for external calls
window.tableSearch = function(tableId, query) {
    console.log('Search table:', tableId, 'with query:', query);
    showToast(`Searching for "${query}"...`, 'info');
};

window.tableFilter = function(tableId, filter) {
    console.log('Filter table:', tableId, 'with filter:', filter);
    showToast(`Filter applied: ${filter}`, 'info');
};

window.tableSort = function(tableId, columnKey, columnIndex) {
    console.log('Sort table:', tableId, 'by column:', columnKey);
    showToast(`Sorting by ${columnKey}...`, 'info');
};

window.tablePagination = function(tableId, page) {
    console.log('Paginate table:', tableId, 'to page:', page);
    showToast(`Loading page ${page}...`, 'info');
};