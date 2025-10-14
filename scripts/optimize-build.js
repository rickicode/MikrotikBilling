#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

// Configuration
const config = {
    cssFiles: [
        'public/css/main.css',
        'public/css/skeleton.css',
        'public/css/critical.css'
    ],
    jsFiles: [
        'public/js/main.js',
        'public/js/app.js',
        'public/js/admin-dashboard.js',
        'public/js/customers.js',
        'public/js/pppoe.js',
        'public/js/vouchers.js'
    ],
    outputDir: 'public/dist',
    backupDir: 'public/backup'
};

// Utility functions
function ensureDirectory(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function getFileHash(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    return crypto.createHash('md5').update(content).digest('hex').substring(0, 8);
}

function minifyCSS(content) {
    // Basic CSS minification
    return content
        .replace(/\/\*[\s\S]*?\*\//g, '') // Remove comments
        .replace(/\s+/g, ' ') // Collapse whitespace
        .replace(/;\s*}/g, '}') // Remove trailing semicolons
        .replace(/\{\s*/g, '{') // Collapse space after {
        .replace(/;\s*/g, ';') // Collapse space after ;
        .replace(/,\s*/g, ',') // Collapse space after ,
        .replace(/\s*\{\s*/g, '{') // Collapse space around {
        .replace(/\s*\}\s*/g, '}') // Collapse space around }
        .replace(/;\s*}/g, '}') // Remove trailing semicolons
        .replace(/:\s*/g, ':') // Collapse space after :
        .replace(/\s*,\s*/g, ',') // Collapse space around commas
        .replace(/\s*;\s*/g, ';') // Collapse space around semicolons
        .replace(/0\s*px/g, '0') // Remove units from zero values
        .replace(/0\s*%/g, '0') // Remove units from zero percentage
        .replace(/0\s*em/g, '0') // Remove units from zero em
        .replace(/\.\s*([0-9])/g, '.$1') // Fix decimal points
        .trim();
}

function minifyJS(content) {
    // Basic JavaScript minification (for production use, consider using Terser)
    return content
        .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
        .replace(/\/\/.*$/gm, '') // Remove single-line comments
        .replace(/\s+/g, ' ') // Collapse whitespace
        .replace(/\s*([{}();,=+*\/&|<>!])\s*/g, '$1') // Remove space around operators
        .replace(/;\s*}/g, '}') // Remove trailing semicolons
        .trim();
}

function createBackup() {
    ensureDirectory(config.backupDir);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(config.backupDir, `backup-${timestamp}`);

    // Copy current files to backup
    config.cssFiles.forEach(file => {
        if (fs.existsSync(file)) {
            const backupFile = path.join(backupPath, file);
            ensureDirectory(path.dirname(backupFile));
            fs.copyFileSync(file, backupFile);
        }
    });

    config.jsFiles.forEach(file => {
        if (fs.existsSync(file)) {
            const backupFile = path.join(backupPath, file);
            ensureDirectory(path.dirname(backupFile));
            fs.copyFileSync(file, backupFile);
        }
    });

    console.log(`✅ Backup created: ${backupPath}`);
    return backupPath;
}

function optimizeCSS() {
    console.log('🎨 Optimizing CSS files...');

    const optimizedCSS = {};

    config.cssFiles.forEach(file => {
        if (fs.existsSync(file)) {
            console.log(`  Processing: ${file}`);

            const content = fs.readFileSync(file, 'utf8');
            const minified = minifyCSS(content);
            const hash = getFileHash(file);
            const fileName = `${path.basename(file, '.css')}-${hash}.min.css`;
            const outputPath = path.join(config.outputDir, fileName);

            fs.writeFileSync(outputPath, minified);
            optimizedCSS[file] = {
                original: file,
                minified: outputPath,
                size: {
                    original: content.length,
                    minified: minified.length
                }
            };

            console.log(`    ✅ ${content.length} → ${minified.length} bytes (${Math.round((minified.length / content.length) * 100)}%)`);
        } else {
            console.warn(`  ⚠️  File not found: ${file}`);
        }
    });

    return optimizedCSS;
}

function optimizeJS() {
    console.log('📜 Optimizing JavaScript files...');

    const optimizedJS = {};

    config.jsFiles.forEach(file => {
        if (fs.existsSync(file)) {
            console.log(`  Processing: ${file}`);

            const content = fs.readFileSync(file, 'utf8');
            const minified = minifyJS(content);
            const hash = getFileHash(file);
            const fileName = `${path.basename(file, '.js')}-${hash}.min.js`;
            const outputPath = path.join(config.outputDir, fileName);

            fs.writeFileSync(outputPath, minified);
            optimizedJS[file] = {
                original: file,
                minified: outputPath,
                size: {
                    original: content.length,
                    minified: minified.length
                }
            };

            console.log(`    ✅ ${content.length} → ${minified.length} bytes (${Math.round((minified.length / content.length) * 100)}%)`);
        } else {
            console.warn(`  ⚠️  File not found: ${file}`);
        }
    });

    return optimizedJS;
}

function generateManifest(optimizedCSS, optimizedJS) {
    const manifest = {
        version: new Date().toISOString(),
        css: {},
        js: {},
        totalSavings: {
            css: 0,
            js: 0,
            overall: 0
        }
    };

    // Calculate savings
    Object.values(optimizedCSS).forEach(item => {
        manifest.css[item.original] = {
            path: item.minified,
            hash: path.basename(item.minified, '.min.css').split('-')[1]
        };
        manifest.totalSavings.css += (item.size.original - item.size.minified);
    });

    Object.values(optimizedJS).forEach(item => {
        manifest.js[item.original] = {
            path: item.minified,
            hash: path.basename(item.minified, '.min.js').split('-')[1]
        };
        manifest.totalSavings.js += (item.size.original - item.size.minified);
    });

    manifest.totalSavings.overall = manifest.totalSavings.css + manifest.totalSavings.js;

    fs.writeFileSync(
        path.join(config.outputDir, 'manifest.json'),
        JSON.stringify(manifest, null, 2)
    );

    console.log('📋 Generated optimization manifest');
    return manifest;
}

function updateTemplateReferences(manifest) {
    console.log('📝 Updating template references...');

    // Read header template
    const headerPath = 'views/partials/header.ejs';
    let headerContent = fs.readFileSync(headerPath, 'utf8');

    // Update CSS references to use optimized versions
    Object.entries(manifest.css).forEach(([original, info]) => {
        const regex = new RegExp(`href="${original}"`, 'g');
        headerContent = headerContent.replace(regex, `href="${info.path}"`);
    });

    fs.writeFileSync(headerPath, headerContent);
    console.log('  ✅ Updated header.ejs');

    // Read footer template
    const footerPath = 'views/partials/footer.ejs';
    let footerContent = fs.readFileSync(footerPath, 'utf8');

    // Update JavaScript references to use optimized versions
    Object.entries(manifest.js).forEach(([original, info]) => {
        const regex = new RegExp(`src="${original}"`, 'g');
        footerContent = footerContent.replace(regex, `src="${info.path}"`);
    });

    fs.writeFileSync(footerPath, footerContent);
    console.log('  ✅ Updated footer.ejs');
}

function generateCriticalCSS() {
    console.log('⚡ Generating critical CSS...');

    // This would typically use a tool like critical or penthouse
    // For now, we'll copy our pre-written critical CSS
    const criticalCSSPath = 'public/css/critical.css';
    const criticalCSSOutput = path.join(config.outputDir, 'critical.min.css');

    if (fs.existsSync(criticalCSSPath)) {
        const content = fs.readFileSync(criticalCSSPath, 'utf8');
        const minified = minifyCSS(content);
        fs.writeFileSync(criticalCSSOutput, minified);
        console.log('  ✅ Critical CSS generated and minified');
    } else {
        console.warn('  ⚠️  Critical CSS file not found');
    }
}

function runLighthouseAudit() {
    console.log('🚀 Running Lighthouse audit...');

    try {
        // This requires Lighthouse to be installed
        const lighthouseCommand = 'npx lighthouse http://localhost:3000 --output=html --output-path=./lighthouse-report.html';
        execSync(lighthouseCommand, { stdio: 'inherit' });
        console.log('  ✅ Lighthouse audit completed');
    } catch (error) {
        console.warn('  ⚠️  Lighthouse audit skipped (not installed or server not running)');
    }
}

function main() {
    console.log('🔧 Starting build optimization...\n');

    // Ensure output directory exists
    ensureDirectory(config.outputDir);

    // Create backup
    const backupPath = createBackup();

    // Optimize assets
    const optimizedCSS = optimizeCSS();
    const optimizedJS = optimizeJS();

    // Generate critical CSS
    generateCriticalCSS();

    // Generate manifest
    const manifest = generateManifest(optimizedCSS, optimizedJS);

    // Update templates
    updateTemplateReferences(manifest);

    // Print summary
    console.log('\n📊 Optimization Summary:');
    console.log(`   CSS Savings: ${(manifest.totalSavings.css / 1024).toFixed(2)} KB`);
    console.log(`   JS Savings: ${(manifest.totalSavings.js / 1024).toFixed(2)} KB`);
    console.log(`   Total Savings: ${(manifest.totalSavings.overall / 1024).toFixed(2)} KB`);
    console.log(`   Backup: ${backupPath}`);

    // Run Lighthouse audit (optional)
    if (process.argv.includes('--lighthouse')) {
        runLighthouseAudit();
    }

    console.log('\n✨ Build optimization completed!');
}

// Handle process termination gracefully
process.on('SIGINT', () => {
    console.log('\n🛑 Build optimization interrupted');
    process.exit(1);
});

process.on('uncaughtException', (error) => {
    console.error('💥 Build optimization failed:', error);
    process.exit(1);
});

// Run the optimization
if (require.main === module) {
    main();
}

module.exports = {
    minifyCSS,
    minifyJS,
    optimizeCSS,
    optimizeJS,
    generateManifest
};