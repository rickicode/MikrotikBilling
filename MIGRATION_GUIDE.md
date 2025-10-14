# Database Migration Guide

This project uses PostgreSQL with a custom migration system. All database changes must be done through migration files.

## Migration Commands

```bash
# Run pending migrations
npm run migrate

# Drop all tables and re-run all migrations (development only)
npm run migrate:fresh

# Drop everything including migrations
npm run migrate:reset

# Check migration status
npm run migrate:status
```

## Creating New Migrations

1. Create a new SQL file in `src/database/migrations/` with the format `XXX_migration_name.sql`
   - `XXX` should be the next sequential number (e.g., 006, 007)
   - Use descriptive names (e.g., `006_add_user_preferences.sql`)

2. SQL file format:
   ```sql
   -- Migration 006: Add User Preferences
   -- Description of what this migration does

   -- Your SQL commands here
   ALTER TABLE users ADD COLUMN preferences JSONB DEFAULT '{}';

   -- Add indexes if needed
   CREATE INDEX IF NOT EXISTS idx_users_preferences ON users USING GIN(preferences);
   ```

## Migration Rules

1. **NEVER** modify existing migration files after they've been committed
2. **ALWAYS** use `IF NOT EXISTS` for CREATE statements
3. **NEVER** include INSERT INTO migrations statements - the system handles this automatically
4. **DO NOT** use VACUUM inside transactions - add it as a comment if needed
5. **USE** `ON CONFLICT (key) DO UPDATE` for idempotent INSERT operations

## Example Migration

```sql
-- Migration 006: Add User Preferences
-- Adds user preferences table and updates users table

-- Create new table
CREATE TABLE IF NOT EXISTS user_preferences (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES admin_users(id) ON DELETE CASCADE,
    theme VARCHAR(20) DEFAULT 'light',
    language VARCHAR(10) DEFAULT 'en',
    notifications JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add column to existing table
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS preference_id INTEGER REFERENCES user_preferences(id);

-- Add index
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);
```

## Migration Files

### Current Migrations:
1. `001_initial_schema.sql` - Creates the initial database schema with all core tables
2. `002_add_default_data.sql` - Inserts default settings and admin user

## Database Schema

The system maintains these essential tables:

### Core Tables
- `customers` - Customer data
- `subscriptions` - Subscription data
- `vouchers` - Voucher data
- `pppoe_users` - PPPoE user data
- `profiles` - Profile data
- `payments` - Payment data
- `settings` - System settings
- `admin_users` - Admin accounts
- `user_sessions` - Login sessions
- `vendors` - Vendor data

### Communication Tables
- `notification_queue` - Notification queue
- `whatsapp_sessions` - WhatsApp sessions
- `whatsapp_messages` - WhatsApp messages
- `whatsapp_templates` - WhatsApp templates

### Logging Tables
- `user_activity_logs` - User activity tracking
- `error_logs` - Error logging

### System Tables
- `migrations` - Migration tracking

## Troubleshooting

### Migration Error: "duplicate key value violates unique constraint"
This means the migration was already executed. Check the migration status:
```bash
npm run migrate:status
```

### Migration Error: "VACUUM cannot run inside a transaction block"
Remove VACUUM from your migration file or move it to run after all migrations complete.

### Migration Error: "relation does not exist"
Check if your migration depends on a table created in a previous migration. The migrations run in numerical order.

### Reset Database (Development Only)
```bash
npm run migrate:fresh
```

This will delete ALL data and recreate the database from scratch.