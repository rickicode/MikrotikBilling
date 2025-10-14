/**
 * Admin Settings Management JavaScript
 * Handles system configuration, Mikrotik connection, and settings management
 */

(function() {
    'use strict';

    // Check if SettingsManager already exists
    if (window.SettingsManager) {
        console.log('SettingsManager already loaded');
        return;
    }

    class SettingsManager {
    constructor() {
        this.currentSettings = {};
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadSettings();
        this.initializeTooltips();
        this.handleInitialTab();
    }

    bindEvents() {
        // Save buttons
        document.getElementById('saveSettingsBtn')?.addEventListener('click', () => {
            this.saveCurrentTab();
        });

        document.getElementById('saveAllSettingsBtn')?.addEventListener('click', () => {
            this.saveAllSettings();
        });

        // Test connection button
        document.getElementById('testConnectionBtn')?.addEventListener('click', () => {
            this.testMikrotikConnection();
        });

        // Profile sync buttons
        document.getElementById('syncProfilesBtn')?.addEventListener('click', () => {
            this.syncProfiles();
        });

        document.getElementById('refreshProfilesBtn')?.addEventListener('click', () => {
            this.loadProfiles();
        });

        // Reset and export buttons
        document.getElementById('resetSettingsBtn')?.addEventListener('click', () => {
            this.resetSettings();
        });

        document.getElementById('exportSettingsBtn')?.addEventListener('click', () => {
            this.exportSettings();
        });

    
        // Form changes tracking - look for all forms within settings panels
        const forms = document.querySelectorAll('.settings-panel form');
        console.log('Found forms for change tracking:', forms.length);
        forms.forEach((form, index) => {
            console.log(`Form ${index}:`, form.id, form);
            form.addEventListener('input', (e) => {
                console.log('Input event on form:', form.id, 'Target:', e.target.name, 'Value:', e.target.value);
                this.markFormAsChanged(form);
            });
            form.addEventListener('change', (e) => {
                console.log('Change event on form:', form.id, 'Target:', e.target.name, 'Value:', e.target.value);
                this.markFormAsChanged(form);
            });
        });

        // Tab change events - Custom tab implementation
        const tabs = document.querySelectorAll('.settings-tab[data-tab]');
        console.log('Found tabs:', tabs.length);
        tabs.forEach((tab, index) => {
            console.log(`Tab ${index}:`, tab.dataset.tab, tab.textContent);
            tab.addEventListener('click', (e) => {
                console.log('Tab clicked:', e.target.dataset.tab);
                e.preventDefault();
                this.switchTab(tab.dataset.tab);
            });
        });

        // Settings form submissions
        document.getElementById('generalSettingsForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveGeneralSettings();
        });

        document.getElementById('mikrotikSettingsForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveMikrotikSettings();
        });

        document.getElementById('databaseSettingsForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveDatabaseSettings();
        });

        document.getElementById('notificationSettingsForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveNotificationSettings();
        });

        document.getElementById('paymentSettingsForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.savePaymentSettings();
        });

        document.getElementById('systemSettingsForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveSystemSettings();
        });

  
        // Database type change handler
        document.getElementById('databaseType')?.addEventListener('change', (e) => {
            this.toggleDatabaseFields(e.target.value);
        });

        // WhatsApp provider change handler
        document.getElementById('whatsappProvider')?.addEventListener('change', (e) => {
            this.toggleWhatsAppFields(e.target.value);
        });

        // Modal close buttons
        document.getElementById('closeModalBtn')?.addEventListener('click', () => {
            this.hideTestModal();
        });

        document.getElementById('closeModalBtn2')?.addEventListener('click', () => {
            this.hideTestModal();
        });

        // Close modal on backdrop click
        document.getElementById('testConnectionModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'testConnectionModal') {
                this.hideTestModal();
            }
        });
    }

    async loadSettings() {
        try {
            // Add cache busting timestamp to prevent caching
            const timestamp = new Date().getTime();
            const response = await fetch(`/api/settings?_=${timestamp}`, {
                credentials: 'include',
                cache: 'no-store',
                headers: {
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                }
            });
            const result = await response.json();

            if (result.success) {
                this.currentSettings = result.data;
                this.populateForms();
                this.updateSaveButtonState();
            } else {
                this.showToast('Gagal memuat pengaturan', 'error');
            }
        } catch (error) {
            console.error('Error loading settings:', error);
            this.showToast('Kesalahan koneksi', 'error');
        }
    }

    populateForms() {
        // General Settings
        document.getElementById('companyName').value = this.currentSettings.company_name || 'Mikrotik Billing System';
        document.getElementById('companyAddress').value = this.currentSettings.company_address || '';
        document.getElementById('companyPhone').value = this.currentSettings.company_phone || '';
        document.getElementById('companyEmail').value = this.currentSettings.company_email || '';
        document.getElementById('currency').value = this.currentSettings.currency || 'IDR';
        document.getElementById('language').value = this.currentSettings.language || 'id';

        // Mikrotik Settings
        document.getElementById('mikrotikHost').value = this.currentSettings.mikrotik_host || '';
        document.getElementById('mikrotikPort').value = this.currentSettings.mikrotik_port || 8728;
        document.getElementById('mikrotikUsername').value = this.currentSettings.mikrotik_username || '';
        document.getElementById('mikrotikPassword').value = this.currentSettings.mikrotik_password || '';
        document.getElementById('hotspotCommentMarker').value = this.currentSettings.hotspot_comment_marker || 'VOUCHER_SYSTEM';
        document.getElementById('pppoeCommentMarker').value = this.currentSettings.pppoe_comment_marker || 'PPPOE_SYSTEM';
        document.getElementById('useSSL').checked = this.currentSettings.mikrotik_use_ssl === 'true';

        // Database Settings
        document.getElementById('databaseType').value = this.currentSettings.database_type || 'sqlite';
        document.getElementById('backupInterval').value = this.currentSettings.backup_interval || 60;
        document.getElementById('autoBackup').checked = this.currentSettings.auto_backup === 'true';
        document.getElementById('optimizeOnStartup').checked = this.currentSettings.optimize_on_startup === 'true';

        // Notification Settings
        document.getElementById('whatsappProvider').value = this.currentSettings.whatsapp_provider || '';
        document.getElementById('whatsappApiKey').value = this.currentSettings.whatsapp_api_key || '';
        document.getElementById('notifyVoucherCreated').checked = this.currentSettings.notify_voucher_created === 'true';
        document.getElementById('notifyExpiryWarning').checked = this.currentSettings.notify_expiry_warning === 'true';
        document.getElementById('notifyExpired').checked = this.currentSettings.notify_expired === 'true';

        // Payment Settings
        document.getElementById('duitkuMerchantCode').value = this.currentSettings.duitku_merchant_code || '';
        document.getElementById('duitkuApiKey').value = this.currentSettings.duitku_api_key || '';
        document.getElementById('duitkuEnvironment').value = this.currentSettings.duitku_environment || 'sandbox';
        document.getElementById('duitkuCallbackUrl').value = this.currentSettings.duitku_callback_url || '';
        document.getElementById('enableDuitku').checked = this.currentSettings.enable_duitku === 'true';

        // System Settings
        document.getElementById('sessionTimeout').value = this.currentSettings.session_timeout || 30;
        document.getElementById('logLevel').value = this.currentSettings.log_level || 'info';
        document.getElementById('cleanupSchedule').value = this.currentSettings.cleanup_schedule || 24;
        document.getElementById('maxLogDays').value = this.currentSettings.max_log_days || 30;
        document.getElementById('enableRegistration').checked = this.currentSettings.enable_registration === 'true';
        document.getElementById('enableDemo').checked = this.currentSettings.enable_demo === 'true';
        document.getElementById('enableMaintenance').checked = this.currentSettings.enable_maintenance === 'true';

        // Template Settings
        document.getElementById('printTemplateType').value = this.currentSettings.print_template_type || 'a4';
        document.getElementById('templateName').value = this.currentSettings.template_name || 'Default';

  
        // Initialize field visibility
        this.toggleDatabaseFields(this.currentSettings.database_type || 'sqlite');
        this.toggleWhatsAppFields(this.currentSettings.whatsapp_provider || '');
    }

    toggleDatabaseFields(type) {
        const dbFields = document.querySelectorAll('#databaseSettingsForm input, #databaseSettingsForm select');
        dbFields.forEach(field => {
            if (field.id === 'databaseType') return;

            if (type === 'sqlite') {
                field.disabled = false;
            } else {
                // Disable some fields for PostgreSQL/Supabase
                if (['autoBackup', 'optimizeOnStartup'].includes(field.id)) {
                    field.disabled = true;
                }
            }
        });
    }

    toggleWhatsAppFields(provider) {
        const apiKeyField = document.getElementById('whatsappApiKey');
        const triggersField = document.getElementById('notifyVoucherCreated')?.parentElement.parentElement;

        if (provider) {
            apiKeyField.disabled = false;
            if (triggersField) triggersField.style.display = 'block';
        } else {
            apiKeyField.disabled = true;
            if (triggersField) triggersField.style.display = 'none';
        }
    }

    async saveCurrentTab() {
        const activeTab = document.querySelector('#settingsTabContent .tab-pane.active');
        const form = activeTab.querySelector('form');

        if (form) {
            form.dispatchEvent(new Event('submit'));
        }
    }

    async saveAllSettings() {
        const formData = {};

        // Collect all form data with proper field mapping
        const forms = document.querySelectorAll('#settingsTabContent form');
        forms.forEach(form => {
            const inputs = form.querySelectorAll('input, select');
            inputs.forEach(input => {
                // Map ID to proper database field names
                const fieldMapping = {
                    'companyName': 'company_name',
                    'companyAddress': 'company_address',
                    'companyPhone': 'company_phone',
                    'companyEmail': 'company_email',
                    'currency': 'currency',
                    'language': 'language',
                    'mikrotikHost': 'mikrotik_host',
                    'mikrotikPort': 'mikrotik_port',
                    'mikrotikUsername': 'mikrotik_username',
                    'mikrotikPassword': 'mikrotik_password',
                    'useSSL': 'mikrotik_use_ssl',
                    'hotspotCommentMarker': 'hotspot_comment_marker',
                    'pppoeCommentMarker': 'pppoe_comment_marker'
                };

                const fieldName = fieldMapping[input.id] || input.name || input.id;

                if (input.type === 'checkbox') {
                    formData[fieldName] = input.checked;
                } else {
                    formData[fieldName] = input.value;
                }
            });
        });

        try {
            const response = await fetch('/api/settings', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({ settings: formData })
            });

            const result = await response.json();

            if (result.success) {
                this.showToast('Semua pengaturan berhasil disimpan', 'success');
                this.clearChangedForms();

                // Update current settings
                this.currentSettings = result.data;
            } else {
                this.showToast(result.message || 'Gagal menyimpan pengaturan', 'error');
            }
        } catch (error) {
            console.error('Error saving settings:', error);
            this.showToast('Kesalahan koneksi', 'error');
        }
    }

    async saveGeneralSettings() {
        const data = {
            company_name: document.getElementById('companyName').value,
            company_address: document.getElementById('companyAddress').value,
            company_phone: document.getElementById('companyPhone').value,
            company_email: document.getElementById('companyEmail').value,
            currency: document.getElementById('currency').value,
            language: document.getElementById('language').value
        };

        await this.saveSettingsSection('general', data);
    }

    async saveMikrotikSettings() {
        const data = {
            mikrotik_host: document.getElementById('mikrotikHost').value,
            mikrotik_port: document.getElementById('mikrotikPort').value,
            mikrotik_username: document.getElementById('mikrotikUsername').value,
            mikrotik_password: document.getElementById('mikrotikPassword').value,
            hotspot_comment_marker: document.getElementById('hotspotCommentMarker').value,
            pppoe_comment_marker: document.getElementById('pppoeCommentMarker').value,
            mikrotik_use_ssl: document.getElementById('useSSL').checked
        };

        // Save settings
        await this.saveSettingsSection('mikrotik', data);

        // Show loading state
        const originalButtonText = document.querySelector('#settingsTabContent .tab-pane.active button[type="submit"]').textContent;
        const submitButton = document.querySelector('#settingsTabContent .tab-pane.active button[type="submit"]');
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = 'Menyimpan...';
        }

        // Force refresh Mikrotik status with new credentials
        try {
            console.log('🔄 Refreshing Mikrotik connection with new credentials...');
            const response = await fetch('/refresh-mikrotik-status', {
                method: 'POST',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });

            const result = await response.json();
            
            if (result.success) {
                console.log('✅ Mikrotik status refreshed successfully:', result);
                
                // Update Mikrotik connection status in UI
                this.updateMikrotikStatusUI(result.details);
                
                // Show success message with status
                let message = 'Pengaturan Mikrotik berhasil disimpan';
                if (result.status === 'success') {
                    message += ' dan koneksi berhasil diperbarui';
                } else if (result.status === 'existing') {
                    message += ' (menggunakan koneksi yang ada)';
                }
                this.showToast(message, 'success');
            } else {
                console.warn('⚠️ Mikrotik status refresh failed:', result);
                this.showToast('Pengaturan disimpan tapi gagal memperbarui koneksi Mikrotik', 'warning');
            }
        } catch (error) {
            console.error('Error refreshing Mikrotik status:', error);
            this.showToast('Pengaturan disimpan tapi terjadi kesalahan saat refresh koneksi', 'error');
        }

        // Restore button state
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = originalButtonText;
        }

        // Update current settings
        this.currentSettings.mikrotik = data;
    }

    async saveDatabaseSettings() {
        const data = {
            database_type: document.getElementById('databaseType').value,
            backup_interval: document.getElementById('backupInterval').value,
            auto_backup: document.getElementById('autoBackup').checked,
            optimize_on_startup: document.getElementById('optimizeOnStartup').checked
        };

        await this.saveSettingsSection('database', data);
    }

    async saveNotificationSettings() {
        const data = {
            whatsapp_provider: document.getElementById('whatsappProvider').value,
            whatsapp_api_key: document.getElementById('whatsappApiKey').value,
            notify_voucher_created: document.getElementById('notifyVoucherCreated').checked,
            notify_expiry_warning: document.getElementById('notifyExpiryWarning').checked,
            notify_expired: document.getElementById('notifyExpired').checked
        };

        await this.saveSettingsSection('notification', data);
    }

    async savePaymentSettings() {
        const data = {
            duitku_merchant_code: document.getElementById('duitkuMerchantCode').value,
            duitku_api_key: document.getElementById('duitkuApiKey').value,
            duitku_environment: document.getElementById('duitkuEnvironment').value,
            duitku_callback_url: document.getElementById('duitkuCallbackUrl').value,
            enable_duitku: document.getElementById('enableDuitku').checked
        };

        await this.saveSettingsSection('payment', data);
    }

    async saveSystemSettings() {
        const data = {
            session_timeout: document.getElementById('sessionTimeout').value,
            log_level: document.getElementById('logLevel').value,
            cleanup_schedule: document.getElementById('cleanupSchedule').value,
            max_log_days: document.getElementById('maxLogDays').value,
            enable_registration: document.getElementById('enableRegistration').checked,
            enable_demo: document.getElementById('enableDemo').checked,
            enable_maintenance: document.getElementById('enableMaintenance').checked,
            print_template_type: document.getElementById('printTemplateType').value,
            template_name: document.getElementById('templateName').value
        };

        await this.saveSettingsSection('system', data);
    }

    // Update Mikrotik connection status in UI
    updateMikrotikStatusUI(details) {
        try {
            // Update header status indicator
            const statusIndicator = document.querySelector('.mikrotik-status-indicator');
            if (statusIndicator) {
                if (details.connected) {
                    statusIndicator.className = 'mikrotik-status-indicator status-connected';
                    statusIndicator.textContent = 'Connected';
                } else {
                    statusIndicator.className = 'mikrotik-status-indicator status-disconnected';
                    statusIndicator.textContent = 'Disconnected';
                }
            }

            // Update connection details in Mikrotik tab
            const connectionInfo = document.getElementById('connectionInfo');
            if (connectionInfo) {
                connectionInfo.innerHTML = `
                    <div class="alert ${details.connected ? 'alert-success' : 'alert-danger'}" role="alert">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <strong>Status:</strong> 
                                <span class="badge ${details.connected ? 'bg-success' : 'bg-danger'}">
                                    ${details.connected ? 'Connected' : 'Disconnected'}
                                </span>
                            </div>
                        </div>
                        <hr>
                        <div class="small">
                            <strong>Host:</strong> ${details.host}<br>
                            <strong>Port:</strong> ${details.port}<br>
                            <strong>Username:</strong> ${details.username}
                            ${details.routeros ? `<br><strong>RouterOS:</strong> ${details.routeros.name}` : ''}
                            ${details.note ? `<br><em>${details.note}</em>` : ''}
                        </div>
                    </div>
                `;

                // Auto-hide after 5 seconds
                setTimeout(() => {
                    connectionInfo.style.opacity = '0.7';
                }, 5000);
            }

            // Update global Mikrotik status in header (if exists)
            const globalStatus = document.querySelector('[data-mikrotik-status]');
            if (globalStatus) {
                globalStatus.setAttribute('data-mikrotik-status', details.connected ? 'connected' : 'disconnected');
                globalStatus.textContent = details.connected ? 'Connected' : 'Disconnected';
            }

        } catch (error) {
            console.error('Error updating Mikrotik status UI:', error);
        }
    }

    
    async saveSettingsSection(section, data) {
        try {
            console.log(`Saving ${section} settings:`, data);
            const requestBody = { section, data };
            console.log('Request body to be sent:', JSON.stringify(requestBody, null, 2));

            const response = await fetch('/api/settings', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                },
                credentials: 'include',
                body: JSON.stringify(requestBody)
            });

            const result = await response.json();

            if (result.success) {
                this.showToast(`Pengaturan ${section} berhasil disimpan`, 'success');

                // Update current settings with fresh data from server
                this.currentSettings = result.data;

                // Repopulate all forms to ensure consistency
                this.populateForms();

                // Clear changed state for this form
                const form = document.querySelector(`#${section}SettingsForm`);
                if (form) {
                    form.dataset.changed = 'false';
                }

                this.updateSaveButtonState();

                // Special handling for general settings - reload page title
                if (section === 'general') {
                    this.updatePageTitle();
                }

                // Special handling for Mikrotik settings
                if (section === 'mikrotik') {
                    // Update connection status
                    await this.updateConnectionStatus();
                }
            } else {
                this.showToast(result.message || `Gagal menyimpan pengaturan ${section}`, 'error');
            }
        } catch (error) {
            console.error(`Error saving ${section} settings:`, error);
            this.showToast('Kesalahan koneksi', 'error');
        }
    }

    async testMikrotikConnection() {
        // Get current form values (not saved settings)
        const settings = {
            host: document.getElementById('mikrotikHost').value,
            port: document.getElementById('mikrotikPort').value,
            username: document.getElementById('mikrotikUsername').value,
            password: document.getElementById('mikrotikPassword').value,
            use_ssl: document.getElementById('useSSL').checked
        };

        await this.testMikrotikConnectionWithSettings(settings, true);
    }

    async testMikrotikConnectionWithSettings(settings, showModals = false) {
        if (showModals) {
            const modal = document.getElementById('testConnectionModal');
            const resultDiv = document.getElementById('connectionTestResult');

            // Show modal manually
            modal.style.display = 'block';
            modal.classList.add('show');
            document.body.classList.add('modal-open');

            // Show loading state
            resultDiv.innerHTML = `
                <div class="text-center">
                    <div class="spinner-border" role="status">
                        <span class="visually-hidden">Testing...</span>
                    </div>
                    <p class="mt-2">Menguji koneksi ke Mikrotik...</p>
                </div>
            `;

            try {
                const response = await fetch('/api/mikrotik/test-connection', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include',
                    body: JSON.stringify(settings)
                });

                const result = await response.json();

                if (result.success) {
                    resultDiv.innerHTML = `
                        <div class="text-center">
                            <div class="text-success mb-3">
                                <i class="bi bi-check-circle-fill" style="font-size: 3rem;"></i>
                            </div>
                            <h5 class="text-success">Koneksi Berhasil!</h5>
                            <p class="mb-0">Terhubung ke Mikrotik ${result.info?.version || ''}</p>
                            <p class="mb-0">${result.info?.platform || ''} - ${result.info?.board_name || ''}</p>
                            <small class="text-muted">${result.message || 'Connection successful'}</small>
                        </div>
                    `;
                    return true;
                } else {
                    resultDiv.innerHTML = `
                        <div class="text-center">
                            <div class="text-danger mb-3">
                                <i class="bi bi-x-circle-fill" style="font-size: 3rem;"></i>
                            </div>
                            <h5 class="text-danger">Koneksi Gagal!</h5>
                            <p class="mb-0">${result.error || result.message || 'Tidak dapat terhubung ke Mikrotik'}</p>
                        </div>
                    `;
                    return false;
                }
            } catch (error) {
                console.error('Error testing connection:', error);
                resultDiv.innerHTML = `
                    <div class="text-center">
                        <div class="text-danger mb-3">
                            <i class="bi bi-x-circle-fill" style="font-size: 3rem;"></i>
                        </div>
                        <h5 class="text-danger">Koneksi Gagal!</h5>
                        <p class="mb-0">Kesalahan koneksi ke server</p>
                    </div>
                `;
                return false;
            }
        } else {
            // Silent test (for save validation)
            try {
                const response = await fetch('/api/mikrotik/test-connection', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include',
                    body: JSON.stringify(settings)
                });

                const result = await response.json();
                return result.success;
            } catch (error) {
                console.error('Error testing connection:', error);
                return false;
            }
        }
    }

    async resetSettings() {
        if (!confirm('Apakah Anda yakin ingin mereset semua pengaturan ke nilai default?')) {
            return;
        }

        try {
            const response = await fetch('/api/settings/reset', {
                method: 'POST',
                credentials: 'include'
            });

            const result = await response.json();

            if (result.success) {
                this.showToast('Pengaturan berhasil direset ke default', 'success');
                this.loadSettings(); // Reload settings
            } else {
                this.showToast(result.message || 'Gagal reset pengaturan', 'error');
            }
        } catch (error) {
            console.error('Error resetting settings:', error);
            this.showToast('Kesalahan koneksi', 'error');
        }
    }

    async exportSettings() {
        try {
            const response = await fetch('/api/settings/export', {
                credentials: 'include'
            });
            const result = await response.json();

            if (result.success) {
                // Create and download file
                const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `mikrotik-billing-settings-${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                this.showToast('Pengaturan berhasil diexport', 'success');
            } else {
                this.showToast(result.message || 'Gagal export pengaturan', 'error');
            }
        } catch (error) {
            console.error('Error exporting settings:', error);
            this.showToast('Kesalahan koneksi', 'error');
        }
    }

    cancelChanges() {
        if (this.hasUnsavedChanges()) {
            if (!confirm('Ada perubahan yang belum disimpan. Apakah Anda yakin ingin membatalkan?')) {
                return;
            }
        }

        this.populateForms(); // Reset forms
        this.clearChangedForms();
        this.showToast('Perubahan dibatalkan', 'info');
    }

    hasUnsavedChanges() {
        const forms = document.querySelectorAll('.settings-panel form');
        console.log('Checking for unsaved changes...');
        console.log('Found forms:', forms.length);

        const changes = Array.from(forms).map(form => {
            console.log(`Form ${form.id}: changed =`, form.dataset.changed);
            return form.dataset.changed === 'true';
        });

        console.log('Form changes array:', changes);
        const hasChanges = changes.some(changed => changed);
        console.log('Has unsaved changes:', hasChanges);

        return hasChanges;
    }

    markFormAsChanged(form) {
        console.log('markFormAsChanged called for form:', form.id);
        console.log('Form before change:', form.dataset.changed);
        form.dataset.changed = 'true';
        console.log('Form after change:', form.dataset.changed);
        this.updateSaveButtonState();
    }

    clearChangedForms() {
        const forms = document.querySelectorAll('.settings-panel form');
        forms.forEach(form => {
            form.dataset.changed = 'false';
        });
        this.updateSaveButtonState();
    }

    updateSaveButtonState() {
        const saveBtn = document.getElementById('saveSettingsBtn');
        const saveAllBtn = document.getElementById('saveAllSettingsBtn');

        console.log('updateSaveButtonState called');
        console.log('Save buttons found:', !!saveBtn, !!saveAllBtn);

        const hasChanges = this.hasUnsavedChanges();
        console.log('Has unsaved changes:', hasChanges);

        if (hasChanges) {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i class="bi bi-save"></i> Simpan*';
                console.log('Save button enabled');
            }
            if (saveAllBtn) {
                saveAllBtn.disabled = false;
                saveAllBtn.innerHTML = '<i class="bi bi-check"></i> Simpan Semua*';
                console.log('Save all button enabled');
            }
        } else {
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.innerHTML = '<i class="bi bi-save"></i> Simpan';
                console.log('Save button disabled');
            }
            if (saveAllBtn) {
                saveAllBtn.disabled = true;
                saveAllBtn.innerHTML = '<i class="bi bi-check"></i> Simpan Semua';
                console.log('Save all button disabled');
            }
        }
    }

    switchTab(tabId) {
        console.log('Switching to tab:', tabId);

        // Remove active class from all tabs and panels
        const tabs = document.querySelectorAll('.settings-tab');
        const panels = document.querySelectorAll('.settings-panel');

        console.log('Found tabs:', tabs.length, 'panels:', panels.length);

        tabs.forEach(tab => {
            tab.classList.remove('active');
            tab.setAttribute('aria-selected', 'false');
        });

        panels.forEach(panel => {
            panel.classList.remove('active');
            panel.setAttribute('aria-hidden', 'true');
        });

        // Add active class to selected tab and panel
        const activeTab = document.querySelector(`[data-tab="${tabId}"]`);
        const activePanel = document.getElementById(`${tabId}-panel`);

        console.log('Active tab:', activeTab);
        console.log('Active panel:', activePanel);

        if (activeTab && activePanel) {
            activeTab.classList.add('active');
            activeTab.setAttribute('aria-selected', 'true');
            activePanel.classList.add('active');
            activePanel.setAttribute('aria-hidden', 'false');

            console.log('Tab activated successfully!');

            // Load profile count when Mikrotik tab is opened
            if (tabId === 'mikrotik') {
                this.loadProfileCount();
            }

            // Update URL hash without scrolling
            history.pushState(null, null, `#${tabId}`);

            // Update save button state
            this.updateSaveButtonState();
        }
    }

    handleInitialTab() {
        // Check URL hash for initial tab
        const hash = window.location.hash.substring(1);
        const validTabs = ['general', 'mikrotik', 'database', 'notification', 'payment', 'system'];

        if (hash && validTabs.includes(hash)) {
            this.switchTab(hash);
        }

        // Also handle browser back/forward
        window.addEventListener('hashchange', () => {
            const newHash = window.location.hash.substring(1);
            if (newHash && validTabs.includes(newHash)) {
                this.switchTab(newHash);
            }
        });
    }

    hideTestModal() {
        const modal = document.getElementById('testConnectionModal');
        if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('show');
            document.body.classList.remove('modal-open');
        }
    }

    updatePageTitle() {
        const companyName = this.currentSettings.company_name || 'Mikrotik Billing System';

        // Update page title
        document.title = `Pengaturan Sistem - ${companyName}`;

        // Update navigation brand if it exists
        const brandLink = document.querySelector('.navbar-brand');
        if (brandLink) {
            brandLink.innerHTML = `<i class="bi bi-wifi"></i> ${companyName}`;
        }

        // Update footer copyright - try multiple selectors
        const footerSelectors = [
            '.contentinfo .container div:first-child',
            '.contentinfo div:first-child',
            'footer .container div:first-child',
            'footer div:first-child'
        ];

        for (const selector of footerSelectors) {
            const footerElement = document.querySelector(selector);
            if (footerElement && footerElement.textContent.includes('©')) {
                footerElement.innerHTML = `© 2025 ${companyName}`;
                break;
            }
        }
    }

    initializeTooltips() {
        // Tooltips removed - using title attribute instead
        console.log('Tooltips initialized');
    }

    async updateConnectionStatus() {
        // Update connection status indicator if it exists
        const statusIndicator = document.getElementById('mikrotikConnectionStatus');
        if (statusIndicator) {
            try {
                const response = await fetch('/api/system/connection', {
                    credentials: 'include'
                });
                const result = await response.json();

                if (result.connected) {
                    statusIndicator.className = 'badge bg-success';
                    statusIndicator.innerHTML = '<i class="bi bi-check-circle"></i> Connected';
                } else {
                    statusIndicator.className = 'badge bg-danger';
                    statusIndicator.innerHTML = '<i class="bi bi-x-circle"></i> Disconnected';
                }
            } catch (error) {
                statusIndicator.className = 'badge bg-warning';
                statusIndicator.innerHTML = '<i class="bi bi-question-circle"></i> Unknown';
            }
        }
    }

    async syncProfiles() {
        const syncBtn = document.getElementById('syncProfilesBtn');
        const resultDiv = document.getElementById('profileSyncResult');

        // Show loading state
        syncBtn.disabled = true;
        syncBtn.innerHTML = '<i class="fas fa-sync fa-spin mr-2"></i>Syncing...';
        resultDiv.innerHTML = '<span class="text-yellow-400">Syncing profiles...</span>';

        try {
            const response = await fetch('/api/mikrotik/sync-profiles?type=hotspot', {
                method: 'POST',
                credentials: 'include'
            });

            const result = await response.json();

            if (result.success) {
                resultDiv.innerHTML = `<span class="text-green-400">Success: ${result.synced} new, ${result.updated} updated</span>`;
                this.showToast(`Profile sync completed: ${result.synced} new, ${result.updated} updated`, 'success');

                // Reload profile count and list
                await this.loadProfileCount();
                await this.loadProfiles();
            } else {
                resultDiv.innerHTML = `<span class="text-red-400">Error: ${result.error}</span>`;
                this.showToast(`Profile sync failed: ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('Error syncing profiles:', error);
            resultDiv.innerHTML = '<span class="text-red-400">Connection error</span>';
            this.showToast('Connection error while syncing profiles', 'error');
        } finally {
            // Restore button state
            syncBtn.disabled = false;
            syncBtn.innerHTML = '<i class="fas fa-sync mr-2"></i>Sync Profiles';
        }
    }

    async loadProfiles() {
        const refreshBtn = document.getElementById('refreshProfilesBtn');
        const profileList = document.getElementById('profileList');
        const profileGrid = document.getElementById('profileGrid');

        // Show loading state
        refreshBtn.disabled = true;
        refreshBtn.innerHTML = '<i class="fas fa-sync fa-spin mr-2"></i>Loading...';

        try {
            const response = await fetch('/api/mikrotik/profiles?type=hotspot', {
                credentials: 'include'
            });

            const result = await response.json();

            if (result.success) {
                // Clear existing profiles
                profileGrid.innerHTML = '';

                if (result.data && result.data.length > 0) {
                    // Add profiles to grid
                    result.data.forEach(profile => {
                        const profileCard = document.createElement('div');
                        profileCard.className = 'bg-slate-700/50 rounded p-3 border border-slate-600/50';
                        profileCard.innerHTML = `
                            <div class="flex items-center justify-between">
                                <div class="flex-1">
                                    <div class="text-sm font-medium text-slate-200">${profile.name}</div>
                                    <div class="text-xs text-slate-400">
                                        ${profile['rate-limit'] || 'No limit'} • ${profile['shared-users'] || '1'} users
                                    </div>
                                </div>
                                <div class="ml-2">
                                    <i class="fas fa-check-circle text-green-400 text-sm"></i>
                                </div>
                            </div>
                        `;
                        profileGrid.appendChild(profileCard);
                    });

                    // Show profile list
                    profileList.classList.remove('hidden');
                } else {
                    profileGrid.innerHTML = '<div class="col-span-full text-center text-slate-400 text-sm">No profiles found</div>';
                    profileList.classList.remove('hidden');
                }

                this.showToast(`Loaded ${result.data.length} profiles from Mikrotik`, 'success');
            } else {
                this.showToast(`Failed to load profiles: ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('Error loading profiles:', error);
            this.showToast('Connection error while loading profiles', 'error');
        } finally {
            // Restore button state
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = '<i class="fas fa-eye mr-2"></i>View Profiles';
        }
    }

    async loadProfileCount() {
        const countSpan = document.getElementById('profileCount');

        try {
            const response = await fetch('/api/profiles/stats', {
                credentials: 'include'
            });

            const result = await response.json();

            if (result.success) {
                countSpan.textContent = result.data.total || 0;
            }
        } catch (error) {
            console.error('Error loading profile count:', error);
        }
    }

    
    showToast(message, type = 'info') {
        const toastContainer = document.getElementById('toastContainer') || this.createToastContainer();

        // Set background and text color based on type
        const bgColor = {
            'success': 'bg-green-600',
            'error': 'bg-red-600',
            'warning': 'bg-yellow-600',
            'info': 'bg-blue-600'
        }[type] || 'bg-gray-600';

        const toast = document.createElement('div');
        toast.className = `${bgColor} text-white px-4 py-3 rounded-lg shadow-lg flex items-center justify-between mb-2 min-w-[300px] transform transition-all duration-300 translate-x-full`;
        toast.setAttribute('role', 'alert');
        toast.innerHTML = `
            <div class="flex items-center">
                <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'} mr-3"></i>
                <span>${message}</span>
            </div>
            <button type="button" class="ml-4 text-white hover:text-slate-200 transition-colors" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;

        toastContainer.appendChild(toast);

        // Trigger animation
        setTimeout(() => {
            toast.classList.remove('translate-x-full');
            toast.classList.add('translate-x-0');
        }, 10);

        // Auto hide after 3 seconds
        setTimeout(() => {
            toast.classList.add('translate-x-full');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, 3000);
    }

    createToastContainer() {
        const container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'fixed top-4 right-4 z-50 flex flex-col gap-2';
        document.body.appendChild(container);
        return container;
    }
}

    // Expose SettingsManager to window
    window.SettingsManager = SettingsManager;

})();

// Initialize settings manager when DOM is loaded (OUTSIDE the IIFE)
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, creating SettingsManager...');
    // Only create if doesn't exist
    if (!window.settingsManager) {
        console.log('Creating new SettingsManager instance');
        window.settingsManager = new SettingsManager();
        console.log('SettingsManager created:', window.settingsManager);
    } else {
        console.log('SettingsManager already exists');
    }
});