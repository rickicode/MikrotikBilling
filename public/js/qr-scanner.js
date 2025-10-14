// QR Scanner JavaScript for WhatsApp Web Connection

let qrRefreshInterval = null;
let connectionCheckInterval = null;
let qrExpirationTimer = null;

// Initialize page
document.addEventListener('DOMContentLoaded', function() {
  checkInitialStatus();
  setupEventListeners();

  // Auto-refresh status every 10 seconds
  connectionCheckInterval = setInterval(checkQRStatus, 10000);
});

// Check initial connection status
async function checkInitialStatus() {
  try {
    const response = await fetch('/whatsapp/api/status');
    const data = await response.json();

    updateConnectionUI(data);
  } catch (error) {
    console.error('Error checking initial status:', error);
    showError('Gagal memeriksa status koneksi awal');
  }
}

// Setup event listeners
function setupEventListeners() {
  // Add keyboard shortcuts
  document.addEventListener('keydown', function(event) {
    if (event.key === 'F5' || (event.ctrlKey && event.key === 'r')) {
      event.preventDefault();
      refreshQRStatus();
    }
  });
}

// Refresh QR status
async function refreshQRStatus() {
  try {
    showLoading(true);

    const response = await fetch('/whatsapp/api/status');
    const data = await response.json();

    updateConnectionUI(data);
  } catch (error) {
    console.error('Error refreshing QR status:', error);
    showError('Gagal memperbarui status QR');
  } finally {
    showLoading(false);
  }
}

// Update connection UI based on status
function updateConnectionUI(status) {
  const qrCodeSection = document.getElementById('qrCodeSection');
  const connectedSection = document.getElementById('connectedSection');
  const errorSection = document.getElementById('errorSection');
  const connectionStatus = document.getElementById('connectionStatus');
  const statusText = document.getElementById('statusText');
  const startScanBtn = document.getElementById('startScanBtn');
  const refreshQRBtn = document.getElementById('refreshQRBtn');
  const disconnectBtn = document.getElementById('disconnectBtn');

  // Clear any existing QR expiration timer
  if (qrExpirationTimer) {
    clearTimeout(qrExpirationTimer);
    qrExpirationTimer = null;
  }

  // Hide all sections first
  if (qrCodeSection) qrCodeSection.style.display = 'none';
  if (connectedSection) connectedSection.style.display = 'none';
  if (errorSection) errorSection.style.display = 'none';

  // Hide all buttons first
  if (startScanBtn) startScanBtn.style.display = 'none';
  if (refreshQRBtn) refreshQRBtn.style.display = 'none';
  if (disconnectBtn) disconnectBtn.style.display = 'none';

  if (status.connected) {
    // Show connected state
    if (connectionStatus) {
      connectionStatus.className = 'alert alert-success';
      statusText.textContent = 'WhatsApp Terhubung';
    }

    if (connectedSection) {
      connectedSection.style.display = 'block';

      // Update connection details
      const connectedPhone = document.getElementById('connectedPhone');
      const connectedTime = document.getElementById('connectedTime');

      if (connectedPhone) connectedPhone.textContent = status.phoneNumber || 'Tidak diketahui';
      if (connectedTime) connectedTime.textContent = status.connectedAt ?
        new Date(status.connectedAt).toLocaleString('id-ID') : 'Tidak diketahui';
    }

    if (disconnectBtn) disconnectBtn.style.display = 'inline-block';

  } else if (status.qrCode) {
    // Show QR code state
    if (connectionStatus) {
      connectionStatus.className = 'alert alert-info';
      statusText.textContent = 'Siap untuk scan QR code';
    }

    if (qrCodeSection) {
      qrCodeSection.style.display = 'block';

      // Update QR code image
      const qrCodeImage = document.getElementById('qrCodeImage');
      if (qrCodeImage) {
        qrCodeImage.src = status.qrCode;
        qrCodeImage.onload = function() {
          // Start QR expiration timer (QR codes expire after ~2 minutes)
          startQRExpirationTimer();
        };
      }
    }

    if (refreshQRBtn) refreshQRBtn.style.display = 'inline-block';

  } else if (status.error) {
    // Show error state
    if (connectionStatus) {
      connectionStatus.className = 'alert alert-danger';
      statusText.textContent = 'Koneksi gagal';
    }

    if (errorSection) {
      errorSection.style.display = 'block';

      const errorMessage = document.getElementById('errorMessage');
      if (errorMessage) errorMessage.textContent = status.error;
    }

    if (startScanBtn) startScanBtn.style.display = 'inline-block';

  } else {
    // Show initial state - need to start scanning
    if (connectionStatus) {
      connectionStatus.className = 'alert alert-warning';
      statusText.textContent = 'Belum ada koneksi aktif';
    }

    if (startScanBtn) startScanBtn.style.display = 'inline-block';
  }
}

// Start QR scanning
async function startQRScanning() {
  try {
    showLoading(true);

    const response = await fetch('/whatsapp/scan-start', {
      method: 'POST'
    });

    const data = await response.json();

    if (data.success) {
      showSuccess('Memulai sesi WhatsApp...');

      // Wait a moment then check status
      setTimeout(() => {
        refreshQRStatus();
      }, 2000);
    } else {
      showError(data.message || 'Gagal memulai QR scanning');
    }
  } catch (error) {
    console.error('Error starting QR scanning:', error);
    showError('Terjadi kesalahan saat memulai QR scanning');
  } finally {
    showLoading(false);
  }
}

// Refresh QR code
async function refreshQRCode() {
  try {
    showLoading(true);

    const response = await fetch('/whatsapp/api/qr-code', {
      method: 'POST'
    });

    const data = await response.json();

    if (data.success) {
      showSuccess('QR code diperbarui');
      refreshQRStatus();
    } else {
      showError(data.message || 'Gagal memperbarui QR code');
    }
  } catch (error) {
    console.error('Error refreshing QR code:', error);
    showError('Terjadi kesalahan saat memperbarui QR code');
  } finally {
    showLoading(false);
  }
}

// Disconnect WhatsApp
async function disconnectWhatsApp() {
  if (!confirm('Apakah Anda yakin ingin memutuskan koneksi WhatsApp?')) {
    return;
  }

  try {
    showLoading(true);

    const response = await fetch('/whatsapp/api/disconnect', {
      method: 'POST'
    });

    const data = await response.json();

    if (data.success) {
      showSuccess('Koneksi WhatsApp terputus');
      refreshQRStatus();
    } else {
      showError(data.message || 'Gagal memutuskan koneksi');
    }
  } catch (error) {
    console.error('Error disconnecting WhatsApp:', error);
    showError('Terjadi kesalahan saat memutuskan koneksi');
  } finally {
    showLoading(false);
  }
}

// Retry connection
async function retryConnection() {
  await startQRScanning();
}

// Start QR expiration timer
function startQRExpirationTimer() {
  let timeRemaining = 120; // 2 minutes in seconds

  const updateTimer = () => {
    const timeElement = document.getElementById('timeRemaining');
    const progressBar = document.getElementById('qrTimer');

    if (timeElement) {
      const minutes = Math.floor(timeRemaining / 60);
      const seconds = timeRemaining % 60;
      timeElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    if (progressBar) {
      const percentage = (timeRemaining / 120) * 100;
      progressBar.style.width = `${percentage}%`;
    }

    if (timeRemaining > 0) {
      timeRemaining--;
      qrExpirationTimer = setTimeout(updateTimer, 1000);
    } else {
      // QR code expired, refresh automatically
      showWarning('QR code kadaluarsa, memperbarui...');
      refreshQRCode();
    }
  };

  updateTimer();
}

// Show loading state
function showLoading(show) {
  const loadingElements = document.querySelectorAll('.loading');
  const buttons = document.querySelectorAll('button');

  if (show) {
    loadingElements.forEach(el => el.style.display = 'block');
    buttons.forEach(btn => btn.disabled = true);
  } else {
    loadingElements.forEach(el => el.style.display = 'none');
    buttons.forEach(btn => btn.disabled = false);
  }
}

// Show success message
function showSuccess(message) {
  showAlert(message, 'success');
}

// Show error message
function showError(message) {
  showAlert(message, 'danger');
}

// Show warning message
function showWarning(message) {
  showAlert(message, 'warning');
}

// Show alert message
function showAlert(message, type) {
  // Remove existing dynamic alerts
  const existingAlerts = document.querySelectorAll('.alert.dynamic');
  existingAlerts.forEach(alert => alert.remove());

  // Create new alert
  const alert = document.createElement('div');
  alert.className = `alert alert-${type} alert-dismissible fade show dynamic fade-in`;
  alert.innerHTML = `
    <i class="bi bi-${getAlertIcon(type)}"></i>
    ${message}
    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
  `;

  // Insert after page header
  const pageHeader = document.querySelector('.border-bottom');
  if (pageHeader && pageHeader.parentNode) {
    pageHeader.parentNode.insertBefore(alert, pageHeader.nextSibling);
  }

  // Auto-dismiss after 5 seconds
  setTimeout(() => {
    if (alert.parentNode) {
      alert.remove();
    }
  }, 5000);
}

// Get alert icon based on type
function getAlertIcon(type) {
  switch (type) {
    case 'success': return 'check-circle-fill';
    case 'danger': return 'x-circle-fill';
    case 'warning': return 'exclamation-triangle-fill';
    case 'info': return 'info-circle-fill';
    default: return 'info-circle-fill';
  }
}

// Check QR status (alias for refreshQRStatus)
function checkQRStatus() {
  refreshQRStatus();
}

// Cleanup on page unload
window.addEventListener('beforeunload', function() {
  if (qrRefreshInterval) {
    clearInterval(qrRefreshInterval);
  }
  if (connectionCheckInterval) {
    clearInterval(connectionCheckInterval);
  }
  if (qrExpirationTimer) {
    clearTimeout(qrExpirationTimer);
  }
});

// Add keyboard shortcuts help
document.addEventListener('DOMContentLoaded', function() {
  // Add help tooltip
  const helpBtn = document.createElement('button');
  helpBtn.className = 'btn btn-outline-secondary btn-sm position-fixed';
  helpBtn.style.cssText = 'bottom: 20px; right: 20px; z-index: 1000;';
  helpBtn.innerHTML = '<i class="bi bi-question-circle"></i>';
  helpBtn.title = 'Keyboard Shortcuts:\nF5 - Refresh status\nCtrl+R - Refresh status';

  document.body.appendChild(helpBtn);

  helpBtn.addEventListener('click', function() {
    alert('Keyboard Shortcuts:\n\nF5 - Refresh QR status\nCtrl+R - Refresh QR status\n\nTips:\n• QR code berlaku selama 2 menit\n• Pastikan koneksi internet stabil\n• Gunakan WhatsApp versi terbaru');
  });
});