# WhatsApp Automation v2.0 - Multi-Session Support

## 1. Overview

Sistem WhatsApp automation v2.0 menggunakan WhatsApp Web JS (Baileys) dengan dukungan multi-session untuk notifikasi otomatis dan komunikasi dengan pelanggan. Sistem mendukung multiple device login dengan prioritas untuk bulk notifications.

## 2. Key Features

### 2.1 Core Features
- **Multi-Session Support**: Beberapa device dapat login simultan
- **Priority Queue**: Bulk notifications dengan prioritas tinggi
- **Failover System**: Auto-switch ke session lain jika error
- **Template System**: Template notifikasi yang dapat dikustomisasi
- **Queue Management**: Redis queue untuk retry logic
- **Rate Limiting**: 1 message per detik untuk menghindari ban
- **Contact Sync**: Sinkronisasi kontak otomatis

### 2.2 Business Logic
- Single channel notifikasi (WhatsApp only)
- QR code generation untuk session login
- Auto-reconnect dengan exponential backoff
- Message tracking dan delivery status
- Bulk notifications dengan batch processing

## 3. Architecture

### 3.1 Components
```
src/services/WhatsAppService.js     # Core WhatsApp service
src/services/WhatsAppSession.js     # Session management
src/services/WhatsAppQueue.js       # Queue processing
src/services/TemplateService.js     # Template management
src/lib/WhatsAppClient.js           # Baileys wrapper
views/whatsapp/                     # WhatsApp management UI
├── sessions.ejs                    # Session management page
├── templates.ejs                   # Template management
└── queue.ejs                       # Queue monitoring
```

### 3.2 Multi-Session Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                WhatsApp Session Manager                     │
├─────────────────┬─────────────────┬─────────────────────────┤
│                 │                 │                         │
│   Session 1     │    Session 2    │     Session N           │
│   (Primary)     │   (Secondary)   │    (Backup)             │
│                 │                 │                         │
│ - Device: WA-1  │ - Device: WA-2  │ - Device: WA-N          │
│ - Status: Active│ - Status: Ready │ - Status: Standby       │
│ - Messages: 85% │ - Messages: 10% │ - Messages: 5%          │
│ - Priority: 1   │ - Priority: 2   │ - Priority: 3           │
└─────────────────┴─────────────────┴─────────────────────────┘
                          │
                          ▼
                 ┌─────────────────┐
                 │   Message       │
                 │   Queue         │
                 │   (Redis)       │
                 └─────────────────┘
```

## 4. Session Management

### 4.1 Session Model
```javascript
class WhatsAppSession {
  constructor(sessionId, config) {
    this.sessionId = sessionId;
    this.deviceId = config.deviceId;
    this.priority = config.priority || 999;
    this.status = 'disconnected'; // disconnected, connecting, connected, error
    this.client = null;
    this.lastActivity = null;
    this.messageCount = 0;
    this.errorCount = 0;
    this.isPrimary = false;
  }

  async initialize() {
    const { default: makeWASocket } = require('@adiwajshing/baileys');

    this.client = makeWASocket({
      auth: this.getState(),
      printQRInTerminal: false,
      browser: [`Mikrotik-Billing-${this.deviceId}`, 'Chrome', '4.0.0'],
      connectTimeoutMs: 60000,
      qrTimeoutMs: 0,
      defaultQueryTimeoutMs: undefined,
      keepAliveIntervalMs: 30000
    });

    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.client.ev.on('connection.update', (update) => {
      this.handleConnectionUpdate(update);
    });

    this.client.ev.on('messages.upsert', (m) => {
      this.handleIncomingMessage(m);
    });

    this.client.ev.on('creds.update', () => {
      this.saveState();
    });
  }

  async handleConnectionUpdate(update) {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      this.emit('qr', qr);
    }

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log(`Session ${this.sessionId} disconnected. Reconnecting: ${shouldReconnect}`);

      if (shouldReconnect) {
        await this.reconnect();
      } else {
        this.status = 'logged_out';
        this.emit('logout');
      }
    }

    if (connection === 'open') {
      this.status = 'connected';
      this.lastActivity = new Date();
      this.isPrimary = await this.checkIfPrimary();
      this.emit('connected');
    }
  }

  async checkIfPrimary() {
    // Check if this is the primary session (lowest priority number)
    const sessions = await sessionManager.getAllSessions();
    const lowestPriority = Math.min(...sessions.map(s => s.priority));
    return this.priority === lowestPriority;
  }
}
```

### 4.2 Session Manager
```javascript
class WhatsAppSessionManager {
  constructor() {
    this.sessions = new Map();
    this.primarySession = null;
    this.messageQueue = new WhatsAppQueue();
  }

  async createSession(config) {
    const session = new WhatsAppSession(config.sessionId, config);
    await session.initialize();

    this.sessions.set(session.sessionId, session);

    session.on('connected', () => {
      this.updatePrimarySession();
    });

    session.on('qr', (qr) => {
      this.emit('qr', session.sessionId, qr);
    });

    return session;
  }

  updatePrimarySession() {
    // Find session with lowest priority that's connected
    const connectedSessions = Array.from(this.sessions.values())
      .filter(s => s.status === 'connected')
      .sort((a, b) => a.priority - b.priority);

    if (connectedSessions.length > 0) {
      this.primarySession = connectedSessions[0];
      console.log(`Primary session updated: ${this.primarySession.sessionId}`);
    }
  }

  async sendMessage(to, message, options = {}) {
    // Try primary session first
    if (this.primarySession && this.primarySession.status === 'connected') {
      try {
        const result = await this.primarySession.client.sendMessage(to, message, options);
        this.primarySession.messageCount++;
        this.primarySession.lastActivity = new Date();
        return result;
      } catch (error) {
        console.error(`Primary session failed: ${error.message}`);
        this.primarySession.errorCount++;

        // Try fallback session
        return await this.sendWithFallback(to, message, options);
      }
    }

    // No primary session, use fallback
    return await this.sendWithFallback(to, message, options);
  }

  async sendWithFallback(to, message, options) {
    const availableSessions = Array.from(this.sessions.values())
      .filter(s => s.status === 'connected' && s !== this.primarySession)
      .sort((a, b) => a.priority - b.priority);

    for (const session of availableSessions) {
      try {
        const result = await session.client.sendMessage(to, message, options);
        session.messageCount++;
        session.lastActivity = new Date();
        return result;
      } catch (error) {
        console.error(`Session ${session.sessionId} failed: ${error.message}`);
        session.errorCount++;
        continue;
      }
    }

    throw new Error('No available WhatsApp sessions');
  }

  async sendBulk(messages) {
    // Add to queue with high priority
    const jobId = await this.messageQueue.add('bulk', {
      messages,
      priority: 1,
      attempts: 0,
      maxAttempts: 3
    }, {
      priority: 1,
      delay: 0
    });

    return { jobId, queued: messages.length };
  }
}
```

## 5. Queue Management

### 5.1 Priority Queue Implementation
```javascript
class WhatsAppQueue {
  constructor(redisClient) {
    this.redis = redisClient;
    this.processing = new Map();
    this.rateLimiter = new RateLimiter(1, 1000); // 1 message per second
  }

  async add(queue, data, options = {}) {
    const job = {
      id: uuid(),
      queue,
      data,
      priority: options.priority || 10,
      attempts: 0,
      maxAttempts: options.maxAttempts || 3,
      delay: options.delay || 0,
      createdAt: Date.now(),
      sessionId: options.sessionId || null
    };

    // Add to priority queue
    if (job.delay > 0) {
      await this.redis.zadd(
        `whatsapp:queue:${queue}:delayed`,
        Date.now() + job.delay,
        JSON.stringify(job)
      );
    } else {
      await this.redis.zadd(
        `whatsapp:queue:${queue}:pending`,
        job.priority,
        JSON.stringify(job)
      );
    }

    return job.id;
  }

  async process(queue, handler) {
    while (true) {
      // Move delayed jobs to pending
      await this.moveDelayedJobs(queue);

      // Get next job (lowest priority number = highest priority)
      const jobData = await this.redis.zpopmin(
        `whatsapp:queue:${queue}:pending`
      );

      if (jobData && jobData.length > 0) {
        const job = JSON.parse(jobData[0].value);
        this.processing.set(job.id, job);

        try {
          // Rate limiting
          await this.rateLimiter.wait();

          // Process job
          await handler(job);

          // Mark as complete
          await this.redis.set(
            `whatsapp:job:${job.id}:complete`,
            JSON.stringify({
              completedAt: Date.now(),
              sessionId: job.sessionId
            })
          );

          this.processing.delete(job.id);

        } catch (error) {
          job.attempts++;
          job.lastError = error.message;

          if (job.attempts < job.maxAttempts) {
            // Retry with exponential backoff
            const delay = Math.pow(2, job.attempts) * 1000;
            await this.add(queue, job.data, {
              ...job,
              delay
            });
          } else {
            // Mark as failed
            await this.redis.set(
              `whatsapp:job:${job.id}:failed`,
              JSON.stringify({
                failedAt: Date.now(),
                error: error.message,
                attempts: job.attempts
              })
            );
          }

          this.processing.delete(job.id);
        }
      } else {
        // No jobs, wait
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
}
```

## 6. Template System

### 6.1 Template Structure
```javascript
class WhatsAppTemplate {
  constructor(data) {
    this.id = data.id;
    this.name = data.name;
    this.category = data.category; // notification, reminder, promotion
    this.type = data.type; // text, media, button, list
    this.content = data.content;
    this.variables = this.extractVariables();
    this.isActive = data.is_active || true;
    this.language = data.language || 'id';
  }

  extractVariables() {
    const regex = /\{\{(\w+)\}\}/g;
    const variables = [];
    let match;

    while ((match = regex.exec(this.content)) !== null) {
      variables.push(match[1]);
    }

    return variables;
  }

  render(data) {
    let rendered = this.content;

    for (const variable of this.variables) {
      const value = data[variable] || `{{${variable}}}`;
      rendered = rendered.replace(
        new RegExp(`\\{\\{${variable}\\}\\}`, 'g'),
        value
      );
    }

    return rendered;
  }

  generateMessage(data) {
    const rendered = this.render(data);

    switch (this.type) {
      case 'text':
        return { text: rendered };

      case 'media':
        return {
          image: data.mediaUrl,
          caption: rendered
        };

      case 'button':
        return {
          text: rendered,
          buttons: data.buttons || []
        };

      case 'list':
        return {
          text: rendered,
          footer: data.footer || '',
          buttonText: data.buttonText || 'Pilih',
          sections: data.sections || []
        };

      default:
        return { text: rendered };
    }
  }
}
```

### 6.2 Pre-built Templates
```javascript
const defaultTemplates = [
  {
    name: 'payment_reminder',
    category: 'reminder',
    type: 'text',
    content: `Halo {{customer_name}},

Ini adalah pengingat pembayaran untuk:
📄 No. Invoice: {{invoice_number}}
💰 Jumlah: Rp{{amount}}
📅 Jatuh Tempo: {{due_date}}

Segera lakukan pembayaran melalui:
{{payment_url}}

Terima kasih!`,
    variables: ['customer_name', 'invoice_number', 'amount', 'due_date', 'payment_url']
  },

  {
    name: 'payment_confirmation',
    category: 'notification',
    type: 'text',
    content: `✅ Pembayaran Berhasil!

Detail Pembayaran:
📄 No. Invoice: {{invoice_number}}
💰 Jumlah: Rp{{amount}}
🏦 Metode: {{payment_method}}
📅 Tanggal: {{payment_date}}
📝 Referensi: {{reference}}

Layanan Anda telah diperpanjang.
Terima kasih atas kepercayaan Anda!`,
    variables: ['invoice_number', 'amount', 'payment_method', 'payment_date', 'reference']
  },

  {
    name: 'expiry_warning',
    category: 'reminder',
    type: 'text',
    content: `⚠️ Peringatan Expired

Halo {{customer_name}},

Layanan internet Anda akan expired dalam:
⏰ {{remaining_time}}

Segera perpanjang untuk menghindari gangguan layanan.
Hubungi admin atau klik link berikut:
{{renewal_url}}

Terima kasih!`,
    variables: ['customer_name', 'remaining_time', 'renewal_url']
  },

  {
    name: 'voucher_activated',
    category: 'notification',
    type: 'text',
    content: `🎉 Voucher Aktif!

Voucher Anda telah aktif:
🔑 Kode: {{voucher_code}}
⏰ Masa Aktif: {{duration}}
📅 Expired: {{expiry_time}}

Selamat menikmati layanan internet kami!
Terima kasih!`,
    variables: ['voucher_code', 'duration', 'expiry_time']
  }
];
```

## 7. Notification Triggers

### 7.1 Trigger System
```javascript
class NotificationTrigger {
  constructor(whatsappService, templateService) {
    this.whatsapp = whatsappService;
    this.templates = templateService;
    this.triggers = new Map();
  }

  registerTrigger(eventName, handler) {
    this.triggers.set(eventName, handler);
  }

  async executeTrigger(eventName, data) {
    const handler = this.triggers.get(eventName);
    if (!handler) return;

    try {
      await handler(data);
    } catch (error) {
      console.error(`Trigger ${eventName} failed:`, error);
    }
  }

  // Built-in triggers
  setupBuiltinTriggers() {
    // Payment reminder
    this.registerTrigger('invoice.created', async (data) => {
      const template = await this.templates.getByName('new_invoice');
      const message = template.generateMessage(data);

      await this.whatsapp.sendMessage(
        data.customer_whatsapp,
        message
      );
    });

    // Payment confirmation
    this.registerTrigger('payment.completed', async (data) => {
      const template = await this.templates.getByName('payment_confirmation');
      const message = template.generateMessage(data);

      await this.whatsapp.sendMessage(
        data.customer_whatsapp,
        message
      );
    });

    // Expiry warning
    this.registerTrigger('service.expiring', async (data) => {
      const template = await this.templates.getByName('expiry_warning');
      const message = template.generateMessage(data);

      await this.whatsapp.sendMessage(
        data.customer_whatsapp,
        message
      );
    });

    // Bulk notifications
    this.registerTrigger('bulk.send', async (data) => {
      const { recipients, templateName, templateData } = data;
      const template = await this.templates.getByName(templateName);

      const messages = recipients.map(recipient => ({
        to: recipient.whatsapp,
        message: template.generateMessage({
          ...templateData,
          ...recipient.data
        })
      }));

      await this.whatsapp.sendBulk(messages);
    });
  }
}
```

## 8. API Endpoints

### 8.1 Session Management
```javascript
// Get all sessions
GET /api/whatsapp/sessions
Response: {
  sessions: [{
    id: "session-1",
    deviceId: "WA-1",
    status: "connected",
    isPrimary: true,
    priority: 1,
    messageCount: 1250,
    lastActivity: "2025-01-09T10:30:00Z"
  }]
}

// Create new session
POST /api/whatsapp/sessions
{
  deviceId: "WA-2",
  priority: 2
}

// Get QR code for session
GET /api/whatsapp/sessions/:id/qr
Response: {
  qr: "data:image/png;base64,....",
  expires: 300
}

// Delete session
DELETE /api/whatsapp/sessions/:id
```

### 8.2 Message Operations
```javascript
// Send single message
POST /api/whatsapp/send
{
  to: "6281234567890@s.whatsapp.net",
  template: "payment_reminder",
  data: {
    customer_name: "John Doe",
    invoice_number: "INV-001",
    amount: "150000"
  }
}

// Send bulk messages
POST /api/whatsapp/send-bulk
{
  recipients: [
    { whatsapp: "6281234567890@s.whatsapp.net", data: {...} },
    { whatsapp: "6289876543210@s.whatsapp.net", data: {...} }
  ],
  template: "expiry_warning",
  templateData: { common: "data" }
}

// Check message status
GET /api/whatsapp/message/:id/status
Response: {
  id: "msg-123",
  status: "delivered",
  sentAt: "2025-01-09T10:00:00Z",
  deliveredAt: "2025-01-09T10:00:15Z",
  sessionId: "session-1"
}
```

### 8.3 Template Management
```javascript
// Get all templates
GET /api/whatsapp/templates

// Create template
POST /api/whatsapp/templates
{
  name: "custom_template",
  category: "notification",
  type: "text",
  content: "Hello {{name}}, your order {{order_id}} is ready!"
}

// Preview template
POST /api/whatsapp/templates/preview
{
  templateId: "payment_reminder",
  data: {
    customer_name: "John Doe",
    amount: "150000"
  }
}
```

## 9. Database Schema

### 9.1 Tables
```sql
-- WhatsApp sessions
CREATE TABLE whatsapp_sessions (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(100) UNIQUE NOT NULL,
    device_id VARCHAR(100) NOT NULL,
    phone_number VARCHAR(20),
    status VARCHAR(20) DEFAULT 'disconnected',
    is_primary BOOLEAN DEFAULT false,
    priority INTEGER DEFAULT 999,
    message_count BIGINT DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    last_activity TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Message templates
CREATE TABLE whatsapp_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    category VARCHAR(50),
    type VARCHAR(20) DEFAULT 'text',
    content TEXT NOT NULL,
    variables JSONB,
    language VARCHAR(5) DEFAULT 'id',
    is_active BOOLEAN DEFAULT true,
    created_by INTEGER REFERENCES admin_users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Message logs
CREATE TABLE whatsapp_messages (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(100),
    message_id VARCHAR(100),
    to_number VARCHAR(20),
    template_id INTEGER REFERENCES whatsapp_templates(id),
    message_type VARCHAR(20),
    content TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    sent_at TIMESTAMP,
    delivered_at TIMESTAMP,
    read_at TIMESTAMP,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES whatsapp_sessions(session_id)
);

-- Queue jobs (for persistence)
CREATE TABLE whatsapp_queue_jobs (
    id SERIAL PRIMARY KEY,
    job_id VARCHAR(100) UNIQUE NOT NULL,
    queue_name VARCHAR(50),
    job_data JSONB,
    priority INTEGER DEFAULT 10,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    status VARCHAR(20) DEFAULT 'pending',
    scheduled_at TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    failed_at TIMESTAMP,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 10. Performance Optimization

### 10.1 Batch Processing
```javascript
class BulkMessageProcessor {
  constructor(whatsappService) {
    this.whatsapp = whatsappService;
    this.batchSize = 50;
    this.batchDelay = 1000; // 1 second between batches
  }

  async processBulk(messages) {
    const batches = this.chunk(messages, this.batchSize);
    const results = [];

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];

      console.log(`Processing batch ${i + 1}/${batches.length} (${batch.length} messages)`);

      // Process batch with concurrency
      const batchPromises = batch.map(msg =>
        this.whatsapp.sendMessage(msg.to, msg.message)
          .then(result => ({ ...msg, status: 'success', result }))
          .catch(error => ({ ...msg, status: 'failed', error: error.message }))
      );

      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults.map(r => r.value));

      // Rate limiting between batches
      if (i < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, this.batchDelay));
      }
    }

    return results;
  }

  chunk(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
```

### 10.2 Connection Health Check
```javascript
class HealthChecker {
  constructor(sessionManager) {
    this.sessionManager = sessionManager;
    this.checkInterval = 30000; // 30 seconds
  }

  start() {
    setInterval(async () => {
      await this.checkAllSessions();
    }, this.checkInterval);
  }

  async checkAllSessions() {
    const sessions = Array.from(this.sessionManager.sessions.values());

    for (const session of sessions) {
      try {
        // Check if session is still responsive
        if (session.status === 'connected') {
          const startTime = Date.now();
          await session.client.fetchStatus('6281234567890@s.whatsapp.net');
          const responseTime = Date.now() - startTime;

          if (responseTime > 5000) {
            console.warn(`Session ${session.sessionId} slow response: ${responseTime}ms`);
          }
        }

        // Check idle sessions
        if (session.lastActivity && session.status === 'connected') {
          const idleTime = Date.now() - session.lastActivity.getTime();
          if (idleTime > 24 * 60 * 60 * 1000) { // 24 hours
            console.warn(`Session ${session.sessionId} idle for ${idleTime}ms`);
          }
        }

      } catch (error) {
        console.error(`Health check failed for session ${session.sessionId}:`, error);
        session.errorCount++;

        if (session.errorCount > 5) {
          await this.sessionManager.reconnectSession(session.sessionId);
        }
      }
    }
  }
}
```

## 11. Security & Privacy

### 11.1 Data Protection
```javascript
class WhatsAppSecurity {
  // Encrypt sensitive data in storage
  static encryptSessionData(sessionData) {
    const cipher = crypto.createCipher('aes-256-cbc', process.env.WA_ENCRYPTION_KEY);
    let encrypted = cipher.update(JSON.stringify(sessionData), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  }

  // Decrypt session data
  static decryptSessionData(encryptedData) {
    const decipher = crypto.createDecipher('aes-256-cbc', process.env.WA_ENCRYPTION_KEY);
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  }

  // Sanitize phone numbers
  static sanitizePhoneNumber(number) {
    // Remove spaces, dashes, parentheses
    number = number.replace(/[\s\-\(\)]/g, '');

    // Add country code if missing
    if (!number.startsWith('+')) {
      if (number.startsWith('0')) {
        number = '+62' + number.substring(1);
      } else if (number.startsWith('62')) {
        number = '+' + number;
      } else {
        number = '+62' + number;
      }
    }

    return number + '@s.whatsapp.net';
  }

  // Validate message content
  static validateMessage(content) {
    const maxLength = 4096;
    if (content.length > maxLength) {
      throw new Error(`Message too long (max ${maxLength} chars)`);
    }

    // Check for spam patterns
    const spamPatterns = [
      /(.)\1{10,}/, // Repeated characters
      /http[s]?:\/\/.+/gi, // URLs (optional)
    ];

    for (const pattern of spamPatterns) {
      if (pattern.test(content)) {
        console.warn('Potential spam detected in message');
      }
    }

    return content;
  }
}
```

## 12. Error Handling & Recovery

### 12.1 Automatic Reconnection
```javascript
class ReconnectionManager {
  constructor(session) {
    this.session = session;
    this.maxReconnectAttempts = 10;
    this.baseDelay = 2000;
    this.maxDelay = 60000;
  }

  async reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`Max reconnection attempts reached for session ${this.session.sessionId}`);
      this.session.status = 'failed';
      return false;
    }

    this.reconnectAttempts++;

    // Exponential backoff with jitter
    const delay = Math.min(
      this.baseDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.maxDelay
    ) + Math.random() * 1000;

    console.log(`Reconnecting session ${this.session.sessionId} in ${delay}ms (attempt ${this.reconnectAttempts})`);

    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      await this.session.initialize();
      this.reconnectAttempts = 0;
      return true;
    } catch (error) {
      console.error(`Reconnection failed: ${error.message}`);
      return await this.reconnect();
    }
  }
}
```

## 13. Data Retention Policy

### 13.1 Cleanup Strategy
```javascript
class WhatsAppDataRetention {
  constructor() {
    this.messageRetentionDays = 15;
    this.logRetentionDays = 30;
    this.sessionRetentionDays = 90;
  }

  async cleanup() {
    const now = new Date();

    // Clean up old messages
    await db.query(`
      DELETE FROM whatsapp_messages
      WHERE created_at < $1
    `, [new Date(now.getTime() - this.messageRetentionDays * 24 * 60 * 60 * 1000)]);

    // Clean up old logs
    await db.query(`
      DELETE FROM whatsapp_queue_jobs
      WHERE created_at < $1 AND status IN ('completed', 'failed')
    `, [new Date(now.getTime() - this.logRetentionDays * 24 * 60 * 60 * 1000)]);

    // Clean up inactive sessions
    await db.query(`
      DELETE FROM whatsapp_sessions
      WHERE status = 'disconnected' AND updated_at < $1
    `, [new Date(now.getTime() - this.sessionRetentionDays * 24 * 60 * 60 * 1000)]);

    console.log('WhatsApp data cleanup completed');
  }
}
```

## 14. Monitoring & Analytics

### 14.1 Metrics Collection
```javascript
class WhatsAppMetrics {
  constructor() {
    this.metrics = {
      messagesSent: 0,
      messagesDelivered: 0,
      messagesRead: 0,
      averageDeliveryTime: 0,
      errors: 0,
      sessions: 0
    };
  }

  async collectMetrics() {
    // Daily metrics
    const today = new Date().toISOString().split('T')[0];

    const stats = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered,
        COUNT(CASE WHEN status = 'read' THEN 1 END) as read,
        AVG(EXTRACT(EPOCH FROM (delivered_at - sent_at))) as avg_delivery_time
      FROM whatsapp_messages
      WHERE DATE(created_at) = $1
    `, [today]);

    this.metrics = {
      date: today,
      messagesSent: stats.rows[0].total || 0,
      messagesDelivered: stats.rows[0].delivered || 0,
      messagesRead: stats.rows[0].read || 0,
      averageDeliveryTime: Math.round(stats.rows[0].avg_delivery_time || 0),
      errors: await this.getErrorCount(today),
      activeSessions: await this.getActiveSessionCount()
    };

    return this.metrics;
  }

  async getActiveSessionCount() {
    const result = await db.query(
      'SELECT COUNT(*) FROM whatsapp_sessions WHERE status = $1',
      ['connected']
    );
    return parseInt(result.rows[0].count);
  }

  async getErrorCount(date) {
    const result = await db.query(
      'SELECT COUNT(*) FROM whatsapp_messages WHERE DATE(created_at) = $1 AND status = $2',
      [date, 'failed']
    );
    return parseInt(result.rows[0].count);
  }
}
```

## 15. Integration with Email (Backup)

### 15.1 Email Fallback System
```javascript
class EmailFallback {
  constructor(emailService) {
    this.email = emailService;
  }

  async sendBackupNotification(to, messageData) {
    if (process.env.ENABLE_EMAIL_FALLBACK !== 'true') {
      return { skipped: 'Email fallback disabled' };
    }

    try {
      await this.email.send({
        to: to.email,
        subject: `[WhatsApp Backup] ${messageData.subject}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>WhatsApp Service Unavailable</h2>
            <p>This message was sent via email due to WhatsApp service issues.</p>
            <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              ${messageData.content}
            </div>
            <p style="color: #666; font-size: 14px;">
              Please contact support if you continue to experience issues.
            </p>
          </div>
        `
      });

      return { success: true, method: 'email' };
    } catch (error) {
      console.error('Email fallback failed:', error);
      return { error: error.message };
    }
  }
}
```

---

*Version: 2.0.0*
*Last Updated: 2025-01-09*
*Status: Ready for Implementation*