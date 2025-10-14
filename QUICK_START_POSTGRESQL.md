# Quick Start Guide - PostgreSQL Version

## Prerequisites

1. **Node.js** (v18 or higher)
   ```bash
   node --version
   ```

2. **PostgreSQL** (v12 or higher)
   ```bash
   psql --version
   ```

## Installation & Setup

### 1. Clone or Extract the Project
   ```bash
   cd MikrotikBilling
   ```

### 2. Install Dependencies
   ```bash
   npm install
   ```

### 3. Setup Environment Variables
   ```bash
   cp .env.postgresql .env
   ```

   Edit `.env` file with your PostgreSQL settings:
   ```bash
   nano .env
   ```

   Update these values:
   - `DB_PASSWORD`: Your PostgreSQL password
   - `SESSION_SECRET`: Random secret key
   - `JWT_SECRET`: Random JWT secret
   - Mikrotik settings if needed

### 4. Create Database
   ```bash
   # Create database in PostgreSQL
   createdb mikrotik_billing

   # Or with specific user
   createdb -U postgres mikrotik_billing
   ```

### 5. Run Setup (Tables & Seed Data)
   ```bash
   npm run setup
   ```

   This will:
   - Create all necessary tables
   - Create default admin user (admin/admin123)
   - Insert default settings
   - Create sample profiles

### 6. Start the Application
   ```bash
   # For development
   npm run dev

   # For production
   npm start
   ```

### 7. Access the Application
   - URL: http://localhost:3000
   - Login: `admin` / `admin123`

## Database Management

### Run Migrations
   ```bash
   npm run migrate
   ```

### Create New Migration
   ```bash
   npm run migrate:make create_new_table
   ```

### Rollback Migration
   ```bash
   npm run migrate:rollback
   ```

## Testing

### Test Database Connection
   ```bash
   npm run test:db
   ```

### Run E2E Tests
   ```bash
   # First start the app
   npm run dev

   # Then run tests (in another terminal)
   npm run test:e2e
   ```

## Common Issues

### "PostgreSQL is not running"
   - macOS: `brew services start postgresql`
   - Ubuntu: `sudo systemctl start postgresql`
   - Windows: Start PostgreSQL service from Services

### "Database does not exist"
   ```bash
   createdb mikrotik_billing
   ```

### "Connection refused"
   - Check PostgreSQL is running
   - Verify DB_HOST and DB_PORT in .env
   - Check firewall settings

### "Authentication failed"
   - Verify DB_USER and DB_PASSWORD in .env
   - Check PostgreSQL user permissions

## Project Structure

```
MikrotikBilling/
├── src/
│   ├── database/
│   │   └── DatabaseManager.js    # PostgreSQL connection manager
│   ├── models/                   # Data models
│   ├── routes/                   # API routes
│   ├── services/                 # Business logic
│   └── middleware/               # Middleware functions
├── config/
│   └── knexfile.js               # Knex configuration
├── migrations/                   # Database migrations
├── scripts/
│   ├── setup-postgresql.js       # Database setup script
│   └── test-postgresql.js        # Database test script
├── tests/
│   └── postgresql-integration.spec.js  # E2E tests
└── .env                          # Environment variables
```

## Default Credentials

- **Admin Panel**: admin / admin123
- **Database**: As configured in .env
- **Mikrotik**: As configured in .env (optional)

## Production Deployment

1. Set `NODE_ENV=production` in .env
2. Use a strong password for PostgreSQL
3. Configure reverse proxy (nginx/Apache)
4. Set up SSL/TLS certificates
5. Configure firewall rules
6. Regular database backups

## Support

For issues:
1. Check the logs in the console
2. Verify database connection: `npm run test:db`
3. Check all environment variables
4. Ensure PostgreSQL is running

## License

MIT License