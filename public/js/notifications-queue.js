// WhatsApp Queue JavaScript
function viewWhatsAppMessage(id) {
    fetch(`/api/whatsapp/${id}`)
        .then(response => response.json())
        .then(data => {
            const details = document.getElementById('messageDetails');
            details.innerHTML = `
                <div class="row">
                    <div class="col-md-6">
                        <strong>ID:</strong> ${data.id}<br>
                        <strong>Type:</strong> <span class="badge bg-success">WhatsApp</span><br>
                        <strong>Recipient:</strong> ${data.to_number}<br>
                        <strong>Status:</strong> <span class="badge bg-${getStatusClass(data.status)}">${data.status}</span><br>
                        <strong>Attempts:</strong> ${data.retry_count || 0}
                    </div>
                    <div class="col-md-6">
                        <strong>Created:</strong> ${new Date(data.created_at).toLocaleString()}<br>
                        <strong>Sent:</strong> ${data.sent_at ? new Date(data.sent_at).toLocaleString() : '-'}<br>
                        <strong>Template:</strong> ${data.template_name || 'Direct Message'}<br>
                        <strong>Customer:</strong> ${data.customer_name || '-'}
                    </div>
                </div>
                <hr>
                <h6>Message Content:</h6>
                <div class="bg-light p-3 rounded">
                    <p class="mb-0">${data.content || 'No content'}</p>
                </div>
                ${data.error_message ? `
                    <hr>
                    <h6>Error Response:</h6>
                    <div class="bg-danger text-white p-3 rounded">
                        <pre class="mb-0">${data.error_message}</pre>
                    </div>
                ` : ''}
            `;
            const modal = new bootstrap.Modal(document.getElementById('viewMessageModal'));
            modal.show();
        })
        .catch(error => {
            ToastSystem.error('Failed to load WhatsApp message details');
        });
}

function deleteWhatsAppMessage(id) {
    if (confirm('Are you sure you want to delete this WhatsApp message?')) {
        fetch(`/api/whatsapp/messages/${id}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(response => {
            if (response.ok) {
                window.location.reload();
            } else {
                ToastSystem.error('Failed to delete WhatsApp message');
            }
        })
        .catch(error => {
            ToastSystem.error('Failed to delete WhatsApp message');
        });
    }
}

function getStatusClass(status) {
    switch (status) {
        case 'sent': return 'success';
        case 'failed': return 'danger';
        case 'retrying': return 'info';
        default: return 'warning';
    }
}

// Add event delegation for inline onclick handlers
document.addEventListener('click', function(e) {
    // View WhatsApp message button
    if (e.target.closest('.view-message-btn')) {
        e.preventDefault();
        const messageId = e.target.closest('.view-message-btn').dataset.messageId;
        viewWhatsAppMessage(messageId);
    }

    // Delete WhatsApp message button
    if (e.target.closest('.delete-message-btn')) {
        e.preventDefault();
        const messageId = e.target.closest('.delete-message-btn').dataset.messageId;
        deleteWhatsAppMessage(messageId);
    }
});