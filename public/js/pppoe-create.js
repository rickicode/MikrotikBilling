// PPPoE Create Page JavaScript
// Global variables
let createdPPPoEData = null;

// Initialize page
document.addEventListener('DOMContentLoaded', function() {
    initializeForm();
    loadCustomers();
    setupEventListeners();
});

// Initialize form with default values
function initializeForm() {
    // Set today as default start date
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('startDate').value = today;

    // Update expiry date
    updateExpiryDate();

    // Update summary
    updateSummary();
}

// Load customers for dropdown
async function loadCustomers() {
    try {
        const response = await fetch('/customers/api/customers');
        const data = await response.json();
        const customers = data.customers || [];

        const select = document.getElementById('customerId');
        select.innerHTML = '<option value="">Select Customer</option>' +
            customers.map(customer =>
                `<option value="${customer.id}"
                        data-name="${customer.name}"
                        data-phone="${customer.phone || ''}"
                        data-email="${customer.email || ''}">
                    ${customer.name} (${customer.phone || 'No phone'})
                </option>`
            ).join('');
    } catch (error) {
        console.error('Error loading customers:', error);
        showToast('Error loading customers', 'danger');
    }
}

// Setup event listeners
function setupEventListeners() {
    // Form submission
    const form = document.getElementById('pppoeForm');
    if (form) {
        form.addEventListener('submit', handleFormSubmit);
    }

    // Customer selection change
    const customerId = document.getElementById('customerId');
    if (customerId) {
        customerId.addEventListener('change', updateCustomerSummary);
    }

    // Profile selection change
    const profileId = document.getElementById('profileId');
    if (profileId) {
        profileId.addEventListener('change', updateProfileDetails);
    }

    // Duration change
    const duration = document.getElementById('duration');
    if (duration) {
        duration.addEventListener('input', function() {
            updateExpiryDate();
            updateSummary();
        });
    }

    // Price changes
    const priceSell = document.getElementById('priceSell');
    if (priceSell) {
        priceSell.addEventListener('input', updateSummary);
    }

    const priceCost = document.getElementById('priceCost');
    if (priceCost) {
        priceCost.addEventListener('input', updateSummary);
    }

    // Start date change
    const startDate = document.getElementById('startDate');
    if (startDate) {
        startDate.addEventListener('change', updateExpiryDate);
    }

    // Username validation
    const username = document.getElementById('username');
    if (username) {
        username.addEventListener('input', validateUsername);
    }

    // Button event listeners - add null checks
    const showCustomerModalBtn = document.getElementById('showCustomerModalBtn');
    if (showCustomerModalBtn) {
        showCustomerModalBtn.addEventListener('click', showCustomerModal);
    }

    const generateUsernameBtn = document.getElementById('generateUsernameBtn');
    if (generateUsernameBtn) {
        generateUsernameBtn.addEventListener('click', generateUsername);
    }

    const generatePasswordBtn = document.getElementById('generatePasswordBtn');
    if (generatePasswordBtn) {
        generatePasswordBtn.addEventListener('click', generatePassword);
    }

    const togglePasswordBtn = document.getElementById('togglePasswordBtn');
    if (togglePasswordBtn) {
        togglePasswordBtn.addEventListener('click', togglePasswordVisibility);
    }

    const createCustomerBtn = document.getElementById('createCustomerBtn');
    if (createCustomerBtn) {
        createCustomerBtn.addEventListener('click', createCustomer);
    }

    const createAnotherBtn = document.getElementById('createAnotherBtn');
    if (createAnotherBtn) {
        createAnotherBtn.addEventListener('click', createAnother);
    }
}

// Update profile details when selected
function updateProfileDetails() {
    const profileSelect = document.getElementById('profileId');
    const selectedOption = profileSelect.options[profileSelect.selectedIndex];

    if (!selectedOption.value) {
        document.getElementById('profileDetails').innerHTML = '<p class="text-muted">Select a profile to view details</p>';
        return;
    }

    const priceSell = parseFloat(selectedOption.dataset.priceSell) || 0;
    const priceCost = parseFloat(selectedOption.dataset.priceCost) || 0;
    const duration = parseInt(selectedOption.dataset.duration) || 30;

    // Update form fields
    document.getElementById('priceSell').value = priceSell.toFixed(2);
    document.getElementById('priceCost').value = priceCost.toFixed(2);
    document.getElementById('duration').value = duration;

    // Update profile details
    document.getElementById('profileDetails').innerHTML = `
        <div class="mb-2">
            <strong>Profile:</strong> ${selectedOption.text.split(' - ')[0]}
        </div>
        <div class="mb-2">
            <strong>Duration:</strong> ${duration} days
        </div>
        <div class="mb-2">
            <strong>Sell Price:</strong> ${formatCurrency(priceSell)}
        </div>
        <div class="mb-2">
            <strong>Cost Price:</strong> ${formatCurrency(priceCost)}
        </div>
        <div class="mb-2">
            <strong>Profit:</strong> <span class="text-success">${formatCurrency(priceSell - priceCost)}</span>
        </div>
    `;

    updateExpiryDate();
    updateSummary();
}

// Update customer summary
function updateCustomerSummary() {
    const customerSelect = document.getElementById('customerId');
    const selectedOption = customerSelect.options[customerSelect.selectedIndex];

    if (!selectedOption.value) {
        document.getElementById('customerSummary').innerHTML = '<p class="text-muted">Select a customer to view details</p>';
        return;
    }

    const customerName = selectedOption.dataset.name;
    const customerPhone = selectedOption.dataset.phone;
    const customerEmail = selectedOption.dataset.email;

    document.getElementById('customerSummary').innerHTML = `
        <div class="mb-2">
            <strong>Name:</strong> ${customerName}
        </div>
        ${customerPhone ? `
            <div class="mb-2">
                <strong>Phone:</strong> ${customerPhone}
            </div>
        ` : ''}
        ${customerEmail ? `
            <div class="mb-2">
                <strong>Email:</strong> ${customerEmail}
            </div>
        ` : ''}
    `;
}

// Update expiry date based on start date and duration
function updateExpiryDate() {
    const startDate = document.getElementById('startDate').value;
    const duration = parseInt(document.getElementById('duration').value);

    if (startDate && duration) {
        const startDateObj = new Date(startDate);
        const expiryDate = new Date(startDateObj);
        expiryDate.setDate(expiryDate.getDate() + duration);

        document.getElementById('expiryDate').value = expiryDate.toLocaleDateString('en-US');
    }
}

// Update summary card
function updateSummary() {
    const priceSell = parseFloat(document.getElementById('priceSell').value) || 0;
    const priceCost = parseFloat(document.getElementById('priceCost').value) || 0;
    const duration = parseInt(document.getElementById('duration').value) || 30;

    const profit = priceSell - priceCost;

    document.getElementById('summarySellPrice').textContent = formatCurrency(priceSell);
    document.getElementById('summaryCostPrice').textContent = formatCurrency(priceCost);
    document.getElementById('summaryProfit').textContent = formatCurrency(profit);
    document.getElementById('summaryDuration').textContent = `${duration} days`;
}

// Generate random username
function generateUsername() {
    const prefix = 'pppoe';
    const random = Math.random().toString(36).substring(2, 8);
    const username = `${prefix}-${random}`;
    document.getElementById('username').value = username;
    validateUsername();
}

// Generate random password
function generatePassword() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let password = '';
    for (let i = 0; i < 12; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    document.getElementById('password').value = password;
}

// Toggle password visibility
function togglePasswordVisibility() {
    const passwordInput = document.getElementById('password');
    const toggleIcon = document.getElementById('passwordToggle');

    if (!passwordInput) return;

    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        if (toggleIcon) {
            toggleIcon.className = 'bi bi-eye-slash';
        }
    } else {
        passwordInput.type = 'password';
        if (toggleIcon) {
            toggleIcon.className = 'bi bi-eye';
        }
    }
}

// Validate username
function validateUsername() {
    const username = document.getElementById('username').value;
    const pattern = /^[a-zA-Z0-9_]{3,32}$/;
    const input = document.getElementById('username');

    if (username && !pattern.test(username)) {
        input.setCustomValidity('Username must be 3-32 characters with letters, numbers, and underscore only');
    } else {
        input.setCustomValidity('');
    }
}

// Handle form submission
async function handleFormSubmit(e) {
    e.preventDefault();
    console.log('PPPoE form submission started');

    if (!validateForm()) {
        console.log('Form validation failed');
        return;
    }

    try {
        const formData = getFormData();
        console.log('Form data collected:', formData);
        showLoading();

        // Create form data for URL-encoded submission
        const urlEncodedData = new URLSearchParams();
        urlEncodedData.append('customer_id', formData.customer_id);
        urlEncodedData.append('profile_id', formData.profile_id);
        urlEncodedData.append('username', formData.username);
        urlEncodedData.append('password', formData.password);
        urlEncodedData.append('start_date', formData.start_date);
        urlEncodedData.append('duration_days', formData.duration);
        urlEncodedData.append('custom_price_sell', formData.price_sell);
        urlEncodedData.append('custom_price_cost', formData.price_cost);
        urlEncodedData.append('notes', formData.notes);

        console.log('Sending form data to server:', urlEncodedData.toString());

        const response = await fetch('/pppoe/api/pppoe', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: urlEncodedData
        });

        console.log('Server response received:', response.status, response.statusText);

        if (!response) {
            hideLoading();
            showToast('Authentication error. Please login again.', 'danger');
            return;
        }

        if (response.ok) {
            // Success - the response should contain the created user data
            const result = await response.json();
            console.log('PPPoE user created successfully:', result);
            createdPPPoEData = result;
            showSuccessModal(result);
        } else if (response.redirected) {
            // Form validation error - redirect back to form
            console.log('Form validation error - redirecting');
            window.location.href = response.url;
        } else {
            // Handle error response
            const errorText = await response.text();
            console.log('Server error response:', errorText);
            throw new Error(errorText || 'Failed to create PPPoE user');
        }

    } catch (error) {
        console.error('Error creating PPPoE user:', error);
        showToast(error.message || 'Failed to create PPPoE user', 'danger');
    } finally {
        hideLoading();
    }
}

// Validate form
function validateForm() {
    const form = document.getElementById('pppoeForm');

    console.log('Checking form validity...');

    // Check individual required fields
    const customerId = document.getElementById('customerId').value;
    const profileId = document.getElementById('profileId').value;
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const startDate = document.getElementById('startDate').value;
    const duration = document.getElementById('duration').value;
    const priceSell = document.getElementById('priceSell').value;
    const priceCost = document.getElementById('priceCost').value;

    console.log('Form field values:', {
        customerId,
        profileId,
        username,
        password: password ? `${password.length} chars` : 'empty',
        startDate,
        duration,
        priceSell,
        priceCost
    });

    if (!form.checkValidity()) {
        console.log('HTML5 validation failed');
        // Log validation details for each field
        console.log('Individual field validity:');
        const requiredFields = ['customerId', 'profileId', 'username', 'password', 'startDate', 'duration', 'priceSell', 'priceCost'];
        requiredFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            console.log(`  ${fieldId}: value="${field.value}" valid=${field.checkValidity()} required=${field.required}`);
        });
        form.classList.add('was-validated');
        return false;
    }

    // Additional validation
    if (password.length < 6) {
        showToast('Password must be at least 6 characters', 'warning');
        return false;
    }

    const sellPrice = parseFloat(document.getElementById('priceSell').value);
    const costPrice = parseFloat(document.getElementById('priceCost').value);

    if (sellPrice < costPrice) {
        showToast('Sell price should be greater than cost price', 'warning');
        return false;
    }

    return true;
}

// Get form data
function getFormData() {
    return {
        customer_id: parseInt(document.getElementById('customerId').value),
        profile_id: parseInt(document.getElementById('profileId').value),
        username: document.getElementById('username').value.trim(),
        password: document.getElementById('password').value,
        start_date: document.getElementById('startDate').value,
        duration: parseInt(document.getElementById('duration').value),
        price_sell: parseFloat(document.getElementById('priceSell').value),
        price_cost: parseFloat(document.getElementById('priceCost').value),
        notes: document.getElementById('notes').value.trim()
    };
}

// Show customer modal
function showCustomerModal() {
    const modal = document.getElementById('customerModal');
    if (modal) {
        modal.style.display = 'block';
        modal.classList.add('show');
    }
}

// Create new customer
async function createCustomer() {
    const form = document.getElementById('customerForm');

    if (!form.checkValidity()) {
        form.classList.add('was-validated');
        return;
    }

    try {
        const customerData = {
            nama: document.getElementById('newCustomerName').value.trim(),
            nomor_hp: document.getElementById('newCustomerPhone').value.trim(),
            email: document.getElementById('newCustomerEmail').value.trim()
        };

        const response = await fetch('/customers/api/customers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(customerData)
        });

        const result = await response.json();

        if (response.ok) {
            const customerModal = document.getElementById('customerModal');
            if (customerModal) {
                customerModal.style.display = 'none';
                customerModal.classList.remove('show');
            }
            loadCustomers();

            // Select the new customer
            setTimeout(() => {
                const customerIdSelect = document.getElementById('customerId');
                if (customerIdSelect) {
                    customerIdSelect.value = result.customer.id;
                    updateCustomerSummary();
                }
            }, 100);

            showToast('Customer created successfully', 'success');
        } else {
            throw new Error(result.error || 'Failed to create customer');
        }

    } catch (error) {
        console.error('Error creating customer:', error);
        showToast(error.message || 'Failed to create customer', 'danger');
    }
}

// Show success modal
function showSuccessModal(pppoeData) {
    const createdUsernameEl = document.getElementById('createdUsername');
    const createdPasswordEl = document.getElementById('createdPassword');
    const createdCustomerEl = document.getElementById('createdCustomer');
    const createdExpiryEl = document.getElementById('createdExpiry');

    if (createdUsernameEl) createdUsernameEl.textContent = pppoeData.username;
    if (createdPasswordEl) createdPasswordEl.textContent = pppoeData.password;
    if (createdCustomerEl) createdCustomerEl.textContent = pppoeData.customer_name;
    if (createdExpiryEl) createdExpiryEl.textContent = new Date(pppoeData.expiry_date).toLocaleDateString('en-US');

    const modal = document.getElementById('successModal');
    if (modal) {
        modal.style.display = 'block';
        modal.classList.add('show');
    }
}

// Create another PPPoE user
function createAnother() {
    const successModal = document.getElementById('successModal');
    if (successModal) {
        successModal.style.display = 'none';
        successModal.classList.remove('show');
    }

    const form = document.getElementById('pppoeForm');
    if (form) {
        form.reset();
    }
    initializeForm();

    // Keep customer selection
    const customerIdSelect = document.getElementById('customerId');
    if (customerIdSelect && customerIdSelect.value) {
        updateCustomerSummary();
    }
}

// Loading states
function showLoading() {
    const submitBtn = document.querySelector('#pppoeForm button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Creating...';
}

function hideLoading() {
    const submitBtn = document.querySelector('#pppoeForm button[type="submit"]');
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="bi bi-check-circle"></i> Create PPPoE User';
}

// Utility functions
function formatCurrency(amount) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR'
    }).format(amount);
}

function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toastContainer') || createToastContainer();
    const toastId = 'toast-' + Date.now();

    const toastHTML = `
        <div id="${toastId}" class="toast align-items-center text-white bg-${type} border-0" role="alert" style="display: block;">
            <div class="d-flex">
                <div class="toast-body">
                    ${message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" onclick="document.getElementById('${toastId}').remove()"></button>
            </div>
        </div>
    `;

    toastContainer.insertAdjacentHTML('beforeend', toastHTML);

    // Auto remove after 3 seconds
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