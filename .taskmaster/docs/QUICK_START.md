# Mikrotik Billing System - Quick Start Guide

## Development Environment Setup

### 1. Initial Setup
```bash
# Install dependencies
npm install

# Setup database
npm run setup-db

# Run migrations
npm run migrate

# Create default admin user
node scripts/create-default-admin.js
```

### 2. Start Development
```bash
# Start development server
npm run dev

# Run tests
npm test

# Run E2E tests
npm run test:e2e
```

## Task Master Integration

### Project-Specific Commands
```bash
# Initialize Task Master with project configuration
task-master init --project mikrotik-billing

# Analyze current development state
task-master analyze-complexity --domain telecom-billing

# Set up specialized workflows
task-master setup-workflows --template payment-system
```

## Agent Usage Examples

### Backend Development
```
"Use @nodejs-expert to optimize Fastify server performance"
"Use @api-architect to design Mikrotik API integration patterns"
"Use @database-admin to optimize PostgreSQL queries"
```

### Payment System Development
```
"Use @payment-systems-expert to implement DuitKu plugin"
"Use @plugin-developer to create plugin sandbox environment"
"Use @security-specialist to validate payment security"
```

### WhatsApp Integration
```
"Use @messaging-specialist to implement multi-session WhatsApp"
"Use @network-engineer to optimize message delivery"
"Use @test-automation-expert to create E2E WhatsApp tests"
```

### Frontend Optimization
```
"Use @frontend-optimization-expert to improve Bootstrap performance"
"Use @code-reviewer to validate HTMX integration"
"Use @documentation-specialist to update UI documentation"
```

## Critical Development Notes

### Mikrotik Integration
- Test all RouterOS API calls in development environment
- Implement proper error handling and connection pooling
- Use consistent comment metadata patterns
- Validate profile synchronization before deployment

### Payment Plugin Development
- Follow standardized plugin interface in `src/lib/PaymentPlugin.js`
- Implement all required methods with proper error handling
- Test plugin sandbox isolation thoroughly
- Validate fee calculations and currency conversions

### WhatsApp Multi-Session Management
- Implement rate limiting (1 message/second per session)
- Test session health monitoring and recovery
- Validate template variable substitution
- Test failover between sessions

## Quality Standards

### Commit Requirements
- Format: `type(scope): description - @agent1 @agent2`
- Mandatory agent attribution
- Code review required for all changes
- Specialist approval for domain-specific changes

### Testing Requirements
- Unit tests for all business logic
- E2E tests for critical user flows
- Integration tests for Mikrotik API
- Performance tests for payment processing

## Troubleshooting

### Common Issues
1. **Mikrotik Connection**: Check API credentials and network connectivity
2. **WhatsApp Session**: Verify QR code scanning and session persistence
3. **Database Migration**: Ensure PostgreSQL is running and accessible
4. **Payment Gateway**: Validate plugin configuration and API keys

### Getting Help
- Use `@orchestrator` for complex multi-system coordination
- Use `@documentation-specialist` for updating guides
- Use `@test-automation-expert` for debugging test failures
- Use `@security-specialist` for security-related issues
