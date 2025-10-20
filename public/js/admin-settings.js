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
        // Save button - now saves all settings
        document.getElementById('saveSettingsBtn')?.addEventListener('click', () => {
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

  
        document.getElementById('systemSettingsForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveSystemSettings();
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
                console.log('Settings loaded:', result.data);
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
        // Helper function to get setting value (handle API response structure)
        const getSetting = (key, defaultValue = '') => {
            if (this.currentSettings[key] && typeof this.currentSettings[key] === 'object') {
                return this.currentSettings[key].value || defaultValue;
            }
            return this.currentSettings[key] || defaultValue;
        };

        const getSettingChecked = (key, defaultValue = false) => {
            if (this.currentSettings[key] && typeof this.currentSettings[key] === 'object') {
                return this.currentSettings[key].value === 'true';
            }
            return this.currentSettings[key] === 'true';
        };

        // Helper function to safely set element value
        const safeSetValue = (elementId, value) => {
            const element = document.getElementById(elementId);
            if (element) {
                element.value = value;
            } else {
                console.warn(`Element with ID '${elementId}' not found`);
            }
        };

        // Helper function to safely set element checked
        const safeSetChecked = (elementId, checked) => {
            const element = document.getElementById(elementId);
            if (element) {
                element.checked = checked;
            } else {
                console.warn(`Element with ID '${elementId}' not found`);
            }
        };

        // General Settings
        safeSetValue('companyName', getSetting('company_name', 'Mikrotik Billing System'));
        safeSetValue('companyAddress', getSetting('company_address'));
        safeSetValue('companyPhone', getSetting('company_phone'));
        safeSetValue('companyEmail', getSetting('company_email'));
        safeSetValue('currency', getSetting('currency', 'IDR'));
        safeSetValue('language', getSetting('language', 'id'));

        // Mikrotik Settings
        safeSetValue('mikrotikHost', getSetting('mikrotik_host'));
        safeSetValue('mikrotikPort', getSetting('mikrotik_port', 8728));
        safeSetValue('mikrotikUsername', getSetting('mikrotik_username'));
        safeSetValue('mikrotikPassword', getSetting('mikrotik_password'));
        safeSetValue('hotspotCommentMarker', getSetting('hotspot_comment_marker', 'VOUCHER_SYSTEM'));
        safeSetValue('pppoeCommentMarker', getSetting('pppoe_comment_marker', 'PPPOE_SYSTEM'));
        safeSetChecked('useSSL', getSettingChecked('mikrotik_use_ssl'));

        // Database Settings (removed databaseType as it doesn't exist)
        safeSetValue('backupInterval', getSetting('backup_interval', 60));
        safeSetChecked('autoBackup', getSettingChecked('auto_backup'));
        safeSetChecked('optimizeOnStartup', getSettingChecked('optimize_on_startup'));

        // Notification Settings
        safeSetValue('whatsappProvider', getSetting('whatsapp_provider'));
        safeSetValue('whatsappApiKey', getSetting('whatsapp_api_key'));
        safeSetChecked('notifyVoucherCreated', getSettingChecked('notify_voucher_created'));
        safeSetChecked('notifyExpiryWarning', getSettingChecked('notify_expiry_warning'));
        safeSetChecked('notifyExpired', getSettingChecked('notify_expired'));

        // System Settings
        safeSetValue('sessionTimeout', getSetting('session_timeout', 30));
        safeSetValue('logLevel', getSetting('log_level', 'info'));
        safeSetValue('cleanupSchedule', getSetting('cleanup_schedule', 24));
        safeSetValue('maxLogDays', getSetting('max_log_days', 30));
        safeSetChecked('enableRegistration', getSettingChecked('enable_registration'));
        safeSetChecked('enableDemo', getSettingChecked('enable_demo'));
        safeSetChecked('enableMaintenance', getSettingChecked('enable_maintenance'));

        // Template Settings
        safeSetValue('printTemplateType', getSetting('print_template_type', 'a4'));
        safeSetValue('templateName', getSetting('template_name', 'Default'));

        // Initialize field visibility
        this.toggleWhatsAppFields(getSetting('whatsapp_provider'));
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
        const saveBtn = document.getElementById('saveSettingsBtn');
        const originalText = saveBtn.innerHTML;
        const originalClasses = saveBtn.className;

        // 1. ANIMASI LANGSUNG: Ubah tombol menjadi loading state SEGERA
        saveBtn.disabled = true;
        saveBtn.className = 'btn btn-secondary disabled cursor-not-allowed transition-all duration-200';
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Menyimpan...';

        const formData = {};

        // Collect all form data with proper field mapping
        const forms = document.querySelectorAll('#general-panel form, #mikrotik-panel form, #database-panel form, #notification-panel form, #system-panel form');
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
                // 2. SUCCESS ANIMASI: Tampilkan success state di tombol
                saveBtn.className = 'btn btn-success disabled transition-all duration-300';
                saveBtn.innerHTML = '<i class="fas fa-check mr-2"></i>Berhasil Disimpan!';

                this.showToast('Semua pengaturan berhasil disimpan', 'success');
                this.clearChangedForms();

                // Update current settings
                this.currentSettings = result.data;

                // Kembalikan tombol ke state normal setelah 2 detik
                setTimeout(() => {
                    saveBtn.className = originalClasses;
                    saveBtn.innerHTML = originalText;
                    this.updateSaveButtonState();
                }, 2000);

            } else {
                // 3. ERROR ANIMASI: Tampilkan error state di tombol
                saveBtn.className = 'btn btn-danger disabled transition-all duration-300';
                saveBtn.innerHTML = '<i class="fas fa-times mr-2"></i>Gagal Menyimpan!';

                this.showToast(result.message || 'Gagal menyimpan pengaturan', 'error');

                // Kembalikan tombol ke state normal setelah 2 detik
                setTimeout(() => {
                    saveBtn.className = originalClasses;
                    saveBtn.innerHTML = originalText;
                    this.updateSaveButtonState();
                }, 2000);
            }
        } catch (error) {
            console.error('Error saving settings:', error);

            // 4. CONNECTION ERROR ANIMASI: Tampilkan error state di tombol
            saveBtn.className = 'btn btn-warning disabled transition-all duration-300';
            saveBtn.innerHTML = '<i class="fas fa-exclamation-triangle mr-2"></i>Koneksi Error!';

            this.showToast('Kesalahan koneksi', 'error');

            // Kembalikan tombol ke state normal setelah 2 detik
            setTimeout(() => {
                saveBtn.className = originalClasses;
                saveBtn.innerHTML = originalText;
                this.updateSaveButtonState();
            }, 2000);
        }
    }

    async saveGeneralSettings() {
        // Helper function to safely get element value
        const safeGetValue = (elementId, defaultValue = '') => {
            const element = document.getElementById(elementId);
            return element ? element.value : defaultValue;
        };

        const data = {
            company_name: safeGetValue('companyName'),
            company_address: safeGetValue('companyAddress'),
            company_phone: safeGetValue('companyPhone'),
            company_email: safeGetValue('companyEmail'),
            currency: safeGetValue('currency', 'IDR'),
            language: safeGetValue('language', 'id')
        };

        await this.saveSettingsSection('general', data);
    }

    async saveMikrotikSettings() {
        // Helper function to safely get element value/checked
        const safeGetValue = (elementId, defaultValue = '') => {
            const element = document.getElementById(elementId);
            return element ? element.value : defaultValue;
        };

        const safeGetChecked = (elementId, defaultValue = false) => {
            const element = document.getElementById(elementId);
            return element ? element.checked : defaultValue;
        };

        const data = {
            mikrotik_host: safeGetValue('mikrotikHost'),
            mikrotik_port: safeGetValue('mikrotikPort', '8728'),
            mikrotik_username: safeGetValue('mikrotikUsername'),
            mikrotik_password: safeGetValue('mikrotikPassword'),
            hotspot_comment_marker: safeGetValue('hotspotCommentMarker', 'VOUCHER_SYSTEM'),
            pppoe_comment_marker: safeGetValue('pppoeCommentMarker', 'PPPOE_SYSTEM'),
            mikrotik_use_ssl: safeGetChecked('useSSL')
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
        // Helper function to safely get element value/checked
        const safeGetValue = (elementId, defaultValue = '') => {
            const element = document.getElementById(elementId);
            return element ? element.value : defaultValue;
        };

        const safeGetChecked = (elementId, defaultValue = false) => {
            const element = document.getElementById(elementId);
            return element ? element.checked : defaultValue;
        };

        const data = {
            // Removed database_type as it doesn't exist in the form
            backup_interval: safeGetValue('backupInterval', '60'),
            auto_backup: safeGetChecked('autoBackup'),
            optimize_on_startup: safeGetChecked('optimizeOnStartup')
        };

        await this.saveSettingsSection('database', data);
    }

    async saveNotificationSettings() {
        // Helper function to safely get element value/checked
        const safeGetValue = (elementId, defaultValue = '') => {
            const element = document.getElementById(elementId);
            return element ? element.value : defaultValue;
        };

        const safeGetChecked = (elementId, defaultValue = false) => {
            const element = document.getElementById(elementId);
            return element ? element.checked : defaultValue;
        };

        const data = {
            whatsapp_provider: safeGetValue('whatsappProvider'),
            whatsapp_api_key: safeGetValue('whatsappApiKey'),
            notify_voucher_created: safeGetChecked('notifyVoucherCreated'),
            notify_expiry_warning: safeGetChecked('notifyExpiryWarning'),
            notify_expired: safeGetChecked('notifyExpired')
        };

        await this.saveSettingsSection('notification', data);
    }

  
    async saveSystemSettings() {
        // Helper function to safely get element value/checked
        const safeGetValue = (elementId, defaultValue = '') => {
            const element = document.getElementById(elementId);
            return element ? element.value : defaultValue;
        };

        const safeGetChecked = (elementId, defaultValue = false) => {
            const element = document.getElementById(elementId);
            return element ? element.checked : defaultValue;
        };

        const data = {
            session_timeout: safeGetValue('sessionTimeout', '30'),
            log_level: safeGetValue('logLevel', 'info'),
            cleanup_schedule: safeGetValue('cleanupSchedule', '24'),
            max_log_days: safeGetValue('maxLogDays', '30'),
            enable_registration: safeGetChecked('enableRegistration'),
            enable_demo: safeGetChecked('enableDemo'),
            enable_maintenance: safeGetChecked('enableMaintenance'),
            print_template_type: safeGetValue('printTemplateType', 'a4'),
            template_name: safeGetValue('templateName', 'Default')
        };

        await this.saveSettingsSection('system', data);
    }

    // Update Mikrotik status di header setelah test koneksi berhasil
    updateMikrotikStatusAfterTest(details) {
        try {
            console.log('🔄 Updating Mikrotik header status after test connection...');

            // 🔥 FIX: Update header status indicator menggunakan ID yang benar (mikrotikStatus)
            const headerStatus = document.getElementById('mikrotikStatus');
            if (headerStatus) {
                console.log('✅ Found header status element (mikrotikStatus):', headerStatus);
                if (details.connected) {
                    headerStatus.textContent = 'Connected';
                    headerStatus.className = 'text-green-400';
                    console.log('✅ Updated header status to Connected');
                } else {
                    headerStatus.textContent = 'Disconnected';
                    headerStatus.className = 'text-red-400';
                    console.log('❌ Updated header status to Disconnected');
                }
            } else {
                console.warn('⚠️ Header status element (mikrotikStatus) not found');
            }

  
            // Update global Mikrotik status in header (fallback selector)
            const globalStatus = document.querySelector('[data-mikrotik-status]');
            if (globalStatus) {
                console.log('✅ Found global status element:', globalStatus);
                globalStatus.setAttribute('data-mikrotik-status', details.connected ? 'connected' : 'disconnected');
                globalStatus.textContent = details.connected ? 'Connected' : 'Disconnected';
                console.log('✅ Updated global status to:', details.connected ? 'Connected' : 'Disconnected');
            }

            // Force trigger update untuk status monitoring system
            if (window.mikrotikStatusManager && window.mikrotikStatusManager.updateStatus) {
                window.mikrotikStatusManager.updateStatus();
                console.log('✅ Triggered global Mikrotik status manager update');
            }

            // 🔥 BONUS: Trigger immediate refresh dari footer check function
            if (typeof checkMikrotikConnection === 'function') {
                setTimeout(() => {
                    checkMikrotikConnection();
                    console.log('✅ Triggered immediate Mikrotik connection check');
                }, 500);
            }

            // 🔥 BONUS 2: Force server-side connection status update
            setTimeout(async () => {
                try {
                    const response = await fetch('/api/public/system/connection');
                    const data = await response.json();
                    const statusElement = document.getElementById('mikrotikStatus');

                    if (statusElement) {
                        if (data.connected) {
                            statusElement.textContent = 'Connected';
                            statusElement.className = 'text-green-400';
                        } else {
                            statusElement.textContent = 'Disconnected';
                            statusElement.className = 'text-red-400';
                        }
                        console.log('✅ Server-side status updated:', data.connected ? 'Connected' : 'Disconnected');
                    }
                } catch (error) {
                    console.warn('⚠️ Failed to update server-side status:', error);
                }
            }, 1000);

        } catch (error) {
            console.error('❌ Error updating Mikrotik status after test:', error);
        }
    }

    // Update Mikrotik connection status in UI
    updateMikrotikStatusUI(details) {
        try {
            // 🔥 FIX: Update header status indicator menggunakan ID yang benar (mikrotikStatus)
            const statusElement = document.getElementById('mikrotikStatus');
            if (statusElement) {
                if (details.connected) {
                    statusElement.textContent = 'Connected';
                    statusElement.className = 'text-green-400';
                } else {
                    statusElement.textContent = 'Disconnected';
                    statusElement.className = 'text-red-400';
                }
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
                    // 🔥 AUTOMATIC TEST: Test koneksi Mikrotik dengan pengaturan baru
                    console.log('🔄 Testing Mikrotik connection with new settings...');
                    const testResult = await this.testMikrotikConnectionWithCurrentSettings();

                    if (testResult.success) {
                        console.log('✅ Mikrotik connection test successful after settings save');
                        this.showToast('Pengaturan Mikrotik disimpan dan koneksi berhasil diverifikasi', 'success');
                    } else {
                        console.log('❌ Mikrotik connection test failed after settings save');
                        this.showToast('Pengaturan disimpan tapi koneksi ke Mikrotik gagal', 'warning');
                    }

                    // Update connection status regardless of test result
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
        // Helper function to safely get element value/checked
        const safeGetValue = (elementId, defaultValue = '') => {
            const element = document.getElementById(elementId);
            return element ? element.value : defaultValue;
        };

        const safeGetChecked = (elementId, defaultValue = false) => {
            const element = document.getElementById(elementId);
            return element ? element.checked : defaultValue;
        };

        // Get current form values (not saved settings)
        const settings = {
            host: safeGetValue('mikrotikHost'),
            port: safeGetValue('mikrotikPort', '8728'),
            username: safeGetValue('mikrotikUsername'),
            password: safeGetValue('mikrotikPassword'),
            use_ssl: safeGetChecked('useSSL')
        };

        await this.testMikrotikConnectionWithSettings(settings, true);
    }

    // 🔥 NEW: Force update Mikrotik status dari server (manual trigger)
    async forceUpdateMikrotikStatus() {
        try {
            console.log('🔄 Force updating Mikrotik status from server...');

            const response = await fetch('/api/public/system/connection', {
                credentials: 'include'
            });

            const data = await response.json();
            const statusElement = document.getElementById('mikrotikStatus');

            if (statusElement) {
                if (data.connected) {
                    statusElement.textContent = 'Connected';
                    statusElement.className = 'text-green-400';
                    console.log('✅ Status updated to Connected');
                } else {
                    statusElement.textContent = 'Disconnected';
                    statusElement.className = 'text-red-400';
                    console.log('❌ Status updated to Disconnected');
                }
            }

            return data.connected;
        } catch (error) {
            console.error('❌ Error force updating Mikrotik status:', error);
            return false;
        }
    }

    // Helper function to get authentication token
    getToken() {
        // Try to get token from localStorage
        const token = localStorage.getItem('authToken');
        if (token) return token;

        // Try to get token from sessionStorage
        const sessionToken = sessionStorage.getItem('authToken');
        if (sessionToken) return sessionToken;

        // Try to get token from cookie
        const cookies = document.cookie.split(';');
        for (let cookie of cookies) {
            const [name, value] = cookie.trim().split('=');
            if (name === 'authToken') return value;
        }

        return null;
    }

    // 🔥 NEW: Test koneksi dengan pengaturan yang sudah disimpan (current settings)
    async testMikrotikConnectionWithCurrentSettings() {
        try {
            // Helper function to get setting value safely
            const getSetting = (key, defaultValue = '') => {
                if (this.currentSettings[key] && typeof this.currentSettings[key] === 'object') {
                    return this.currentSettings[key].value || defaultValue;
                }
                return this.currentSettings[key] || defaultValue;
            };

            const getSettingChecked = (key, defaultValue = false) => {
                if (this.currentSettings[key] && typeof this.currentSettings[key] === 'object') {
                    return this.currentSettings[key].value === 'true';
                }
                return this.currentSettings[key] === 'true';
            };

            // Get settings from current settings (already saved)
            const settings = {
                host: getSetting('mikrotik_host'),
                port: getSetting('mikrotik_port', '8728'),
                username: getSetting('mikrotik_username'),
                password: getSetting('mikrotik_password'),
                use_ssl: getSettingChecked('mikrotik_use_ssl')
            };

            console.log('🔍 Testing Mikrotik connection with current settings:', {
                host: settings.host,
                port: settings.port,
                username: settings.username,
                hasPassword: !!settings.password,
                useSSL: settings.use_ssl
            });

            // Silent test (no modal)
            const result = await this.testMikrotikConnectionWithSettings(settings, false);

            // 🔥 NEW: Refresh main Mikrotik client connection if test successful
            if (result.success && result.info) {
                console.log('✅ Refreshing main Mikrotik client connection after successful test...');
                try {
                    const refreshResponse = await fetch('/admin/system/refresh-mikrotik-connection', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${this.getToken()}`
                        }
                    });

                    if (refreshResponse.ok) {
                        const refreshData = await refreshResponse.json();
                        console.log('✅ Main Mikrotik client refreshed successfully:', refreshData.message);
                    } else {
                        console.warn('⚠️ Warning: Failed to refresh main Mikrotik client');
                    }
                } catch (refreshError) {
                    console.warn('⚠️ Warning: Could not refresh main Mikrotik client:', refreshError);
                }

                // Update status di header
                console.log('✅ Updating Mikrotik status in header after automatic test...');
                this.updateMikrotikStatusAfterTest({
                    connected: true,
                    host: settings.host,
                    port: settings.port,
                    username: settings.username,
                    routeros: {
                        name: result.info.version || 'Unknown',
                        identity: result.info.identity || 'Unknown'
                    },
                    note: 'Automatic connection test successful'
                });
            }

            return result;

        } catch (error) {
            console.error('❌ Error testing Mikrotik connection with current settings:', error);
            return { success: false, error: error.message };
        }
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
                    <div class="inline-flex items-center justify-center w-12 h-12 border-4 border-slate-600 border-t-blue-500 rounded-full animate-spin mb-4" role="status" aria-label="Loading"></div>
                    <p class="text-slate-300">Menguji koneksi ke Mikrotik...</p>
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
                    const info = result.info || {};
                    resultDiv.innerHTML = `
                        <div class="text-center">
                            <div class="text-success mb-3">
                                <i class="fas fa-check-circle" style="font-size: 3rem;"></i>
                            </div>
                            <h5 class="text-success mb-3">Koneksi Berhasil!</h5>
                            <div class="text-start bg-slate-700/50 rounded-lg p-3 mb-3">
                                <div class="row text-sm">
                                    <div class="col-6 mb-2">
                                        <strong class="text-slate-400">Identity:</strong>
                                        <div class="text-white">${info.identity || 'Unknown'}</div>
                                    </div>
                                    <div class="col-6 mb-2">
                                        <strong class="text-slate-400">RouterOS:</strong>
                                        <div class="text-white">${info.version || 'Unknown'}</div>
                                    </div>
                                    <div class="col-6 mb-2">
                                        <strong class="text-slate-400">Platform:</strong>
                                        <div class="text-white">${info.platform || 'Unknown'}</div>
                                    </div>
                                    <div class="col-6 mb-2">
                                        <strong class="text-slate-400">Board:</strong>
                                        <div class="text-white">${info.board || 'Unknown'}</div>
                                    </div>
                                    ${info.routerboard ? `
                                    <div class="col-6 mb-2">
                                        <strong class="text-slate-400">Model:</strong>
                                        <div class="text-white">${info.routerboard}</div>
                                    </div>
                                    ` : ''}
                                    ${info.cpu ? `
                                    <div class="col-6 mb-2">
                                        <strong class="text-slate-400">CPU:</strong>
                                        <div class="text-white">${info.cpu}</div>
                                    </div>
                                    ` : ''}
                                    ${info.memory ? `
                                    <div class="col-12 mb-2">
                                        <strong class="text-slate-400">Memory:</strong>
                                        <div class="text-white">${info.memory}</div>
                                    </div>
                                    ` : ''}
                                    ${info.uptime ? `
                                    <div class="col-12">
                                        <strong class="text-slate-400">Uptime:</strong>
                                        <div class="text-white">${info.uptime}</div>
                                    </div>
                                    ` : ''}
                                </div>
                            </div>
                            <small class="text-slate-400">${result.message || 'Connection successful'}</small>
                        </div>
                    `;

                    // 🔥 UPDATE: Update Mikrotik status di header setelah test koneksi berhasil
                    console.log('🔄 Updating Mikrotik status in header after successful test...');
                    this.updateMikrotikStatusAfterTest({
                        connected: true,
                        host: settings.host,
                        port: settings.port,
                        username: settings.username,
                        routeros: { name: info.version },
                        note: 'Connection test successful'
                    });

                    return true;
                } else {
                    resultDiv.innerHTML = `
                        <div class="text-center">
                            <div class="text-red-400 mb-3">
                                <i class="fas fa-times-circle" style="font-size: 3rem;"></i>
                            </div>
                            <h5 class="text-red-400">Koneksi Gagal!</h5>
                            <p class="mb-0 text-slate-300">${result.error || result.message || 'Tidak dapat terhubung ke Mikrotik'}</p>
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

        console.log('updateSaveButtonState called');
        console.log('Save button found:', !!saveBtn);

        const hasChanges = this.hasUnsavedChanges();
        console.log('Has unsaved changes:', hasChanges);

        if (hasChanges) {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i class="fas fa-save mr-2"></i>Simpan Semua Pengaturan*';
                console.log('Save button enabled');
            }
        } else {
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.innerHTML = '<i class="fas fa-save mr-2"></i>Simpan Semua Pengaturan';
                console.log('Save button disabled');
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
        const validTabs = ['general', 'mikrotik', 'database', 'notification', 'system'];

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
        const companyName = this.currentSettings.company_name && typeof this.currentSettings.company_name === 'object'
            ? this.currentSettings.company_name.value
            : this.currentSettings.company_name || 'Mikrotik Billing System';

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