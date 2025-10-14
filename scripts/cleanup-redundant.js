#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🧹 Cleaning up redundant code and updating to use DatabaseManager...\n');

// 1. Update PaymentPluginManager to use DatabaseManager
console.log('1. Updating PaymentPluginManager...');
const paymentPluginManagerPath = './src/services/PaymentPluginManager.js';
let content = fs.readFileSync(paymentPluginManagerPath, 'utf8');

// Remove SQLiteQuery import
content = content.replace(/const SQLiteQuery = require\(['"]\.\.\/\.\.\/lib\/SQLiteQuery['"];/, '');

// Update constructor to use DatabaseManager
content = content.replace(
  /constructor\(databaseInstance\) \{[\s\S]*?this\.query = new SQLiteQuery\(databaseInstance\);[\s\S]*?\}/,
  `constructor(databaseInstance) {
    this.db = databaseInstance;
    this.plugins = new Map();
    this.pluginConfigurations = new Map();
    this.transactionHandlers = new Map();
    this.activePlugins = new Set();
    this.logger = console;
  }`
);

// Replace query.getMany calls
content = content.replace(/this\.query\.getMany\(/g, 'this.db.getMany(');

// Replace query.getOne calls
content = content.replace(/this\.query\.getOne\(/g, 'this.db.getOne(');

// Replace query.insert calls
content = content.replace(/this\.query\.insert\(/g, 'this.db.insert(');

// Replace query.update calls
content = content.replace(/this\.query\.update\(/g, 'this.db.update(');

// Replace query.delete calls
content = content.replace(/this\.query\.delete\(/g, 'this.db.delete(');

fs.writeFileSync(paymentPluginManagerPath, content);
console.log('✅ PaymentPluginManager updated');

// 2. Remove SQLiteQuery files
console.log('\n2. Removing SQLiteQuery files...');
try {
  if (fs.existsSync('./lib/SQLiteQuery.js')) {
    fs.unlinkSync('./lib/SQLiteQuery.js');
    console.log('✅ Deleted ./lib/SQLiteQuery.js');
  }
  if (fs.existsSync('./src/lib/SQLiteQuery.js')) {
    fs.unlinkSync('./src/lib/SQLiteQuery.js');
    console.log('✅ Deleted ./src/lib/SQLiteQuery.js');
  }
} catch (error) {
  console.log('⚠️ Could not delete SQLiteQuery files:', error.message);
}

// 3. Remove other old database files
console.log('\n3. Removing old database files...');
const oldFiles = [
  './src/database/Database_old.js',
  './src/database/DatabaseSQLite.js',
  './src/database/Database.js'
];

for (const file of oldFiles) {
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
    console.log(`✅ Deleted ${file}`);
  }
}

// 4. Update any remaining old database references
console.log('\n4. Updating remaining old database references...');
const filesToUpdate = [
  './src/services/MikrotikClient.js',
  './src/routes/api.js'
];

for (const file of filesToUpdate) {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');

    // Remove old database requires
    content = content.replace(/require\(['"]\.\.\/database\/Database_old['"];?\s*\n?/g, '');
    content = content.replace(/require\(['"]\.\.\/database\/Database['"];?\s*\n?/g, '');
    content = content.replace(/require\(['"]\.\.\/database\/DatabaseSQLite['"];?\s*\n?/g, '');

    fs.writeFileSync(file, content);
    console.log(`✅ Updated ${path.basename(file)}`);
  }
}

// 5. Check and fix auth middleware session issue
console.log('\n5. Checking authentication middleware...');
const authPath = './src/middleware/auth.js';
content = fs.readFileSync(authPath, 'utf8');

// Ensure session is being properly handled
if (content.includes('sessionId') && !content.includes('sessionId: {')) {
  console.log('⚠️ Found potential session issue in auth.js');
}

console.log('\n✅ Cleanup completed!');
console.log('\nNext steps:');
console.log('1. Restart the server');
console.log('2. Test login with admin/admin123');
console.log('3. Test settings API');