# Payment Gateway v2.0 - Plugin-Based Architecture

## 1. Overview

Sistem payment gateway v2.0 menggunakan arsitektur plugin-based untuk memudahkan penambahan metode pembayaran baru tanpa mengubah kode inti sistem. Plugin dapat ditambahkan dengan cara upload file ZIP dan mengaktifkannya melalui checkbox.

## 2. Key Features

### 2.1 Core Features
- **Plugin-Based Architecture**: Modular payment gateway dengan ZIP upload
- **Hot-Swappable**: Plugin dapat diaktifkan/dinonaktifkan tanpa restart
- **CommonJS Support**: Plugin menggunakan format CommonJS untuk kompatibilitas
- **Built-in Plugins**: DuitKu dan Manual/Cash sebagai default
- **Automatic Fee Calculation**: Fee otomatis per metode pembayaran
- **Payment URL Service**: Generate URL pembayaran untuk invoice

### 2.2 Plugin Management
- Upload ZIP file melalui UI
- Validasi otomatis (structure, dependencies)
- Activation checkbox
- Error isolation dengan sandboxing
- Plugin configuration per-instansi

## 3. Architecture

### 3.1 Components
```
src/lib/PaymentPlugin.js      # Base plugin class
src/services/PaymentPluginManager.js  # Plugin manager
src/plugins/payments/        # Plugin directory
│   ├── duitku/             # DuitKu plugin
│   │   ├── index.js
│   │   ├── manifest.json
│   │   └── assets/
│   ├── manual/             # Manual payment plugin
│   │   ├── index.js
│   │   ├── manifest.json
│   │   └── assets/
│   └── [new-plugins]/      # Additional plugins
```

### 3.2 Plugin ZIP Structure
```
payment-plugin.zip
├── index.js              # Main plugin file (CommonJS)
├── manifest.json         # Plugin metadata
├── config.json          # Default configuration
├── README.md            # Plugin documentation
└── assets/              # Frontend assets
    ├── admin.css        # Admin panel styles
    ├── payment.js       # Frontend logic
    ├── logo.png         # Payment method logo
    └── icons/           # Additional icons
```

### 3.3 Plugin Interface
```javascript
// Base plugin interface that all plugins must implement
class PaymentPlugin {
  constructor(config) {
    this.config = config;
  }

  // Required methods
  async createPayment(invoiceData) {
    throw new Error('createPayment method must be implemented');
  }

  async checkStatus(reference) {
    throw new Error('checkStatus method must be implemented');
  }

  async handleCallback(callbackData) {
    throw new Error('handleCallback method must be implemented');
  }

  async getInfo() {
    throw new Error('getInfo method must be implemented');
  }

  // Optional methods
  async refund(reference, amount) {
    throw new Error('Refund not supported');
  }

  async cancel(reference) {
    throw new Error('Cancellation not supported');
  }

  async validate(data) {
    return { valid: true };
  }
}
```

## 4. Plugin Manifest Format

### 4.1 manifest.json Structure
```json
{
  "name": "duitku",
  "version": "1.0.0",
  "displayName": "DuitKu Payment Gateway",
  "description": "Integration with DuitKu payment service",
  "author": "Your Name",
  "website": "https://duitku.com",
  "main": "index.js",
  "category": "ewallet",
  "currencies": ["IDR"],
  "fees": {
    "type": "percentage",
    "value": 0.7,
    "min": 0,
    "max": 5000
  },
  "config": {
    "apiKey": {
      "type": "text",
      "label": "API Key",
      "required": true
    },
    "merchantCode": {
      "type": "text",
      "label": "Merchant Code",
      "required": true
    },
    "sandbox": {
      "type": "checkbox",
      "label": "Sandbox Mode",
      "default": false
    }
  },
  "webhooks": {
    "payment": "/api/payments/webhook/duitku",
    "status": "/api/payments/status/duitku"
  },
  "permissions": [
    "payment.create",
    "payment.check",
    "payment.callback"
  ],
  "dependencies": [],
  "nodeVersion": ">=14.0.0"
}
```

## 5. Plugin Manager Implementation

### 5.1 Plugin Loading
```javascript
class PaymentPluginManager {
  constructor(pluginDirectory) {
    this.pluginDirectory = pluginDirectory;
    this.plugins = new Map();
    this.activePlugins = new Map();
  }

  async loadPlugins() {
    const pluginDirs = await fs.readdir(this.pluginDirectory);

    for (const dir of pluginDirs) {
      try {
        const plugin = await this.loadPlugin(dir);
        this.plugins.set(plugin.name, plugin);

        // Check if plugin is active in database
        const isActive = await this.isPluginActive(plugin.name);
        if (isActive) {
          await this.activatePlugin(plugin.name);
        }
      } catch (error) {
        console.error(`Failed to load plugin ${dir}:`, error);
      }
    }
  }

  async loadPlugin(pluginName) {
    const pluginPath = path.join(this.pluginDirectory, pluginName);

    // Read manifest
    const manifestPath = path.join(pluginPath, 'manifest.json');
    const manifest = JSON.parse(await fs.readFile(manifestPath));

    // Load plugin module
    const pluginModule = require(path.join(pluginPath, manifest.main));

    // Get plugin configuration from database
    const config = await this.getPluginConfig(pluginName);

    // Create plugin instance
    const PluginClass = pluginModule.default || pluginModule;
    const plugin = new PluginClass(config);

    // Attach manifest
    plugin.manifest = manifest;
    plugin.name = manifest.name;

    return plugin;
  }
}
```

### 5.2 Plugin Upload & Installation
```javascript
async function installPlugin(zipFile, adminId) {
  const tempDir = path.join(os.tmpdir(), `plugin-${Date.now()}`);

  try {
    // 1. Extract ZIP
    await extractZip(zipFile, tempDir);

    // 2. Validate structure
    await validatePluginStructure(tempDir);

    // 3. Read manifest
    const manifest = JSON.parse(
      await fs.readFile(path.join(tempDir, 'manifest.json'))
    );

    // 4. Validate manifest
    await validateManifest(manifest);

    // 5. Check for conflicts
    if (await this.plugins.has(manifest.name)) {
      throw new Error(`Plugin ${manifest.name} already exists`);
    }

    // 6. Move to plugins directory
    const pluginDir = path.join(this.pluginDirectory, manifest.name);
    await fs.move(tempDir, pluginDir);

    // 7. Save to database
    await this.savePluginToDatabase({
      name: manifest.name,
      version: manifest.version,
      status: 'installed',
      installed_by: adminId,
      installed_at: new Date()
    });

    // 8. Load plugin
    const plugin = await this.loadPlugin(manifest.name);
    this.plugins.set(manifest.name, plugin);

    return {
      success: true,
      plugin: manifest.name,
      needsConfiguration: this.needsConfiguration(plugin)
    };

  } catch (error) {
    // Cleanup on failure
    await fs.remove(tempDir);
    throw error;
  }
}
```

## 6. Built-in Plugins

### 6.1 DuitKu Plugin
```javascript
// src/plugins/payments/duitku/index.js
class DuitKuPlugin extends PaymentPlugin {
  constructor(config) {
    super(config);
    this.apiKey = config.apiKey;
    this.merchantCode = config.merchantCode;
    this.sandbox = config.sandbox;
    this.baseUrl = this.sandbox
      ? 'https://sandbox.duitku.com/api/v2'
      : 'https://passport.duitku.com/api/v2';
  }

  async createPayment(invoiceData) {
    const payload = {
      merchantCode: this.merchantCode,
      paymentAmount: invoiceData.amount,
      email: invoiceData.customer.email,
      phoneNumber: invoiceData.customer.phone,
      productDetails: invoiceData.description,
      returnUrl: invoiceData.returnUrl,
      callbackUrl: invoiceData.callbackUrl,
      expiryPeriod: 24,
      orderId: invoiceData.invoiceNumber
    };

    const response = await axios.post(
      `${this.baseUrl}/payment/request`,
      payload,
      {
        headers: {
          'Authorization': this.apiKey,
          'Content-Type': 'application/json'
        }
      }
    );

    return {
      reference: response.data.reference,
      paymentUrl: response.data.paymentUrl,
      qrCode: response.data.qrCode,
      expiryTime: response.data.expiryTime
    };
  }

  async checkStatus(reference) {
    const response = await axios.post(
      `${this.baseUrl}/transaction/status`,
      {
        merchantCode: this.merchantCode,
        reference
      },
      {
        headers: {
          'Authorization': this.apiKey
        }
      }
    );

    return {
      status: response.data.statusCode === '00' ? 'success' : 'pending',
      paidAmount: response.data.amount,
      paymentDate: response.data.transactionDate
    };
  }

  async handleCallback(callbackData) {
    // Verify signature
    const signature = this.generateSignature(callbackData);
    if (signature !== callbackData.signature) {
      throw new Error('Invalid signature');
    }

    return {
      reference: callbackData.reference,
      status: callbackData.statusCode === '00' ? 'success' : 'failed',
      paymentMethod: callbackData.paymentMethod,
      amount: callbackData.amount
    };
  }
}

module.exports = DuitKuPlugin;
```

### 6.2 Manual/Cash Plugin
```javascript
// src/plugins/payments/manual/index.js
class ManualPaymentPlugin extends PaymentPlugin {
  constructor(config) {
    super(config);
    this.receiptNumberPrefix = config.receiptPrefix || 'RCPT';
  }

  async createPayment(invoiceData) {
    const receiptNumber = await this.generateReceiptNumber();

    return {
      reference: receiptNumber,
      paymentUrl: `${process.env.BASE_URL}/payments/manual/${receiptNumber}`,
      instructions: {
        title: 'Pembayaran Manual',
        description: 'Silakan lakukan pembayaran melalui:',
        methods: [
          'Tunai di kasir',
          'Transfer Bank',
          'E-Wallet (screenshoot bukti)'
        ],
        note: invoiceData.notes || ''
      }
    };
  }

  async checkStatus(reference) {
    const payment = await db.query(
      'SELECT * FROM payments WHERE reference = ?',
      [reference]
    );

    return {
      status: payment.rows[0]?.status || 'pending',
      confirmedBy: payment.rows[0]?.confirmed_by,
      confirmedAt: payment.rows[0]?.confirmed_at
    };
  }

  async handleCallback(callbackData) {
    // Manual confirmation by admin
    const { reference, adminId, notes } = callbackData;

    await db.query(`
      UPDATE payments
      SET status = 'confirmed',
          confirmed_by = ?,
          confirmed_at = NOW(),
          notes = ?
      WHERE reference = ?
    `, [adminId, notes, reference]);

    return {
      reference,
      status: 'success',
      confirmedBy: adminId
    };
  }

  async generateReceiptNumber() {
    const prefix = this.receiptNumberPrefix;
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    const result = await db.query(
      `SELECT COUNT(*) as count
       FROM payments
       WHERE reference LIKE '${prefix}${date}%'`
    );

    const sequence = (result.rows[0].count || 0) + 1;
    return `${prefix}${date}${sequence.toString().padStart(4, '0')}`;
  }
}

module.exports = ManualPaymentPlugin;
```

## 7. Payment URL Service

### 7.1 URL Generation
```javascript
class PaymentUrlService {
  constructor(pluginManager) {
    this.pluginManager = pluginManager;
  }

  async generatePaymentUrl(invoiceId, customerId) {
    // 1. Get invoice details
    const invoice = await this.getInvoice(invoiceId);

    // 2. Get available payment methods
    const activePlugins = await this.pluginManager.getActivePlugins();

    // 3. Generate payment URL
    const paymentToken = jwt.sign(
      {
        invoiceId,
        customerId,
        amount: invoice.total_amount,
        expiry: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
      },
      process.env.PAYMENT_URL_SECRET,
      { expiresIn: '24h' }
    );

    return {
      paymentUrl: `${process.env.BASE_URL}/pay/${paymentToken}`,
      invoiceNumber: invoice.invoice_number,
      amount: invoice.total_amount,
      expiryTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
      paymentMethods: activePlugins.map(p => ({
        id: p.name,
        name: p.manifest.displayName,
        logo: `/plugins/${p.name}/assets/logo.png`,
        fees: p.manifest.fees
      }))
    };
  }
}
```

## 8. Security Considerations

### 8.1 Plugin Sandboxing
```javascript
class PluginSandbox {
  static async execute(plugin, method, ...args) {
    try {
      // Execute plugin method in try-catch
      const result = await plugin[method](...args);

      // Sanitize result
      return this.sanitizeResult(result);

    } catch (error) {
      // Log error without exposing sensitive info
      console.error(`Plugin ${plugin.name} error in ${method}:`, error.message);

      // Return safe error response
      return {
        success: false,
        error: 'Payment processing error',
        code: 'PLUGIN_ERROR'
      };
    }
  }

  static sanitizeResult(result) {
    // Remove sensitive data from plugin response
    const sanitized = { ...result };
    delete sanitized.apiKey;
    delete sanitized.secret;
    delete sanitized.privateKey;
    return sanitized;
  }
}
```

### 8.2 File Upload Validation
```javascript
async function validatePluginUpload(zipFile) {
  // 1. Check file size (max 10MB)
  const stats = await fs.stat(zipFile.path);
  if (stats.size > 10 * 1024 * 1024) {
    throw new Error('Plugin file too large (max 10MB)');
  }

  // 2. Check file type
  if (!zipFile.mimetype === 'application/zip') {
    throw new Error('Only ZIP files are allowed');
  }

  // 3. Extract and validate
  const tempDir = path.join(os.tmpdir(), `validate-${Date.now()}`);
  await extractZip(zipFile.path, tempDir);

  // Check required files
  const requiredFiles = ['index.js', 'manifest.json'];
  for (const file of requiredFiles) {
    if (!await fs.pathExists(path.join(tempDir, file))) {
      await fs.remove(tempDir);
      throw new Error(`Missing required file: ${file}`);
    }
  }

  // Validate manifest structure
  const manifest = JSON.parse(
    await fs.readFile(path.join(tempDir, 'manifest.json'))
  );

  if (!manifest.name || !manifest.version || !manifest.main) {
    await fs.remove(tempDir);
    throw new Error('Invalid manifest format');
  }

  await fs.remove(tempDir);
  return true;
}
```

## 9. Error Handling

### 9.1 Plugin Error Recovery
```javascript
class PluginErrorHandler {
  async handlePluginError(pluginName, error, context) {
    // 1. Log detailed error
    await this.logError({
      plugin: pluginName,
      error: error.message,
      stack: error.stack,
      context,
      timestamp: new Date()
    });

    // 2. Check if plugin should be disabled
    const errorCount = await this.getErrorCount(pluginName, '1h');
    if (errorCount > 10) {
      await this.disablePlugin(pluginName);
      await this.notifyAdmin({
        type: 'plugin_disabled',
        plugin: pluginName,
        reason: 'Too many errors'
      });
    }

    // 3. Return fallback response
    return {
      success: false,
      error: 'Payment service temporarily unavailable',
      fallbackMethod: 'manual'
    };
  }
}
```

## 10. API Endpoints

### 10.1 Plugin Management
```javascript
// Upload new plugin
POST /api/admin/plugins/upload
Content-Type: multipart/form-data
{
  file: [ZIP file]
}

// Activate/deactivate plugin
POST /api/admin/plugins/:name/toggle
{
  active: true/false
}

// Get plugin configuration
GET /api/admin/plugins/:name/config

// Update plugin configuration
PUT /api/admin/plugins/:name/config
{
  apiKey: "new-value",
  sandbox: true
}
```

### 10.2 Payment Processing
```javascript
// Create payment with specific method
POST /api/payments/create
{
  invoiceId: "INV-2025-001",
  method: "duitku",
  customerInfo: {
    name: "John Doe",
    email: "john@example.com",
    phone: "+62812345678"
  }
}

// Check payment status
GET /api/payments/:reference/status

// Handle webhook callback
POST /api/payments/webhook/:pluginName
{
  reference: "REF123",
  status: "success",
  signature: "abc123"
}
```

## 11. Database Schema

### 11.1 Tables
```sql
-- Payment plugins
CREATE TABLE payment_plugins (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    version VARCHAR(20) NOT NULL,
    status VARCHAR(20) DEFAULT 'installed',
    config JSONB,
    installed_by INTEGER REFERENCES admin_users(id),
    installed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payment methods (active plugins)
CREATE TABLE payment_methods (
    id SERIAL PRIMARY KEY,
    plugin_name VARCHAR(100) NOT NULL,
    display_name VARCHAR(200) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    fees JSONB,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (plugin_name) REFERENCES payment_plugins(name)
);

-- Plugin configurations
CREATE TABLE plugin_configurations (
    id SERIAL PRIMARY KEY,
    plugin_name VARCHAR(100) NOT NULL,
    config_key VARCHAR(100) NOT NULL,
    config_value TEXT,
    is_encrypted BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (plugin_name) REFERENCES payment_plugins(name),
    UNIQUE(plugin_name, config_key)
);

-- Plugin error logs
CREATE TABLE plugin_error_logs (
    id SERIAL PRIMARY KEY,
    plugin_name VARCHAR(100) NOT NULL,
    error_type VARCHAR(100),
    error_message TEXT,
    error_stack TEXT,
    context JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (plugin_name) REFERENCES payment_plugins(name)
);
```

## 12. Testing Strategy

### 12.1 Plugin Testing
```javascript
// Plugin test suite
class PluginTestSuite {
  async testPlugin(pluginName) {
    const plugin = await this.loadPlugin(pluginName);
    const testData = this.generateTestData();

    const tests = [
      { name: 'createPayment', test: () => plugin.createPayment(testData.invoice) },
      { name: 'checkStatus', test: () => plugin.checkStatus(testData.reference) },
      { name: 'validate', test: () => plugin.validate(testData.validation) }
    ];

    const results = [];
    for (const test of tests) {
      try {
        const result = await test.test();
        results.push({ name: test.name, status: 'pass', result });
      } catch (error) {
        results.push({ name: test.name, status: 'fail', error: error.message });
      }
    }

    return results;
  }
}
```

## 13. Migration Path

### 13.1 From v1.0 to v2.0
1. Existing payment methods will be converted to plugins
2. Manual payment becomes default plugin
3. DuitKu integration moved to plugin
4. Database migration for plugin tables
5. Configuration migration to plugin format

---

*Version: 2.0.0*
*Last Updated: 2025-01-09*
*Status: Ready for Implementation*