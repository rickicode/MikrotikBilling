# Migration Execution Guide
## PostgreSQL Database Setup for Mikrotik Billing System

**Created:** 2025-10-18  
**Purpose:** Step-by-step migration execution guide

---

## 🚀 QUICK START

### 1. Prerequisites
```bash
# Ensure PostgreSQL is running
sudo systemctl status postgresql

# Check database connection
psql -h localhost -U postgres -d mikrotik_billing -c "SELECT version();"
```

### 2. Run All Migrations
```bash
# Execute all migrations in order
npm run migrate

# Check migration status
npm run migrate:status
```

### 3. Validate Migration Success
```bash
# Run validation script
node scripts/validate-migrations.js

# Run database tests
npm run test:db
```

---

## 📋 MIGRATION FILES EXECUTION ORDER

### Phase 1: Core Schema
```bash
# 001_initial_schema.sql - Creates all base tables
# 002_seed_data.sql - Inserts initial system data
```

### Phase 2: System Fixes
```bash
# 003_fix_missing_tables.sql - Adds logging tables
# 004_add_mikrotik_password_setting.sql - Adds missing setting
```

### Phase 3: Security & Performance (NEW)
```bash
# 005_security_improvements.sql - Security constraints
# 006_performance_optimization.sql - Performance indexes
```

---

## 🔧 DETAILED EXECUTION

### Fresh Installation
```bash
# Complete fresh setup
npm run migrate:fresh

# This will:
# 1. Drop all existing tables
# 2. Reset migrations
# 3. Run all migrations from scratch
# 4. Insert seed data
```

### Reset Database
```bash
# Complete database reset
npm run migrate:reset

# This will:
# 1. Drop everything including migrations
# 2. Recreate migrations table
# 3. Start fresh
```

### Update Existing Installation
```bash
# Just run pending migrations
npm run migrate

# This will:
# 1. Check for existing migrations
# 2. Run only new migrations
# 3. Preserve existing data
```

---

## ✅ VALIDATION CHECKLIST

### After Migration Success:
```bash
# Verify table count (should be 32+ tables)
psql -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"

# Verify index count (should be 70+ indexes)
psql -c "SELECT count(*) FROM pg_indexes WHERE schemaname = 'public';"

# Verify constraints
psql -c "SELECT count(*) FROM information_schema.check_constraints WHERE constraint_schema = 'public';"

# Check key tables exist
psql -c "\dt customers vouchers pppoe_users payments admin_users subscriptions locations"
```

### Test Business Logic:
```bash
# Test customer creation
node -e "
const { Client } = require('pg');
const client = new Client({connectionString: process.env.DATABASE_URL});
client.connect();
client.query('INSERT INTO customers (name, phone) VALUES (\\\"Test Customer\\\", \\\"+628123456789\\\") RETURNING id;')
.then(result => console.log('✅ Customer created:', result.rows[0].id))
.catch(console.error)
.finally(() => client.end());
"

# Test voucher creation (requires profile data)
# Test payment processing
# Test WhatsApp session creation
```

---

## 🚨 TROUBLESHOOTING

### Common Issues:

**Migration Fails with Permission Error**
```bash
# Ensure database user has proper permissions
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE mikrotik_billing TO mikrotik_user;"
psql -U postgres -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mikrotik_user;"
psql -U postgres -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO mikrotik_user;"
```

**Migration Fails with Constraint Error**
```bash
# Check for existing data conflicts
psql -c "SELECT * FROM customers WHERE phone IS NULL OR phone = '';"
psql -c "SELECT * FROM admin_users WHERE LENGTH(password_hash) < 60;"

# Clean up invalid data
psql -c "DELETE FROM customers WHERE phone IS NULL OR phone = '';"
```

**Performance Issues After Migration**
```bash
# Update table statistics
psql -c "ANALYZE;"

# Rebuild indexes if needed
psql -c "REINDEX DATABASE mikrotik_billing;"
```

**Migration Rollback**
```bash
# If migration fails, rollback with:
npm run migrate:reset
# Then re-run migrations
npm run migrate
```

---

## 📊 POST-MIGRATION VERIFICATION

### Database Health Check:
```bash
# Check database size
psql -c "SELECT pg_size_pretty(pg_database_size('mikrotik_billing'));"

# Check table sizes
psql -c "SELECT schemaname,tablename,pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) FROM pg_tables WHERE schemaname = 'public' ORDER BY pg_total_relation_size DESC LIMIT 10;"

# Check index usage
psql -c "SELECT schemaname,tablename,attname,n_distinct,correlation FROM pg_stats WHERE schemaname = 'public' ORDER BY tablename,attname;"
```

### Business Logic Verification:
```bash
# Verify default admin user exists
psql -c "SELECT username, email, role FROM admin_users WHERE username = 'admin';"

# Verify default settings exist
psql -c "SELECT key, value FROM settings WHERE category = 'general' LIMIT 5;"

# Verify payment methods exist
psql -c "SELECT name, display_name, type FROM payment_methods;"

# Verify WhatsApp templates exist
psql -c "SELECT name, category FROM whatsapp_templates LIMIT 5;"
```

---

## 🔄 MAINTENANCE

### Regular Maintenance Tasks:
```bash
# Update statistics (weekly)
psql -c "ANALYZE;"

# Check for bloat (monthly)
psql -c "SELECT schemaname,tablename,pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) AS bloat FROM pg_tables WHERE schemaname = 'public' ORDER BY bloat DESC;"

# Vacuum analyze (monthly)
psql -c "VACUUM ANALYZE;"
```

### Backup After Migration:
```bash
# Create backup
pg_dump -h localhost -U postgres mikrotik_billing > backup-after-migration.sql

# Compress backup
gzip backup-after-migration.sql

# Verify backup
gunzip -t backup-after-migration.sql.gz
```

---

## 📞 SUPPORT

If you encounter issues during migration:

1. **Check logs**: `npm run migrate` shows detailed error messages
2. **Run validation**: `node scripts/validate-migrations.js`
3. **Check database**: Verify PostgreSQL is running and accessible
4. **Review permissions**: Ensure database user has proper privileges
5. **Test connection**: `npm run test:db`

**Migration validation completed by:** @database-admin  
**Last updated:** 2025-10-18
