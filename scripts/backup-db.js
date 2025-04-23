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

// Create backups directory if it doesn't exist
const backupsDir = path.join(__dirname, '..', 'backups');
if (!fs.existsSync(backupsDir)) {
  fs.mkdirSync(backupsDir, { recursive: true });
}

// Generate backup filename with timestamp
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupFile = path.join(backupsDir, `backup_${timestamp}.sql`);

try {
  // Construct pg_dump command
  const command = `pg_dump -U "${process.env.POSTGRES_USER}" -h "${process.env.POSTGRES_HOST}" -p "${process.env.POSTGRES_PORT}" "${process.env.POSTGRES_DB}" > "${backupFile}"`;
  
  // Execute backup
  console.log('Starting database backup...');
  execSync(command, { stdio: 'inherit' });
  
  console.log(`\nBackup completed successfully!`);
  console.log(`Backup saved to: ${backupFile}`);
} catch (error) {
  console.error('\nError during backup:');
  console.error(error.message);
  process.exit(1);
} 