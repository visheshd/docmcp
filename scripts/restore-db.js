#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Ensure required env vars are present
const requiredEnvVars = {
  POSTGRES_USER: process.env.POSTGRES_USER,
  POSTGRES_HOST: process.env.POSTGRES_HOST,
  POSTGRES_PORT: process.env.POSTGRES_PORT,
  POSTGRES_DB: process.env.POSTGRES_DB
};

// Check for missing environment variables
const missingVars = Object.entries(requiredEnvVars)
  .filter(([_, value]) => !value)
  .map(([key]) => key);

if (missingVars.length > 0) {
  console.error('Error: Missing required environment variables:');
  console.error(missingVars.join(', '));
  console.error('\nPlease check your .env file');
  process.exit(1);
}

// Get backup file from command line argument
const backupFile = process.argv[2];

if (!backupFile) {
  console.error('Error: No backup file specified');
  console.error('Usage: npm run db:restore <backup-file>');
  console.error('Example: npm run db:restore ./backups/backup_2024-03-27.sql');
  process.exit(1);
}

// Check if backup file exists
if (!fs.existsSync(backupFile)) {
  console.error(`Error: Backup file not found: ${backupFile}`);
  process.exit(1);
}

try {
  // Construct psql command
  const command = `psql -U "${process.env.POSTGRES_USER}" -h "${process.env.POSTGRES_HOST}" -p "${process.env.POSTGRES_PORT}" "${process.env.POSTGRES_DB}" < "${backupFile}"`;
  
  // Confirm restore
  console.log(`\nWarning: This will overwrite the current database (${process.env.POSTGRES_DB})`);
  console.log(`Are you sure you want to restore from ${backupFile}?`);
  console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...');
  
  // Wait 5 seconds before proceeding
  setTimeout(() => {
    console.log('\nStarting database restore...');
    execSync(command, { stdio: 'inherit' });
    
    console.log(`\nRestore completed successfully!`);
  }, 5000);
} catch (error) {
  console.error('\nError during restore:');
  console.error(error.message);
  process.exit(1);
} 