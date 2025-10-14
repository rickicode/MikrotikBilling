const fs = require('fs');
const path = require('path');

// Read the api.js file
const filePath = path.join(__dirname, '../src/routes/api.js');
let content = fs.readFileSync(filePath, 'utf8');

console.log('Updating api.js to use DatabaseManager...');

// Add db instance at the beginning of the function
content = content.replace(
    'async function apiRoutes(fastify, options) {',
    'async function apiRoutes(fastify, options) {\n  const db = DatabaseManager.getInstance();'
);

// Fix the remaining getOne calls
content = content.replace(
    'await db.getOne(\'profiles\', { id: { $ne: request.params.id } });',
    '(await db.query("SELECT * FROM profiles WHERE name = $1 AND id != $2", [name, request.params.id]))[0]'
);

// Fix the test-db-error query
content = content.replace(
    'return await db.query(`SELECT * FROM non_existent_table_for_testing`);',
    'return await db.query("SELECT * FROM non_existent_table_for_testing");'
);

// Fix the getOne calls that return single values
content = content.replace(
    'await db.query(\'SELECT COUNT(*) as total FROM profiles\')',
    '(await db.query(\'SELECT COUNT(*) as total FROM profiles\'))[0]'
);

content = content.replace(
    'await db.query(\'SELECT COUNT(*) as count FROM profiles WHERE type = \\\'hotspot\\\'\')',
    '(await db.query(\'SELECT COUNT(*) as count FROM profiles WHERE type = \\\'hotspot\\\'\'))[0]'
);

content = content.replace(
    'await db.query(\'SELECT COUNT(*) as count FROM profiles WHERE type = \\\'pppoe\\\'\')',
    '(await db.query(\'SELECT COUNT(*) as count FROM profiles WHERE type = \\\'pppoe\\\'\'))[0]'
);

content = content.replace(
    'await db.query(\'SELECT COUNT(*) as count FROM profiles WHERE mikrotik_synced = 1\')',
    '(await db.query(\'SELECT COUNT(*) as count FROM profiles WHERE mikrotik_synced = 1\'))[0]'
);

// Fix array access patterns
content = content.replace(/\.rowCount/g, '[0].count');

// Write the fixed content back
fs.writeFileSync(filePath, content, 'utf8');

console.log('✅ Updated api.js to use DatabaseManager');