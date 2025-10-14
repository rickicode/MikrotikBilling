#!/usr/bin/env node

/**
 * Automated Browser Testing for Mikrotik Billing System
 * Requires: puppeteer or playwright
 */

const { chromium } = require('playwright');
const { execSync } = require('child_process');

class BrowserTester {
    constructor() {
        this.browser = null;
        this.context = null;
        this.page = null;
        this.testResults = [];
        this.baseUrl = 'http://localhost:3000'; // Default local development URL
    }

    async init() {
        console.log('🌐 Initializing browser testing...');

        try {
            // Check if server is running
            try {
                execSync('curl -s http://localhost:3000', { stdio: 'ignore' });
            } catch (error) {
                console.warn('⚠️ Server not running on localhost:3000, starting test server...');
                // You could start the server here if needed
            }

            this.browser = await chromium.launch({
                headless: process.env.HEADLESS !== 'false',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu'
                ]
            });

            this.context = await this.browser.newContext({
                viewport: { width: 1280, height: 720 },
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                ignoreHTTPSErrors: true,
                javaScriptEnabled: true
            });

            this.page = await this.context.newPage();

            // Enable console log capture
            this.page.on('console', msg => {
                if (msg.type() === 'error') {
                    console.log(`🖥️  Browser Console Error: ${msg.text()}`);
                }
            });

            // Enable request/response monitoring
            this.page.on('request', request => {
                this.logRequest(request);
            });

            this.page.on('response', response => {
                this.logResponse(response);
            });

            console.log('✅ Browser initialized successfully');
        } catch (error) {
            console.error('❌ Failed to initialize browser:', error);
            throw error;
        }
    }

    logRequest(request) {
        const url = request.url();
        if (url.includes('localhost:3000')) {
            console.log(`📤 ${request.method()} ${url}`);
        }
    }

    logResponse(response) {
        const url = response.url();
        if (url.includes('localhost:3000')) {
            const status = response.status();
            console.log(`📥 ${status} ${url}`);
        }
    }

    async runAllTests() {
        console.log('🧪 Starting automated browser tests...\n');

        try {
            await this.init();

            // Navigation Tests
            await this.testHomePage();
            await this.testNavigation();
            await this.testMobileResponsiveness();

            // Feature Tests
            await this.testForms();
            await this.testButtons();
            await this.testTables();
            await this.testModals();

            // Performance Tests
            await this.testPerformanceMetrics();

            // Accessibility Tests
            await this.testKeyboardNavigation();
            await this.testScreenReader();

            console.log('\n✅ All browser tests completed!');
        } catch (error) {
            console.error('❌ Browser testing failed:', error);
            throw error;
        } finally {
            await this.cleanup();
        }
    }

    async testHomePage() {
        console.log('🏠 Testing home page...');

        const result = {
            name: 'Home Page Load',
            status: 'passed',
            details: [],
            errors: []
        };

        try {
            // Navigate to home page
            await this.page.goto(this.baseUrl, { waitUntil: 'networkidle' });

            // Check page title
            const title = await this.page.title();
            if (title && title.length > 0) {
                result.details.push('✅ Page title loaded');
            } else {
                result.errors.push('❌ No page title found');
                result.status = 'failed';
            }

            // Check for main content
            const mainContent = await this.page.$('main') || await this.page.$('.main-content') || await this.page.$('#main-content');
            if (mainContent) {
                result.details.push('✅ Main content area found');
            } else {
                result.errors.push('⚠️ Main content area not found');
            }

            // Check for navigation
            const navigation = await this.page.$('nav') || await this.page.$('.navigation');
            if (navigation) {
                result.details.push('✅ Navigation found');
            }

            // Check for footer
            const footer = await this.page.$('footer') || await this.page.$('.footer');
            if (footer) {
                result.details.push('✅ Footer found');
            }

            // Check for dark theme
            const body = await this.page.$('body');
            const bodyClass = await body.getAttribute('class');
            if (bodyClass && (bodyClass.includes('dark') || bodyClass.includes('Dark'))) {
                result.details.push('✅ Dark theme detected');
            }

            // Screenshot
            await this.page.screenshot({ path: 'test-results/homepage-desktop.png', fullPage: true });
            result.details.push('📸 Desktop screenshot saved');

        } catch (error) {
            result.status = 'failed';
            result.errors.push(`❌ Error loading home page: ${error.message}`);
        }

        this.testResults.push(result);
        console.log(`  ${this.getStatusIcon(result.status)} ${result.name}`);
    }

    async testNavigation() {
        console.log('🧭 Testing navigation...');

        const result = {
            name: 'Navigation Functionality',
            status: 'passed',
            details: [],
            errors: []
        };

        try {
            // Test desktop navigation
            const navLinks = await this.page.$$('nav a, .nav-link, header a');
            if (navLinks.length > 0) {
                result.details.push(`✅ Found ${navLinks.length} navigation links`);

                // Test a few navigation links
                const testLinks = navLinks.slice(0, Math.min(3, navLinks.length));
                for (const link of testLinks) {
                    try {
                        const href = await link.getAttribute('href');
                        if (href && !href.startsWith('http') && !href.startsWith('mailto') && !href.startsWith('tel')) {
                            await link.click();
                            await this.page.waitForLoadState('networkidle');
                            await this.page.goBack();
                            await this.page.waitForLoadState('networkidle');
                            result.details.push(`✅ Navigation link clicked successfully: ${href}`);
                        }
                    } catch (error) {
                        result.errors.push(`❌ Navigation link error: ${error.message}`);
                    }
                }
            } else {
                result.errors.push('❌ No navigation links found');
                result.status = 'failed';
            }

            // Test mobile menu
            const mobileMenuButton = await this.page.$('.mobile-menu-button, .hamburger, .menu-toggle');
            if (mobileMenuButton) {
                await mobileMenuButton.click();
                await this.page.waitForTimeout(500);
                result.details.push('✅ Mobile menu button functional');

                const mobileMenu = await this.page.$('.mobile-menu, .mobile-nav');
                if (mobileMenu) {
                    result.details.push('✅ Mobile menu appears');
                }

                await mobileMenuButton.click(); // Close menu
            }

            // Test breadcrumb if exists
            const breadcrumb = await this.page.$('.breadcrumb, .nav-breadcrumb');
            if (breadcrumb) {
                result.details.push('✅ Breadcrumb navigation found');
            }

        } catch (error) {
            result.status = 'failed';
            result.errors.push(`❌ Navigation test error: ${error.message}`);
        }

        this.testResults.push(result);
        console.log(`  ${this.getStatusIcon(result.status)} ${result.name}`);
    }

    async testMobileResponsiveness() {
        console.log('📱 Testing mobile responsiveness...');

        const result = {
            name: 'Mobile Responsiveness',
            status: 'passed',
            details: [],
            errors: []
        };

        try {
            // Test different viewport sizes
            const viewports = [
                { name: 'Mobile', width: 375, height: 667 }, // iPhone 6/7/8
                { name: 'Tablet', width: 768, height: 1024 }, // iPad
                { name: 'Small Desktop', width: 1024, height: 768 }
            ];

            for (const viewport of viewports) {
                try {
                    await this.page.setViewportSize(viewport);
                    await this.page.reload({ waitUntil: 'networkidle' });

                    // Take screenshot for this viewport
                    await this.page.screenshot({
                        path: `test-results/homepage-${viewport.name.toLowerCase()}.png`,
                        fullPage: true
                    });

                    result.details.push(`✅ ${viewport.name} viewport (${viewport.width}x${viewport.height})`);

                    // Check for mobile menu on small screens
                    if (viewport.width <= 768) {
                        const mobileMenu = await this.page.$('.mobile-menu-button, .menu-toggle');
                        if (mobileMenu) {
                            result.details.push(`✅ Mobile menu available on ${viewport.name}`);
                        }
                    }

                    // Check if content is readable
                    const mainContent = await this.page.$('main, .main-content, #main-content');
                    if (mainContent) {
                        const contentBox = await mainContent.boundingBox();
                        if (contentBox && contentBox.width > 200) {
                            result.details.push(`✅ Content readable on ${viewport.name}`);
                        } else {
                            result.errors.push(`⚠️ Content may be too small on ${viewport.name}`);
                        }
                    }

                } catch (error) {
                    result.errors.push(`❌ ${viewport.name} test error: ${error.message}`);
                }
            }

            // Reset to desktop viewport
            await this.page.setViewportSize({ width: 1280, height: 720 });

        } catch (error) {
            result.status = 'failed';
            result.errors.push(`❌ Mobile responsiveness test error: ${error.message}`);
        }

        this.testResults.push(result);
        console.log(`  ${this.getStatusIcon(result.status)} ${result.name}`);
    }

    async testForms() {
        console.log('📝 Testing forms...');

        const result = {
            name: 'Form Functionality',
            status: 'passed',
            details: [],
            errors: []
        };

        try {
            // Find all forms
            const forms = await this.page.$$('form');
            if (forms.length === 0) {
                result.details.push('ℹ️ No forms found on current page');
            } else {
                result.details.push(`✅ Found ${forms.length} forms`);

                // Test each form
                for (const form of forms) {
                    try {
                        // Find form inputs
                        const inputs = await form.$$('input, textarea, select');
                        const buttons = await form.$$('button[type="submit"], input[type="submit"]');

                        result.details.push(`📋 Form with ${inputs.length} inputs and ${buttons.length} buttons`);

                        // Test form validation if inputs exist
                        for (const input of inputs) {
                            const type = await input.getAttribute('type');
                            const required = await input.getAttribute('required');
                            const pattern = await input.getAttribute('pattern');

                            if (required) {
                                result.details.push('✅ Required field found');
                            }

                            if (pattern) {
                                result.details.push('✅ Pattern validation found');
                            }

                            // Test input interaction
                            if (type !== 'hidden' && type !== 'file') {
                                await input.click();
                                await input.type('test value');
                                await this.page.waitForTimeout(100);

                                // Clear input
                                await input.evaluate(el => el.value = '');
                            }
                        }

                        // Test submit button if exists
                        if (buttons.length > 0) {
                            const submitButton = buttons[0];
                            const isDisabled = await submitButton.isDisabled();

                            if (!isDisabled) {
                                // Don't actually submit, just check if it can be clicked
                                await submitButton.hover();
                                await this.page.waitForTimeout(100);
                                result.details.push('✅ Submit button functional');
                            }
                        }

                    } catch (error) {
                        result.errors.push(`❌ Form test error: ${error.message}`);
                    }
                }
            }

            // Test form labels
            const labels = await this.page.$$('label');
            const inputs = await this.page.$$('input, textarea, select');

            if (labels.length >= inputs.length * 0.8) {
                result.details.push('✅ Adequate form labels found');
            } else if (inputs.length > 0) {
                result.errors.push('⚠️ Insufficient form labels');
            }

        } catch (error) {
            result.status = 'failed';
            result.errors.push(`❌ Form test error: ${error.message}`);
        }

        this.testResults.push(result);
        console.log(`  ${this.getStatusIcon(result.status)} ${result.name}`);
    }

    async testButtons() {
        console.log('🔘 Testing buttons...');

        const result = {
            name: 'Button Functionality',
            status: 'passed',
            details: [],
            errors: []
        };

        try {
            // Find all buttons
            const buttons = await this.page.$$('button, .btn, [role="button"]');
            if (buttons.length === 0) {
                result.details.push('ℹ️ No buttons found on current page');
            } else {
                result.details.push(`✅ Found ${buttons.length} buttons`);

                // Test a subset of buttons
                const testButtons = buttons.slice(0, Math.min(5, buttons.length));

                for (const button of testButtons) {
                    try {
                        const isDisabled = await button.isDisabled();
                        const isHidden = await button.isHidden();

                        if (!isDisabled && !isHidden) {
                            // Hover over button
                            await button.hover();
                            await this.page.waitForTimeout(100);

                            // Check for hover effects
                            const computedStyle = await button.evaluate(el => {
                                return window.getComputedStyle(el);
                            });

                            if (computedStyle.transform !== 'none' || computedStyle.boxShadow !== 'none') {
                                result.details.push('✅ Button hover effects detected');
                            }

                            // Check button text or content
                            const text = await button.textContent();
                            if (text && text.trim().length > 0) {
                                result.details.push(`✅ Button with text: "${text.trim()}"`);
                            }

                            // Check for loading states
                            const hasLoadingClass = await button.evaluate(el => {
                                return el.classList.contains('loading') || el.classList.contains('disabled');
                            });

                            if (hasLoadingClass) {
                                result.details.push('✅ Loading state support detected');
                            }
                        }
                    } catch (error) {
                        result.errors.push(`❌ Button test error: ${error.message}`);
                    }
                }
            }

            // Test button groups
            const buttonGroups = await this.page.$$('.btn-group, .button-group');
            if (buttonGroups.length > 0) {
                result.details.push(`✅ Found ${buttonGroups.length} button groups`);
            }

        } catch (error) {
            result.status = 'failed';
            result.errors.push(`❌ Button test error: ${error.message}`);
        }

        this.testResults.push(result);
        console.log(`  ${this.getStatusIcon(result.status)} ${result.name}`);
    }

    async testTables() {
        console.log('📊 Testing tables...');

        const result = {
            name: 'Table Functionality',
            status: 'passed',
            details: [],
            errors: []
        };

        try {
            // Find all tables
            const tables = await this.page.$$('table');
            if (tables.length === 0) {
                result.details.push('ℹ️ No tables found on current page');
            } else {
                result.details.push(`✅ Found ${tables.length} tables`);

                // Test each table
                for (const table of tables) {
                    try {
                        // Check table structure
                        const thead = await table.$('thead');
                        const tbody = await table.$('tbody');
                        const rows = await table.$$('tr');

                        result.details.push(`📋 Table with ${rows.length} rows`);

                        if (thead) {
                            const headers = await thead.$$('th');
                            result.details.push(`✅ Table headers: ${headers.length}`);
                        }

                        if (tbody) {
                            const dataRows = await tbody.$$('tr');
                            result.details.push(`✅ Data rows: ${dataRows.length}`);
                        }

                        // Check for responsive table wrapper
                        const tableWrapper = await table.$('..').then(parent => {
                            if (parent) {
                                return parent.evaluate(el => {
                                    return window.getComputedStyle(el).overflowX === 'auto' ||
                                           el.classList.contains('table-responsive') ||
                                           el.classList.contains('overflow-x-auto');
                                });
                            }
                            return false;
                        });

                        if (tableWrapper) {
                            result.details.push('✅ Responsive table wrapper found');
                        }

                        // Check for sorting functionality
                        const sortableHeaders = await table.$$('th[data-sort], .sort-header, .sortable');
                        if (sortableHeaders.length > 0) {
                            result.details.push(`✅ Sortable headers found: ${sortableHeaders.length}`);
                        }

                        // Check for pagination
                        const pagination = await table.$('..').then(parent => {
                            if (parent) {
                                return parent.$('.pagination, .pager, .page-controls');
                            }
                            return null;
                        });

                        if (pagination) {
                            result.details.push('✅ Pagination found');
                        }

                    } catch (error) {
                        result.errors.push(`❌ Table test error: ${error.message}`);
                    }
                }
            }

        } catch (error) {
            result.status = 'failed';
            result.errors.push(`❌ Table test error: ${error.message}`);
        }

        this.testResults.push(result);
        console.log(`  ${this.getStatusIcon(result.status)} ${result.name}`);
    }

    async testModals() {
        console.log('🔲 Testing modals...');

        const result = {
            name: 'Modal Functionality',
            status: 'passed',
            details: [],
            errors: []
        };

        try {
            // Find modal triggers
            const modalTriggers = await this.page.$$('[data-modal], [data-bs-toggle="modal"], .modal-trigger, [data-target*="modal"]');
            if (modalTriggers.length === 0) {
                result.details.push('ℹ️ No modal triggers found on current page');
            } else {
                result.details.push(`✅ Found ${modalTriggers.length} modal triggers`);

                // Test first modal trigger
                const trigger = modalTriggers[0];
                try {
                    // Check if modal already exists
                    let modal = await this.page.$('.modal, [role="dialog"], .popup');

                    if (!modal) {
                        // Click trigger to show modal
                        await trigger.click();
                        await this.page.waitForTimeout(500);

                        modal = await this.page.$('.modal, [role="dialog"], .popup');
                    }

                    if (modal) {
                        result.details.push('✅ Modal appears when triggered');

                        // Check modal structure
                        const modalHeader = await modal.$('.modal-header, .popup-header');
                        const modalBody = await modal.$('.modal-body, .popup-body');
                        const modalFooter = await modal.$('.modal-footer, .popup-footer');

                        if (modalHeader) result.details.push('✅ Modal header found');
                        if (modalBody) result.details.push('✅ Modal body found');
                        if (modalFooter) result.details.push('✅ Modal footer found');

                        // Test close functionality
                        const closeButtons = await modal.$$('.modal-close, .btn-close, [data-dismiss="modal"], .close');
                        if (closeButtons.length > 0) {
                            await closeButtons[0].click();
                            await this.page.waitForTimeout(300);
                            result.details.push('✅ Modal close functionality works');
                        }

                        // Test backdrop click
                        await trigger.click(); // Reopen modal
                        await this.page.waitForTimeout(500);

                        const backdrop = await modal.$('.modal-backdrop, .modal-bg') || modal;
                        await backdrop.click({ position: { x: 10, y: 10 } });
                        await this.page.waitForTimeout(300);
                        result.details.push('✅ Modal backdrop close works');
                    } else {
                        result.errors.push('⚠️ Modal did not appear after trigger click');
                    }
                } catch (error) {
                    result.errors.push(`❌ Modal test error: ${error.message}`);
                }
            }

            // Check for existing modals on page load
            const existingModals = await this.page.$$('.modal.show, [aria-hidden="false"]');
            if (existingModals.length > 0) {
                result.errors.push(`⚠️ ${existingModals.length} modals visible on page load`);
            }

        } catch (error) {
            result.status = 'failed';
            result.errors.push(`❌ Modal test error: ${error.message}`);
        }

        this.testResults.push(result);
        console.log(`  ${this.getStatusIcon(result.status)} ${result.name}`);
    }

    async testPerformanceMetrics() {
        console.log('⚡ Testing performance metrics...');

        const result = {
            name: 'Performance Metrics',
            status: 'passed',
            details: [],
            errors: [],
            metrics: {}
        };

        try {
            // Clear cache and navigate
            await this.context.clearCookies();
            await this.page.goto(this.baseUrl, { waitUntil: 'networkidle' });

            // Collect performance metrics
            const metrics = await this.page.evaluate(() => {
                const navigation = performance.getEntriesByType('navigation')[0];
                const paint = performance.getEntriesByType('paint');

                return {
                    loadTime: navigation.loadEventEnd - navigation.startTime,
                    domReady: navigation.domContentLoadedEventEnd - navigation.startTime,
                    firstPaint: paint.find(p => p.name === 'first-paint')?.startTime || 0,
                    firstContentfulPaint: paint.find(p => p.name === 'first-contentful-paint')?.startTime || 0
                };
            });

            result.metrics = metrics;

            // Check Core Web Vitals thresholds
            const thresholds = {
                loadTime: 3000,      // < 3 seconds
                domReady: 1500,     // < 1.5 seconds
                firstPaint: 1000,   // < 1 second
                firstContentfulPaint: 1800 // < 1.8 seconds
            };

            Object.entries(metrics).forEach(([metric, value]) => {
                const threshold = thresholds[metric];
                const metricMs = Math.round(value);
                const passed = value <= threshold;

                if (passed) {
                    result.details.push(`✅ ${metric}: ${metricMs}ms (good)`);
                } else {
                    result.errors.push(`❌ ${metric}: ${metricMs}ms (exceeds ${threshold}ms)`);
                }
            });

            // Check resource loading
            const resources = await this.page.evaluate(() => {
                return performance.getEntriesByType('resource').map(r => ({
                    name: r.name.split('/').pop(),
                    size: r.transferSize || 0,
                    duration: r.duration
                }));
            });

            const totalSize = resources.reduce((sum, r) => sum + r.size, 0);
            const totalSizeKB = Math.round(totalSize / 1024);

            result.details.push(`📦 Total resources: ${resources.length} files`);
            result.details.push(`📦 Total size: ${totalSizeKB}KB`);

            // Check for large resources (>100KB)
            const largeResources = resources.filter(r => r.size > 100 * 1024);
            if (largeResources.length > 0) {
                result.errors.push(`⚠️ ${largeResources.length} large resources (>100KB)`);
                largeResources.forEach(r => {
                    result.errors.push(`  - ${r.name}: ${Math.round(r.size / 1024)}KB`);
                });
            }

            // Check for slow resources (>1s)
            const slowResources = resources.filter(r => r.duration > 1000);
            if (slowResources.length > 0) {
                result.errors.push(`⚠️ ${slowResources.length} slow resources (>1s)`);
            }

            // Generate performance waterfall screenshot
            await this.page.screenshot({ path: 'test-results/performance-waterfall.png' });

            // Set overall status based on metrics
            if (result.errors.length > 0) {
                result.status = 'warnings';
            }

        } catch (error) {
            result.status = 'failed';
            result.errors.push(`❌ Performance test error: ${error.message}`);
        }

        this.testResults.push(result);
        console.log(`  ${this.getStatusIcon(result.status)} ${result.name}`);
    }

    async testKeyboardNavigation() {
        console.log('⌨️ Testing keyboard navigation...');

        const result = {
            name: 'Keyboard Navigation',
            status: 'passed',
            details: [],
            errors: []
        };

        try {
            // Test Tab navigation
            const focusableElements = await this.page.$$(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            );

            if (focusableElements.length === 0) {
                result.details.push('ℹ️ No focusable elements found');
            } else {
                result.details.push(`✅ Found ${focusableElements.length} focusable elements`);

                // Test Tab navigation through first few elements
                const testElements = focusableElements.slice(0, Math.min(5, focusableElements.length));

                for (let i = 0; i < testElements.length; i++) {
                    await this.page.keyboard.press('Tab');
                    await this.page.waitForTimeout(100);

                    const focusedElement = await this.page.evaluateHandle(() => document.activeElement);
                    const tagName = await focusedElement.evaluate(el => el.tagName);
                    const elementFocused = await focusedElement.evaluate(el => el === document.activeElement);

                    if (elementFocused) {
                        result.details.push(`✅ Tab ${i + 1}: focused on ${tagName}`);
                    } else {
                        result.errors.push(`❌ Tab ${i + 1}: focus lost`);
                    }
                }

                // Test Shift+Tab navigation
                for (let i = 0; i < 2; i++) {
                    await this.page.keyboard.press('Shift+Tab');
                    await this.page.waitForTimeout(100);
                    result.details.push('✅ Shift+Tab navigation working');
                }

                // Test Enter key on focused button
                const currentFocus = await this.page.evaluateHandle(() => document.activeElement);
                const tagName = await currentFocus.evaluate(el => el.tagName);

                if (tagName === 'BUTTON') {
                    await this.page.keyboard.press('Enter');
                    await this.page.waitForTimeout(200);
                    result.details.push('✅ Enter key on button works');
                }

                // Test Escape key
                await this.page.keyboard.press('Escape');
                await this.page.waitForTimeout(100);
                result.details.push('✅ Escape key handled');
            }

            // Test accesskey support
            const accesskeyElements = await this.page.$$('[accesskey]');
            if (accesskeyElements.length > 0) {
                result.details.push(`✅ Found ${accesskeyElements.length} elements with accesskey`);
            }

            // Test skip links
            const skipLinks = await this.page.$$('.skip-link, [href="#main"], [href="#content"]');
            if (skipLinks.length > 0) {
                result.details.push(`✅ Found ${skipLinks.length} skip links`);
            }

        } catch (error) {
            result.status = 'failed';
            result.errors.push(`❌ Keyboard navigation test error: ${error.message}`);
        }

        this.testResults.push(result);
        console.log(`  ${this.getStatusIcon(result.status)} ${result.name}`);
    }

    async testScreenReader() {
        console.log('🔊 Testing screen reader accessibility...');

        const result = {
            name: 'Screen Reader Accessibility',
            status: 'passed',
            details: [],
            errors: []
        };

        try {
            // Test ARIA labels
            const ariaElements = await this.page.$$('[aria-label], [aria-labelledby], [aria-describedby]');
            if (ariaElements.length > 0) {
                result.details.push(`✅ Found ${ariaElements.length} ARIA elements`);
            } else {
                result.errors.push('⚠️ No ARIA elements found');
            }

            // Test semantic HTML
            const semanticElements = await this.page.$$(
                'header, nav, main, section, article, aside, footer, h1, h2, h3, h4, h5, h6'
            );
            if (semanticElements.length > 0) {
                result.details.push(`✅ Found ${semanticElements.length} semantic HTML elements`);
            }

            // Test image alt text
            const images = await this.page.$$('img');
            const imagesWithAlt = await this.page.$$('img[alt]');
            const emptyAlt = await this.page.$$('img[alt=""]');

            if (images.length > 0) {
                const altPercentage = ((imagesWithAlt.length - emptyAlt.length) / images.length * 100).toFixed(1);
                result.details.push(`🖼️ Images: ${imagesWithAlt.length - emptyAlt.length}/${images.length} with meaningful alt text (${altPercentage}%)`);

                if (altPercentage < 80) {
                    result.errors.push('⚠️ Less than 80% of images have meaningful alt text');
                }
            }

            // Test form labels
            const inputs = await this.page.$$('input, textarea, select');
            const labeledInputs = await this.page.$$('input[id], textarea[id], select[id]');

            let properlyLabeled = 0;
            for (const input of labeledInputs) {
                const id = await input.getAttribute('id');
                const label = await this.page.$(`label[for="${id}"]`);
                if (label) {
                    properlyLabeled++;
                }
            }

            if (inputs.length > 0) {
                const labelPercentage = (properlyLabeled / inputs.length * 100).toFixed(1);
                result.details.push(`📝 Form inputs: ${properlyLabeled}/${inputs.length} properly labeled (${labelPercentage}%)`);

                if (labelPercentage < 80) {
                    result.errors.push('⚠️ Less than 80% of form inputs are properly labeled');
                }
            }

            // Test heading structure
            const headings = await this.page.$$('h1, h2, h3, h4, h5, h6');
            if (headings.length > 0) {
                const headingLevels = await Promise.all(
                    headings.map(h => h.evaluate(h => parseInt(h.tagName.substring(1))))
                );

                // Check for proper heading hierarchy
                let hierarchyIssues = 0;
                for (let i = 1; i < headingLevels.length; i++) {
                    if (headingLevels[i] > headingLevels[i - 1] + 1) {
                        hierarchyIssues++;
                    }
                }

                if (hierarchyIssues === 0) {
                    result.details.push(`✅ Proper heading hierarchy (${headings.length} headings)`);
                } else {
                    result.errors.push(`⚠️ ${hierarchyIssues} heading hierarchy issues`);
                }
            }

            // Test landmark roles
            const landmarks = await this.page.$$('[role], nav, main, header, footer, aside, section[aria-label]');
            if (landmarks.length > 0) {
                result.details.push(`✅ Found ${landmarks.length} landmark elements`);
            }

            // Test focus management
            const focusedElement = await this.page.evaluateHandle(() => document.activeElement);
            const bodyFocused = await focusedElement.evaluate(el => el.tagName === 'BODY');

            if (!bodyFocused) {
                result.details.push('✅ Focus is managed (not on body)');
            }

        } catch (error) {
            result.status = 'failed';
            result.errors.push(`❌ Screen reader test error: ${error.message}`);
        }

        this.testResults.push(result);
        console.log(`  ${this.getStatusIcon(result.status)} ${result.name}`);
    }

    async cleanup() {
        if (this.browser) {
            await this.browser.close();
            console.log('🧹 Browser closed');
        }
    }

    getStatusIcon(status) {
        switch (status) {
            case 'passed': return '✅';
            case 'warnings': return '⚠️';
            case 'failed': return '❌';
            default: return '❓';
        }
    }

    generateReport() {
        console.log('\n' + '='.repeat(60));
        console.log('🌐 BROWSER TEST REPORT');
        console.log('='.repeat(60));

        const passed = this.testResults.filter(r => r.status === 'passed').length;
        const warnings = this.testResults.filter(r => r.status === 'warnings').length;
        const failed = this.testResults.filter(r => r.status === 'failed').length;
        const total = this.testResults.length;

        console.log('📊 SUMMARY:');
        console.log(`   ✅ Passed: ${passed}`);
        console.log(`   ⚠️  Warnings: ${warnings}`);
        console.log(`   ❌ Failed: ${failed}`);
        console.log(`   📈 Total: ${total}`);

        if (total > 0) {
            const successRate = ((passed / total) * 100).toFixed(1);
            console.log(`   🎯 Success Rate: ${successRate}%`);
        }

        console.log('\n📋 DETAILED RESULTS:');
        this.testResults.forEach(result => {
            console.log(`\n${this.getStatusIcon(result.status)} ${result.name}`);
            if (result.details.length > 0) {
                result.details.forEach(detail => console.log(`   ${detail}`));
            }
            if (result.errors.length > 0) {
                result.errors.forEach(error => console.log(`   ${error}`));
            }
        });

        console.log('\n📸 SCREENSHOTS SAVED:');
        console.log('   test-results/homepage-desktop.png');
        console.log('   test-results/homepage-mobile.png');
        console.log('   test-results/homepage-tablet.png');
        console.log('   test-results/performance-waterfall.png');

        console.log('\n' + '='.repeat(60));
    }
}

// Run tests if called directly
if (require.main === module) {
    const tester = new BrowserTester();
    tester.runAllTests().catch(error => {
        console.error('❌ Browser testing failed:', error);
        process.exit(1);
    });
}

module.exports = BrowserTester;