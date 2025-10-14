#!/usr/bin/env python3
import sys

# Read the file
with open(sys.argv[1], 'r') as f:
    content = f.read()

# Fix the remaining specific errors
content = content.replace(
    "voucherHTML.replace(/{HargaJual}/g, formatCurrency(voucher.price_sell).replace(Rp, `);.trim());",
    "voucherHTML.replace(/{HargaJual}/g, formatCurrency(voucher.price_sell).replace('Rp', '').trim());"
)

content = content.replace(
    "const templateNameResult = await db.query(`SELECT value FROM settings WHERE key = $1`, 'template_name']);",
    "const templateNameResult = await db.query(`SELECT value FROM settings WHERE key = $1`, ['template_name']);"
)

content = content.replace(
    "const templateNameResult = await db.query(`SELECT value FROM settings WHERE key = $1`, 'template_name']);",
    "const templateNameResult = await db.query(`SELECT value FROM settings WHERE key = $1`, ['template_name']);"
)

content = content.replace(
    "const fs = require('fs`);",
    "const fs = require('fs');"
)

content = content.replace(
    "if (file.endsWith('.ejs');)",
    "if (file.endsWith('.ejs'))"
)

content = content.replace(
    "+ Template,",
    "+ ' Template',"
)

content = content.replace(
    "reply.view('print/manage',",
    "reply.view('print/manage',"
)

content = content.replace(
    "reply.view('print/manage',,",
    "reply.view('print/manage',"
)

content = content.replace(
    "allowedFiles = [template_a4.html, template_thermal.html];",
    "allowedFiles = ['template_a4.html', 'template_thermal.html'];"
)

content = content.replace(
    "reply.status(500).view('error', {",
    "reply.code(500).view('error', {"
)

content = content.replace(
    "reply.status(404).view('error', {",
    "reply.code(404).view('error', {"
)

content = content.replace(
    "reply.status(400).send({",
    "reply.code(400).send({"
)

content = content.replace(
    "reply.status(500).send({",
    "reply.code(500).send({"
)

content = content.replace(
    "reply.status(404).send(",
    "reply.code(404).send("
)

content = content.replace(
    "reply.status(403).send(",
    "reply.code(403).send("
)

content = content.replace(
    "reply.status(500).send(",
    "reply.code(500).send("
)

content = content.replace(
    "} else if (templateType === 'thermal'; {",
    "} else if (templateType === 'thermal') {"
)

# Write the file back
with open(sys.argv[1], 'w') as f:
    f.write(content)

print("Fixed remaining print.js errors")