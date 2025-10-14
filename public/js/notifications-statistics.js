// WhatsApp Statistics JavaScript
// Load Chart.js library dynamically if not already loaded
function loadChartJs() {
    return new Promise((resolve, reject) => {
        if (typeof Chart !== 'undefined') {
            resolve();
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

// Initialize charts when DOM is loaded
document.addEventListener('DOMContentLoaded', async function() {
    try {
        await loadChartJs();
        initializeCharts();
    } catch (error) {
        console.error('Failed to load Chart.js:', error);
    }
});

function initializeCharts() {
    // Daily Delivery Chart
    const dailyCtx = document.getElementById('dailyChart');
    if (dailyCtx) {
        const dailyStats = <%= JSON.stringify(dailyStats || []) %>;

        new Chart(dailyCtx.getContext('2d'), {
            type: 'line',
            data: {
                labels: dailyStats?.map(s => s.date) || [],
                datasets: [{
                    label: 'Sent',
                    data: dailyStats?.map(s => s.sent) || [],
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    tension: 0.4
                }, {
                    label: 'Failed',
                    data: dailyStats?.map(s => s.failed) || [],
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }

    // Template Usage Chart
    const templateCtx = document.getElementById('templateChart');
    if (templateCtx) {
        const templateUsage = <%= JSON.stringify(templateUsage || []) %>;

        new Chart(templateCtx.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: templateUsage?.map(t => t.name) || [],
                datasets: [{
                    data: templateUsage?.map(t => t.usage_count) || [],
                    backgroundColor: [
                        '#667eea',
                        '#764ba2',
                        '#10b981',
                        '#ef4444',
                        '#f59e0b',
                        '#3b82f6'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }

    // WhatsApp Status Distribution Chart
    const statusCtx = document.getElementById('statusChart');
    if (statusCtx) {
        const stats = <%= JSON.stringify(stats || {}) %>;

        new Chart(statusCtx.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: ['Sent', 'Pending', 'Failed', 'Retrying'],
                datasets: [{
                    data: [
                        stats?.sent || 0,
                        stats?.pending || 0,
                        stats?.failed || 0,
                        stats?.retrying || 0
                    ],
                    backgroundColor: [
                        '#10b981', // Sent - Green
                        '#f59e0b', // Pending - Yellow
                        '#ef4444', // Failed - Red
                        '#3b82f6'  // Retrying - Blue
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }
}

function exportData(format) {
    const data = {
        stats: <%= JSON.stringify(stats || {}) %>,
        dailyStats: <%= JSON.stringify(dailyStats || []) %>,
        templateUsage: <%= JSON.stringify(templateUsage || []) %>,
        exportedAt: new Date().toISOString()
    };

    if (format === 'json') {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `whatsapp-stats-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    } else if (format === 'csv') {
        let csv = 'Date,Sent,Failed,Total\n';
        data.dailyStats.forEach(stat => {
            csv += `${stat.date},${stat.sent},${stat.failed},${stat.total}\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `whatsapp-stats-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    ToastSystem.success(`WhatsApp data exported as ${format.toUpperCase()}`);
}

// Add event delegation for export buttons
document.addEventListener('click', function(e) {
    // Export CSV button
    if (e.target.matches('#exportCsvBtn') || e.target.closest('#exportCsvBtn')) {
        e.preventDefault();
        exportData('csv');
    }

    // Export JSON button
    if (e.target.matches('#exportJsonBtn') || e.target.closest('#exportJsonBtn')) {
        e.preventDefault();
        exportData('json');
    }
});