const { createClient } = require('@supabase/supabase-js');

// Supabase configuration
const SUPABASE_URL = 'https://doftypeumwgvirppcuim.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRvZnR5cGV1bXdndmlycHBjdWltIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjA3NDEyNywiZXhwIjoyMDYxNjUwMTI3fQ.O-COhFi7G9zSQNwsEkDD_PQkJyJsUJnbFYlKlZzUShc';

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Main function to execute the store matching
async function runStoreMatching() {
  try {
    console.log('Starting store matching process...');
    
    // Step 1: Create matched_stores table if it doesn't exist
    console.log('Setting up matched_stores table...');
    
    // First, check if matched_stores table exists by trying to select from it
    let tableExists = false;
    try {
      const { error } = await supabase
        .from('matched_stores')
        .select('id')
        .limit(1);
      
      // If no error, table exists
      tableExists = !error;
    } catch (err) {
      tableExists = false;
    }
    
    // Create table if it doesn't exist
    if (!tableExists) {
      console.log('Creating matched_stores table...');
      const createTableQuery = `
        CREATE TABLE IF NOT EXISTS matched_stores (
          id SERIAL PRIMARY KEY,
          import_id INT REFERENCES excel_import_routes(id),
          store_id INT REFERENCES stores(store_id),
          match_confidence FLOAT,
          route_name TEXT,
          excel_store_name TEXT,
          master_store_name TEXT,
          dispatch_code TEXT,
          store_code TEXT,
          store_company TEXT,
          address_line TEXT,
          geolocation TEXT,
          eircode TEXT,
          door_code TEXT,
          alarm_code TEXT,
          fridge_code TEXT,
          keys_available TEXT,
          hour_access_24 TEXT,
          earliest_delivery_time TEXT,
          opening_time_saturday TEXT,
          opening_time_sunday TEXT,
          total_quantity INT,
          crates_needed INT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS matched_stores_import_id_idx ON matched_stores(import_id);
        CREATE INDEX IF NOT EXISTS matched_stores_store_id_idx ON matched_stores(store_id);
      `;
      
      const { data: createResult, error: createError } = await supabase.rpc('execute_sql_update', { 
        sql_query: createTableQuery 
      });
      
      if (createError) {
        console.error('Error creating table:', createError);
        return;
      }
      console.log('Table created successfully');
      tableExists = true;
    } else {
      console.log('matched_stores table already exists');
    }
    
    // Step 2: Get excel import data
    console.log('Fetching excel_import_routes data...');
    const { data: excelData, error: excelError } = await supabase
      .from('excel_import_routes')
      .select('*');
    
    if (excelError) {
      console.error('Error fetching excel import data:', excelError);
      return;
    }
    console.log(`Found ${excelData.length} imported stores`);
    
    // Step 3: Get stores data
    console.log('Fetching stores data...');
    const { data: storesData, error: storesError } = await supabase
      .from('stores')
      .select('*');
    
    if (storesError) {
      console.error('Error fetching stores data:', storesError);
      return;
    }
    console.log(`Found ${storesData.length} master stores`);
    
    // Step 4: Truncate matched_stores table to start fresh, if it exists
    if (tableExists) {
      console.log('Clearing previous matches...');
      const { data: truncateResult, error: truncateError } = await supabase.rpc('execute_sql_update', { 
        sql_query: "TRUNCATE TABLE matched_stores RESTART IDENTITY" 
      });
      
      if (truncateError) {
        console.error('Error truncating matched_stores table:', truncateError);
        return;
      }
    }
    
    // Step 5: Perform matching
    console.log('Performing store matching...');
    let matchedCount = 0;
    const matchedStores = [];
    const unmatchedStores = [];
    
    // Make sure to create the pg_trgm extension if it doesn't exist
    const { data: pgTrgmResult, error: pgTrgmError } = await supabase.rpc('execute_sql_update', { 
      sql_query: "CREATE EXTENSION IF NOT EXISTS pg_trgm" 
    });
    
    if (pgTrgmError) {
      console.log('Warning: pg_trgm extension may not be available:', pgTrgmError);
      console.log('Continuing with basic text matching...');
    }
    
    // Process each excel import record
    for (const excelRecord of excelData) {
      let bestMatch = null;
      let bestScore = 0;
      const matchThreshold = 0.3;
      
      // Find potential matches
      for (const storeRecord of storesData) {
        // Calculate match scores using different combinations
        const nameScore = similarity(excelRecord.store_name, storeRecord.store_name);
        const codeNameScore = similarity(
          excelRecord.store_name, 
          `${storeRecord.dispatch_code || ''} ${storeRecord.store_name}`
        );
        const storeCodeNameScore = similarity(
          excelRecord.store_name, 
          `${storeRecord.store_code || ''} ${storeRecord.store_name}`
        );
        const fullScore = similarity(
          excelRecord.store_name, 
          `${storeRecord.dispatch_code || ''} ${storeRecord.store_company || ''} ${storeRecord.store_name}`
        );
        
        // Take the best score from the different combinations
        const matchScore = Math.max(nameScore, codeNameScore, storeCodeNameScore, fullScore);
        
        // Check for keyword matches to boost score
        const keywordMatch = 
          excelRecord.store_name.toLowerCase().includes(storeRecord.store_name.toLowerCase()) ||
          storeRecord.store_name.toLowerCase().includes(excelRecord.store_name.toLowerCase()) ||
          (storeRecord.dispatch_code && 
            excelRecord.store_name.toLowerCase().includes(storeRecord.dispatch_code.toLowerCase())) ||
          (storeRecord.store_code && 
            excelRecord.store_name.toLowerCase().includes(storeRecord.store_code.toLowerCase()));
        
        const finalScore = keywordMatch ? Math.max(matchScore, 0.4) : matchScore;
        
        // Update best match if a better one is found
        if (finalScore > bestScore) {
          bestScore = finalScore;
          bestMatch = storeRecord;
        }
      }
      
      // If a good match is found, add to matched stores
      if (bestMatch && bestScore >= matchThreshold) {
        matchedCount++;
        
        // Create the combined record
        const matchedRecord = {
          import_id: excelRecord.id,
          store_id: bestMatch.store_id,
          match_confidence: bestScore,
          route_name: excelRecord.route_name,
          excel_store_name: excelRecord.store_name,
          master_store_name: bestMatch.store_name,
          dispatch_code: bestMatch.dispatch_code,
          store_code: bestMatch.store_code,
          store_company: bestMatch.store_company,
          address_line: bestMatch.address_line,
          geolocation: bestMatch.geolocation,
          eircode: bestMatch.eircode,
          door_code: bestMatch.door_code,
          alarm_code: bestMatch.alarm_code,
          fridge_code: bestMatch.fridge_code,
          keys_available: bestMatch.keys_available,
          hour_access_24: bestMatch.hour_access_24,
          earliest_delivery_time: bestMatch.earliest_delivery_time,
          opening_time_saturday: bestMatch.opening_time_saturday,
          opening_time_sunday: bestMatch.opening_time_sunday,
          total_quantity: excelRecord.total_quantity,
          crates_needed: excelRecord.crates_needed
        };
        
        // Insert into matched_stores table
        const { data, error } = await supabase
          .from('matched_stores')
          .insert(matchedRecord);
          
        if (error) {
          console.error(`Error inserting matched record for ${excelRecord.store_name}:`, error);
        } else {
          matchedStores.push(matchedRecord);
        }
      } else {
        unmatchedStores.push(excelRecord);
      }
    }
    
    // Step 6: Display results
    console.log(`\nMatching completed: ${matchedCount} out of ${excelData.length} stores matched`);
    
    // Display matched stores
    if (matchedStores.length > 0) {
      console.log('\nMATCHED STORES:');
      console.log('-'.repeat(120));
      console.log('Excel Store Name'.padEnd(40) + '| Master Store Name'.padEnd(40) + '| Confidence'.padEnd(10) + '| Route'.padEnd(20) + '| Dispatch Code');
      console.log('-'.repeat(120));
      
      matchedStores
        .sort((a, b) => a.route_name.localeCompare(b.route_name) || b.match_confidence - a.match_confidence)
        .forEach(store => {
          console.log(
            `${(store.excel_store_name || '').padEnd(40)}| ` +
            `${(store.master_store_name || '').padEnd(40)}| ` +
            `${(store.match_confidence.toFixed(2) || '').padEnd(10)}| ` +
            `${(store.route_name || '').padEnd(20)}| ` +
            `${store.dispatch_code || ''}`
          );
        });
      console.log('-'.repeat(120));
    }
    
    // Display unmatched stores
    if (unmatchedStores.length > 0) {
      console.log('\nUNMATCHED STORES:');
      console.log('-'.repeat(80));
      console.log('Store Name'.padEnd(50) + '| Route'.padEnd(20) + '| Quantity');
      console.log('-'.repeat(80));
      
      unmatchedStores
        .sort((a, b) => a.route_name.localeCompare(b.route_name) || a.store_name.localeCompare(b.store_name))
        .forEach(store => {
          console.log(
            `${(store.store_name || '').padEnd(50)}| ` +
            `${(store.route_name || '').padEnd(20)}| ` +
            `${store.total_quantity || 0}`
          );
        });
      console.log('-'.repeat(80));
    }

  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

// Simple implementation of text similarity for JavaScript
// This is a simplified version - not as accurate as PostgreSQL's similarity function
function similarity(str1, str2) {
  if (!str1 || !str2) return 0;
  
  str1 = str1.toLowerCase();
  str2 = str2.toLowerCase();
  
  // Direct contains check gives high score
  if (str1.includes(str2) || str2.includes(str1)) {
    return 0.8;
  }
  
  // Simple trigram-like implementation
  const getNGrams = (s, n) => {
    const grams = [];
    for (let i = 0; i < s.length - n + 1; i++) {
      grams.push(s.substring(i, i + n));
    }
    return grams;
  };
  
  const trigrams1 = getNGrams(str1, 3);
  const trigrams2 = getNGrams(str2, 3);
  
  let matches = 0;
  for (const gram1 of trigrams1) {
    if (trigrams2.includes(gram1)) {
      matches++;
    }
  }
  
  // Calculate Jaccard similarity
  const similarity = matches / (trigrams1.length + trigrams2.length - matches);
  return similarity || 0;
}

// Run the store matching process
runStoreMatching(); 