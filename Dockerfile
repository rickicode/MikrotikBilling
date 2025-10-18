# Use Node.js 18 LTS as base image
FROM node:18-alpine AS base

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    musl-dev \
    pixman-dev \
    pangomm-dev \
    libjpeg-turbo-dev \
    freetype-dev \
    && rm -rf /var/cache/apk/*

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Development stage
FROM base AS development
RUN npm ci
COPY . .

# Production stage
FROM base AS production

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S mikrotikbilling -u 1001

# Create necessary directories
RUN mkdir -p /app/logs /app/uploads /app/backups && \
    chown -R mikrotikbilling:nodejs /app

# Copy application files
COPY --chown=mikrotikbilling:nodejs . .

# Copy custom configuration files if they exist
COPY --chown=mikrotikbilling:nodejs ./config/* /app/config/ 2>/dev/null || true

# Set ownership
USER mikrotikbilling

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node server-new.js --health || exit 1

# Start the application
CMD ["node", "server-new.js"]