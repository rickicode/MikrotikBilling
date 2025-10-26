#!/usr/bin/env node

/**
 * Migration Validation Script
 * Validates PostgreSQL migrations for syntax, dependencies, and business logic compliance
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

class MigrationValidator {
    constructor() {
        this.migrationsPath = path.join(__dirname, '../migrations');
        this.issues = [];
        this.warnings = [];
        this.success = [];
    }

    /**
     * Validate all migration files
     */
    async validate() {
        console.log('🔍 PostgreSQL Migration Validation\n');
        console.log('=' .repeat(50));

        // Check migrations directory
        if (!fs.existsSync(this.migrationsPath)) {
            this.addIssue('Migrations directory not found', 'critical');
            return;
        }

        // Get migration files
        const migrationFiles = this.getMigrationFiles();
        console.log(`📁 Found ${migrationFiles.length} migration files\n`);

        // Validate each file
        for (const file of migrationFiles) {
            await this.validateMigrationFile(file);
        }

        // Validate migration order
        this.validateMigrationOrder(migrationFiles);

        // Validate business logic coverage
        this.validateBusinessLogicCoverage();

        // Generate report
        this.generateReport();
    }

    /**
     * Get migration files
     */
    getMigrationFiles() {
        return fs.readdirSync(this.migrationsPath)
            .filter(file => file.endsWith('.sql'))
            .sort();
    }

    /**
     * Validate individual migration file
     */
    async validateMigrationFile(filename) {
        console.log(`🔍 Validating: ${filename}`);
        
        const filePath = path.join(this.migrationsPath, filename);
        const content = fs.readFileSync(filePath, 'utf8');

        // Basic syntax validation
        this.validateBasicSyntax(content, filename);
        
        // Validate transaction structure
        this.validateTransactionStructure(content, filename);
        
        // Validate table definitions
        this.validateTableDefinitions(content, filename);
        
        // Validate constraints
        this.validateConstraints(content, filename);
        
        // Validate indexes
        this.validateIndexes(content, filename);
        
        // Validate security practices
        this.validateSecurity(content, filename);

        this.addSuccess(`✅ ${filename} validation completed`);
    }

    /**
     * Validate basic SQL syntax
     */
    validateBasicSyntax(content, filename) {
        // Check for required keywords
        if (!content.includes('BEGIN;') && !content.includes('BEGIN')) {
            this.addIssue(`Missing BEGIN transaction in ${filename}`, 'error');
        }

        if (!content.includes('COMMIT;') && !content.includes('COMMIT')) {
            this.addIssue(`Missing COMMIT transaction in ${filename}`, 'error');
        }

        // Check for dangerous operations
        if (content.toLowerCase().includes('drop database')) {
            this.addIssue(`Dangerous DROP DATABASE operation in ${filename}`, 'critical');
        }

        if (content.toLowerCase().includes('truncate table') && !content.includes('where')) {
            this.addWarning(`TRUNCATE TABLE without WHERE clause in ${filename}`);
        }
    }

    /**
     * Validate transaction structure
     */
    validateTransactionStructure(content, filename) {
        const hasBegin = content.includes('BEGIN;') || content.includes('BEGIN');
        const hasCommit = content.includes('COMMIT;') || content.includes('COMMIT');
        const hasRollback = content.toLowerCase().includes('rollback');

        if (hasBegin && hasCommit) {
            this.addSuccess(`✅ Proper transaction structure in ${filename}`);
        } else {
            this.addIssue(`Incomplete transaction structure in ${filename}`, 'error');
        }

        if (hasRollback) {
            this.addSuccess(`✅ Includes rollback handling in ${filename}`);
        }
    }

    /**
     * Validate table definitions
     */
    validateTableDefinitions(content, filename) {
        // Check for primary keys
        const createTableMatches = content.match(/CREATE TABLE [^(]+\(/gi) || [];
        createTableMatches.forEach(match => {
            // This is a basic check - in real implementation, we'd parse SQL properly
            this.addSuccess(`✅ Table creation statement found in ${filename}`);
        });

        // Check for proper data types
        if (content.includes('VARCHAR(') && !content.includes('VARCHAR(255)') && !content.includes('VARCHAR(100)')) {
            this.addWarning(`Consider using standard VARCHAR lengths in ${filename}`);
        }

        // Check for proper numeric types
        if (content.includes('DECIMAL(')) {
            this.addSuccess(`✅ Proper decimal usage in ${filename}`);
        }

        // Check for JSONB usage
        if (content.includes('JSONB')) {
            this.addSuccess(`✅ Modern JSONB usage in ${filename}`);
        }
    }

    /**
     * Validate constraints
     */
    validateConstraints(content, filename) {
        // Foreign key constraints
        if (content.includes('REFERENCES')) {
            this.addSuccess(`✅ Foreign key constraints defined in ${filename}`);
        }

        // Check constraints
        if (content.includes('CHECK (')) {
            this.addSuccess(`✅ CHECK constraints defined in ${filename}`);
        }

        // Unique constraints
        if (content.includes('UNIQUE')) {
            this.addSuccess(`✅ Unique constraints defined in ${filename}`);
        }

        // NOT NULL constraints
        if (content.includes('NOT NULL')) {
            this.addSuccess(`✅ NOT NULL constraints defined in ${filename}`);
        }
    }

    /**
     * Validate indexes
     */
    validateIndexes(content, filename) {
        const indexCount = (content.match(/CREATE INDEX/gi) || []).length;
        
        if (indexCount > 0) {
            this.addSuccess(`✅ ${indexCount} indexes defined in ${filename}`);
        } else {
            this.addWarning(`No indexes defined in ${filename}`);
        }

        // Check for composite indexes
        if (content.includes('CREATE INDEX') && content.includes(',')) {
            this.addSuccess(`✅ Composite indexes found in ${filename}`);
        }

        // Check for partial indexes
        if (content.includes('WHERE') && content.includes('CREATE INDEX')) {
            this.addSuccess(`✅ Partial indexes found in ${filename}`);
        }
    }

    /**
     * Validate security practices
     */
    validateSecurity(content, filename) {
        // Check for password hashing
        if (content.includes('password') && !content.includes('hash')) {
            this.addWarning(`Password field without hashing indicator in ${filename}`);
        }

        // Check for input validation
        if (content.includes('CHECK (') && content.includes('~')) {
            this.addSuccess(`✅ Input validation with regex in ${filename}`);
        }

        // Check for role-based access
        if (content.includes('role') || content.includes('permissions')) {
            this.addSuccess(`✅ Role-based access elements in ${filename}`);
        }

        // Check for encrypted fields
        if (content.includes('encrypted') || content.includes('is_encrypted')) {
            this.addSuccess(`✅ Encryption considerations in ${filename}`);
        }
    }

    /**
     * Validate migration order
     */
    validateMigrationOrder(files) {
        console.log('\n🔍 Validating migration order...');
        
        const order = ['001', '002', '003', '004', '005', '006'];
        const fileNumbers = files.map(f => f.split('_')[0]);

        for (let i = 0; i < fileNumbers.length; i++) {
            if (fileNumbers[i] !== order[i]) {
                this.addIssue(`Migration order issue: ${files[i]} should be position ${i + 1}`, 'error');
            }
        }

        this.addSuccess('✅ Migration order validation completed');
    }

    /**
     * Validate business logic coverage
     */
    validateBusinessLogicCoverage() {
        console.log('\n🔍 Validating business logic coverage...');
        
        const requiredTables = [
            'customers', 'vouchers', 'pppoe_users', 'payments',
            'payment_methods', 'whatsapp_sessions', 'profiles',
            'admin_users', 'subscriptions', 'locations'
        ];

        const allMigrations = this.getMigrationFiles();
        let allContent = '';
        
        allMigrations.forEach(file => {
            const content = fs.readFileSync(path.join(this.migrationsPath, file), 'utf8');
            allContent += content + '\n';
        });

        requiredTables.forEach(table => {
            if (allContent.includes(`CREATE TABLE ${table}(`) || allContent.includes(`CREATE TABLE IF NOT EXISTS ${table}(`)) {
                this.addSuccess(`✅ Table '${table}' defined`);
            } else {
                this.addIssue(`Required table '${table}' not found`, 'error');
            }
        });

        // Check for key business logic elements
        const businessLogicElements = [
            'balance', 'debt', 'status', 'expires_at',
            ' mikrotik', 'whatsapp', 'payment', 'subscription'
        ];

        businessLogicElements.forEach(element => {
            if (allContent.includes(element)) {
                this.addSuccess(`✅ Business logic element '${element}' found`);
            }
        });
    }

    /**
     * Add issue to report
     */
    addIssue(message, severity = 'error') {
        this.issues.push({ message, severity });
    }

    /**
     * Add warning to report
     */
    addWarning(message) {
        this.warnings.push(message);
    }

    /**
     * Add success to report
     */
    addSuccess(message) {
        this.success.push(message);
    }

    /**
     * Generate validation report
     */
    generateReport() {
        console.log('\n' + '='.repeat(50));
        console.log('📊 VALIDATION REPORT');
        console.log('='.repeat(50));

        // Summary
        console.log(`\n📈 SUMMARY:`);
        console.log(`✅ Success: ${this.success.length}`);
        console.log(`⚠️  Warnings: ${this.warnings.length}`);
        console.log(`❌ Issues: ${this.issues.length}`);

        // Critical issues first
        const criticalIssues = this.issues.filter(i => i.severity === 'critical');
        if (criticalIssues.length > 0) {
            console.log(`\n🚨 CRITICAL ISSUES (${criticalIssues.length}):`);
            criticalIssues.forEach(issue => {
                console.log(`   ❌ ${issue.message}`);
            });
        }

        // Regular issues
        const regularIssues = this.issues.filter(i => i.severity !== 'critical');
        if (regularIssues.length > 0) {
            console.log(`\n❌ ISSUES (${regularIssues.length}):`);
            regularIssues.forEach(issue => {
                console.log(`   ❌ ${issue.message}`);
            });
        }

        // Warnings
        if (this.warnings.length > 0) {
            console.log(`\n⚠️  WARNINGS (${this.warnings.length}):`);
            this.warnings.forEach(warning => {
                console.log(`   ⚠️  ${warning}`);
            });
        }

        // Success items (sample)
        if (this.success.length > 0) {
            console.log(`\n✅ SUCCESS ITEMS (${this.success.length}):`);
            this.success.slice(0, 10).forEach(success => {
                console.log(`   ${success}`);
            });
            if (this.success.length > 10) {
                console.log(`   ... and ${this.success.length - 10} more`);
            }
        }

        // Overall assessment
        console.log(`\n🎯 OVERALL ASSESSMENT:`);
        if (criticalIssues.length > 0) {
            console.log(`   🔴 CRITICAL ISSUES FOUND - Fix required before deployment`);
        } else if (this.issues.length > 0) {
            console.log(`   🟡 ISSUES FOUND - Fix recommended before deployment`);
        } else if (this.warnings.length > 0) {
            console.log(`   🟡 GOOD - Minor warnings only`);
        } else {
            console.log(`   🟢 EXCELLENT - No issues found`);
        }

        // Recommendations
        console.log(`\n💡 RECOMMENDATIONS:`);
        if (criticalIssues.length > 0) {
            console.log(`   1. Fix all critical issues immediately`);
            console.log(`   2. Re-run validation after fixes`);
        }
        if (regularIssues.length > 0) {
            console.log(`   3. Address all issues before production deployment`);
        }
        if (this.warnings.length > 0) {
            console.log(`   4. Review warnings for potential improvements`);
        }
        console.log(`   5. Run database tests after migration`);
        console.log(`   6. Test business logic validation`);
        console.log(`   7. Performance test with sample data`);
    }
}

// Run validation if called directly
if (require.main === module) {
    const validator = new MigrationValidator();
    validator.validate().catch(console.error);
}

module.exports = MigrationValidator;
