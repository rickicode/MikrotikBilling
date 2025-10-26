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
                    <td colspan="8" class="text-center text-muted">
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

            if (response.status === 401) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="8" class="text-center text-warning">
                            <i class="bi bi-exclamation-triangle"></i> Sesi telah berakhir, <a href="/login" class="text-primary">login kembali</a>
                        </td>
                    </tr>
                `;
                return;
            }

            if (result.success) {
                this.renderProfilesTable(result.data);
                this.renderPagination(result.pagination);
            } else {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="8" class="text-center text-danger">
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
                        <td colspan="8" class="text-center text-danger">
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
                    <td colspan="8" class="text-center text-muted">
                        <i class="bi bi-inbox"></i> Tidak ada data profil
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = profiles.map(profile => `
            <tr class="hover:bg-slate-700/50 transition-colors">
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="text-slate-300">${profile.id}</span>
                </td>
                <td class="px-6 py-4">
                    <div class="text-white font-medium">${this.escapeHtml(profile.name)}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-${profile.profile_type === 'hotspot' ? 'blue' : 'yellow'}-100 text-${profile.profile_type === 'hotspot' ? 'blue' : 'yellow'}-800">
                        <i class="fas fa-${profile.profile_type === 'hotspot' ? 'wifi' : 'network-wired'} mr-1"></i>
                        ${(profile.profile_type || '').toUpperCase()}
                    </span>
                </td>
                <td class="px-6 py-4">
                    <div class="text-sm text-slate-300">
                        ${profile.bandwidth_up || profile.bandwidth_down ?
                            `<div>${profile.bandwidth_up || '-'}/${profile.bandwidth_down || '-'}</div>` :
                            '<div class="text-slate-500">-</div>'
                        }
                        ${profile.burst_up || profile.burst_down ?
                            `<div class="text-xs text-yellow-400">burst: ${profile.burst_up || '-'}/${profile.burst_down || '-'}</div>` :
                            ''
                        }
                    </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm font-medium text-white">Rp ${Number(profile.selling_price || 0).toLocaleString('id-ID')}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm text-slate-300">Rp ${Number(profile.cost_price || 0).toLocaleString('id-ID')}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${profile.is_synced ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}">
                        <i class="fas fa-${profile.is_synced ? 'check-circle' : 'exclamation-triangle'} mr-1"></i>
                        ${profile.is_synced ? 'Tersinkron' : 'Belum Sync'}
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div class="flex justify-end space-x-2">
                        <button onclick="profileManager.editProfile(${profile.id})" class="text-blue-400 hover:text-blue-300 hover:bg-blue-900/20 p-2 rounded-lg transition-colors" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button onclick="profileManager.syncProfile(${profile.id})" class="text-green-400 hover:text-green-300 hover:bg-green-900/20 p-2 rounded-lg transition-colors" title="Sync dengan Mikrotik">
                            <i class="fas fa-sync"></i>
                        </button>
                        <button onclick="profileManager.deleteProfile(${profile.id})" class="text-red-400 hover:text-red-300 hover:bg-red-900/20 p-2 rounded-lg transition-colors" title="Hapus">
                            <i class="fas fa-trash"></i>
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

            if (response.status === 401) {
                console.warn('Session expired for stats, user needs to re-login');
                return;
            }

            if (result.success) {
                // Update total profiles with counter animation
                const totalEl = document.getElementById('totalProfiles');
                if (totalEl) {
                    const target = result.data.total || 0;
                    totalEl.dataset.target = target;
                    totalEl.textContent = target;
                    if (window.animateCounter && target > 0) {
                        window.animateCounter(totalEl, target);
                    }
                }

                // Update hotspot profiles
                const hotspotEl = document.getElementById('hotspotProfiles');
                if (hotspotEl) {
                    const target = result.data.hotspot || 0;
                    hotspotEl.dataset.target = target;
                    hotspotEl.textContent = target;
                    if (window.animateCounter && target > 0) {
                        window.animateCounter(hotspotEl, target);
                    }
                }

                // Update PPPoE profiles
                const pppoeEl = document.getElementById('pppoeProfiles');
                if (pppoeEl) {
                    const target = result.data.pppoe || 0;
                    pppoeEl.dataset.target = target;
                    pppoeEl.textContent = target;
                    if (window.animateCounter && target > 0) {
                        window.animateCounter(pppoeEl, target);
                    }
                }

                // Update sync status with actual sync calculation
                const syncStatus = document.getElementById('syncStatus');
                if (syncStatus) {
                    const total = result.data.total || 0;
                    const synced = result.data.synced || 0;
                    const syncPercentage = total > 0 ? Math.round((synced / total) * 100) : 0;

                    syncStatus.innerHTML = `
                        <span class="px-3 py-1 ${syncPercentage === 100 ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'} rounded-full text-sm font-medium">
                            ${syncPercentage}% (${synced}/${total})
                        </span>
                    `;
                }

                // Update sync percentage display
                const syncPercentageEl = document.getElementById('syncPercentage');
                if (syncPercentageEl) {
                    const total = result.data.total || 0;
                    const synced = result.data.synced || 0;
                    const syncPercentage = total > 0 ? Math.round((synced / total) * 100) : 0;
                    syncPercentageEl.textContent = `${syncPercentage}%`;
                }

                // Update percentages
                this.updatePercentages(result.data);
            } else {
                this.setDefaultStats();
            }
        } catch (error) {
            console.error('Error loading stats:', error);
            this.setDefaultStats();
        }
    }

    setDefaultStats() {
        document.getElementById('totalProfiles').innerHTML = '<span class="text-3xl font-bold text-white">0</span>';
        document.getElementById('hotspotProfiles').innerHTML = '<span class="text-3xl font-bold text-white">0</span>';
        document.getElementById('pppoeProfiles').innerHTML = '<span class="text-3xl font-bold text-white">0</span>';
        document.getElementById('syncStatus').innerHTML = '<span class="px-3 py-1 bg-red-500/20 text-red-400 rounded-full text-sm font-medium">Error</span>';
    }

    updatePercentages(data) {
        if (data.total > 0) {
            const hotspotPercentage = Math.round((data.hotspot / data.total) * 100);
            const pppoePercentage = Math.round((data.pppoe / data.total) * 100);

            const hotspotPercentageEl = document.getElementById('hotspotPercentage');
            if (hotspotPercentageEl) hotspotPercentageEl.textContent = `${hotspotPercentage}%`;

            const pppoePercentageEl = document.getElementById('pppoePercentage');
            if (pppoePercentageEl) pppoePercentageEl.textContent = `${pppoePercentage}%`;
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

        modal.classList.remove('hidden');
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

        // Map form fields to backend field names
        const mappedData = {
            name: data.name,
            type: data.profile_type || data.type,
            bandwidth_up: data.bandwidth_up,
            bandwidth_down: data.bandwidth_down,
            time_limit: data.duration_hours, // Map duration_hours to time_limit
            price_sell: data.price_sell,
            price_cost: data.price_cost,
            managed_by: data.managed_by || 'system',
            burst_up: data.burst_up,
            burst_down: data.burst_down,
            burst_threshold: data.burst_threshold,
            burst_time: data.burst_time
        };

        // Parse duration_hours - ensure it's a number
        if (mappedData.time_limit) {
            mappedData.time_limit = parseInt(mappedData.time_limit) || 0;
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
                body: JSON.stringify(mappedData)
            });

            const result = await response.json();

            if (result.success) {
                document.getElementById('profileModal').classList.add('hidden');

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
                    'Content-Type': 'application/json',
                    'CSRF-Token': this.getCSRFToken()
                },
                body: JSON.stringify({})
            });

            const result = await response.json();

            if (response.status === 401) {
                this.showToast('Sesi telah berakhir, silakan login kembali', 'error');
                // Redirect to login after a short delay
                setTimeout(() => {
                    window.location.href = '/login';
                }, 2000);
                throw new Error('Authentication required');
            }

            if (response.status === 403) {
                this.showToast('Anda tidak memiliki izin untuk melakukan sinkronisasi', 'error');
                throw new Error('Permission denied');
            }

            if (result.success) {
                this.showToast('Profil berhasil disinkronkan', 'success');

                // Update sync status immediately in the UI without waiting for server refresh
                this.updateProfileSyncStatus(id, true);

                // Then refresh the full data
                this.loadProfiles();
                this.loadStats();
                return result; // Return result for auto-sync
            } else {
                throw new Error(result.message || 'Gagal sinkronisasi profil');
            }
        } catch (error) {
            console.error('Error syncing profile:', error);
            if (error.message === 'Authentication required' || error.message === 'Permission denied') {
                throw error; // Re-throw authentication errors
            }
            this.showToast('Kesalahan koneksi ke server', 'error');
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

    updateProfileSyncStatus(profileId, isSynced) {
        // Update sync status immediately in the UI
        const rows = document.querySelectorAll('#profilesTableBody tr');
        rows.forEach(row => {
            const syncButton = row.querySelector(`button[onclick*="syncProfile(${profileId})"]`);
            if (syncButton) {
                // Find the sync status cell in this row
                const cells = row.querySelectorAll('td');
                cells.forEach(cell => {
                    if (cell.textContent.includes('Belum Sync') || cell.textContent.includes('Tersinkron')) {
                        if (isSynced) {
                            cell.innerHTML = `
                                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                    <i class="fas fa-check-circle mr-1"></i>
                                    Tersinkron
                                </span>
                            `;
                        } else {
                            cell.innerHTML = `
                                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                    <i class="fas fa-exclamation-triangle mr-1"></i>
                                    Belum Sync
                                </span>
                            `;
                        }
                    }
                });
            }
        });
    }

    showToast(message, type = 'info') {
        // Gunakan global toast helper untuk konsistensi
        if (window.showToast) {
            window.showToast(message, type);
        } else {
            // Fallback jika global toast tidak tersedia
            console.log(`Toast (${type}): ${message}`);
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

// Global Toast Helper sudah di-load dari toast-helper.js
// Tidak perlu duplikasi di sini

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
        modal.classList.add('hidden');
    }
};

window.closeDeleteModal = function() {
    const modal = document.getElementById('deleteConfirmModal');
    if (modal) {
        modal.classList.add('hidden');
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