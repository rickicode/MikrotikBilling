# Mikrotik Billing System - Development Workflow

## Agent Assignment Matrix

### Backend Development Tasks
**Primary Agents**: `@nodejs-expert` + `@software-engineering-expert`
**Support**: `@api-architect` + `@performance-optimizer`

**Typical Tasks**:
- Fastify server optimization
- API endpoint development
- Business logic implementation
- Performance tuning

**Example Usage**:
```
"Use @nodejs-expert and @software-engineering-expert to implement voucher generation API"
"Use @api-architect to design RESTful endpoints for customer management"
"Use @performance-optimizer to analyze server response times"
```

### Database Operations
**Primary Agents**: `@database-admin` + `@performance-optimizer`
**Support**: `@software-engineering-expert` for complex migrations

**Typical Tasks**:
- Schema migrations
- Query optimization
- Index management
- Data integrity checks

**Example Usage**:
```
"Use @database-admin to create migration for new payment table"
"Use @performance-optimizer to add indexes for voucher queries"
"Use @database-admin to validate foreign key constraints"
```

### Payment System Development
**Primary Agents**: `@payment-systems-expert` + `@plugin-developer`
**Support**: `@security-specialist` + `@api-architect`

**Typical Tasks**:
- Payment gateway integration
- Plugin development
- Fee calculation logic
- Transaction security

**Example Usage**:
```
"Use @payment-systems-expert to design DuitKu integration"
"Use @plugin-developer to implement plugin sandbox"
"Use @security-specialist to validate payment security measures"
```

### Mikrotik Integration
**Primary Agents**: `@network-engineer` + `@api-architect`
**Support**: `@performance-optimizer` + `@software-engineering-expert`

**Typical Tasks**:
- RouterOS API integration
- Profile synchronization
- Connection management
- Network protocol handling

**Example Usage**:
```
"Use @network-engineer to implement Mikrotik user synchronization"
"Use @api-architect to design API connection pooling"
"Use @performance-optimizer to reduce API call latency"
```

### WhatsApp Integration
**Primary Agents**: `@messaging-specialist` + `@plugin-developer`
**Support**: `@test-automation-expert` + `@network-engineer`

**Typical Tasks**:
- Multi-session management
- Template system development
- Message queue handling
- Rate limiting implementation

**Example Usage**:
```
"Use @messaging-specialist to implement WhatsApp multi-session"
"Use @plugin-developer to create template system"
"Use @test-automation-expert to test message delivery"
```

### Frontend Development
**Primary Agents**: `@frontend-optimization-expert` + `@code-reviewer`
**Support**: `@documentation-specialist` for UI guides

**Typical Tasks**:
- Bootstrap optimization
- HTMX integration
- EJS template development
- Responsive design

**Example Usage**:
```
"Use @frontend-optimization-expert to improve dashboard performance"
"Use @code-reviewer to validate HTMX form submissions"
"Use @documentation-specialist to create component guides"
```

## Quality Gates and Review Process

### Code Review Requirements
1. **All Changes**: At least one agent review
2. **Security Changes**: `@security-specialist` approval required
3. **Database Changes**: `@database-admin` approval required
4. **API Changes**: `@api-architect` validation required
5. **Payment Changes**: `@payment-systems-expert` sign-off required
6. **Plugin Development**: `@plugin-developer` review required

### Testing Requirements
1. **Unit Tests**: For all business logic (80% coverage minimum)
2. **Integration Tests**: For Mikrotik API and payment gateways
3. **E2E Tests**: For critical user flows (voucher generation, payments)
4. **Performance Tests**: For API endpoints and database queries
5. **Security Tests**: For payment processing and authentication

## Development Workflow Steps

### 1. Feature Development
```bash
# Start development session
claude

# Example: Implementing new payment plugin
"Use @payment-systems-expert to design new payment gateway plugin architecture"
"Use @plugin-developer to implement plugin with proper sandboxing"
"Use @security-specialist to validate payment security implementation"
"Use @test-automation-expert to create comprehensive test suite"
```

### 2. Code Review Process
```bash
# Submit for review
"Use @code-reviewer to validate code quality and standards"
"Use @software-engineering-expert to review architecture decisions"

# Domain-specific reviews
"Use @database-admin to review database changes"
"Use @api-architect to validate API design"
"Use @network-engineer to review Mikrotik integration"
```

### 3. Testing and Validation
```bash
# Run automated tests
npm test
npm run test:e2e

# Domain-specific testing
"Use @test-automation-expert to validate test coverage"
"Use @performance-optimizer to run performance benchmarks"
"Use @security-specialist to conduct security validation"
```

### 4. Documentation
```bash
# Update documentation
"Use @documentation-specialist to update API documentation"
"Use @documentation-specialist to create user guides"
"Use @documentation-specialist to document new features"
```

## Emergency Response Procedures

### Production Issues
1. **Immediate Response**: `@deployment-specialist` + `@devops-engineer`
2. **Root Cause Analysis**: `@software-engineering-expert` + relevant domain specialist
3. **Fix Implementation**: Primary domain agents + `@code-reviewer`
4. **Testing**: `@test-automation-expert` + domain specialists
5. **Deployment**: `@deployment-specialist` + `@devops-engineer`

### Security Issues
1. **Immediate Response**: `@security-specialist` + `@deployment-specialist`
2. **Investigation**: `@security-specialist` + `@software-engineering-expert`
3. **Patch Development**: `@security-specialist` + relevant domain agents
4. **Security Review**: `@security-specialist` mandatory approval
5. **Deployment**: `@deployment-specialist` with security validation

## Performance Optimization Workflow

### Regular Performance Tasks
1. **Database Optimization**: `@database-admin` + `@performance-optimizer`
2. **API Performance**: `@nodejs-expert` + `@performance-optimizer`
3. **Frontend Optimization**: `@frontend-optimization-expert`
4. **Mikrotik API**: `@network-engineer` + `@performance-optimizer`

### Performance Monitoring
- Set up automated performance alerts
- Regular performance reviews with `@performance-optimizer`
- Benchmark critical user flows
- Monitor Mikrotik API response times
- Track payment processing performance

## Continuous Integration/Continuous Deployment

### Pre-commit Checks
- Code formatting validation
- Unit test execution
- Security scan validation
- Performance regression tests

### Pre-deployment Validation
- Full test suite execution
- Integration tests with Mikrotik sandbox
- Payment gateway validation
- Database migration testing
- Performance benchmarks

### Deployment Process
1. **Preparation**: `@deployment-specialist` + `@devops-engineer`
2. **Validation**: All relevant domain specialists
3. **Execution**: `@deployment-specialist`
4. **Monitoring**: `@devops-engineer` + domain specialists
5. **Rollback Planning**: `@deployment-specialist`

This workflow ensures consistent, high-quality development while maintaining the complex requirements of the Mikrotik Billing System.
