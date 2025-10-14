const fs = require('fs');

let content = fs.readFileSync('src/routes/vendors.js', 'utf8');

// Fix all unquoted strings
content = content.replace(/const search = request\.query\.search || ';/g, "const search = request.query.search || '';");
content = content.replace(/const status = request\.query\.status || ';/g, "const status = request.query.status || '';");
content = content.replace(/whereClause \+=  AND status = \?;/g, "whereClause += ' AND status = ?';");
content = content.replace(/params\.push\(`%\$search%`\)/g, "params.push(`%${search}%`)");
content = content.replace(/LIKE \? OR contact_person LIKE \? OR phone LIKE \? OR email LIKE \?`\);/g, "LIKE ? OR contact_person LIKE ? OR phone LIKE ? OR email LIKE ?');");
content = content.replace(/error: Internal Server Error`/g, "error: 'Internal Server Error'");
content = content.replace(/auth\.requireRole\(admin`\);/g, "auth.requireRole(['admin'])");
content = content.replace(/auth\.requireRole\(\['admin, 'superadmin'\]\)/g, "auth.requireRole(['admin', 'superadmin'])");
content = content.replace(/\.toLocaleDateString\('id-ID`\);/g, ".toLocaleDateString('id-ID')");
content = content.replace(/\.toLocaleString\(id-ID`\);/g, ".toLocaleString('id-ID')");
content = content.replace(/Intl\.NumberFormat\('id-ID', \{ style: currency, currency: IDR \}\)/g, "Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' })");
content = content.replace(/currency: IDR,/g, "currency: 'IDR',");
content = content.replace(/style: currency,/g, "style: 'currency',");
content = content.replace(/return reply\.view\(vendors\/index, \{/g, "return reply.view('vendors/index', {");
content = content.replace(/return reply\.view\(vendors\/create, \{/g, "return reply.view('vendors/create', {");
content = content.replace(/return reply\.view\(vendors\/show, \{/g, "return reply.view('vendors/show', {");
content = content.replace(/error: Vendor not found`/g, "error: 'Vendor not found'");
content = content.replace(/success: Vendor created successfully`/g, "success: 'Vendor created successfully'");
content = content.replace(/success: Vendor updated successfully`/g, "success: 'Vendor updated successfully'");
content = content.replace(/success: Vendor deleted successfully`/g, "success: 'Vendor deleted successfully'");
content = content.replace(/error: Failed to create vendor`/g, "error: 'Failed to create vendor'");
content = content.replace(/error: Failed to update vendor`/g, "error: 'Failed to update vendor'");
content = content.replace(/error: Failed to delete vendor`/g, "error: 'Failed to delete vendor'");

// Fix SQL queries
content = content.replace(/SELECT \* FROM vendors WHERE id = \$1,/g, "'SELECT * FROM vendors WHERE id = $1',");
content = content.replace(/UPDATE vendors SET .* WHERE id = \$1,/g, "'UPDATE vendors SET ... WHERE id = $1',");
content = content.replace(/INSERT INTO vendors .* VALUES/g, "'INSERT INTO vendors ... VALUES");
content = content.replace(/DELETE FROM vendors WHERE id = \$1,/g, "'DELETE FROM vendors WHERE id = $1',");

// Write the fixed content
fs.writeFileSync('src/routes/vendors.js', content, 'utf8');

console.log('Fixed vendors.js syntax errors');