/**
 * Profile Management JavaScript
 * Handles profile CRUD operations, Mikrotik sync, and real-time updates
 */

class ProfileManager {
    constructor() {
        this.currentPage = 1;
        this.limit = 10;
        this.filters = {
            search: '',
            type: '',
            sync: ''
        };
        this.init();
    }

    init() {
        this.bindEvents();
        this.setupBurstCalculator();
        this.loadProfiles();
        this.loadStats();
        this.startAutoRefresh();
    }

    bindEvents() {
        // Search and filter
        document.getElementById('searchProfile')?.addEventListener('input', this.debounce(() => {
            this.filters.search = document.getElementById('searchProfile').value;
            this.currentPage = 1;
            this.loadProfiles();
        }, 300));

        document.getElementById('filterType')?.addEventListener('change', () => {
            this.filters.type = document.getElementById('filterType').value;
            this.currentPage = 1;
            this.loadProfiles();
        });

        document.getElementById('filterSync')?.addEventListener('change', () => {
            this.filters.sync = document.getElementById('filterSync').value;
            this.currentPage = 1;
            this.loadProfiles();
        });

        document.getElementById('applyFilterBtn')?.addEventListener('click', () => {
            this.loadProfiles();
        });

        // Modal events
        document.getElementById('addProfileBtn')?.addEventListener('click', () => {
            this.showProfileModal();
        });

        document.getElementById('saveProfileBtn')?.addEventListener('click', () => {
            this.saveProfile();
        });

        document.getElementById('syncProfilesBtn')?.addEventListener('click', () => {
            this.syncAllProfiles();
        });
        document.getElementById('injectScriptsBtn')?.addEventListener('click', () => {
            this.injectAllScripts();
        });

        // Per page selector
        document.getElementById('pageSizeSelect')?.addEventListener('change', (e) => {
            this.limit = parseInt(e.target.value);
            this.currentPage = 1;
            this.loadProfiles();
        });

        // Form validation
        document.getElementById('profileForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveProfile();
        });

        // Profile type change handler
        document.getElementById('profileType')?.addEventListener('change', (e) => {
            this.toggleProfileTypeFields(e.target.value);
        });

        // Enable burst limit checkbox handler
        document.getElementById('enableBurst')?.addEventListener('change', (e) => {
            this.toggleBurstFields(e.target.checked);
        });
    }

    toggleProfileTypeFields(type) {
        const durationHoursField = document.getElementById('durationHours');

        if (durationHoursField) {
            if (type === 'hotspot') {
                durationHoursField.parentElement.style.display = 'block';
            } else {
                durationHoursField.parentElement.style.display = 'none';
            }
        }
    }

    toggleBurstFields(enabled) {
        const burstCalculatorFields = document.getElementById('burstCalculatorFields');

        if (burstCalculatorFields) {
            burstCalculatorFields.style.display = enabled ? 'block' : 'none';
        }

        // Clear fields when disabled
        if (!enabled) {
            document.getElementById('normalUp').value = '';
            document.getElementById('normalDown').value = '';
            document.getElementById('burstUp').value = '';
            document.getElementById('burstDown').value = '';
            document.getElementById('burstThreshold').value = '';
            document.getElementById('burstTime').value = '';
        }
    }

    // Setup burst calculator event listeners
    setupBurstCalculator() {
        const inputs = ['normalUp', 'normalDown', 'burstUp', 'burstDown', 'burstThreshold', 'burstTime'];
        inputs.forEach(inputId => {
            const input = document.getElementById(inputId);
            if (input) {
                input.addEventListener('input', () => this.calculateBurstValues());
            }
        });
    }

    // Convert bandwidth to kbps
    convertToKbps(value, unit) {
        const numValue = parseFloat(value) || 0;
        switch (unit) {
            case 'K': return numValue;
            case 'M': return numValue * 1000;
            case 'G': return numValue * 1000 * 1000;
            default: return numValue;
        }
    }

    // Convert kbps to appropriate unit
    convertFromKbps(kbps) {
        if (kbps >= 1000 * 1000) {
            return { value: (kbps / (1000 * 1000)).toFixed(1), unit: 'G' };
        } else if (kbps >= 1000) {
            return { value: (kbps / 1000).toFixed(1), unit: 'M' };
        } else {
            return { value: kbps.toFixed(0), unit: 'K' };
        }
    }

    // Calculate burst values and update hidden fields
    calculateBurstValues() {
        const normalUp = document.getElementById('normalUp').value;
        const normalUpUnit = document.getElementById('normalUpUnit').value;
        const normalDown = document.getElementById('normalDown').value;
        const normalDownUnit = document.getElementById('normalDownUnit').value;
        const burstUp = document.getElementById('burstUp').value;
        const burstUpUnit = document.getElementById('burstUpUnit').value;
        const burstDown = document.getElementById('burstDown').value;
        const burstDownUnit = document.getElementById('burstDownUnit').value;
        const burstThreshold = document.getElementById('burstThreshold').value;
        const burstTime = document.getElementById('burstTime').value;

        // Convert to kbps for calculations
        const normalUpKbps = this.convertToKbps(normalUp, normalUpUnit);
        const normalDownKbps = this.convertToKbps(normalDown, normalDownUnit);
        const burstUpKbps = this.convertToKbps(burstUp, burstUpUnit);
        const burstDownKbps = this.convertToKbps(burstDown, burstDownUnit);

        // Calculate threshold in kbps
        const thresholdPercent = parseFloat(burstThreshold) || 50;
        const thresholdUpKbps = Math.round(normalUpKbps * (thresholdPercent / 100));
        const thresholdDownKbps = Math.round(normalDownKbps * (thresholdPercent / 100));

        // Update hidden fields with Mikrotik format
        const burstUpHidden = document.getElementById('burstUpHidden');
        const burstDownHidden = document.getElementById('burstDownHidden');
        const burstThresholdHidden = document.getElementById('burstThresholdHidden');
        const burstTimeHidden = document.getElementById('burstTimeHidden');

        if (burstUpHidden) burstUpHidden.value = burstUpKbps > 0 ? `${burstUpKbps}/${normalUpKbps}` : '';
        if (burstDownHidden) burstDownHidden.value = burstDownKbps > 0 ? `${burstDownKbps}/${normalDownKbps}` : '';
        if (burstThresholdHidden) burstThresholdHidden.value = `${thresholdUpKbps}/${thresholdDownKbps}`;
        if (burstTimeHidden) burstTimeHidden.value = burstTime || '';

        // Show preview of calculated values
        this.updateBurstPreview(normalUpKbps, normalDownKbps, burstUpKbps, burstDownKbps, thresholdUpKbps, thresholdDownKbps, burstTime);
    }

    // Update burst preview display
    updateBurstPreview(normalUp, normalDown, burstUp, burstDown, thresholdUp, thresholdDown, burstTime) {
        let preview = document.getElementById('burstPreview');

        if (!preview) {
            const previewContainer = document.createElement('div');
            previewContainer.id = 'burstPreview';
            previewContainer.className = 'alert alert-info mt-3';
            previewContainer.style.fontSize = '0.875rem';

            const burstCalculatorFields = document.getElementById('burstCalculatorFields');
            if (burstCalculatorFields) {
                burstCalculatorFields.appendChild(previewContainer);
            }
            preview = previewContainer;
        }

        if (burstUp > 0 && burstDown > 0) {
            const normalUpConverted = this.convertFromKbps(normalUp);
            const normalDownConverted = this.convertFromKbps(normalDown);
            const burstUpConverted = this.convertFromKbps(burstUp);
            const burstDownConverted = this.convertFromKbps(burstDown);
            const thresholdUpConverted = this.convertFromKbps(thresholdUp);
            const thresholdDownConverted = this.convertFromKbps(thresholdDown);

            preview.innerHTML = `
                <strong>Burst Configuration Preview:</strong><br>
                Normal: ${normalUpConverted.value}${normalUpConverted.unit}↑ / ${normalDownConverted.value}${normalDownConverted.unit}↓<br>
                Burst: ${burstUpConverted.value}${burstUpConverted.unit}↑ / ${burstDownConverted.value}${burstDownConverted.unit}↓<br>
                Threshold: ${thresholdUpConverted.value}${thresholdUpConverted.unit}↑ / ${thresholdDownConverted.value}${thresholdDownConverted.unit}↓ (${Math.round((thresholdUp / normalUp) * 100)}%)<br>
                Duration: ${burstTime || 0} detik
            `;
            preview.style.display = 'block';
        } else {
            preview.style.display = 'none';
        }
    }

    async loadProfiles() {
        try {
            const tbody = document.getElementById('profilesTableBody');
            if (!tbody) return;

            tbody.innerHTML = `
                <tr>
                    <td colspan="9" class="text-center text-muted">
                        <div class="spinner-border spinner-border-sm me-2" role="status"></div>
                        Memuat data...
                    </td>
                </tr>
            `;

            const params = new URLSearchParams({
                page: this.currentPage,
                limit: this.limit,
                ...this.filters
            });

            const response = await fetch(`/api/profiles?${params}`);
            const result = await response.json();

            if (result.success) {
                this.renderProfilesTable(result.data);
                this.renderPagination(result.pagination);
            } else {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="9" class="text-center text-danger">
                            <i class="bi bi-exclamation-triangle"></i> ${result.message || 'Gagal memuat data'}
                        </td>
                    </tr>
                `;
            }
        } catch (error) {
            console.error('Error loading profiles:', error);
            const tbody = document.getElementById('profilesTableBody');
            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="9" class="text-center text-danger">
                            <i class="bi bi-exclamation-triangle"></i> Kesalahan koneksi
                        </td>
                    </tr>
                `;
            }
        }
    }

    renderProfilesTable(profiles) {
        const tbody = document.getElementById('profilesTableBody');
        if (!tbody) return;

        if (profiles.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" class="text-center text-muted">
                        <i class="bi bi-inbox"></i> Tidak ada data profil
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = profiles.map(profile => `
            <tr>
                <td>${profile.id}</td>
                <td>
                    <strong>${this.escapeHtml(profile.name)}</strong>
                                    </td>
                <td>
                    <span class="badge bg-${profile.profile_type === 'hotspot' ? 'primary' : 'warning'}">
                        <i class="bi bi-${profile.profile_type === 'hotspot' ? 'wifi' : 'ethernet'}"></i>
                        ${(profile.profile_type || '').toUpperCase()}
                    </span>
                </td>
                <td>
                    ${profile.bandwidth_up || profile.bandwidth_down ?
                        `<small>${profile.bandwidth_up || '-'}/${profile.bandwidth_down || '-'}</small>` :
                        '<span class="text-muted">-</span>'
                    }
                    ${profile.burst_up || profile.burst_down ?
                        `<br><small class="text-warning">burst: ${profile.burst_up || '-'}/${profile.burst_down || '-'}</small>` :
                        ''
                    }
                </td>
                <td>Rp ${Number(profile.selling_price || 0).toLocaleString('id-ID')}</td>
                <td>Rp ${Number(profile.cost_price || 0).toLocaleString('id-ID')}</td>
                <td>
                    <span class="badge bg-${profile.managed_by === 'system' ? 'success' : 'secondary'}">
                        <i class="bi bi-${profile.managed_by === 'system' ? 'gear' : 'person'}"></i>
                        ${profile.managed_by === 'system' ? 'System' : 'Manual'}
                    </span>
                </td>
                <td>
                    <span class="badge bg-success">
                        <i class="bi bi-check-circle"></i> Tersinkron
                    </span>
                </td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-primary" onclick="profileManager.editProfile(${profile.id})" title="Edit">
                            <i class="bi bi-pencil"></i>
                        </button>
                        <button class="btn btn-outline-success" onclick="profileManager.syncProfile(${profile.id})" title="Sync dengan Mikrotik">
                            <i class="bi bi-arrow-clockwise"></i>
                        </button>
                        <button class="btn btn-outline-danger" onclick="profileManager.deleteProfile(${profile.id})" title="Hapus">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    renderPagination(pagination) {
        const nav = document.getElementById('paginationNav');
        if (!nav) return;

        let html = '';

        // Previous button
        html += `
            <li class="page-item ${pagination.current === 1 ? 'disabled' : ''}">
                <a class="page-link" href="#" onclick="profileManager.goToPage(${pagination.current - 1})" aria-label="Previous">
                    <i class="bi bi-chevron-left"></i>
                </a>
            </li>
        `;

        // Page numbers with ellipsis
        const totalPages = pagination.total;
        const currentPage = pagination.current;

        // Always show first page
        if (totalPages > 0) {
            html += `
                <li class="page-item ${currentPage === 1 ? 'active' : ''}">
                    <a class="page-link" href="#" onclick="profileManager.goToPage(1)">1</a>
                </li>
            `;
        }

        // Show ellipsis after first page if needed
        if (currentPage > 4) {
            html += `
                <li class="page-item disabled">
                    <span class="page-link">...</span>
                </li>
            `;
        }

        // Show pages around current page
        for (let i = Math.max(2, currentPage - 2); i <= Math.min(totalPages - 1, currentPage + 2); i++) {
            if (i !== 1 && i !== totalPages) {
                html += `
                    <li class="page-item ${i === currentPage ? 'active' : ''}">
                        <a class="page-link" href="#" onclick="profileManager.goToPage(${i})">${i}</a>
                    </li>
                `;
            }
        }

        // Show ellipsis before last page if needed
        if (currentPage < totalPages - 3) {
            html += `
                <li class="page-item disabled">
                    <span class="page-link">...</span>
                </li>
            `;
        }

        // Always show last page if there is more than one page
        if (totalPages > 1) {
            html += `
                <li class="page-item ${currentPage === totalPages ? 'active' : ''}">
                    <a class="page-link" href="#" onclick="profileManager.goToPage(${totalPages})">${totalPages}</a>
                </li>
            `;
        }

        // Next button
        html += `
            <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
                <a class="page-link" href="#" onclick="profileManager.goToPage(${currentPage + 1})" aria-label="Next">
                    <i class="bi bi-chevron-right"></i>
                </a>
            </li>
        `;

        nav.innerHTML = html;

        // Update pagination info
        this.updatePaginationInfo(pagination);
    }

    updatePaginationInfo(pagination) {
        // Fix NaN issues with proper validation
        const currentPage = parseInt(pagination.current) || 1;
        const pageSize = parseInt(pagination.limit) || 10;
        const totalPages = parseInt(pagination.total) || 1;
        const totalItems = parseInt(pagination.total_items) || 0;

        const startItem = totalItems > 0 ? (currentPage - 1) * pageSize + 1 : 0;
        const endItem = Math.min(currentPage * pageSize, totalItems);

        const startEl = document.getElementById('startItem');
        const endEl = document.getElementById('endItem');
        const totalEl = document.getElementById('totalItems');

        if (startEl) startEl.textContent = startItem;
        if (endEl) endEl.textContent = endItem;
        if (totalEl) totalEl.textContent = totalItems;

        // Update page size selector
        const pageSizeSelect = document.getElementById('pageSizeSelect');
        if (pageSizeSelect) {
            pageSizeSelect.value = pageSize;
        }

        // Hide pagination container if only one page or no items
        const paginationContainer = document.querySelector('.pagination-container');
        if (paginationContainer) {
            if (totalPages <= 1 || totalItems === 0) {
                paginationContainer.style.display = 'none';
            } else {
                paginationContainer.style.display = 'flex';
            }
        }
    }

    async loadStats() {
        try {
            const response = await fetch('/api/profiles/stats');
            const result = await response.json();

            if (result.success) {
                document.getElementById('totalProfiles').innerHTML = result.data.total;
                document.getElementById('hotspotProfiles').innerHTML = result.data.hotspot;
                document.getElementById('pppoeProfiles').innerHTML = result.data.pppoe;

                const syncStatus = document.getElementById('syncStatus');
                let syncPercentage = 0;
                if (result.data.total > 0) {
                    syncPercentage = (result.data.synced / result.data.total * 100).toFixed(0);
                }
                syncStatus.innerHTML = `
                    <span class="badge bg-${syncPercentage == 100 ? 'success' : 'warning'}">
                        ${syncPercentage}% (${result.data.synced}/${result.data.total})
                    </span>
                `;
            }
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }

    showProfileModal(profile = null) {
        const modal = document.getElementById('profileModal');
        const form = document.getElementById('profileForm');
        const title = document.getElementById('profileModalTitle');

        if (!modal || !form || !title) return;

        // Reset form
        form.reset();

        if (profile) {
            title.textContent = 'Edit Profil';
            document.getElementById('profileName').value = profile.name || '';
            document.getElementById('profileType').value = profile.profile_type || '';
            document.getElementById('priceSell').value = profile.selling_price || '';
            document.getElementById('priceCost').value = profile.cost_price || '';
            // duration_hours field replaced time_limit
            document.getElementById('durationHours').value = profile.duration_hours || '';
            document.getElementById('managedBy').value = profile.managed_by || 'manual';

            // Load burst limit fields
            const hasBurst = profile.burst_up || profile.burst_down;
            if (hasBurst) {
                document.getElementById('enableBurst').checked = true;

                // Parse burst values from Mikrotik format (e.g., "5000/1000")
                if (profile.burst_up && profile.burst_up.includes('/')) {
                    const [burst, normal] = profile.burst_up.split('/');
                    document.getElementById('burstUp').value = this.convertFromKbps(parseInt(burst)).value;
                    document.getElementById('normalUp').value = this.convertFromKbps(parseInt(normal)).value;
                }

                if (profile.burst_down && profile.burst_down.includes('/')) {
                    const [burst, normal] = profile.burst_down.split('/');
                    document.getElementById('burstDown').value = this.convertFromKbps(parseInt(burst)).value;
                    document.getElementById('normalDown').value = this.convertFromKbps(parseInt(normal)).value;
                }

                if (profile.burst_threshold && profile.burst_threshold.includes('/')) {
                    const [thresholdUp, thresholdDown] = profile.burst_threshold.split('/');
                    const normalUp = parseInt(document.getElementById('normalUp').value) || 1;
                    const thresholdPercent = Math.round((parseInt(thresholdUp) / (normalUp * 1000)) * 100);
                    document.getElementById('burstThreshold').value = thresholdPercent || 50;
                }

                document.getElementById('burstTime').value = profile.burst_time || '';
                this.toggleBurstFields(true);
                this.calculateBurstValues();
            }

            form.dataset.mode = 'edit';
            form.dataset.id = profile.id;
        } else {
            title.textContent = 'Tambah Profil';
            form.dataset.mode = 'create';
            delete form.dataset.id;
        }

        this.toggleProfileTypeFields(profile?.type || '');

        const modalInstance = new bootstrap.Modal(modal);
        modalInstance.show();
    }

    async saveProfile() {
        const form = document.getElementById('profileForm');
        if (!form) return;

        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        // Parse duration_hours - ensure it's a number
        if (data.duration_hours) {
            data.duration_hours = parseInt(data.duration_hours) || 0;
        }

        try {
            const url = form.dataset.mode === 'edit' ?
                `/profiles/${form.dataset.id}` : '/profiles';

            const method = form.dataset.mode === 'edit' ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'CSRF-Token': this.getCSRFToken()
                },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (result.success) {
                const modal = bootstrap.Modal.getInstance(document.getElementById('profileModal'));
                modal.hide();

                this.showToast('Profil berhasil disimpan, menyinkronkan ke RouterOS...', 'success');

                // Auto sync to RouterOS after save (if enabled)
                const autoSyncEnabled = document.getElementById('autoSync')?.checked ?? true;
                if (autoSyncEnabled) {
                    try {
                        let profileId;
                        if (form.dataset.mode === 'edit') {
                            profileId = form.dataset.id;
                        } else {
                            // For new profiles, get the ID from the latest inserted record
                            const profilesResponse = await fetch('/api/profiles?limit=1&sort=created_at&order=desc');
                            const profilesResult = await profilesResponse.json();
                            if (profilesResult.success && profilesResult.data.length > 0) {
                                profileId = profilesResult.data[0].id;
                            }
                        }

                        if (profileId) {
                            await this.syncProfile(profileId);
                            this.showToast('Profil berhasil disinkronkan ke RouterOS', 'success');
                        }
                    } catch (syncError) {
                        console.error('Auto-sync error:', syncError);
                        this.showToast('Profil disimpan tetapi gagal disinkronkan ke RouterOS', 'warning');
                    }
                } else {
                    this.showToast('Profil berhasil disimpan', 'success');
                }

                this.loadProfiles();
                this.loadStats();
            } else {
                this.showToast(result.message || 'Gagal menyimpan profil', 'error');
            }
        } catch (error) {
            console.error('Error saving profile:', error);
            this.showToast('Kesalahan koneksi', 'error');
        }
    }

    async editProfile(id) {
        try {
            const response = await fetch(`/api/profiles/${id}`);
            const result = await response.json();

            if (result.success) {
                this.showProfileModal(result.data);
            } else {
                this.showToast(result.message || 'Gagal memuat profil', 'error');
            }
        } catch (error) {
            console.error('Error loading profile:', error);
            this.showToast('Kesalahan koneksi', 'error');
        }
    }

    async syncProfile(id) {
        try {
            const response = await fetch(`/api/profiles/${id}/sync`, {
                method: 'POST',
                headers: {
                    'CSRF-Token': this.getCSRFToken()
                }
            });

            const result = await response.json();

            if (result.success) {
                this.showToast('Profil berhasil disinkronkan', 'success');
                this.loadProfiles();
                this.loadStats();
                return result; // Return result for auto-sync
            } else {
                throw new Error(result.message || 'Gagal sinkronisasi profil');
            }
        } catch (error) {
            console.error('Error syncing profile:', error);
            throw error; // Re-throw for auto-sync error handling
        }
    }

    async syncAllProfiles() {
        const btn = document.getElementById('syncProfilesBtn');
        if (!btn) return;

        const originalHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="spinner-border spinner-border-sm me-2"></i>Menyinkronkan...';

        try {
            const response = await fetch('/api/profiles/sync-all', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'CSRF-Token': this.getCSRFToken()
                },
                body: JSON.stringify({})
            });

            const result = await response.json();

            if (result.success) {
                this.showToast('Semua profil berhasil disinkronkan', 'success');
                this.loadProfiles();
                this.loadStats();
            } else {
                this.showToast(result.message || 'Gagal sinkronisasi profil', 'error');
            }
        } catch (error) {
            console.error('Error syncing profiles:', error);
            this.showToast('Kesalahan koneksi', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
        }
    }

    async injectAllScripts() {
        const btn = document.getElementById('injectScriptsBtn');
        if (!btn) return;
        const originalHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="spinner-border spinner-border-sm me-2"></i>Menginjeksikan...';

        try {
            const response = await fetch('/profiles/inject-scripts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'CSRF-Token': this.getCSRFToken()
                },
                body: JSON.stringify({})
            });

            if (response.redirected) {
                // Server sent redirect, show success message from URL params
                const url = new URL(response.url);
                const success = url.searchParams.get('success');
                const error = url.searchParams.get('error');

                if (success) {
                    this.showToast(decodeURIComponent(success), 'success');
                    this.loadProfiles();
                    this.loadStats();
                } else if (error) {
                    this.showToast(decodeURIComponent(error), 'error');
                }
            } else {
                this.showToast('Script injection completed', 'success');
                this.loadProfiles();
                this.loadStats();
            }
        } catch (error) {
            console.error('Error injecting scripts:', error);
            this.showToast('Kesalahan koneksi saat menginjeksikan script', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
        }
    }

    async deleteProfile(id) {
        if (!confirm('Apakah Anda yakin ingin menghapus profil ini?')) {
            return;
        }

        try {
            const response = await fetch(`/profiles/${id}`, {
                method: 'DELETE',
                headers: {
                    'CSRF-Token': this.getCSRFToken()
                }
            });

            const result = await response.json();

            if (result.success) {
                this.showToast('Profil berhasil dihapus', 'success');
                this.loadProfiles();
                this.loadStats();
            } else {
                this.showToast(result.message || 'Gagal menghapus profil', 'error');
            }
        } catch (error) {
            console.error('Error deleting profile:', error);
            this.showToast('Kesalahan koneksi', 'error');
        }
    }

    goToPage(page) {
        this.currentPage = page;
        this.loadProfiles();
    }

    startAutoRefresh() {
        // Auto refresh stats every 30 seconds
        setInterval(() => {
            this.loadStats();
        }, 30000);
    }

    showToast(message, type = 'info') {
        const toastContainer = document.getElementById('toastContainer') || this.createToastContainer();

        const toast = document.createElement('div');
        toast.className = `toast align-items-center text-white bg-${type === 'error' ? 'danger' : type} border-0`;
        toast.setAttribute('role', 'alert');
        toast.innerHTML = `
            <div class="d-flex">
                <div class="toast-body">
                    ${message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>
        `;

        toastContainer.appendChild(toast);

        const bsToast = new bootstrap.Toast(toast, {
            autohide: true,
            delay: 3000
        });

        bsToast.show();

        toast.addEventListener('hidden.bs.toast', () => {
            toast.remove();
        });
    }

    createToastContainer() {
        const container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
        container.style.zIndex = '1055';
        document.body.appendChild(container);
        return container;
    }

    getCSRFToken() {
        // CSRF token is disabled for local development, return empty string
        return '';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

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
    }

    parseTimeLimit(timeString) {
        if (!timeString) return null;

        // If it's already a number, return it as minutes
        if (!isNaN(timeString)) {
            return parseInt(timeString);
        }

        // Parse flexible formats like "1d", "1m", "1h", "1w"
        const match = timeString.match(/^(\d+)([dhmw])$/i);
        if (!match) return null;

        const value = parseInt(match[1]);
        const unit = match[2].toLowerCase();

        switch (unit) {
            case 'w': // weeks
                return value * 7 * 24 * 60;
            case 'd': // days
                return value * 24 * 60;
            case 'h': // hours
                return value * 60;
            case 'm': // minutes
                return value;
            default:
                return null;
        }
    }

    formatTimeLimit(minutes) {
        if (!minutes) return '';

        if (minutes < 60) {
            return `${minutes}m`;
        } else if (minutes < 24 * 60) {
            const hours = Math.floor(minutes / 60);
            const remainingMinutes = minutes % 60;
            return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
        } else if (minutes < 7 * 24 * 60) {
            const days = Math.floor(minutes / (24 * 60));
            const remainingHours = Math.floor((minutes % (24 * 60)) / 60);
            return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
        } else {
            const weeks = Math.floor(minutes / (7 * 24 * 60));
            const remainingDays = Math.floor((minutes % (7 * 24 * 60)) / (24 * 60));
            return remainingDays > 0 ? `${weeks}w ${remainingDays}d` : `${weeks}w`;
        }
    }
}

// Global functions for onclick handlers
window.syncProfiles = function() {
    if (window.profileManager) {
        window.profileManager.syncAllProfiles();
    }
};

window.injectScripts = function() {
    if (window.profileManager) {
        window.profileManager.injectAllScripts();
    }
};

window.showAddProfileModal = function() {
    if (window.profileManager) {
        window.profileManager.showProfileModal();
    }
};

window.refreshProfiles = function() {
    if (window.profileManager) {
        window.profileManager.loadProfiles();
    }
};

window.changePage = function(direction) {
    if (window.profileManager) {
        if (direction === 'prev' && window.profileManager.currentPage > 1) {
            window.profileManager.currentPage--;
            window.profileManager.loadProfiles();
        } else if (direction === 'next') {
            window.profileManager.currentPage++;
            window.profileManager.loadProfiles();
        }
    }
};

window.closeProfileModal = function() {
    const modal = document.getElementById('profileModal');
    if (modal) {
        const modalInstance = bootstrap.Modal.getInstance(modal) || new bootstrap.Modal(modal);
        modalInstance.hide();
    }
};

window.closeDeleteModal = function() {
    const modal = document.getElementById('deleteConfirmModal');
    if (modal) {
        const modalInstance = bootstrap.Modal.getInstance(modal) || new bootstrap.Modal(modal);
        modalInstance.hide();
    }
};

window.saveProfile = function() {
    if (window.profileManager) {
        window.profileManager.saveProfile();
    }
};

window.confirmDelete = function() {
    // Will be implemented if needed
    console.log('Delete confirmation to be implemented');
};

// Initialize profile manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.profileManager = new ProfileManager();
});