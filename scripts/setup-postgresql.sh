#!/bin/bash

# PostgreSQL Setup Script for Mikrotik Billing System
# This script helps set up PostgreSQL for development

echo "🐘 PostgreSQL Setup for Mikrotik Billing System"
echo "=============================================="
echo

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    print_error "PostgreSQL is not installed!"
    echo
    echo "To install PostgreSQL:"
    echo "  Ubuntu/Debian: sudo apt update && sudo apt install postgresql postgresql-contrib"
    echo "  CentOS/RHEL: sudo yum install postgresql-server postgresql-contrib"
    echo "  macOS: brew install postgresql"
    echo
    exit 1
fi

print_success "PostgreSQL client found"

# Check if PostgreSQL service is running
if ! pg_isready -q; then
    print_warning "PostgreSQL service is not running"
    echo
    echo "Please start PostgreSQL service:"
    echo "  Ubuntu/Debian: sudo systemctl start postgresql"
    echo "  CentOS/RHEL: sudo systemctl start postgresql"
    echo "  macOS: brew services start postgresql"
    echo "  Windows: Start from Services or run net start postgresql-x64-13"
    echo
    echo "After starting PostgreSQL, run this script again."
    exit 1
fi

print_success "PostgreSQL service is running"

# Database configuration
DB_NAME="${DB_NAME:-mikrotik_billing}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-password}"

echo
echo "Database Configuration:"
echo "  Database Name: $DB_NAME"
echo "  User: $DB_USER"
echo "  Password: [hidden]"
echo

# Check if database exists
if sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
    print_success "Database '$DB_NAME' already exists"
else
    echo "Creating database '$DB_NAME'..."
    if sudo -u postgres createdb "$DB_NAME"; then
        print_success "Database '$DB_NAME' created successfully"
    else
        print_error "Failed to create database"
        exit 1
    fi
fi

# Check if user exists and has password
echo "Checking user configuration..."
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
    print_success "User '$DB_USER' exists"

    # Update password if needed
    echo "Updating password for user '$DB_USER'..."
    sudo -u postgres psql -c "ALTER USER $DB_USER PASSWORD '$DB_PASSWORD';"
    print_success "Password updated"
else
    print_warning "User '$DB_USER' does not exist (this is unusual for postgres)"
    echo "Creating user '$DB_USER'..."
    sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';"
    sudo -u postgres psql -c "ALTER USER $DB_USER CREATEDB CREATEROLE SUPERUSER;"
    print_success "User '$DB_USER' created with superuser privileges"
fi

# Grant privileges
echo "Granting privileges..."
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"
print_success "Privileges granted"

echo
print_success "PostgreSQL setup completed!"
echo
echo "Next steps:"
echo "1. Make sure your .env file has the correct database configuration"
echo "2. Run 'node scripts/test-postgresql.js' to verify the connection"
echo "3. Start the application with 'npm run dev'"
echo
echo "Example .env configuration:"
echo "DATABASE_URL=postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME"
echo "DB_HOST=localhost"
echo "DB_PORT=5432"
echo "DB_NAME=$DB_NAME"
echo "DB_USER=$DB_USER"
echo "DB_PASSWORD=$DB_PASSWORD"