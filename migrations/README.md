# Database Migration System

## Overview

Sistem migrasi database Mikrotik Billing System menggunakan PostgreSQL dengan manajemen versi terpusat.

## Migration Files

### 001_initial_schema.sql
File utama yang mengandung semua tabel yang diperlukan untuk sistem:
- Core admin tables (admin_users, activity_logs, settings)
- Customer management (customers, transaction_logs)
- Mikrotik integration (profiles, vouchers, pppoe_users)
- Payment system (payments, payment_methods, payment_links)
- WhatsApp integration (whatsapp_sessions, whatsapp_templates, whatsapp_messages)
- Plugin system (payment_plugins, plugin_configurations, plugin_error_logs)
- Multi-location support (locations, location_users)
- Backup system (backups, backup_schedules)
- Notification system (notification_queue)

### 002_seed_data.sql
Data awal yang diperlukan untuk sistem:
- Default system settings
- Default admin user (username: admin, password: admin123)
- Default payment methods (cash, transfer, duitku)
- Default WhatsApp templates
- Default backup schedules
- Default location (Main Office)

## Usage

### Run Migration
```bash
npm run migrate
# atau
node scripts/migrate.js
```

### Fresh Migration (Hapus semua data dan restart)
```bash
npm run migrate:fresh
# atau
node scripts/migrate.js fresh
```

### Reset Database (Hapus termasuk migrasi)
```bash
npm run migrate:reset
# atau
node scripts/migrate.js reset
```

### Check Migration Status
```bash
npm run migrate:status
# atau
node scripts/migrate.js status
```

## Features

- **Version Control**: Setiap migrasi memiliki nomor versi unik
- **Rollback Support**: Dapat reset ke keadaan awal
- **Transaction Safety**: Setiap file migrasi dijalankan dalam transaction
- **Error Handling**: Informasi error yang detail
- **Progress Tracking**: Status migrasi yang jelas
- **Automatic Indexes**: Indeks untuk performa optimal
- **Data Types**: Tipe data PostgreSQL yang sesuai (ENUM, JSONB, etc.)
- **Triggers**: Automatic updated_at triggers

## Database Structure

Total: 32 tables dengan 70+ indexes untuk performa optimal.

### Main Categories:
1. **Authentication & Authorization** (3 tables)
2. **Customer Management** (2 tables)
3. **Mikrotik Integration** (3 tables)
4. **Payment System** (3 tables)
5. **WhatsApp Integration** (3 tables)
6. **Plugin System** (3 tables)
7. **Multi-Location Support** (2 tables)
8. **Backup System** (2 tables)
9. **Notification System** (1 table)
10. **System Logs** (1 table)

## Security Features

- Password hashing dengan bcrypt
- Input validation dengan CHECK constraints
- Foreign key constraints untuk data integrity
- Unique constraints untuk preventing duplicates
- Role-based access control

## Performance Features

- 70+ indexes untuk query optimal
- Proper data types untuk storage efficiency
- JSONB untuk flexible configuration
- Triggers untuk automatic timestamp updates
- Connection pooling support

## Notes

- Database: PostgreSQL 14+
- Extensions: uuid-ossp
- Default charset: UTF-8
- Timezone: Asia/Jakarta (configurable)

## Maintenance

Migration files menggunakan nomor urut (001, 002, etc.) untuk maintain order.
Jangan mengubah file migrasi yang sudah di-commit ke production.
Untuk perubahan, buat file migrasi baru dengan nomor berikutnya.