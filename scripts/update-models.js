#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔄 Updating models to use BaseModel...\n');

const modelFiles = [
  './src/models/PaymentLink.js',
  './src/models/PaymentTransaction.js',
  './src/models/WhatsAppTemplate.js',
  './src/models/WhatsAppSession.js',
  './src/models/WhatsAppMessage.js',
  './src/models/NotificationQueue.js',
  './src/models/DuitKuConfiguration.js',
  './src/models/UserRole.js',
  './src/models/NavigationMenu.js',
  './src/models/PageSpec.js'
];

for (const modelFile of modelFiles) {
  if (fs.existsSync(modelFile)) {
    console.log(`  - ${path.basename(modelFile)}`);
    let content = fs.readFileSync(modelFile, 'utf8');

    // Skip BaseModel.js itself
    if (modelFile.includes('BaseModel.js')) continue;

    // Remove old database imports
    content = content
      .replace(/require\(['"]\.\.\/database\/DatabasePostgreSQL['"];?/g, '')
      .replace(/const Database = require\(['"]\.\.\/database\/DatabasePostgreSQL['"];?/g, '')
      .replace(/const db = new Database\(\);/g, '')
      .replace(/this\.db = db;/g, '');

    // Check if it already extends BaseModel
    if (!content.includes('extends BaseModel')) {
      // Find the class declaration and replace extends
      content = content.replace(/extends DatabasePostgreSQL/g, 'extends BaseModel');

      // If no extends found, add it
      if (!content.includes('extends BaseModel')) {
        content = content.replace(/class\s+\w+\s*{/, (match) => {
          const className = match.match(/class\s+(\w+)/)[1];
          return `class ${className} extends BaseModel {`;
        });
      }
    }

    // Add BaseModel import at the top
    if (!content.includes('require([\'"]./BaseModel[\'\"]')) {
      content = content.replace(
        /const\s+\w+\s*=\s*require\(['"]\.\.\/database\/DatabaseManager['"];/,
        "const BaseModel = require('./BaseModel');\nconst { db } = require('../database/DatabaseManager');"
      );
    }

    // Replace direct database calls with BaseModel methods
    content = content
      .replace(/this\.db\./g, 'this.db.')
      .replace(/db\.getOne\(/g, 'this.db.getOne(')
      .replace(/db\.getMany\(/g, 'this.db.getMany(')
      .replace(/db\.insert\(/g, 'this.db.insert(')
      .replace(/db\.update\(/g, 'this.db.update(')
      .replace(/db\.delete\(/g, 'this.db.delete(')
      .replace(/db\.exists\(/g, 'this.db.exists(')
      .replace(/db\.count\(/g, 'this.db.count(')
      .replace(/db\.query\(/g, 'this.db.query(')
      .replace(/db\.raw\(/g, 'this.db.raw(');

    fs.writeFileSync(modelFile, content);
  }
}

console.log('\n✅ Models updated successfully!');