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

    // Get voucher by IDs for printing
    fastify.get('/vouchers/:ids', async (request, reply) => {
        try {
            const { ids } = request.params;
            const { auto_print } = request.query;

            // Get template type from settings
            const templateResult = await db.query(`SELECT value FROM settings WHERE key = $1`, ['print_template_type']);
            const template = templateResult ? templateResult.value : 'a4'; // Default to A4

            // Parse voucher IDs
            const voucherIds = ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));

            if (voucherIds.length === 0) {
                return reply.code(400).view('error', {
                    message: 'Invalid voucher IDs',
                    error: 'No valid voucher IDs provided'
                });
            }

            // Get vouchers from database
            const placeholders = voucherIds.map((_, index) => `$${index + 1}`).join(',');
            const vouchers = await db.query(`
                SELECT v.*, p.name as profile_name, p.bandwidth_up, p.bandwidth_down, p.type,
                       vd.name as vendor_name
                FROM vouchers v
                LEFT JOIN profiles p ON v.profile_id = p.id
                LEFT JOIN vendors vd ON v.vendor_id = vd.id
                WHERE v.id IN (${placeholders})
                ORDER BY v.id
            `, voucherIds);

            if (vouchers.length === 0) {
                return reply.code(404).view('error', {
                    message: 'Vouchers not found',
                    error: 'No vouchers found with the provided IDs'
                });
            }

            // Calculate total revenue
            const totalRevenue = vouchers.reduce((sum, voucher) => sum + (voucher.price_sell || 0), 0);

            // Read template file
            const fs = require('fs');
            const path = require('path');
            const templateFileName = `template_${template}.html`;
            const templateFilePath = path.join(__dirname, '../../data', templateFileName);

            let templateContent = '';
            try {
                templateContent = fs.readFileSync(templateFilePath, 'utf8');
            } catch (error) {
                // If template file doesn't exist, use default built-in template
                templateContent = getDefaultTemplate(template);
            }

            // Generate all vouchers HTML by creating multiple voucher divs
            let allVouchersHTML = '';
            vouchers.forEach((voucher, index) => {
                let voucherHTML = templateContent;

                // Replace template variables with actual voucher data
                voucherHTML = voucherHTML.replace(/{KodeVoucher}/g, voucher.voucher_code || '');
                voucherHTML = voucherHTML.replace(/{NamaPerusahaan}/g, (reply.locals.settings && reply.locals.settings.company_name) || 'WiFi Hotspot');
                voucherHTML = voucherHTML.replace(/{NamaVendor}/g, voucher.vendor_name || 'Tanpa Vendor');
                voucherHTML = voucherHTML.replace(/{DurasiHari}/g, `${Math.floor(voucher.duration_hours / 24)} Hari`);
                voucherHTML = voucherHTML.replace(/{TanggalExpired}/g, new Date(voucher.created_at).toLocaleDateString('id-ID'));
                voucherHTML = voucherHTML.replace(/{HargaJual}/g, formatCurrency(voucher.price_sell).replace('Rp', '').trim());
                voucherHTML = voucherHTML.replace(/\[1\]/g, `[${index + 1}]`);

                // Extract just the voucher div from the template
                const voucherMatch = voucherHTML.match(/<div class="voucher">[\s\S]*?<\/div>/);
                if (voucherMatch) {
                    allVouchersHTML += voucherMatch[0];
                }
            });

            // Build final HTML with proper structure
            let finalHTML = templateContent;
            const containerMatch = finalHTML.match(/(<div class="voucher-container">)[\s\S]*?(<\/div>)/);
            if (containerMatch) {
                finalHTML = finalHTML.replace(containerMatch[0], `${containerMatch[1]}${allVouchersHTML}${containerMatch[2]}`);
            }

            // Get template name from settings
            const templateNameResult = await db.query(`SELECT value FROM settings WHERE key = $1`, ['template_name']);
            const templateName = templateNameResult ? templateNameResult.value : 'Default';

            // Build complete HTML document with embedded CSS
            const cssStyles = `
                body {
                    font-family: Courier New, monospace;
                    margin: 5px;
                    background: #ffffff;
                    font-size: 10px;
                }
                .voucher-container {
                    display: grid;
                    grid-template-columns: repeat(10, 1fr);
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
            `;

            const thermalCssStyles = `
                body {
                    font-family: Courier New, monospace;
                    margin: 5px;
                    padding: 5px;
                    width: 80mm;
                    background: white;
                }
                .voucher-container {
                    width: 100%;
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
            `;

            const completeHTML = `<!DOCTYPE html>
<html>
<head>
    <title>WiFi Voucher - ${template.toUpperCase()}</title>
    <style>
        ${template === 'a4' ? cssStyles : thermalCssStyles}
    </style>
</head>
<body>
    ${finalHTML}
</body>
</html>`;

            // Return the processed template HTML
            reply.header('Content-Type', 'text/html');
            return completeHTML;

        } catch (error) {
            fastify.log.error('Error printing vouchers:', error);
            reply.code(500).view('error', {
                message: 'Internal Server Error',
                error: error.message
            });
        }
    });

    // Helper function to get default template HTML
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
            const templateNameResult = await db.query(`SELECT value FROM settings WHERE key = $1`, ['template_name']);
            const templateName = templateNameResult ? templateNameResult.value : 'Default';

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
            reply.code(500).view('error', {
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
            reply.code(500).send({
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
            reply.code(500).send({
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
            reply.code(500).view('error', {
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