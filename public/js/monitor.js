/**
 * Monitor Page JavaScript
 * Handles real-time monitoring of Mikrotik sessions and statistics
 */

class MonitorManager {
    constructor() {
        this.refreshInterval = null;
        this.sessionInterval = null;
        this.init();
    }

    init() {
        this.bindEvents();
        this.startMonitoring();
    }

    bindEvents() {
        // Refresh button
        document.getElementById('refreshMonitorBtn')?.addEventListener('click', () => {
            this.loadMonitorData();
        });

        // Connection test button
        document.getElementById('runConnectionTestBtn')?.addEventListener('click', () => {
            this.testConnection();
        });

        // Sync Mikrotik button
        document.getElementById('syncMikrotikBtn')?.addEventListener('click', () => {
            this.syncMikrotik();
        });

        // Cleanup expired button
        document.getElementById('cleanupExpiredBtn')?.addEventListener('click', () => {
            this.cleanupExpired();
        });

        // Export button
        document.getElementById('exportDataBtn')?.addEventListener('click', () => {
            this.exportData();
        });
    }

    startMonitoring() {
        // Load initial data
        this.loadMonitorData();
        this.loadSessionData();

        // Start refresh intervals
        this.refreshInterval = setInterval(() => {
            this.loadMonitorData();
        }, 5000); // Refresh every 5 seconds

        this.sessionInterval = setInterval(() => {
            this.loadSessionData();
        }, 3000); // Refresh sessions every 3 seconds
    }

    async loadMonitorData() {
        try {
            const response = await fetch('/monitor/stats');
            if (!response.ok) throw new Error('Failed to load monitor data');

            const result = await response.json();

            if (result.success) {
                const stats = result.data;

                // Update connection status
                this.updateConnectionStatus(stats.mikrotikConnected);

                // Update connection status indicators
                const hotspotStatus = document.querySelector('#hotspotConnectionStatus');
                const pppoeStatus = document.querySelector('#pppoeConnectionStatus');

                if (hotspotStatus) {
                    if (stats.mikrotikConnected) {
                        hotspotStatus.className = 'inline-flex items-center px-3 py-1 bg-green-500/10 text-green-400 rounded-full text-sm border border-green-500/20';
                        hotspotStatus.innerHTML = '<i class="fas fa-wifi mr-2"></i>Terhubung';
                    } else {
                        hotspotStatus.className = 'inline-flex items-center px-3 py-1 bg-red-500/10 text-red-400 rounded-full text-sm border border-red-500/20';
                        hotspotStatus.innerHTML = '<i class="fas fa-wifi mr-2"></i>Tidak Terhubung';
                    }
                }

                if (pppoeStatus) {
                    if (stats.mikrotikConnected) {
                        pppoeStatus.className = 'inline-flex items-center px-3 py-1 bg-green-500/10 text-green-400 rounded-full text-sm border border-green-500/20';
                        pppoeStatus.innerHTML = '<i class="fas fa-network-wired mr-2"></i>Terhubung';
                    } else {
                        pppoeStatus.className = 'inline-flex items-center px-3 py-1 bg-red-500/10 text-red-400 rounded-full text-sm border border-red-500/20';
                        pppoeStatus.innerHTML = '<i class="fas fa-network-wired mr-2"></i>Tidak Terhubung';
                    }
                }

                // Update DOM elements with stats data
                this.updateElement('#totalHotspot', stats.totalHotspot.toString());
                this.updateElement('#hotspotOnline', stats.hotspotOnline.toString());
                this.updateElement('#totalPPPoE', stats.totalPPPoE.toString());
                this.updateElement('#pppoeOnline', stats.pppoeOnline.toString());
                this.updateElement('#totalHotspotOnlineAll', stats.totalHotspotOnlineAll.toString());
                this.updateElement('#totalPPPoEOnlineAll', stats.totalPPPoEOnlineAll.toString());
                this.updateElement('#activeHotspotUsers', stats.activeHotspotUsers.toString());
                this.updateElement('#expiredHotspotUsers', stats.expiredHotspotUsers.toString());
                this.updateElement('#activePPPoEUsers', stats.activePPPoEUsers.toString());
                this.updateElement('#disabledPPPoEUsers', stats.disabledPPPoEUsers.toString());

                // Update new detailed stats
                this.updateElement('#hotspotOfflineUsers', stats.hotspotOfflineUsers.toString());
                this.updateElement('#pppoeOfflineUsers', stats.pppoeOfflineUsers.toString());
                this.updateElement('#hotspotSystemUsers', stats.hotspotSystemUsers.toString());
                this.updateElement('#pppoeSystemUsers', stats.pppoeSystemUsers.toString());

                // Calculate and update total online all
                const totalOnlineAll = parseInt(stats.totalHotspotOnlineAll) + parseInt(stats.totalPPPoEOnlineAll);
                this.updateElement('#totalOnlineAll', totalOnlineAll.toString());

                this.updateLastUpdateTime();
            } else {
                throw new Error(result.error || 'Failed to load monitor data');
            }
        } catch (error) {
            console.error('Error loading monitor data:', error);
            this.showNotification('Error loading monitor data', 'danger');
        }
    }

    
    updateElement(selector, value) {
        const element = document.querySelector(selector);
        if (element) {
            // Remove spinners and update value
            const spinner = element.querySelector('.spinner-border');
            if (spinner) {
                spinner.remove();
            }

            if (element.textContent !== value) {
                element.textContent = value;
                // Add highlight effect
                element.style.transition = 'background-color 0.3s';
                element.style.backgroundColor = 'rgba(0, 123, 255, 0.1)';
                setTimeout(() => {
                    element.style.backgroundColor = '';
                }, 500);
            }
        }
    }

    async loadSessionData() {
        try {
            // Load hotspot sessions
            const hotspotResponse = await fetch('/monitor/hotspot-sessions');
            if (hotspotResponse.ok) {
                const hotspotData = await hotspotResponse.json();
                this.updateHotspotSessions(hotspotData.data || []);
            }

            // Load PPPoE sessions
            const pppoeResponse = await fetch('/monitor/pppoe-sessions');
            if (pppoeResponse.ok) {
                const pppoeData = await pppoeResponse.json();
                this.updatePPPoESessions(pppoeData.data || []);
            }
        } catch (error) {
            console.error('Error loading session data:', error);
        }
    }

    updateHotspotSessions(sessions) {
        const tbody = document.querySelector('#hotspotSessionsTableBody');
        if (!tbody) return;

        if (sessions.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center text-muted">
                        Tidak ada sesi hotspot aktif
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = sessions.map(session => `
            <tr>
                <td>${this.escapeHtml(session.user || session.username || '-')}</td>
                <td>${this.escapeHtml(session.address || session['ip-address'] || '-')}</td>
                <td>${this.escapeHtml(session['mac-address'] || '-')}</td>
                <td>${this.formatDateTime(session['login-time'] || session.uptime)}</td>
                <td>${this.formatUptime(session.uptime)}</td>
                <td>${this.formatBytes(session['bytes-in'] || 0)} / ${this.formatBytes(session['bytes-out'] || 0)}</td>
            </tr>
        `).join('');
    }

    updatePPPoESessions(sessions) {
        const tbody = document.querySelector('#pppoeSessionsTableBody');
        if (!tbody) return;

        if (sessions.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="text-center text-muted">
                        Tidak ada sesi PPPoE aktif
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = sessions.map(session => {
            const name = session.name || session.username || '-';
            const address = session.address || session['remote-address'] || '-';
            const uptime = this.formatUptime(session.uptime);
            const encoding = session.encoding || '-';

            return `
                <tr>
                    <td>${this.escapeHtml(name)}</td>
                    <td>${this.escapeHtml(address)}</td>
                    <td>${uptime}</td>
                    <td>${this.escapeHtml(encoding)}</td>
                </tr>
            `;
        }).join('');
    }

    async testConnection() {
        const btn = document.getElementById('runConnectionTestBtn');
        const originalText = btn.innerHTML;

        try {
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Testing...';
            btn.disabled = true;

            const response = await fetch('/monitor/test-connection', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const result = await response.json();

            if (result.success) {
                const data = result.data;
                this.updateConnectionStatus(data.connected);
                this.updateApiResponseTime(data.responseTime);
                this.showNotification('Connection test completed', 'success');
            } else {
                this.showNotification(result.error || 'Connection test failed', 'danger');
            }
        } catch (error) {
            console.error('Connection test error:', error);
            this.showNotification('Connection test failed', 'danger');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }

    async syncMikrotik() {
        const btn = document.getElementById('syncMikrotikBtn');
        const originalText = btn.innerHTML;

        try {
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Syncing...';
            btn.disabled = true;

            const response = await fetch('/monitor/sync-mikrotik', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification(result.message || 'Sync completed', 'success');
                this.loadMonitorData(); // Refresh data
            } else {
                this.showNotification(result.error || 'Sync failed', 'danger');
            }
        } catch (error) {
            console.error('Sync error:', error);
            this.showNotification('Sync failed', 'danger');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }

    async cleanupExpired() {
        const btn = document.getElementById('cleanupExpiredBtn');
        const originalText = btn.innerHTML;

        try {
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Cleaning...';
            btn.disabled = true;

            const response = await fetch('/monitor/cleanup-expired', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const result = await response.json();

            if (result.success) {
                const data = result.data;
                this.showNotification(
                    `Cleanup completed: ${data.cleanedHotspot} hotspot users, ${data.disabledPPPoE} PPPoE users`,
                    'success'
                );
                this.loadMonitorData(); // Refresh data
            } else {
                this.showNotification(result.error || 'Cleanup failed', 'danger');
            }
        } catch (error) {
            console.error('Cleanup error:', error);
            this.showNotification('Cleanup failed', 'danger');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }

    exportData() {
        // Get current statistics
        const stats = {
            totalHotspot: document.querySelector('#totalHotspot')?.textContent || '0',
            hotspotOnline: document.querySelector('#hotspotOnline')?.textContent || '0',
            hotspotOfflineUsers: document.querySelector('#hotspotOfflineUsers')?.textContent || '0',
            hotspotSystemUsers: document.querySelector('#hotspotSystemUsers')?.textContent || '0',
            totalPPPoE: document.querySelector('#totalPPPoE')?.textContent || '0',
            pppoeOnline: document.querySelector('#pppoeOnline')?.textContent || '0',
            pppoeOfflineUsers: document.querySelector('#pppoeOfflineUsers')?.textContent || '0',
            pppoeSystemUsers: document.querySelector('#pppoeSystemUsers')?.textContent || '0',
            totalHotspotOnlineAll: document.querySelector('#totalHotspotOnlineAll')?.textContent || '0',
            totalPPPoEOnlineAll: document.querySelector('#totalPPPoEOnlineAll')?.textContent || '0',
            totalOnlineAll: document.querySelector('#totalOnlineAll')?.textContent || '0',
            activeHotspotUsers: document.querySelector('#activeHotspotUsers')?.textContent || '0',
            expiredHotspotUsers: document.querySelector('#expiredHotspotUsers')?.textContent || '0',
            activePPPoEUsers: document.querySelector('#activePPPoEUsers')?.textContent || '0',
            disabledPPPoEUsers: document.querySelector('#disabledPPPoEUsers')?.textContent || '0',
            timestamp: new Date().toISOString()
        };

        // Create CSV content
        const csvContent = `Metric,Value,Timestamp
Total Hotspot Users,${stats.totalHotspot},${stats.timestamp}
Hotspot Users Online,${stats.hotspotOnline},${stats.timestamp}
Hotspot Users Offline,${stats.hotspotOfflineUsers},${stats.timestamp}
Hotspot System Users,${stats.hotspotSystemUsers},${stats.timestamp}
Total PPPoE Users,${stats.totalPPPoE},${stats.timestamp}
PPPoE Users Online,${stats.pppoeOnline},${stats.timestamp}
PPPoE Users Offline,${stats.pppoeOfflineUsers},${stats.timestamp}
PPPoE System Users,${stats.pppoeSystemUsers},${stats.timestamp}
Total Hotspot Online (All),${stats.totalHotspotOnlineAll},${stats.timestamp}
Total PPPoE Online (All),${stats.totalPPPoEOnlineAll},${stats.timestamp}
Total Online All Sessions,${stats.totalOnlineAll},${stats.timestamp}
Active Hotspot Users,${stats.activeHotspotUsers},${stats.timestamp}
Expired Hotspot Users,${stats.expiredHotspotUsers},${stats.timestamp}
Active PPPoE Users,${stats.activePPPoEUsers},${stats.timestamp}
Disabled PPPoE Users,${stats.disabledPPPoEUsers},${stats.timestamp}
`;

        // Download file
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mikrotik-monitor-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        this.showNotification('Data exported successfully', 'success');
    }

    updateConnectionStatus(connected) {
        const status = document.querySelector('#mikrotikStatus');
        if (status) {
            if (connected) {
                status.innerHTML = '<i class="fas fa-check mr-1"></i>Connected';
                status.className = 'inline-flex items-center px-2 py-1 bg-green-500/10 text-green-400 rounded-full text-xs border border-green-500/20';
                // Update progress bar
                const progressBar = status.parentElement.querySelector('.bg-green-500, .bg-red-500');
                if (progressBar) {
                    progressBar.className = 'bg-green-500 h-1 rounded-full';
                    progressBar.style.width = '100%';
                }
            } else {
                status.innerHTML = '<i class="fas fa-times mr-1"></i>Disconnected';
                status.className = 'inline-flex items-center px-2 py-1 bg-red-500/10 text-red-400 rounded-full text-xs border border-red-500/20';
                // Update progress bar
                const progressBar = status.parentElement.querySelector('.bg-green-500, .bg-red-500');
                if (progressBar) {
                    progressBar.className = 'bg-red-500 h-1 rounded-full';
                    progressBar.style.width = '30%';
                }
            }
        }
    }

    updateApiResponseTime(responseTime) {
        const element = document.querySelector('#apiResponseTime');
        if (element) {
            element.textContent = `${responseTime}ms`;
        }
    }

    updateLastUpdateTime() {
        const element = document.querySelector('#lastUpdate');
        if (element) {
            element.textContent = 'Baru saja';
        }
    }

    showNotification(message, type = 'info') {
        // Create toast notification
        const toast = document.createElement('div');
        toast.className = `toast align-items-center text-white bg-${type} border-0`;
        toast.setAttribute('role', 'alert');
        toast.innerHTML = `
            <div class="d-flex">
                <div class="toast-body">
                    ${message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>
        `;

        // Add to container
        const container = document.querySelector('.toast-container') || this.createToastContainer();
        container.appendChild(toast);

        // Show toast
        const bsToast = new bootstrap.Toast(toast, { autohide: true, delay: 5000 });
        bsToast.show();

        // Remove after hidden
        toast.addEventListener('hidden.bs.toast', () => {
            toast.remove();
        });
    }

    createToastContainer() {
        const container = document.createElement('div');
        container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
        document.body.appendChild(container);
        return container;
    }

    formatDateTime(dateString) {
        if (!dateString) return '-';
        try {
            const date = new Date(dateString);
            // Check if date is valid
            if (isNaN(date.getTime())) {
                return '-';
            }
            return date.toLocaleString('id-ID');
        } catch {
            return '-';
        }
    }

    formatUptime(uptimeString) {
        if (!uptimeString) return '-';
        return uptimeString;
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    destroy() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
        if (this.sessionInterval) {
            clearInterval(this.sessionInterval);
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.monitorManager = new MonitorManager();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (window.monitorManager) {
        window.monitorManager.destroy();
    }
});