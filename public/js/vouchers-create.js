// Vouchers Create JavaScript
document.addEventListener('DOMContentLoaded', function() {
    initializeForm();
    loadRecentActivity();
});


// Initialize form
function initializeForm() {
    const form = document.getElementById('voucherForm');

    // Form submission
    form.addEventListener('submit', async function(e) {
        e.preventDefault();

        if (!validateForm()) {
            return;
        }

        if (document.getElementById('show_preview').checked) {
            showPreviewModal();
        } else {
            await generateVouchers();
        }
    });

    // Profile change event
    document.getElementById('profile_id').addEventListener('change', function() {
        updateProfileInfo();
        updateCostCalculation();
        updatePreview();
    });

    // Quantity change event
    document.getElementById('quantity').addEventListener('input', function() {
        updateCostCalculation();
        updatePreview();
    });

    // Price override events
    ['price_sell', 'price_cost'].forEach(id => {
        document.getElementById(id).addEventListener('input', updateCostCalculation);
    });

    // Duration override events
    ['duration_days', 'duration_hours', 'duration_minutes'].forEach(id => {
        document.getElementById(id).addEventListener('input', updatePreview);
    });

    // Prefix change event
    document.getElementById('prefix').addEventListener('input', updatePreview);
}

// Update profile information
function updateProfileInfo() {
    const profileSelect = document.getElementById('profile_id');
    const selectedOption = profileSelect.options[profileSelect.selectedIndex];

    if (!selectedOption.value) {
        document.getElementById('profileInfo').innerHTML = `
            <div class="text-center text-muted py-4">
                <i class="bi bi-info-circle fs-1"></i>
                <p class="mt-2 mb-0">Pilih profile untuk melihat informasi</p>
            </div>
        `;
        return;
    }

    const profile = {
        name: selectedOption.text.split(' - ')[0],
        price_sell: parseFloat(selectedOption.dataset.priceSell) || 0,
        price_cost: parseFloat(selectedOption.dataset.priceCost) || 0,
        duration_days: parseInt(selectedOption.dataset.durationDays) || 7,
        bandwidth: selectedOption.dataset.bandwidth || 'N/A'
    };

    document.getElementById('profileInfo').innerHTML = `
        <table class="table table-sm">
            <tr>
                <td width="120">Nama Profile</td>
                <td><strong>${profile.name}</strong></td>
            </tr>
            <tr>
                <td>Harga Jual</td>
                <td><span class="text-success">${formatCurrency(profile.price_sell)}</span></td>
            </tr>
            <tr>
                <td>Harga Modal</td>
                <td><span class="text-danger">${formatCurrency(profile.price_cost)}</span></td>
            </tr>
            <tr>
                <td>Durasi</td>
                <td><strong>${profile.duration_days} hari</strong></td>
            </tr>
            <tr>
                <td>Bandwidth</td>
                <td>${profile.bandwidth}</td>
            </tr>
        </table>
    `;
}

// Update cost calculation
function updateCostCalculation() {
    const profileSelect = document.getElementById('profile_id');
    const quantity = parseInt(document.getElementById('quantity').value) || 0;

    if (!profileSelect.value || quantity === 0) {
        document.getElementById('costCalculation').innerHTML = `
            <div class="text-center text-muted py-4">
                <i class="bi bi-calculator fs-1"></i>
                <p class="mt-2 mb-0">Pilih profile dan jumlah voucher</p>
            </div>
        `;
        return;
    }

    const selectedOption = profileSelect.options[profileSelect.selectedIndex];
    const profilePriceSell = parseFloat(selectedOption.dataset.priceSell) || 0;
    const profilePriceCost = parseFloat(selectedOption.dataset.priceCost) || 0;

    // Use override prices if provided
    const priceSell = parseFloat(document.getElementById('price_sell').value) || profilePriceSell;
    const priceCost = parseFloat(document.getElementById('price_cost').value) || profilePriceCost;

    const totalRevenue = priceSell * quantity;
    const totalCost = priceCost * quantity;
    const totalProfit = totalRevenue - totalCost;
    const profitMargin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : 0;

    document.getElementById('costCalculation').innerHTML = `
        <table class="table table-sm">
            <tr>
                <td width="120">Harga Jual</td>
                <td><span class="text-success">${formatCurrency(priceSell)}</span></td>
            </tr>
            <tr>
                <td>Harga Modal</td>
                <td><span class="text-danger">${formatCurrency(priceCost)}</span></td>
            </tr>
            <tr>
                <td>Quantity</td>
                <td><strong>${quantity} voucher</strong></td>
            </tr>
            <tr>
                <td>Total Revenue</td>
                <td><span class="text-success fw-bold">${formatCurrency(totalRevenue)}</span></td>
            </tr>
            <tr>
                <td>Total Cost</td>
                <td><span class="text-danger fw-bold">${formatCurrency(totalCost)}</span></td>
            </tr>
            <tr>
                <td>Total Profit</td>
                <td><span class="text-primary fw-bold">${formatCurrency(totalProfit)}</span></td>
            </tr>
            <tr>
                <td>Profit Margin</td>
                <td>
                    <span class="badge bg-${profitMargin > 20 ? 'success' : profitMargin > 10 ? 'warning' : 'danger'}">
                        ${profitMargin}%
                    </span>
                </td>
            </tr>
        </table>
    `;
}

// Update preview
function updatePreview() {
    const profileSelect = document.getElementById('profile_id');
    const quantity = parseInt(document.getElementById('quantity').value) || 0;
    const prefix = document.getElementById('prefix').value;

    if (!profileSelect.value || quantity === 0) {
        document.getElementById('previewCard').style.display = 'none';
        return;
    }

    // Generate sample voucher codes
    const sampleCodes = [];
    for (let i = 0; i < Math.min(3, quantity); i++) {
        sampleCodes.push(generateSampleVoucherCode(prefix));
    }

    document.getElementById('previewCount').textContent = `${quantity} voucher`;
    document.getElementById('previewContent').innerHTML = sampleCodes.map(code => `
        <div class="col-md-4 mb-3">
            <div class="card border-primary">
                <div class="card-body text-center">
                    <div class="voucher-preview">
                        <div class="mb-2">
                            <i class="bi bi-wifi fs-1 text-primary"></i>
                        </div>
                        <h6 class="card-title">VOUCHER HOTSPOT</h6>
                        <div class="voucher-code-display">
                            <code class="fs-5">${code}</code>
                        </div>
                        <div class="mt-2">
                            <small class="text-muted">
                                ${getDurationDisplay()}
                            </small>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `).join('');

    document.getElementById('previewCard').style.display = 'block';
}

// Generate sample voucher code
function generateSampleVoucherCode(prefix) {
    const length = parseInt(document.getElementById('code_length').value) || 8;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < length; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return prefix ? prefix.toUpperCase() + '-' + code : code;
}

// Get duration display
function getDurationDisplay() {
    const days = parseInt(document.getElementById('duration_days').value) || 0;
    const hours = parseInt(document.getElementById('duration_hours').value) || 0;
    const minutes = parseInt(document.getElementById('duration_minutes').value) || 0;

    if (days > 0 && hours === 0 && minutes === 0) {
        return `${days} hari`;
    } else if (days === 0 && hours > 0 && minutes === 0) {
        return `${hours} jam`;
    } else if (days === 0 && hours === 0 && minutes > 0) {
        return `${minutes} menit`;
    } else {
        return `${days} hari ${hours} jam ${minutes} menit`;
    }
}

// Preview vouchers
function previewVouchers() {
    if (!validateForm()) {
        return;
    }
    showPreviewModal();
}

// Show preview modal
async function showPreviewModal() {
    try {
        const formData = getFormData();
        const response = await fetch('/vouchers/api/vouchers/preview', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        const data = await response.json();

        const modal = new bootstrap.Modal(document.getElementById('previewModal'));
        document.getElementById('previewModalContent').innerHTML = renderPreviewModal(data);
        modal.show();

    } catch (error) {
        console.error('Error loading preview:', error);
        showError('Gagal memuat preview');
    }
}

// Render preview modal
function renderPreviewModal(data) {
    return `
        <div class="row">
            <div class="col-md-6">
                <h6>Informasi Generate</h6>
                <table class="table table-sm">
                    <tr>
                        <td width="150">Profile</td>
                        <td>${data.profile_name}</td>
                    </tr>
                    <tr>
                        <td>Quantity</td>
                        <td>${data.quantity} voucher</td>
                    </tr>
                    <tr>
                        <td>Harga Jual</td>
                        <td>${formatCurrency(data.price_sell)}</td>
                    </tr>
                    <tr>
                        <td>Total Revenue</td>
                        <td class="text-success fw-bold">${formatCurrency(data.total_revenue)}</td>
                    </tr>
                    <tr>
                        <td>Total Cost</td>
                        <td class="text-danger fw-bold">${formatCurrency(data.total_cost)}</td>
                    </tr>
                    <tr>
                        <td>Total Profit</td>
                        <td class="text-primary fw-bold">${formatCurrency(data.total_profit)}</td>
                    </tr>
                </table>
            </div>
            <div class="col-md-6">
                <h6>Sample Voucher Codes</h6>
                <div class="voucher-sample-list">
                    ${data.sample_codes.map(code => `
                        <div class="p-2 mb-2 bg-light rounded text-center">
                            <code>${code}</code>
                        </div>
                    `).join('')}
                    ${data.quantity > 5 ? '<div class="text-center text-muted">... dan ' + (data.quantity - 5) + ' lainnya</div>' : ''}
                </div>
            </div>
        </div>
    `;
}

// Generate vouchers
async function generateVouchers() {
    try {
        showLoading();

        const formData = getFormData();
        const response = await fetch('/vouchers/api/vouchers/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        const result = await response.json();

        if (response.ok) {
            generatedVoucherData = result;
            showSuccessModal(result);

            if (document.getElementById('auto_print').checked) {
                setTimeout(() => {
                    printGeneratedVouchers();
                }, 1000);
            }

            loadRecentActivity();
        } else {
            throw new Error(result.message || 'Gagal generate voucher');
        }

    } catch (error) {
        console.error('Error generating vouchers:', error);
        showError(error.message || 'Gagal generate voucher');
    } finally {
        hideLoading();
    }
}

// Confirm generate from preview modal
function confirmGenerate() {
    bootstrap.Modal.getInstance(document.getElementById('previewModal')).hide();
    generateVouchers();
}

// Show success modal
function showSuccessModal(data) {
    const modal = new bootstrap.Modal(document.getElementById('successModal'));
    document.getElementById('successMessage').textContent =
        `${data.quantity} voucher berhasil di-generate dengan total pendapatan ${formatCurrency(data.total_profit)}.`;

    // Show first few vouchers
    const voucherDisplay = data.vouchers.slice(0, 5).map(v => `
        <div class="col-6 mb-2">
            <code class="bg-light px-2 py-1 rounded d-block">${v.code}</code>
        </div>
    `).join('');

    document.getElementById('generatedVouchers').innerHTML = `
        <div class="row">
            ${voucherDisplay}
            ${data.vouchers.length > 5 ? `
                <div class="col-12 text-center mt-2">
                    <small class="text-muted">... dan ${data.vouchers.length - 5} voucher lainnya</small>
                </div>
            ` : ''}
        </div>
    `;

    modal.show();
}

// Print generated vouchers
function printGeneratedVouchers() {
    if (!generatedVoucherData) return;

    const voucherIds = generatedVoucherData.vouchers.map(v => v.id);
    window.open(`/print/vouchers/${voucherIds.join(',')}`, '_blank');
}

// Validate form
function validateForm() {
    const form = document.getElementById('voucherForm');
    const requiredFields = form.querySelectorAll('[required]');
    let isValid = true;

    requiredFields.forEach(field => {
        if (!field.value.trim()) {
            field.classList.add('is-invalid');
            isValid = false;
        } else {
            field.classList.remove('is-invalid');
            field.classList.add('is-valid');
        }
    });

    return isValid;
}

// Get form data
function getFormData() {
    const profileSelect = document.getElementById('profile_id');
    const selectedOption = profileSelect.options[profileSelect.selectedIndex];

    const profilePriceSell = parseFloat(selectedOption.dataset.priceSell) || 0;
    const profilePriceCost = parseFloat(selectedOption.dataset.priceCost) || 0;
    const profileDurationDays = parseInt(selectedOption.dataset.durationDays) || 7;

    return {
        profile_id: parseInt(profileSelect.value),
        quantity: parseInt(document.getElementById('quantity').value),
        prefix: document.getElementById('prefix').value.trim(),
        code_length: parseInt(document.getElementById('code_length').value),
        price_sell: parseFloat(document.getElementById('price_sell').value) || profilePriceSell,
        price_cost: parseFloat(document.getElementById('price_cost').value) || profilePriceCost,
        duration_days: parseInt(document.getElementById('duration_days').value) || profileDurationDays,
        duration_hours: parseInt(document.getElementById('duration_hours').value) || 0,
        duration_minutes: parseInt(document.getElementById('duration_minutes').value) || 0
    };
}

// Apply template
function applyTemplate(template) {
    const profiles = document.getElementById('profile_id');
    const basicProfiles = Array.from(profiles.options).filter(opt =>
        opt.text.toLowerCase().includes('basic') || opt.text.toLowerCase().includes('1 jam') || opt.text.toLowerCase().includes('2 jam')
    );
    const weeklyProfiles = Array.from(profiles.options).filter(opt =>
        opt.text.toLowerCase().includes('weekly') || opt.text.toLowerCase().includes('7')
    );
    const monthlyProfiles = Array.from(profiles.options).filter(opt =>
        opt.text.toLowerCase().includes('monthly') || opt.text.toLowerCase().includes('30')
    );

    switch(template) {
        case 'basic':
            if (basicProfiles.length > 0) {
                profiles.value = basicProfiles[0].value;
            }
            document.getElementById('quantity').value = 20;
            document.getElementById('prefix').value = 'BASIC';
            break;
        case 'weekly':
            if (weeklyProfiles.length > 0) {
                profiles.value = weeklyProfiles[0].value;
            }
            document.getElementById('quantity').value = 10;
            document.getElementById('prefix').value = 'WEEK';
            break;
        case 'monthly':
            if (monthlyProfiles.length > 0) {
                profiles.value = monthlyProfiles[0].value;
            }
            document.getElementById('quantity').value = 5;
            document.getElementById('prefix').value = 'MONTH';
            break;
        case 'custom':
            document.getElementById('quantity').value = 1;
            break;
    }

    updateProfileInfo();
    updateCostCalculation();
    updatePreview();
}

// Reset form
function resetForm() {
    document.getElementById('voucherForm').reset();
    document.querySelectorAll('.is-valid, .is-invalid').forEach(el => {
        el.classList.remove('is-valid', 'is-invalid');
    });
    document.getElementById('previewCard').style.display = 'none';
    updateProfileInfo();
    updateCostCalculation();
}

// Load recent activity
async function loadRecentActivity() {
    try {
        const response = await fetch('/vouchers/api/vouchers/recent-activity');
        const activities = await response.json();

        if (activities.length === 0) {
            document.getElementById('recentActivity').innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="bi bi-clock-history fs-1"></i>
                    <p class="mt-2 mb-0">Belum ada aktivitas</p>
                </div>
            `;
            return;
        }

        const activityHTML = activities.slice(0, 5).map(activity => `
            <div class="d-flex justify-content-between align-items-center mb-2 pb-2 border-bottom">
                <div>
                    <div class="fw-semibold">${activity.quantity} voucher</div>
                    <small class="text-muted">${activity.profile_name}</small>
                </div>
                <div class="text-end">
                    <small class="text-muted">${formatDateTime(activity.created_at)}</small>
                    <div class="text-success">${formatCurrency(activity.total_profit)}</div>
                </div>
            </div>
        `).join('');

        document.getElementById('recentActivity').innerHTML = activityHTML;

    } catch (error) {
        console.error('Error loading recent activity:', error);
    }
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
    const submitBtn = document.querySelector('#voucherForm button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Generating...';
}

function hideLoading() {
    const submitBtn = document.querySelector('#voucherForm button[type="submit"]');
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="bi bi-plus-circle"></i> Generate Voucher';
}

function showSuccess(message) {
    ToastSystem.success(message);
}

function showError(message) {
    ToastSystem.error(message);
}

// Add event delegation for inline onclick handlers
document.addEventListener('click', function(e) {
    // Reset form button
    if (e.target.matches('#resetFormBtn') || e.target.closest('#resetFormBtn')) {
        e.preventDefault();
        resetForm();
    }

    // Preview vouchers button
    if (e.target.matches('#previewVouchersBtn') || e.target.closest('#previewVouchersBtn')) {
        e.preventDefault();
        previewVouchers();
    }

    // Template buttons
    if (e.target.matches('.template-btn')) {
        e.preventDefault();
        const template = e.target.dataset.template;
        applyTemplate(template);
    }

    // Confirm generate button
    if (e.target.matches('#confirmGenerateBtn') || e.target.closest('#confirmGenerateBtn')) {
        e.preventDefault();
        confirmGenerate();
    }

    // Print vouchers button
    if (e.target.matches('#printVouchersBtn') || e.target.closest('#printVouchersBtn')) {
        e.preventDefault();
        printGeneratedVouchers();
    }
});