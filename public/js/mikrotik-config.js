// Mikrotik Configuration JavaScript
async function testConnection() {
    const button = event.target;
    const originalText = button.innerHTML;

    button.disabled = true;
    button.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Testing...';

    try {
        const response = await fetch('/api/mikrotik/test-connection', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        });

        const data = await response.json();

        if (data.success) {
            ToastSystem.success('Connection successful! Mikrotik is responding.');
        } else {
            ToastSystem.error('Connection failed: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        ToastSystem.error('Connection test failed: ' + error.message);
    } finally {
        button.disabled = false;
        button.innerHTML = originalText;
    }
}

function resetForm() {
    document.getElementById('mikrotikConfigForm').reset();
}

// Add event delegation for inline onclick handlers
document.addEventListener('click', function(e) {
    // Test connection button
    if (e.target.closest('.test-connection-btn')) {
        e.preventDefault();
        testConnection();
    }

    // Reset form button
    if (e.target.closest('.reset-form-btn')) {
        e.preventDefault();
        resetForm();
    }
});