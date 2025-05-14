const { createClient } = require('@supabase/supabase-js');

// Supabase configuration
const SUPABASE_URL = 'https://doftypeumwgvirppcuim.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRvZnR5cGV1bXdndmlycHBjdWltIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjA3NDEyNywiZXhwIjoyMDYxNjUwMTI3fQ.O-COhFi7G9zSQNwsEkDD_PQkJyJsUJnbFYlKlZzUShc';

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Function to execute SQL
async function executeSQL(sql) {
  try {
    const { data, error } = await supabase.rpc('exec', { query: sql });
    if (error) {
      return { error };
    }
    return { data };
  } catch (err) {
    return { error: err };
  }
}

// Get all tables from public schema
async function listTables() {
  try {
    const { data, error } = await supabase
      .from('_tables')
      .select('*')
      .order('name');
    
    if (error) {
      console.error('Error fetching tables:', error);
      
      // Alternative approach with raw SQL
      console.log("Trying with direct SQL query...");
      const { data, error } = await supabase.rpc('exec', { 
        query: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;` 
      });
      
      if (error) {
        console.error('SQL execution error:', error);
        return [];
      }
      
      return data || [];
    }
    
    return data || [];
  } catch (err) {
    console.error('Unexpected error listing tables:', err);
    return [];
  }
}

// Get all tables using REST API
async function listAllTables() {
  try {
    // First try using REST API to get list of tables
    const result = await fetch(`${SUPABASE_URL}/rest/v1/?apikey=${SUPABASE_KEY}`);
    const data = await result.json();
    console.log('Tables available via REST API:');
    console.log(data);
    return data;
  } catch (err) {
    console.error('Error listing tables via REST API:', err);
    return [];
  }
}

// List all RLS policies
async function listRLSPolicies() {
  try {
    const { data, error } = await supabase.rpc('exec', { 
      query: `SELECT tablename, policyname, permissive, roles, cmd, qual, with_check 
              FROM pg_policies 
              WHERE schemaname = 'public' 
              ORDER BY tablename, policyname;` 
    });
    
    if (error) {
      console.error('Error fetching RLS policies:', error);
      return [];
    }
    
    return data || [];
  } catch (err) {
    console.error('Unexpected error listing RLS policies:', err);
    return [];
  }
}

// Get available Postgres functions
async function listFunctions() {
  try {
    const { data, error } = await supabase.rpc('exec', { 
      query: `SELECT routine_name 
              FROM information_schema.routines 
              WHERE routine_schema = 'public' 
              ORDER BY routine_name;` 
    });
    
    if (error) {
      console.error('Error fetching functions:', error);
      return [];
    }
    
    return data || [];
  } catch (err) {
    console.error('Unexpected error listing functions:', err);
    return [];
  }
}

// Execute functions
async function main() {
  try {
    console.log('Attempting to connect to Supabase and fetch database information...');
    
    // Try to get table list using various methods
    const tables = await listTables();
    if (tables.length > 0) {
      console.log('\nAvailable tables:');
      for (const table of tables) {
        console.log(`- ${table.name || table.table_name}`);
        
        try {
          // For each table, try to get some sample data
          const { data, error } = await supabase
            .from(table.name || table.table_name)
            .select('*')
            .limit(3);
          
          if (!error && data && data.length > 0) {
            console.log(`  Sample data:`);
            console.log(JSON.stringify(data, null, 2));
          } else if (error) {
            console.log(`  Error fetching sample data: ${error.message}`);
          } else {
            console.log(`  No data found in table.`);
          }
        } catch (e) {
          console.log(`  Error accessing table: ${e.message}`);
        }
      }
    } else {
      console.log('Could not retrieve tables using standard methods, trying alternative...');
      await listAllTables();
    }
    
    // Try to get RLS policies
    const policies = await listRLSPolicies();
    if (policies.length > 0) {
      console.log('\nRow Level Security Policies:');
      console.log(JSON.stringify(policies, null, 2));
    }
    
    // Try to get functions
    const functions = await listFunctions();
    if (functions.length > 0) {
      console.log('\nAvailable PostgreSQL Functions:');
      console.log(JSON.stringify(functions, null, 2));
    }
    
    // Try to get information about authentication
    console.log('\nAttempting to get authentication settings...');
    const { data: authSettings, error: authError } = await supabase.auth.admin.listUsers();
    if (authError) {
      console.log('Error retrieving auth settings:', authError);
    } else {
      console.log('Auth settings:', JSON.stringify(authSettings, null, 2));
    }
  } catch (err) {
    console.error('Error in main function:', err);
  }
}

main(); 