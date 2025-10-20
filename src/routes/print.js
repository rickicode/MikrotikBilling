'use strict';

const { db } = require('../database/DatabaseManager');

module.exports = async function(fastify, opts) {
    // Format currency function
    const formatCurrency = (amount) => {
        const formatted = new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR'
        }).format(amount || 0);

        // Remove ,00 for whole numbers
        return formatted.replace(/,00$/, '');
    };

    // Get voucher by IDs for printing - Enhanced error handling
    fastify.get('/vouchers/:ids', {
        config: {
            // Increase timeout for print operations
            timeout: 30000
        }
    }, async (request, reply) => {
        let responseSent = false;

        try {
            const { ids } = request.params;
            const { auto_print, format } = request.query;

            // Validate input parameters
            if (!ids || ids.trim() === '') {
                if (!responseSent) {
                    responseSent = true;
                    return reply.code(400).type('application/json').send({
                        success: false,
                        error: {
                            code: 'INVALID_PARAMETERS',
                            message: 'Voucher IDs are required',
                            details: 'Please provide valid voucher IDs'
                        },
                        timestamp: new Date().toISOString()
                    });
                }
                return;
            }

            // Initialize database connection check
            try {
                await db.query('SELECT 1');
            } catch (dbError) {
                fastify.log.error('Database connection failed:', dbError);
                if (!responseSent) {
                    responseSent = true;
                    return reply.code(503).type('application/json').send({
                        success: false,
                        error: {
                            code: 'DATABASE_UNAVAILABLE',
                            message: 'Database connection failed',
                            details: process.env.DEBUG === 'true' ? dbError.message : 'Service temporarily unavailable'
                        },
                        timestamp: new Date().toISOString()
                    });
                }
                return;
            }

            // Get template type from settings or query parameter
            let template = 'a4'; // Default to A4
            if (format && ['a4', 'thermal'].includes(format)) {
                template = format;
            } else {
                try {
                    const templateResult = await db.query(`SELECT value FROM settings WHERE key = $1`, ['print_template_type']);
                    if (templateResult.rows && templateResult.rows.length > 0) {
                        template = templateResult.rows[0].value;
                    }
                } catch (settingsError) {
                    fastify.log.warn('Error getting template type from settings:', settingsError.message);
                    // Continue with default template
                }
            }

            // Parse and validate voucher IDs
            const voucherIds = ids.split(',').map(id => {
                const trimmed = id.trim();
                const parsed = parseInt(trimmed);
                return isNaN(parsed) ? null : parsed;
            }).filter(id => id !== null);

            if (voucherIds.length === 0) {
                if (!responseSent) {
                    responseSent = true;
                    return reply.code(400).type('application/json').send({
                        success: false,
                        error: {
                            code: 'INVALID_VOUCHER_IDS',
                            message: 'No valid voucher IDs provided',
                            details: 'The provided IDs are not valid numbers'
                        },
                        timestamp: new Date().toISOString()
                    });
                }
                return;
            }

            // Check if vouchers table exists and has required columns
            try {
                const tableCheck = await db.query(`
                    SELECT column_name, data_type
                    FROM information_schema.columns
                    WHERE table_name = 'vouchers'
                    AND column_name IN ('id', 'code', 'price_sell', 'duration_hours', 'created_at', 'profile_id', 'vendor_id')
                `);

                if (tableCheck.rows.length < 7) {
                    const missingColumns = ['id', 'code', 'price_sell', 'duration_hours', 'created_at', 'profile_id', 'vendor_id']
                        .filter(col => !tableCheck.rows.some(row => row.column_name === col));

                    if (!responseSent) {
                        responseSent = true;
                        return reply.code(500).type('application/json').send({
                            success: false,
                            error: {
                                code: 'DATABASE_SCHEMA_ERROR',
                                message: 'Database schema is incomplete',
                                details: `Missing columns in vouchers table: ${missingColumns.join(', ')}`
                            },
                            timestamp: new Date().toISOString()
                        });
                    }
                    return;
                }
            } catch (schemaError) {
                fastify.log.error('Schema check failed:', schemaError);
                if (!responseSent) {
                    responseSent = true;
                    return reply.code(500).type('application/json').send({
                        success: false,
                        error: {
                            code: 'DATABASE_SCHEMA_ERROR',
                            message: 'Unable to verify database schema',
                            details: process.env.DEBUG === 'true' ? schemaError.message : 'Database schema verification failed'
                        },
                        timestamp: new Date().toISOString()
                    });
                }
                return;
            }

            // Get vouchers from database with proper error handling
            let vouchers = [];
            try {
                const placeholders = voucherIds.map((_, index) => `$${index + 1}`).join(',');
                const vouchersResult = await db.query(`
                    SELECT v.id, v.code, v.price_sell, v.duration_hours, v.created_at, v.profile_id, v.vendor_id,
                           p.name as profile_name,
                           vd.name as vendor_name
                    FROM vouchers v
                    LEFT JOIN profiles p ON v.profile_id = p.id
                    LEFT JOIN vendors vd ON v.vendor_id = vd.id
                    WHERE v.id IN (${placeholders})
                    ORDER BY v.id
                `, voucherIds);

                vouchers = vouchersResult.rows || [];
            } catch (queryError) {
                fastify.log.error('Failed to fetch vouchers:', queryError);
                if (!responseSent) {
                    responseSent = true;
                    return reply.code(500).type('application/json').send({
                        success: false,
                        error: {
                            code: 'QUERY_ERROR',
                            message: 'Failed to fetch vouchers from database',
                            details: process.env.DEBUG === 'true' ? queryError.message : 'Database query failed'
                        },
                        timestamp: new Date().toISOString()
                    });
                }
                return;
            }

            if (vouchers.length === 0) {
                if (!responseSent) {
                    responseSent = true;
                    return reply.code(404).type('application/json').send({
                        success: false,
                        error: {
                            code: 'VOUCHERS_NOT_FOUND',
                            message: 'No vouchers found with the provided IDs',
                            details: `Checked ${voucherIds.length} voucher IDs, none were found`
                        },
                        timestamp: new Date().toISOString()
                    });
                }
                return;
            }

            // Get template name from settings
            let templateName = 'Default';
            try {
                const templateNameResult = await db.query(`SELECT value FROM settings WHERE key = $1`, ['template_name']);
                if (templateNameResult.rows && templateNameResult.rows.length > 0) {
                    templateName = templateNameResult.rows[0].value;
                }
            } catch (templateNameError) {
                fastify.log.warn('Error getting template name from settings:', templateNameError.message);
                // Continue with default template name
            }

            // Generate HTML content
            let allVouchersHTML = '';
            vouchers.forEach((voucher, index) => {
                const safeVoucher = {
                    code: voucher.code || 'N/A',
                    vendor_name: voucher.vendor_name || 'Tanpa Vendor',
                    duration_hours: voucher.duration_hours || 0,
                    created_at: voucher.created_at || new Date(),
                    price_sell: voucher.price_sell || 0
                };

                const voucherHTML = generateVoucherHTML(safeVoucher, index + 1, template, reply.locals.settings);
                allVouchersHTML += voucherHTML;
            });

            // Build complete HTML document
            const completeHTML = generateCompleteHTML(allVouchersHTML, template, templateName);

            // Send successful response
            if (!responseSent) {
                responseSent = true;
                reply.header('Content-Type', 'text/html');
                reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
                return reply.send(completeHTML);
            }

        } catch (unexpectedError) {
            fastify.log.error('Unexpected error in print route:', {
                error: unexpectedError.message,
                stack: unexpectedError.stack,
                params: request.params,
                query: request.query,
                responseSent: responseSent
            });

            if (!responseSent) {
                responseSent = true;
                return reply.code(500).type('application/json').send({
                    success: false,
                    error: {
                        code: 'UNEXPECTED_ERROR',
                        message: 'An unexpected error occurred while processing your request',
                        details: process.env.DEBUG === 'true' ? unexpectedError.message : 'Internal server error',
                        stack: process.env.DEBUG === 'true' ? unexpectedError.stack : undefined
                    },
                    timestamp: new Date().toISOString()
                });
            }
        }
    });

    // Helper function to generate individual voucher HTML
    function generateVoucherHTML(voucher, index, template, settings = {}) {
        const companyName = (settings && settings.company_name) || 'WiFi Hotspot';
        const durationDays = Math.floor(voucher.duration_hours / 24);
        const expiryDate = new Date(voucher.created_at).toLocaleDateString('id-ID');
        const formattedPrice = formatCurrency(voucher.price_sell).replace('Rp', '').trim();

        if (template === 'a4') {
            return `
                <div class="voucher">
                    <table>
                        <tr>
                            <td class="rotate" rowspan="4">
                                <span>WiFi VOUCHER</span>
                            </td>
                            <td class="company-header" colspan="2">
                                <div class="company-name">${companyName}</div>
                                <div class="voucher-number">No. [${index}]</div>
                            </td>
                        </tr>
                        <tr>
                            <td class="voucher-code" colspan="2">${voucher.code}</td>
                        </tr>
                        <tr>
                            <td class="duration">Durasi: ${durationDays} Hari</td>
                            <td class="validity">Exp: ${expiryDate}</td>
                        </tr>
                        <tr>
                            <td colspan="2" style="text-align: center; font-size: 12px; font-weight: bold;">
                                ${voucher.vendor_name}
                            </td>
                        </tr>
                    </table>
                </div>
            `;
        } else if (template === 'thermal') {
            return `
                <div class="voucher">
                    <div class="header">${companyName}</div>
                    <div class="code">${voucher.code}</div>
                    <div class="info">Durasi: ${durationDays} Hari</div>
                    <div class="info">Berlaku sampai: ${expiryDate}</div>
                    <div class="info">Vendor: ${voucher.vendor_name}</div>
                    <div class="price">Rp ${formattedPrice}</div>
                </div>
            `;
        }
        return '';
    }

    // Helper function to generate complete HTML document
    function generateCompleteHTML(vouchersHTML, template, templateName = 'Default') {
        const cssStyles = template === 'a4' ? `
            body {
                font-family: Courier New, monospace;
                margin: 5px;
                background: #ffffff;
                font-size: 10px;
            }
            .voucher-container {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 4px;
                max-width: 210mm;
                margin: 0 auto;
            }
            .voucher {
                width: 145px;
                border: 1px solid #000;
                page-break-inside: avoid;
                background: #ffffff;
            }
            .voucher table {
                width: 100%;
                border-collapse: collapse;
                font-size: 11px;
            }
            .voucher td {
                padding: 2px;
                border: none;
            }
            .rotate {
                font-weight: bold;
                border-right: 1px solid black;
                background-color: #ffea8f !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                width: 20px;
                height: 80px;
            }
            .rotate span {
                writing-mode: vertical-lr;
                text-orientation: mixed;
                transform: rotate(180deg);
                display: block;
                text-align: center;
                font-size: 10px;
                line-height: 1.2;
                padding: 5px 2px;
            }
            .company-header {
                font-weight: bold;
                font-size: 12px;
                padding-left: 5px;
                background: #FBA1B7 !important;
                color: white !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                text-align: center;
            }
            .company-name {
                text-align: left;
            }
            .voucher-number {
                text-align: right;
                font-size: 9px;
            }
            .voucher-code {
                width: 100%;
                font-weight: 600;
                font-size: 18px;
                text-align: center;
            }
            .duration, .validity {
                font-size: 11px;
                padding-right: 5px;
                text-align: end;
                background: #FFECAF !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
            @media print {
                body { margin: 2px; }
                .voucher-container { gap: 2px; }
            }
            @page {
                margin: 5mm;
                size: A4;
            }
        ` : `
            body {
                font-family: Courier New, monospace;
                margin: 5px;
                padding: 5px;
                width: 80mm;
                background: white;
            }
            .voucher {
                border-bottom: 1px dashed #000;
                padding: 10px 0;
                margin-bottom: 10px;
                text-align: center;
                page-break-inside: avoid;
            }
            .header {
                font-size: 12px;
                font-weight: bold;
                margin-bottom: 8px;
            }
            .code {
                font-family: Courier New, monospace;
                font-size: 16px;
                font-weight: bold;
                background: #000 !important;
                color: #fff !important;
                padding: 5px;
                margin: 8px 0;
                letter-spacing: 2px;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
            .info {
                font-size: 10px;
                margin: 3px 0;
            }
            .price {
                font-size: 12px;
                font-weight: bold;
                margin-top: 5px;
            }
            @media print {
                body { margin: 2px; }
                .voucher { margin-bottom: 5px; }
            }
            @page {
                margin: 5mm;
                size: 80mm auto;
            }
        `;

        const containerClass = template === 'a4' ? 'voucher-container' : '';
        const containerTag = template === 'a4' ? 'div' : 'div';

        return `<!DOCTYPE html>
<html>
<head>
    <title>WiFi Voucher - ${template.toUpperCase()}</title>
    <meta charset="utf-8">
    <style>
        ${cssStyles}
    </style>
    ${template === 'thermal' ? '<meta name="viewport" content="width=device-width, initial-scale=1.0">' : ''}
</head>
<body>
    <${containerTag} class="${containerClass}">
        ${vouchersHTML}
    </${containerTag}>
    ${template === 'thermal' ? '<script>window.onload = function() { window.print(); };</script>' : ''}
</body>
</html>`;
    }

    // Helper function to get default template HTML (legacy fallback)
    function getDefaultTemplate(templateType) {
        if (templateType === 'a4') {
            return `<!DOCTYPE html>
<html>
<head>
    <title>WiFi Voucher - A4</title>
    <style>
        body {
            font-family: Courier New, monospace;
            margin: 5px;
            background: #ffffff;
            font-size: 10px;
        }
        .voucher-container {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 4px;
            max-width: 210mm;
            margin: 0 auto;
        }
        .voucher {
            width: 145px;
            border: 1px solid #000;
            page-break-inside: avoid;
            background: #ffffff;
        }
        .voucher table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
        }
        .voucher td {
            padding: 2px;
            border: none;
        }
        .rotate {
            font-weight: bold;
            border-right: 1px solid black;
            background-color: #ffea8f;
            -webkit-print-color-adjust: exact;
            width: 20px;
            height: 80px;
        }
        .rotate span {
            writing-mode: vertical-lr;
            text-orientation: mixed;
            transform: rotate(180deg);
            display: block;
            text-align: center;
            font-size: 10px;
            line-height: 1.2;
            padding: 5px 2px;
        }
        .company-header {
            font-weight: bold;
            font-size: 12px;
            padding-left: 5px;
            background: #FBA1B7;
            color: white;
            text-align: center;
        }
        .company-name {
            text-align: left;
        }
        .voucher-number {
            text-align: right;
            font-size: 9px;
        }
        .voucher-code {
            width: 100%;
            font-weight: 600;
            font-size: 18px;
            text-align: center;
        }
        .duration {
            font-size: 11px;
            padding-right: 5px;
            text-align: end;
            background: #FFECAF;
        }
        .validity {
            font-size: 11px;
            padding-right: 5px;
            text-align: end;
            background: #FFECAF;
        }
        @media print {
            body { margin: 2px; }
            .voucher-container { gap: 2px; }
        }
    </style>
</head>
<body>
    <div class="voucher-container">
        <!-- VOUCHERS_PLACEHOLDER -->
    </div>
</body>
</html>`;
        } else if (templateType === 'thermal') {
            return `<!DOCTYPE html>
<html>
<head>
    <title>WiFi Voucher - Thermal</title>
    <style>
        body {
            font-family: Courier New, monospace;
            margin: 5px;
            padding: 5px;
            width: 80mm;
            background: white;
        }
        .voucher {
            border-bottom: 1px dashed #000;
            padding: 10px 0;
            margin-bottom: 10px;
            text-align: center;
        }
        .header {
            font-size: 12px;
            font-weight: bold;
            margin-bottom: 8px;
        }
        .code {
            font-family: Courier New, monospace;
            font-size: 16px;
            font-weight: bold;
            background: #000;
            color: #fff;
            padding: 5px;
            margin: 8px 0;
            letter-spacing: 2px;
        }
        .info {
            font-size: 10px;
            margin: 3px 0;
        }
        .price {
            font-size: 12px;
            font-weight: bold;
            margin-top: 5px;
        }
        .separator {
            border-top: 1px dashed #000;
            margin: 10px 0;
        }
    </style>
</head>
<body>
    <!-- VOUCHERS_PLACEHOLDER -->
</body>
</html>`;
        }
        return '';
    }

    // Print vouchers by batch ID
    fastify.get('/batch/:batchId', async (request, reply) => {
        try {
            const { batchId } = request.params;
            const { template = 'a4', auto_print } = request.query;

            // Get vouchers by batch ID
            const vouchers = await db.query(`
                SELECT v.*, p.name as profile_name, p.bandwidth_up, p.bandwidth_down, p.type
                FROM vouchers v
                LEFT JOIN profiles p ON v.profile_id = p.id
                WHERE v.batch_id = $1
                ORDER BY v.id
            `, [batchId]);

            if (vouchers.length === 0) {
                return reply.code(404).view('error', {
                    message: 'Batch not found',
                    error: 'No vouchers found for this batch'
                });
            }

            // Calculate total revenue
            const totalRevenue = vouchers.reduce((sum, voucher) => sum + (voucher.price_sell || 0), 0);

            // Templates are now built into the EJS file, no need to read from files

            // Simple voucher processing - templates are now built into the EJS file
            const processedVouchers = vouchers.map((voucher, index) => {
                return {
                    ...voucher
                };
            });

            // Get template name from settings
            let templateName = 'Default';
            try {
                const templateNameResult = await db.query(`SELECT value FROM settings WHERE key = $1`, ['template_name']);
                templateName = templateNameResult.rows && templateNameResult.rows.length > 0 ? templateNameResult.rows[0].value : 'Default';
            } catch (error) {
                console.warn('Error getting template name from settings:', error.message);
            }

            // Render with print-only template (no header/footer)
            reply.header('Content-Type', 'text/html');
            return reply.view('print-templates/print-only', {
                vouchers: processedVouchers,
                totalRevenue,
                settings: reply.locals.settings || {},
                formatCurrency: formatCurrency,
                templateType: template,
                templateName: templateName,
                auto_print: auto_print === 'true',
                admin: reply.locals.admin || null
            });

        } catch (error) {
            fastify.log.error('Error printing batch vouchers:', error);
            return reply.code(500).view('error', {
                message: 'Internal Server Error',
                error: error.message
            });
        }
    });

    // API endpoint to get available print templates
    fastify.get('/api/templates', async (request, reply) => {
        try {
            const fs = require('fs');
            const path = require('path');
            const templateDir = path.join(__dirname, '../../views/print-templates');

            const templates = [];
            const files = fs.readdirSync(templateDir);

            files.forEach(file => {
                if (file.endsWith('.ejs')) {
                    const templateName = file.replace('.ejs', '');
                    templates.push({
                        name: templateName,
                        display: templateName.charAt(0).toUpperCase() + templateName.slice(1) + ' Template',
                        file: file
                    });
                }
            });

            return {
                success: true,
                templates: templates
            };

        } catch (error) {
            fastify.log.error('Error getting print templates:', error);
            return reply.code(500).send({
                success: false,
                message: 'Failed to get print templates',
                error: error.message
            });
        }
    });

    // Preview print template
    fastify.post('/api/preview', async (request, reply) => {
        try {
            const { template, voucherData } = request.body;

            if (!template || !voucherData) {
                return reply.code(400).send({
                    success: false,
                    message: 'Template and voucher data are required'
                });
            }

            // Get template path
            const templatePath = `print-templates/${template}.ejs`;

            try {
                const html = await reply.view(templatePath, {
                    vouchers: voucherData,
                    totalRevenue: voucherData.reduce((sum, v) => sum + (v.price_sell || 0), 0),
                    settings: reply.locals.settings || {},
                    formatCurrency: formatCurrency,
                    printMode: '',
                    auto_print: false
                });

                return {
                    success: true,
                    preview: html
                };

            } catch (templateError) {
                return reply.code(404).send({
                    success: false,
                    message: `Template ${template} not found`,
                    error: templateError.message
                });
            }

        } catch (error) {
            fastify.log.error('Error previewing print template:', error);
            return reply.code(500).send({
                success: false,
                message: 'Failed to preview template',
                error: error.message
            });
        }
    });

    // Print management page
    fastify.get('/manage', async (request, reply) => {
        try {
            const fs = require('fs');
            const path = require('path');
            const templateDir = path.join(__dirname, '../../views/print-templates');

            const templates = [];
            const files = fs.readdirSync(templateDir);

            files.forEach(file => {
                if (file.endsWith('.ejs')) {
                    const templateName = file.replace('.ejs', '');
                    templates.push({
                        name: templateName,
                        display: templateName.charAt(0).toUpperCase() + templateName.slice(1) + ' Template',
                        file: file
                    });
                }
            });

            return reply.view('print/manage', {
                templates,
                settings: reply.locals.settings || {}
            });

        } catch (error) {
            fastify.log.error('Error loading print management page:', error);
            return reply.code(500).view('error', {
                message: 'Internal Server Error',
                error: error.message
            });
        }
    });

    // Serve template files
    fastify.get('/templates/:filename', async (request, reply) => {
        try {
            const { filename } = request.params;
            const fs = require('fs');
            const path = require('path');

            // Security check - only allow specific template files
            const allowedFiles = ['template_a4.html', 'template_thermal.html'];
            if (!allowedFiles.includes(filename)) {
                return reply.code(403).send('File not allowed');
            }

            const filePath = path.join(__dirname, '../../data', filename);

            if (!fs.existsSync(filePath)) {
                return reply.code(404).send('File not found');
            }

            const fileContent = fs.readFileSync(filePath, 'utf8');
            reply.header('Content-Type', 'text/html');
            return fileContent;

        } catch (error) {
            fastify.log.error('Error serving template file:', error);
            return reply.code(500).send('Internal Server Error');
        }
    });
};