// Voucher Management JavaScript - Enhanced for Shadcn-style Interface
document.addEventListener('DOMContentLoaded', function() {
    'use strict';

    // Utility functions
    const Utils = {
        sanitizeInput(input) {
            if (!input) return '';
            const div = document.createElement('div');
            div.textContent = input;
            return div.innerHTML;
        },

        formatCurrency(amount) {
            return new Intl.NumberFormat('id-ID', {
                style: 'currency',
                currency: 'IDR',
                minimumFractionDigits: 0
            }).format(amount || 0);
        },

        formatDate(dateString) {
            if (!dateString) return '-';
            const date = new Date(dateString);
            return date.toLocaleDateString('id-ID', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        },

        formatDateTime(dateString) {
            if (!dateString) return '-';
            const date = new Date(dateString);
            return date.toLocaleString('id-ID', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        },

        formatDuration(voucher) {
            if (!voucher) return '-';

            // Use duration_hours from voucher (new system)
            const durationHours = voucher.durationHours || 0;

            if (durationHours === 0) {
                return 'Unlimited';
            } else if (durationHours < 24) {
                return `${durationHours} jam`;
            } else if (durationHours === 24) {
                return '1 hari';
            } else if (durationHours === 48) {
                return '2 hari';
            } else if (durationHours === 168) {
                return '1 minggu';
            } else if (durationHours === 720) {
                return '1 bulan';
            } else {
                const days = Math.floor(durationHours / 24);
                const remainingHours = durationHours % 24;

                if (remainingHours === 0) {
                    return `${days} hari`;
                } else {
                    return `${days} hari ${remainingHours} jam`;
                }
            }
        },

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
    };

    // Toast Notification System
    const ToastManager = {
        show(message, type = 'info') {
            const toastContainer = document.getElementById('toastContainer');
            if (!toastContainer) return;

            const toast = document.createElement('div');
            const toastId = 'toast-' + Date.now();

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
            toast.setAttribute('id', toastId);
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
    };

    // Loading Overlay Manager
    const LoadingManager = {
        show(message = 'Memuat data...') {
            const overlay = document.getElementById('loadingOverlay');
            if (overlay) {
                overlay.querySelector('span').textContent = message;
                overlay.classList.remove('hidden');
            }
        },

        hide() {
            const overlay = document.getElementById('loadingOverlay');
            if (overlay) {
                overlay.classList.add('hidden');
            }
        }
    };

    // Voucher Management System
    const VoucherManager = {
        currentPage: 1,
        pageSize: 10,
        searchQuery: '',
        profileFilter: '',
        statusFilter: '',
        vendorFilter: '',
        batchFilter: '',
        dateFilter: '',
        minPriceFilter: '',
        durationFilter: '',
        sortBy: 'created_at',
        sortOrder: 'desc',
        advancedFiltersVisible: false,
        selectedVouchers: new Set(),
        requestCache: new Map(),
        cacheTimeout: 5000,

        init() {
            this.setupEventListeners();
            this.loadVouchers();
            this.loadStatistics();
            this.initializeCounters();
        },

        setupEventListeners() {
            // Sync button
            const syncBtn = document.querySelector('[onclick="syncVouchers()"]');
            if (syncBtn) {
                syncBtn.removeAttribute('onclick');
                syncBtn.addEventListener('click', () => this.syncVouchers());
            }

            // Export button
            const exportBtn = document.querySelector('[onclick="exportVouchers()"]');
            if (exportBtn) {
                exportBtn.removeAttribute('onclick');
                exportBtn.addEventListener('click', () => this.exportVouchers());
            }

            // Print button
            const printBtn = document.querySelector('[onclick="showPrintPreview()"]');
            if (printBtn) {
                printBtn.removeAttribute('onclick');
                printBtn.addEventListener('click', () => this.showPrintPreview());
            }

            // Search functionality
            const searchInput = document.getElementById('searchInput');
            if (searchInput) {
                searchInput.addEventListener('input', Utils.debounce(() => {
                    this.searchQuery = searchInput.value.trim();
                    this.currentPage = 1;
                    this.clearCache();
                    this.loadVouchers();
                }, 300));
            }

            // Filters
            const profileFilter = document.getElementById('profileFilter');
            if (profileFilter) {
                profileFilter.addEventListener('change', () => {
                    this.profileFilter = profileFilter.value;
                    this.currentPage = 1;
                    this.clearCache();
                    this.loadVouchers();
                });
            }

            const statusFilter = document.getElementById('statusFilter');
            if (statusFilter) {
                statusFilter.addEventListener('change', () => {
                    this.statusFilter = statusFilter.value;
                    this.currentPage = 1;
                    this.clearCache();
                    this.loadVouchers();
                });
            }

            const vendorFilter = document.getElementById('vendorFilter');
            if (vendorFilter) {
                vendorFilter.addEventListener('change', () => {
                    this.vendorFilter = vendorFilter.value;
                    this.currentPage = 1;
                    this.clearCache();
                    this.loadVouchers();
                });
            }

            const batchFilter = document.getElementById('batchFilter');
            if (batchFilter) {
                batchFilter.addEventListener('change', () => {
                    this.batchFilter = batchFilter.value;
                    this.currentPage = 1;
                    this.clearCache();
                    this.loadVouchers();
                });
            }

            // Advanced filters
            const dateFilter = document.getElementById('dateFilter');
            if (dateFilter) {
                dateFilter.addEventListener('change', () => {
                    this.dateFilter = dateFilter.value;
                    this.currentPage = 1;
                    this.clearCache();
                    this.loadVouchers();
                });
            }

            const minPrice = document.getElementById('minPrice');
            if (minPrice) {
                minPrice.addEventListener('input', Utils.debounce(() => {
                    this.minPriceFilter = minPrice.value;
                    this.currentPage = 1;
                    this.clearCache();
                    this.loadVouchers();
                }, 500));
            }

            const durationFilter = document.getElementById('durationFilter');
            if (durationFilter) {
                durationFilter.addEventListener('change', () => {
                    this.durationFilter = durationFilter.value;
                    this.currentPage = 1;
                    this.clearCache();
                    this.loadVouchers();
                });
            }

            const sortBy = document.getElementById('sortBy');
            if (sortBy) {
                sortBy.addEventListener('change', () => {
                    this.sortBy = sortBy.value;
                    this.currentPage = 1;
                    this.clearCache();
                    this.loadVouchers();
                });
            }

            // Search form submission
            const searchForm = document.getElementById('searchForm');
            if (searchForm) {
                searchForm.addEventListener('submit', (e) => {
                    e.preventDefault();
                    this.currentPage = 1;
                    this.loadVouchers();
                });
            }

            // Page size selector
            const pageSize = document.getElementById('pageSize');
            if (pageSize) {
                pageSize.addEventListener('change', () => {
                    this.pageSize = parseInt(pageSize.value);
                    this.currentPage = 1;
                    this.loadVouchers();
                });
            }

            // Select all checkboxes
            const selectAll = document.getElementById('selectAll');
            const selectAllHeader = document.getElementById('selectAllHeader');
            if (selectAll) {
                selectAll.addEventListener('change', () => this.toggleSelectAll());
            }
            if (selectAllHeader) {
                selectAllHeader.addEventListener('change', () => this.toggleSelectAll());
            }

            // Event delegation for dynamic elements
            document.addEventListener('click', (e) => {
                // Voucher action buttons
                if (e.target.matches('.view-voucher-btn')) {
                    e.preventDefault();
                    const voucherId = e.target.closest('.view-voucher-btn').dataset.voucherId;
                    this.viewVoucherDetails(voucherId);
                }

                if (e.target.matches('.copy-voucher-btn')) {
                    e.preventDefault();
                    const voucherCode = e.target.closest('.copy-voucher-btn').dataset.voucherCode;
                    this.copyVoucherCode(voucherCode);
                }

                if (e.target.matches('.print-voucher-btn')) {
                    e.preventDefault();
                    const voucherId = e.target.closest('.print-voucher-btn').dataset.voucherId;
                    this.printVoucher(voucherId);
                }

                if (e.target.matches('.regenerate-voucher-btn')) {
                    e.preventDefault();
                    const voucherId = e.target.closest('.regenerate-voucher-btn').dataset.voucherId;
                    this.regenerateVoucher(voucherId);
                }

                if (e.target.matches('.delete-voucher-btn')) {
                    e.preventDefault();
                    const voucherId = e.target.closest('.delete-voucher-btn').dataset.voucherId;
                    const voucherCode = e.target.closest('.delete-voucher-btn').dataset.voucherCode;
                    this.showDeleteConfirmation(voucherId, voucherCode);
                }

                // Voucher selection checkboxes
                if (e.target.matches('.voucher-checkbox')) {
                    this.toggleVoucherSelection(e.target);
                }

                // Pagination controls
                if (e.target.matches('#prevPage') && !e.target.disabled) {
                    e.preventDefault();
                    this.changePage('prev');
                }

                if (e.target.matches('#nextPage') && !e.target.disabled) {
                    e.preventDefault();
                    this.changePage('next');
                }

                if (e.target.matches('.page-number')) {
                    e.preventDefault();
                    const page = parseInt(e.target.dataset.page);
                    this.goToPage(page);
                }
            });
        },

        async loadVouchers() {
            try {
                // Check cache first
                const cacheKey = JSON.stringify({
                    page: this.currentPage,
                    pageSize: this.pageSize,
                    search: this.searchQuery,
                    profile: this.profileFilter,
                    status: this.statusFilter,
                    vendor: this.vendorFilter,
                    batch: this.batchFilter,
                    dateFilter: this.dateFilter,
                    minPrice: this.minPriceFilter,
                    durationFilter: this.durationFilter,
                    sortBy: this.sortBy,
                    sortOrder: this.sortOrder
                });

                const now = Date.now();
                if (this.requestCache.has(cacheKey)) {
                    const cached = this.requestCache.get(cacheKey);
                    if (now - cached.timestamp < this.cacheTimeout) {
                        this.renderVouchersTable(cached.data.vouchers);
                        this.renderPagination(cached.data.pagination);
                        this.updateShowingCount(cached.data.vouchers.length);
                        return;
                    }
                }

                LoadingManager.show('Memuat data voucher...');

                const params = new URLSearchParams({
                    page: this.currentPage,
                    page_size: this.pageSize,
                    search: this.searchQuery,
                    profile: this.profileFilter,
                    status: this.statusFilter,
                    vendor: this.vendorFilter,
                    batch_id: this.batchFilter,
                    date_filter: this.dateFilter,
                    min_price: this.minPriceFilter,
                    duration_filter: this.durationFilter,
                    sort_by: this.sortBy,
                    sort_order: this.sortOrder
                });

                const response = await fetch(`/vouchers/api/vouchers?${params}`);
                const data = await response.json();

                if (data.vouchers) {
                    // Cache the response
                    this.requestCache.set(cacheKey, {
                        data: data,
                        timestamp: now
                    });

                    // Clean old cache entries
                    if (this.requestCache.size > 20) {
                        const oldestKey = this.requestCache.keys().next().value;
                        this.requestCache.delete(oldestKey);
                    }

                    this.renderVouchersTable(data.vouchers);
                    this.renderPagination(data.pagination);
                    this.updateShowingCount(data.vouchers.length);
                } else {
                    ToastManager.show('Gagal memuat data voucher', 'error');
                }
            } catch (error) {
                console.error('Error loading vouchers:', error);
                ToastManager.show('Terjadi kesalahan saat memuat data', 'error');
            } finally {
                LoadingManager.hide();
            }
        },

        async loadStatistics() {
            try {
                const response = await fetch('/vouchers/api/vouchers/statistics');
                const data = await response.json();

                if (data.total !== undefined) {
                    this.updateStatistics(data);
                    this.animateCounters();
                }
            } catch (error) {
                console.error('Error loading statistics:', error);
            }
        },

        renderVouchersTable(vouchers) {
            const tbody = document.getElementById('vouchersTableBody');
            if (!tbody) return;

            if (!vouchers || vouchers.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="10" class="px-6 py-8 text-center">
                            <div class="flex flex-col items-center space-y-3">
                                <div class="w-16 h-16 bg-slate-700/50 rounded-full flex items-center justify-center">
                                    <i class="fas fa-inbox text-3xl text-slate-500"></i>
                                </div>
                                <p class="text-slate-400 font-medium">Tidak ada voucher ditemukan</p>
                                <p class="text-slate-500 text-sm">Coba ubah filter atau generate voucher baru</p>
                                ${this.searchQuery || this.profileFilter || this.statusFilter || this.vendorFilter || this.batchFilter ?
                                    '<button onclick="VoucherManager.resetFilters()" class="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-200">Reset Filter</button>' :
                                    ''
                                }
                            </div>
                        </td>
                    </tr>
                `;
                return;
            }

            tbody.innerHTML = vouchers.map(voucher => `
                <tr class="hover:bg-slate-700/50 transition-colors duration-150">
                    <td class="px-6 py-4 whitespace-nowrap">
                        <input type="checkbox"
                               class="voucher-checkbox h-4 w-4 rounded border-slate-600 bg-slate-700 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900"
                               data-voucher-id="${voucher.id}"
                               onchange="VoucherManager.toggleVoucherSelection(this)">
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="flex flex-col">
                            <div class="flex items-center">
                                <code class="bg-slate-900 text-blue-400 px-2 py-1 rounded text-sm font-mono">${Utils.sanitizeInput(voucher.code)}</code>
                                <button class="ml-2 text-slate-400 hover:text-blue-400 transition-colors duration-200 copy-voucher-btn"
                                        data-voucher-code="${voucher.code}"
                                        title="Salin kode">
                                    <i class="fas fa-clipboard text-sm"></i>
                                </button>
                            </div>
                            ${voucher.batchId ? `<span class="text-xs text-slate-500">Batch: ${voucher.batchId}</span>` : ''}
                        </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <span class="text-sm text-slate-300">${Utils.sanitizeInput(voucher.vendorName) || '-'}</span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">
                            ${Utils.sanitizeInput(voucher.profileName)}
                        </span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="text-sm font-medium text-white">${Utils.formatCurrency(voucher.priceSell)}</div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="text-sm text-slate-300">${Utils.formatDuration(voucher)}</div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="flex flex-col space-y-1">
                            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                this.getStatusClass(voucher.status, voucher.mikrotik_synced)
                            }">
                                <span class="w-2 h-2 mr-1.5 rounded-full ${
                                    this.getStatusColor(voucher.status, voucher.mikrotik_synced)
                                } ${voucher.status === 'available' && voucher.mikrotik_synced ? 'animate-pulse' : ''}"></span>
                                ${this.getStatusText(voucher.status, voucher.mikrotik_synced)}
                            </span>
                            <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                voucher.mikrotik_synced ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                            }">
                                <i class="fas fa-${voucher.mikrotik_synced ? 'check' : 'clock'} mr-1 text-xs"></i>
                                ${voucher.mikrotik_synced ? 'Synced' : 'Pending'}
                            </span>
                        </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                        <div class="flex items-center">
                            <i class="far fa-clock mr-2 text-slate-500"></i>
                            ${Utils.formatDate(voucher.createdAt)}
                        </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                        <div class="flex items-center">
                            ${voucher.usedAt ? `
                                <i class="far fa-check-circle mr-2 text-green-500"></i>
                                ${Utils.formatDate(voucher.usedAt)}
                            ` : '<span class="text-slate-500">Belum</span>'}
                        </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div class="flex justify-end space-x-2">
                            <button class="inline-flex items-center px-2 py-1 text-xs font-medium rounded text-blue-400 hover:text-blue-300 hover:bg-blue-900/20 transition-colors duration-200 view-voucher-btn"
                                    data-voucher-id="${voucher.id}"
                                    title="Detail">
                                <i class="fas fa-eye mr-1"></i>
                                Detail
                            </button>
                            <button class="inline-flex items-center px-2 py-1 text-xs font-medium rounded text-yellow-400 hover:text-yellow-300 hover:bg-yellow-900/20 transition-colors duration-200 regenerate-voucher-btn"
                                    data-voucher-id="${voucher.id}"
                                    title="Regenerate"
                                    ${voucher.status !== 'available' ? 'style="display:none"' : ''}>
                                <i class="fas fa-sync-alt mr-1"></i>
                                Regenerate
                            </button>
                            <button class="inline-flex items-center px-2 py-1 text-xs font-medium rounded text-red-400 hover:text-red-300 hover:bg-red-900/20 transition-colors duration-200 delete-voucher-btn"
                                    data-voucher-id="${voucher.id}"
                                    data-voucher-code="${voucher.code}"
                                    title="Hapus">
                                <i class="fas fa-trash mr-1"></i>
                                Hapus
                            </button>
                        </div>
                    </td>
                </tr>
            `).join('');

            // Update select all checkbox state
            this.updateSelectAllState();
        },

        getStatusClass(status, mikrotikSynced) {
            if (status === 'available') {
                return mikrotikSynced ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
            } else if (status === 'used') {
                return 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20';
            } else if (status === 'expired') {
                return 'bg-red-500/10 text-red-400 border border-red-500/20';
            }
            return 'bg-slate-500/10 text-slate-400 border border-slate-500/20';
        },

        getStatusColor(status, mikrotikSynced) {
            if (status === 'available') {
                return mikrotikSynced ? 'bg-green-400' : 'bg-blue-400';
            } else if (status === 'used') {
                return 'bg-yellow-400';
            } else if (status === 'expired') {
                return 'bg-red-400';
            }
            return 'bg-slate-400';
        },

        getStatusText(status, mikrotikSynced) {
            if (status === 'available') {
                return mikrotikSynced ? 'Tersedia' : 'Tersedia (Pending)';
            } else if (status === 'used') {
                return 'Terpakai';
            } else if (status === 'expired') {
                return 'Kadaluarsa';
            }
            return status;
        },

        renderPagination(pagination) {
            const container = document.getElementById('pageNumbers');
            if (!container) return;

            const { current_page, total_pages } = pagination;
            let pageNumbersHTML = '';

            // Calculate page range
            const startPage = Math.max(1, current_page - 2);
            const endPage = Math.min(total_pages, current_page + 2);

            // Always show first page if not in range
            if (startPage > 1) {
                pageNumbersHTML += `
                    <button onclick="VoucherManager.goToPage(1)" class="px-3 py-2 text-sm font-medium rounded-md bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700 transition-colors duration-200">
                        1
                    </button>
                `;
                if (startPage > 2) {
                    pageNumbersHTML += `<span class="px-2 text-sm text-slate-500">...</span>`;
                }
            }

            // Page numbers
            for (let i = startPage; i <= endPage; i++) {
                if (i > 0 && i <= total_pages) {
                    pageNumbersHTML += `
                        <button onclick="VoucherManager.goToPage(${i})"
                                class="px-3 py-2 text-sm font-medium rounded-md ${
                                    i === current_page
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'
                                } transition-colors duration-200 page-number"
                                data-page="${i}">
                            ${i}
                        </button>
                    `;
                }
            }

            // Always show last page if not in range
            if (endPage < total_pages) {
                if (endPage < total_pages - 1) {
                    pageNumbersHTML += `<span class="px-2 text-sm text-slate-500">...</span>`;
                }
                pageNumbersHTML += `
                    <button onclick="VoucherManager.goToPage(${total_pages})" class="px-3 py-2 text-sm font-medium rounded-md bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700 transition-colors duration-200">
                        ${total_pages}
                    </button>
                `;
            }

            container.innerHTML = pageNumbersHTML;

            // Update pagination controls
            this.updatePaginationControls(pagination);
        },

        updatePaginationControls(pagination) {
            const { current_page, total_pages, total_items } = pagination;

            // Update prev/next buttons
            const prevBtn = document.getElementById('prevPage');
            const nextBtn = document.getElementById('nextPage');

            if (prevBtn) {
                prevBtn.disabled = current_page === 1;
            }
            if (nextBtn) {
                nextBtn.disabled = current_page === total_pages;
            }

            // Update pagination info
            const startRecord = (current_page - 1) * this.pageSize + 1;
            const endRecord = Math.min(current_page * this.pageSize, total_items);

            const startElement = document.getElementById('startRecord');
            const endElement = document.getElementById('endRecord');
            const totalElement = document.getElementById('totalRecords');

            if (startElement) startElement.textContent = startRecord;
            if (endElement) endElement.textContent = endRecord;
            if (totalElement) totalElement.textContent = total_items;
        },

        updateShowingCount(count) {
            const showingElement = document.getElementById('showingCount');
            if (showingElement) {
                showingElement.textContent = count;
            }
        },

        updateStatistics(stats) {
            const elements = {
                totalVouchers: stats.total || 0,
                availableVouchers: stats.available || 0,
                usedVouchers: stats.used || 0,
                expiredVouchers: stats.expired || 0
            };

            Object.keys(elements).forEach(key => {
                const element = document.getElementById(key);
                if (element) {
                    element.setAttribute('data-target', elements[key]);
                    element.textContent = elements[key];
                }
            });

            // Update percentages
            const total = elements.totalVouchers;
            if (total > 0) {
                const availablePercentage = document.getElementById('availablePercentage');
                const usedPercentage = document.getElementById('usedPercentage');
                const expiredPercentage = document.getElementById('expiredPercentage');

                if (availablePercentage) {
                    const percentage = Math.round((elements.availableVouchers / total) * 100);
                    availablePercentage.textContent = `${percentage}%`;
                }

                if (usedPercentage) {
                    const percentage = Math.round((elements.usedVouchers / total) * 100);
                    usedPercentage.textContent = `${percentage}%`;
                }

                if (expiredPercentage) {
                    const percentage = Math.round((elements.expiredVouchers / total) * 100);
                    expiredPercentage.textContent = `${percentage}%`;
                }
            }
        },

        initializeCounters() {
            // Animate counters on load
            this.animateCounters();
        },

        animateCounters() {
            const counters = document.querySelectorAll('.counter');
            counters.forEach(counter => {
                const target = parseInt(counter.getAttribute('data-target')) || 0;
                const current = parseInt(counter.textContent) || 0;
                this.animateCounter(counter, current, target);
            });
        },

        animateCounter(element, start, end) {
            const duration = 1000;
            const increment = (end - start) / (duration / 16);
            let current = start;

            const timer = setInterval(() => {
                current += increment;
                if ((increment > 0 && current >= end) || (increment < 0 && current <= end)) {
                    current = end;
                    clearInterval(timer);
                }
                element.textContent = Math.floor(current).toLocaleString('id-ID');
            }, 16);
        },

        toggleSelectAll() {
            const selectAllCheckbox = document.getElementById('selectAll');
            const selectAllHeader = document.getElementById('selectAllHeader');
            const voucherCheckboxes = document.querySelectorAll('.voucher-checkbox');

            const isChecked = selectAllCheckbox?.checked || selectAllHeader?.checked;

            voucherCheckboxes.forEach(checkbox => {
                checkbox.checked = isChecked;
                const voucherId = checkbox.dataset.voucherId;
                if (isChecked) {
                    this.selectedVouchers.add(voucherId);
                } else {
                    this.selectedVouchers.delete(voucherId);
                }
            });

            // Sync select all checkboxes
            if (selectAllCheckbox) selectAllCheckbox.checked = isChecked;
            if (selectAllHeader) selectAllHeader.checked = isChecked;

            this.updateSelectAllState();
        },

        toggleVoucherSelection(checkbox) {
            const voucherId = checkbox.dataset.voucherId;
            if (checkbox.checked) {
                this.selectedVouchers.add(voucherId);
            } else {
                this.selectedVouchers.delete(voucherId);
            }
            this.updateSelectAllState();
        },

        updateSelectAllState() {
            const selectAllCheckbox = document.getElementById('selectAll');
            const selectAllHeader = document.getElementById('selectAllHeader');
            const voucherCheckboxes = document.querySelectorAll('.voucher-checkbox');
            const checkedCount = document.querySelectorAll('.voucher-checkbox:checked').length;

            const isChecked = checkedCount === voucherCheckboxes.length && voucherCheckboxes.length > 0;
            const isIndeterminate = checkedCount > 0 && checkedCount < voucherCheckboxes.length;

            if (selectAllCheckbox) {
                selectAllCheckbox.checked = isChecked;
                selectAllCheckbox.indeterminate = isIndeterminate;
            }
            if (selectAllHeader) {
                selectAllHeader.checked = isChecked;
                selectAllHeader.indeterminate = isIndeterminate;
            }
        },

        goToPage(page) {
            this.currentPage = page;
            this.loadVouchers();
        },

        changePage(direction) {
            if (direction === 'prev') {
                this.currentPage = Math.max(1, this.currentPage - 1);
            } else {
                this.currentPage++;
            }
            this.loadVouchers();
        },

        resetFilters() {
            this.searchQuery = '';
            this.profileFilter = '';
            this.statusFilter = '';
            this.vendorFilter = '';
            this.batchFilter = '';
            this.dateFilter = '';
            this.minPriceFilter = '';
            this.durationFilter = '';
            this.sortBy = 'created_at';
            this.sortOrder = 'desc';
            this.currentPage = 1;

            // Reset form elements
            const searchInput = document.getElementById('searchInput');
            const profileFilter = document.getElementById('profileFilter');
            const statusFilter = document.getElementById('statusFilter');
            const vendorFilter = document.getElementById('vendorFilter');
            const batchFilter = document.getElementById('batchFilter');
            const dateFilter = document.getElementById('dateFilter');
            const minPrice = document.getElementById('minPrice');
            const durationFilter = document.getElementById('durationFilter');
            const sortBy = document.getElementById('sortBy');

            if (searchInput) searchInput.value = '';
            if (profileFilter) profileFilter.value = '';
            if (statusFilter) statusFilter.value = '';
            if (vendorFilter) vendorFilter.value = '';
            if (batchFilter) batchFilter.value = '';
            if (dateFilter) dateFilter.value = '';
            if (minPrice) minPrice.value = '';
            if (durationFilter) durationFilter.value = '';
            if (sortBy) sortBy.value = 'created_at';

            this.clearCache();
            this.loadVouchers();
        },

        refreshVouchers() {
            this.clearCache();
            this.loadVouchers();
            this.loadStatistics();
            ToastManager.show('Data voucher berhasil diperbarui', 'success');
        },

        async viewVoucherDetails(voucherId) {
            try {
                LoadingManager.show('Memuat detail voucher...');

                const response = await fetch(`/vouchers/api/vouchers/${voucherId}`);
                const data = await response.json();

                if (data.success) {
                    this.renderVoucherDetail(data.voucher);
                    this.showModal('voucherDetailModal');
                } else {
                    ToastManager.show('Gagal memuat detail voucher', 'error');
                }
            } catch (error) {
                console.error('Error loading voucher details:', error);
                ToastManager.show('Terjadi kesalahan saat memuat detail', 'error');
            } finally {
                LoadingManager.hide();
            }
        },

        renderVoucherDetail(voucher) {
            const modalTitle = document.getElementById('modalVoucherTitle');
            const modalContent = document.getElementById('voucherDetailContent');

            if (modalTitle) {
                modalTitle.textContent = `Detail Voucher - ${voucher.code}`;
            }

            if (modalContent) {
                modalContent.innerHTML = `
                    <div class="space-y-6">
                        <!-- Voucher Information -->
                        <div class="bg-slate-900/50 rounded-lg p-6 border border-slate-600">
                            <h3 class="text-lg font-semibold text-white mb-4 flex items-center">
                                <i class="fas fa-ticket-alt mr-2 text-blue-400"></i>
                                Informasi Voucher
                            </h3>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <p class="text-sm text-slate-400">Kode Voucher</p>
                                    <p class="font-mono text-blue-400 font-medium bg-slate-800 px-2 py-1 rounded">${Utils.sanitizeInput(voucher.code)}</p>
                                </div>
                                <div>
                                    <p class="text-sm text-slate-400">Profile</p>
                                    <p class="text-white font-medium">${Utils.sanitizeInput(voucher.profileName)}</p>
                                </div>
                                <div>
                                    <p class="text-sm text-slate-400">Status</p>
                                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                        this.getStatusClass(voucher.status, voucher.mikrotik_synced)
                                    }">
                                        ${this.getStatusText(voucher.status, voucher.mikrotik_synced)}
                                    </span>
                                </div>
                                <div>
                                    <p class="text-sm text-slate-400">Mikrotik Sync</p>
                                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                        voucher.mikrotik_synced ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                                    }">
                                        ${voucher.mikrotik_synced ? 'Tersinkronisasi' : 'Pending'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <!-- Financial Information -->
                        <div class="bg-slate-900/50 rounded-lg p-6 border border-slate-600">
                            <h3 class="text-lg font-semibold text-white mb-4 flex items-center">
                                <i class="fas fa-dollar-sign mr-2 text-green-400"></i>
                                Informasi Harga
                            </h3>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <p class="text-sm text-slate-400">Harga Jual</p>
                                    <p class="text-2xl font-bold text-green-400">${Utils.formatCurrency(voucher.priceSell)}</p>
                                </div>
                                <div>
                                    <p class="text-sm text-slate-400">Harga Modal</p>
                                    <p class="text-2xl font-bold text-slate-300">${Utils.formatCurrency(voucher.priceCost || 0)}</p>
                                </div>
                            </div>
                        </div>

                        <!-- Duration Information -->
                        <div class="bg-slate-900/50 rounded-lg p-6 border border-slate-600">
                            <h3 class="text-lg font-semibold text-white mb-4 flex items-center">
                                <i class="fas fa-clock mr-2 text-purple-400"></i>
                                Informasi Durasi
                            </h3>
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <p class="text-sm text-slate-400">Durasi</p>
                                    <p class="text-white font-medium">${Utils.formatDuration(voucher)}</p>
                                </div>
                                <div>
                                    <p class="text-sm text-slate-400">Dibuat</p>
                                    <p class="text-white font-medium">${Utils.formatDateTime(voucher.createdAt)}</p>
                                </div>
                                <div>
                                    <p class="text-sm text-slate-400">Kadaluarsa</p>
                                    <p class="text-white font-medium">${voucher.expiresAt ? Utils.formatDateTime(voucher.expiresAt) : 'Tidak ada'}</p>
                                </div>
                            </div>
                        </div>

                        <!-- Usage Information -->
                        ${voucher.usedAt ? `
                            <div class="bg-slate-900/50 rounded-lg p-6 border border-slate-600">
                                <h3 class="text-lg font-semibold text-white mb-4 flex items-center">
                                    <i class="fas fa-user-check mr-2 text-yellow-400"></i>
                                    Informasi Penggunaan
                                </h3>
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <p class="text-sm text-slate-400">Digunakan Pada</p>
                                        <p class="text-white font-medium">${Utils.formatDateTime(voucher.usedAt)}</p>
                                    </div>
                                    <div>
                                        <p class="text-sm text-slate-400">User</p>
                                        <p class="text-white font-medium">${Utils.sanitizeInput(voucher.usedBy) || '-'}</p>
                                    </div>
                                    <div>
                                        <p class="text-sm text-slate-400">IP Address</p>
                                        <p class="text-white font-medium">${Utils.sanitizeInput(voucher.usedIp) || '-'}</p>
                                    </div>
                                </div>
                            </div>
                        ` : ''}

                        <!-- Action Buttons -->
                        <div class="flex justify-end space-x-3 pt-4 border-t border-slate-700">
                            <button onclick="VoucherManager.copyVoucherCode('${voucher.code}')" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-200">
                                <i class="fas fa-clipboard mr-2"></i>
                                Salin Kode
                            </button>
                            <button onclick="VoucherManager.printVoucher(${voucher.id})" class="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg transition-colors duration-200">
                                <i class="fas fa-print mr-2"></i>
                                Print
                            </button>
                            <button onclick="VoucherManager.closeModal('voucherDetailModal')" class="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors duration-200">
                                Tutup
                            </button>
                        </div>
                    </div>
                `;
            }
        },

        async copyVoucherCode(code) {
            try {
                await navigator.clipboard.writeText(code);
                ToastManager.show('Kode voucher berhasil disalin', 'success');
            } catch (error) {
                console.error('Copy error:', error);
                ToastManager.show('Gagal menyalin kode', 'error');
            }
        },

        async printVoucher(voucherId) {
            try {
                window.open(`/print/vouchers/${voucherId}`, '_blank');
                ToastManager.show('Voucher siap dicetak', 'success');
            } catch (error) {
                console.error('Print error:', error);
                ToastManager.show('Gagal mencetak voucher', 'error');
            }
        },

        async regenerateVoucher(voucherId) {
            if (!confirm('Apakah Anda yakin ingin meregenerasi voucher ini? Voucher lama akan dihapus.')) {
                return;
            }

            try {
                LoadingManager.show('Meregenerasi voucher...');

                const response = await fetch(`/vouchers/api/vouchers/${voucherId}/regenerate`, {
                    method: 'POST'
                });

                const data = await response.json();

                if (data.success) {
                    ToastManager.show('Voucher berhasil diregenerasi', 'success');
                    this.loadVouchers();
                    this.loadStatistics();

                    // Auto print new voucher
                    setTimeout(() => {
                        this.printVoucher(data.newVoucherId);
                    }, 500);
                } else {
                    ToastManager.show(data.message || 'Gagal meregenerasi voucher', 'error');
                }
            } catch (error) {
                console.error('Regeneration error:', error);
                ToastManager.show('Gagal meregenerasi voucher', 'error');
            } finally {
                LoadingManager.hide();
            }
        },

        showDeleteConfirmation(voucherId, voucherCode) {
            const codeElement = document.getElementById('deleteVoucherCode');
            const detailsElement = document.getElementById('deleteVoucherDetails');
            const confirmBtn = document.querySelector('[onclick="confirmDelete()"]');

            if (codeElement) {
                codeElement.textContent = voucherCode;
            }

            if (detailsElement) {
                detailsElement.textContent = 'Voucher akan dihapus secara permanen';
            }

            if (confirmBtn) {
                confirmBtn.setAttribute('data-voucher-id', voucherId);
            }

            this.showModal('deleteConfirmModal');
        },

        async confirmDelete() {
            const confirmBtn = document.querySelector('[onclick="confirmDelete()"]');
            const voucherId = confirmBtn.dataset.voucherId;

            try {
                LoadingManager.show('Menghapus voucher...');

                const response = await fetch(`/vouchers/api/vouchers/${voucherId}`, {
                    method: 'DELETE'
                });

                const data = await response.json();

                if (data.success) {
                    ToastManager.show('Voucher berhasil dihapus', 'success');
                    this.closeModal('deleteConfirmModal');
                    this.loadVouchers();
                    this.loadStatistics();
                } else {
                    ToastManager.show(data.message || 'Gagal menghapus voucher', 'error');
                }
            } catch (error) {
                console.error('Delete error:', error);
                ToastManager.show('Gagal menghapus voucher', 'error');
            } finally {
                LoadingManager.hide();
            }
        },

        async syncVouchers() {
            const syncBtn = document.querySelector('[onclick="syncVouchers()"]');
            if (syncBtn) {
                syncBtn.disabled = true;
                syncBtn.innerHTML = '<i class="fas fa-sync-alt fa-spin mr-2"></i>Syncing...';
            }

            try {
                const response = await fetch('/vouchers/api/vouchers/sync', {
                    method: 'POST'
                });

                const data = await response.json();

                if (data.success) {
                    ToastManager.show(`Sync selesai: ${data.message}`, 'success');
                    this.clearCache();
                    this.loadVouchers();
                    this.loadStatistics();
                } else {
                    ToastManager.show(data.message || 'Gagal sync voucher', 'error');
                }
            } catch (error) {
                console.error('Sync error:', error);
                ToastManager.show('Gagal sync voucher', 'error');
            } finally {
                if (syncBtn) {
                    syncBtn.disabled = false;
                    syncBtn.innerHTML = '<i class="fas fa-sync-alt mr-2"></i>Sync Mikrotik';
                }
            }
        },

        exportVouchers() {
            const params = new URLSearchParams({
                search: this.searchQuery,
                profile: this.profileFilter,
                status: this.statusFilter,
                vendor: this.vendorFilter,
                batch_id: this.batchFilter,
                date_filter: this.dateFilter,
                min_price: this.minPriceFilter,
                duration_filter: this.durationFilter,
                format: 'csv'
            });

            window.location.href = `/vouchers/api/vouchers/export?${params}`;
            ToastManager.show('Mengunduh data voucher...', 'info');
        },

        showPrintPreview() {
            if (this.selectedVouchers.size === 0) {
                ToastManager.show('Pilih voucher terlebih dahulu', 'warning');
                return;
            }

            // Generate print preview content
            const printFormat = document.getElementById('printFormat');
            const printContent = document.getElementById('printPreviewContent');

            if (printFormat && printContent) {
                const format = printFormat.value;
                // Here you would typically fetch the selected vouchers and render them
                printContent.innerHTML = `
                    <div class="text-center text-slate-500">
                        <i class="fas fa-file-invoice text-6xl mb-4"></i>
                        <p>Preview untuk ${this.selectedVouchers.size} voucher</p>
                        <p class="text-sm">Format: ${format === 'a4' ? 'A4 (120 per halaman)' : 'Thermal (1 per halaman)'}</p>
                    </div>
                `;
            }

            this.showModal('printPreviewModal');
        },

        printVouchers() {
            if (this.selectedVouchers.size === 0) {
                ToastManager.show('Pilih voucher terlebih dahulu', 'warning');
                return;
            }

            try {
                const voucherIds = Array.from(this.selectedVouchers).join(',');
                window.open(`/print/vouchers/${voucherIds}`, '_blank');
                this.closeModal('printPreviewModal');
                ToastManager.show('Voucher siap dicetak', 'success');
            } catch (error) {
                console.error('Print error:', error);
                ToastManager.show('Gagal mencetak voucher', 'error');
            }
        },

        downloadPDF() {
            // PDF download functionality would be implemented here
            ToastManager.show('Fitur download PDF akan segera tersedia', 'info');
        },

        clearCache() {
            this.requestCache.clear();
        },

        showModal(modalId) {
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.classList.remove('hidden');
                document.body.style.overflow = 'hidden';
            }
        },

        closeModal(modalId) {
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.classList.add('hidden');
                document.body.style.overflow = 'auto';
            }
        }
    };

    // Global functions for onclick attributes
    window.VoucherManager = VoucherManager;
    window.syncVouchers = () => VoucherManager.syncVouchers();
    window.exportVouchers = () => VoucherManager.exportVouchers();
    window.showPrintPreview = () => VoucherManager.showPrintPreview();
    window.printVouchers = () => VoucherManager.printVouchers();
    window.downloadPDF = () => VoucherManager.downloadPDF();
    window.confirmDelete = () => VoucherManager.confirmDelete();
    window.refreshVouchers = () => VoucherManager.refreshVouchers();
    window.closeVoucherModal = () => VoucherManager.closeModal('voucherDetailModal');
    window.closePrintModal = () => VoucherManager.closeModal('printPreviewModal');
    window.closeDeleteModal = () => VoucherManager.closeModal('deleteConfirmModal');
    window.toggleAdvancedFilters = () => {
        const advancedFilters = document.getElementById('advancedFilters');
        if (advancedFilters) {
            advancedFilters.classList.toggle('hidden');
            VoucherManager.advancedFiltersVisible = !VoucherManager.advancedFiltersVisible;
        }
    };
    window.changePage = (direction) => VoucherManager.changePage(direction);

    // Initialize the voucher manager
    VoucherManager.init();
});