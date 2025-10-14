const fs = require('fs');
const path = require('path');

// Read the api.js file
const filePath = path.join(__dirname, '../src/routes/api.js');
let content = fs.readFileSync(filePath, 'utf8');

console.log('Applying comprehensive fixes to api.js...');

// 1. Fix DatabaseManager import
content = content.replace(
    "const { db } = require('../database/DatabaseManager');",
    "const DatabaseManager = require('../database/DatabaseManager');\n\nasync function apiRoutes(fastify, options) {\n  const db = DatabaseManager.getInstance();"
);

// 2. Fix route definitions
const routePatterns = [
    [/fastify\.get\('\/test-error',/g, "fastify.get('/test-error',"],
    [/fastify\.get\('\/test-db-error',/g, "fastify.get('/test-db-error',"],
    [/fastify\.get\('\/profiles',/g, "fastify.get('/profiles',"],
    [/fastify\.get\('\/profiles\/:id',/g, "fastify.get('/profiles/:id',"],
    [/fastify\.post\('\/profiles',/g, "fastify.post('/profiles',"],
    [/fastify\.put\('\/profiles\/:id',/g, "fastify.put('/profiles/:id',"],
    [/fastify\.delete\('\/profiles\/:id',/g, "fastify.delete('/profiles/:id',"],
    [/fastify\.post\('\/profiles\/:id\/sync',/g, "fastify.post('/profiles/:id/sync',"],
    [/fastify\.post\('\/profiles\/sync-all',/g, "fastify.post('/profiles/sync-all',"],
    [/fastify\.get\('\/profiles\/stats',/g, "fastify.get('/profiles/stats',"],
    [/fastify\.get\('\/hotspot\/users',/g, "fastify.get('/hotspot/users',"],
    [/fastify\.get\('\/pppoe',/g, "fastify.get('/pppoe',"],
    [/fastify\.get\('\/pppoe\/statistics',/g, "fastify.get('/pppoe/statistics',"],
    [/fastify\.post\('\/pppoe\/:id\/enable',/g, "fastify.post('/pppoe/:id/enable',"],
    [/fastify\.post\('\/pppoe\/:id\/extend',/g, "fastify.post('/pppoe/:id/extend',"],
    [/fastify\.post\('\/pppoe\/sync',/g, "fastify.post('/pppoe/sync',"],
    [/fastify\.get\('\/system\/resources',/g, "fastify.get('/system/resources',"],
    [/fastify\.get\('\/interface\/traffic\/:interfaceName',/g, "fastify.get('/interface/traffic/:interfaceName',"],
    [/fastify\.get\('\/public\/system\/connection',/g, "fastify.get('/public/system/connection',"],
    [/fastify\.get\('\/export\/:type',/g, "fastify.get('/export/:type',"],
    [/fastify\.post\('\/webhook\/duitku',/g, "fastify.post('/webhook/duitku',"],
    [/fastify\.get\('\/settings',/g, "fastify.get('/settings',"],
    [/fastify\.put\('\/settings',/g, "fastify.put('/settings',"],
    [/fastify\.get\('\/whatsapp\/notifications',/g, "fastify.get('/whatsapp/notifications',"],
    [/fastify\.post\('\/whatsapp\/notifications\/:id\/read',/g, "fastify.post('/whatsapp/notifications/:id/read',"],
    [/fastify\.get\('\/whatsapp\/templates\/:id',/g, "fastify.get('/whatsapp/templates/:id',"],
    [/fastify\.post\('\/whatsapp\/templates',/g, "fastify.post('/whatsapp/templates',"],
    [/fastify\.put\('\/whatsapp\/templates\/:id',/g, "fastify.put('/whatsapp/templates/:id',"],
    [/fastify\.get\('\/public\/whatsapp\/count',/g, "fastify.get('/public/whatsapp/count',"],
    [/fastify\.get\('\/whatsapp\/stats',/g, "fastify.get('/whatsapp/stats',"],
    [/fastify\.get\('\/customers',/g, "fastify.get('/customers',"],
    [/fastify\.get\('\/customers\/:id',/g, "fastify.get('/customers/:id',"],
    [/fastify\.post\('\/customers',/g, "fastify.post('/customers',"],
    [/fastify\.put\('\/customers\/:id',/g, "fastify.put('/customers/:id',"],
    [/fastify\.delete\('\/customers\/:id',/g, "fastify.delete('/customers/:id',"],
    [/fastify\.get\('\/customers\/stats',/g, "fastify.get('/customers/stats',"],
    [/fastify\.get\('\/subscriptions',/g, "fastify.get('/subscriptions',"],
    [/fastify\.get\('\/subscriptions\/:id',/g, "fastify.get('/subscriptions/:id',"],
    [/fastify\.post\('\/subscriptions',/g, "fastify.post('/subscriptions',"],
    [/fastify\.put\('\/subscriptions\/:id',/g, "fastify.put('/subscriptions/:id',"],
    [/fastify\.delete\('\/subscriptions\/:id',/g, "fastify.delete('/subscriptions/:id',"],
    [/fastify\.get\('\/subscriptions\/stats',/g, "fastify.get('/subscriptions/stats',"],
    [/fastify\.post\('\/subscriptions\/:id\/extend',/g, "fastify.post('/subscriptions/:id/extend',"],
    [/fastify\.get\('\/payments',/g, "fastify.get('/payments',"],
    [/fastify\.get\('\/payments\/:id',/g, "fastify.get('/payments/:id',"],
    [/fastify\.post\('\/payments',/g, "fastify.post('/payments',"],
    [/fastify\.put\('\/payments\/:id\/status',/g, "fastify.put('/payments/:id/status',"],
    [/fastify\.delete\('\/payments\/:id',/g, "fastify.delete('/payments/:id',"],
    [/fastify\.get\('\/payments\/stats',/g, "fastify.get('/payments/stats',"],
    [/fastify\.post\('\/customers\/:id\/balance',/g, "fastify.post('/customers/:id/balance',"],
    [/fastify\.get\('\/monitoring\/expiry\/stats',/g, "fastify.get('/monitoring/expiry/stats',"],
    [/fastify\.get\('\/monitoring\/expiry\/subscriptions',/g, "fastify.get('/monitoring/expiry/subscriptions',"],
    [/fastify\.get\('\/monitoring\/expiry\/pppoe',/g, "fastify.get('/monitoring/expiry/pppoe',"],
    [/fastify\.post\('\/monitoring\/expiry\/send-warnings',/g, "fastify.post('/monitoring/expiry/send-warnings',"],
    [/fastify\.get\('\/monitoring\/expiry\/dashboard',/g, "fastify.get('/monitoring/expiry/dashboard',"],
    [/fastify\.post\('\/analytics\/performance',/g, "fastify.post('/analytics/performance',"],
    [/fastify\.get\('\/bot\/status',/g, "fastify.get('/bot/status',"]
];

routePatterns.forEach(([pattern, replacement]) => {
    content = content.replace(pattern, replacement);
});

// 3. Fix database queries
content = content.replace(
    /await db\.getOne\(`SELECT \* FROM profiles WHERE id = \$1, \[request\.params\.id\]\);/g,
    "await db.getOne('profiles', { id: request.params.id });"
);

content = content.replace(
    /await db\.getOne\('SELECT id FROM profiles WHERE name = \$1', \[name\]\);/g,
    "await db.getOne('profiles', { name });"
);

content = content.replace(
    /await db\.getOne\('SELECT id FROM profiles WHERE name = \$1 AND id != \$2', \[name, request\.params\.id\]\);/g,
    "await db.query('SELECT id FROM profiles WHERE name = $1 AND id != $2', [name, request.params.id])"
);

content = content.replace(
    /await db\.getOne\('SELECT \* FROM profiles WHERE id = \$1', \[profileId\]\);/g,
    "await db.getOne('profiles', { id: profileId });"
);

// 4. Fix settings queries
content = content.replace(
    /await db\.getOne\('SELECT value FROM settings WHERE key = \$1', \['([^']+)'\]\);/g,
    "await db.getOne('settings', { key: '$1' });"
);

// 5. Fix message strings
const messageFixes = [
    ['message: Profile not found', "message: 'Profile not found'"],
    ['message: Internal Server Error', "message: 'Internal Server Error'"],
    ['message: Profile created successfully', "message: 'Profile created successfully'"],
    ['message: Profile updated successfully', "message: 'Profile updated successfully'"],
    ['message: Cannot delete profile that is in use', "message: 'Cannot delete profile that is in use'"],
    ['message: Profile deleted successfully', "message: 'Profile deleted successfully'"],
    ['message: PPPoE user not found', "message: 'PPPoE user not found'"],
    ['message: PPPoE user extended successfully', "message: 'PPPoE user extended successfully'"],
    ['message: PPPoE sync completed successfully', "message: 'PPPoE sync completed successfully'"],
    ['message: Customer created successfully', "message: 'Customer created successfully'"],
    ['message: Customer updated successfully', "message: 'Customer updated successfully'"],
    ['message: Customer deleted successfully', "message: 'Customer deleted successfully'"],
    ['message: Subscription created successfully', "message: 'Subscription created successfully'"],
    ['message: Subscription updated successfully', "message: 'Subscription updated successfully'"],
    ['message: Subscription deleted successfully', "message: 'Subscription deleted successfully'"],
    ['message: Subscription extended successfully', "message: 'Subscription extended successfully'"],
    ['message: Payment created successfully', "message: 'Payment created successfully'"],
    ['message: Payment status updated successfully', "message: 'Payment status updated successfully'"],
    ['message: Payment deleted successfully', "message: 'Payment deleted successfully'"]
];

messageFixes.forEach(([oldStr, newStr]) => {
    content = content.replace(new RegExp(oldStr, 'g'), newStr);
});

// 6. Fix empty string assignments
content = content.replace(/\|\s*';\s*$/gm, " || '';");

// 7. Fix RouterOS query syntax
content = content.replace(/\?name:/g, "'.name':");

// 8. Fix console.log statements
content = content.replace(/console\.log\(([^']\w+)\s*,/g, "console.log('$1',");

// 9. Fix test-db-error query
content = content.replace(
    "return await db.query(`SELECT * FROM non_existent_table_for_testing`);",
    "return await db.query('SELECT * FROM non_existent_table_for_testing');"
);

// Write the fixed content back
fs.writeFileSync(filePath, content, 'utf8');

console.log('✅ Applied comprehensive fixes to api.js');