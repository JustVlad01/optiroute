// Script to apply migrations to Supabase database
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env file if needed
// require('dotenv').config();

// Supabase connection details (replace with your actual values or use environment variables)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Create Supabase client
const supabase = createClient(supabaseUrl, supabaseKey);

// Function to apply a migration file
async function applyMigration(filePath) {
  try {
    const sql = fs.readFileSync(filePath, 'utf8');
    console.log(`Applying migration: ${path.basename(filePath)}`);
    
    // Execute SQL directly using rpc call to pg_execute
    const { data, error } = await supabase.rpc('pg_execute', { query: sql });
    
    if (error) {
      console.error(`Error applying migration ${path.basename(filePath)}:`, error);
      return false;
    }
    
    console.log(`Successfully applied migration: ${path.basename(filePath)}`);
    return true;
  } catch (err) {
    console.error(`Error reading or executing migration ${path.basename(filePath)}:`, err);
    return false;
  }
}

// Main function to apply migrations
async function applyMigrations() {
  // Path to migrations directory
  const migrationsDir = path.join(__dirname, 'migrations');
  
  // Get all migration files
  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .map(file => path.join(migrationsDir, file));
  
  console.log(`Found ${migrationFiles.length} migration files`);
  
  // Apply migrations sequentially
  for (const file of migrationFiles) {
    const success = await applyMigration(file);
    if (!success) {
      console.error('Migration failed, stopping execution');
      process.exit(1);
    }
  }
  
  console.log('All migrations applied successfully');
}

// Run migrations
applyMigrations().catch(err => {
  console.error('Migration process failed:', err);
  process.exit(1);
}); 