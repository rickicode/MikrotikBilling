// WhatsApp Multi-Session Management
// Advanced interface for managing multiple WhatsApp sessions

let sessions = [];
let selectedSessionId = null;
let refreshInterval = null;
let currentSessionData = {};

// Global state
const whatsappMultiState = {
    sessions: [],
    selectedSession: null,
    statistics: {
        totalMessages: 0,
        activeSessions: 0,
        failedMessages: 0
    }
};

// Initialize WhatsApp Multi-Session Management
function initializeWhatsAppMultiSession() {
    console.log('Initializing WhatsApp Multi-Session Management...');

    // Load initial data
    loadAllSessions();

    // Setup auto-refresh
    setupAutoRefresh();

    // Setup periodic status checks
    setInterval(checkAllSessionsStatus, 10000);

    console.log('WhatsApp Multi-Session Management initialized');
}

// Load all sessions from API
async function loadAllSessions() {
    try {
        const response = await fetch('/whatsapp/api/sessions');
        const result = await response.json();

        if (result.success) {
            sessions = result.sessions || [];
            whatsappMultiState.sessions = sessions;

            // Update UI
            renderSessionsGrid();
            updateActiveSessionsCount();

            // Select default session if available
            const defaultSession = sessions.find(s => s.is_default);
            if (defaultSession && !selectedSessionId) {
                selectSession(defaultSession.id);
            }
        }
    } catch (error) {
        console.error('Error loading sessions:', error);
        showError('Failed to load WhatsApp sessions');
    }
}

// Render sessions grid
function renderSessionsGrid() {
    const grid = document.getElementById('sessionsGrid');
    if (!grid) return;

    if (sessions.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full bg-slate-800 rounded-xl border border-slate-700 p-8 text-center">
                <i class="fas fa-mobile-alt text-6xl text-slate-600 mb-4"></i>
                <h3 class="text-lg font-medium text-slate-400 mb-2">No WhatsApp Sessions</h3>
                <p class="text-slate-500 mb-4">Create your first WhatsApp session to get started</p>
                <button onclick="showCreateSessionModal()" class="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors font-medium">
                    <i class="fas fa-plus mr-2"></i>Create Session
                </button>
            </div>
        `;
        return;
    }

    grid.innerHTML = sessions.map(session => {
        const isSelected = session.id === selectedSessionId;
        const statusIcon = getStatusIcon(session.status);
        const statusColor = getStatusColor(session.status);

        return `
            <div class="bg-slate-800 rounded-xl border ${isSelected ? 'border-blue-500' : 'border-slate-700'} p-6 cursor-pointer hover:border-slate-600 transition-all duration-200 relative overflow-hidden"
                 onclick="selectSession('${session.id}')" data-session-id="${session.id}">

                ${isSelected ? '<div class="absolute top-0 right-0 w-2 h-full bg-blue-500"></div>' : ''}

                <div class="flex items-start justify-between mb-4">
                    <div>
                        <h3 class="text-lg font-semibold text-white mb-1">${session.name || 'Unnamed Session'}</h3>
                        <p class="text-xs text-slate-400">${session.type || 'personal'} session</p>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="px-2 py-1 bg-${statusColor}/20 text-${statusColor} rounded-full text-xs font-medium flex items-center">
                            <i class="fas fa-circle text-${statusColor} mr-1 text-xs"></i>
                            ${session.status}
                        </span>
                        ${session.is_default ? '<span class="px-2 py-1 bg-blue-600/20 text-blue-400 rounded text-xs">Default</span>' : ''}
                    </div>
                </div>

                <div class="space-y-2">
                    <div class="flex items-center justify-between text-sm">
                        <span class="text-slate-400">Phone:</span>
                        <span class="text-white font-medium">${session.phone_number || 'Not connected'}</span>
                    </div>
                    <div class="flex items-center justify-between text-sm">
                        <span class="text-slate-400">Priority:</span>
                        <span class="text-white">${session.priority || 1}</span>
                    </div>
                    <div class="flex items-center justify-between text-sm">
                        <span class="text-slate-400">Last Activity:</span>
                        <span class="text-white text-xs">${session.last_activity ? formatTime(session.last_activity) : 'Never'}</span>
                    </div>
                </div>

                ${session.status === 'connected' ? `
                    <div class="mt-4 pt-4 border-t border-slate-700">
                        <div class="flex gap-2">
                            <button onclick="event.stopPropagation(); sendMessageFromSession('${session.id}')"
                                    class="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors">
                                <i class="fas fa-paper-plane mr-1"></i> Send
                            </button>
                            <button onclick="event.stopPropagation(); showSessionMenu('${session.id}')"
                                    class="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors">
                                <i class="fas fa-ellipsis-v"></i>
                            </button>
                        </div>
                    </div>
                ` : session.status === 'disconnected' ? `
                    <div class="mt-4 pt-4 border-t border-slate-700">
                        <button onclick="event.stopPropagation(); connectSession('${session.id}')"
                                class="w-full px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm transition-colors">
                            <i class="fas fa-link mr-2"></i> Connect
                        </button>
                    </div>
                ` : `
                    <div class="mt-4 pt-4 border-t border-slate-700">
                        <div class="text-center text-xs text-slate-400">
                            <i class="fas fa-spinner fa-spin mr-1"></i> Connecting...
                        </div>
                    </div>
                `}
            </div>
        `;
    }).join('');
}

// Select a session
async function selectSession(sessionId) {
    selectedSessionId = sessionId;
    const session = sessions.find(s => s.id === sessionId);

    if (!session) return;

    whatsappMultiState.selectedSession = session;

    // Update UI
    updateSelectedSessionCard(session);

    // Highlight selected card
    document.querySelectorAll('[data-session-id]').forEach(card => {
        if (card.dataset.sessionId === sessionId) {
            card.classList.add('border-blue-500');
            card.querySelector('.absolute')?.classList.remove('hidden');
        } else {
            card.classList.remove('border-blue-500');
            card.classList.add('border-slate-700');
            card.querySelector('.absolute')?.classList.add('hidden');
        }
    });

    // Load session details
    await loadSessionDetails(sessionId);
}

// Update selected session card
function updateSelectedSessionCard(session) {
    const nameElement = document.getElementById('selectedSessionName');
    const statusElement = document.getElementById('selectedSessionStatus');

    if (nameElement) nameElement.textContent = session.name || 'Unnamed Session';

    if (statusElement) {
        const statusColor = getStatusColor(session.status);
        statusElement.className = `px-3 py-1 bg-${statusColor}/20 text-${statusColor} rounded-full text-sm font-medium`;
        statusElement.innerHTML = `
            <i class="fas fa-circle text-${statusColor} mr-2 text-xs"></i>
            ${session.status}
        `;
    }

    // Show appropriate section based on status
    const qrSection = document.getElementById('qrCodeSection');
    const connectedSection = document.getElementById('connectedInfoSection');
    const noSessionSection = document.getElementById('noSessionSection');

    // Hide all sections first
    qrSection?.classList.add('hidden');
    connectedSection?.classList.add('hidden');
    noSessionSection?.classList.add('hidden');

    if (session.status === 'connected') {
        connectedSection?.classList.remove('hidden');
        updateConnectedInfo(session);
    } else if (session.status === 'disconnected') {
        qrSection?.classList.remove('hidden');
        if (!session.qr_code) {
            requestQRCode(session.id);
        } else {
            displayQRCode(session.qr_code);
        }
    } else {
        // Connecting state
        qrSection?.classList.remove('hidden');
        showConnectingState();
    }
}

// Load session details
async function loadSessionDetails(sessionId) {
    try {
        const response = await fetch(`/whatsapp/api/sessions/${sessionId}`);
        const result = await response.json();

        if (result.success && result.session) {
            currentSessionData = result.session;
            updateSessionStatistics(result.session);
            loadRecentMessages(sessionId);
        }
    } catch (error) {
        console.error('Error loading session details:', error);
    }
}

// Request QR code for a session
async function requestQRCode(sessionId) {
    try {
        showQRLoadingState();

        const response = await fetch(`/whatsapp/api/sessions/${sessionId}/qr-code`, {
            method: 'POST'
        });

        const result = await response.json();

        if (result.success && result.qrCode) {
            displayQRCode(result.qrCode);

            // Start polling for connection status
            pollSessionStatus(sessionId);
        } else {
            showError('Failed to generate QR code');
        }
    } catch (error) {
        console.error('Error requesting QR code:', error);
        showError('Error generating QR code');
    }
}

// Display QR code
function displayQRCode(qrCodeData) {
    const qrDisplay = document.getElementById('qrCodeDisplay');
    const qrStatus = document.getElementById('qrStatus');

    if (qrDisplay) {
        qrDisplay.innerHTML = `<img src="${qrCodeData}" alt="WhatsApp QR Code" class="w-full h-full" />`;
    }

    if (qrStatus) {
        qrStatus.textContent = 'Scan this QR code with WhatsApp';
        qrStatus.className = 'text-sm text-green-400';
    }
}

// Show QR loading state
function showQRLoadingState() {
    const qrDisplay = document.getElementById('qrCodeDisplay');
    const qrStatus = document.getElementById('qrStatus');

    if (qrDisplay) {
        qrDisplay.innerHTML = `
            <div class="text-slate-400 text-center">
                <i class="fas fa-spinner fa-spin text-4xl mb-2"></i>
                <p>Generating QR code...</p>
            </div>
        `;
    }

    if (qrStatus) {
        qrStatus.textContent = 'Generating QR code...';
        qrStatus.className = 'text-sm text-yellow-400';
    }
}

// Show connecting state
function showConnectingState() {
    const qrDisplay = document.getElementById('qrCodeDisplay');
    const qrStatus = document.getElementById('qrStatus');

    if (qrDisplay) {
        qrDisplay.innerHTML = `
            <div class="text-slate-400 text-center">
                <i class="fas fa-spinner fa-spin text-4xl mb-2"></i>
                <p>Connecting to WhatsApp...</p>
            </div>
        `;
    }

    if (qrStatus) {
        qrStatus.textContent = 'Establishing connection...';
        qrStatus.className = 'text-sm text-blue-400';
    }
}

// Poll session status
async function pollSessionStatus(sessionId) {
    const maxAttempts = 60; // 5 minutes with 5-second intervals
    let attempts = 0;

    const poll = async () => {
        if (attempts >= maxAttempts) {
            showError('Connection timeout. Please try again.');
            return;
        }

        try {
            const response = await fetch(`/whatsapp/api/sessions/${sessionId}/status`);
            const result = await response.json();

            if (result.success && result.session) {
                if (result.session.status === 'connected') {
                    // Connected! Update UI
                    showSuccess('WhatsApp connected successfully!');
                    selectSession(sessionId);
                    return;
                } else if (result.session.status === 'disconnected') {
                    // Disconnected, show error
                    showError('Connection failed. Please try again.');
                    return;
                }
            }

            // Continue polling
            attempts++;
            setTimeout(poll, 5000);
        } catch (error) {
            console.error('Error polling status:', error);
            attempts++;
            setTimeout(poll, 5000);
        }
    };

    poll();
}

// Check all sessions status
async function checkAllSessionsStatus() {
    try {
        const response = await fetch('/whatsapp/api/sessions/status');
        const result = await response.json();

        if (result.success) {
            const updatedSessions = result.sessions || [];

            // Update local sessions data
            updatedSessions.forEach(updatedSession => {
                const index = sessions.findIndex(s => s.id === updatedSession.id);
                if (index !== -1) {
                    sessions[index] = { ...sessions[index], ...updatedSession };
                }
            });

            // Update UI if selected session changed
            if (selectedSessionId) {
                const selectedSession = sessions.find(s => s.id === selectedSessionId);
                if (selectedSession && currentSessionData.status !== selectedSession.status) {
                    selectSession(selectedSessionId);
                }
            }

            // Re-render grid
            renderSessionsGrid();
            updateActiveSessionsCount();
        }
    } catch (error) {
        console.error('Error checking sessions status:', error);
    }
}

// Update connected info
function updateConnectedInfo(session) {
    const phoneElement = document.getElementById('connectedPhone');
    if (phoneElement && session.phone_number) {
        phoneElement.textContent = formatPhoneNumber(session.phone_number);
    }
}

// Update active sessions count
function updateActiveSessionsCount() {
    const activeCount = sessions.filter(s => s.status === 'connected').length;
    const countElement = document.getElementById('activeSessionsCount');
    if (countElement) {
        countElement.textContent = activeCount;
    }
    whatsappMultiState.statistics.activeSessions = activeCount;
}

// Create new session
async function createNewSession() {
    const name = document.getElementById('sessionName').value.trim();
    const type = document.getElementById('sessionType').value;
    const phone = document.getElementById('sessionPhone').value.trim();
    const isDefault = document.getElementById('setDefault').checked;

    if (!name) {
        showError('Please enter a session name');
        return;
    }

    try {
        const response = await fetch('/whatsapp/api/sessions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: name,
                type: type,
                phone_number: phone,
                is_default: isDefault,
                priority: 1
            })
        });

        const result = await response.json();

        if (result.success) {
            showSuccess('Session created successfully');
            closeCreateSessionModal();
            loadAllSessions();

            // Select the new session
            selectSession(result.session.id);
        } else {
            showError(result.message || 'Failed to create session');
        }
    } catch (error) {
        console.error('Error creating session:', error);
        showError('Error creating session');
    }
}

// Connect session
function connectSession(sessionId) {
    selectSession(sessionId);
    requestQRCode(sessionId);
}

// Disconnect session
async function disconnectSession() {
    if (!selectedSessionId) return;

    if (!confirm('Are you sure you want to disconnect this WhatsApp session?')) {
        return;
    }

    try {
        const response = await fetch(`/whatsapp/api/sessions/${selectedSessionId}/disconnect`, {
            method: 'POST'
        });

        const result = await response.json();

        if (result.success) {
            showSuccess('Session disconnected');
            loadAllSessions();
            selectSession(selectedSessionId); // Refresh the display
        } else {
            showError(result.message || 'Failed to disconnect');
        }
    } catch (error) {
        console.error('Error disconnecting session:', error);
        showError('Error disconnecting session');
    }
}

// Send message from session
function sendMessageFromSession(sessionId) {
    // Open message compose modal with session pre-selected
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.innerHTML = `
        <div class="bg-slate-800 rounded-xl p-6 w-full max-w-md mx-4">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-lg font-semibold text-white">Send Message</h3>
                <button onclick="this.closest('.fixed').remove()" class="text-slate-400 hover:text-white">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <form class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-slate-300 mb-1">Recipient Number</label>
                    <input type="tel" placeholder="628123456789" required
                           class="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <p class="text-xs text-slate-400 mt-1">Include country code (62 for Indonesia)</p>
                </div>
                <div>
                    <label class="block text-sm font-medium text-slate-300 mb-1">Message</label>
                    <textarea rows="4" placeholder="Enter your message..." required
                              class="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"></textarea>
                </div>
                <div class="flex justify-end space-x-3">
                    <button type="button" onclick="this.closest('.fixed').remove()" class="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors">
                        Cancel
                    </button>
                    <button type="button" onclick="sendSessionMessage('${sessionId}')" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
                        <i class="fas fa-paper-plane mr-2"></i> Send
                    </button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(modal);
}

// Send message via specific session
async function sendSessionMessage(sessionId) {
    const form = document.querySelector('.fixed form');
    const phone = form.querySelector('input[type="tel"]').value.trim();
    const message = form.querySelector('textarea').value.trim();

    if (!phone || !message) {
        showError('Please fill in all fields');
        return;
    }

    try {
        const response = await fetch('/whatsapp/api/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                to: phone,
                message: message,
                sessionId: sessionId
            })
        });

        const result = await response.json();

        if (result.success) {
            showSuccess('Message sent successfully');
            document.querySelector('.fixed').remove();
            loadRecentMessages(sessionId);
        } else {
            showError(result.message || 'Failed to send message');
        }
    } catch (error) {
        console.error('Error sending message:', error);
        showError('Error sending message');
    }
}

// Refresh session QR
function refreshSessionQR() {
    if (selectedSessionId) {
        requestQRCode(selectedSessionId);
    }
}

// Refresh all sessions
function refreshAllSessions() {
    loadAllSessions();
    if (selectedSessionId) {
        loadSessionDetails(selectedSessionId);
    }
}

// Load recent messages for session
async function loadRecentMessages(sessionId) {
    try {
        const response = await fetch(`/whatsapp/api/sessions/${sessionId}/messages?limit=10`);
        const result = await response.json();

        if (result.success) {
            const messagesContainer = document.getElementById('recentMessages');
            if (messagesContainer && result.messages && result.messages.length > 0) {
                messagesContainer.innerHTML = result.messages.map(msg => `
                    <div class="p-3 bg-slate-700/50 rounded-lg">
                        <div class="flex items-start justify-between mb-1">
                            <span class="text-xs text-slate-400">${formatTime(msg.created_at)}</span>
                            <span class="text-xs px-2 py-1 bg-${getStatusColor(msg.status)}/20 text-${getStatusColor(msg.status)} rounded">
                                ${msg.status}
                            </span>
                        </div>
                        <p class="text-sm text-slate-300">${msg.content}</p>
                        <p class="text-xs text-slate-400 mt-1">To: ${msg.to_number}</p>
                    </div>
                `).join('');
            }
        }
    } catch (error) {
        console.error('Error loading messages:', error);
    }
}

// Show/create session modal
function showCreateSessionModal() {
    document.getElementById('createSessionModal').classList.remove('hidden');
    document.getElementById('createSessionModal').classList.add('flex');
}

// Close create session modal
function closeCreateSessionModal() {
    document.getElementById('createSessionModal').classList.add('hidden');
    document.getElementById('createSessionModal').classList.remove('flex');
    document.getElementById('createSessionForm').reset();
}

// Toggle session menu
function toggleSessionMenu() {
    // Implementation for session dropdown menu
    console.log('Toggle session menu');
}

// View all messages
function viewAllMessages() {
    // Navigate to messages tab
    console.log('View all messages');
}

// Utility functions
function getStatusIcon(status) {
    switch(status) {
        case 'connected': return 'fa-check-circle';
        case 'disconnected': return 'fa-unlink';
        case 'connecting': return 'fa-spinner fa-spin';
        default: return 'fa-question-circle';
    }
}

function getStatusColor(status) {
    switch(status) {
        case 'connected': return 'green';
        case 'disconnected': return 'red';
        case 'connecting': return 'yellow';
        default: return 'grey';
    }
}

function formatTime(timestamp) {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    return date.toLocaleString('id-ID', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatPhoneNumber(phone) {
    if (!phone) return 'Unknown';
    // Format phone number display
    return phone.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
}

// Setup auto-refresh
function setupAutoRefresh() {
    setInterval(() => {
        if (selectedSessionId) {
            checkAllSessionsStatus();
        }
    }, 30000); // Refresh every 30 seconds
}

// Update session statistics
function updateSessionStatistics(session) {
    // Update statistics based on session data
    whatsappMultiState.statistics.totalMessages = session.message_count || 0;
    whatsappMultiState.statistics.failedMessages = session.failed_count || 0;
}

// Toast notifications
function showSuccess(message) {
    if (typeof window.toastSystem !== 'undefined') {
        window.toastSystem.success(message);
    } else {
        alert('✅ ' + message);
    }
}

function showError(message) {
    if (typeof window.toastSystem !== 'undefined') {
        window.toastSystem.error(message);
    } else {
        alert('❌ ' + message);
    }
}

function showInfo(message) {
    if (typeof window.toastSystem !== 'undefined') {
        window.toastSystem.info(message);
    } else {
        alert('ℹ️ ' + message);
    }
}