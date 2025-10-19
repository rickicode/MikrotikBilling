document.addEventListener('DOMContentLoaded', function() {
    const paymentForm = document.getElementById('paymentForm');
    const customerIdSelect = document.getElementById('customerId');
    const subscriptionSelect = document.getElementById('subscriptionId');
    const amountInput = document.getElementById('amount');
    const paymentMethodSelect = document.getElementById('paymentMethod');
    const bankSelection = document.getElementById('bankSelection');
    const bankCodeSelect = document.getElementById('bankCode');
    const pluginMethodSelection = document.getElementById('pluginMethodSelection');
    const paymentMethodCodeInput = document.getElementById('paymentMethodCode');
    const selectedMethodDisplay = document.getElementById('selectedMethodDisplay');
    const customerEmailInput = document.getElementById('customerEmail');
    const customerPhoneInput = document.getElementById('customerPhone');
    const descriptionInput = document.getElementById('description');
    const resetBtn = document.getElementById('resetBtn');
    const submitBtn = document.getElementById('submitBtn');
    const loadingModal = new bootstrap.Modal(document.getElementById('loadingModal'));
    const paymentResultModal = new bootstrap.Modal(document.getElementById('paymentResultModal'));
    const paymentResultBody = document.getElementById('paymentResultBody');
    const printReceiptBtn = document.getElementById('printReceiptBtn');
    const instructionsCard = document.getElementById('instructionsCard');
    const instructionsContent = document.getElementById('instructionsContent');

    // Quick action buttons
    const quickCashBtn = document.getElementById('quickCashBtn');
    const quickTransferBtn = document.getElementById('quickTransferBtn');
    const quickDuitKuBtn = document.getElementById('quickDuitKuBtn');

    // Summary elements
    const summaryMethod = document.getElementById('summaryMethod');
    const summaryAmount = document.getElementById('summaryAmount');
    const summaryFee = document.getElementById('summaryFee');
    const summaryTotal = document.getElementById('summaryTotal');

    // Payment methods data
    const paymentMethods = <%= JSON.stringify(paymentMethods) %>;

    // Customer change handler
    customerIdSelect.addEventListener('change', function() {
        const selectedOption = this.options[this.selectedIndex];
        const customerName = selectedOption.getAttribute('data-name');
        const customerPhone = selectedOption.getAttribute('data-phone');
        const customerEmail = selectedOption.getAttribute('data-email');

        // Auto-fill customer contact info
        if (customerPhone) customerPhoneInput.value = customerPhone;
        if (customerEmail) customerEmailInput.value = customerEmail;

        // Filter subscriptions based on selected customer
        filterSubscriptions(this.value);

        // Auto-generate description if empty
        if (!descriptionInput.value && customerName) {
            descriptionInput.value = `Pembayaran dari ${customerName}`;
        }
    });

    // Subscription change handler
    subscriptionSelect.addEventListener('change', function() {
        const selectedOption = this.options[this.selectedIndex];
        const customerId = selectedOption.getAttribute('data-customer');
        const subscriptionText = selectedOption.text;

        // Auto-select customer if not already selected
        if (!customerIdSelect.value && customerId) {
            customerIdSelect.value = customerId;
            customerIdSelect.dispatchEvent(new Event('change'));
        }

        // Extract price from subscription text
        const priceMatch = subscriptionText.match(/Rp ([\d,.]+)/);
        if (priceMatch && !amountInput.value) {
            const price = parseInt(priceMatch[1].replace(/[,.]/g, ''));
            amountInput.value = price;
            updateSummary();
        }
    });

    // Payment method change handler
    paymentMethodSelect.addEventListener('change', function() {
        const selectedOption = this.options[this.selectedIndex];
        const value = this.value;

        // Hide all method-specific sections
        bankSelection.style.display = 'none';
        pluginMethodSelection.style.display = 'none';
        instructionsCard.style.display = 'none';

        if (value === 'transfer') {
            bankSelection.style.display = 'block';
        } else if (value === 'plugin') {
            const method = selectedOption.getAttribute('data-method');
            const plugin = selectedOption.getAttribute('data-plugin');

            paymentMethodCodeInput.value = method;
            selectedMethodDisplay.textContent = `${selectedOption.textContent}`;
            pluginMethodSelection.style.display = 'block';

            // Show bank selection for bank transfer plugin
            if (method === 'bank_transfer') {
                bankSelection.style.display = 'block';
            }
        }

        updateSummary();
    });

    // Amount input handler
    amountInput.addEventListener('input', updateSummary);

    // Update summary function
    function updateSummary() {
        const amount = parseFloat(amountInput.value) || 0;
        const method = paymentMethodSelect.value;
        const selectedOption = paymentMethodSelect.options[paymentMethodSelect.selectedIndex];
        const methodName = selectedOption ? selectedOption.textContent : '-';

        // Calculate fee (based on payment method)
        let fee = 0;
        if (method === 'plugin') {
            const pluginMethod = selectedOption.getAttribute('data-method');
            if (pluginMethod === 'duitku') {
                fee = Math.min(Math.max(amount * 0.025, 2500), 15000); // 2.5% fee
            } else if (pluginMethod === 'bank_transfer') {
                fee = 2500; // Fixed fee
            }
        }

        const total = amount + fee;

        summaryMethod.textContent = methodName;
        summaryAmount.textContent = formatCurrency(amount);
        summaryFee.textContent = formatCurrency(fee);
        summaryTotal.textContent = formatCurrency(total);
    }

    // Filter subscriptions function
    function filterSubscriptions(customerId) {
        const options = subscriptionSelect.querySelectorAll('option');
        options.forEach(option => {
            if (option.value === '') return;
            const optionCustomerId = option.getAttribute('data-customer');
            option.style.display = (!customerId || customerId === optionCustomerId) ? 'block' : 'none';
        });
    }

    // Form submission
    paymentForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        if (!validateForm()) {
            return;
        }

        const formData = new FormData(paymentForm);
        const paymentData = Object.fromEntries(formData);

        // Add method-specific data
        if (paymentData.method === 'plugin') {
            const selectedOption = paymentMethodSelect.options[paymentMethodSelect.selectedIndex];
            paymentData.payment_method_code = selectedOption.getAttribute('data-method');
        }

        try {
            // Show loading modal
            loadingModal.show();

            const response = await fetch('/payments/api/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(paymentData)
            });

            const result = await response.json();

            loadingModal.hide();

            if (result.success) {
                showPaymentResult(result.data);
                paymentForm.reset();
                updateSummary();
                instructionsCard.style.display = 'none';
            } else {
                showAlert('danger', result.message || 'Terjadi kesalahan saat membuat pembayaran');
            }
        } catch (error) {
            loadingModal.hide();
            console.error('Payment creation error:', error);
            showAlert('danger', 'Terjadi kesalahan koneksi. Silakan coba lagi.');
        }
    });

    // Form validation
    function validateForm() {
        let isValid = true;
        const errors = [];

        // Reset previous error states
        paymentForm.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));

        // Validate amount
        if (!amountInput.value || parseFloat(amountInput.value) <= 0) {
            amountInput.classList.add('is-invalid');
            errors.push('Jumlah pembayaran harus diisi dan lebih dari 0');
            isValid = false;
        }

        // Validate payment method
        if (!paymentMethodSelect.value) {
            paymentMethodSelect.classList.add('is-invalid');
            errors.push('Metode pembayaran harus dipilih');
            isValid = false;
        }

        // Validate bank selection for transfer
        if (paymentMethodSelect.value === 'transfer' && !bankCodeSelect.value) {
            bankCodeSelect.classList.add('is-invalid');
            errors.push('Bank tujuan harus dipilih');
            isValid = false;
        }

        if (!isValid) {
            showAlert('danger', errors.join('<br>'));
        }

        return isValid;
    }

    // Show payment result
    function showPaymentResult(data) {
        const payment = data.payment;
        const result = data.payment_result;

        let resultHtml = `
            <div class="row">
                <div class="col-md-6">
                    <h6>Informasi Pembayaran</h6>
                    <table class="table table-sm">
                        <tr>
                            <td><strong>ID Pembayaran:</strong></td>
                            <td>${payment.id}</td>
                        </tr>
                        <tr>
                            <td><strong>Referensi:</strong></td>
                            <td>${result.reference}</td>
                        </tr>
                        <tr>
                            <td><strong>Metode:</strong></td>
                            <td>${payment.method}</td>
                        </tr>
                        <tr>
                            <td><strong>Status:</strong></td>
                            <td><span class="badge bg-${result.status === 'SUCCESS' ? 'success' : 'warning'}">${result.status}</span></td>
                        </tr>
                        <tr>
                            <td><strong>Jumlah:</strong></td>
                            <td>${formatCurrency(result.amount)}</td>
                        </tr>
        `;

        if (result.fee > 0) {
            resultHtml += `
                <tr>
                    <td><strong>Biaya Admin:</strong></td>
                    <td>${formatCurrency(result.fee)}</td>
                </tr>
            `;
        }

        resultHtml += `
                        <tr>
                            <td><strong>Total:</strong></td>
                            <td><strong>${formatCurrency(result.total_amount)}</strong></td>
                        </tr>
                    </table>
                </div>
                <div class="col-md-6">
                    <h6>Informasi Pelanggan</h6>
                    <table class="table table-sm">
                        <tr>
                            <td><strong>Nama:</strong></td>
                            <td>${payment.customer_name || 'Guest'}</td>
                        </tr>
                        <tr>
                            <td><strong>Telepon:</strong></td>
                            <td>${payment.customer_phone || '-'}</td>
                        </tr>
        `;

        if (payment.customer_email) {
            resultHtml += `
                <tr>
                    <td><strong>Email:</strong></td>
                    <td>${payment.customer_email}</td>
                </tr>
            `;
        }

        resultHtml += `
                    </table>
                </div>
            </div>
        `;

        // Add payment instructions if available
        if (result.instructions && result.instructions.steps) {
            resultHtml += `
                <div class="mt-3">
                    <h6>Instruksi Pembayaran</h6>
                    <div class="alert alert-info">
                        <ol class="instructions-list mb-0">
                            ${result.instructions.steps.map(step => `<li>${step}</li>`).join('')}
                        </ol>
                    </div>
                </div>
            `;
        }

        // Add bank details for bank transfers
        if (result.bank_details) {
            resultHtml += `
                <div class="mt-3">
                    <h6>Detail Transfer Bank</h6>
                    <div class="alert alert-light">
                        <table class="table table-sm mb-0">
                            <tr>
                                <td><strong>Bank:</strong></td>
                                <td>${result.bank_details.bank_name}</td>
                            </tr>
                            <tr>
                                <td><strong>No. VA/Rekening:</strong></td>
                                <td><code>${result.bank_details.virtual_account || result.bank_details.account_number}</code></td>
                            </tr>
                            <tr>
                                <td><strong>Nama:</strong></td>
                                <td>${result.bank_details.account_name}</td>
                            </tr>
                        </table>
                    </div>
                </div>
            `;
        }

        paymentResultBody.innerHTML = resultHtml;
        paymentResultModal.show();

        // Store payment data for receipt printing
        paymentResultBody.setAttribute('data-payment', JSON.stringify(data));
    }

    // Print receipt functionality
    printReceiptBtn.addEventListener('click', function() {
        const paymentData = paymentResultBody.getAttribute('data-payment');
        if (paymentData) {
            printPaymentReceipt(JSON.parse(paymentData));
        }
    });

    // Print payment receipt function
    function printPaymentReceipt(data) {
        const payment = data.payment;
        const result = data.payment_result;

        const receiptHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Struk Pembayaran</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; }
                    .receipt { max-width: 400px; margin: 0 auto; }
                    .header { text-align: center; margin-bottom: 20px; }
                    .details { margin-bottom: 20px; }
                    .footer { text-align: center; margin-top: 30px; font-size: 12px; }
                    table { width: 100%; }
                    .total { font-weight: bold; font-size: 18px; }
                    @media print { body { margin: 0; } }
                </style>
            </head>
            <body>
                <div class="receipt">
                    <div class="header">
                        <h2>STRUK PEMBAYARAN</h2>
                        <p>HIJINETWORK Mikrotik Billing</p>
                    </div>
                    <div class="details">
                        <table>
                            <tr><td>ID Pembayaran:</td><td>${payment.id}</td></tr>
                            <tr><td>Referensi:</td><td>${result.reference}</td></tr>
                            <tr><td>Tanggal:</td><td>${new Date().toLocaleString('id-ID')}</td></tr>
                            <tr><td>Pelanggan:</td><td>${payment.customer_name || 'Guest'}</td></tr>
                            <tr><td>Metode:</td><td>${payment.method}</td></tr>
                            <tr><td>Status:</td><td>${result.status}</td></tr>
                            <tr><td>Jumlah:</td><td>${formatCurrency(result.amount)}</td></tr>
                            ${result.fee > 0 ? `<tr><td>Biaya Admin:</td><td>${formatCurrency(result.fee)}</td></tr>` : ''}
                            <tr class="total"><td>Total:</td><td>${formatCurrency(result.total_amount)}</td></tr>
                        </table>
                    </div>
                    <div class="footer">
                        <p>Terima kasih atas pembayaran Anda</p>
                        <p>-- Struk Pembayaran --</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        const printWindow = window.open('', '_blank');
        printWindow.document.write(receiptHtml);
        printWindow.document.close();
        printWindow.print();
    }

    // Reset button handler
    resetBtn.addEventListener('click', function() {
        paymentForm.reset();
        updateSummary();
        bankSelection.style.display = 'none';
        pluginMethodSelection.style.display = 'none';
        instructionsCard.style.display = 'none';
        hideAlert();
    });

    // Quick action handlers
    quickCashBtn.addEventListener('click', function() {
        paymentMethodSelect.value = 'cash';
        paymentMethodSelect.dispatchEvent(new Event('change'));
        paymentMethodSelect.focus();
    });

    quickTransferBtn.addEventListener('click', function() {
        paymentMethodSelect.value = 'transfer';
        paymentMethodSelect.dispatchEvent(new Event('change'));
        paymentMethodSelect.focus();
    });

    quickDuitKuBtn.addEventListener('click', function() {
        const duitKuOption = Array.from(paymentMethodSelect.options).find(
            option => option.getAttribute('data-method') === 'duitku'
        );
        if (duitKuOption) {
            paymentMethodSelect.value = 'plugin';
            paymentMethodSelect.dispatchEvent(new Event('change'));
            // Select DuitKu option
            paymentMethodSelect.selectedIndex = paymentMethodSelect.options.indexOf(duitKuOption);
            paymentMethodSelect.dispatchEvent(new Event('change'));
        }
    });

    // Utility functions
    function formatCurrency(amount) {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0
        }).format(amount);
    }

    function showAlert(type, message) {
        // Remove existing alerts
        const existingAlert = document.querySelector('.alert');
        if (existingAlert) {
            existingAlert.remove();
        }

        const alert = document.createElement('div');
        alert.className = `alert alert-${type} alert-dismissible fade show`;
        alert.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;

        paymentForm.insertBefore(alert, paymentForm.firstChild);
    }

    function hideAlert() {
        const alert = document.querySelector('.alert');
        if (alert) {
            alert.remove();
        }
    }

    // Initialize
    updateSummary();
});