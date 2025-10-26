// Customer Create Form JavaScript
document.addEventListener('DOMContentLoaded', function() {
    initializeForm();
    setupRealtimeValidation();
    setupPreviewUpdate();
});

let currentCustomerId = null;

// Initialize form
function initializeForm() {
    const form = document.getElementById('customerForm');

    // Form submission
    form.addEventListener('submit', async function(e) {
        e.preventDefault();

        if (!validateForm()) {
            return;
        }

        await saveCustomer();
    });

    // Phone number formatting - disabled for testing
    // const phoneInput = document.getElementById('nomor_hp');
    // phoneInput.addEventListener('input', function(e) {
    //     let value = e.target.value.replace(/\D/g, '');
    //     if (value.length > 0) {
    //         // Format as 812-3456-7890
    //         if (value.length <= 3) {
    //             value = value;
    //         } else if (value.length <= 7) {
    //             value = value.slice(0, 3) + '-' + value.slice(3);
    //         } else {
    //             value = value.slice(0, 3) + '-' + value.slice(3, 7) + '-' + value.slice(7, 11);
    //         }
    //     }
    //     e.target.value = value;
    // });
}

// Setup real-time validation
function setupRealtimeValidation() {
    const inputs = document.querySelectorAll('#customerForm input[required], #customerForm input[type="email"]');

    inputs.forEach(input => {
        input.addEventListener('blur', function() {
            validateField(this);
        });

        input.addEventListener('input', function() {
            if (this.classList.contains('border-red-500')) {
                validateField(this);
            }
        });
    });
}

// Setup preview update
function setupPreviewUpdate() {
    const namaInput = document.getElementById('nama');
    const phoneInput = document.getElementById('nomor_hp');
    const creditInput = document.getElementById('credit_balance');
    const debtInput = document.getElementById('debt_balance');

    namaInput.addEventListener('input', updatePreview);
    phoneInput.addEventListener('input', updatePreview);
    creditInput.addEventListener('input', updatePreview);
    debtInput.addEventListener('input', updatePreview);
}

// Update preview
function updatePreview() {
    const nama = document.getElementById('nama').value;
    const phone = document.getElementById('nomor_hp').value;
    const credit = parseFloat(document.getElementById('credit_balance').value) || 0;
    const debt = parseFloat(document.getElementById('debt_balance').value) || 0;

    // Update avatar
    const avatar = document.getElementById('previewAvatar');
    avatar.textContent = nama ? nama.charAt(0).toUpperCase() : '?';

    // Update name
    document.getElementById('previewName').textContent = nama || 'Nama Pelanggan';

    // Update contact
    const contact = phone ? `+62 ${phone}` : 'Kontak informasi';
    document.getElementById('previewContact').textContent = contact;

    // Update financial info
    document.getElementById('previewCredit').textContent = formatCurrency(credit);
    document.getElementById('previewDebt').textContent = formatCurrency(debt);
}

// Validate field
function validateField(field) {
    const value = field.value.trim();

    // Remove previous validation classes
    field.classList.remove('border-green-500', 'border-red-500', 'bg-green-900', 'bg-red-900');
    field.classList.add('border-gray-600', 'bg-gray-700');

    if (field.hasAttribute('required') && !value) {
        field.classList.remove('border-gray-600', 'bg-gray-700');
        field.classList.add('border-red-500', 'bg-red-900');
        updateFieldFeedback(field, 'Field ini wajib diisi');
        return false;
    }

    let fieldValid = true;

    if (field.type === 'email' && value && !isValidEmail(value)) {
        // Email validation relaxed - allow any format or leave empty
        field.classList.remove('border-gray-600', 'bg-gray-700');
        field.classList.add('border-yellow-500', 'bg-yellow-900');
        updateFieldFeedback(field, 'Format email mungkin tidak valid, namun akan diteruskan');
        // Don't fail validation - just warn user
        fieldValid = true;
    } else if (field.name === 'nomor_hp' && value && !isValidPhone(value)) {
        // Phone validation relaxed - allow any format for flexibility
        field.classList.remove('border-gray-600', 'bg-gray-700');
        field.classList.add('border-yellow-500', 'bg-yellow-900');
        updateFieldFeedback(field, 'Format nomor HP tidak standar, namun akan diteruskan');
        // Don't fail validation - just warn user
        fieldValid = true;
    } else {
        // Field is valid
        field.classList.remove('border-gray-600', 'bg-gray-700');
        field.classList.add('border-green-500', 'bg-green-900');
        clearFieldFeedback(field);
    }

    return fieldValid;
}

// Update field feedback message
function updateFieldFeedback(field, message) {
    let feedback = field.parentNode.querySelector('.invalid-feedback');
    if (!feedback) {
        feedback = document.createElement('div');
        feedback.className = 'invalid-feedback';
        field.parentNode.appendChild(feedback);
    }
    feedback.textContent = message;
}

// Clear field feedback
function clearFieldFeedback(field) {
    const feedback = field.parentNode.querySelector('.invalid-feedback');
    if (feedback) {
        feedback.textContent = '';
    }
}

// Validate entire form
function validateForm() {
    const form = document.getElementById('customerForm');
    const inputs = form.querySelectorAll('input[required], input[type="email"]');
    let isValid = true;

    inputs.forEach(input => {
        if (!validateField(input)) {
            isValid = false;
        }
    });

    updateValidationStatus(isValid);
    return isValid;
}

// Update validation status
function updateValidationStatus(isValid) {
    const statusDiv = document.getElementById('validationStatus');

    if (isValid) {
        statusDiv.innerHTML = `
            <div class="flex items-center text-green-400">
                <i class="fas fa-check-circle mr-2"></i>
                <span class="text-sm">Form valid, siap disimpan</span>
            </div>
        `;
    } else {
        statusDiv.innerHTML = `
            <div class="flex items-center text-yellow-400">
                <i class="fas fa-exclamation-triangle mr-2"></i>
                <span class="text-sm">Silakan perbaiki kesalahan pada form</span>
            </div>
        `;
    }
}

// Save customer
async function saveCustomer() {
    try {
        showLoading();

        const formData = new FormData(document.getElementById('customerForm'));
        const data = Object.fromEntries(formData.entries());

        // Map field names to match backend expectations
        const mappedData = {
            name: data.nama,
            phone: '+62' + data.nomor_hp.replace(/\D/g, ''),
            email: data.email || '',
            is_active: data.status_aktif === '1' || data.status_aktif === 1,
            balance: parseFloat(data.credit_balance) || 0,
            debt: parseFloat(data.debt_balance) || 0,
            address: data.alamat || ''
        };

        const response = await fetch('/customers/api/customers', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(mappedData)
        });

        const result = await response.json();

        if (response.ok) {
            currentCustomerId = result.customer.id;
            showSuccessModal(result.customer);

            // Send welcome message if checked
            if (document.getElementById('send_welcome').checked) {
                await sendWelcomeMessage(result.customer);
            }
        } else {
            throw new Error(result.message || 'Gagal menyimpan pelanggan');
        }

    } catch (error) {
        console.error('Error saving customer:', error);
        showError(error.message || 'Gagal menyimpan pelanggan');
    } finally {
        hideLoading();
    }
}

// Show success modal
function showSuccessModal(customer) {
    const modal = document.getElementById('successModal');
    document.getElementById('successMessage').textContent =
        `${customer.name} (#${customer.id}) telah berhasil ditambahkan ke sistem.`;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

// Close success modal
function closeSuccessModal() {
    const modal = document.getElementById('successModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

// Save and add service
async function saveAndAddService() {
    if (!validateForm()) {
        return;
    }

    await saveCustomer();

    // Redirect will happen after success modal
    document.getElementById('addServiceBtn').onclick = () => {
        window.location.href = `/customers/${currentCustomerId}/services/create`;
    };
}

// Redirect to service creation
function redirectToService() {
    if (currentCustomerId) {
        window.location.href = `/customers/${currentCustomerId}/services/create`;
    }
}

// Send welcome message
async function sendWelcomeMessage(customer) {
    try {
        const response = await fetch('/api/whatsapp/send-welcome', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                customer_id: customer.id,
                phone: customer.nomor_hp
            })
        });

        if (response.ok) {
            showSuccess('Pesan selamat datang terkirim');
        }
    } catch (error) {
        console.error('Error sending welcome message:', error);
    }
}

// Check duplicate customer
async function checkDuplicate() {
    const phone = document.getElementById('nomor_hp').value.replace(/\D/g, '');
    const email = document.getElementById('email').value;

    if (!phone && !email) {
        showWarning('Masukkan nomor HP atau email untuk mengecek duplikat');
        return;
    }

    try {
        const params = new URLSearchParams();
        if (phone) params.append('phone', '+62' + phone);
        if (email) params.append('email', email);

        const response = await fetch(`/api/customers/check-duplicate?${params}`);
        const data = await response.json();

        if (data.duplicate) {
            showWarning(`Pelanggan dengan ${data.field} ini sudah ada: ${data.customer.name} (#${data.customer.id})`);
        } else {
            showSuccess('Tidak ada duplikat ditemukan');
        }
    } catch (error) {
        console.error('Error checking duplicate:', error);
        showError('Gagal mengecek duplikat');
    }
}

// Generate test data
function generateTestData() {
    const testNames = [
        'Ahmad Wijaya', 'Siti Nurhaliza', 'Budi Santoso', 'Dewi Lestari',
        'Eko Prasetyo', 'Fitri Handayani', 'Gunawan Setiawan', 'Hana Pertiwi'
    ];

    const randomName = testNames[Math.floor(Math.random() * testNames.length)];
    const randomPhone = '8' + Math.floor(Math.random() * 900000000 + 100000000);

    document.getElementById('nama').value = randomName;
    document.getElementById('nomor_hp').value = randomPhone;

    // Format phone
    const phoneInput = document.getElementById('nomor_hp');
    let value = phoneInput.value;
    if (value.length >= 9) {
        // Take only first 9-12 digits
        value = value.slice(0, 12);
    }
    phoneInput.value = value;

    // Generate random email
    const emailDomains = ['gmail.com', 'yahoo.com', 'outlook.com'];
    const randomDomain = emailDomains[Math.floor(Math.random() * emailDomains.length)];
    document.getElementById('email').value = randomName.toLowerCase().replace(' ', '.') + '@' + randomDomain;

    updatePreview();
    showSuccess('Data test berhasil di-generate');
}

// Clear form
function clearForm() {
    document.getElementById('customerForm').reset();
    document.querySelectorAll('.border-green-500, .border-red-500, .bg-green-900, .bg-red-900').forEach(el => {
        el.classList.remove('border-green-500', 'border-red-500', 'bg-green-900', 'bg-red-900');
        el.classList.add('border-gray-600', 'bg-gray-700');
    });
    updatePreview();
    updateValidationStatus(false);
}

// Utility functions
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone) {
    return /^8\d{9,11}$/.test(phone);
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR'
    }).format(amount);
}

function showLoading() {
    const submitBtn = document.querySelector('#customerForm button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Menyimpan...';
}

function hideLoading() {
    const submitBtn = document.querySelector('#customerForm button[type="submit"]');
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fas fa-check mr-2"></i> Simpan Pelanggan';
}

function showSuccess(message) {
    if (window.toastSystem) {
        window.toastSystem.success(message);
    } else {
        alert(message);
    }
}

function showWarning(message) {
    if (window.toastSystem) {
        window.toastSystem.warning(message);
    } else {
        alert(message);
    }
}

function showError(message) {
    if (window.toastSystem) {
        window.toastSystem.error(message);
    } else {
        alert(message);
    }
}

// Add event delegation for inline onclick handlers
document.addEventListener('click', function(e) {
    // Save and add service button
    if (e.target.matches('#saveAndAddServiceBtn') || e.target.closest('#saveAndAddServiceBtn')) {
        e.preventDefault();
        saveAndAddService();
    }

    // Check duplicate button
    if (e.target.matches('#checkDuplicateBtn') || e.target.closest('#checkDuplicateBtn')) {
        e.preventDefault();
        checkDuplicate();
    }

    // Generate test data button
    if (e.target.matches('#generateTestDataBtn') || e.target.closest('#generateTestDataBtn')) {
        e.preventDefault();
        generateTestData();
    }

    // Clear form button
    if (e.target.matches('#clearFormBtn') || e.target.closest('#clearFormBtn')) {
        e.preventDefault();
        clearForm();
    }

    // Add service button in modal
    if (e.target.matches('#addServiceBtn') || e.target.closest('#addServiceBtn')) {
        e.preventDefault();
        redirectToService();
    }
});