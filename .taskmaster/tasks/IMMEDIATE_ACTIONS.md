# Immediate Action Items - Mikrotik Billing System

## Priority 1 - Critical Infrastructure (Do First)

### 1. Database Migration Validation
**Agent Assignment**: `@database-admin` + `@software-engineering-expert`
**Status**: Urgent - Multiple migration files need validation
**Actions**:
- Validate new migration files in `/migrations/` directory
- Test PostgreSQL schema integrity
- Verify foreign key constraints
- Test rollback procedures
- Document migration process

**Commands**:
```bash
"Use @database-admin to validate PostgreSQL migration files"
"Use @database-admin to test database schema integrity"
"Use @software-engineering-expert to review migration safety"
```

### 2. System Architecture Review
**Agent Assignment**: `@software-engineering-expert` + `@api-architect`
**Status**: High - Many modified files need architectural validation
**Actions**:
- Review changes in `src/routes/`, `src/services/`, `src/middleware/`
- Validate Fastify server configuration
- Analyze API consistency
- Check error handling patterns
- Review security implementations

**Commands**:
```bash
"Use @software-engineering-expert to review current system architecture"
"Use @api-architect to validate RESTful API design patterns"
"Use @security-specialist to audit authentication and authorization"
```

## Priority 2 - Feature Enhancement

### 3. Payment Gateway Plugin System
**Agent Assignment**: `@payment-systems-expert` + `@plugin-developer`
**Status**: Medium - Plugin architecture needs completion
**Actions**:
- Complete `src/lib/PaymentPlugin.js` interface
- Implement DuitKu plugin
- Create plugin sandbox environment
- Test plugin hot-swapping
- Document plugin development process

**Commands**:
```bash
"Use @payment-systems-expert to complete payment gateway plugin architecture"
"Use @plugin-developer to implement plugin sandbox system"
"Use @security-specialist to validate plugin security isolation"
```

### 4. WhatsApp Multi-Session Management
**Agent Assignment**: `@messaging-specialist` + `@network-engineer`
**Status**: Medium - WhatsApp service needs enhancement
**Actions**:
- Implement multi-session load balancing
- Add session health monitoring
- Optimize message queue performance
- Test failover mechanisms
- Validate rate limiting implementation

**Commands**:
```bash
"Use @messaging-specialist to implement WhatsApp multi-session management"
"Use @network-engineer to optimize message delivery performance"
"Use @test-automation-expert to create WhatsApp integration tests"
```

## Priority 3 - Performance & Testing

### 5. Test Suite Enhancement
**Agent Assignment**: `@test-automation-expert` + `@testing-coordinator`
**Status**: Medium - E2E tests need expansion
**Actions**:
- Enhance existing Playwright tests
- Add Mikrotik API integration tests
- Create payment flow E2E tests
- Test WhatsApp notification workflows
- Implement performance benchmarks

**Commands**:
```bash
"Use @test-automation-expert to enhance E2E test coverage"
"Use @testing-coordinator to create comprehensive test strategy"
"Use @performance-optimizer to implement performance testing"
```

### 6. Frontend Optimization
**Agent Assignment**: `@frontend-optimization-expert` + `@code-reviewer`
**Status**: Low - UI improvements needed
**Actions**:
- Optimize Bootstrap 5 implementation
- Enhance HTMX integration
- Improve responsive design
- Optimize EJS template performance
- Validate accessibility compliance

**Commands**:
```bash
"Use @frontend-optimization-expert to optimize Bootstrap and HTMX performance"
"Use @code-reviewer to validate frontend code quality"
"Use @documentation-specialist to create UI component documentation"
```

## System Health Checks

### Database Status Check
```bash
npm run test:db
npm run migrate:status
```

### Development Server Status
```bash
npm run dev
# Test API endpoints
curl http://localhost:3000/api/health
```

### Test Suite Status
```bash
npm test
npm run test:e2e
```

## Development Environment Setup

### Environment Validation
1. Check `.env` configuration
2. Verify PostgreSQL connection
3. Validate Mikrotik API credentials
4. Test WhatsApp session storage
5. Confirm logging configuration

### Quick Start Commands
```bash
# Install dependencies
npm install

# Setup database
npm run setup-db

# Run migrations
npm run migrate

# Start development server
npm run dev

# Run tests
npm test
npm run test:e2e
```

## Git Workflow Commands

### Current Status Check
```bash
git status
git diff
git log --oneline -10
```

### Commit Preparation
```bash
# Stage changes systematically
git add package.json package-lock.json
git add src/
git add migrations/
git add .taskmaster/
git add CLAUDE.md

# Create commit with proper format
git commit -m "feat(bootstrap): enhance claude 007 agent system configuration - @bootstrap-orchestrator @software-engineering-expert"
```

## Agent Usage Templates

### Backend Development
```
"Use @nodejs-expert to analyze server.js performance optimization"
"Use @api-architect to review API endpoint consistency"
"Use @database-admin to optimize database query performance"
```

### Security Review
```
"Use @security-specialist to audit authentication system"
"Use @security-specialist to validate payment processing security"
"Use @security-specialist to review Mikrotik API security"
```

### Performance Optimization
```
"Use @performance-optimizer to analyze system bottlenecks"
"Use @performance-optimizer to optimize Mikrotik API connection pooling"
"Use @performance-optimizer to improve database query performance"
```

### Documentation Updates
```
"Use @documentation-specialist to update API documentation"
"Use @documentation-specialist to create deployment guides"
"Use @documentation-specialist to document plugin development process"
```

## Next Steps Planning

### Week 1 Goals
1. Complete database migration validation
2. Fix critical bugs in modified files
3. Implement core payment plugin system
4. Enhance test coverage to 80%

### Week 2 Goals
1. Complete WhatsApp multi-session management
2. Implement advanced Mikrotik integration features
3. Create comprehensive documentation
4. Optimize system performance

### Week 3 Goals
1. Complete plugin ecosystem
2. Implement advanced monitoring
3. Create deployment automation
4. Conduct security audit

## Emergency Contacts (Agent Specialists)

### Critical System Issues
- Database: `@database-admin` + `@software-engineering-expert`
- Security: `@security-specialist` + `@deployment-specialist`
- API: `@api-architect` + `@nodejs-expert`
- Payments: `@payment-systems-expert` + `@plugin-developer`
- Network: `@network-engineer` + `@messaging-specialist`

### Development Support
- Architecture: `@software-engineering-expert` + `@orchestrator`
- Code Quality: `@code-reviewer` + `@documentation-specialist`
- Testing: `@test-automation-expert` + `@testing-coordinator`
- Performance: `@performance-optimizer` + `@frontend-optimization-expert`

---

**Status**: ✅ System ready for immediate development
**Priority**: Complete Priority 1 items before proceeding to feature enhancement
**Next Action**: Start with database migration validation using `@database-admin`
