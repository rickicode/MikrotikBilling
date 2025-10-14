#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');

console.log('🔄 Restarting Mikrotik Billing Server...\n');

// Kill any existing node processes on port 3123
const { exec } = require('child_process');

exec('lsof -ti:3123 | xargs kill -9 2>/dev/null', (error) => {
  // Start the server
  console.log('Starting server...\n');

  const server = spawn('node', ['server.js'], {
    stdio: 'inherit',
    shell: true
  });

  server.on('close', (code) => {
    console.log(`Server process exited with code ${code}`);
  });

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down server...');
    server.kill('SIGINT');
  });
});