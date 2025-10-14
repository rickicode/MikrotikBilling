# PostgreSQL Migration Guide

## Overview
The Mikrotik Billing System has been migrated from SQLite to PostgreSQL for better performance, reliability, and scalability.

## Changes Made

### 1. Database Infrastructure
- **New Files Created:**
  - `src/database/DatabasePostgreSQL.js` - PostgreSQL database manager
  - `src/database/migrator.js` - Database migration system
  - `src/lib/query.js` - PostgreSQL query builder
  - `src/database/migrations/001_initial_schema.sql` - Initial schema

- **Updated Files:**
  - `server.js` - Updated to use PostgreSQL database class
  - `.env.example` - Updated with PostgreSQL configuration

### 2. Database Schema
The PostgreSQL schema includes:
- All original tables from SQLite
- Enhanced data types using PostgreSQL enums
- Proper indexes for performance optimization
- Triggers for automatic timestamp updates
- JSONB support for flexible data storage

### 3. Migration System
- Automatic migration on application start
- Migration tracking with checksums
- Rollback capability
- Locking mechanism to prevent concurrent migrations

## Setup Instructions

### 1. Install PostgreSQL
```bash
# Ubuntu/Debian
sudo apt update && sudo apt install postgresql postgresql-contrib

# CentOS/RHEL
sudo yum install postgresql-server postgresql-contrib

# macOS
brew install postgresql
```

### 2. Start PostgreSQL Service
```bash
# Ubuntu/Debian/CentOS/RHEL
sudo systemctl start postgresql
sudo systemctl enable postgresql  # Optional: start on boot

# macOS
brew services start postgresql
```

### 3. Setup Database
Run the provided setup script:
```bash
./scripts/setup-postgresql.sh
```

Or manually:
```bash
# Create database
sudo -u postgres createdb mikrotik_billing

# Set password for postgres user
sudo -u postgres psql
> ALTER USER postgres PASSWORD 'your_password';
> \q
```

### 4. Configure Environment
Update your `.env` file:
```env
# Database Configuration (PostgreSQL)
DATABASE_URL=postgresql://postgres:password@localhost:5432/mikrotik_billing
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mikrotik_billing
DB_USER=postgres
DB_PASSWORD=password
```

### 5. Test Connection
```bash
node scripts/test-postgresql.js
```

### 6. Start Application
```bash
npm run dev
```

## Migration Features

### Automatic Migrations
- Migrations run automatically on application start
- Each migration is tracked to prevent re-execution
- Checksums ensure migrations haven't been modified

### Query Builder
The new query builder provides a simplified interface:
```javascript
// Example usage
const query = new Query(pool);
const users = await query.getMany('SELECT * FROM customers');
const customer = await query.getOne('SELECT * FROM customers WHERE id = $1', [1]);
const id = await query.insert('customers', { name: 'John Doe', email: 'john@example.com' });
```

### Connection Pooling
- Default pool size: 20 connections
- Automatic connection management
- Query timeout: 2 seconds
- Idle timeout: 30 seconds

## Troubleshooting

### Connection Refused
- Ensure PostgreSQL service is running
- Check if port 5432 is accessible
- Verify firewall settings

### Authentication Failed
- Check username and password in .env
- Ensure PostgreSQL user has correct privileges
- Verify pg_hba.conf configuration

### Database Doesn't Exist
- Create the database manually
- Check spelling in configuration
- Ensure user has CREATE DATABASE privilege

## Performance Improvements

### Indexes
Added indexes on frequently queried columns:
- vouchers.status, vouchers.expires_at
- pppoe_users.status, pppoe_users.expires_at
- payments.status, payments.payment_date
- notification_queue.status, notification_queue.scheduled_at
- All timestamp columns for logs

### Data Types
- PostgreSQL enums for constrained values
- JSONB for flexible JSON storage with indexing
- INET for IP addresses
- Proper timestamp handling

## Backward Compatibility

The system maintains backward compatibility through:
- Legacy methods in DatabasePostgreSQL.js
- Same query interface as SQLite
- Automatic schema migrations
- Graceful error handling

## Security Considerations

- Always use strong passwords
- Restrict PostgreSQL network access
- Use SSL connections in production
- Regular security updates
- Proper user privileges

## Backup and Restore

### Backup
```bash
pg_dump -h localhost -U postgres -d mikrotik_billing > backup.sql
```

### Restore
```bash
psql -h localhost -U postgres -d mikrotik_billing < backup.sql
```

## Monitoring

The system includes monitoring for:
- Connection pool status
- Query performance
- Database size
- Active connections

Access monitoring at: `/monitoring`