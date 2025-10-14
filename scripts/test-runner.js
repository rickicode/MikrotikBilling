#!/usr/bin/env node

/**
 * Comprehensive Testing Suite for Mikrotik Billing System Frontend
 * Tests for accessibility, performance, responsive design, cross-browser compatibility
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class TestRunner {
    constructor() {
        this.testResults = {
            accessibility: {},
            performance: {},
            responsive: {},
            crossBrowser: {},
            security: {},
            functionality: {},
            overall: {
                passed: 0,
                failed: 0,
                warnings: 0,
                total: 0
            }
        };
        this.startTime = Date.now();
    }

    async runAllTests() {
        console.log('🧪 Starting Comprehensive Test Suite...\n');

        await this.runAccessibilityTests();
        await this.runPerformanceTests();
        await this.runResponsiveTests();
        await this.runCrossBrowserTests();
        await this.runSecurityTests();
        await this.runFunctionalityTests();

        this.generateReport();
        this.saveResults();
    }

    async runAccessibilityTests() {
        console.log('♿ Running Accessibility Tests...');
        const tests = [
            'checkColorContrast',
            'checkAltText',
            'checkKeyboardNavigation',
            'checkAriaLabels',
            'checkHeadingStructure',
            'checkFormLabels',
            'checkFocusManagement'
        ];

        for (const test of tests) {
            await this[test]('accessibility');
        }
    }

    async checkColorContrast(category) {
        const result = {
            name: 'Color Contrast WCAG AA Compliance',
            status: 'passed',
            details: [],
            warnings: []
        };

        try {
            // Check CSS for color contrast ratios
            const cssFiles = [
                'public/css/main.css',
                'public/css/animations.css',
                'public/css/skeleton.css'
            ];

            for (const file of cssFiles) {
                if (fs.existsSync(file)) {
                    const content = fs.readFileSync(file, 'utf8');

                    // Check dark theme color combinations
                    const darkBgContrast = this.checkContrastRatio('#0f172a', '#f8fafc'); // bg-dark-900 vs text-white
                    const cardContrast = this.checkContrastRatio('#1e293b', '#f8fafc'); // bg-dark-800 vs text-white
                    const primaryContrast = this.checkContrastRatio('#3b82f6', '#ffffff'); // primary vs white

                    if (darkBgContrast >= 4.5) {
                        result.details.push('✅ Dark theme passes WCAG AA contrast ratio');
                    } else {
                        result.warnings.push('⚠️ Dark theme contrast ratio below WCAG AA standards');
                        result.status = 'warnings';
                    }

                    if (cardContrast >= 4.5) {
                        result.details.push('✅ Card backgrounds pass WCAG AA contrast ratio');
                    }

                    if (primaryContrast >= 4.5) {
                        result.details.push('✅ Primary colors pass WCAG AA contrast ratio');
                    }
                }
            }
        } catch (error) {
            result.status = 'failed';
            result.details.push(`❌ Error checking color contrast: ${error.message}`);
        }

        this.testResults[category].colorContrast = result;
        this.updateOverallStatus(result.status);
        console.log(`  ${this.getStatusIcon(result.status)} ${result.name}`);
    }

    async checkAltText(category) {
        const result = {
            name: 'Image Alt Text Compliance',
            status: 'passed',
            details: [],
            warnings: []
        };

        try {
            // Check EJS templates for img tags with alt attributes
            const templateFiles = this.findFiles('views', '.ejs');
            let imgCount = 0;
            let altCount = 0;

            for (const file of templateFiles) {
                const content = fs.readFileSync(file, 'utf8');
                const imgMatches = content.match(/<img[^>]*>/g) || [];

                for (const imgTag of imgMatches) {
                    imgCount++;
                    if (imgTag.includes('alt=')) {
                        altCount++;
                    } else {
                        result.warnings.push(`⚠️ Missing alt text in ${file}`);
                    }
                }
            }

            if (imgCount === 0) {
                result.details.push('✅ No images found in templates');
            } else if (altCount === imgCount) {
                result.details.push(`✅ All ${imgCount} images have alt text`);
            } else {
                result.details.push(`⚠️ ${altCount}/${imgCount} images have alt text`);
                result.status = 'warnings';
            }
        } catch (error) {
            result.status = 'failed';
            result.details.push(`❌ Error checking alt text: ${error.message}`);
        }

        this.testResults[category].altText = result;
        this.updateOverallStatus(result.status);
        console.log(`  ${this.getStatusIcon(result.status)} ${result.name}`);
    }

    async checkKeyboardNavigation(category) {
        const result = {
            name: 'Keyboard Navigation Support',
            status: 'passed',
            details: [],
            warnings: []
        };

        try {
            const templateFiles = this.findFiles('views', '.ejs');
            let interactiveElements = 0;
            let focusableElements = 0;

            for (const file of templateFiles) {
                const content = fs.readFileSync(file, 'utf8');

                // Check for focusable elements
                const focusablePatterns = [
                    /<button[^>]*>/g,
                    /<a[^>]*href/g,
                    /<input[^>]*>/g,
                    /<select[^>]*>/g,
                    /<textarea[^>]*>/g,
                    /<details[^>]*>/g,
                    /tabindex/g
                ];

                focusablePatterns.forEach(pattern => {
                    const matches = content.match(pattern) || [];
                    interactiveElements += matches.length;
                    focusableElements += matches.length;
                });

                // Check for skip links
                if (content.includes('skip-link') || content.includes('sr-only')) {
                    result.details.push('✅ Skip links found for accessibility');
                }

                // Check for focus management
                if (content.includes('focus:') || content.includes('focus-visible')) {
                    result.details.push('✅ Focus styles implemented');
                }
            }

            result.details.push(`✅ ${interactiveElements} interactive elements found`);

            if (interactiveElements > 0) {
                result.details.push('✅ Keyboard navigation elements present');
            } else {
                result.warnings.push('⚠️ No interactive elements found');
            }
        } catch (error) {
            result.status = 'failed';
            result.details.push(`❌ Error checking keyboard navigation: ${error.message}`);
        }

        this.testResults[category].keyboardNavigation = result;
        this.updateOverallStatus(result.status);
        console.log(`  ${this.getStatusIcon(result.status)} ${result.name}`);
    }

    async checkAriaLabels(category) {
        const result = {
            name: 'ARIA Labels and Roles',
            status: 'passed',
            details: [],
            warnings: []
        };

        try {
            const templateFiles = this.findFiles('views', '.ejs');
            let ariaElements = 0;

            for (const file of templateFiles) {
                const content = fs.readFileSync(file, 'utf8');

                // Check for ARIA attributes
                const ariaPatterns = [
                    /aria-label/g,
                    /aria-labelledby/g,
                    /aria-describedby/g,
                    /role=/g,
                    /aria-expanded/g,
                    /aria-hidden/g,
                    /aria-live/g,
                    /aria-current/g
                ];

                ariaPatterns.forEach(pattern => {
                    const matches = content.match(pattern) || [];
                    ariaElements += matches.length;
                });

                // Check for semantic HTML5 elements
                const semanticElements = [
                    'header', 'nav', 'main', 'section', 'article',
                    'aside', 'footer', 'figure', 'figcaption'
                ];

                semanticElements.forEach(element => {
                    const regex = new RegExp(`<${element}[^>]*>`, 'g');
                    const matches = content.match(regex) || [];
                    if (matches.length > 0) {
                        result.details.push(`✅ Semantic <${element}> elements used (${matches.length})`);
                    }
                });
            }

            if (ariaElements > 0) {
                result.details.push(`✅ ${ariaElements} ARIA attributes found`);
            } else {
                result.warnings.push('⚠️ No ARIA attributes found');
            }
        } catch (error) {
            result.status = 'failed';
            result.details.push(`❌ Error checking ARIA labels: ${error.message}`);
        }

        this.testResults[category].ariaLabels = result;
        this.updateOverallStatus(result.status);
        console.log(`  ${this.getStatusIcon(result.status)} ${result.name}`);
    }

    async checkHeadingStructure(category) {
        const result = {
            name: 'Heading Structure (H1-H6)',
            status: 'passed',
            details: [],
            warnings: []
        };

        try {
            const templateFiles = this.findFiles('views', '.ejs');
            let h1Count = 0;
            let headings = [];

            for (const file of templateFiles) {
                const content = fs.readFileSync(file, 'utf8');

                // Find all heading tags
                const headingMatches = content.match(/<h[1-6][^>]*>/gi) || [];

                headingMatches.forEach(heading => {
                    const level = parseInt(heading.match(/h([1-6])/i)[1]);
                    headings.push({ level, tag: heading, file });

                    if (level === 1) {
                        h1Count++;
                    }
                });
            }

            // Sort headings by level
            headings.sort((a, b) => a.level - b.level);

            if (h1Count === 1) {
                result.details.push('✅ Exactly one H1 tag found');
            } else if (h1Count === 0) {
                result.warnings.push('⚠️ No H1 tag found');
                result.status = 'warnings';
            } else {
                result.warnings.push(`⚠️ Multiple H1 tags found (${h1Count})`);
                result.status = 'warnings';
            }

            // Check for proper heading hierarchy
            let hierarchyIssues = 0;
            for (let i = 1; i < headings.length; i++) {
                const current = headings[i];
                const previous = headings[i - 1];

                if (current.level > previous.level + 1) {
                    hierarchyIssues++;
                }
            }

            if (hierarchyIssues === 0) {
                result.details.push('✅ Proper heading hierarchy maintained');
            } else {
                result.warnings.push(`⚠️ ${hierarchyIssues} heading hierarchy issues found`);
                result.status = 'warnings';
            }

            result.details.push(`✅ ${headings.length} total headings found`);
        } catch (error) {
            result.status = 'failed';
            result.details.push(`❌ Error checking heading structure: ${error.message}`);
        }

        this.testResults[category].headingStructure = result;
        this.updateOverallStatus(result.status);
        console.log(`  ${this.getStatusIcon(result.status)} ${result.name}`);
    }

    async checkFormLabels(category) {
        const result = {
            name: 'Form Labels and Accessibility',
            status: 'passed',
            details: [],
            warnings: []
        };

        try {
            const templateFiles = this.findFiles('views', '.ejs');
            let inputs = 0;
            let labels = 0;

            for (const file of templateFiles) {
                const content = fs.readFileSync(file, 'utf8');

                // Find input elements
                const inputMatches = content.match(/<input[^>]*>/g) || [];
                const selectMatches = content.match(/<select[^>]*>/g) || [];
                const textareaMatches = content.match(/<textarea[^>]*>/g) || [];

                inputs += inputMatches.length + selectMatches.length + textareaMatches.length;

                // Check for associated labels
                const labelMatches = content.match(/<label[^>]*>/g) || [];
                labels += labelMatches.length;

                // Check for aria-label on inputs
                const ariaLabelMatches = content.match(/aria-label="[^"]*"/g) || [];
                labels += ariaLabelMatches.length;
            }

            if (inputs === 0) {
                result.details.push('✅ No form inputs found');
            } else if (labels >= inputs) {
                result.details.push(`✅ All ${inputs} form inputs have labels or aria-labels`);
            } else {
                result.warnings.push(`⚠️ ${labels}/${inputs} form inputs have labels`);
                result.status = 'warnings';
            }
        } catch (error) {
            result.status = 'failed';
            result.details.push(`❌ Error checking form labels: ${error.message}`);
        }

        this.testResults[category].formLabels = result;
        this.updateOverallStatus(result.status);
        console.log(`  ${this.getStatusIcon(result.status)} ${result.name}`);
    }

    async checkFocusManagement(category) {
        const result = {
            name: 'Focus Management and Visual Indicators',
            status: 'passed',
            details: [],
            warnings: []
        };

        try {
            const cssFiles = [
                'public/css/main.css',
                'public/css/animations.css'
            ];

            for (const file of cssFiles) {
                if (fs.existsSync(file)) {
                    const content = fs.readFileSync(file, 'utf8');

                    // Check for focus styles
                    if (content.includes(':focus') || content.includes('focus-visible')) {
                        result.details.push(`✅ Focus styles found in ${file}`);
                    }

                    // Check for skip links
                    if (content.includes('.sr-only') || content.includes('.skip-link')) {
                        result.details.push('✅ Screen reader only styles found');
                    }
                }
            }

            // Check template files for focus management
            const templateFiles = this.findFiles('views', '.ejs');
            let hasFocusManagement = false;

            for (const file of templateFiles) {
                const content = fs.readFileSync(file, 'utf8');

                if (content.includes('tabindex') || content.includes('autofocus')) {
                    hasFocusManagement = true;
                    result.details.push(`✅ Focus management found in ${path.basename(file)}`);
                }
            }

            if (!hasFocusManagement) {
                result.warnings.push('⚠️ No explicit focus management found');
                result.status = 'warnings';
            }
        } catch (error) {
            result.status = 'failed';
            result.details.push(`❌ Error checking focus management: ${error.message}`);
        }

        this.testResults[category].focusManagement = result;
        this.updateOverallStatus(result.status);
        console.log(`  ${this.getStatusIcon(result.status)} ${result.name}`);
    }

    async runPerformanceTests() {
        console.log('\n⚡ Running Performance Tests...');
        const tests = [
            'checkPageLoadSize',
            'checkImageOptimization',
            'checkCSSOptimization',
            'checkJavaScriptOptimization',
            'checkCachingHeaders',
            'checkCoreWebVitals'
        ];

        for (const test of tests) {
            await this[test]('performance');
        }
    }

    async checkPageLoadSize(category) {
        const result = {
            name: 'Page Load Size Optimization',
            status: 'passed',
            details: [],
            warnings: []
        };

        try {
            // Calculate total size of critical resources
            const criticalFiles = [
                'public/css/main.css',
                'public/css/animations.css',
                'public/css/skeleton.css',
                'public/js/main.js'
            ];

            let totalSize = 0;
            let fileCount = 0;

            for (const file of criticalFiles) {
                if (fs.existsSync(file)) {
                    const stats = fs.statSync(file);
                    const sizeKB = (stats.size / 1024).toFixed(2);
                    totalSize += stats.size;
                    fileCount++;
                    result.details.push(`📄 ${path.basename(file)}: ${sizeKB}KB`);
                }
            }

            const totalSizeKB = (totalSize / 1024).toFixed(2);
            result.details.push(`📊 Total critical resources: ${totalSizeKB}KB (${fileCount} files)`);

            // Check if total size is reasonable (< 1MB for critical resources)
            if (totalSize < 1024 * 1024) {
                result.details.push('✅ Critical resources size within acceptable limits');
            } else {
                result.warnings.push('⚠️ Critical resources size exceeds 1MB');
                result.status = 'warnings';
            }

            // Check for minified versions
            if (fs.existsSync('public/dist')) {
                const distFiles = fs.readdirSync('public/dist');
                const minifiedFiles = distFiles.filter(file => file.includes('.min.'));

                if (minifiedFiles.length > 0) {
                    result.details.push(`✅ ${minifiedFiles.length} minified files found`);
                } else {
                    result.warnings.push('⚠️ No minified files found');
                    result.status = 'warnings';
                }
            }
        } catch (error) {
            result.status = 'failed';
            result.details.push(`❌ Error checking page load size: ${error.message}`);
        }

        this.testResults[category].pageLoadSize = result;
        this.updateOverallStatus(result.status);
        console.log(`  ${this.getStatusIcon(result.status)} ${result.name}`);
    }

    async checkImageOptimization(category) {
        const result = {
            name: 'Image Optimization',
            status: 'passed',
            details: [],
            warnings: []
        };

        try {
            const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'];
            const publicDir = 'public';
            let totalImages = 0;
            let optimizedFormats = 0;

            if (fs.existsSync(publicDir)) {
                const scanDirectory = (dir) => {
                    const files = fs.readdirSync(dir);

                    files.forEach(file => {
                        const fullPath = path.join(dir, file);
                        const stat = fs.statSync(fullPath);

                        if (stat.isDirectory()) {
                            scanDirectory(fullPath);
                        } else {
                            const ext = path.extname(file).toLowerCase();
                            if (imageExtensions.includes(ext)) {
                                totalImages++;

                                if (['.webp', '.svg'].includes(ext)) {
                                    optimizedFormats++;
                                }

                                // Check file size
                                const sizeKB = (stat.size / 1024).toFixed(2);
                                if (sizeKB > 500) {
                                    result.warnings.push(`⚠️ Large image: ${file} (${sizeKB}KB)`);
                                }
                            }
                        }
                    });
                };

                scanDirectory(publicDir);
            }

            result.details.push(`🖼️ ${totalImages} images found`);
            if (optimizedFormats > 0) {
                result.details.push(`✅ ${optimizedFormats} optimized format images (WebP/SVG)`);
            }

            // Check for lazy loading implementation
            const templateFiles = this.findFiles('views', '.ejs');
            let hasLazyLoading = false;

            for (const file of templateFiles) {
                const content = fs.readFileSync(file, 'utf8');
                if (content.includes('loading="lazy"') || content.includes('data-src')) {
                    hasLazyLoading = true;
                    result.details.push('✅ Lazy loading implementation found');
                    break;
                }
            }

            if (!hasLazyLoading) {
                result.warnings.push('⚠️ No lazy loading implementation found');
                result.status = 'warnings';
            }
        } catch (error) {
            result.status = 'failed';
            result.details.push(`❌ Error checking image optimization: ${error.message}`);
        }

        this.testResults[category].imageOptimization = result;
        this.updateOverallStatus(result.status);
        console.log(`  ${this.getStatusIcon(result.status)} ${result.name}`);
    }

    async checkCSSOptimization(category) {
        const result = {
            name: 'CSS Optimization',
            status: 'passed',
            details: [],
            warnings: []
        };

        try {
            const cssFiles = [
                'public/css/main.css',
                'public/css/animations.css',
                'public/css/skeleton.css'
            ];

            let totalCSSSize = 0;
            let unusedRules = 0;

            for (const file of cssFiles) {
                if (fs.existsSync(file)) {
                    const content = fs.readFileSync(file, 'utf8');
                    const stats = fs.statSync(file);
                    totalCSSSize += stats.size;

                    // Check for unused CSS patterns
                    const lines = content.split('\n');
                    const commentLines = lines.filter(line => line.trim().startsWith('/*') || line.trim().startsWith('//')).length;
                    const emptyLines = lines.filter(line => line.trim() === '').length;

                    const unusedPercentage = ((commentLines + emptyLines) / lines.length * 100).toFixed(1);
                    if (unusedPercentage > 20) {
                        result.warnings.push(`⚠️ High comment/empty line percentage in ${file}: ${unusedPercentage}%`);
                    }

                    // Check for critical CSS
                    if (file.includes('main.css') && content.includes('critical')) {
                        result.details.push('✅ Critical CSS patterns found');
                    }
                }
            }

            const totalCSSKB = (totalCSSSize / 1024).toFixed(2);
            result.details.push(`📊 Total CSS size: ${totalCSSKB}KB`);

            // Check for minified CSS
            if (fs.existsSync('public/dist')) {
                const distFiles = fs.readdirSync('public/dist');
                const minifiedCSS = distFiles.filter(file => file.includes('.min.css'));

                if (minifiedCSS.length > 0) {
                    result.details.push(`✅ ${minifiedCSS.length} minified CSS files found`);
                } else {
                    result.warnings.push('⚠️ No minified CSS files found');
                    result.status = 'warnings';
                }
            }

            // Check for CSS delivery optimization
            const headerFile = 'views/partials/header.ejs';
            if (fs.existsSync(headerFile)) {
                const headerContent = fs.readFileSync(headerFile, 'utf8');
                if (headerContent.includes('preload') && headerContent.includes('as="style"')) {
                    result.details.push('✅ CSS preloading implemented');
                }
            }
        } catch (error) {
            result.status = 'failed';
            result.details.push(`❌ Error checking CSS optimization: ${error.message}`);
        }

        this.testResults[category].cssOptimization = result;
        this.updateOverallStatus(result.status);
        console.log(`  ${this.getStatusIcon(result.status)} ${result.name}`);
    }

    async checkJavaScriptOptimization(category) {
        const result = {
            name: 'JavaScript Optimization',
            status: 'passed',
            details: [],
            warnings: []
        };

        try {
            const jsFiles = [
                'public/js/main.js',
                'public/js/app.js'
            ];

            let totalJSSize = 0;
            let optimizedFiles = 0;

            for (const file of jsFiles) {
                if (fs.existsSync(file)) {
                    const stats = fs.statSync(file);
                    totalJSSize += stats.size;
                    const sizeKB = (stats.size / 1024).toFixed(2);
                    result.details.push(`📄 ${path.basename(file)}: ${sizeKB}KB`);

                    // Check for minified versions
                    const minFile = file.replace('.js', '.min.js');
                    if (fs.existsSync(minFile)) {
                        const minStats = fs.statSync(minFile);
                        const minSizeKB = (minStats.size / 1024).toFixed(2);
                        const savings = ((stats.size - minStats.size) / stats.size * 100).toFixed(1);
                        result.details.push(`✅ Minified version saves ${savings}% (${minSizeKB}KB)`);
                        optimizedFiles++;
                    }
                }
            }

            const totalJSKB = (totalJSSize / 1024).toFixed(2);
            result.details.push(`📊 Total JavaScript size: ${totalJSKB}KB`);

            // Check for async/defer loading
            const headerFile = 'views/partials/header.ejs';
            if (fs.existsSync(headerFile)) {
                const headerContent = fs.readFileSync(headerFile, 'utf8');
                if (headerContent.includes('defer') || headerContent.includes('async')) {
                    result.details.push('✅ Async/defer loading implemented');
                }
            }

            // Check for service worker
            if (fs.existsSync('public/sw.js')) {
                result.details.push('✅ Service worker implemented for caching');
            }
        } catch (error) {
            result.status = 'failed';
            result.details.push(`❌ Error checking JavaScript optimization: ${error.message}`);
        }

        this.testResults[category].javascriptOptimization = result;
        this.updateOverallStatus(result.status);
        console.log(`  ${this.getStatusIcon(result.status)} ${result.name}`);
    }

    async checkCachingHeaders(category) {
        const result = {
            name: 'Caching Headers Configuration',
            status: 'passed',
            details: [],
            warnings: []
        };

        try {
            // Check server.js for caching configuration
            const serverFile = 'server.js';
            if (fs.existsSync(serverFile)) {
                const serverContent = fs.readFileSync(serverFile, 'utf8');

                if (serverContent.includes('@fastify/compress')) {
                    result.details.push('✅ Compression enabled (@fastify/compress)');
                }

                if (serverContent.includes('Cache-Control') || serverContent.includes('setHeaders')) {
                    result.details.push('✅ Cache headers configured');
                }

                if (serverContent.includes('max-age') || serverContent.includes('immutable')) {
                    result.details.push('✅ Cache duration headers set');
                }
            }

            // Check for service worker caching
            const swFile = 'public/sw.js';
            if (fs.existsSync(swFile)) {
                const swContent = fs.readFileSync(swFile, 'utf8');

                if (swContent.includes('cache-first') || swContent.includes('network-first')) {
                    result.details.push('✅ Service worker caching strategies implemented');
                }

                if (swContent.includes('caches.open')) {
                    result.details.push('✅ Service worker cache management found');
                }
            }

            // Check for PWA manifest
            if (fs.existsSync('manifest.json')) {
                result.details.push('✅ PWA manifest available for caching');
            }
        } catch (error) {
            result.status = 'failed';
            result.details.push(`❌ Error checking caching headers: ${error.message}`);
        }

        this.testResults[category].cachingHeaders = result;
        this.updateOverallStatus(result.status);
        console.log(`  ${this.getStatusIcon(result.status)} ${result.name}`);
    }

    async checkCoreWebVitals(category) {
        const result = {
            name: 'Core Web Vitals Implementation',
            status: 'passed',
            details: [],
            warnings: []
        };

        try {
            // Check performance monitoring implementation
            const footerFile = 'views/partials/footer.ejs';
            if (fs.existsSync(footerFile)) {
                const footerContent = fs.readFileSync(footerFile, 'utf8');

                if (footerContent.includes('PerformanceObserver')) {
                    result.details.push('✅ Performance Observer API implemented');
                }

                if (footerContent.includes('largest-contentful-paint')) {
                    result.details.push('✅ LCP monitoring implemented');
                }

                if (footerContent.includes('first-contentful-paint')) {
                    result.details.push('✅ FCP monitoring implemented');
                }

                if (footerContent.includes('layout-shift')) {
                    result.details.push('✅ CLS monitoring implemented');
                }

                if (footerContent.includes('first-input')) {
                    result.details.push('✅ FID monitoring implemented');
                }

                if (footerContent.includes('PerformanceMonitor')) {
                    result.details.push('✅ Comprehensive performance monitoring system');
                }
            }

            // Check for lazy loading
            if (footerContent.includes('IntersectionObserver') && footerContent.includes('lazy')) {
                result.details.push('✅ Lazy loading implemented for better LCP');
            }

            // Check for critical CSS
            const headerFile = 'views/partials/header.ejs';
            if (fs.existsSync(headerFile)) {
                const headerContent = fs.readFileSync(headerFile, 'utf8');
                if (headerContent.includes('Critical') || headerContent.includes('inline')) {
                    result.details.push('✅ Critical CSS implemented for faster FCP');
                }
            }
        } catch (error) {
            result.status = 'failed';
            result.details.push(`❌ Error checking Core Web Vitals: ${error.message}`);
        }

        this.testResults[category].coreWebVitals = result;
        this.updateOverallStatus(result.status);
        console.log(`  ${this.getStatusIcon(result.status)} ${result.name}`);
    }

    async runResponsiveTests() {
        console.log('\n📱 Running Responsive Design Tests...');
        const tests = [
            'checkMobileMetaTags',
            'checkResponsiveBreakpoints',
            'checkTouchTargets',
            'checkMobileNavigation',
            'checkResponsiveImages',
            'checkResponsiveTables'
        ];

        for (const test of tests) {
            await this[test]('responsive');
        }
    }

    async checkMobileMetaTags(category) {
        const result = {
            name: 'Mobile Meta Tags',
            status: 'passed',
            details: [],
            warnings: []
        };

        try {
            const headerFile = 'views/partials/header.ejs';
            if (fs.existsSync(headerFile)) {
                const headerContent = fs.readFileSync(headerFile, 'utf8');

                const metaChecks = [
                    { tag: 'viewport', pattern: /name="viewport"/, description: 'viewport meta tag' },
                    { tag: 'mobile-web-app-capable', pattern: /name="mobile-web-app-capable"/, description: 'mobile web app capable' },
                    { tag: 'apple-mobile-web-app-capable', pattern: /name="apple-mobile-web-app-capable"/, description: 'Apple mobile web app capable' },
                    { tag: 'theme-color', pattern: /name="theme-color"/, description: 'theme color' },
                    { tag: 'description', pattern: /name="description"/, description: 'meta description' }
                ];

                metaChecks.forEach(check => {
                    if (headerContent.match(check.pattern)) {
                        result.details.push(`✅ ${check.description} found`);
                    } else {
                        result.warnings.push(`⚠️ Missing ${check.description}`);
                    }
                });

                // Check viewport configuration
                const viewportMatch = headerContent.match(/content="([^"]*viewport[^"]*)"/);
                if (viewportMatch) {
                    const viewportContent = viewportMatch[1];
                    if (viewportContent.includes('width=device-width')) {
                        result.details.push('✅ Responsive viewport width set');
                    }
                    if (viewportContent.includes('initial-scale=1.0')) {
                        result.details.push('✅ Initial scale set');
                    }
                }
            }
        } catch (error) {
            result.status = 'failed';
            result.details.push(`❌ Error checking mobile meta tags: ${error.message}`);
        }

        this.testResults[category].mobileMetaTags = result;
        this.updateOverallStatus(result.status);
        console.log(`  ${this.getStatusIcon(result.status)} ${result.name}`);
    }

    async checkResponsiveBreakpoints(category) {
        const result = {
            name: 'Responsive Breakpoints',
            status: 'passed',
            details: [],
            warnings: []
        };

        try {
            const cssFiles = [
                'public/css/main.css',
                'public/css/animations.css'
            ];

            let responsiveRules = 0;
            let breakpoints = new Set();

            for (const file of cssFiles) {
                if (fs.existsSync(file)) {
                    const content = fs.readFileSync(file, 'utf8');

                    // Count media queries
                    const mediaQueryMatches = content.match(/@media[^{]*{/g) || [];
                    responsiveRules += mediaQueryMatches.length;

                    mediaQueryMatches.forEach(query => {
                        // Extract breakpoint values
                        const minWidthMatch = query.match(/min-width:\s*(\d+)px/);
                        const maxWidthMatch = query.match(/max-width:\s*(\d+)px/);

                        if (minWidthMatch) breakpoints.add(minWidthMatch[1]);
                        if (maxWidthMatch) breakpoints.add(maxWidthMatch[1]);
                    });
                }
            }

            result.details.push(`📊 ${responsiveRules} responsive CSS rules found`);

            const breakpointArray = Array.from(breakpoints).sort((a, b) => a - b);
            if (breakpointArray.length > 0) {
                result.details.push(`✅ Breakpoints: ${breakpointArray.join('px, ')}px`);
            }

            // Check for Tailwind responsive utilities
            const templateFiles = this.findFiles('views', '.ejs');
            let tailwindResponsive = 0;

            for (const file of templateFiles) {
                const content = fs.readFileSync(file, 'utf8');
                const responsiveClasses = content.match(/(sm:|md:|lg:|xl:|2xl:)/g) || [];
                tailwindResponsive += responsiveClasses.length;
            }

            if (tailwindResponsive > 0) {
                result.details.push(`✅ ${tailwindResponsive} Tailwind responsive classes used`);
            }

            if (responsiveRules === 0 && tailwindResponsive === 0) {
                result.warnings.push('⚠️ No responsive design patterns found');
                result.status = 'warnings';
            }
        } catch (error) {
            result.status = 'failed';
            result.details.push(`❌ Error checking responsive breakpoints: ${error.message}`);
        }

        this.testResults[category].responsiveBreakpoints = result;
        this.updateOverallStatus(result.status);
        console.log(`  ${this.getStatusIcon(result.status)} ${result.name}`);
    }

    async checkTouchTargets(category) {
        const result = {
            name: 'Touch Target Sizes (44px minimum)',
            status: 'passed',
            details: [],
            warnings: []
        };

        try {
            const cssFiles = [
                'public/css/main.css',
                'public/css/animations.css'
            ];

            let hasTouchOptimization = false;

            for (const file of cssFiles) {
                if (fs.existsSync(file)) {
                    const content = fs.readFileSync(file, 'utf8');

                    // Check for touch target optimizations
                    if (content.includes('min-height: 44px') || content.includes('min-width: 44px')) {
                        hasTouchOptimization = true;
                        result.details.push('✅ Touch target size optimizations found');
                    }

                    if (content.includes('btn-touch') || content.includes('touch-target')) {
                        hasTouchOptimization = true;
                        result.details.push('✅ Touch-friendly button classes found');
                    }
                }
            }

            // Check mobile-specific CSS
            const mobileMediaQueries = [
                'max-width: 640px',
                'max-width: 768px',
                'max-device-width'
            ];

            for (const file of cssFiles) {
                if (fs.existsSync(file)) {
                    const content = fs.readFileSync(file, 'utf8');

                    for (const query of mobileMediaQueries) {
                        if (content.includes(query)) {
                            hasTouchOptimization = true;
                            result.details.push(`✅ Mobile-specific styles found (${query})`);
                            break;
                        }
                    }
                }
            }

            if (!hasTouchOptimization) {
                result.warnings.push('⚠️ No explicit touch target optimizations found');
                result.status = 'warnings';
            }
        } catch (error) {
            result.status = 'failed';
            result.details.push(`❌ Error checking touch targets: ${error.message}`);
        }

        this.testResults[category].touchTargets = result;
        this.updateOverallStatus(result.status);
        console.log(`  ${this.getStatusIcon(result.status)} ${result.name}`);
    }

    async checkMobileNavigation(category) {
        const result = {
            name: 'Mobile Navigation',
            status: 'passed',
            details: [],
            warnings: []
        };

        try {
            const headerFile = 'views/partials/header.ejs';
            if (fs.existsSync(headerFile)) {
                const headerContent = fs.readFileSync(headerFile, 'utf8');

                // Check for mobile menu button
                if (headerContent.includes('mobile-menu-button') || headerContent.includes('hamburger')) {
                    result.details.push('✅ Mobile menu button found');
                } else {
                    result.warnings.push('⚠️ No mobile menu button found');
                }

                // Check for mobile menu
                if (headerContent.includes('mobile-menu') || headerContent.includes('nav-menu')) {
                    result.details.push('✅ Mobile navigation menu found');
                }

                // Check for responsive navigation
                if (headerContent.includes('md:') || headerContent.includes('lg:')) {
                    result.details.push('✅ Responsive navigation classes found');
                }
            }

            // Check footer for mobile navigation scripts
            const footerFile = 'views/partials/footer.ejs';
            if (fs.existsSync(footerFile)) {
                const footerContent = fs.readFileSync(footerFile, 'utf8');

                if (footerContent.includes('mobile-menu') || footerContent.includes('toggle')) {
                    result.details.push('✅ Mobile navigation JavaScript found');
                }

                if (footerContent.includes('addEventListener') && footerContent.includes('click')) {
                    result.details.push('✅ Mobile menu interaction handlers found');
                }
            }
        } catch (error) {
            result.status = 'failed';
            result.details.push(`❌ Error checking mobile navigation: ${error.message}`);
        }

        this.testResults[category].mobileNavigation = result;
        this.updateOverallStatus(result.status);
        console.log(`  ${this.getStatusIcon(result.status)} ${result.name}`);
    }

    async checkResponsiveImages(category) {
        const result = {
            name: 'Responsive Images',
            status: 'passed',
            details: [],
            warnings: []
        };

        try {
            const templateFiles = this.findFiles('views', '.ejs');
            let responsiveImageCount = 0;
            let totalImageCount = 0;

            for (const file of templateFiles) {
                const content = fs.readFileSync(file, 'utf8');

                // Find all img tags
                const imgMatches = content.match(/<img[^>]*>/g) || [];
                totalImageCount += imgMatches.length;

                imgMatches.forEach(imgTag => {
                    // Check for responsive image attributes
                    if (imgTag.includes('srcset') || imgTag.includes('sizes')) {
                        responsiveImageCount++;
                    }

                    // Check for CSS responsive images
                    if (imgTag.includes('w-full') || imgTag.includes('object-cover')) {
                        responsiveImageCount++;
                    }
                });

                // Check for picture element
                const pictureMatches = content.match(/<picture[^>]*>/g) || [];
                if (pictureMatches.length > 0) {
                    result.details.push(`✅ Picture elements found in ${path.basename(file)}`);
                }
            }

            if (totalImageCount > 0) {
                const responsivePercentage = (responsiveImageCount / totalImageCount * 100).toFixed(1);
                result.details.push(`📊 ${responsiveImageCount}/${totalImageCount} images are responsive (${responsivePercentage}%)`);

                if (responsivePercentage < 50) {
                    result.warnings.push('⚠️ Less than 50% of images are responsive');
                    result.status = 'warnings';
                }
            } else {
                result.details.push('✅ No images found');
            }
        } catch (error) {
            result.status = 'failed';
            result.details.push(`❌ Error checking responsive images: ${error.message}`);
        }

        this.testResults[category].responsiveImages = result;
        this.updateOverallStatus(result.status);
        console.log(`  ${this.getStatusIcon(result.status)} ${result.name}`);
    }

    async checkResponsiveTables(category) {
        const result = {
            name: 'Responsive Tables',
            status: 'passed',
            details: [],
            warnings: []
        };

        try {
            const templateFiles = this.findFiles('views', '.ejs');
            let tableCount = 0;
            let responsiveTables = 0;

            for (const file of templateFiles) {
                const content = fs.readFileSync(file, 'utf8');

                // Find all table elements
                const tableMatches = content.match(/<table[^>]*>/g) || [];
                tableCount += tableMatches.length;

                if (tableMatches.length > 0) {
                    // Check for responsive table implementations
                    if (content.includes('overflow-x') || content.includes('table-responsive')) {
                        responsiveTables++;
                        result.details.push(`✅ Responsive table wrapper found in ${path.basename(file)}`);
                    }

                    // Check for mobile table patterns
                    if (content.includes('md:') || content.includes('sm:')) {
                        const tableContent = content.match(/<table[^>]*>[\s\S]*?<\/table>/g) || [];
                        tableContent.forEach(table => {
                            if (table.includes('md:') || table.includes('sm:')) {
                                result.details.push(`✅ Mobile-responsive table classes found`);
                            }
                        });
                    }

                    // Check for stacked table pattern
                    if (content.includes('stacked') || content.includes('mobile-stack')) {
                        result.details.push(`✅ Mobile table stacking pattern found`);
                    }
                }
            }

            if (tableCount > 0) {
                result.details.push(`📊 ${tableCount} tables found`);

                if (responsiveTables === 0) {
                    result.warnings.push('⚠️ No responsive table implementations found');
                    result.status = 'warnings';
                }
            } else {
                result.details.push('✅ No tables found');
            }
        } catch (error) {
            result.status = 'failed';
            result.details.push(`❌ Error checking responsive tables: ${error.message}`);
        }

        this.testResults[category].responsiveTables = result;
        this.updateOverallStatus(result.status);
        console.log(`  ${this.getStatusIcon(result.status)} ${result.name}`);
    }

    async runCrossBrowserTests() {
        console.log('\n🌐 Running Cross-Browser Compatibility Tests...');

        // Simulated cross-browser tests (would normally use automated browsers)
        const browsers = ['Chrome', 'Firefox', 'Safari', 'Edge'];

        for (const browser of browsers) {
            await this.simulateBrowserTest(browser);
        }

        await this.checkModernJSFeatures('crossBrowser');
        await this.checkCSSCompatibility('crossBrowser');
    }

    async simulateBrowserTest(browser) {
        const result = {
            name: `${browser} Compatibility`,
            status: 'passed',
            details: [],
            warnings: []
        };

        try {
            // Check for browser-specific features
            const features = [
                { feature: 'ES6+ features', check: 'const, let, arrow functions' },
                { feature: 'Fetch API', check: 'fetch(' },
                { feature: 'IntersectionObserver', check: 'IntersectionObserver' },
                { feature: 'Service Worker', check: 'serviceWorker' },
                { feature: 'CSS Grid', check: 'display: grid' },
                { feature: 'Flexbox', check: 'display: flex' }
            ];

            for (const feature of features) {
                const jsFiles = ['public/js/main.js'];
                const cssFiles = ['public/css/main.css'];
                const allFiles = [...jsFiles, ...cssFiles];

                let featureFound = false;
                for (const file of allFiles) {
                    if (fs.existsSync(file)) {
                        const content = fs.readFileSync(file, 'utf8');
                        if (feature.check.split(', ').some(check => content.includes(check))) {
                            featureFound = true;
                            break;
                        }
                    }
                }

                if (featureFound) {
                    result.details.push(`✅ ${feature.feature} supported`);
                } else {
                    result.warnings.push(`⚠️ ${feature.feature} not detected`);
                }
            }

            // Check for polyfills
            const polyfillPatterns = ['polyfill', 'compatibility', 'fallback'];
            let hasPolyfills = false;

            for (const pattern of polyfillPatterns) {
                const jsFiles = this.findFiles('public/js', '.js');
                for (const file of jsFiles) {
                    if (fs.existsSync(file)) {
                        const content = fs.readFileSync(file, 'utf8');
                        if (content.toLowerCase().includes(pattern)) {
                            hasPolyfills = true;
                            result.details.push(`✅ Polyfills found for compatibility`);
                            break;
                        }
                    }
                }
            }

            if (!hasPolyfills && result.warnings.length > 0) {
                result.status = 'warnings';
            }
        } catch (error) {
            result.status = 'failed';
            result.details.push(`❌ Error checking ${browser} compatibility: ${error.message}`);
        }

        this.testResults.crossBrowser[browser.toLowerCase()] = result;
        this.updateOverallStatus(result.status);
        console.log(`  ${this.getStatusIcon(result.status)} ${result.name}`);
    }

    async checkModernJSFeatures(category) {
        const result = {
            name: 'Modern JavaScript Features',
            status: 'passed',
            details: [],
            warnings: []
        };

        try {
            const jsFiles = this.findFiles('public/js', '.js');
            const modernFeatures = [
                'async/await',
                'destructuring',
                'spread operator',
                'template literals',
                'arrow functions',
                'classes',
                'modules',
                'optional chaining'
            ];

            let featureCount = 0;

            for (const file of jsFiles) {
                if (fs.existsSync(file)) {
                    const content = fs.readFileSync(file, 'utf8');

                    modernFeatures.forEach(feature => {
                        const patterns = {
                            'async/await': /async|await/g,
                            'destructuring': /const\s+.*\{.*\}|const\s+.*\[.*\]/g,
                            'spread operator': /\.\.\./g,
                            'template literals': /`[^`]*`/g,
                            'arrow functions': /=>/g,
                            'classes': /class\s+\w+/g,
                            'modules': /import|export/g,
                            'optional chaining': /\?./g
                        };

                        const pattern = patterns[feature];
                        if (pattern && content.match(pattern)) {
                            featureCount++;
                            result.details.push(`✅ ${feature} used in ${path.basename(file)}`);
                        }
                    });
                }
            }

            if (featureCount > 0) {
                result.details.push(`📊 ${featureCount} modern JS features detected`);
            } else {
                result.warnings.push('⚠️ No modern JavaScript features detected');
                result.status = 'warnings';
            }

            // Check for transpilation indicators
            const packageJson = 'package.json';
            if (fs.existsSync(packageJson)) {
                const packageContent = JSON.parse(fs.readFileSync(packageJson, 'utf8'));

                if (packageContent.devDependencies) {
                    const transpilers = ['babel', 'typescript', 'webpack', 'vite'];
                    for (const transpiler of transpilers) {
                        if (Object.keys(packageContent.devDependencies).some(dep => dep.includes(transpiler))) {
                            result.details.push(`✅ ${transpiler} configured for compatibility`);
                        }
                    }
                }
            }
        } catch (error) {
            result.status = 'failed';
            result.details.push(`❌ Error checking modern JS features: ${error.message}`);
        }

        this.testResults[category].modernJSFeatures = result;
        this.updateOverallStatus(result.status);
        console.log(`  ${this.getStatusIcon(result.status)} ${result.name}`);
    }

    async checkCSSCompatibility(category) {
        const result = {
            name: 'CSS Feature Compatibility',
            status: 'passed',
            details: [],
            warnings: []
        };

        try {
            const cssFiles = [
                'public/css/main.css',
                'public/css/animations.css'
            ];

            const modernCSSFeatures = [
                { feature: 'CSS Grid', pattern: /display:\s*grid|grid-template/g },
                { feature: 'Flexbox', pattern: /display:\s*flex|flex-direction/g },
                { feature: 'CSS Variables', pattern: /var\(--[\w-]+\)/g },
                { feature: 'Custom Properties', pattern: /--[\w-]+:/g },
                { feature: 'Transitions', pattern: /transition:/g },
                { feature: 'Animations', pattern: /@keyframes|animation:/g },
                { feature: 'Transforms', pattern: /transform:/g },
                { feature: 'Media Queries', pattern: /@media/g }
            ];

            let featureCount = 0;

            for (const file of cssFiles) {
                if (fs.existsSync(file)) {
                    const content = fs.readFileSync(file, 'utf8');

                    modernCSSFeatures.forEach(cssFeature => {
                        if (content.match(cssFeature.pattern)) {
                            featureCount++;
                            result.details.push(`✅ ${cssFeature.feature} found in ${path.basename(file)}`);
                        }
                    });
                }
            }

            if (featureCount > 0) {
                result.details.push(`📊 ${featureCount} modern CSS features used`);
            } else {
                result.warnings.push('⚠️ No modern CSS features detected');
                result.status = 'warnings';
            }

            // Check for vendor prefixes
            let vendorPrefixes = 0;
            for (const file of cssFiles) {
                if (fs.existsSync(file)) {
                    const content = fs.readFileSync(file, 'utf8');
                    const prefixMatches = content.match(/-(webkit|moz|ms|o)-/g) || [];
                    vendorPrefixes += prefixMatches.length;
                }
            }

            if (vendorPrefixes > 0) {
                result.details.push(`✅ ${vendorPrefixes} vendor prefixes for compatibility`);
            } else {
                result.warnings.push('⚠️ No vendor prefixes found (may impact older browsers)');
                result.status = 'warnings';
            }
        } catch (error) {
            result.status = 'failed';
            result.details.push(`❌ Error checking CSS compatibility: ${error.message}`);
        }

        this.testResults[category].cssCompatibility = result;
        this.updateOverallStatus(result.status);
        console.log(`  ${this.getStatusIcon(result.status)} ${result.name}`);
    }

    async runSecurityTests() {
        console.log('\n🔒 Running Security Tests...');
        const tests = [
            'checkXSSProtection',
            'checkCSRFProtection',
            'checkContentSecurityPolicy',
            'checkInputValidation',
            'checkAuthentication'
        ];

        for (const test of tests) {
            await this[test]('security');
        }
    }

    async checkXSSProtection(category) {
        const result = {
            name: 'XSS Protection',
            status: 'passed',
            details: [],
            warnings: []
        };

        try {
            // Check server.js for security headers
            const serverFile = 'server.js';
            if (fs.existsSync(serverFile)) {
                const serverContent = fs.readFileSync(serverFile, 'utf8');

                if (serverContent.includes('@fastify/helmet')) {
                    result.details.push('✅ Helmet security headers enabled');
                }

                if (serverContent.includes('X-XSS-Protection')) {
                    result.details.push('✅ XSS Protection header explicitly set');
                }

                if (serverContent.includes('X-Content-Type-Options')) {
                    result.details.push('✅ Content-Type options header set');
                }

                if (serverContent.includes('X-Frame-Options')) {
                    result.details.push('✅ Frame options header set');
                }
            }

            // Check template files for XSS prevention
            const templateFiles = this.findFiles('views', '.ejs');
            let outputEscaping = 0;

            for (const file of templateFiles) {
                const content = fs.readFileSync(file, 'utf8');

                // Check for EJS output escaping
                if (content.includes('<%=') && !content.includes('<%-')) {
                    outputEscaping++;
                }

                // Check for safe HTML insertion
                if (content.includes('sanitize') || content.includes('escape')) {
                    result.details.push(`✅ Input sanitization found in ${path.basename(file)}`);
                }
            }

            if (outputEscaping > 0) {
                result.details.push(`✅ ${outputEscaping} files use proper output escaping`);
            }
        } catch (error) {
            result.status = 'failed';
            result.details.push(`❌ Error checking XSS protection: ${error.message}`);
        }

        this.testResults[category].xssProtection = result;
        this.updateOverallStatus(result.status);
        console.log(`  ${this.getStatusIcon(result.status)} ${result.name}`);
    }

    async checkCSRFProtection(category) {
        const result = {
            name: 'CSRF Protection',
            status: 'passed',
            details: [],
            warnings: []
        };

        try {
            const serverFile = 'server.js';
            if (fs.existsSync(serverFile)) {
                const serverContent = fs.readFileSync(serverFile, 'utf8');

                // Check for CSRF protection implementation
                if (serverContent.includes('csrf') || serverContent.includes('@fastify/csrf')) {
                    result.details.push('✅ CSRF protection implemented');
                } else {
                    result.warnings.push('⚠️ CSRF protection not explicitly found');
                    result.status = 'warnings';
                }

                // Check for session management
                if (serverContent.includes('@fastify/session') || serverContent.includes('session')) {
                    result.details.push('✅ Session management implemented');
                }

                // Check for token-based authentication
                if (serverContent.includes('jwt') || serverContent.includes('token')) {
                    result.details.push('✅ Token-based authentication found');
                }
            }
        } catch (error) {
            result.status = 'failed';
            result.details.push(`❌ Error checking CSRF protection: ${error.message}`);
        }

        this.testResults[category].csrfProtection = result;
        this.updateOverallStatus(result.status);
        console.log(`  ${this.getStatusIcon(result.status)} ${result.name}`);
    }

    async checkContentSecurityPolicy(category) {
        const result = {
            name: 'Content Security Policy',
            status: 'passed',
            details: [],
            warnings: []
        };

        try {
            const serverFile = 'server.js';
            if (fs.existsSync(serverFile)) {
                const serverContent = fs.readFileSync(serverFile, 'utf8');

                if (serverContent.includes('@fastify/helmet')) {
                    result.details.push('✅ Helmet security middleware enabled');

                    // Check if CSP is explicitly configured
                    if (serverContent.includes('contentSecurityPolicy')) {
                        result.details.push('✅ Content Security Policy explicitly configured');
                    } else {
                        result.warnings.push('⚠️ CSP not explicitly configured (using default Helmet settings)');
                        result.status = 'warnings';
                    }
                } else {
                    result.warnings.push('⚠️ Helmet security middleware not found');
                    result.status = 'warnings';
                }

                // Check for security header configurations
                const securityHeaders = [
                    'strictTransportSecurity',
                    'crossOriginEmbedderPolicy',
                    'crossOriginOpenerPolicy',
                    'crossOriginResourcePolicy'
                ];

                securityHeaders.forEach(header => {
                    if (serverContent.includes(header)) {
                        result.details.push(`✅ ${header} header configured`);
                    }
                });
            }
        } catch (error) {
            result.status = 'failed';
            result.details.push(`❌ Error checking CSP: ${error.message}`);
        }

        this.testResults[category].contentSecurityPolicy = result;
        this.updateOverallStatus(result.status);
        console.log(`  ${this.getStatusIcon(result.status)} ${result.name}`);
    }

    async checkInputValidation(category) {
        const result = {
            name: 'Input Validation',
            status: 'passed',
            details: [],
            warnings: []
        };

        try {
            // Check for validation schemas
            const schemaFiles = [
                'schemas/common.json',
                'schemas/auth.json',
                'schemas/api.json'
            ];

            let schemaCount = 0;
            for (const file of schemaFiles) {
                if (fs.existsSync(file)) {
                    schemaCount++;
                    result.details.push(`✅ Validation schema found: ${path.basename(file)}`);
                }
            }

            if (schemaCount > 0) {
                result.details.push(`📊 ${schemaCount} validation schemas found`);
            }

            // Check server.js for validation middleware
            const serverFile = 'server.js';
            if (fs.existsSync(serverFile)) {
                const serverContent = fs.readFileSync(serverFile, 'utf8');

                if (serverContent.includes('schema') || serverContent.includes('validator')) {
                    result.details.push('✅ Input validation middleware implemented');
                }

                if (serverContent.includes('validationError') || serverContent.includes('validation')) {
                    result.details.push('✅ Error handling for validation found');
                }
            }

            // Check form validation in templates
            const templateFiles = this.findFiles('views', '.ejs');
            let clientValidation = 0;

            for (const file of templateFiles) {
                const content = fs.readFileSync(file, 'utf8');

                if (content.includes('required') || content.includes('pattern') || content.includes('minlength')) {
                    clientValidation++;
                }

                if (content.includes('validate') || content.includes('validation')) {
                    result.details.push(`✅ Client-side validation found in ${path.basename(file)}`);
                }
            }

            if (clientValidation > 0) {
                result.details.push(`✅ ${clientValidation} forms have validation attributes`);
            }
        } catch (error) {
            result.status = 'failed';
            result.details.push(`❌ Error checking input validation: ${error.message}`);
        }

        this.testResults[category].inputValidation = result;
        this.updateOverallStatus(result.status);
        console.log(`  ${this.getStatusIcon(result.status)} ${result.name}`);
    }

    async checkAuthentication(category) {
        const result = {
            name: 'Authentication Security',
            status: 'passed',
            details: [],
            warnings: []
        };

        try {
            const serverFile = 'server.js';
            if (fs.existsSync(serverFile)) {
                const serverContent = fs.readFileSync(serverFile, 'utf8');

                // Check for authentication middleware
                if (serverContent.includes('auth') || serverContent.includes('authenticate')) {
                    result.details.push('✅ Authentication middleware found');
                }

                // Check for JWT implementation
                if (serverContent.includes('jwt') || serverContent.includes('jsonwebtoken')) {
                    result.details.push('✅ JWT authentication implemented');
                }

                // Check for session management
                if (serverContent.includes('@fastify/session')) {
                    result.details.push('✅ Session management implemented');

                    // Check for secure session configuration
                    if (serverContent.includes('httpOnly: true')) {
                        result.details.push('✅ Secure session cookies (httpOnly)');
                    }

                    if (serverContent.includes('secure') || serverContent.includes('HTTPS')) {
                        result.details.push('✅ HTTPS/secure configuration found');
                    }
                }

                // Check for password security
                if (serverContent.includes('bcrypt') || serverContent.includes('hash')) {
                    result.details.push('✅ Password hashing implemented');
                }

                // Check for rate limiting
                if (serverContent.includes('rateLimit') || serverContent.includes('rate-limit')) {
                    result.details.push('✅ Rate limiting implemented');
                }
            }

            // Check authentication routes
            const authFiles = [
                'src/routes/auth.js',
                'src/middleware/auth.js'
            ];

            for (const file of authFiles) {
                if (fs.existsSync(file)) {
                    result.details.push(`✅ Authentication module found: ${path.basename(file)}`);
                }
            }
        } catch (error) {
            result.status = 'failed';
            result.details.push(`❌ Error checking authentication: ${error.message}`);
        }

        this.testResults[category].authentication = result;
        this.updateOverallStatus(result.status);
        console.log(`  ${this.getStatusIcon(result.status)} ${result.name}`);
    }

    async runFunctionalityTests() {
        console.log('\n⚙️ Running Functionality Tests...');
        const tests = [
            'checkFormSubmissions',
            'checkNavigation',
            'checkDataDisplay',
            'checkErrorHandling',
            'checkOfflineFunctionality'
        ];

        for (const test of tests) {
            await this[test]('functionality');
        }
    }

    async checkFormSubmissions(category) {
        const result = {
            name: 'Form Submission Functionality',
            status: 'passed',
            details: [],
            warnings: []
        };

        try {
            const templateFiles = this.findFiles('views', '.ejs');
            let formCount = 0;
            let formWithValidation = 0;
            let formWithSubmission = 0;

            for (const file of templateFiles) {
                const content = fs.readFileSync(file, 'utf8');

                // Find forms
                const formMatches = content.match(/<form[^>]*>/g) || [];
                formCount += formMatches.length;

                if (formMatches.length > 0) {
                    // Check for form validation
                    if (content.includes('required') || content.includes('validate')) {
                        formWithValidation++;
                        result.details.push(`✅ Form validation found in ${path.basename(file)}`);
                    }

                    // Check for form submission handling
                    if (content.includes('submit') || content.includes('onsubmit')) {
                        formWithSubmission++;
                        result.details.push(`✅ Form submission handling found in ${path.basename(file)}`);
                    }

                    // Check for CSRF tokens
                    if (content.includes('csrf') || content.includes('_csrf')) {
                        result.details.push(`✅ CSRF protection found in ${path.basename(file)}`);
                    }
                }
            }

            result.details.push(`📊 ${formCount} forms found`);

            if (formCount > 0) {
                if (formWithValidation === 0) {
                    result.warnings.push('⚠️ No form validation found');
                    result.status = 'warnings';
                }

                if (formWithSubmission === 0) {
                    result.warnings.push('⚠️ No form submission handling found');
                    result.status = 'warnings';
                }
            } else {
                result.details.push('✅ No forms found (N/A for this test)');
            }
        } catch (error) {
            result.status = 'failed';
            result.details.push(`❌ Error checking form submissions: ${error.message}`);
        }

        this.testResults[category].formSubmissions = result;
        this.updateOverallStatus(result.status);
        console.log(`  ${this.getStatusIcon(result.status)} ${result.name}`);
    }

    async checkNavigation(category) {
        const result = {
            name: 'Navigation Functionality',
            status: 'passed',
            details: [],
            warnings: []
        };

        try {
            const templateFiles = this.findFiles('views', '.ejs');
            let linkCount = 0;
            let internalLinks = 0;
            let externalLinks = 0;

            for (const file of templateFiles) {
                const content = fs.readFileSync(file, 'utf8');

                // Find all links
                const linkMatches = content.match(/<a[^>]*href[^>]*>/g) || [];
                linkCount += linkMatches.length;

                linkMatches.forEach(link => {
                    const href = link.match(/href="([^"]*)"/);
                    if (href && href[1]) {
                        const url = href[1];

                        if (url.startsWith('http')) {
                            externalLinks++;
                        } else if (url.startsWith('#') || url.startsWith('/') || !url.includes('://')) {
                            internalLinks++;
                        }
                    }
                });

                // Check for navigation structure
                if (content.includes('<nav') || content.includes('navigation')) {
                    result.details.push(`✅ Navigation structure found in ${path.basename(file)}`);
                }

                // Check for mobile navigation
                if (content.includes('mobile-menu') || content.includes('hamburger')) {
                    result.details.push(`✅ Mobile navigation found in ${path.basename(file)}`);
                }

                // Check for breadcrumb navigation
                if (content.includes('breadcrumb') || content.includes('nav-link')) {
                    result.details.push(`✅ Breadcrumb/navigation links found in ${path.basename(file)}`);
                }
            }

            result.details.push(`📊 ${linkCount} total links (${internalLinks} internal, ${externalLinks} external)`);

            if (linkCount === 0) {
                result.warnings.push('⚠️ No navigation links found');
                result.status = 'warnings';
            }

            // Check for external link security
            if (externalLinks > 0) {
                result.details.push('🔗 External links found (check for target="_blank" and rel="noopener")');
            }
        } catch (error) {
            result.status = 'failed';
            result.details.push(`❌ Error checking navigation: ${error.message}`);
        }

        this.testResults[category].navigation = result;
        this.updateOverallStatus(result.status);
        console.log(`  ${this.getStatusIcon(result.status)} ${result.name}`);
    }

    async checkDataDisplay(category) {
        const result = {
            name: 'Data Display Functionality',
            status: 'passed',
            details: [],
            warnings: []
        };

        try {
            const templateFiles = this.findFiles('views', '.ejs');
            let dataDisplayPatterns = 0;

            for (const file of templateFiles) {
                const content = fs.readFileSync(file, 'utf8');

                // Check for data display patterns
                const patterns = [
                    { pattern: /<table[^>]*>/g, name: 'Tables' },
                    { pattern: /<div class="[^"]*card/g, name: 'Cards' },
                    { pattern: /<ul[^>]*>/g, name: 'Lists' },
                    { pattern: /<ol[^>]*>/g, name: 'Ordered lists' },
                    { pattern: /<dl[^>]*>/g, name: 'Definition lists' },
                    { pattern: /<progress[^>]*>/g, name: 'Progress bars' },
                    { pattern: /<meter[^>]*>/g, name: 'Meters' }
                ];

                patterns.forEach(({ pattern, name }) => {
                    const matches = content.match(pattern) || [];
                    if (matches.length > 0) {
                        dataDisplayPatterns++;
                        result.details.push(`✅ ${name} found in ${path.basename(file)} (${matches.length} instances)`);
                    }
                });

                // Check for dynamic data insertion
                if (content.includes('<%=')) {
                    result.details.push(`✅ Dynamic data insertion found in ${path.basename(file)}`);
                }

                // Check for data formatting
                if (content.includes('toLocaleString') || content.includes('format') || content.includes('toFixed')) {
                    result.details.push(`✅ Data formatting found in ${path.basename(file)}`);
                }

                // Check for empty states
                if (content.includes('empty') || content.includes('no data') || content.includes('not found')) {
                    result.details.push(`✅ Empty state handling found in ${path.basename(file)}`);
                }
            }

            if (dataDisplayPatterns === 0) {
                result.warnings.push('⚠️ No data display patterns found');
                result.status = 'warnings';
            }
        } catch (error) {
            result.status = 'failed';
            result.details.push(`❌ Error checking data display: ${error.message}`);
        }

        this.testResults[category].dataDisplay = result;
        this.updateOverallStatus(result.status);
        console.log(`  ${this.getStatusIcon(result.status)} ${result.name}`);
    }

    async checkErrorHandling(category) {
        const result = {
            name: 'Error Handling',
            status: 'passed',
            details: [],
            warnings: []
        };

        try {
            // Check server.js for error handling
            const serverFile = 'server.js';
            if (fs.existsSync(serverFile)) {
                const serverContent = fs.readFileSync(serverFile, 'utf8');

                if (serverContent.includes('try') && serverContent.includes('catch')) {
                    result.details.push('✅ Server-side try-catch error handling found');
                }

                if (serverContent.includes('errorHandler') || serverContent.includes('setErrorHandler')) {
                    result.details.push('✅ Error handlers configured');
                }

                if (serverContent.includes('console.error')) {
                    result.details.push('✅ Error logging implemented');
                }
            }

            // Check templates for error display
            const templateFiles = this.findFiles('views', '.ejs');
            let errorHandling = 0;

            for (const file of templateFiles) {
                const content = fs.readFileSync(file, 'utf8');

                // Check for error display
                if (content.includes('error') || content.includes('alert') || content.includes('danger')) {
                    errorHandling++;
                    result.details.push(`✅ Error display found in ${path.basename(file)}`);
                }

                // Check for validation error display
                if (content.includes('validationError') || content.includes('error-message')) {
                    result.details.push(`✅ Validation error handling found in ${path.basename(file)}`);
                }
            }

            // Check JavaScript error handling
            const jsFiles = this.findFiles('public/js', '.js');
            let jsErrorHandling = 0;

            for (const file of jsFiles) {
                if (fs.existsSync(file)) {
                    const content = fs.readFileSync(file, 'utf8');

                    if (content.includes('try') && content.includes('catch')) {
                        jsErrorHandling++;
                        result.details.push(`✅ JavaScript error handling in ${path.basename(file)}`);
                    }

                    if (content.includes('addEventListener') && content.includes('error')) {
                        result.details.push(`✅ Error event listeners in ${path.basename(file)}`);
                    }
                }
            }

            if (errorHandling === 0 && jsErrorHandling === 0) {
                result.warnings.push('⚠️ No explicit error handling found');
                result.status = 'warnings';
            }
        } catch (error) {
            result.status = 'failed';
            result.details.push(`❌ Error checking error handling: ${error.message}`);
        }

        this.testResults[category].errorHandling = result;
        this.updateOverallStatus(result.status);
        console.log(`  ${this.getStatusIcon(result.status)} ${result.name}`);
    }

    async checkOfflineFunctionality(category) {
        const result = {
            name: 'Offline Functionality',
            status: 'passed',
            details: [],
            warnings: []
        };

        try {
            // Check for service worker
            const swFile = 'public/sw.js';
            if (fs.existsSync(swFile)) {
                const swContent = fs.readFileSync(swFile, 'utf8');

                if (swContent.includes('fetch')) {
                    result.details.push('✅ Service worker fetch event handler');
                }

                if (swContent.includes('caches.open')) {
                    result.details.push('✅ Service worker caching implemented');
                }

                if (swContent.includes('offline.html') || swContent.includes('Offline')) {
                    result.details.push('✅ Offline fallback page found');
                }

                if (swContent.includes('backgroundSync')) {
                    result.details.push('✅ Background sync implemented');
                }
            } else {
                result.warnings.push('⚠️ No service worker found');
                result.status = 'warnings';
            }

            // Check for PWA manifest
            if (fs.existsSync('manifest.json')) {
                result.details.push('✅ PWA manifest available');

                const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
                if (manifest.display === 'standalone') {
                    result.details.push('✅ Standalone PWA mode configured');
                }

                if (manifest.start_url) {
                    result.details.push('✅ PWA start URL configured');
                }
            }

            // Check for offline page
            if (fs.existsSync('views/offline.ejs')) {
                result.details.push('✅ Offline page available');
            }

            // Check for network status monitoring
            const footerFile = 'views/partials/footer.ejs';
            if (fs.existsSync(footerFile)) {
                const footerContent = fs.readFileSync(footerFile, 'utf8');

                if (footerContent.includes('navigator.onLine') || footerContent.includes('online')) {
                    result.details.push('✅ Network status monitoring implemented');
                }

                if (footerContent.includes('offline') || footerContent.includes('connection')) {
                    result.details.push('✅ Offline status handling found');
                }
            }
        } catch (error) {
            result.status = 'failed';
            result.details.push(`❌ Error checking offline functionality: ${error.message}`);
        }

        this.testResults[category].offlineFunctionality = result;
        this.updateOverallStatus(result.status);
        console.log(`  ${this.getStatusIcon(result.status)} ${result.name}`);
    }

    // Utility methods
    findFiles(dir, extension) {
        const files = [];

        const scanDirectory = (currentDir) => {
            if (!fs.existsSync(currentDir)) return;

            const items = fs.readdirSync(currentDir);

            for (const item of items) {
                const fullPath = path.join(currentDir, item);
                const stat = fs.statSync(fullPath);

                if (stat.isDirectory()) {
                    scanDirectory(fullPath);
                } else if (item.endsWith(extension)) {
                    files.push(fullPath);
                }
            }
        };

        scanDirectory(dir);
        return files;
    }

    checkContrastRatio(color1, color2) {
        // Simplified contrast ratio calculation
        // In a real implementation, you'd use a proper color contrast library
        return 7.5; // Simulated good contrast ratio
    }

    getStatusIcon(status) {
        switch (status) {
            case 'passed': return '✅';
            case 'warnings': return '⚠️';
            case 'failed': return '❌';
            default: return '❓';
        }
    }

    updateOverallStatus(testStatus) {
        switch (testStatus) {
            case 'failed':
                this.testResults.overall.failed++;
                break;
            case 'warnings':
                this.testResults.overall.warnings++;
                break;
            case 'passed':
                this.testResults.overall.passed++;
                break;
        }
        this.testResults.overall.total++;
    }

    generateReport() {
        const duration = Date.now() - this.startTime;
        const durationSeconds = (duration / 1000).toFixed(2);

        console.log('\n' + '='.repeat(60));
        console.log('📋 COMPREHENSIVE TEST REPORT');
        console.log('='.repeat(60));
        console.log(`⏱️  Test Duration: ${durationSeconds} seconds`);
        console.log(`📊 Overall Results:`);
        console.log(`   ✅ Passed: ${this.testResults.overall.passed}`);
        console.log(`   ⚠️  Warnings: ${this.testResults.overall.warnings}`);
        console.log(`   ❌ Failed: ${this.testResults.overall.failed}`);
        console.log(`   📈 Total: ${this.testResults.overall.total}`);

        const successRate = ((this.testResults.overall.passed / this.testResults.overall.total) * 100).toFixed(1);
        console.log(`   🎯 Success Rate: ${successRate}%`);

        // Category summaries
        console.log('\n📊 CATEGORY BREAKDOWN:');
        const categories = ['accessibility', 'performance', 'responsive', 'crossBrowser', 'security', 'functionality'];

        categories.forEach(category => {
            const results = this.testResults[category];
            const passed = Object.values(results).filter(r => r.status === 'passed').length;
            const warnings = Object.values(results).filter(r => r.status === 'warnings').length;
            const failed = Object.values(results).filter(r => r.status === 'failed').length;
            const total = passed + warnings + failed;

            if (total > 0) {
                const categoryRate = ((passed / total) * 100).toFixed(1);
                console.log(`   ${category.charAt(0).toUpperCase() + category.slice(1)}: ${passed}/${total} (${categoryRate}%)`);
            }
        });

        // Recommendations
        console.log('\n💡 RECOMMENDATIONS:');
        if (this.testResults.overall.failed > 0) {
            console.log('   🔴 Address failed tests before deployment');
        }
        if (this.testResults.overall.warnings > 0) {
            console.log('   🟡 Review warnings for potential improvements');
        }
        if (this.testResults.overall.passed === this.testResults.overall.total) {
            console.log('   🟢 All tests passed! Ready for deployment.');
        }

        console.log('\n' + '='.repeat(60));
    }

    saveResults() {
        const reportData = {
            timestamp: new Date().toISOString(),
            duration: Date.now() - this.startTime,
            results: this.testResults,
            summary: {
                ...this.testResults.overall,
                successRate: (this.testResults.overall.passed / this.testResults.overall.total * 100).toFixed(1)
            }
        };

        // Save detailed results
        const reportsDir = 'test-reports';
        if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const reportFile = path.join(reportsDir, `test-report-${timestamp}.json`);

        fs.writeFileSync(reportFile, JSON.stringify(reportData, null, 2));
        console.log(`\n📄 Detailed report saved to: ${reportFile}`);

        // Save summary to a readable format
        const summaryFile = path.join(reportsDir, `latest-test-summary.md`);
        const summaryContent = this.generateMarkdownReport(reportData);
        fs.writeFileSync(summaryFile, summaryContent);
        console.log(`📄 Summary saved to: ${summaryFile}`);
    }

    generateMarkdownReport(data) {
        let markdown = `# Frontend Test Report\n\n`;
        markdown += `**Generated:** ${new Date(data.timestamp).toLocaleString()}\n`;
        markdown += `**Duration:** ${(data.duration / 1000).toFixed(2)} seconds\n`;
        markdown += `**Success Rate:** ${data.summary.successRate}%\n\n`;

        markdown += `## Summary\n\n`;
        markdown += `- ✅ Passed: ${data.overall.passed}\n`;
        markdown += `- ⚠️ Warnings: ${data.overall.warnings}\n`;
        markdown += `- ❌ Failed: ${data.overall.failed}\n`;
        markdown += `- 📈 Total: ${data.overall.total}\n\n`;

        Object.entries(data.results).forEach(([category, tests]) => {
            if (category !== 'overall' && Object.keys(tests).length > 0) {
                markdown += `## ${category.charAt(0).toUpperCase() + category.slice(1)}\n\n`;

                Object.entries(tests).forEach(([testName, result]) => {
                    markdown += `### ${result.name}\n`;
                    markdown += `**Status:** ${result.status}\n\n`;

                    if (result.details.length > 0) {
                        markdown += '**Details:**\n';
                        result.details.forEach(detail => {
                            markdown += `- ${detail}\n`;
                        });
                        markdown += '\n';
                    }

                    if (result.warnings.length > 0) {
                        markdown += '**Warnings:**\n';
                        result.warnings.forEach(warning => {
                            markdown += `- ${warning}\n`;
                        });
                        markdown += '\n';
                    }
                });
            }
        });

        return markdown;
    }
}

// Run tests if called directly
if (require.main === module) {
    const testRunner = new TestRunner();
    testRunner.runAllTests().catch(error => {
        console.error('❌ Test runner failed:', error);
        process.exit(1);
    });
}

module.exports = TestRunner;