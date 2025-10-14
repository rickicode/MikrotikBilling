// Customer Management JavaScript - Enhanced for Shadcn-style Interface
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

    // Customer Management System
    const CustomerManager = {
        currentPage: 1,
        pageSize: 10,
        searchQuery: '',
        statusFilter: '',
        serviceFilter: '',
        dateFilter: '',
        minBalanceFilter: '',
        sortBy: 'name',
        sortOrder: 'asc',
        advancedFiltersVisible: false,
        selectedCustomers: new Set(),

        init() {
            this.setupEventListeners();
            this.loadCustomers();
            this.loadStatistics();
            this.initializeCounters();
        },

        setupEventListeners() {
            // Export button
            const exportBtn = document.querySelector('[onclick="exportCustomers()"]');
            if (exportBtn) {
                exportBtn.removeAttribute('onclick');
                exportBtn.addEventListener('click', () => this.exportCustomers());
            }

            // Search functionality
            const searchInput = document.getElementById('searchInput');
            if (searchInput) {
                searchInput.addEventListener('input', Utils.debounce(() => {
                    this.searchQuery = searchInput.value.trim();
                    this.currentPage = 1;
                    this.loadCustomers();
                }, 300));
            }

            // Status filter
            const statusFilter = document.getElementById('statusFilter');
            if (statusFilter) {
                statusFilter.addEventListener('change', () => {
                    this.statusFilter = statusFilter.value;
                    this.currentPage = 1;
                    this.loadCustomers();
                });
            }

            // Service filter
            const serviceFilter = document.getElementById('serviceFilter');
            if (serviceFilter) {
                serviceFilter.addEventListener('change', () => {
                    this.serviceFilter = serviceFilter.value;
                    this.currentPage = 1;
                    this.loadCustomers();
                });
            }

            // Advanced filters
            const dateFilter = document.getElementById('dateFilter');
            if (dateFilter) {
                dateFilter.addEventListener('change', () => {
                    this.dateFilter = dateFilter.value;
                    this.currentPage = 1;
                    this.loadCustomers();
                });
            }

            const minBalance = document.getElementById('minBalance');
            if (minBalance) {
                minBalance.addEventListener('input', Utils.debounce(() => {
                    this.minBalanceFilter = minBalance.value;
                    this.currentPage = 1;
                    this.loadCustomers();
                }, 500));
            }

            const sortBy = document.getElementById('sortBy');
            if (sortBy) {
                sortBy.addEventListener('change', () => {
                    this.sortBy = sortBy.value;
                    this.currentPage = 1;
                    this.loadCustomers();
                });
            }

            // Search form submission
            const searchForm = document.getElementById('searchForm');
            if (searchForm) {
                searchForm.addEventListener('submit', (e) => {
                    e.preventDefault();
                    this.currentPage = 1;
                    this.loadCustomers();
                });
            }

            // Refresh button
            const refreshBtn = document.querySelector('[onclick="refreshCustomers()"]');
            if (refreshBtn) {
                refreshBtn.removeAttribute('onclick');
                refreshBtn.addEventListener('click', () => this.refreshCustomers());
            }

            // Select all checkbox
            const selectAllCheckbox = document.getElementById('selectAll');
            if (selectAllCheckbox) {
                selectAllCheckbox.addEventListener('change', () => this.toggleSelectAll());
            }

            // Event delegation for dynamic elements
            document.addEventListener('click', (e) => {
                // Customer action buttons
                if (e.target.matches('.view-customer-btn')) {
                    e.preventDefault();
                    const customerId = e.target.closest('.view-customer-btn').dataset.customerId;
                    this.viewCustomerDetails(customerId);
                }

                if (e.target.matches('.edit-customer-btn')) {
                    e.preventDefault();
                    const customerId = e.target.closest('.edit-customer-btn').dataset.customerId;
                    this.editCustomer(customerId);
                }

                if (e.target.matches('.delete-customer-btn')) {
                    e.preventDefault();
                    const customerId = e.target.closest('.delete-customer-btn').dataset.customerId;
                    const customerName = e.target.closest('.delete-customer-btn').dataset.customerName;
                    this.showDeleteConfirmation(customerId, customerName);
                }

                // Confirm delete button
                if (e.target.matches('[onclick="confirmDelete()"]')) {
                    e.preventDefault();
                    this.confirmDelete();
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

        async loadCustomers() {
            try {
                LoadingManager.show('Memuat data pelanggan...');

                const params = new URLSearchParams({
                    page: this.currentPage,
                    page_size: this.pageSize,
                    search: this.searchQuery,
                    status: this.statusFilter,
                    service: this.serviceFilter,
                    date_filter: this.dateFilter,
                    min_balance: this.minBalanceFilter,
                    sort_by: this.sortBy,
                    sort_order: this.sortOrder
                });

                const response = await fetch(`/customers/api/customers?${params}`);
                const data = await response.json();

                console.log('API Response:', data);

                if (data.customers && Array.isArray(data.customers)) {
                    this.renderCustomersTable(data.customers);
                    this.renderPagination(data.pagination || {});
                    this.updateShowingCount(data.customers.length);
                } else if (data.error) {
                    console.error('API Error:', data);
                    ToastManager.show(`Error: ${data.error}`, 'error');
                } else {
                    console.error('Invalid API Response:', data);
                    ToastManager.show('Gagal memuat data pelanggan - response tidak valid', 'error');
                }
            } catch (error) {
                console.error('Error loading customers:', error);
                ToastManager.show('Terjadi kesalahan saat memuat data', 'error');
            } finally {
                LoadingManager.hide();
            }
        },

        async loadStatistics() {
            try {
                const response = await fetch('/customers/api/customers/statistics');
                const data = await response.json();

                if (data.total !== undefined) {
                    this.updateStatistics(data);
                    this.animateCounters();
                }
            } catch (error) {
                console.error('Error loading statistics:', error);
            }
        },

        renderCustomersTable(customers) {
            const tbody = document.getElementById('customersTableBody');
            if (!tbody) return;

            if (!customers || customers.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="9" class="px-6 py-8 text-center">
                            <div class="flex flex-col items-center space-y-3">
                                <div class="w-16 h-16 bg-slate-700/50 rounded-full flex items-center justify-center">
                                    <i class="fas fa-inbox text-3xl text-slate-500"></i>
                                </div>
                                <p class="text-slate-400 font-medium">Tidak ada data pelanggan</p>
                                <p class="text-slate-500 text-sm">Coba ubah filter atau tambah pelanggan baru</p>
                                ${this.searchQuery || this.statusFilter || this.serviceFilter ?
                                    '<button onclick="CustomerManager.resetFilters()" class="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-200">Reset Filter</button>' :
                                    ''
                                }
                            </div>
                        </td>
                    </tr>
                `;
                return;
            }

            tbody.innerHTML = customers.map(customer => `
                <tr class="hover:bg-slate-700/50 transition-colors duration-150">
                    <td class="px-6 py-4 whitespace-nowrap">
                        <input type="checkbox"
                               class="customer-checkbox h-4 w-4 rounded border-slate-600 bg-slate-700 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900"
                               data-customer-id="${customer.id}"
                               onchange="CustomerManager.toggleCustomerSelection(${customer.id})">
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="flex items-center">
                            <div class="h-10 w-10 bg-blue-500/10 rounded-full flex items-center justify-center mr-3">
                                <i class="fas fa-user text-blue-400"></i>
                            </div>
                            <div>
                                <div class="text-sm font-medium text-white">${Utils.sanitizeInput(customer.nama)}</div>
                                <div class="text-xs text-slate-400">ID: ${customer.id}</div>
                            </div>
                        </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="text-sm text-slate-300">
                            <div class="flex items-center">
                                <i class="fas fa-phone text-slate-400 mr-2"></i>
                                ${Utils.sanitizeInput(customer.nomor_hp) || '-'}
                            </div>
                            ${customer.email ? `
                                <div class="flex items-center mt-1">
                                    <i class="fas fa-envelope text-slate-400 mr-2"></i>
                                    <span class="text-xs">${Utils.sanitizeInput(customer.email)}</span>
                                </div>
                            ` : ''}
                        </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="flex flex-col space-y-1">
                            <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                <i class="fas fa-wifi mr-1"></i>
                                ${customer.total_vouchers || 0} Voucher
                            </span>
                            <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                <i class="fas fa-network-wired mr-1"></i>
                                ${customer.total_pppoe || 0} PPPoE
                            </span>
                        </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            customer.status_aktif
                                ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                                : 'bg-red-500/10 text-red-400 border border-red-500/20'
                        }">
                            <span class="w-2 h-2 mr-1.5 rounded-full ${
                                customer.status_aktif ? 'bg-green-400' : 'bg-red-400'
                            } ${customer.status_aktif ? 'animate-pulse' : ''}"></span>
                            ${customer.status_aktif ? 'Aktif' : 'Tidak Aktif'}
                        </span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="text-sm font-medium text-white">${Utils.formatCurrency(customer.credit_balance || 0)}</div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="text-sm text-slate-300">${Utils.formatCurrency(customer.debt_balance || 0)}</div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                        <div class="flex items-center">
                            <i class="far fa-clock mr-2 text-slate-500"></i>
                            ${Utils.formatDate(customer.created_at)}
                        </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div class="flex justify-end space-x-2">
                            <button class="inline-flex items-center px-2 py-1 text-xs font-medium rounded text-blue-400 hover:text-blue-300 hover:bg-blue-900/20 transition-colors duration-200 view-customer-btn"
                                    data-customer-id="${customer.id}"
                                    title="Detail">
                                <i class="fas fa-eye mr-1"></i>
                                Detail
                            </button>
                            <button class="inline-flex items-center px-2 py-1 text-xs font-medium rounded text-slate-400 hover:text-slate-300 hover:bg-slate-700 transition-colors duration-200 edit-customer-btn"
                                    data-customer-id="${customer.id}"
                                    title="Edit">
                                <i class="fas fa-edit mr-1"></i>
                                Edit
                            </button>
                            <button class="inline-flex items-center px-2 py-1 text-xs font-medium rounded text-red-400 hover:text-red-300 hover:bg-red-900/20 transition-colors duration-200 delete-customer-btn"
                                    data-customer-id="${customer.id}"
                                    data-customer-name="${Utils.sanitizeInput(customer.nama)}"
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

        renderPagination(pagination) {
            const container = document.getElementById('pageNumbers');
            if (!container) return;

            // Handle both current_page and page from backend
            const current_page = parseInt(pagination.current_page || pagination.page) || 1;
            const total_pages = parseInt(pagination.total_pages) || 1;

            let pageNumbersHTML = '';

            // Calculate page range
            const startPage = Math.max(1, current_page - 2);
            const endPage = Math.min(total_pages, current_page + 2);

            // Always show first page if not in range
            if (startPage > 1) {
                pageNumbersHTML += `
                    <button onclick="CustomerManager.goToPage(1)" class="px-3 py-2 text-sm font-medium rounded-md bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700 transition-colors duration-200">
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
                        <button onclick="CustomerManager.goToPage(${i})"
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
                    <button onclick="CustomerManager.goToPage(${total_pages})" class="px-3 py-2 text-sm font-medium rounded-md bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700 transition-colors duration-200">
                        ${total_pages}
                    </button>
                `;
            }

            container.innerHTML = pageNumbersHTML;

            // Update pagination controls
            this.updatePaginationControls(pagination);
        },

        updatePaginationControls(pagination) {
            try {
                console.log('Pagination data:', pagination);

                // Ensure all values are valid numbers with fallbacks
                // Handle both current_page and page from backend
                const current_page = parseInt(pagination.current_page || pagination.page) || 1;
                const total_pages = parseInt(pagination.total_pages) || 1;
                const total_items = parseInt(pagination.total || pagination.total_items) || 0;
                const pageSize = parseInt(this.pageSize) || parseInt(pagination.page_size) || 10;

                console.log('Parsed values:', { current_page, total_pages, total_items, pageSize });

                // Update prev/next buttons
                const prevBtn = document.getElementById('prevPage');
                const nextBtn = document.getElementById('nextPage');

                if (prevBtn) {
                    prevBtn.disabled = current_page === 1;
                }
                if (nextBtn) {
                    nextBtn.disabled = current_page === total_pages;
                }

                // Update pagination info with safe calculations
                const startRecord = (current_page - 1) * pageSize + 1;
                const endRecord = Math.min(current_page * pageSize, total_items);

                console.log('Calculated records:', { startRecord, endRecord });

                const startElement = document.getElementById('startRecord');
                const endElement = document.getElementById('endRecord');
                const totalElement = document.getElementById('totalRecords');

                if (startElement) startElement.textContent = startRecord;
                if (endElement) endElement.textContent = endRecord;
                if (totalElement) totalElement.textContent = total_items;
            } catch (error) {
                console.error('Error in updatePaginationControls:', error);
                // Set default values if something goes wrong
                const startElement = document.getElementById('startRecord');
                const endElement = document.getElementById('endRecord');
                const totalElement = document.getElementById('totalRecords');

                if (startElement) startElement.textContent = '0';
                if (endElement) endElement.textContent = '0';
                if (totalElement) totalElement.textContent = '0';
            }
        },

        updateShowingCount(count) {
            const showingElement = document.getElementById('showingCount');
            if (showingElement) {
                showingElement.textContent = count;
            }
        },

        updateStatistics(stats) {
            const elements = {
                totalCustomers: stats.total || 0,
                activeCustomers: stats.active || 0,
                hotspotCustomers: stats.hotspot || 0,
                pppoeCustomers: stats.pppoe || 0
            };

            Object.keys(elements).forEach(key => {
                const element = document.getElementById(key);
                if (element) {
                    element.setAttribute('data-target', elements[key]);
                    element.textContent = elements[key];
                }
            });

            // Update percentages
            const hotspotPercentage = document.getElementById('hotspotPercentage');
            const pppoePercentage = document.getElementById('pppoePercentage');

            if (hotspotPercentage && elements.totalCustomers > 0) {
                const percentage = Math.round((elements.hotspotCustomers / elements.totalCustomers) * 100);
                hotspotPercentage.textContent = `${percentage}%`;
            }

            if (pppoePercentage && elements.totalCustomers > 0) {
                const percentage = Math.round((elements.pppoeCustomers / elements.totalCustomers) * 100);
                pppoePercentage.textContent = `${percentage}%`;
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
            const customerCheckboxes = document.querySelectorAll('.customer-checkbox');

            customerCheckboxes.forEach(checkbox => {
                checkbox.checked = selectAllCheckbox.checked;
                const customerId = parseInt(checkbox.dataset.customerId);
                if (selectAllCheckbox.checked) {
                    this.selectedCustomers.add(customerId);
                } else {
                    this.selectedCustomers.delete(customerId);
                }
            });
        },

        toggleCustomerSelection(customerId) {
            if (this.selectedCustomers.has(customerId)) {
                this.selectedCustomers.delete(customerId);
            } else {
                this.selectedCustomers.add(customerId);
            }
            this.updateSelectAllState();
        },

        updateSelectAllState() {
            const selectAllCheckbox = document.getElementById('selectAll');
            const customerCheckboxes = document.querySelectorAll('.customer-checkbox');
            const checkedCount = document.querySelectorAll('.customer-checkbox:checked').length;

            if (checkedCount === 0) {
                selectAllCheckbox.checked = false;
                selectAllCheckbox.indeterminate = false;
            } else if (checkedCount === customerCheckboxes.length) {
                selectAllCheckbox.checked = true;
                selectAllCheckbox.indeterminate = false;
            } else {
                selectAllCheckbox.checked = false;
                selectAllCheckbox.indeterminate = true;
            }
        },

        goToPage(page) {
            this.currentPage = page;
            this.loadCustomers();
        },

        changePage(direction) {
            if (direction === 'prev') {
                this.currentPage = Math.max(1, this.currentPage - 1);
            } else {
                this.currentPage++;
            }
            this.loadCustomers();
        },

        resetFilters() {
            this.searchQuery = '';
            this.statusFilter = '';
            this.serviceFilter = '';
            this.dateFilter = '';
            this.minBalanceFilter = '';
            this.sortBy = 'name';
            this.sortOrder = 'asc';
            this.currentPage = 1;

            // Reset form elements
            const searchInput = document.getElementById('searchInput');
            const statusFilter = document.getElementById('statusFilter');
            const serviceFilter = document.getElementById('serviceFilter');
            const dateFilter = document.getElementById('dateFilter');
            const minBalance = document.getElementById('minBalance');
            const sortBy = document.getElementById('sortBy');

            if (searchInput) searchInput.value = '';
            if (statusFilter) statusFilter.value = '';
            if (serviceFilter) serviceFilter.value = '';
            if (dateFilter) dateFilter.value = '';
            if (minBalance) minBalance.value = '';
            if (sortBy) sortBy.value = 'name';

            this.loadCustomers();
        },

        refreshCustomers() {
            this.loadCustomers();
            this.loadStatistics();
            ToastManager.show('Data berhasil diperbarui', 'success');
        },

        viewCustomerDetails(customerId) {
            this.showCustomerDetailModal(customerId);
        },

        async showCustomerDetailModal(customerId) {
            try {
                LoadingManager.show('Memuat detail pelanggan...');

                const response = await fetch(`/customers/api/customers/${customerId}`);
                const data = await response.json();

                if (data.success) {
                    this.renderCustomerDetail(data.customer);
                    this.showModal('customerDetailModal');
                } else {
                    ToastManager.show('Gagal memuat detail pelanggan', 'error');
                }
            } catch (error) {
                console.error('Error loading customer details:', error);
                ToastManager.show('Terjadi kesalahan saat memuat detail', 'error');
            } finally {
                LoadingManager.hide();
            }
        },

        renderCustomerDetail(customer) {
            const modalTitle = document.getElementById('modalCustomerName');
            const modalContent = document.getElementById('customerDetailContent');

            if (modalTitle) {
                modalTitle.textContent = `Detail Pelanggan - ${customer.nama}`;
            }

            if (modalContent) {
                modalContent.innerHTML = `
                    <div class="space-y-6">
                        <!-- Customer Information -->
                        <div class="bg-slate-900/50 rounded-lg p-6 border border-slate-600">
                            <h3 class="text-lg font-semibold text-white mb-4 flex items-center">
                                <i class="fas fa-user mr-2 text-blue-400"></i>
                                Informasi Pelanggan
                            </h3>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <p class="text-sm text-slate-400">Nama Lengkap</p>
                                    <p class="text-white font-medium">${Utils.sanitizeInput(customer.nama)}</p>
                                </div>
                                <div>
                                    <p class="text-sm text-slate-400">ID Pelanggan</p>
                                    <p class="text-white font-medium">#${customer.id}</p>
                                </div>
                                <div>
                                    <p class="text-sm text-slate-400">Nomor HP</p>
                                    <p class="text-white font-medium">${Utils.sanitizeInput(customer.nomor_hp) || '-'}</p>
                                </div>
                                <div>
                                    <p class="text-sm text-slate-400">Email</p>
                                    <p class="text-white font-medium">${Utils.sanitizeInput(customer.email) || '-'}</p>
                                </div>
                                <div>
                                    <p class="text-sm text-slate-400">Status</p>
                                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                        customer.status_aktif
                                            ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                                            : 'bg-red-500/10 text-red-400 border border-red-500/20'
                                    }">
                                        ${customer.status_aktif ? 'Aktif' : 'Tidak Aktif'}
                                    </span>
                                </div>
                                <div>
                                    <p class="text-sm text-slate-400">Terdaftar Sejak</p>
                                    <p class="text-white font-medium">${Utils.formatDate(customer.created_at)}</p>
                                </div>
                            </div>
                        </div>

                        <!-- Financial Information -->
                        <div class="bg-slate-900/50 rounded-lg p-6 border border-slate-600">
                            <h3 class="text-lg font-semibold text-white mb-4 flex items-center">
                                <i class="fas fa-dollar-sign mr-2 text-green-400"></i>
                                Informasi Keuangan
                            </h3>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <p class="text-sm text-slate-400">Saldo Kredit</p>
                                    <p class="text-2xl font-bold text-green-400">${Utils.formatCurrency(customer.credit_balance || 0)}</p>
                                </div>
                                <div>
                                    <p class="text-sm text-slate-400">Hutang</p>
                                    <p class="text-2xl font-bold text-red-400">${Utils.formatCurrency(customer.debt_balance || 0)}</p>
                                </div>
                            </div>
                        </div>

                        <!-- Services -->
                        <div class="bg-slate-900/50 rounded-lg p-6 border border-slate-600">
                            <h3 class="text-lg font-semibold text-white mb-4 flex items-center">
                                <i class="fas fa-cog mr-2 text-purple-400"></i>
                                Layanan Aktif
                            </h3>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div class="bg-blue-500/10 rounded-lg p-4 border border-blue-500/20">
                                    <div class="flex items-center justify-between">
                                        <div>
                                            <p class="text-blue-400 font-medium">Voucher Hotspot</p>
                                            <p class="text-2xl font-bold text-white">${customer.total_vouchers || 0}</p>
                                        </div>
                                        <i class="fas fa-wifi text-3xl text-blue-400 opacity-50"></i>
                                    </div>
                                </div>
                                <div class="bg-purple-500/10 rounded-lg p-4 border border-purple-500/20">
                                    <div class="flex items-center justify-between">
                                        <div>
                                            <p class="text-purple-400 font-medium">User PPPoE</p>
                                            <p class="text-2xl font-bold text-white">${customer.total_pppoe || 0}</p>
                                        </div>
                                        <i class="fas fa-network-wired text-3xl text-purple-400 opacity-50"></i>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Action Buttons -->
                        <div class="flex justify-end space-x-3 pt-4 border-t border-slate-700">
                            <button onclick="CustomerManager.editCustomer(${customer.id})"
                                    class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-200">
                                <i class="fas fa-edit mr-2"></i>
                                Edit Pelanggan
                            </button>
                            <button onclick="CustomerManager.closeModal('customerDetailModal')"
                                    class="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg transition-colors duration-200">
                                Tutup
                            </button>
                        </div>
                    </div>
                `;
            }
        },

        editCustomer(customerId) {
            window.location.href = `/customers/edit/${customerId}`;
        },

        showDeleteConfirmation(customerId, customerName) {
            const nameElement = document.getElementById('deleteCustomerName');
            const contactElement = document.getElementById('deleteCustomerContact');
            const confirmBtn = document.querySelector('[onclick="confirmDelete()"]');

            if (nameElement) {
                nameElement.textContent = customerName;
            }

            if (contactElement) {
                // Find customer contact info
                const customerRow = document.querySelector(`[data-customer-id="${customerId}"]`).closest('tr');
                const contactInfo = customerRow.querySelector('.text-slate-300').textContent;
                contactElement.textContent = contactInfo;
            }

            if (confirmBtn) {
                confirmBtn.setAttribute('data-customer-id', customerId);
            }

            this.showModal('deleteConfirmModal');
        },

        async confirmDelete() {
            const confirmBtn = document.querySelector('[onclick="confirmDelete()"]');
            const customerId = confirmBtn.dataset.customerId;

            try {
                LoadingManager.show('Menghapus pelanggan...');

                const response = await fetch(`/customers/api/customers/${customerId}`, {
                    method: 'DELETE'
                });
                const data = await response.json();

                if (data.success) {
                    ToastManager.show('Pelanggan berhasil dihapus', 'success');
                    this.closeModal('deleteConfirmModal');
                    this.loadCustomers();
                    this.loadStatistics();
                } else {
                    ToastManager.show(data.message || 'Gagal menghapus pelanggan', 'error');
                }
            } catch (error) {
                console.error('Error deleting customer:', error);
                ToastManager.show('Terjadi kesalahan saat menghapus pelanggan', 'error');
            } finally {
                LoadingManager.hide();
            }
        },

        exportCustomers() {
            const params = new URLSearchParams({
                search: this.searchQuery,
                status: this.statusFilter,
                service: this.serviceFilter,
                date_filter: this.dateFilter,
                min_balance: this.minBalanceFilter,
                format: 'csv'
            });

            window.location.href = `/customers/api/customers/export?${params}`;
            ToastManager.show('Mengunduh data pelanggan...', 'info');
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
    window.CustomerManager = CustomerManager;
    window.ToastManager = ToastManager;
    window.LoadingManager = LoadingManager;
    window.exportCustomers = () => CustomerManager.exportCustomers();
    window.refreshCustomers = () => CustomerManager.refreshCustomers();
    window.confirmDelete = () => CustomerManager.confirmDelete();
    window.closeCustomerModal = () => CustomerManager.closeModal('customerDetailModal');
    window.closeDeleteModal = () => CustomerManager.closeModal('deleteConfirmModal');
    window.toggleAdvancedFilters = () => {
        const advancedFilters = document.getElementById('advancedFilters');
        if (advancedFilters) {
            advancedFilters.classList.toggle('hidden');
            CustomerManager.advancedFiltersVisible = !CustomerManager.advancedFiltersVisible;
        }
    };

    // Initialize the customer manager
    CustomerManager.init();
});