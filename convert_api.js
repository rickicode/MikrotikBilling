const fs = require('fs');
const path = require('path');

// Read the api.js file
const filePath = path.join(__dirname, 'src/routes/api.js');
let content = fs.readFileSync(filePath, 'utf8');

// Track changes
let changes = 0;

// Convert prepare().all() to query()
content = content.replace(/fastify\.db\.prepare\(([^)]+)\)\.all\(([^)]+)\)/g, (match, query, params) => {
  changes++;
  // Convert ? placeholders to $1, $2, etc.
  let paramCount = 0;
  const convertedQuery = query.replace(/\?/g, () => `$${++paramCount}`);
  return `await fastify.db.query(${convertedQuery}, ${params})`;
});

// Convert prepare().get() to queryOne()
content = content.replace(/fastify\.db\.prepare\(([^)]+)\)\.get\(([^)]+)\)/g, (match, query, params) => {
  changes++;
  // Convert ? placeholders to $1, $2, etc.
  let paramCount = 0;
  const convertedQuery = query.replace(/\?/g, () => `$${++paramCount}`);
  return `await fastify.db.queryOne(${convertedQuery}, ${params})`;
});

// Convert .get() to queryOne()
content = content.replace(/fastify\.db\.get\(([^)]+)\)/g, (match, queryWithParams) => {
  changes++;
  // Extract query and params
  const matchResult = queryWithParams.match(/^(.+?),\s*\[(.+?)\]$/);
  if (matchResult) {
    const query = matchResult[1];
    const params = matchResult[2];
    // Convert ? placeholders to $1, $2, etc.
    let paramCount = 0;
    const convertedQuery = query.replace(/\?/g, () => `$${++paramCount}`);
    return `await fastify.db.queryOne(${convertedQuery}, [${params}])`;
  }
  // No params case
  let paramCount = 0;
  const convertedQuery = queryWithParams.replace(/\?/g, () => `$${++paramCount}`);
  return `await fastify.db.queryOne(${convertedQuery})`;
});

// Convert .run() to query() for INSERT/UPDATE/DELETE
content = content.replace(/fastify\.db\.run\(([^)]+)\)/g, (match, queryWithParams) => {
  changes++;
  // Extract query and params
  const matchResult = queryWithParams.match(/^(.+?),\s*\[(.+?)\]$/);
  if (matchResult) {
    const query = matchResult[1];
    const params = matchResult[2];
    // Convert ? placeholders to $1, $2, etc.
    let paramCount = 0;
    const convertedQuery = query.replace(/\?/g, () => `$${++paramCount}`);
    return `await fastify.db.query(${convertedQuery}, [${params}])`;
  }
  // No params case
  let paramCount = 0;
  const convertedQuery = queryWithParams.replace(/\?/g, () => `$${++paramCount}`);
  return `await fastify.db.query(${convertedQuery})`;
});

// Convert COUNT queries with .count
content = content.replace(/\.count/g, '.rowCount');

// Handle datetime('now') to NOW()
content = content.replace(/datetime\('now'\)/g, 'NOW()');

// Handle datetime('now', '-X days') to NOW() - INTERVAL 'X days'
content = content.replace(/datetime\('now',\s*'-([^']+)'\)/g, 'NOW() - INTERVAL \'$1\'');

// Handle CURRENT_TIMESTAMP (already compatible)
// CURRENT_TIMESTAMP stays the same

// Write the converted content back
fs.writeFileSync(filePath, content, 'utf8');

console.log(`Conversion complete! Made ${changes} changes to api.js`);