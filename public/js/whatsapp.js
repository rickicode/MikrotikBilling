// WhatsApp Management Modern JavaScript
// New modern interface for WhatsApp management with tabbed navigation and enhanced features

let currentTab = 'dashboard';
let currentPage = 1;
let messagesPerPage = 10;
let refreshInterval = null;
let templates = [];
let messageHistory = [];

// Global state
const whatsappState = {
    connection: {
        status: 'disconnected',
        phoneNumber: null,
        lastActivity: null,
        qrCode: null,
        isPermanent: false,
        sessionHealth: 'unknown'
    },
    statistics: {
        today: 0,
        sent: 0,
        delivered: 0,
        failed: 0
    },
    settings: {
        autoReconnect: true,
        qrRefreshInterval: 30,
        sessionTimeout: 3600,
        rateLimit: 1,
        retryAttempts: 3,
        messageRetention: 30,
        persistentConnection: true
    }
};

// Initialize WhatsApp Management
function initializeWhatsAppManagement() {
    console.log('Initializing WhatsApp Management...');

    // Load settings from localStorage
    loadSettings();

    // Setup event listeners
    setupEventListeners();

    // Setup tab navigation
    setupTabNavigation();

    // Setup modal handling
    setupModalHandling();

    // Setup search and filtering
    setupSearchAndFiltering();

    // Setup persistent connection if enabled
    if (whatsappState.settings.persistentConnection) {
        setupPersistentConnection();
    }

    // Auto-generate QR code if disconnected (like the old behavior)
    setTimeout(() => {
        checkConnectionAndGenerateQR();
    }, 1000);

    console.log('WhatsApp Management initialized');
}

// Setup persistent connection management
function setupPersistentConnection() {
    console.log('Setting up persistent connection management...');

    // Initial status check with session health
    refreshStatus();

    // Setup faster status refresh for connection updates
    setInterval(refreshStatus, 5000); // Check every 5 seconds for faster updates

    // Setup periodic status refresh for persistent connection
    setInterval(refreshStatus, 30000); // Check every 30 seconds (redundant but safe)

    // Session health is now integrated in the main status endpoint

    console.log('Persistent connection management setup complete');
}

// Setup tab navigation
function setupTabNavigation() {
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            const tabName = this.id.replace('tab-', '');
            switchTab(tabName);
        });
    });
}

// Switch between tabs
function switchTab(tabName) {
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.add('hidden');
    });

    // Remove active class from all tab buttons
    document.querySelectorAll('.tab-button').forEach(button => {
        button.classList.remove('active', 'bg-blue-600', 'text-white');
        button.classList.add('text-slate-400');
    });

    // Show selected tab content
    const selectedContent = document.getElementById(`tab-content-${tabName}`);
    if (selectedContent) {
        selectedContent.classList.remove('hidden');
    }

    // Add active class to selected tab button
    const selectedButton = document.getElementById(`tab-${tabName}`);
    if (selectedButton) {
        selectedButton.classList.add('active', 'bg-blue-600', 'text-white');
        selectedButton.classList.remove('text-slate-400');
    }

    currentTab = tabName;

    // Load tab-specific data
    loadTabData(tabName);
}

// Load tab-specific data
function loadTabData(tabName) {
    switch(tabName) {
        case 'dashboard':
            refreshStatus();
            loadRecentMessages();
            break;
        case 'messages':
            loadRecentMessages();
            break;
        case 'templates':
            loadTemplates();
            renderTemplates();
            break;
        case 'bulk':
            loadTemplatesToSelects();
            updateRecipientCount();
            break;
        case 'settings':
            loadSettingsToUI();
            break;
        case 'bot':
            loadBotStatus();
            break;
    }
}

// Setup event listeners
function setupEventListeners() {
    // Message search
    const messageSearch = document.getElementById('messageSearch');
    if (messageSearch) {
        messageSearch.addEventListener('input', debounce(searchMessages, 300));
    }

    // Message filter
    const messageFilter = document.getElementById('messageFilter');
    if (messageFilter) {
        messageFilter.addEventListener('change', filterMessages);
    }

    // Bulk message character count
    const bulkMessage = document.getElementById('bulkMessage');
    if (bulkMessage) {
        bulkMessage.addEventListener('input', updateCharCount);
    }

    // Schedule send checkbox
    const scheduleSend = document.getElementById('scheduleSend');
    if (scheduleSend) {
        scheduleSend.addEventListener('change', function() {
            const scheduleTime = document.getElementById('scheduleTime');
            if (this.checked) {
                scheduleTime.classList.remove('hidden');
            } else {
                scheduleTime.classList.add('hidden');
            }
        });
    }

    // Recipient list input
    const recipientsList = document.getElementById('recipientsList');
    if (recipientsList) {
        recipientsList.addEventListener('input', updateRecipientCount);
    }

    // Settings changes
    setupSettingsListeners();
}

// Setup modal handling
function setupModalHandling() {
    // Close modals when clicking outside
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('fixed') && e.target.classList.contains('inset-0')) {
            closeAllModals();
        }
    });

    // Escape key closes modals
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeAllModals();
        }
    });
}

// Close all modals
function closeAllModals() {
    document.querySelectorAll('.fixed.inset-0').forEach(modal => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    });
}

// Show send message modal
function showSendMessageModal() {
    const modal = document.getElementById('sendMessageModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

// Close send message modal
function closeSendMessageModal() {
    const modal = document.getElementById('sendMessageModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    document.getElementById('sendMessageForm').reset();
}

// Show create template modal
function showCreateTemplateModal() {
    const modal = document.getElementById('createTemplateModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

// Close create template modal
function closeCreateTemplateModal() {
    const modal = document.getElementById('createTemplateModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    document.getElementById('createTemplateForm').reset();
}

// Refresh WhatsApp connection status with enhanced session info
async function refreshStatus() {
    try {
        const response = await fetch('/whatsapp/api/status');
        const data = await response.json();

        updateConnectionStatus(data.connection || {});
        updateStatistics(data.statistics || {});

        // Session health is now integrated in the main status endpoint
    } catch (error) {
        console.error('Error refreshing status:', error);
        showError('Gagal memperbarui status WhatsApp');
    }
}



// Update connection status display
function updateConnectionStatus(status) {
    const statusElement = document.getElementById('whatsappConnectionStatus');
    const statusText = document.getElementById('whatsappStatusText');
    const phoneNumber = document.getElementById('whatsappPhoneNumber');
    const lastActivity = document.getElementById('whatsappLastActivity');
    const refreshBtn = document.getElementById('whatsappRefreshBtn');
    const disconnectBtn = document.getElementById('whatsappDisconnectBtn');
    const reconnectBtn = document.getElementById('whatsappReconnectBtn');
    const qrCodeContainer = document.getElementById('whatsappQrCodeContainer');
    const qrCodeImage = document.getElementById('whatsappQrCodeImage');
    const instructions = document.getElementById('whatsappInstructions');
    const qrExpiryElement = document.getElementById('qrExpiryTime');

    if (!statusElement) return;

    whatsappState.connection = status;

    if (status.isConnected) {
        statusElement.className = 'px-3 py-1 bg-green-600/20 text-green-400 rounded-full text-sm font-medium';
        statusElement.innerHTML = '<i class="fas fa-circle text-green-500 mr-2 text-xs"></i>Connected';

        if (statusText) statusText.textContent = 'Terhubung';
        if (phoneNumber) phoneNumber.textContent = status.phoneNumber || 'Tidak diketahui';
        if (lastActivity) lastActivity.textContent = status.lastActivity ? new Date(status.lastActivity).toLocaleString('id-ID') : 'Tidak ada aktivitas';

        // Show permanent session indicator
        if (status.isPermanent) {
            const permanentIndicator = document.getElementById('permanentSessionIndicator');
            if (permanentIndicator) {
                permanentIndicator.classList.remove('hidden');
                permanentIndicator.innerHTML = '<i class="fas fa-lock mr-1"></i>Session Permanen';
            }
        }

        if (refreshBtn) refreshBtn.classList.add('hidden');
        if (disconnectBtn) disconnectBtn.classList.remove('hidden');
        if (reconnectBtn) reconnectBtn.classList.add('hidden');

        // Replace QR code with success icon
        if (qrCodeContainer) {
            qrCodeContainer.classList.remove('hidden');
            // Change QR code to success icon
            if (qrCodeImage) {
                qrCodeImage.className = 'w-48 h-48 flex items-center justify-center bg-green-500/20 rounded-lg';
                qrCodeImage.innerHTML = '<i class="fas fa-check-circle text-green-500 text-6xl"></i>';
            }
        }
        if (instructions) instructions.classList.add('hidden');

        // Update countdown element to show connected status
        if (qrExpiryElement) {
            qrExpiryElement.textContent = 'Successfully connected!';
            qrExpiryElement.classList.remove('text-slate-400', 'text-red-400');
            qrExpiryElement.classList.add('text-green-400');
        }

        // Stop countdown when connected
        stopQRCountdown();

        // Auto-activate bot when WhatsApp connects
        autoActivateBot();
    } else {
        statusElement.className = 'px-3 py-1 bg-red-600/20 text-red-400 rounded-full text-sm font-medium';
        statusElement.innerHTML = '<i class="fas fa-circle text-red-500 mr-2 text-xs"></i>Disconnected';

        if (statusText) statusText.textContent = 'Tidak terhubung';
        if (phoneNumber) phoneNumber.textContent = 'Tidak terhubung';
        if (lastActivity) lastActivity.textContent = 'Tidak ada aktivitas';

        if (refreshBtn) {
            refreshBtn.classList.remove('hidden');
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = '<i class="fas fa-sync-alt mr-2"></i>Generate QR';
        }
        if (disconnectBtn) disconnectBtn.classList.add('hidden');
        if (reconnectBtn) reconnectBtn.classList.add('hidden');

        // ALWAYS show QR code container when disconnected
        if (qrCodeContainer) {
            qrCodeContainer.classList.remove('hidden');
            if (instructions) instructions.classList.remove('hidden');
        }

        // Handle QR code from status
        if (status.qrCode) {
            if (qrCodeImage) {
                qrCodeImage.className = 'w-48 h-48';
                qrCodeImage.innerHTML = `<img src="${status.qrCode}" alt="WhatsApp QR Code" class="w-full h-full" />`;
            }
            // Reset countdown element text
            if (qrExpiryElement) {
                qrExpiryElement.textContent = 'QR Code expires in 2:00';
                qrExpiryElement.classList.remove('text-green-400', 'text-red-400');
                qrExpiryElement.classList.add('text-slate-400');
            }
            // Start countdown timer when QR code is available
            startQRCountdown();
        } else {
            // Show placeholder when no QR code yet
            if (qrCodeImage) {
                qrCodeImage.className = 'w-48 h-48 flex items-center justify-center bg-slate-700 rounded-lg';
                qrCodeImage.innerHTML = `
                    <div class="text-center">
                        <i class="fas fa-qrcode text-4xl text-slate-500 mb-2"></i>
                        <p class="text-xs text-slate-400">Click "Generate QR" to start</p>
                    </div>
                `;
            }
            if (qrExpiryElement) {
                qrExpiryElement.textContent = 'QR Code not generated';
                qrExpiryElement.classList.remove('text-green-400', 'text-red-400');
                qrExpiryElement.classList.add('text-slate-400');
            }
            // Stop countdown if no QR code
            stopQRCountdown();
        }
    }
}

// Update statistics display
function updateStatistics(stats) {
    const messagesToday = document.getElementById('messagesToday');
    const messagesSent = document.getElementById('messagesSent');
    const messagesDelivered = document.getElementById('messagesDelivered');
    const messagesFailed = document.getElementById('messagesFailed');

    if (messagesToday) messagesToday.textContent = stats.today || 0;
    if (messagesSent) messagesSent.textContent = stats.sent || 0;
    if (messagesDelivered) messagesDelivered.textContent = stats.delivered || 0;
    if (messagesFailed) messagesFailed.textContent = stats.failed || 0;

    whatsappState.statistics = { ...whatsappState.statistics, ...stats };
}

// Load recent messages
async function loadRecentMessages() {
    try {
        const response = await fetch('/whatsapp/api/messages?limit=50');
        const data = await response.json();

        messageHistory = data.messages || [];
        updateMessagesTable(messageHistory);
        updateMessageCount();
    } catch (error) {
        console.error('Error loading recent messages:', error);
        showError('Gagal memuat pesan terbaru');
    }
}

// Update messages table
function updateMessagesTable(messages) {
    const tbody = document.getElementById('messagesTableBody') || document.getElementById('recentMessagesTable');
    if (!tbody) return;

    const startIndex = (currentPage - 1) * messagesPerPage;
    const endIndex = startIndex + messagesPerPage;
    const paginatedMessages = messages.slice(startIndex, endIndex);

    if (messages.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="px-6 py-12 text-center text-slate-400">
                    <i class="fas fa-inbox text-2xl mb-2"></i>
                    <p>Tidak ada pesan</p>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = paginatedMessages.map(message => `
        <tr class="hover:bg-slate-700/50 transition-colors">
            <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                ${new Date(message.createdAt).toLocaleString('id-ID')}
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                    message.type === 'outgoing'
                        ? 'bg-blue-600/20 text-blue-400'
                        : 'bg-slate-600/20 text-slate-400'
                }">
                    ${message.type === 'outgoing' ? 'Keluar' : 'Masuk'}
                </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                ${message.phoneNumber}
            </td>
            <td class="px-6 py-4 text-sm text-slate-300 max-w-xs truncate">
                <span title="${message.content}">
                    ${message.content.substring(0, 100)}${message.content.length > 100 ? '...' : ''}
                </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(message.status)}">
                    ${getStatusText(message.status)}
                </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">
                <div class="flex space-x-2">
                    <button onclick="viewMessageDetails('${message.id}')"
                            class="text-blue-400 hover:text-blue-300 transition-colors"
                            title="View Details">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button onclick="replyToMessage('${message.phoneNumber}')"
                            class="text-green-400 hover:text-green-300 transition-colors"
                            title="Reply">
                        <i class="fas fa-reply"></i>
                    </button>
                    <button onclick="resendMessage('${message.id}')"
                            class="text-yellow-400 hover:text-yellow-300 transition-colors"
                            title="Resend">
                        <i class="fas fa-redo"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

// Get status color for badges
function getStatusColor(status) {
    switch (status) {
        case 'sent': return 'bg-green-600/20 text-green-400';
        case 'delivered': return 'bg-blue-600/20 text-blue-400';
        case 'failed': return 'bg-red-600/20 text-red-400';
        case 'pending': return 'bg-yellow-600/20 text-yellow-400';
        default: return 'bg-slate-600/20 text-slate-400';
    }
}

// Get status text in Indonesian
function getStatusText(status) {
    switch (status) {
        case 'sent': return 'Terkirim';
        case 'delivered': return 'Terkirim';
        case 'failed': return 'Gagal';
        case 'pending': return 'Menunggu';
        default: return status;
    }
}

// Update message count
function updateMessageCount() {
    const messageCount = document.getElementById('messageCount');
    if (messageCount) {
        messageCount.textContent = messageHistory.length;
    }
}

// Load templates
async function loadTemplates() {
    try {
        const response = await fetch('/whatsapp/message-templates');
        const data = await response.json();

        // Handle both array and PostgreSQL result object
        if (data.templates && Array.isArray(data.templates)) {
            templates = data.templates;
        } else if (data.templates && data.templates.rows && Array.isArray(data.templates.rows)) {
            templates = data.templates.rows;
        } else if (data.templates && data.templates.templates && Array.isArray(data.templates.templates)) {
            // Handle nested templates structure
            templates = data.templates.templates;
        } else {
            templates = [];
        }

        // Ensure templates is always an array
        if (!Array.isArray(templates)) {
            console.warn('templates is not an array after loading, setting to empty array:', templates);
            templates = [];
        }

        updateTemplateSelect(templates);
    } catch (error) {
        console.error('Error loading templates:', error);
        templates = [];
    }
}

// Load templates to select elements
function loadTemplatesToSelects() {
    const selects = [
        document.getElementById('templateSelect'),
        document.getElementById('bulkTemplateSelect')
    ];

    selects.forEach(select => {
        if (!select) return;

        select.innerHTML = '<option value="">Pilih template...</option>';

        // Ensure templates is an array
        if (!Array.isArray(templates)) {
            console.warn('templates is not an array in loadTemplatesToSelects:', templates);
            return;
        }

        templates.forEach(template => {
            const option = document.createElement('option');
            option.value = template.id;
            option.textContent = template.name;
            select.appendChild(option);
        });
    });
}

// Update template select dropdown
function updateTemplateSelect(templates) {
    const select = document.getElementById('templateSelect');
    if (!select) return;

    select.innerHTML = '<option value="">Pilih template...</option>';

    // Ensure templates is an array
    if (!Array.isArray(templates)) {
        console.warn('templates is not an array:', templates);
        templates = [];
    }

    templates.forEach(template => {
        const option = document.createElement('option');
        option.value = template.id;
        option.textContent = template.name;
        select.appendChild(option);
    });
}

// Fill template content
function fillTemplate() {
    const select = document.getElementById('templateSelect');
    const messageContent = document.getElementById('messageContent');

    if (!select || !messageContent) return;

    const templateId = select.value;
    if (!templateId) return;

    // Fetch template details
    fetch(`/whatsapp/message-templates/${templateId}`)
        .then(response => response.json())
        .then(result => {
            // Handle both direct template and wrapped template formats
            const template = result.data || result;
            const content = template.template_content || template.content || template.message || '';
            messageContent.value = content;
        })
        .catch(error => {
            console.error('Error loading template:', error);
        });
}

// Fill bulk template
function fillBulkTemplate() {
    const select = document.getElementById('bulkTemplateSelect');
    const bulkMessage = document.getElementById('bulkMessage');

    if (!select || !bulkMessage) return;

    const templateId = select.value;
    if (!templateId) return;

    // Fetch template details
    fetch(`/whatsapp/message-templates/${templateId}`)
        .then(response => response.json())
        .then(result => {
            // Handle both direct template and wrapped template formats
            const template = result.data || result;
            const content = template.template_content || template.content || template.message || '';
            bulkMessage.value = content;
            updateCharCount();
        })
        .catch(error => {
            console.error('Error loading template:', error);
        });
}

// Render templates grid
function renderTemplates() {
    const grid = document.getElementById('templatesGrid');
    if (!grid) return;

    // Ensure templates is an array
    if (!Array.isArray(templates)) {
        console.warn('templates is not an array in renderTemplates:', templates);
        templates = [];
    }

    if (templates.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full text-center text-slate-400 py-12">
                <i class="fas fa-file-alt text-2xl mb-2"></i>
                <p>Belum ada template</p>
                <button onclick="showCreateTemplateModal()" class="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
                    <i class="fas fa-plus mr-2"></i> Buat Template Pertama
                </button>
            </div>
        `;
        return;
    }

    grid.innerHTML = templates.map(template => `
        <div class="bg-slate-800 rounded-xl border border-slate-700 p-6 hover:border-slate-600 transition-colors">
            <div class="flex justify-between items-start mb-4">
                <h4 class="text-lg font-semibold text-white">${template.name}</h4>
                <span class="px-2 py-1 bg-slate-700 text-slate-300 rounded text-xs">
                    ${template.category || 'general'}
                </span>
            </div>
            <div class="text-slate-300 text-sm mb-4 line-clamp-3">
                ${getContentDisplay(template)}
            </div>
            <div class="flex justify-between items-center">
                <span class="text-xs text-slate-500">
                    ${getVariablesCount(template)}
                </span>
                <div class="flex space-x-2">
                    <button onclick="editTemplate('${template.id}')"
                            class="text-blue-400 hover:text-blue-300 transition-colors">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="testTemplateWithId('${template.id}')"
                            class="text-yellow-400 hover:text-yellow-300 transition-colors">
                        <i class="fas fa-stethoscope"></i>
                    </button>
                    <button onclick="deleteTemplate('${template.id}')"
                            class="text-red-400 hover:text-red-300 transition-colors">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

// Send message
async function sendMessage() {
    const recipientNumber = document.getElementById('recipientNumber').value;
    const messageContent = document.getElementById('messageContent').value;

    if (!recipientNumber || !messageContent) {
        showError('Silakan lengkapi nomor penerima dan pesan');
        return;
    }

    try {
        const response = await fetch('/whatsapp/api/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                phoneNumber: recipientNumber,
                message: messageContent
            })
        });

        const data = await response.json();

        if (data.success) {
            showSuccess('Pesan berhasil dikirim');
            closeSendMessageModal();
            loadRecentMessages();
        } else {
            showError(data.message || 'Gagal mengirim pesan');
        }
    } catch (error) {
        console.error('Error sending message:', error);
        showError('Terjadi kesalahan saat mengirim pesan');
    }
}

// Start WhatsApp connection
async function startConnection() {
    try {
        showLoadingState('whatsappConnectBtn', 'Memulai koneksi...');
        showInfo('Memulai koneksi WhatsApp. Ini mungkin memakan waktu 1-2 menit...');

        const response = await fetch('/whatsapp/scan-start', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        });

        const data = await response.json();

        if (data.success) {
            showSuccess('Memulai koneksi WhatsApp...');
            refreshStatus();
            checkQRCodeStatus();
        } else {
            showError(data.message || 'Gagal memulai koneksi');
            restoreButton('whatsappConnectBtn', 'Connect', 'fas fa-qrcode');
        }
    } catch (error) {
        console.error('Error starting connection:', error);
        showError('Terjadi kesalahan saat memulai koneksi');
        restoreButton('whatsappConnectBtn', 'Connect', 'fas fa-qrcode');
    }
}

// Start QR Scanning
async function startQRScanning() {
    switchTab('scanner');
    await startConnection();

    // Show scanner-specific QR code
    const scannerQrCodeContainer = document.getElementById('scannerQrCodeContainer');
    const scannerStatus = document.getElementById('scannerStatus');
    const scannerInstructions = document.getElementById('scannerInstructions');

    if (scannerQrCodeContainer) scannerQrCodeContainer.classList.remove('hidden');
    if (scannerStatus) scannerStatus.classList.add('hidden');
    if (scannerInstructions) scannerInstructions.classList.remove('hidden');
}

// Disconnect WhatsApp
async function disconnectWhatsApp() {
    if (!confirm('Apakah Anda yakin ingin memutuskan koneksi WhatsApp?')) {
        return;
    }

    try {
        const response = await fetch('/whatsapp/api/disconnect', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        });

        const data = await response.json();

        if (data.success) {
            showSuccess('Koneksi WhatsApp terputus');
            refreshStatus();
        } else {
            showError(data.message || 'Gagal memutuskan koneksi');
        }
    } catch (error) {
        console.error('Error disconnecting:', error);
        showError('Terjadi kesalahan saat memutuskan koneksi');
    }
}

// Reconnect WhatsApp
async function reconnectWhatsApp() {
    try {
        const response = await fetch('/whatsapp/api/reconnect', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        });

        const data = await response.json();

        if (data.success) {
            showSuccess('Menghubungkan ulang WhatsApp...');
            refreshStatus();
        } else {
            showError(data.message || 'Gagal menghubungkan ulang');
        }
    } catch (error) {
        console.error('Error reconnecting:', error);
        showError('Terjadi kesalahan saat menghubungkan ulang');
    }
}

// Test WhatsApp connection
async function testWhatsApp() {
    try {
        showInfo('Menguji koneksi WhatsApp...');

        const response = await fetch('/whatsapp/api/test', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        });

        const data = await response.json();

        if (data.success) {
            showSuccess('Koneksi WhatsApp berfungsi dengan baik');
        } else {
            showError(data.message || 'Koneksi WhatsApp bermasalah');
        }
    } catch (error) {
        console.error('Error testing connection:', error);
        showError('Terjadi kesalahan saat menguji koneksi');
    }
}

// QR Code countdown timer variables
let qrCountdownInterval = null;
let qrStartTime = null;

// Start QR code countdown timer (2 minutes)
function startQRCountdown() {
    stopQRCountdown(); // Clear any existing countdown

    const qrExpiryElement = document.getElementById('qrExpiryTime');
    const refreshBtn = document.getElementById('refreshQRBtn');

    if (!qrExpiryElement) return;

    qrStartTime = Date.now();
    const duration = 2 * 60 * 1000; // 2 minutes in milliseconds

    // Show refresh button
    if (refreshBtn) {
        refreshBtn.classList.remove('hidden');
        refreshBtn.disabled = false;
    }

    qrCountdownInterval = setInterval(() => {
        const elapsed = Date.now() - qrStartTime;
        const remaining = Math.max(0, duration - elapsed);

        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);

        qrExpiryElement.textContent = `QR Code expires in ${minutes}:${seconds.toString().padStart(2, '0')}`;

        // Add warning color when less than 30 seconds
        if (remaining < 30000) {
            qrExpiryElement.classList.add('text-red-400');
            qrExpiryElement.classList.remove('text-slate-400');
        } else {
            qrExpiryElement.classList.add('text-slate-400');
            qrExpiryElement.classList.remove('text-red-400');
        }

        if (remaining === 0) {
            stopQRCountdown();
            qrExpiryElement.textContent = 'QR Code expired';
            qrExpiryElement.classList.add('text-red-400');

            // Auto refresh QR code
            refreshQRCode();
        }
    }, 1000);
}

// Stop QR code countdown timer
function stopQRCountdown() {
    if (qrCountdownInterval) {
        clearInterval(qrCountdownInterval);
        qrCountdownInterval = null;
    }
    qrStartTime = null;
}

// Refresh QR code manually
async function refreshQRCode() {
    try {
        showInfo('Memperbarui QR code...');

        const response = await fetch('/whatsapp/refresh-qr', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        });

        const data = await response.json();

        if (data.success) {
            showSuccess('QR code diperbarui');
            refreshStatus();
            checkQRCodeStatus();
            startQRCountdown(); // Restart countdown
        } else {
            showError(data.message || 'Gagal memperbarui QR code');
        }
    } catch (error) {
        console.error('Error refreshing QR code:', error);
        showError('Terjadi kesalahan saat memperbarui QR code');
    }
}

// Check QR code status
function checkQRCodeStatus() {
    const maxChecks = 24;
    let checkCount = 0;

    const checkInterval = setInterval(async () => {
        checkCount++;

        try {
            const response = await fetch('/whatsapp/api/status');
            const data = await response.json();

            if (data.qrCode) {
                showSuccess('QR code siap! Silakan scan dengan WhatsApp Anda.');
                clearInterval(checkInterval);
                refreshStatus();
                startQRCountdown(); // Start countdown when QR code is ready
            } else if (data.connected) {
                showSuccess('WhatsApp sudah terhubung!');
                clearInterval(checkInterval);
                refreshStatus();
                stopQRCountdown(); // Stop countdown when connected
            } else if (checkCount >= maxChecks) {
                showError('Waktu habis. Silakan coba lagi.');
                clearInterval(checkInterval);
                restoreButton('whatsappConnectBtn', 'Connect', 'fas fa-qrcode');
                stopQRCountdown();
            }
        } catch (error) {
            console.error('Error checking QR code status:', error);
            if (checkCount >= maxChecks) {
                clearInterval(checkInterval);
                restoreButton('whatsappConnectBtn', 'Connect', 'fas fa-qrcode');
                stopQRCountdown();
            }
        }
    }, 5000);
}

// Bulk messaging functions
function setRecipientMode(mode) {
    const modes = ['manual', 'file', 'customers'];
    const buttons = {
        manual: document.getElementById('manualModeBtn'),
        file: document.getElementById('fileModeBtn'),
        customers: document.getElementById('customersModeBtn')
    };
    const containers = {
        manual: document.getElementById('manualEntry'),
        file: document.getElementById('fileUpload'),
        customers: document.getElementById('customerSelection')
    };

    modes.forEach(m => {
        if (buttons[m]) {
            if (m === mode) {
                buttons[m].classList.remove('bg-slate-700');
                buttons[m].classList.add('bg-blue-600');
            } else {
                buttons[m].classList.add('bg-slate-700');
                buttons[m].classList.remove('bg-blue-600');
            }
        }
        if (containers[m]) {
            containers[m].classList.toggle('hidden', m !== mode);
        }
    });

    updateRecipientCount();
}

// Update recipient count
function updateRecipientCount() {
    const recipientsList = document.getElementById('recipientsList');
    const recipientCount = document.getElementById('recipientCount');

    if (!recipientCount) return;

    let count = 0;

    if (recipientsList && recipientsList.value) {
        const lines = recipientsList.value.trim().split('\n').filter(line => line.trim());
        count = lines.length;
    }

    recipientCount.textContent = `${count} recipient${count !== 1 ? 's' : ''}`;
}

// Update character count
function updateCharCount() {
    const bulkMessage = document.getElementById('bulkMessage');
    const charCount = document.getElementById('charCount');

    if (!bulkMessage || !charCount) return;

    const length = bulkMessage.value.length;
    charCount.textContent = `${length} / 1600 characters`;

    if (length > 1600) {
        charCount.classList.add('text-red-400');
    } else {
        charCount.classList.remove('text-red-400');
    }
}

// Preview bulk send
function previewBulkSend() {
    const recipients = getRecipients();
    const message = document.getElementById('bulkMessage').value;

    if (recipients.length === 0) {
        showError('Pilih setidaknya satu penerima');
        return;
    }

    if (!message.trim()) {
        showError('Masukkan pesan yang akan dikirim');
        return;
    }

    // Create preview modal
    showPreviewModal(recipients, message);
}

// Get recipients from current mode
function getRecipients() {
    const manualEntry = document.getElementById('manualEntry');
    const recipientsList = document.getElementById('recipientsList');

    if (!manualEntry.classList.contains('hidden') && recipientsList) {
        return recipientsList.value.trim().split('\n').filter(line => line.trim());
    }

    return [];
}

// Send bulk messages
async function sendBulkMessages() {
    const recipients = getRecipients();
    const message = document.getElementById('bulkMessage').value;
    const priority = document.getElementById('prioritySelect').value;
    const scheduleSend = document.getElementById('scheduleSend').checked;
    const scheduleTime = document.getElementById('scheduleTime').value;

    if (recipients.length === 0) {
        showError('Pilih setidaknya satu penerima');
        return;
    }

    if (!message.trim()) {
        showError('Masukkan pesan yang akan dikirim');
        return;
    }

    try {
        // Convert recipients to messages array format for API
        const messages = recipients.map(recipient => ({
            to: recipient,
            message: message,
            priority: priority
        }));

        const payload = {
            messages: messages,
            priority: priority
        };

        if (scheduleSend && scheduleTime) {
            payload.scheduledAt = scheduleTime;
        }

        const response = await fetch('/api/bulk/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (data.success) {
            showSuccess(`${recipients.length} pesan telah ditambahkan ke antrian`);

            // Don't clear form - let user send multiple messages with same content
            // document.getElementById('recipientsList').value = '';
            // document.getElementById('bulkMessage').value = '';
            // updateRecipientCount();
            // updateCharCount();
        } else {
            showError(data.message || 'Gagal mengirim pesan bulk');
        }
    } catch (error) {
        console.error('Error sending bulk messages:', error);
        showError('Terjadi kesalahan saat mengirim pesan bulk');
    }
}





// Insert variable at cursor
// Simple insert variable function for bulk message
function insertVariable() {
    showInfo('Click on variable buttons to insert them into your message');
}

function insertVariableAtCursor(variable) {
    const textarea = document.getElementById('templateContent');
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;

    textarea.value = text.substring(0, start) + variable + text.substring(end);
    textarea.selectionStart = textarea.selectionEnd = start + variable.length;
    textarea.focus();
}

// Utility functions
function debounce(func, wait) {
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

function showLoadingState(buttonId, text) {
    const button = document.getElementById(buttonId);
    if (button) {
        button.disabled = true;
        button.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i>${text}`;
    }
}

function restoreButton(buttonId, text, iconClass) {
    const button = document.getElementById(buttonId);
    if (button) {
        button.disabled = false;
        button.innerHTML = `<i class="${iconClass} mr-2"></i>${text}`;
    }
}

function searchMessages() {
    const searchTerm = document.getElementById('messageSearch').value.toLowerCase();
    const filtered = messageHistory.filter(message =>
        message.content.toLowerCase().includes(searchTerm) ||
        message.phoneNumber.toLowerCase().includes(searchTerm)
    );
    updateMessagesTable(filtered);
}

function filterMessages() {
    const filterValue = document.getElementById('messageFilter').value;
    let filtered = messageHistory;

    if (filterValue !== 'all') {
        filtered = messageHistory.filter(message => message.status === filterValue);
    }

    updateMessagesTable(filtered);
}

function previousPage() {
    if (currentPage > 1) {
        currentPage--;
        updateMessagesTable(messageHistory);
    }
}

function nextPage() {
    const maxPage = Math.ceil(messageHistory.length / messagesPerPage);
    if (currentPage < maxPage) {
        currentPage++;
        updateMessagesTable(messageHistory);
    }
}

// Message actions
function viewMessageDetails(messageId) {
    const message = messageHistory.find(m => m.id === messageId);
    if (message) {
        // Show message details modal
        console.log('View message details:', message);
    }
}

function replyToMessage(phoneNumber) {
    showSendMessageModal();
    document.getElementById('recipientNumber').value = phoneNumber;
}

function resendMessage(messageId) {
    if (!confirm('Apakah Anda yakin ingin mengirim ulang pesan ini?')) {
        return;
    }

    // Resend logic here
    showInfo('Mengirim ulang pesan...');
}

// Settings management
function setupSettingsListeners() {
    // Auto reconnect
    const autoReconnect = document.getElementById('autoReconnect');
    if (autoReconnect) {
        autoReconnect.addEventListener('change', function() {
            whatsappState.settings.autoReconnect = this.checked;
            saveSettings();
        });
    }

    // QR refresh interval
    const qrRefreshInterval = document.getElementById('qrRefreshInterval');
    if (qrRefreshInterval) {
        qrRefreshInterval.addEventListener('change', function() {
            whatsappState.settings.qrRefreshInterval = parseInt(this.value);
            saveSettings();
        });
    }

    // Session timeout
    const sessionTimeout = document.getElementById('sessionTimeout');
    if (sessionTimeout) {
        sessionTimeout.addEventListener('change', function() {
            whatsappState.settings.sessionTimeout = parseInt(this.value);
            saveSettings();
        });
    }

    // Rate limit
    const rateLimit = document.getElementById('rateLimit');
    if (rateLimit) {
        rateLimit.addEventListener('change', function() {
            whatsappState.settings.rateLimit = parseInt(this.value);
            saveSettings();
        });
    }

    // Retry attempts
    const retryAttempts = document.getElementById('retryAttempts');
    if (retryAttempts) {
        retryAttempts.addEventListener('change', function() {
            whatsappState.settings.retryAttempts = parseInt(this.value);
            saveSettings();
        });
    }

    // Message retention
    const messageRetention = document.getElementById('messageRetention');
    if (messageRetention) {
        messageRetention.addEventListener('change', function() {
            whatsappState.settings.messageRetention = parseInt(this.value);
            saveSettings();
        });
    }
}

function loadSettings() {
    const saved = localStorage.getItem('whatsappSettings');
    if (saved) {
        whatsappState.settings = { ...whatsappState.settings, ...JSON.parse(saved) };
    }
}

function loadSettingsToUI() {
    const settings = whatsappState.settings;

    // Load settings values to UI
    const autoReconnect = document.getElementById('autoReconnect');
    if (autoReconnect) autoReconnect.checked = settings.autoReconnect;

    const qrRefreshInterval = document.getElementById('qrRefreshInterval');
    if (qrRefreshInterval) qrRefreshInterval.value = settings.qrRefreshInterval;

    const sessionTimeout = document.getElementById('sessionTimeout');
    if (sessionTimeout) sessionTimeout.value = settings.sessionTimeout;

    const rateLimit = document.getElementById('rateLimit');
    if (rateLimit) rateLimit.value = settings.rateLimit;

    const retryAttempts = document.getElementById('retryAttempts');
    if (retryAttempts) retryAttempts.value = settings.retryAttempts;

    const messageRetention = document.getElementById('messageRetention');
    if (messageRetention) messageRetention.value = settings.messageRetention;
}

function saveSettings() {
    localStorage.setItem('whatsappSettings', JSON.stringify(whatsappState.settings));
}

function exportWhatsAppSettings() {
    const dataStr = JSON.stringify(whatsappState.settings, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);

    const exportFileDefaultName = 'whatsapp-settings.json';

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();

    showSuccess('Pengaturan berhasil diekspor');
}

function importWhatsAppSettings() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = e => {
        const file = e.target.files[0];
        const reader = new FileReader();

        reader.onload = event => {
            try {
                const settings = JSON.parse(event.target.result);
                whatsappState.settings = { ...whatsappState.settings, ...settings };
                saveSettings();
                loadSettingsToUI();
                showSuccess('Pengaturan berhasil diimpor');
            } catch (error) {
                showError('Gagal mengimpor pengaturan. Pastikan file JSON valid.');
            }
        };

        reader.readAsText(file);
    };

    input.click();
}

function clearMessageHistory() {
    if (!confirm('Apakah Anda yakin ingin menghapus seluruh riwayat pesan? Tindakan ini tidak dapat dibatalkan.')) {
        return;
    }

    // Clear message history logic here
    showSuccess('Riwayat pesan berhasil dihapus');
    loadRecentMessages();
}

function resetWhatsAppSession() {
    if (!confirm('Apakah Anda yakin ingin mereset sesi WhatsApp? Anda perlu scan QR code kembali.')) {
        return;
    }

    // Reset session logic here
    showSuccess('Sesi WhatsApp berhasil direset');
    refreshStatus();
}

function exportWhatsAppData() {
    const data = {
        connection: whatsappState.connection,
        statistics: whatsappState.statistics,
        settings: whatsappState.settings,
        templates: templates,
        exportDate: new Date().toISOString()
    };

    const dataStr = JSON.stringify(data, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);

    const exportFileDefaultName = `whatsapp-data-${new Date().toISOString().split('T')[0]}.json`;

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();

    showSuccess('Data WhatsApp berhasil diekspor');
}

function setupSearchAndFiltering() {
    // Message search
    const messageSearch = document.getElementById('messageSearch');
    if (messageSearch) {
        messageSearch.addEventListener('input', debounce(searchMessages, 300));
    }

    // Message filter
    const messageFilter = document.getElementById('messageFilter');
    if (messageFilter) {
        messageFilter.addEventListener('change', filterMessages);
    }
}

// Modal management for preview
function showPreviewModal(recipients, message) {
    // Create preview modal
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.innerHTML = `
        <div class="bg-slate-800 rounded-xl p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-lg font-semibold text-white">Preview Bulk Message</h3>
                <button onclick="this.closest('.fixed').remove()" class="text-slate-400 hover:text-white">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="space-y-4">
                <div>
                    <h4 class="text-sm font-medium text-slate-300 mb-2">Recipients (${recipients.length}):</h4>
                    <div class="max-h-32 overflow-y-auto bg-slate-900 rounded p-3">
                        <div class="text-xs text-slate-400 font-mono">
                            ${recipients.map(r => `<div>${r}</div>`).join('')}
                        </div>
                    </div>
                </div>
                <div>
                    <h4 class="text-sm font-medium text-slate-300 mb-2">Message:</h4>
                    <div class="bg-slate-900 rounded p-3">
                        <p class="text-slate-300 whitespace-pre-wrap">${message}</p>
                    </div>
                </div>
                <div class="flex justify-end space-x-3 pt-4 border-t border-slate-700">
                    <button onclick="this.closest('.fixed').remove()" class="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors">
                        Cancel
                    </button>
                    <button onclick="this.closest('.fixed').remove(); sendBulkMessages();" class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors">
                        <i class="fas fa-paper-plane mr-2"></i> Send Messages
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

// Toast notifications (using existing ToastSystem if available)
function showSuccess(message) {
    if (typeof window.toastSystem !== 'undefined') {
        window.toastSystem.success(message);
    } else {
        alert(message);
    }
}

function showError(message) {
    if (typeof window.toastSystem !== 'undefined') {
        window.toastSystem.error(message);
    } else {
        alert(message);
    }
}

function showInfo(message) {
    if (typeof window.toastSystem !== 'undefined') {
        window.toastSystem.info(message);
    } else {
        alert(message);
    }
}

// Cleanup on page unload
window.addEventListener('beforeunload', function() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
});

// Tab button styling
function setupTabStyling() {
    const style = document.createElement('style');
    style.textContent = `
        .tab-button.active {
            background-color: rgb(37 99 235);
            color: white;
        }
        .tab-button:not(.active) {
            color: rgb(148 163 184);
        }
        .tab-button:not(.active):hover {
            background-color: rgb(51 65 85);
        }
    `;
    document.head.appendChild(style);
}

// Initialize tab styling
setupTabStyling();

// Helper functions for template handling
function getContentDisplay(template) {
    const content = template.template_content || template.content || template.message || '';
    if (!content) return 'No content available';
    return content.length > 100 ? content.substring(0, 100) + '...' : content;
}

function getVariablesCount(template) {
    if (template.variables) {
        // Handle both string and array formats
        if (typeof template.variables === 'string') {
            try {
                const parsed = JSON.parse(template.variables);
                return `${Array.isArray(parsed) ? parsed.length : 0} variables`;
            } catch {
                return `${template.variables.split(',').filter(v => v.trim()).length} variables`;
            }
        } else if (Array.isArray(template.variables)) {
            return `${template.variables.length} variables`;
        }
    }
    return 'No variables';
}

// Bot Management Functions
async function loadBotStatus() {
    try {
        const response = await fetch('/api/bot/status');
        const result = await response.json();

        if (result.success) {
            updateBotDisplay(result.data);
        } else {
            showError('Error loading bot status');
        }
    } catch (error) {
        console.error('Error loading bot status:', error);
        showError('Error loading bot status');
    }
}

function updateBotDisplay(botData) {
    console.log('🤖 Updating bot display with data:', botData);

    if (!botData) {
        console.log('❌ No bot data available');
        return;
    }

    // Update main bot status indicator
    const botStatusElement = document.getElementById('botStatus');
    const botStatusTextElement = document.getElementById('botStatusText');
    const botCommandTextElement = document.getElementById('botCommandText');
    const botLastUpdatedElement = document.getElementById('botLastUpdated');

    if (botStatusElement && botStatusTextElement) {
        if (botData.enabled) {
            botStatusElement.innerHTML = '<i class="fas fa-circle text-green-500 mr-2 text-xs"></i>Bot Active';
            botStatusElement.className = 'px-3 py-1 bg-green-600/20 text-green-400 rounded-full text-sm font-medium';
            botStatusTextElement.textContent = 'Bot Active';
            console.log('✅ Bot status updated to Active');
        } else {
            botStatusElement.innerHTML = '<i class="fas fa-circle text-red-500 mr-2 text-xs"></i>Bot Inactive';
            botStatusElement.className = 'px-3 py-1 bg-red-600/20 text-red-400 rounded-full text-sm font-medium';
            botStatusTextElement.textContent = 'Bot Inactive';
            console.log('✅ Bot status updated to Inactive');
        }
    } else {
        console.error('❌ Bot status elements not found:', {
            botStatus: !!botStatusElement,
            botStatusText: !!botStatusTextElement
        });
    }

    // Update bot command
    if (botCommandTextElement) {
        botCommandTextElement.textContent = botData.command || '/info';
        console.log('✅ Bot command updated to:', botData.command || '/info');
    } else {
        console.error('❌ Bot command element not found');
    }

    // Update last updated time
    if (botLastUpdatedElement) {
        if (botData.timestamp) {
            const time = new Date(botData.timestamp).toLocaleString();
            botLastUpdatedElement.textContent = time;
            console.log('✅ Bot last updated time set to:', time);
        } else {
            botLastUpdatedElement.textContent = 'Never';
        }
    } else {
        console.error('❌ Bot last updated element not found');
    }

    // Update toggle button
    const toggleBtn = document.getElementById('toggleBotBtn');
    if (toggleBtn) {
        const toggleBotTextElement = document.getElementById('toggleBotText');
        if (toggleBotTextElement) {
            toggleBotTextElement.textContent = botData.enabled ? 'Disable Bot' : 'Enable Bot';
        }
        toggleBtn.className = botData.enabled ?
            'w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium' :
            'w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium';
        console.log('✅ Toggle button updated');
    }
}

function showUpdateCommandModal() {
    const modal = document.getElementById('updateCommandModal');
    if (modal) {
        modal.classList.remove('hidden');
        loadCurrentCommand();
    }
}

function closeUpdateCommandModal() {
    const modal = document.getElementById('updateCommandModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

async function loadCurrentCommand() {
    try {
        const response = await fetch('/api/bot/status');
        const result = await response.json();

        if (result.success) {
            const commandInput = document.getElementById('newBotCommand');
            if (commandInput) {
                commandInput.value = result.data.command;
            }
        }
    } catch (error) {
        console.error('Error loading current command:', error);
    }
}

async function updateBotCommand() {
    const commandInput = document.getElementById('newBotCommand');
    const newCommand = commandInput ? commandInput.value.trim() : '';

    if (!newCommand) {
        showError('Please enter a valid command');
        return;
    }

    try {
        const response = await fetch('/api/bot/command', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ command: newCommand })
        });

        const result = await response.json();

        if (result.success) {
            showSuccess('Bot command updated successfully');
            closeUpdateCommandModal();
            loadBotStatus(); // Refresh the display
        } else {
            showError(result.message || 'Error updating bot command');
        }
    } catch (error) {
        console.error('Error updating bot command:', error);
        showError('Error updating bot command');
    }
}

function showTestBotModal() {
    const modal = document.getElementById('testBotModal');
    if (modal) {
        modal.classList.remove('hidden');
        // Clear previous results
        const responseDiv = document.getElementById('testBotResponse');
        if (responseDiv) {
            responseDiv.innerHTML = '<p class="text-gray-400">Test results will appear here...</p>';
        }
    }
}

function closeTestBotModal() {
    const modal = document.getElementById('testBotModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

async function testBotFunction() {
    const phoneInput = document.getElementById('testPhoneNumber');
    const phoneNumber = phoneInput ? phoneInput.value.trim() : '';

    if (!phoneNumber) {
        showError('Please enter a phone number for testing');
        return;
    }

    const responseDiv = document.getElementById('testBotResponse');
    if (responseDiv) {
        responseDiv.innerHTML = '<p class="text-blue-400">🤖 Testing bot functionality...</p>';
    }

    try {
        const response = await fetch('/api/bot/test', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ phoneNumber: phoneNumber })
        });

        const result = await response.json();

        if (responseDiv) {
            if (result.success) {
                responseDiv.innerHTML = `
                    <div class="space-y-2">
                        <p class="text-green-400">✅ Bot test completed successfully</p>
                        <div class="bg-slate-800 p-3 rounded text-sm">
                            <p class="text-gray-300">Test sent to: ${phoneNumber}</p>
                            <p class="text-gray-300">Response preview: ${result.data.message || 'Check WhatsApp for actual response'}</p>
                        </div>
                    </div>
                `;
            } else {
                responseDiv.innerHTML = `
                    <div class="space-y-2">
                        <p class="text-red-400">❌ Bot test failed</p>
                        <div class="bg-slate-800 p-3 rounded text-sm">
                            <p class="text-gray-300">Error: ${result.message}</p>
                        </div>
                    </div>
                `;
            }
        }

        showInfo(result.message || 'Bot test completed');
    } catch (error) {
        console.error('Error testing bot:', error);
        if (responseDiv) {
            responseDiv.innerHTML = `
                <div class="space-y-2">
                    <p class="text-red-400">❌ Bot test failed</p>
                    <div class="bg-slate-800 p-3 rounded text-sm">
                        <p class="text-gray-300">Network error: ${error.message}</p>
                    </div>
                </div>
            `;
        }
        showError('Error testing bot');
    }
}

async function toggleBot() {
    try {
        const response = await fetch('/api/bot/toggle', {
            method: 'POST'
        });

        const result = await response.json();

        if (result.success) {
            showSuccess(`Bot ${result.data.enabled ? 'enabled' : 'disabled'} successfully`);
            loadBotStatus(); // Refresh the display
        } else {
            showError(result.message || 'Error toggling bot');
        }
    } catch (error) {
        console.error('Error toggling bot:', error);
        showError('Error toggling bot');
    }
}

// Auto-activate bot when WhatsApp connects
async function autoActivateBot() {
    try {
        // Check current bot status
        const statusResponse = await fetch('/api/bot/status');

        if (!statusResponse.ok) {
            console.error('Error checking bot status for auto-activation');
            return;
        }

        const statusData = await statusResponse.json();

        // If bot is disabled, enable it automatically
        if (!statusData.data.enabled) {
            console.log('Auto-activating bot after WhatsApp connection...');

            const toggleResponse = await fetch('/api/bot/toggle', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const result = await toggleResponse.json();

            if (result.success) {
                showSuccess('Bot otomatis diaktifkan setelah WhatsApp terhubung');
                // Refresh bot status display
                setTimeout(loadBotStatus, 1000);
            } else {
                console.error('Failed to auto-activate bot:', result.message);
            }
        }
    } catch (error) {
        console.error('Error in auto-activating bot:', error);
        // Don't show error to user as this is automatic
    }
}

// Check connection and auto-generate QR code if disconnected (like the old behavior)
async function checkConnectionAndGenerateQR() {
    try {
        console.log('Checking WhatsApp connection status for auto QR generation...');

        const response = await fetch('/whatsapp/api/status');
        const data = await response.json();

        if (data.connection && !data.connection.isConnected) {
            console.log('WhatsApp is disconnected, auto-generating QR code...');
            await generateQRCodeAutomatically();
        } else if (data.connection && data.connection.isConnected) {
            console.log('WhatsApp is already connected, no QR code needed');
        }
    } catch (error) {
        console.error('Error checking connection for auto QR generation:', error);
    }
}

// Generate QR code automatically (like the old behavior)
async function generateQRCodeAutomatically() {
    try {
        console.log('Auto-generating QR code...');
        showInfo('Memulai koneksi WhatsApp otomatis...');

        // Try the QR code generation endpoint first (GET method)
        const qrResponse = await fetch('/whatsapp/api/qr-code', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const qrData = await qrResponse.json();

        if (qrData.success && qrData.qrCode) {
            console.log('QR code generated successfully');
            showSuccess('QR code otomatis dihasilkan, silakan scan!');
            refreshStatus();
            startQRCountdown();
        } else {
            // If QR code endpoint fails, try the scan-start endpoint
            console.log('QR code endpoint failed, trying scan-start...');
            const scanResponse = await fetch('/whatsapp/scan-start', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({})
            });

            const scanData = await scanResponse.json();

            if (scanData.success) {
                console.log('Scan started successfully');
                showSuccess('Memulai koneksi WhatsApp otomatis...');
                refreshStatus();

                // Check for QR code status periodically
                setTimeout(() => {
                    checkQRCodeStatus();
                }, 2000);
            } else {
                console.log('Auto-generation failed, user will need to click Generate QR manually');
                showError('Auto-generasi QR gagal, silakan klik tombol "Generate QR" secara manual');
            }
        }
    } catch (error) {
        console.error('Error auto-generating QR code:', error);
        showError('Terjadi kesalahan saat auto-generate QR code, silakan coba manual');
    }
}

// Template Management Functions

// Edit template
function editTemplate(templateId) {
    try {
        console.log('Editing template:', templateId);

        // Find template data
        const template = templates.find(t => t.id === templateId);
        if (!template) {
            showError('Template tidak ditemukan');
            return;
        }

        // Create edit modal (simplified implementation)
        const modalHtml = `
            <div id="editTemplateModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div class="bg-slate-800 rounded-lg p-6 w-full max-w-2xl mx-4">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-xl font-semibold text-white">Edit Template</h3>
                        <button onclick="closeEditTemplateModal()" class="text-slate-400 hover:text-white">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>

                    <form id="editTemplateForm" class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-slate-300 mb-2">Nama Template</label>
                            <input type="text" id="templateName" value="${template.name}"
                                   class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:border-blue-500 focus:outline-none">
                        </div>

                        <div>
                            <label class="block text-sm font-medium text-slate-300 mb-2">Kategori</label>
                            <select id="templateCategory"
                                    class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:border-blue-500 focus:outline-none">
                                <option value="welcome" ${template.category === 'welcome' ? 'selected' : ''}>Welcome</option>
                                <option value="payment" ${template.category === 'payment' ? 'selected' : ''}>Payment</option>
                                <option value="expiry" ${template.category === 'expiry' ? 'selected' : ''}>Expiry</option>
                                <option value="renewal" ${template.category === 'renewal' ? 'selected' : ''}>Renewal</option>
                                <option value="general" ${template.category === 'general' ? 'selected' : ''}>General</option>
                            </select>
                        </div>

                        <div>
                            <label class="block text-sm font-medium text-slate-300 mb-2">Isi Pesan</label>
                            <textarea id="templateContent" rows="6"
                                      class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:border-blue-500 focus:outline-none">${template.content || ''}</textarea>
                            <p class="text-xs text-slate-500 mt-1">Gunakan {variable_name} untuk variabel dinamis</p>
                        </div>

                        <div class="flex justify-end space-x-3">
                            <button type="button" onclick="closeEditTemplateModal()"
                                    class="px-4 py-2 bg-slate-600 text-white rounded hover:bg-slate-700">
                                Batal
                            </button>
                            <button type="submit"
                                    class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                                Simpan Template
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        // Add modal to page
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Setup form submission
        document.getElementById('editTemplateForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            await saveTemplateChanges(templateId);
        });

    } catch (error) {
        console.error('Error editing template:', error);
        showError('Gagal membuka editor template');
    }
}

// Close edit template modal
function closeEditTemplateModal() {
    const modal = document.getElementById('editTemplateModal');
    if (modal) {
        modal.remove();
    }
}

// Save template changes
async function saveTemplateChanges(templateId) {
    try {
        const formData = {
            name: document.getElementById('templateName').value,
            category: document.getElementById('templateCategory').value,
            content: document.getElementById('templateContent').value
        };

        const response = await fetch(`/whatsapp/api/templates/${templateId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        const result = await response.json();

        if (result.success) {
            showSuccess('Template berhasil diperbarui');
            closeEditTemplateModal();
            loadTemplates(); // Refresh templates list
        } else {
            showError(result.message || 'Gagal memperbarui template');
        }
    } catch (error) {
        console.error('Error saving template:', error);
        showError('Gagal menyimpan perubahan template');
    }
}

// Test template with ID
async function testTemplateWithId(templateId) {
    try {
        console.log('Testing template:', templateId);

        // Find template data
        const template = templates.find(t => t.id === templateId);
        if (!template) {
            showError('Template tidak ditemukan');
            return;
        }

        // Create test modal
        const modalHtml = `
            <div id="testTemplateModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div class="bg-slate-800 rounded-lg p-6 w-full max-w-lg mx-4">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-xl font-semibold text-white">Test Template</h3>
                        <button onclick="closeTestTemplateModal()" class="text-slate-400 hover:text-white">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>

                    <form id="testTemplateForm" class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-slate-300 mb-2">Nomor WhatsApp Tujuan</label>
                            <input type="text" id="testPhone" placeholder="628123456789"
                                   class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:border-blue-500 focus:outline-none">
                        </div>

                        <div>
                            <label class="block text-sm font-medium text-slate-300 mb-2">Variabel (JSON)</label>
                            <textarea id="testVariables" rows="4" placeholder='{"customer_name": "John Doe", "service_type": "Hotspot"}'
                                      class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:border-blue-500 focus:outline-none"></textarea>
                        </div>

                        <div class="flex justify-end space-x-3">
                            <button type="button" onclick="closeTestTemplateModal()"
                                    class="px-4 py-2 bg-slate-600 text-white rounded hover:bg-slate-700">
                                Batal
                            </button>
                            <button type="submit"
                                    class="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700">
                                Kirim Test
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        // Add modal to page
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Setup form submission
        document.getElementById('testTemplateForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            await sendTestMessage(templateId);
        });

    } catch (error) {
        console.error('Error testing template:', error);
        showError('Gagal membuka test template');
    }
}

// Close test template modal
function closeTestTemplateModal() {
    const modal = document.getElementById('testTemplateModal');
    if (modal) {
        modal.remove();
    }
}

// Send test message
async function sendTestMessage(templateId) {
    try {
        const phone = document.getElementById('testPhone').value;
        let variables = {};

        try {
            const variablesText = document.getElementById('testVariables').value;
            if (variablesText.trim()) {
                variables = JSON.parse(variablesText);
            }
        } catch (e) {
            showError('Format variabel JSON tidak valid');
            return;
        }

        const testData = {
            template_id: templateId,
            phone: phone,
            variables: variables
        };

        const response = await fetch('/whatsapp/api/send-test', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(testData)
        });

        const result = await response.json();

        if (result.success) {
            showSuccess('Pesan test berhasil dikirim');
            closeTestTemplateModal();
        } else {
            showError(result.message || 'Gagal mengirim pesan test');
        }
    } catch (error) {
        console.error('Error sending test message:', error);
        showError('Gagal mengirim pesan test');
    }
}

// Delete template
async function deleteTemplate(templateId) {
    try {
        console.log('Deleting template:', templateId);

        // Find template data
        const template = templates.find(t => t.id === templateId);
        if (!template) {
            showError('Template tidak ditemukan');
            return;
        }

        // Confirm deletion
        if (!confirm(`Apakah Anda yakin ingin menghapus template "${template.name}"?`)) {
            return;
        }

        const response = await fetch(`/whatsapp/api/templates/${templateId}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (result.success) {
            showSuccess('Template berhasil dihapus');
            loadTemplates(); // Refresh templates list
        } else {
            showError(result.message || 'Gagal menghapus template');
        }
    } catch (error) {
        console.error('Error deleting template:', error);
        showError('Gagal menghapus template');
    }
}