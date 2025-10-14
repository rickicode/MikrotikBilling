const fs = require('fs');

// Read the file
let content = fs.readFileSync('src/routes/customers.js', 'utf8');

// Add DatabaseManager import
content = content.replace(
  "const AuthMiddleware = require('../middleware/auth');\n",
  "const AuthMiddleware = require('../middleware/auth');\nconst { db } = require('../database/DatabaseManager');\n"
);

// Fix query patterns
const fixes = [
  // Fix .query calls to use await
  { pattern: /const customers = fastify\.db\.query\(/g, replacement: "const customers = await db.query(" },
  { pattern: /const subscriptions = fastify\.db\.query\(/g, replacement: "const subscriptions = await db.query(" },
  { pattern: /const payments = fastify\.db\.query\(/g, replacement: "const payments = await db.query(" },
  { pattern: /const transactions = fastify\.db\.query\(/g, replacement: "const transactions = await db.query(" },
  { pattern: /const profiles = fastify\.db\.query\(/g, replacement: "const profiles = await db.query(" },
  { pattern: /const pppProfiles = fastify\.db\.query\(/g, replacement: "const pppProfiles = await db.query(" },

  // Fix .get calls to use await db.getOne
  { pattern: /const total = fastify\.db\.get\(/g, replacement: "const totalResult = await db.getOne(" },
  { pattern: /const existing = fastify\.db\.get\(/g, replacement: "const existing = await db.getOne(" },
  { pattern: /const customer = fastify\.db\.get\(/g, replacement: "const customer = await db.getOne(" },
  { pattern: /const profile = fastify\.db\.get\(/g, replacement: "const profile = await db.getOne(" },
  { pattern: /const subscription = fastify\.db\.get\(/g, replacement: "const subscription = await db.getOne(" },
  { pattern: /const activeSubscriptions = fastify\.db\.get\(/g, replacement: "const activeSubscriptionsResult = await db.getOne(" },

  // Fix result handling
  { pattern: /\.count/g, replacement: " ? .result?.count : 0" },
  { pattern: /totalResult\.count/g, replacement: "totalResult ? totalResult.count : 0" },
  { pattern: /activeSubscriptionsResult\.count/g, replacement: "activeSubscriptionsResult ? activeSubscriptionsResult.count : 0" },

  // Fix .run calls for INSERT to use db.insert
  { pattern: /const result = fastify\.db\.run\(\s*`INSERT INTO customers \([^`]+`\)\s*VALUES \([^`]+`\)\s*, \[[^\]]+\]\s*\);/g,
    replacement: "const result = await db.insert('customers', {\n        nama,\n        nomor_hp,\n        email,\n        status_aktif\n      });" },

  // Fix .run calls for UPDATE to use db.update
  { pattern: /fastify\.db\.run\(\s*`UPDATE customers \([^`]+`\)\s*WHERE id = \?`\s*, \[[^\]]+\]\s*\);/g,
    replacement: "await db.update('customers', {\n        nama,\n        nomor_hp,\n        email,\n        status_aktif,\n        updated_at: new Date()\n      }, { id: customerId });" },

  // Fix other .run calls to use db.query
  { pattern: /fastify\.db\.run\(/g, replacement: "await db.query(" },

  // Fix parameterized queries - change ? to $1, $2, etc
  { pattern: /\?\.\?\.\?params/g, replacement: "$1, $2, $3" },

  // Remove .count from direct query results
  { pattern: /fastify\.db\.get\('SELECT COUNT\(\*\) as count FROM ([^']+)'\)\.count/g,
    replacement: "(await db.getOne('SELECT COUNT(*) as count FROM $1')).count" },

  // Fix LIKE queries for PostgreSQL (ILIKE)
  { pattern: /LIKE \?/g, replacement: "ILIKE $1" },

  // Fix boolean comparisons
  { pattern: /status_aktif = 1/g, replacement: "status_aktif = true" },
  { pattern: /status_aktif = 0/g, replacement: "status_aktif = false" },
  { pattern: /status_aktif = 2/g, replacement: "status_aktif = 'suspended'" },
];

// Apply fixes
fixes.forEach(fix => {
  content = content.replace(fix.pattern, fix.replacement);
});

// Manual fixes for complex patterns
content = content.replace(
  /const total = fastify\.db\.get\(`\s*SELECT COUNT\(\*\) as count FROM customers c\s*\$\{whereClause\}\s*`, params\)\.count;/,
  `const totalQuery = await db.query(\`
        SELECT COUNT(*) as count FROM customers c
        \${whereClause}
      \`, params);
      const total = parseInt(totalQuery[0].count);`
);

content = content.replace(
  /const customers = fastify\.db\.query\(`\s*SELECT c\.\*,[\s\S]*?LIMIT \? OFFSET \?\s*`, \[\.\.\.params, limit, offset\]\);/,
  `const customers = await db.query(\`
        SELECT c.*,
               COUNT(DISTINCT s.id) as subscription_count,
               COALESCE(SUM(p.amount), 0) as total_payments
        FROM customers c
        LEFT JOIN subscriptions s ON c.id = s.customer_id
        LEFT JOIN payments p ON c.id = p.customer_id AND p.payment_status = 'paid'
        \${whereClause}
        GROUP BY c.id
        ORDER BY c.created_at DESC
        LIMIT \$\${params.length + 1} OFFSET \$\${params.length + 2}
      \`, [...params, limit, offset]);`
);

// Write the fixed content
fs.writeFileSync('src/routes/customers.js', content, 'utf8');

console.log('Successfully converted customers.js to use PostgreSQL with DatabaseManager');