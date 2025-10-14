const EventEmitter = require('events');

class WhatsAppBotService extends EventEmitter {
  constructor(whatsappService, databaseService, mikrotikService) {
    super();
    this.whatsappService = whatsappService;
    this.db = databaseService;
    this.mikrotikService = mikrotikService;
    this.isEnabled = true;
    this.botCommand = '/info'; // Command untuk mengecek info

    // Setup event handlers
    this.setupEventHandlers();
  }

  /**
   * Setup event handlers untuk WhatsApp bot
   */
  setupEventHandlers() {
    // Listen untuk incoming messages
    this.whatsappService.on('message', async (message) => {
      if (this.isEnabled) {
        await this.handleIncomingMessage(message);
      }
    });
  }

  /**
   * Handle incoming messages dari WhatsApp
   */
  async handleIncomingMessage(message) {
    try {
      console.log('🔍 WhatsAppBotService: Received message object keys:', Object.keys(message));
      console.log('🔍 WhatsAppBotService: Message key:', JSON.stringify(message.key, null, 2));
      console.log('🔍 WhatsAppBotService: Message content:', JSON.stringify(message.message, null, 2));

      // Extract sender and content from Baileys message structure
      const senderJid = message.key?.remoteJid;
      const messageContent = message.message?.conversation ||
                           message.message?.extendedTextMessage?.text ||
                           message.body?.trim() || '';

      console.log(`🔍 WhatsAppBotService: Sender JID: ${senderJid}, Content: ${messageContent}`);

      if (!senderJid) {
        console.error('🚨 WhatsAppBotService: No sender JID found in message');
        return;
      }

      const fromNumber = this.extractPhoneNumber(senderJid);

      console.log(`🤖 Bot received message from ${fromNumber}: ${messageContent}`);

      // Check apakah pesan adalah command bot
      if (this.isBotCommand(messageContent)) {
        await this.processBotCommand(fromNumber, messageContent, message);
      } else {
        console.log(`🔍 WhatsAppBotService: Message "${messageContent}" is not a bot command`);
      }
    } catch (error) {
      console.error('🚨 WhatsAppBotService: Error handling bot message:', error);
      console.error('🚨 WhatsAppBotService: Message that caused error:', JSON.stringify(message, null, 2));
    }
  }

  /**
   * Extract phone number dari WhatsApp format
   */
  extractPhoneNumber(whatsappNumber) {
    // Add null/undefined checking
    if (!whatsappNumber) {
      console.error('🚨 WhatsAppBotService: whatsappNumber is null or undefined in extractPhoneNumber');
      return 'unknown';
    }

    console.log(`🔍 WhatsAppBotService: Processing whatsappNumber: ${whatsappNumber}`);

    // Remove @c.us suffix and country code if present
    let phoneNumber = whatsappNumber.replace('@c.us', '').replace('@g.us', '');

    console.log(`🔍 WhatsAppBotService: After suffix removal: ${phoneNumber}`);

    // Remove leading '62' (Indonesia country code) if present
    if (phoneNumber.startsWith('62')) {
      phoneNumber = phoneNumber.substring(2);
    }

    // Add leading '0' for standard Indonesian format
    if (phoneNumber.length > 0 && !phoneNumber.startsWith('0')) {
      phoneNumber = '0' + phoneNumber;
    }

    console.log(`🔍 WhatsAppBotService: Final phone number: ${phoneNumber}`);
    return phoneNumber;
  }

  /**
   * Check apakah pesan adalah bot command
   */
  isBotCommand(messageContent) {
    return messageContent.toLowerCase() === this.botCommand.toLowerCase() ||
           messageContent.toLowerCase() === 'info' ||
           messageContent.toLowerCase() === '/info' ||
           messageContent.toLowerCase() === 'cek info' ||
           messageContent.toLowerCase() === 'cek status';
  }

  /**
   * Process bot command dan kirim response
   */
  async processBotCommand(fromNumber, command, originalMessage) {
    try {
      console.log(`🔍 Processing bot command "${command}" from ${fromNumber}`);

      // Cari customer berdasarkan nomor HP
      const customer = await this.findCustomerByPhone(fromNumber);

      if (!customer) {
        await this.sendNotFoundResponse(fromNumber, originalMessage);
        return;
      }

      console.log(`✅ Customer found: ${customer.name} (${customer.phone})`);

      // Dapatkan informasi aktif subscription
      const activeSubscriptions = await this.getActiveSubscriptions(customer.id);

      if (activeSubscriptions.length === 0) {
        await this.sendNoActiveServiceResponse(fromNumber, customer, originalMessage);
        return;
      }

      // Generate response dengan informasi lengkap
      await this.sendCustomerInfoResponse(fromNumber, customer, activeSubscriptions, originalMessage);

    } catch (error) {
      console.error('Error processing bot command:', error);
      await this.sendErrorResponse(fromNumber, originalMessage);
    }
  }

  /**
   * Cari customer berdasarkan nomor HP
   */
  async findCustomerByPhone(phoneNumber) {
    try {
      // Try exact match first
      let query = 'SELECT * FROM customers WHERE phone = $1 LIMIT 1';
      let customer = this.db.get(query, [phoneNumber]);

      // Try with different phone formats
      if (!customer) {
        // Try without leading 0
        if (phoneNumber.startsWith('0')) {
          const withoutZero = phoneNumber.substring(1);
          query = 'SELECT * FROM customers WHERE phone = $1 OR phone = $2 LIMIT 1';
          customer = this.db.get(query, [withoutZero, `62${withoutZero}`]);
        }

        // Try with 62 prefix
        if (!customer && !phoneNumber.startsWith('62')) {
          const with62 = phoneNumber.startsWith('0') ? '62' + phoneNumber.substring(1) : '62' + phoneNumber;
          query = 'SELECT * FROM customers WHERE phone = $1 OR phone = $2 LIMIT 1';
          customer = this.db.get(query, [with62, phoneNumber]);
        }

        // Try with +62 prefix
        if (!customer) {
          const withPlus62 = phoneNumber.startsWith('0') ? '+62' + phoneNumber.substring(1) : '+62' + phoneNumber;
          query = 'SELECT * FROM customers WHERE phone = $1 OR phone = $2 OR phone = $3 LIMIT 1';
          customer = this.db.get(query, [withPlus62, phoneNumber, withPlus62.replace('+', '')]);
        }
      }

      return customer || null;
    } catch (error) {
      console.error('Error finding customer by phone:', error);
      return null;
    }
  }

  /**
   * Dapatkan active subscriptions untuk customer
   */
  async getActiveSubscriptions(customerId) {
    try {
      const query = `
        SELECT s.*,
               p.name as profile_name,
               p.price as profile_price,
               p.validity_period,
               p.service_type,
               u.username,
               u.password,
               u.status as user_status
        FROM subscriptions s
        LEFT JOIN profiles p ON s.profile_id = p.id
        LEFT JOIN (
          SELECT username, password, status, customer_id, profile_id, 'pppoe' as service_type
          FROM pppoe_users WHERE customer_id = $1 AND status = 'active'
          UNION ALL
          SELECT username, password, 'active' as status, customer_id, profile_id, 'hotspot' as service_type
          FROM vouchers WHERE customer_id = $2 AND status = 'active'
        ) u ON u.customer_id = s.customer_id AND u.profile_id = s.profile_id
        WHERE s.customer_id = $3 AND s.status = 'active'
        ORDER BY s.expires_at DESC
      `;

      const subscriptions = this.db.all(query, [customerId, customerId, customerId]);
      return subscriptions || [];
    } catch (error) {
      console.error('Error getting active subscriptions:', error);
      return [];
    }
  }

  /**
   * Get real-time status dari Mikrotik
   */
  async getMikrotikUserStatus(username, serviceType) {
    try {
      if (!this.mikrotikService || !username) {
        return { connected: false, uptime: null };
      }

      let status = { connected: false, uptime: null };

      if (serviceType === 'pppoe') {
        // Check PPPoE active connections
        const activeConnections = await this.mikrotikService.getActivePPPoEUsers();
        const userConnection = activeConnections.find(conn =>
          conn.name === username || conn.user === username
        );

        if (userConnection) {
          status = {
            connected: true,
            uptime: userConnection.uptime || userConnection['uptime'] || null,
            address: userConnection.address || null
          };
        }
      } else if (serviceType === 'hotspot') {
        // Check Hotspot active users
        const activeUsers = await this.mikrotikService.getActiveHotspotUsers();
        const userConnection = activeUsers.find(user =>
          user.user === username || user.name === username
        );

        if (userConnection) {
          status = {
            connected: true,
            uptime: userConnection.uptime || null,
            address: userConnection.address || null,
            macAddress: userConnection['mac-address'] || null
          };
        }
      }

      return status;
    } catch (error) {
      console.error('Error getting Mikrotik user status:', error);
      return { connected: false, uptime: null };
    }
  }

  /**
   * Format uptime dari Mikrotik
   */
  formatUptime(uptime) {
    if (!uptime) return 'Tidak diketahui';

    try {
      // Format dari Mikrotik biasanya: "2w3d4h5m6s" atau "4h5m6s"
      const parts = uptime.match(/(\d+w)?(\d+d)?(\d+h)?(\d+m)?(\d+s)?/);
      if (!parts) return uptime;

      let formatted = '';
      const weeks = parts[1] ? parseInt(parts[1].replace('w', '')) : 0;
      const days = parts[2] ? parseInt(parts[2].replace('d', '')) : 0;
      const hours = parts[3] ? parseInt(parts[3].replace('h', '')) : 0;
      const minutes = parts[4] ? parseInt(parts[4].replace('m', '')) : 0;

      if (weeks > 0) formatted += `${weeks} minggu `;
      if (days > 0) formatted += `${days} hari `;
      if (hours > 0) formatted += `${hours} jam `;
      if (minutes > 0) formatted += `${minutes} menit`;

      return formatted.trim() || 'Baru saja terhubung';
    } catch (error) {
      return uptime;
    }
  }

  /**
   * Format tanggal expired
   */
  formatExpiryDate(expiresAt) {
    if (!expiresAt) return 'Tidak diketahui';

    try {
      const expiryDate = new Date(expiresAt);
      const now = new Date();
      const diffMs = expiryDate - now;
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      const formatted = expiryDate.toLocaleString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      if (diffDays < 0) {
        return `${formatted} (EXPIRED)`;
      } else if (diffDays === 0) {
        return `${formatted} (Hari Ini)`;
      } else if (diffDays <= 7) {
        return `${formatted} (${diffDays} hari lagi)`;
      } else {
        return formatted;
      }
    } catch (error) {
      return 'Format error';
    }
  }

  /**
   * Kirim response untuk customer tidak ditemukan
   */
  async sendNotFoundResponse(toNumber, originalMessage) {
    const response = `🤖 *BOT INFO PELANGGAN*

❌ *Nomor tidak terdaftar*

Maaf, nomor WhatsApp Anda tidak terdaftar dalam sistem kami.

📞 *Hubungi Admin:*
- Untuk pendaftaran pelanggan baru
- Update data nomor WhatsApp
- Bantuan teknis lainnya

Terima kasih 🙏`;

    await this.whatsappService.sendMessage(toNumber, response);
  }

  /**
   * Kirim response untuk tidak ada layanan aktif
   */
  async sendNoActiveServiceResponse(toNumber, customer, originalMessage) {
    const response = `🤖 *BOT INFO PELANGGAN*

👤 *Data Pelanggan*
📛 Nama: ${customer.name}
📱 Telepon: ${customer.phone}

❌ *Tidak Ada Layanan Aktif*

Saat ini Anda tidak memiliki layanan internet aktif (PPPoE/Hotspot).

📞 *Hubungi Admin untuk:*
- Perpanjangan/aktivasi layanan
- Informasi paket yang tersedia
- Bantuan teknis

Terima kasih 🙏`;

    await this.whatsappService.sendMessage(toNumber, response);
  }

  /**
   * Kirim response dengan informasi lengkap customer
   */
  async sendCustomerInfoResponse(toNumber, customer, subscriptions, originalMessage) {
    let response = `🤖 *BOT INFO PELANGGAN*

👤 *Data Pelanggan*
📛 Nama: ${customer.name}
📱 Telepon: ${customer.phone}

📊 *Status Layanan Aktif*
━━━━━━━━━━━━━━━━━━━━`;

    for (let i = 0; i < subscriptions.length; i++) {
      const sub = subscriptions[i];
      const serviceType = sub.service_type === 'pppoe' ? 'PPPoE' : 'HOTSPOT';
      const profileName = sub.profile_name || 'Unknown Profile';

      // Get real-time status dari Mikrotik
      const mikrotikStatus = await this.getMikrotikUserStatus(sub.username, sub.service_type);
      const connectionStatus = mikrotikStatus.connected ? '🟢 Terhubung' : '🔴 Terputus';
      const uptimeInfo = mikrotikStatus.connected ? `\n⏱️ Uptime: ${this.formatUptime(mikrotikStatus.uptime)}` : '';

      response += `\n━━━━━━━━━━━━━━━━━━━━
📋 *Layanan ${i + 1}: ${serviceType}*
👤 Username: ${sub.username || 'N/A'}
🔑 Password: ${sub.password || 'N/A'}
📦 Paket: ${profileName}
💰 Harga: Rp ${this.formatPrice(sub.profile_price || 0)}
🔌 Status: ${connectionStatus}${uptimeInfo}
📅 Expired: ${this.formatExpiryDate(sub.expires_at)}`;
    }

    response += `\n━━━━━━━━━━━━━━━━━━━━
💡 *Catatan:*
- Status koneksi realtime dari Mikrotik
- Refresh status: kirim pesan "/info"
- Bantuan hubungi admin

Terima kasih 🙏`;

    await this.whatsappService.sendMessage(toNumber, response);
  }

  /**
   * Kirim response untuk error
   */
  async sendErrorResponse(toNumber, originalMessage) {
    const response = `🤖 *BOT INFO PELANGGAN*

❌ *Terjadi Kesalahan*

Maaf, sistem sedang mengalami gangguan. Silakan coba lagi beberapa saat atau hubungi admin.

Terima kasih 🙏`;

    await this.whatsappService.sendMessage(toNumber, response);
  }

  /**
   * Format price untuk display
   */
  formatPrice(price) {
    if (!price || price === 0) return '0';
    return parseInt(price).toLocaleString('id-ID');
  }

  /**
   * Enable/Disable bot
   */
  setEnabled(enabled) {
    this.isEnabled = enabled;
    console.log(`🤖 WhatsApp Bot ${enabled ? 'ENABLED' : 'DISABLED'}`);
  }

  /**
   * Get bot status
   */
  getStatus() {
    return {
      enabled: this.isEnabled,
      command: this.botCommand,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Set custom bot command
   */
  setBotCommand(command) {
    this.botCommand = command.startsWith('/') ? command : '/' + command;
    console.log(`🤖 Bot command changed to: ${this.botCommand}`);
  }
}

module.exports = WhatsAppBotService;