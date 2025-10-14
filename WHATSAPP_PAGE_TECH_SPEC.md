# 📱 WhatsApp Management Page - Technical Specification Document

## Overview

Complete redesign of the WhatsApp management interface with a modern, dark-themed, mobile-first design using Tailwind CSS. The page will provide comprehensive WhatsApp Web JS integration management including QR scanning, message sending, bulk messaging, template management, and system settings.

## Database Schema Integration

### Core Tables Referenced

#### whatsapp_sessions
```sql
- id (INTEGER PRIMARY KEY)
- session_name (TEXT UNIQUE) - Session identifier
- session_data (TEXT) - JSON encoded session data
- qr_code (TEXT) - Base64 encoded QR code
- status (TEXT) - disconnected/connecting/connected/scanning/error
- phone_number (TEXT) - Connected WhatsApp number
- last_activity (DATETIME)
- created_at/updated_at (DATETIME)
```

#### whatsapp_messages
```sql
- id (INTEGER PRIMARY KEY)
- message_id (TEXT UNIQUE) - WhatsApp message ID
- from_number/to_number (TEXT) - Phone numbers
- message_type (TEXT) - outgoing/incoming
- content (TEXT) - Message content
- status (TEXT) - pending/sent/delivered/read/failed
- timestamp (DATETIME)
- related_id/related_type (INTEGER/TEXT) - Link to other entities
- error_message (TEXT)
- retry_count (INTEGER)
```

#### whatsapp_templates
```sql
- id (INTEGER PRIMARY KEY)
- name (TEXT UNIQUE) - Template identifier
- category (TEXT) - notification/payment/reminder/marketing/general
- template_content (TEXT) - Message content with variables
- variables (TEXT) - JSON array of variables
- is_active (BOOLEAN)
- created_at/updated_at (DATETIME)
```

#### notification_queue
```sql
- id (INTEGER PRIMARY KEY)
- recipient (TEXT) - Target phone number
- message (TEXT) - Message content
- priority (TEXT) - urgent/high/normal/low/bulk
- status (TEXT) - pending/processing/sent/failed
- template_id/template_data (INTEGER/TEXT) - Template reference
- whatsapp_message_id (TEXT) - Linked WhatsApp message
- retry_count/max_retries (INTEGER)
- scheduled_at (DATETIME)
```

## Technical Architecture

### Frontend Stack
- **Framework**: Tailwind CSS (CDN)
- **JavaScript**: Vanilla JS with fetch API
- **Design System**: Dark theme minimalist (consistent with FRONTEND_REDESIGN_SPEC.md)
- **Icons**: Bootstrap Icons
- **Real-time Updates**: Server-Sent Events (SSE) for live status

### Backend Integration
- **Primary Routes**: `/whatsapp/*` endpoints
- **API Endpoints**: RESTful JSON APIs
- **Real-time Events**: WebSocket-like polling for QR status
- **File Upload**: Media handling for MMS
- **Authentication**: JWT-based admin access

## Page Structure & Components

### 1. Header & Navigation
**Location**: Top of page, persistent across all WhatsApp sections

**Components**:
- **Title**: "WhatsApp Management" with WhatsApp brand icon
- **Status Indicator**: Real-time connection status badge
- **Navigation Tabs**: Dashboard | QR Scanner | Messages | Templates | Settings | Bulk Send
- **Quick Actions**: Connect/Disconnect button, Refresh status

**Technical Details**:
```javascript
// Tailwind CSS Classes
<nav class="bg-slate-900 border-b border-slate-800 sticky top-0 z-50">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="flex justify-between items-center h-16">
      <!-- Left side - Title and Status -->
      <div class="flex items-center space-x-4">
        <h1 class="text-xl font-semibold text-white">WhatsApp Management</h1>
        <div id="connectionStatus" class="flex items-center">
          <div class="w-2 h-2 rounded-full bg-red-500 mr-2"></div>
          <span class="text-slate-300 text-sm">Disconnected</span>
        </div>
      </div>

      <!-- Right side - Navigation -->
      <div class="hidden md:flex space-x-1">
        <button class="nav-tab active" data-tab="dashboard">Dashboard</button>
        <button class="nav-tab" data-tab="scanner">QR Scanner</button>
        <button class="nav-tab" data-tab="messages">Messages</button>
        <button class="nav-tab" data-tab="templates">Templates</button>
        <button class="nav-tab" data-tab="bulk">Bulk Send</button>
        <button class="nav-tab" data-tab="settings">Settings</button>
      </div>
    </div>
  </div>
</nav>
```

### 2. Dashboard Tab (Default View)

#### 2.1 Connection Status Card
**Location**: Top-left of dashboard grid

**Features**:
- **Real-time Status**: Connected/Disconnected/Scanning/Error
- **QR Code Display**: Live QR code for connection
- **Phone Number**: Connected WhatsApp number
- **Last Activity**: Timestamp of last interaction
- **Connection Controls**: Connect/Disconnect/Reconnect buttons

**API Integration**:
```javascript
// GET /whatsapp/api/status
async function fetchConnectionStatus() {
  const response = await fetch('/whatsapp/api/status');
  const data = await response.json();
  updateConnectionUI(data.connection);
}

// POST /whatsapp/scan-start
async function startScanning() {
  const response = await fetch('/whatsapp/scan-start', { method: 'POST' });
  beginQRPolling();
}
```

#### 2.2 Statistics Grid
**Location**: Top-right dashboard area

**Metrics Displayed**:
- Messages Today (from whatsapp_messages table)
- Messages Sent (success count)
- Messages Delivered (delivery confirmation)
- Messages Failed (error count)
- Queue Length (pending messages)
- Average Response Time

**Database Queries**:
```sql
-- Today's messages
SELECT COUNT(*) as count
FROM whatsapp_messages
WHERE DATE(timestamp) = DATE('now');

-- Status breakdown
SELECT status, COUNT(*) as count
FROM whatsapp_messages
GROUP BY status;

-- Queue statistics
SELECT status, COUNT(*) as count
FROM notification_queue
GROUP BY status;
```

#### 2.3 Quick Actions Panel
**Location**: Middle dashboard section

**Action Buttons**:
- **Send Message**: Opens compose modal
- **Send Bulk**: Opens bulk messaging interface
- **View History**: Navigate to message history
- **Manage Templates**: Navigate to template management
- **Test Connection**: Send test message
- **Clear Queue**: Clear pending messages

#### 2.4 Recent Messages Table
**Location**: Bottom dashboard area

**Features**:
- **Real-time Updates**: Auto-refresh every 30 seconds
- **Message Preview**: First 100 characters
- **Status Indicators**: Visual badges for message status
- **Quick Actions**: Reply, Forward, Delete, Retry
- **Pagination**: Navigate through message history

### 3. QR Scanner Tab

#### 3.1 QR Code Display
**Features**:
- **Live QR Code**: Auto-refreshing QR code
- **Instructions**: Step-by-step connection guide
- **Status Updates**: Real-time scanning progress
- **Error Handling**: Connection failure recovery

#### 3.2 Connection Management
**Features**:
- **Start Scanning**: Initiate QR code generation
- **Refresh QR**: Force new QR code generation
- **Cancel Scanning**: Abort connection process
- **Connection Test**: Verify connection health

**Technical Implementation**:
```javascript
// QR Code polling system
let qrPollingInterval;

function startQRStatusPolling() {
  qrPollingInterval = setInterval(async () => {
    const response = await fetch('/whatsapp/api/qr-status');
    const data = await response.json();

    if (data.qrCode) {
      updateQRCode(data.qrCode);
    } else if (data.connected) {
      stopQRPolling();
      showSuccess('WhatsApp connected successfully!');
      switchToTab('dashboard');
    }
  }, 2000);
}
```

### 4. Messages Tab

#### 4.1 Message History Table
**Features**:
- **Advanced Filtering**: By status, date range, recipient
- **Search**: Full-text search across message content
- **Sorting**: By date, status, recipient
- **Bulk Actions**: Delete multiple, retry failed messages
- **Export**: Download message history as CSV

**Database Integration**:
```javascript
// GET /whatsapp/api/messages
async function fetchMessages(filters = {}) {
  const params = new URLSearchParams(filters);
  const response = await fetch(`/whatsapp/api/messages?${params}`);
  return await response.json();
}
```

#### 4.2 Message Detail Modal
**Features**:
- **Full Message Content**: Complete message text
- **Delivery Status**: Sent/Delivered/Read timestamps
- **Error Details**: Failure reasons and retry attempts
- **Related Entity**: Link to customer/subscription/payment
- **Actions**: Reply, Forward, Resend, Delete

### 5. Templates Tab

#### 5.1 Template Management Table
**Features**:
- **CRUD Operations**: Create, Read, Update, Delete templates
- **Category Filtering**: By notification/payment/reminder etc.
- **Variable Preview**: Show template variables
- **Usage Statistics**: How many times used
- **Default Templates**: Mark system defaults

**Template Schema**:
```javascript
// Template object structure
const template = {
  id: 1,
  name: 'voucher_created',
  category: 'notification',
  content: '🎫 Voucher Anda telah dibuat!\n\nKode: {voucher_code}\nDurasi: {duration} jam\nHarga: Rp {price_sell}',
  variables: ['voucher_code', 'duration', 'price_sell'],
  is_active: true,
  usage_count: 150
};
```

#### 5.2 Template Editor
**Features**:
- **Live Preview**: Real-time template rendering
- **Variable Insertion**: Click to add variables
- **Syntax Highlighting**: Markdown support
- **Validation**: Required variables check
- **Test Send**: Send test message with sample data

### 6. Bulk Send Tab

#### 6.1 Recipient Management
**Features**:
- **Manual Input**: Comma-separated phone numbers
- **File Upload**: CSV/Excel import
- **Customer Selection**: Choose from customer database
- **Group Filtering**: Filter by subscription status
- **Number Validation**: Phone number format checking

#### 6.2 Message Composition
**Features**:
- **Template Selection**: Use existing templates
- **Custom Message**: Write custom content
- **Variable Mapping**: Map template variables to data
- **Message Preview**: Preview before sending
- **Scheduling**: Send immediately or schedule later

#### 6.3 Send Progress & Monitoring
**Features**:
- **Real-time Progress**: Live sending progress
- **Queue Management**: Monitor message queue
- **Error Tracking**: Failed messages with reasons
- **Retry Logic**: Automatic retry for failures
- **Statistics**: Success/failure rates

**Bulk Send API**:
```javascript
// POST /whatsapp/api/bulk/send
async function sendBulkMessages(messages, options = {}) {
  const response = await fetch('/whatsapp/api/bulk/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: messages,
      priority: options.priority || 'bulk',
      delayBetween: options.delayBetween || 2000
    })
  });
  return await response.json();
}
```

### 7. Settings Tab

#### 7.1 Connection Settings
**Features**:
- **Auto-reconnect**: Toggle automatic reconnection
- **Session Timeout**: Configure session duration
- **Connection Retry**: Set retry attempts
- **Rate Limiting**: Message sending limits

#### 7.2 Message Settings
**Features**:
- **Default Priority**: Set message priority
- **Retry Logic**: Configure retry attempts
- **Queue Processing**: Set processing intervals
- **Message Formatting**: Default message options

#### 7.3 Notification Settings
**Features**:
- **Daily Reminders**: Configure expiry notifications
- **Real-time Alerts**: Enable instant notifications
- **Template Defaults**: Set default templates
- **Reporting**: Configure report generation

## Mobile Responsive Design

### Mobile (< 640px)
- **Single Column Layout**: All cards stack vertically
- **Bottom Navigation**: Floating action buttons
- **Swipe Gestures**: Horizontal scroll for tables
- **Touch Targets**: Minimum 44px touch areas
- **Compact Cards**: Reduced padding and spacing

### Tablet (640px - 1024px)
- **Two Column Grid**: Cards in 2x2 layout
- **Side Navigation**: Collapsible sidebar
- **Optimized Tables**: Horizontal scroll with sticky headers
- **Adaptive Forms**: Multi-column form layouts

### Desktop (> 1024px)
- **Three Column Grid**: Maximum information density
- **Fixed Sidebar**: Persistent navigation
- **Hover States**: Enhanced interactions
- **Keyboard Shortcuts**: Power user features

## State Management & Real-time Updates

### Client-side State
```javascript
// Global state management
const whatsappState = {
  connection: {
    status: 'disconnected',
    phoneNumber: null,
    lastActivity: null
  },
  statistics: {
    today: 0,
    sent: 0,
    delivered: 0,
    failed: 0
  },
  messages: [],
  templates: [],
  queue: {
    pending: 0,
    processing: 0
  }
};

// State update functions
function updateConnectionStatus(status) {
  whatsappState.connection = { ...whatsappState.connection, ...status };
  renderConnectionUI();
}
```

### Real-time Updates
```javascript
// Server-Sent Events for live updates
const eventSource = new EventSource('/whatsapp/api/events');

eventSource.onmessage = function(event) {
  const data = JSON.parse(event.data);

  switch(data.type) {
    case 'connection_status':
      updateConnectionStatus(data.payload);
      break;
    case 'message_sent':
      updateMessageStatistics(data.payload);
      break;
    case 'queue_update':
      updateQueueStatus(data.payload);
      break;
  }
};
```

## Performance Optimizations

### 1. Lazy Loading
- **Message History**: Load on demand
- **Template List**: Paginate large lists
- **Statistics Cache**: Cache for 30 seconds

### 2. Debounced Updates
- **Search Inputs**: 300ms debounce
- **Form Validation**: Real-time but throttled
- **Status Polling**: Adaptive intervals

### 3. Optimized Rendering
- **Virtual Scrolling**: Large message lists
- **Skeleton Loading**: Smooth content loading
- **Image Optimization**: Compressed QR codes

## Security Considerations

### 1. Input Validation
- **Phone Numbers**: Format validation
- **Message Content**: XSS prevention
- **File Uploads**: Type and size restrictions

### 2. Rate Limiting
- **API Calls**: Client-side throttling
- **Message Sending**: Server-side limits
- **File Operations**: Upload restrictions

### 3. Data Protection
- **PII Handling**: Mask sensitive data
- **Session Security**: Secure token management
- **Audit Trail**: Action logging

## Error Handling & User Experience

### 1. Connection Errors
- **Network Issues**: Offline detection
- **QR Timeout**: Refresh automatically
- **Session Expiry**: Clear and reconnect

### 2. Message Errors
- **Failed Sends**: Retry automatically
- **Invalid Numbers**: Validation feedback
- **Rate Limits**: Queue and retry

### 3. User Feedback
- **Loading States**: Clear progress indicators
- **Success Messages**: Confirmation of actions
- **Error Messages**: Actionable error descriptions

## Integration Points

### 1. Customer Management
- **Select Customers**: Choose from customer list
- **Personalization**: Use customer data in templates
- **History Tracking**: Link messages to customers

### 2. Payment System
- **Payment Notifications**: Automated payment messages
- **Due Reminders**: Scheduled payment reminders
- **Receipt Messages**: Payment confirmation

### 3. Voucher System
- **Voucher Delivery**: Send voucher codes
- **Expiry Reminders**: Automated expiry alerts
- **Usage Notifications**: Voucher status updates

## Testing Strategy

### 1. Unit Testing
- **Component Testing**: Individual component functionality
- **API Integration**: Mock API responses
- **State Management**: State update logic

### 2. Integration Testing
- **End-to-End Flow**: Complete user journeys
- **API Integration**: Real backend testing
- **Cross-browser**: Compatibility testing

### 3. Performance Testing
- **Load Testing**: Bulk message sending
- **Stress Testing**: Maximum concurrent users
- **Mobile Performance**: Responsive behavior

## Deployment & Maintenance

### 1. Deployment Checklist
- **Asset Optimization**: Minified CSS/JS
- **Cache Busting**: Versioned assets
- **CDN Configuration**: Fast content delivery
- **Monitoring**: Error tracking and performance

### 2. Maintenance Tasks
- **Log Monitoring**: Error and performance logs
- **Database Cleanup**: Old message archival
- **Session Management**: Expired session cleanup
- **Feature Updates**: Regular feature enhancements

## Success Metrics

### User Experience
- **Connection Success Rate**: >95% successful connections
- **Message Delivery Rate**: >98% successful delivery
- **Page Load Time**: <2 seconds initial load
- **Mobile Usability**: 100% mobile-friendly

### Business Objectives
- **User Engagement**: Increased WhatsApp usage
- **Support Efficiency**: Reduced support tickets
- **Message Volume**: Increased customer communication
- **Template Usage**: High template adoption rate

---

## Implementation Priority

### Phase 1: Core Framework (Week 1-2)
1. **Base Layout**: Tailwind CSS integration
2. **Navigation System**: Tab-based navigation
3. **Dashboard Core**: Status and statistics
4. **Connection Management**: QR scanning functionality

### Phase 2: Message Management (Week 3-4)
1. **Message History**: Complete message interface
2. **Template System**: Template CRUD operations
3. **Send Message**: Single message functionality
4. **Real-time Updates**: Live status updates

### Phase 3: Advanced Features (Week 5-6)
1. **Bulk Messaging**: Complete bulk send system
2. **File Upload**: Media handling capabilities
3. **Advanced Search**: Message filtering and search
4. **Export Functionality**: Data export features

### Phase 4: Polish & Optimization (Week 7-8)
1. **Mobile Optimization**: Responsive enhancements
2. **Performance Tuning**: Speed and efficiency
3. **Testing & QA**: Comprehensive testing
4. **Documentation**: User and technical documentation

This specification provides a comprehensive roadmap for implementing a modern, feature-rich WhatsApp management interface that integrates seamlessly with the existing Mikrotik Billing System while following established design patterns and technical best practices.