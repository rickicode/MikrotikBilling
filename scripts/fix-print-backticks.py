import sys

# Read the file
with open(sys.argv[1], 'r') as f:
    content = f.read()

# Replace backticks with single quotes in the problematic lines
content = content.replace("ids.split(,`).map", "ids.split(',').map")
content = content.replace("placeholders = voucherIds.map(() => '?`).join(,`)", "placeholders = voucherIds.map(() => '?').join(',')")
content = content.replace("fs = require(fs`)", "fs = require('fs')")
content = content.replace("path = require(path`)", "path = require('path')")
content = content.replace("templateFilePath, utf8`)", "templateFilePath, 'utf8'")
content = content.replace("voucher.voucher_code || `)", "voucher.voucher_code || ''")
content = content.replace("reply.locals.settings && reply.locals.settings.company_name) || WiFi Hotspot`", "reply.locals.settings && reply.locals.settings.company_name) || 'WiFi Hotspot'")
content = content.replace("voucher.vendor_name || Tanpa Vendor`", "voucher.vendor_name || 'Tanpa Vendor'")
content = content.replace("new Date(voucher.created_at).toLocaleDateString(id-ID`)", "new Date(voucher.created_at).toLocaleDateString('id-ID')")
content = content.replace("formatCurrency(voucher.price_sell).replace(Rp, `).trim()", "formatCurrency(voucher.price_sell).replace('Rp', '').trim()")
content = content.replace("templateNameResult.value : Default", "templateNameResult.value : 'Default'")
content = content.replace("template === a4 ? cssStyles", "template === 'a4' ? cssStyles")
content = content.replace("templateType === a4`)", "templateType === 'a4')")
content = content.replace("templateType === thermal`)", "templateType === 'thermal'")
content = content.replace("auto_print === 'true'", "auto_print === 'true'")
content = content.replace("template = a4,", "template = 'a4',")
content = content.replace("reply.header('Content-Type', 'text/html')", "reply.header('Content-Type', 'text/html')")
content = content.replace("message: 'Internal Server Error'", "message: 'Internal Server Error'")
content = content.replace("fastify.get('/batch/:batchId',", "fastify.get('/batch/:batchId',")
content = content.replace("templateNameResult.value : 'Default'", "templateNameResult.value : 'Default'")
content = content.replace("message: 'Failed to get print templates'", "message: 'Failed to get print templates'")
content = content.replace("message: 'Failed to preview template',", "message: 'Failed to preview template',")
content = content.replace("fastify.get('/manage',", "fastify.get('/manage',")
content = content.replace("reply.view('print/manage'", "reply.view('print/manage'")
content = content.replace("message: 'File not allowed'", "message: 'File not allowed'")
content = content.replace("message: 'File not found'", "message: 'File not found'")
content = content.replace("allowedFiles = ['template_a4.html', 'template_thermal.html']", "allowedFiles = ['template_a4.html', 'template_thermal.html']")
content = content.replace(".readFileSync(filePath, 'utf8')", ".readFileSync(filePath, 'utf8')")
content = content.replace("printMode: ''", "printMode: ''")

# Write the file back
with open(sys.argv[1], 'w') as f:
    f.write(content)

print("Fixed backticks in", sys.argv[1])