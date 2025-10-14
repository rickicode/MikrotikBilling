document.addEventListener('DOMContentLoaded', function() {
    loadPPPoEUsers();
    loadPPPoEStatistics();
    setupEventListeners();
    startRealtimeUpdates();
});

let currentPage = 1;
let pageSize = 10;
let currentFilters = {};
let syncEnabled = true;

// Auto sync settings
const autoSyncEnabled = true;
const autoSyncInterval = 30000; // 30 seconds
let autoSyncTimer = null;

// Setup event listeners
function setupEventListeners() {
    // Search form submission
    const searchForm = document.getElementById('searchForm');
    if (searchForm) {
        searchForm.addEventListener('submit', function(e) {
            e.preventDefault();
            currentPage = 1;
            currentFilters = {
                search: document.getElementById('searchInput').value,
                profile: document.getElementById('profileFilter').value,
                status: document.getElementById('statusFilter').value,
                expiry: document.getElementById('expiryFilter').value
            };
            loadPPPoEUsers();
        });
    }

    // Page size change
    const pageSizeSelect = document.getElementById('pageSizeSelect');
    if (pageSizeSelect) {
        pageSizeSelect.addEventListener('change', function() {
            pageSize = parseInt(this.value);
            currentPage = 1;
            loadPPPoEUsers();
        });
    }

    // Sync Mikrotik button (header)
    const syncPPPoEBtn = document.getElementById('syncPPPoEBtn');
    if (syncPPPoEBtn) {
        syncPPPoEBtn.addEventListener('click', async function() {
            await syncWithMikrotik();
        });
    }

    // Select all checkboxes (consistent with vouchers and customers)
    const selectAll = document.getElementById('selectAll');
    const selectAllHeader = document.getElementById('selectAllHeader');

    if (selectAll && selectAllHeader) {
        selectAll.addEventListener('change', function() {
            selectAllHeader.checked = this.checked;
            toggleAllCheckboxes(this.checked);
        });

        selectAllHeader.addEventListener('change', function() {
            selectAll.checked = this.checked;
            toggleAllCheckboxes(this.checked);
        });
    }

    // Real-time search
    let searchTimeout;
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                currentPage = 1;
                currentFilters.search = this.value;
                loadPPPoEUsers();
            }, 500);
        });
    }

    // Extend duration change
    const extendDuration = document.getElementById('extendDuration');
    if (extendDuration) {
        extendDuration.addEventListener('change', updateExtendTotal);
    }

    // Export button
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportPPPoE);
    }

    // Sync button
    const syncBtn = document.getElementById('syncBtn');
    if (syncBtn) {
        syncBtn.addEventListener('click', syncWithMikrotik);
    }

    // Sync Mikrotik button (header) - inline onclick handler
    window.syncPPPoE = syncWithMikrotik;

    // Confirm extend button
    const confirmExtendBtn = document.getElementById('confirmExtendBtn');
    if (confirmExtendBtn) {
        confirmExtendBtn.addEventListener('click', confirmExtend);
    }

    // Event delegation for dynamic elements
    document.addEventListener('click', function(e) {
        // View PPPoE details
        if (e.target.closest('.view-pppoe-btn')) {
            e.preventDefault();
            const pppoeId = e.target.closest('.view-pppoe-btn').dataset.pppoeId;
            viewPPPoE(pppoeId);
        }

        // Extend PPPoE
        if (e.target.closest('.extend-pppoe-btn')) {
            e.preventDefault();
            const pppoeId = e.target.closest('.extend-pppoe-btn').dataset.pppoeId;
            extendPPPoE(pppoeId);
        }

        // Enable PPPoE
        if (e.target.closest('.enable-pppoe-btn')) {
            e.preventDefault();
            const pppoeId = e.target.closest('.enable-pppoe-btn').dataset.pppoeId;
            enablePPPoE(pppoeId);
        }

        // Disable PPPoE
        if (e.target.closest('.disable-pppoe-btn')) {
            e.preventDefault();
            const pppoeId = e.target.closest('.disable-pppoe-btn').dataset.pppoeId;
            disablePPPoE(pppoeId);
        }

        // Delete PPPoE
        if (e.target.closest('.delete-pppoe-btn')) {
            e.preventDefault();
            const pppoeId = e.target.closest('.delete-pppoe-btn').dataset.pppoeId;
            deletePPPoE(pppoeId);
        }

        // Toggle password
        if (e.target.closest('.toggle-password-btn')) {
            e.preventDefault();
            const password = e.target.closest('.toggle-password-btn').dataset.password;
            togglePassword(password);
        }

        // Copy username
        if (e.target.closest('.copy-username-btn')) {
            e.preventDefault();
            const username = e.target.closest('.copy-username-btn').dataset.username;
            copyToClipboard(username);
        }

        // Pagination
        if (e.target.closest('.page-link')) {
            e.preventDefault();
            const pageLink = e.target.closest('.page-link');
            if (!pageLink.closest('.page-item.disabled') && !pageLink.closest('.page-item.active')) {
                const page = parseInt(pageLink.dataset.page);
                if (page) {
                    changePage(page);
                }
            }
        }
    });
}

// Load PPPoE users
async function loadPPPoEUsers() {
    try {
        showLoading();

        // Always sync with Mikrotik for real-time status
        const params = new URLSearchParams({
            page: currentPage,
            page_size: pageSize,
            sync: true,
            ...currentFilters
        });

        const response = await fetch(`/pppoe/api/pppoe?${params}`, {
            credentials: 'include'
        });
        const data = await response.json();

        renderPPPoETable(data.pppoe_users || []);
        if (data.pagination) {
            renderPagination(data.pagination);
        }
        if (data.statistics) {
            updateStatistics(data.statistics);
        }

    } catch (error) {
        console.error('Error loading PPPoE users:', error);
        showError('Gagal memuat data PPPoE');
    } finally {
        hideLoading();
    }
}

// Load PPPoE statistics
async function loadPPPoEStatistics() {
    try {
        const response = await fetch('/pppoe/api/statistics', {
            credentials: 'include'
        });
        const data = await response.json();

        document.getElementById('totalPPPoE').textContent = data.total || 0;
        document.getElementById('activePPPoE').textContent = data.active || 0;
        document.getElementById('onlinePPPoE').textContent = data.online || 0;
        document.getElementById('expiredPPPoE').textContent = data.expired || 0;

    } catch (error) {
        console.error('Error loading PPPoE statistics:', error);
    }
}

// Render PPPoE table
function renderPPPoETable(users) {
    const tbody = document.getElementById('pppoeTableBody');

    if (users.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center py-8">
                    <div class="flex flex-col items-center space-y-3">
                        <div class="w-16 h-16 bg-slate-700/50 rounded-full flex items-center justify-center">
                            <i class="fas fa-inbox text-2xl text-slate-400"></i>
                        </div>
                        <p class="text-slate-400">Tidak ada data PPPoE</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = users.map(user => {
        // Username display with copy button
        const usernameDisplay = `
            <div class="flex items-center gap-2">
                <code class="font-mono text-xs bg-slate-900/50 px-2 py-1 rounded border border-slate-600/50 text-slate-200">${user.username}</code>
                <button class="copy-btn copy-username-btn bg-slate-600/20 hover:bg-slate-600/40 text-slate-400 hover:text-slate-200 border border-slate-600/30 hover:border-slate-500/50" data-username="${user.username}" title="Copy username">
                    <i class="bi bi-clipboard text-xs"></i>
                </button>
            </div>
        `;

        // Customer info
        const customerInfo = user.customer_name ? `
            <div>
                <div class="fw-medium">${user.customer_name}</div>
                ${user.customer_phone ? `<small class="text-muted">${user.customer_phone}</small>` : ''}
            </div>
        ` : '<span class="text-muted">Tidak ada pelanggan</span>';

        // Expiry info with warning
        const isExpiring = isExpiringSoon(user.expires_at);
        const daysLeft = getDaysUntilExpiry(user.expires_at);
        const expiryInfo = `
            <div>
                <small class="text-muted">${formatDate(user.expires_at)}</small>
                ${isExpiring && daysLeft > 0 ? `<div class="text-warning small"><i class="bi bi-exclamation-triangle"></i> ${daysLeft} hari lagi</div>` : ''}
                ${daysLeft < 0 ? '<div class="text-danger small"><i class="bi bi-x-circle"></i> Kadaluarsa</div>' : ''}
            </div>
        `;

        // Status badges with enhanced styling
        const statusBadges = `
            <div class="flex flex-col gap-1.5">
                ${getPPPoEStatusBadge(user)}
                <div class="${user.is_online !== false ? 'online-indicator online' : 'online-indicator offline'}">
                    ${user.is_online !== false ? 'Online' : 'Offline'}
                </div>
            </div>
        `;

        // Action buttons with enhanced styling
        const actionButtons = `
            <div class="btn-group-custom">
                <button class="btn-action btn-view view-pppoe-btn" data-pppoe-id="${user.id}" title="Lihat detail">
                    <i class="bi bi-eye text-xs"></i>
                </button>
                <button class="btn-action btn-toggle toggle-password-btn" data-password="${user.password}" title="Toggle password">
                    <i class="bi bi-key text-xs"></i>
                </button>
                ${user.status === 'active' ? `
                    <button class="btn-action btn-extend extend-pppoe-btn" data-pppoe-id="${user.id}" title="Perpanjang">
                        <i class="bi bi-arrow-clockwise text-xs"></i>
                    </button>
                ` : ''}
                ${user.status === 'disabled' ? `
                    <button class="btn-action btn-enable enable-pppoe-btn" data-pppoe-id="${user.id}" title="Aktifkan">
                        <i class="bi bi-play-circle text-xs"></i>
                    </button>
                ` : ''}
                ${user.status === 'active' ? `
                    <button class="btn-action btn-disable disable-pppoe-btn" data-pppoe-id="${user.id}" title="Nonaktifkan">
                        <i class="bi bi-pause-circle text-xs"></i>
                    </button>
                ` : ''}
                <button class="btn-action btn-delete delete-pppoe-btn" data-pppoe-id="${user.id}" title="Hapus">
                    <i class="bi bi-trash text-xs"></i>
                </button>
            </div>
        `;

        return `
            <tr class="table-row-hover">
                <td>
                    <input class="form-check-input" type="checkbox" data-id="${user.id}" onchange="updateSingleCheckbox(this)">
                </td>
                <td>
                    ${usernameDisplay}
                </td>
                <td>
                    ${customerInfo}
                </td>
                <td><span class="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">${user.profile_name}</span></td>
                <td>${statusBadges}</td>
                <td>
                    <div class="${user.is_online ? 'online-indicator online' : 'online-indicator offline'}">
                        ${user.is_online ? 'Online' : 'Offline'}
                    </div>
                </td>
                <td><small class="text-slate-400">${formatDate(user.created_at)}</small></td>
                <td>${expiryInfo}</td>
                <td>
                    <div class="flex justify-end">
                        ${actionButtons}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Get PPPoE status badge with enhanced styling
function getPPPoEStatusBadge(user) {
    const statusConfig = {
        'active': {
            class: 'status-badge bg-green-500/10 text-green-400 border border-green-500/20',
            icon: 'bi-check-circle-fill',
            label: 'Aktif'
        },
        'disabled': {
            class: 'status-badge bg-amber-500/10 text-amber-400 border border-amber-500/20',
            icon: 'bi-pause-circle-fill',
            label: 'Nonaktif'
        },
        'expired': {
            class: 'status-badge bg-red-500/10 text-red-400 border border-red-500/20 badge-pulse',
            icon: 'bi-x-circle-fill',
            label: 'Kadaluarsa'
        }
    };

    const config = statusConfig[user.status] || statusConfig.active;

    return `
        <span class="${config.class}">
            <i class="bi ${config.icon} me-1.5"></i>${config.label}
        </span>
    `;
}

// Check if expiring soon
function isExpiringSoon(expiryDate) {
    const expiry = new Date(expiryDate);
    const now = new Date();
    const diffTime = expiry - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= 7 && diffDays >= 0;
}

// Get days until expiry
function getDaysUntilExpiry(expiryDate) {
    const expiry = new Date(expiryDate);
    const now = new Date();
    const diffTime = expiry - now;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// Render pagination
function renderPagination(pagination) {
    const paginationEl = document.getElementById('paginationNav');
    if (!paginationEl) return;

    let html = '';

    // Previous button
    html += `
        <li class="page-item ${pagination.page === 1 ? 'disabled' : ''}">
            <a class="page-link" href="#" data-page="${pagination.page - 1}" aria-label="Previous">
                <i class="bi bi-chevron-left"></i>
            </a>
        </li>
    `;

    // Page numbers with ellipsis
    const totalPages = pagination.total_pages;
    const currentPage = pagination.page;

    // Always show first page
    if (totalPages > 0) {
        html += `
            <li class="page-item ${currentPage === 1 ? 'active' : ''}">
                <a class="page-link" href="#" data-page="1">1</a>
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
                    <a class="page-link" href="#" data-page="${i}">${i}</a>
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
                <a class="page-link" href="#" data-page="${totalPages}">${totalPages}</a>
            </li>
        `;
    }

    // Next button
    html += `
        <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
            <a class="page-link" href="#" data-page="${currentPage + 1}" aria-label="Next">
                <i class="bi bi-chevron-right"></i>
            </a>
        </li>
    `;

    paginationEl.innerHTML = html;

    // Update pagination info
    updatePaginationInfo(pagination);
}

// Update pagination info
function updatePaginationInfo(pagination) {
    // Fix NaN issues with proper validation
    const currentPage = parseInt(pagination.page) || 1;
    const pageSize = parseInt(pagination.page_size) || 10;
    const totalPages = parseInt(pagination.total_pages) || 1;
    const totalItems = parseInt(pagination.total_items) || 0;

    const startItem = totalItems > 0 ? (currentPage - 1) * pageSize + 1 : 0;
    const endItem = Math.min(currentPage * pageSize, totalItems);

    const startElement = document.getElementById('startItem');
    const endElement = document.getElementById('endItem');
    const totalElement = document.getElementById('totalItems');

    if (startElement) startElement.textContent = startItem;
    if (endElement) endElement.textContent = endItem;
    if (totalElement) totalElement.textContent = totalItems;

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

// Change page
function changePage(page) {
    currentPage = page;
    loadPPPoEUsers();
}

// View PPPoE details
async function viewPPPoE(pppoeId) {
    try {
        // Get the full PPPoE data from the main API
        const listResponse = await fetch('/pppoe/api/pppoe', {
            credentials: 'include'
        });
        const listData = await listResponse.json();

        // Find the specific PPPoE user
        const pppoe = listData.pppoe_users.find(u => u.id == pppoeId);

        if (!pppoe) {
            showError('PPPoE user not found');
            return;
        }

        const modal = document.getElementById('pppoeDetailsModal');
        const content = document.getElementById('pppoeDetailsContent');
        if (modal && content) {
            content.innerHTML = renderPPPoEDetails(pppoe);
            modal.classList.remove('hidden');
        }

    } catch (error) {
        console.error('Error loading PPPoE details:', error);
        showError('Gagal memuat detail PPPoE');
    }
}

// Render PPPoE details
function renderPPPoEDetails(pppoe) {
    return `
        <div class="row">
            <div class="col-md-6">
                <h6>Informasi PPPoE</h6>
                <table class="table table-sm">
                    <tr>
                        <td width="150">Username</td>
                        <td><code class="bg-light px-2 py-1 rounded">${pppoe.username}</code></td>
                    </tr>
                    <tr>
                        <td>Password</td>
                        <td>
                            <div class="d-flex align-items-center">
                                <code id="passwordDisplay" class="bg-light px-2 py-1 rounded me-2">••••••••</code>
                                <button class="btn btn-sm btn-outline-primary toggle-password-btn" data-password="${pppoe.password}">
                                    <i class="bi bi-eye"></i>
                                </button>
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <td>Status</td>
                        <td>${getPPPoEStatusBadge(pppoe)}</td>
                    </tr>
                    <tr>
                        <td>Profile</td>
                        <td>${pppoe.profile_name}</td>
                    </tr>
                    <tr>
                        <td>Mikrotik User</td>
                        <td>${pppoe.mikrotik_name || '-'}</td>
                    </tr>
                </table>
            </div>
            <div class="col-md-6">
                <h6>Informasi Waktu</h6>
                <table class="table table-sm">
                    <tr>
                        <td width="150">Mulai</td>
                        <td>${formatDateTime(pppoe.created_at)}</td>
                    </tr>
                    <tr>
                        <td>Expired</td>
                        <td class="${isExpiringSoon(pppoe.expires_at) ? 'text-danger' : ''}">
                            ${formatDateTime(pppoe.expires_at)}
                        </td>
                    </tr>
                    <tr>
                        <td>Sisa Waktu</td>
                        <td>
                            ${getTimeRemainingShort(pppoe.expires_at)}
                        </td>
                    </tr>
                    <tr>
                        <td>Created</td>
                        <td>${formatDateTime(pppoe.created_at)}</td>
                    </tr>
                    <tr>
                        <td>Updated</td>
                        <td>${formatDateTime(pppoe.updated_at)}</td>
                    </tr>
                </table>
            </div>
        </div>

        <div class="row mt-3">
            <div class="col-md-6">
                <h6>Informasi Pelanggan</h6>
                ${pppoe.customer_name ? `
                    <table class="table table-sm">
                        <tr>
                            <td width="150">Nama</td>
                            <td>${pppoe.customer_name}</td>
                        </tr>
                        <tr>
                            <td>Nomor HP</td>
                            <td>${pppoe.customer_phone || '-'}</td>
                        </tr>
                        <tr>
                            <td>Email</td>
                            <td>${pppoe.customer_email || '-'}</td>
                        </tr>
                    </table>
                ` : '<p class="text-muted">Tidak terhubung ke pelanggan</p>'}
            </div>
            <div class="col-md-6">
                <h6>Informasi Keuangan</h6>
                <table class="table table-sm">
                    <tr>
                        <td width="150">Harga Jual</td>
                        <td><span class="text-success">${formatCurrency(pppoe.selling_price)}</span></td>
                    </tr>
                    <tr>
                        <td>Harga Modal</td>
                        <td><span class="text-danger">${formatCurrency(pppoe.cost_price)}</span></td>
                    </tr>
                    <tr>
                        <td>Profit</td>
                        <td><span class="text-primary">${formatCurrency(pppoe.selling_price - pppoe.cost_price)}</span></td>
                    </tr>
                </table>
            </div>
        </div>

        ${pppoe.is_online ? `
            <div class="alert alert-success mt-3">
                <i class="bi bi-wifi me-2"></i>
                <strong>Online sekarang</strong><br>
                <small>IP: ${pppoe.online_ip || '-'}, Uptime: ${pppoe.online_uptime || '-'}</small>
            </div>
        ` : ''}

        <div class="text-center mt-3">
            ${pppoe.status === 'active' ? `
                <button class="btn btn-success me-2 extend-pppoe-btn" data-pppoe-id="${pppoe.id}">
                    <i class="bi bi-arrow-clockwise"></i> Perpanjang
                </button>
                <button class="btn btn-warning me-2 disable-pppoe-btn" data-pppoe-id="${pppoe.id}">
                    <i class="bi bi-pause-circle"></i> Nonaktifkan
                </button>
            ` : ''}
            ${pppoe.status === 'disabled' ? `
                <button class="btn btn-success me-2 enable-pppoe-btn" data-pppoe-id="${pppoe.id}">
                    <i class="bi bi-play-circle"></i> Aktifkan
                </button>
            ` : ''}
            <button class="btn btn-outline-danger delete-pppoe-btn" data-pppoe-id="${pppoe.id}">
                <i class="bi bi-trash"></i> Hapus
            </button>
        </div>
    `;
}

// Toggle password visibility
function togglePassword(password) {
    const display = document.getElementById('passwordDisplay');
    if (display.textContent === '••••••••') {
        display.textContent = password;
    } else {
        display.textContent = '••••••••';
    }
}

// Get time remaining
function getTimeRemaining(expiryDate) {
    const expiry = new Date(expiryDate);
    const now = new Date();
    const diffTime = expiry - now;

    if (diffTime <= 0) {
        return '<span class="text-danger">Kadaluarsa</span>';
    }

    const days = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diffTime % (1000 * 60 * 60)) / (1000 * 60));

    let result = '';
    if (days > 0) result += `${days} hari `;
    if (hours > 0) result += `${hours} jam `;
    if (minutes > 0 && days === 0) result += `${minutes} menit`;

    return result.trim() || '< 1 menit';
}

// Get time remaining (short version)
function getTimeRemainingShort(expiryDate) {
    const expiry = new Date(expiryDate);
    const now = new Date();
    const diffTime = expiry - now;

    if (diffTime <= 0) {
        return '<span class="text-danger">Kadaluarsa</span>';
    }

    const days = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days > 0) {
        return `${days} hari ${hours} jam`;
    } else if (hours > 0) {
        return `${hours} jam`;
    } else {
        return '< 1 jam';
    }
}

// Extend PPPoE
function extendPPPoE(pppoeId) {
    // Load PPPoE data first
    fetch('/pppoe/api/pppoe')
        .then(response => response.json())
        .then(data => {
            const pppoe = data.pppoe_users.find(u => u.id == pppoeId);

            if (!pppoe) {
                showError('PPPoE user not found');
                return;
            }

            const modal = document.getElementById('extendModal');
            const userIdField = document.getElementById('extendUserId');
            const usernameField = document.getElementById('extendUsername');
            if (modal && userIdField && usernameField) {
                userIdField.value = pppoeId;
                usernameField.value = pppoe.username;
                updateExtendTotal();
                modal.classList.remove('hidden');
            }
        })
        .catch(error => {
            console.error('Error loading PPPoE data:', error);
            showError('Gagal memuat data PPPoE');
        });
}

// Update extend total
async function updateExtendTotal() {
    const userId = document.getElementById('extendUserId').value;
    const duration = parseInt(document.getElementById('extendDuration').value);

    if (!userId || !duration) return;

    try {
        // Get PPPoE data to calculate price
        const response = await fetch('/pppoe/api/pppoe', {
            credentials: 'include'
        });
        const data = await response.json();
        const pppoe = data.pppoe_users.find(u => u.id == userId);

        if (pppoe && pppoe.selling_price) {
            // Calculate based on daily rate (selling_price / duration_hours * 24)
            const dailyRate = (pppoe.selling_price / (pppoe.duration_hours || 720)) * 24;
            const total = dailyRate * duration;
            document.getElementById('extendTotal').value = formatCurrency(total);
        }

    } catch (error) {
        console.error('Error calculating extend total:', error);
    }
}

// Confirm extend
async function confirmExtend() {
    const userId = document.getElementById('extendUserId').value;
    const duration = parseInt(document.getElementById('extendDuration').value);
    const paymentMethod = document.getElementById('extendPaymentMethod').value;

    try {
        const response = await fetch(`/pppoe/${userId}/renew`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
                additional_days: duration,
                method: paymentMethod,
                amount: document.getElementById('extendTotal').value.replace(/[^0-9]/g, '')
            })
        });

        if (response.ok) {
            const modal = document.getElementById('extendModal');
            if (modal) {
                modal.classList.add('hidden');
            }
            loadPPPoEUsers();
            showSuccess('PPPoE berhasil diperpanjang');
        } else {
            throw new Error('Gagal memperpanjang PPPoE');
        }

    } catch (error) {
        console.error('Error extending PPPoE:', error);
        showError('Gagal memperpanjang PPPoE');
    }
}

// Enable PPPoE
async function enablePPPoE(pppoeId) {
    try {
        const response = await fetch(`/pppoe/${pppoeId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
                status: 'active'
            })
        });

        if (response.ok) {
            loadPPPoEUsers();
            showSuccess('PPPoE berhasil diaktifkan');
        } else {
            throw new Error('Gagal mengaktifkan PPPoE');
        }

    } catch (error) {
        console.error('Error enabling PPPoE:', error);
        showError('Gagal mengaktifkan PPPoE');
    }
}

// Disable PPPoE
async function disablePPPoE(pppoeId) {
    try {
        const response = await fetch(`/pppoe/${pppoeId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
                status: 'disabled'
            })
        });

        if (response.ok) {
            loadPPPoEUsers();
            showSuccess('PPPoE berhasil dinonaktifkan');
        } else {
            throw new Error('Gagal menonaktifkan PPPoE');
        }

    } catch (error) {
        console.error('Error disabling PPPoE:', error);
        showError('Gagal menonaktifkan PPPoE');
    }
}

// Delete PPPoE
function deletePPPoE(pppoeId) {
    const modal = document.getElementById('deleteConfirmModal');
    const usernameElement = document.getElementById('deletePPPoEUsername');
    const confirmBtn = document.getElementById('confirmDeleteBtn');

    if (modal && usernameElement && confirmBtn) {
        usernameElement.textContent = `#${pppoeId}`;
        confirmBtn.onclick = () => confirmDelete(pppoeId);
        modal.classList.remove('hidden');
    }
}

// Confirm delete
async function confirmDelete(pppoeId) {
    try {
        const response = await fetch(`/pppoe/${pppoeId}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        const data = await response.json();

        if (response.ok && data.success) {
            const modal = document.getElementById('deleteConfirmModal');
            if (modal) {
                modal.classList.add('hidden');
            }
            loadPPPoEUsers();
            loadPPPoEStatistics();
            showSuccess('PPPoE berhasil dihapus');
        } else {
            throw new Error('Gagal menghapus PPPoE');
        }

    } catch (error) {
        console.error('Error deleting PPPoE:', error);
        showError('Gagal menghapus PPPoE');
    }
}

// Sync with Mikrotik
async function syncWithMikrotik() {
    try {
        showSyncing();

        const response = await fetch('/pppoe/api/pppoe?sync=true', {
            method: 'GET',
            credentials: 'include'
        });

        const data = await response.json();

        if (response.ok) {
            loadPPPoEUsers();
            loadPPPoEStatistics();
            showSuccess(`Sync berhasil: ${data.ppppoe_users?.length || 0} users disinkronkan`);
        } else {
            throw new Error(data.message || 'Gagal sync dengan Mikrotik');
        }

    } catch (error) {
        console.error('Error syncing with Mikrotik:', error);
        showError('Gagal sync dengan Mikrotik');
    } finally {
        hideSyncing();
    }
}

// Start real-time updates
function startRealtimeUpdates() {
    // Auto sync with Mikrotik every 30 seconds
    if (autoSyncEnabled) {
        autoSyncTimer = setInterval(async () => {
            try {
                console.log('Auto-syncing PPPoE users...');
                await syncWithMikrotik();
            } catch (error) {
                console.error('Auto sync error:', error);
            }
        }, autoSyncInterval);
    }
    
    // Update statistics every minute
    setInterval(() => {
        loadPPPoEStatistics();
    }, 60000);
}

// Export PPPoE
function exportPPPoE() {
    const params = new URLSearchParams(currentFilters);
    window.location.href = `/api/pppoe/export?${params}`;
}

// Update statistics
function updateStatistics(statistics) {
    console.log('Updating PPPoE statistics:', statistics);

    // Update total count - check multiple possible selectors
    let totalElement = document.getElementById('totalPPPoE') ||
                      document.querySelector('[data-stat="total"]') ||
                      document.querySelector('.total-stat');
    if (totalElement && statistics.total !== undefined) {
        totalElement.textContent = statistics.total;
        totalElement.dataset.target = statistics.total;
    }

    // Update active count
    let activeElement = document.getElementById('activePPPoE') ||
                        document.querySelector('[data-stat="active"]') ||
                        document.querySelector('.active-stat');
    if (activeElement && statistics.active !== undefined) {
        activeElement.textContent = statistics.active;
        activeElement.dataset.target = statistics.active;
    }

    // Update online count
    let onlineElement = document.getElementById('onlinePPPoE') ||
                         document.querySelector('[data-stat="online"]') ||
                         document.querySelector('.online-stat');
    if (onlineElement && statistics.online !== undefined) {
        onlineElement.textContent = statistics.online;
        onlineElement.dataset.target = statistics.online;
    }

    // Update expired count
    let expiredElement = document.getElementById('expiredPPPoE') ||
                          document.querySelector('[data-stat="expired"]') ||
                          document.querySelector('.expired-stat');
    if (expiredElement && statistics.expired !== undefined) {
        expiredElement.textContent = statistics.expired;
        expiredElement.dataset.target = statistics.expired;
    }

    // Animate the updated counters
    setTimeout(() => {
        animateCounters();
    }, 100);
}

// Sync status helper functions (mirip voucher)
function getSyncStatusBadgeClass(mikrotik_synced = 0) {
    return mikrotik_synced ? 'success' : 'warning';
}

function getSyncStatusText(mikrotik_synced = 0) {
    return mikrotik_synced ? ' synced' : ' pending';
}

function getSyncStatusIcon(mikrotik_synced = 0) {
    return mikrotik_synced ? '✓' : '⏳';
}

// Utility functions
function formatCurrency(amount) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR'
    }).format(amount);
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('id-ID');
}

function formatDateTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('id-ID');
}

function showLoading() {
    const tbody = document.getElementById('pppoeTableBody');
    tbody.innerHTML = `
        <tr>
            <td colspan="9" class="px-6 py-8 text-center">
                <div class="flex flex-col items-center space-y-3">
                    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                    <span class="text-slate-400">Memuat data PPPoE...</span>
                </div>
            </td>
        </tr>
    `;
}

function hideLoading() {
    // Hide loading indicator
}

function showSyncing() {
    const syncBtn = document.getElementById('syncBtn');
    if (syncBtn) {
        syncBtn.disabled = true;
        syncBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Syncing...';
    }
}

function hideSyncing() {
    const syncBtn = document.getElementById('syncBtn');
    if (syncBtn) {
        syncBtn.disabled = false;
        syncBtn.innerHTML = '<i class="bi bi-arrow-repeat"></i> Sync Now';
    }
}

function showSuccess(message) {
    showToast(message, 'success');
}

function showError(message) {
    showToast(message, 'danger');
}

function showToast(message, type = 'info') {
    // Create and show toast notification
    const toastContainer = document.getElementById('toastContainer') || createToastContainer();
    const toastId = 'toast-' + Date.now();

    const toastHTML = `
        <div id="${toastId}" class="toast align-items-center text-white bg-${type} border-0 mb-3" role="alert" style="min-width: 250px;">
            <div class="d-flex">
                <div class="toast-body">
                    ${message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" onclick="document.getElementById('${toastId}').remove()"></button>
            </div>
        </div>
    `;

    toastContainer.insertAdjacentHTML('beforeend', toastHTML);

    // Auto-remove after 3 seconds
    setTimeout(() => {
        const toastElement = document.getElementById(toastId);
        if (toastElement) {
            toastElement.remove();
        }
    }, 3000);
}

function createToastContainer() {
    const container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
    container.style.zIndex = '1055';
    document.body.appendChild(container);
    return container;
}

// Copy to clipboard function
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('Username disalin ke clipboard', 'success');
    }).catch(err => {
        console.error('Gagal menyalin:', err);
        showToast('Gagal menyalin username', 'danger');
    });
}

// Update single checkbox (standard Bootstrap behavior)
function updateSingleCheckbox(checkbox) {
    // Update select all checkboxes state
    const allCheckboxes = document.querySelectorAll('#pppoeTableBody input[type="checkbox"]');
    const checkedCount = document.querySelectorAll('#pppoeTableBody input[type="checkbox"]:checked').length;
    const selectAll = document.getElementById('selectAll');
    const selectAllHeader = document.getElementById('selectAllHeader');

    const allChecked = checkedCount === allCheckboxes.length && allCheckboxes.length > 0;

    if (selectAll && selectAllHeader) {
        selectAll.checked = allChecked;
        selectAllHeader.checked = allChecked;
    }
}

// Toggle checkboxes function (standard Bootstrap behavior)
function toggleAllCheckboxes(checked) {
    const checkboxes = document.querySelectorAll('#pppoeTableBody input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.checked = checked;
    });
}
// Helper function untuk calculate duration
function calculateDuration(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
}

// Update action buttons (mirip voucher)
function updateActionButtons() {
    // Implement logic untuk update buttons based on status
}

// Refresh PPPoE function
function refreshPPPoE() {
    loadPPPoEUsers();
    loadPPPoEStatistics();

    // Show refresh animation
    const refreshBtn = document.querySelector('[onclick="refreshPPPoE()"]');
    if (refreshBtn) {
        refreshBtn.classList.add('animate-spin');
        setTimeout(() => {
            refreshBtn.classList.remove('animate-spin');
        }, 1000);
    }
}

// Toggle Advanced Filters
function toggleAdvancedFilters() {
    const filtersPanel = document.getElementById('advancedFilters');
    const toggleBtn = document.querySelector('[onclick="toggleAdvancedFilters()"]');

    if (filtersPanel.classList.contains('hidden')) {
        filtersPanel.classList.remove('hidden');
        filtersPanel.classList.add('animate-slide-up');
        if (toggleBtn) {
            toggleBtn.innerHTML = '<i class="fas fa-filter mr-1"></i>Sembunyikan Filter';
        }
    } else {
        filtersPanel.classList.add('hidden');
        if (toggleBtn) {
            toggleBtn.innerHTML = '<i class="fas fa-filter mr-1"></i>Filter Lanjutan';
        }
    }
}

// Close Modal Functions
function closePPPoEModal() {
    const modal = document.getElementById('pppoeDetailsModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

function closeExtendModal() {
    const modal = document.getElementById('extendModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

function closeDeleteModal() {
    const modal = document.getElementById('deleteConfirmModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// Enhanced copy functionality with visual feedback
function copyToClipboard(text, button) {
    navigator.clipboard.writeText(text).then(() => {
        // Show success feedback
        if (button) {
            const originalIcon = button.innerHTML;
            button.innerHTML = '<i class="bi bi-check-fill text-green-400 text-xs"></i>';
            button.classList.add('copy-success');

            setTimeout(() => {
                button.innerHTML = originalIcon;
                button.classList.remove('copy-success');
            }, 2000);
        }
        showToast('Username berhasil disalin', 'success');
    }).catch(err => {
        console.error('Gagal menyalin:', err);
        showToast('Gagal menyalin username', 'danger');
    });
}

// Update event listener for copy buttons
document.addEventListener('click', function(e) {
    if (e.target.closest('.copy-username-btn')) {
        e.preventDefault();
        const button = e.target.closest('.copy-username-btn');
        const username = button.dataset.username;
        copyToClipboard(username, button);
    }
});

// Animate counters for statistics
function animateCounters() {
    const counters = document.querySelectorAll('.counter');

    counters.forEach(counter => {
        const target = parseInt(counter.dataset.target) || parseInt(counter.textContent) || 0;
        const duration = 1000; // 1 second
        const increment = target / (duration / 16); // 60fps
        let current = 0;

        const updateCounter = () => {
            current += increment;
            if (current < target) {
                counter.textContent = Math.floor(current).toLocaleString('id-ID');
                requestAnimationFrame(updateCounter);
            } else {
                counter.textContent = target.toLocaleString('id-ID');
            }
        };

        updateCounter();
    });
}

// Add smooth page transitions
document.addEventListener('DOMContentLoaded', function() {
    // Animate statistics cards on load
    setTimeout(() => {
        animateCounters();
    }, 500);

    // Add smooth scroll behavior
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Add keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        // Ctrl/Cmd + R to refresh
        if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
            e.preventDefault();
            refreshPPPoE();
        }

        // Ctrl/Cmd + F to focus search
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            const searchInput = document.getElementById('searchInput');
            if (searchInput) {
                searchInput.focus();
            }
        }

        // Escape to close modals
        if (e.key === 'Escape') {
            closePPPoEModal();
            closeExtendModal();
            closeDeleteModal();
        }
    });
});
