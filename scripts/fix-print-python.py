#!/usr/bin/env python3
import sys

# Read the file
with open(sys.argv[1], 'r') as f:
    content = f.read()

# Fix all the syntax errors
replacements = [
    ("let allVouchersHTML = ;", "let allVouchersHTML = '';"),
    ("voucher.voucher_code || '';", "voucher.voucher_code || '');"),
    ("new Date(voucher.created_at).toLocaleDateString('id-ID'););", "new Date(voucher.created_at).toLocaleDateString('id-ID'));"),
    ("formatCurrency(voucher.price_sell).replace('Rp', `).trim());", "formatCurrency(voucher.price_sell).replace('Rp', '').trim());"),
    ("[template_name]", "'template_name']"),
    ("reply.header(Content-Type, text/html`);", "reply.header('Content-Type', 'text/html');"),
    ("fastify.log.error(Error printing vouchers:, error);", "fastify.log.error('Error printing vouchers:', error);"),
    ("reply.status(500).view(error, {", "reply.code(500).view('error', {"),
    ("message: Internal Server Error,", "message: 'Internal Server Error',"),
    ("if (templateType === 'a4'); {", "if (templateType === 'a4') {"),
    ("} else if (templateType === 'thermal'); {", "} else if (templateType === 'thermal') {"),
    ("return ;", "return '';"),
    ("fastify.get(/batch/:batchId,", "fastify.get('/batch/:batchId',"),
    ("reply.status(404).view(error, {", "reply.code(404).view('error', {"),
    ("message: Batch not found,", "message: 'Batch not found',"),
    ("error: No vouchers found for this batch", "error: 'No vouchers found for this batch'"),
    ("const fs = require(fs`);", "const fs = require('fs');"),
    ("const path = require(path`);", "const path = require('path');"),
    ("__dirname, ../../views/print-templates`);", "__dirname, '../../views/print-templates');"),
    ("file.endsWith(.ejs`);", "file.endsWith('.ejs');"),
    ("file.replace(.ejs, `);", "file.replace('.ejs', '');"),
    ("+ Template,", "+ ' Template',"),
    ("fastify.log.error(Error getting print templates:, error);", "fastify.log.error('Error getting print templates:', error);"),
    ("fastify.log.error(Error previewing print template:, error);", "fastify.log.error('Error previewing print template:', error);"),
    ("message: Failed to preview template,", "message: 'Failed to preview template',"),
    ("printMode: ,", "printMode: '',"),
    ("fastify.get(/manage,", "fastify.get('/manage',"),
    ("reply.view('print/manage''", "reply.view('print/manage'"),
    ("allowedFiles = [template_a4.html, template_thermal.html];", "allowedFiles = ['template_a4.html', 'template_thermal.html'];"),
    ("fs.readFileSync(filePath, utf8`);", "fs.readFileSync(filePath, 'utf8');"),
    ("reply.locals.settings && reply.locals.settings.company_name) || WiFi Hotspot`", "reply.locals.settings && reply.locals.settings.company_name) || 'WiFi Hotspot'"),
    ("voucher.vendor_name || Tanpa Vendor`", "voucher.vendor_name || 'Tanpa Vendor'"),
    ("new Date(voucher.created_at).toLocaleDateString(id-ID`)", "new Date(voucher.created_at).toLocaleDateString('id-ID')"),
    ("formatCurrency(voucher.price_sell).replace(Rp, `).trim()", "formatCurrency(voucher.price_sell).replace('Rp', '').trim()"),
    ("templateNameResult.value : Default", "templateNameResult.value : 'Default'"),
    ("template === a4 ? cssStyles", "template === 'a4' ? cssStyles"),
    ("templateType === a4`);", "templateType === 'a4');"),
    ("templateType === thermal`);", "templateType === 'thermal');"),
    ("template = a4,", "template = 'a4',"),
    ("message: 'Failed to get print templates'", "message: 'Failed to get print templates'"),
    ("fastify.get(/batch/:batchId,", "fastify.get('/batch/:batchId',"),
    ("reply.view('print/manage''", "reply.view('print/manage'"),
    ("reply.view('print/manage'", "reply.view('print/manage',"),
    ("reply.view('print/manage',", "reply.view('print/manage',"),
    ("message: 'File not allowed'", "message: 'File not allowed'"),
    ("message: 'File not found'", "message: 'File not found'"),
    ("auto_print === 'true'", "auto_print === 'true'"),
    ("message: `Template ${template} not found`", "message: `Template ${template} not found`")
]

# Apply all replacements
for old, new in replacements:
    content = content.replace(old, new)

# Write the file back
with open(sys.argv[1], 'w') as f:
    f.write(content)

print("Fixed print.py syntax errors")