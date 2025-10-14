# Deployment Guide

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Production Build](#production-build)
4. [Server Configuration](#server-configuration)
5. [Database Setup](#database-setup)
6. [SSL/HTTPS Setup](#sslhttps-setup)
7. [Performance Optimization](#performance-optimization)
8. [Monitoring and Logging](#monitoring-and-logging)
9. [Security Configuration](#security-configuration)
10. [Maintenance](#maintenance)

---

## Prerequisites

### System Requirements
- **Node.js**: 18.x or higher
- **NPM**: 9.x or higher
- **Database**: SQLite 3.x (included) or PostgreSQL 13+ (optional)
- **Web Server**: Nginx 1.18+ or Apache 2.4+
- **SSL Certificate**: Let's Encrypt or commercial certificate
- **Domain**: Configured domain name pointing to server

### Development Tools
```bash
# Install Node.js (using NodeSource)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version
npm --version

# Install PM2 for process management
sudo npm install -g pm2

# Install Nginx
sudo apt update
sudo apt install nginx

# Install Certbot for SSL
sudo apt install certbot python3-certbot-nginx
```

---

## Environment Setup

### Production Environment Variables
```bash
# Create production environment file
cp .env.example .env.production

# Edit production configuration
nano .env.production
```

**Environment Variables**:
```bash
# Server Configuration
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Database Configuration
DB_PATH=/var/www/mikrotik-billing/data/database.sqlite
DB_BACKUP_PATH=/var/www/mikrotik-billing/backups

# Security
JWT_SECRET=your-super-secure-jwt-secret-key-here
SESSION_SECRET=your-super-secure-session-secret-here
BCRYPT_ROUNDS=12

# Mikrotik Configuration
MIKROTIK_HOST=192.168.1.1
MIKROTIK_USERNAME=admin
MIKROTIK_PASSWORD=your-mikrotik-password
MIKROTIK_PORT=8728

# WhatsApp Configuration
WHATSAPP_ENABLED=true
WHATSAPP_SESSION_PATH=/var/www/mikrotik-billing/sessions/whatsapp

# Email Configuration (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
FROM_EMAIL=noreply@yourdomain.com

# File Upload Configuration
UPLOAD_PATH=/var/www/mikrotik-billing/uploads
MAX_FILE_SIZE=10485760

# Logging Configuration
LOG_LEVEL=info
LOG_FILE=/var/log/mikrotik-billing/app.log

# Performance Configuration
CACHE_TTL=3600
RATE_LIMIT_WINDOW=900000
RATE_LIMIT_MAX=100
```

### Directory Structure Setup
```bash
# Create application directories
sudo mkdir -p /var/www/mikrotik-billing
sudo mkdir -p /var/www/mikrotik-billing/data
sudo mkdir -p /var/www/mikrotik-billing/backups
sudo mkdir -p /var/www/mikrotik-billing/uploads
sudo mkdir -p /var/www/mikrotik-billing/sessions
sudo mkdir -p /var/log/mikrotik-billing

# Set proper permissions
sudo chown -R $USER:$USER /var/www/mikrotik-billing
sudo chmod -R 755 /var/www/mikrotik-billing
sudo chmod -R 777 /var/www/mikrotik-billing/data
sudo chmod -R 777 /var/www/mikrotik-billing/sessions
```

---

## Production Build

### Asset Optimization
```bash
# Navigate to project directory
cd /var/www/mikrotik-billing

# Install dependencies
npm ci --production

# Build CSS assets
npm run build:css

# Optimize images (if using imagemin)
npm run optimize:images

# Generate service worker
npm run build:service-worker
```

### Build Scripts
```json
{
  "scripts": {
    "build:css": "postcss public/css/style.css -o public/css/style.min.css",
    "build:js": "terser public/js/main.js -o public/js/main.min.js",
    "build:assets": "npm run build:css && npm run build:js",
    "optimize:images": "imagemin public/images/* --out-dir=public/images/optimized",
    "build:service-worker": "workbox generateSW workbox-config.js",
    "build": "npm run build:assets && npm run build:service-worker"
  }
}
```

### PostCSS Configuration
```javascript
// postcss.config.js
module.exports = {
  plugins: [
    require('tailwindcss'),
    require('autoprefixer'),
    require('cssnano')({
      preset: 'default'
    })
  ]
};
```

---

## Server Configuration

### Nginx Configuration
```nginx
# /etc/nginx/sites-available/mikrotik-billing
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # SSL Settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security Headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'; frame-ancestors 'self';" always;

    # Gzip Compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied expired no-cache no-store private must-revalidate auth;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/javascript
        application/xml+rss
        application/json;

    # Root Directory
    root /var/www/mikrotik-billing/public;
    index index.html;

    # Static File Caching
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|woff|woff2|ttf|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        add_header X-Content-Type-Options nosniff;
    }

    # API Proxy
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Timeout settings
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Main Application (SPA fallback)
    location / {
        try_files $uri $uri/ /index.html;

        # Security headers for HTML
        add_header X-Frame-Options DENY;
        add_header X-Content-Type-Options nosniff;
        add_header Referrer-Policy "strict-origin-when-cross-origin";
    }

    # Health Check
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }

    # Deny access to sensitive files
    location ~ /\. {
        deny all;
    }

    location ~ \.(env|log|conf)$ {
        deny all;
    }
}
```

### Enable Site
```bash
# Create symbolic link
sudo ln -s /etc/nginx/sites-available/mikrotik-billing /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

---

## Database Setup

### SQLite Database Setup
```bash
# Initialize SQLite database
cd /var/www/mikrotik-billing

# Run database migrations
npm run migrate

# Seed initial data (optional)
npm run seed

# Set up automatic backups
sudo crontab -e
```

**Cron Job for Backups**:
```bash
# Daily database backup at 2 AM
0 2 * * * /usr/bin/node /var/www/mikrotik-billing/scripts/backup-database.js

# Weekly backup cleanup (keep 30 days)
0 3 * * 0 find /var/www/mikrotik-billing/backups -name "*.db" -mtime +30 -delete
```

### Database Backup Script
```javascript
// scripts/backup-database.js
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || '/var/www/mikrotik-billing/data/database.sqlite';
const BACKUP_PATH = process.env.DB_BACKUP_PATH || '/var/www/mikrotik-billing/backups';

function createBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(BACKUP_PATH, `backup-${timestamp}.db`);

    // Ensure backup directory exists
    if (!fs.existsSync(BACKUP_PATH)) {
        fs.mkdirSync(BACKUP_PATH, { recursive: true });
    }

    // Copy database file
    fs.copyFileSync(DB_PATH, backupFile);

    console.log(`Database backed up to: ${backupFile}`);

    // Clean old backups (keep last 30)
    const backups = fs.readdirSync(BACKUP_PATH)
        .filter(file => file.startsWith('backup-') && file.endsWith('.db'))
        .sort()
        .reverse();

    if (backups.length > 30) {
        const toDelete = backups.slice(30);
        toDelete.forEach(file => {
            fs.unlinkSync(path.join(BACKUP_PATH, file));
            console.log(`Deleted old backup: ${file}`);
        });
    }
}

createBackup();
```

---

## SSL/HTTPS Setup

### Let's Encrypt SSL Certificate
```bash
# Obtain SSL certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Test automatic renewal
sudo certbot renew --dry-run

# Set up automatic renewal (already configured by certbot)
sudo systemctl status certbot.timer
```

### SSL Configuration
```nginx
# Add to Nginx server block
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
ssl_prefer_server_ciphers off;
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 10m;

# OCSP Stapling
ssl_stapling on;
ssl_stapling_verify on;
resolver 8.8.8.8 8.8.4.4 valid=300s;
resolver_timeout 5s;
```

---

## Performance Optimization

### PM2 Process Management
```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'mikrotik-billing',
    script: 'server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: '/var/log/mikrotik-billing/error.log',
    out_file: '/var/log/mikrotik-billing/out.log',
    log_file: '/var/log/mikrotik-billing/combined.log',
    time: true,
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=1024',
    watch: false,
    ignore_watch: ['node_modules', 'logs', 'uploads'],
    restart_delay: 4000,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
```

### Start Application with PM2
```bash
# Start application
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 startup script
pm2 startup
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $USER --hp $HOME

# Monitor application
pm2 monit

# View logs
pm2 logs mikrotik-billing
```

### Caching Strategy
```javascript
// server.js - Redis caching (optional)
const Redis = require('ioredis');

const redis = new Redis({
    host: 'localhost',
    port: 6379,
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3
});

// Cache middleware
const cache = (duration = 300) => {
    return async (req, reply) => {
        const key = `cache:${req.method}:${req.url}`;

        try {
            const cached = await redis.get(key);
            if (cached) {
                return reply.type('application/json').send(JSON.parse(cached));
            }
        } catch (error) {
            console.error('Cache error:', error);
        }

        // Continue with request
        await reply;
    };
};

// Clear cache function
const clearCache = (pattern) => {
    return async () => {
        try {
            const keys = await redis.keys(pattern);
            if (keys.length > 0) {
                await redis.del(...keys);
                console.log(`Cleared ${keys.length} cache entries`);
            }
        } catch (error) {
            console.error('Cache clear error:', error);
        }
    };
};
```

---

## Monitoring and Logging

### Log Rotation Setup
```bash
# Create logrotate configuration
sudo nano /etc/logrotate.d/mikrotik-billing
```

**Logrotate Configuration**:
```
/var/log/mikrotik-billing/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 $USER $USER
    postrotate
        pm2 reload mikrotik-billing
    endscript
}
```

### Monitoring Script
```javascript
// scripts/monitoring.js
const fs = require('fs');
const path = require('path');

class HealthMonitor {
    constructor() {
        this.logFile = process.env.LOG_FILE || '/var/log/mikrotik-billing/app.log';
        this.maxFileSize = 100 * 1024 * 1024; // 100MB
    }

    async checkHealth() {
        const checks = {
            database: await this.checkDatabase(),
            diskSpace: this.checkDiskSpace(),
            memory: this.checkMemory(),
            uptime: process.uptime(),
            timestamp: new Date().toISOString()
        };

        this.logHealth(checks);
        return checks;
    }

    async checkDatabase() {
        try {
            const Database = require('../src/database/Database');
            const db = new Database();
            await db.query('SELECT 1');
            return { status: 'healthy', message: 'Database connection successful' };
        } catch (error) {
            return { status: 'error', message: error.message };
        }
    }

    checkDiskSpace() {
        const stats = fs.statSync(process.cwd());
        return {
            available: 'Check with df -h command',
            status: 'ok'
        };
    }

    checkMemory() {
        const usage = process.memoryUsage();
        return {
            rss: Math.round(usage.rss / 1024 / 1024) + 'MB',
            heapTotal: Math.round(usage.heapTotal / 1024 / 1024) + 'MB',
            heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + 'MB',
            external: Math.round(usage.external / 1024 / 1024) + 'MB'
        };
    }

    logHealth(checks) {
        const logEntry = `${new Date().toISOString()} - Health Check: ${JSON.stringify(checks)}\n`;
        fs.appendFileSync(this.logFile, logEntry);
    }
}

// Run health check
const monitor = new HealthMonitor();
monitor.checkHealth().then(console.log);
```

### System Monitoring (Prometheus/Grafana - Optional)
```yaml
# docker-compose.yml for monitoring
version: '3.8'
services:
  prometheus:
    image: prom/prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus

  grafana:
    image: grafana/grafana
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana_data:/var/lib/grafana

volumes:
  prometheus_data:
  grafana_data:
```

---

## Security Configuration

### Firewall Setup
```bash
# Configure UFW firewall
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'
sudo ufw enable

# Check firewall status
sudo ufw status
```

### Fail2Ban Configuration
```bash
# Install Fail2Ban
sudo apt install fail2ban

# Create custom configuration
sudo nano /etc/fail2ban/jail.local
```

**Fail2Ban Configuration**:
```ini
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port = ssh
logpath = /var/log/auth.log

[nginx-http-auth]
enabled = true
port = http,https
logpath = /var/log/nginx/error.log

[nginx-limit-req]
enabled = true
port = http,https
logpath = /var/log/nginx/error.log
```

### Security Headers Middleware
```javascript
// src/middleware/security.js
const helmet = require('helmet');

const securityMiddleware = helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            fontSrc: ["'self'"],
            connectSrc: ["'self'"],
            frameAncestors: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"]
        }
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
});

module.exports = securityMiddleware;
```

---

## Maintenance

### Update Process
```bash
# Create update script
nano /var/www/mikrotik-billing/scripts/update.sh
```

**Update Script**:
```bash
#!/bin/bash

# Mikrotik Billing System Update Script

set -e

echo "Starting update process..."

# Backup current version
echo "Creating backup..."
sudo cp -r /var/www/mikrotik-billing /var/www/mikrotik-billing.backup.$(date +%Y%m%d_%H%M%S)

# Pull latest changes
echo "Pulling latest changes..."
cd /var/www/mikrotik-billing
git pull origin main

# Install dependencies
echo "Installing dependencies..."
npm ci --production

# Build assets
echo "Building assets..."
npm run build

# Run database migrations
echo "Running database migrations..."
npm run migrate

# Restart application
echo "Restarting application..."
pm2 restart mikrotik-billing

# Clear cache
echo "Clearing cache..."
pm2 flush mikrotik-billing

echo "Update completed successfully!"
```

### Backup Script
```bash
#!/bin/bash

# Full backup script
BACKUP_DIR="/var/backups/mikrotik-billing"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="mikrotik-billing-$DATE"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Backup application files
tar -czf "$BACKUP_DIR/$BACKUP_NAME-files.tar.gz" -C /var/www mikrotik-billing

# Backup database
cp /var/www/mikrotik-billing/data/database.sqlite "$BACKUP_DIR/$BACKUP_NAME-database.sqlite"

# Backup PM2 configuration
pm2 save > "$BACKUP_DIR/$BACKUP_NAME-pm2-config.dump"

# Clean old backups (keep last 7 days)
find "$BACKUP_DIR" -name "mikrotik-billing-*" -mtime +7 -delete

echo "Backup completed: $BACKUP_NAME"
```

### Monitoring Dashboard
```javascript
// Create simple monitoring endpoint
app.get('/admin/monitoring', requireAuth, async (req, reply) => {
    const stats = {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        timestamp: new Date().toISOString(),

        // Database stats
        dbStats: await getDatabaseStats(),

        // Active users
        activeUsers: getActiveUsersCount(),

        // System health
        health: await healthMonitor.checkHealth()
    };

    return reply.view('admin/monitoring.ejs', { stats });
});
```

### Deployment Checklist
```markdown
## Pre-deployment Checklist
- [ ] Environment variables configured
- [ ] SSL certificate installed
- [ ] Database initialized and migrated
- [ ] Static assets built and optimized
- [ ] Nginx configured and tested
- [ ] Firewall rules configured
- [ ] Backup system set up
- [ ] Monitoring configured
- [ ] Log rotation configured
- [ ] Security headers implemented
- [ ] Performance testing completed
- [ ] Load testing performed

## Post-deployment Verification
- [ ] Application starts successfully
- [ ] All pages load correctly
- [ ] Database operations work
- [ ] File uploads work
- [ ] Mikrotik connection works
- [ ] WhatsApp integration works
- [ ] SSL certificate valid
- [ ] Security headers present
- [ ] Performance metrics acceptable
- [ ] Error monitoring active
- [ ] Backup system functional
```

This deployment guide provides comprehensive instructions for deploying the Mikrotik Billing System to a production environment with proper security, performance, and monitoring configurations.