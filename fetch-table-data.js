const { createClient } = require('@supabase/supabase-js');

// Supabase configuration
const SUPABASE_URL = 'https://doftypeumwgvirppcuim.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRvZnR5cGV1bXdndmlycHBjdWltIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjA3NDEyNywiZXhwIjoyMDYxNjUwMTI3fQ.O-COhFi7G9zSQNwsEkDD_PQkJyJsUJnbFYlKlZzUShc';

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Tables to sample
const tables = [
  'store_orders',
  'routes',
  'stores',
  'drivers',
  'driver_forms',
  'form_templates',
  'store_matches'
];

async function getSampleData() {
  console.log("Fetching sample data from key tables...\n");
  
  for (const table of tables) {
    try {
      console.log(`--- TABLE: ${table} ---`);
      
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .limit(3);
      
      if (error) {
        console.log(`Error fetching data from ${table}: ${error.message}`);
        continue;
      }
      
      if (data && data.length > 0) {
        console.log(`Found ${data.length} records in ${table}:`);
        console.log(JSON.stringify(data, null, 2));
      } else {
        console.log(`No data found in ${table}`);
      }
      
      console.log("\n");
    } catch (err) {
      console.error(`Error accessing ${table}: ${err.message}`);
    }
  }
  
  // Check storage buckets
  try {
    console.log("--- STORAGE BUCKETS ---");
    const { data: buckets, error: bucketsError } = await supabase
      .storage
      .listBuckets();
    
    if (bucketsError) {
      console.log(`Error fetching storage buckets: ${bucketsError.message}`);
    } else if (buckets && buckets.length > 0) {
      console.log(`Found ${buckets.length} storage buckets:`);
      console.log(JSON.stringify(buckets, null, 2));
      
      // Look at files in the first bucket
      if (buckets.length > 0) {
        const firstBucket = buckets[0].name;
        console.log(`\nListing files in bucket: ${firstBucket}`);
        
        const { data: files, error: filesError } = await supabase
          .storage
          .from(firstBucket)
          .list();
        
        if (filesError) {
          console.log(`Error fetching files: ${filesError.message}`);
        } else if (files && files.length > 0) {
          console.log(`Found ${files.length} files:`);
          console.log(JSON.stringify(files, null, 2));
        } else {
          console.log(`No files found in bucket: ${firstBucket}`);
        }
      }
    } else {
      console.log("No storage buckets found");
    }
  } catch (err) {
    console.error(`Error accessing storage: ${err.message}`);
  }
}

// Run the data fetch
getSampleData(); 