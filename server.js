const express = require('express');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg'); // Add PostgreSQL
const app = express();

// JSON body parser middleware
app.use(express.json({ limit: '10mb' })); // Limit file size to 10MB

// Setup PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/optiroute',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Check if client and admin builds exist
const clientBuildPath = path.join(__dirname, 'dist/client');
const adminBuildPath = path.join(__dirname, 'dist/admin');

// In Angular 19+, the build output is in a 'browser' subfolder
const clientBrowserPath = path.join(clientBuildPath, 'browser');
const adminBrowserPath = path.join(adminBuildPath, 'browser');

// Add detailed request logging
app.use((req, res, next) => {
  console.log(`Request: ${req.method} ${req.url}`);
  console.log(`Host header: ${req.get('host')}`);
  next();
});

// Determine which app to serve
app.use((req, res, next) => {
  const host = req.get('host') || '';
  const url = req.url;
  
  console.log(`Processing request with host: ${host}, URL: ${url}`);
  
  // Set isAdmin flag based on URL or host
  req.isAdmin = host.includes('admin') || url.startsWith('/admin');
  
  if (req.isAdmin) {
    console.log('Request identified as admin app');
  } else {
    console.log('Request identified as client app');
  }
  
  next();
});

// API endpoints
app.post('/api/import-orders', async (req, res) => {
  try {
    const { fileName, routes } = req.body;
    
    if (!fileName || !routes || !Array.isArray(routes) || routes.length === 0) {
      return res.status(400).json({ error: 'Invalid import data format' });
    }
    
    // Extract delivery date from the route if available
    let mainDeliveryDate = null;
    for (const route of routes) {
      const dateMatch = route.routeName.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (dateMatch) {
        const [_, day, month, year] = dateMatch;
        mainDeliveryDate = `${year}-${month}-${day}`;
        break;  // Use the first date found
      }
    }
    
    // Begin database transaction to ensure data integrity
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // 1. Insert the main import record with delivery date
      const importResult = await client.query(
        'INSERT INTO order_imports(file_name, delivery_date, order_data) VALUES($1, $2, $3) RETURNING id',
        [fileName, mainDeliveryDate, JSON.stringify(req.body)]
      );
      
      const importId = importResult.rows[0].id;
      
      // 2. Process each route and its orders
      for (const route of routes) {
        // Extract route information
        const dateMatch = route.routeName.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        let deliveryDate = null;
        
        if (dateMatch) {
          // If date format is DD/MM/YYYY
          const [_, day, month, year] = dateMatch;
          deliveryDate = `${year}-${month}-${day}`;
        }
        
        // Extract route number if available (e.g., "Route Cork 1" -> "C001")
        let routeNumber = null;
        const routeMatch = route.routeName.match(/Route\s+(\w+)\s+(\d+)/i);
        if (routeMatch) {
          const routeArea = routeMatch[1];
          const routeNum = routeMatch[2];
          routeNumber = `${routeArea.charAt(0).toUpperCase()}${routeNum.padStart(3, '0')}`;
        }
        
        // Calculate total items for this route
        let totalItems = 0;
        if (route.stores && Array.isArray(route.stores)) {
          totalItems = route.stores.reduce((sum, store) => sum + store.totalItems, 0);
        }
        
        // Calculate crate information
        const itemsPerCrate = 25;
        const crateCount = Math.ceil(totalItems / itemsPerCrate);
        const fullCrates = Math.floor(totalItems / itemsPerCrate);
        const remainingItems = totalItems % itemsPerCrate;
        
        // Insert route record with more details including crate info
        const routeResult = await client.query(
          `INSERT INTO routes(
            import_id, route_name, route_number, delivery_date, 
            total_items, crate_count, full_crates, remaining_items
          ) VALUES($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [
            importId, route.routeName, routeNumber, deliveryDate,
            totalItems, crateCount, fullCrates, remainingItems
          ]
        );
        
        const routeId = routeResult.rows[0].id;
        
        // Insert store orders for this route with more details
        if (route.stores && Array.isArray(route.stores)) {
          for (const store of route.stores) {
            // Extract customer code if available (e.g., "1001C Circle K - Gallowshill (30893)" -> "30893")
            let customerCode = null;
            const codeMatch = store.customerName.match(/\((\d+)\)/);
            if (codeMatch) {
              customerCode = codeMatch[1];
            }
            
            // Sometimes the customer code might be in the format "1001C Circle K" where 1001C is the code
            if (!customerCode && store.customerName) {
              const prefixMatch = store.customerName.match(/^(\d+[A-Za-z]?)/);
              if (prefixMatch) {
                customerCode = prefixMatch[1];
              }
            }
            
            await client.query(
              'INSERT INTO store_orders(route_id, customer_name, customer_code, total_items) VALUES($1, $2, $3, $4)',
              [routeId, store.customerName, customerCode, store.totalItems]
            );
          }
        }
      }
      
      // Commit the transaction
      await client.query('COMMIT');
      
      res.status(201).json({ 
        success: true, 
        message: 'Order import successful',
        importId: importId
      });
      
    } catch (error) {
      // Rollback in case of error
      await client.query('ROLLBACK');
      console.error('Database error:', error);
      res.status(500).json({ error: 'Database error', details: error.message });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Get all imports with summary info
app.get('/api/imports', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        i.id, 
        i.file_name, 
        i.imported_at,
        COUNT(DISTINCT r.id) AS route_count,
        COUNT(s.id) AS total_orders
      FROM 
        order_imports i
      LEFT JOIN 
        routes r ON i.id = r.import_id
      LEFT JOIN 
        store_orders s ON r.id = s.route_id
      GROUP BY 
        i.id
      ORDER BY 
        i.imported_at DESC
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Database error', details: error.message });
  }
});

// API endpoint to get all forms
app.get('/api/forms', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, form_name, description, created_at, updated_at, status
      FROM forms
      ORDER BY updated_at DESC
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Database error', details: error.message });
  }
});

// API endpoint to get route details with crate information
app.get('/api/routes/:id', async (req, res) => {
  try {
    const routeId = parseInt(req.params.id);
    if (isNaN(routeId)) {
      return res.status(400).json({ error: 'Invalid route ID' });
    }
    
    const result = await pool.query(`
      SELECT 
        r.id, 
        r.route_name, 
        r.route_number, 
        r.delivery_date, 
        r.driver_name,
        r.total_items,
        r.crate_count,
        r.full_crates,
        r.remaining_items,
        CASE WHEN r.remaining_items > 0 THEN true ELSE false END as has_partial_crate,
        COUNT(so.id) as store_count,
        json_agg(json_build_object(
          'id', so.id,
          'customer_name', so.customer_name,
          'customer_code', so.customer_code,
          'total_items', so.total_items,
          'status', so.order_status
        )) as stores
      FROM 
        routes r
      LEFT JOIN 
        store_orders so ON r.id = so.route_id
      WHERE 
        r.id = $1
      GROUP BY 
        r.id, r.route_name, r.route_number, r.delivery_date, r.driver_name,
        r.total_items, r.crate_count, r.full_crates, r.remaining_items
    `, [routeId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Route not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Database error', details: error.message });
  }
});

// API endpoint to get all routes summary with crate information
app.get('/api/routes', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM route_summary
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Database error', details: error.message });
  }
});

// API endpoint for optimizing routes with many stops
app.post('/api/optimize-route', async (req, res) => {
  try {
    const { locations, startingPoint, options } = req.body;
    
    if (!locations || !Array.isArray(locations) || locations.length === 0) {
      return res.status(400).json({ error: 'Invalid locations data' });
    }
    
    // In a production environment, you would implement:
    // 1. Call to Distance Matrix API to get travel times/distances between all points
    // 2. Run a TSP solver algorithm on the matrix
    // 3. Split the optimized route into chunks of 23 waypoints
    // 4. Call Directions API for each chunk
    // 5. Combine the results
    
    // This is a placeholder response - in a real implementation
    // you would make the actual API calls and optimization
    res.json({
      success: true,
      message: 'Route optimization processed',
      optimizedRoute: locations, 
      chunkCount: Math.ceil(locations.length / 23),
      totalStops: locations.length
    });
  } catch (error) {
    console.error('Route optimization error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Set up static file serving
if (fs.existsSync(adminBrowserPath)) {
  console.log(`Setting up admin static files from: ${adminBrowserPath}`);
  app.use('/admin', express.static(adminBrowserPath));
} else if (fs.existsSync(adminBuildPath)) {
  console.log(`Setting up admin static files from: ${adminBuildPath}`);
  app.use('/admin', express.static(adminBuildPath));
} else {
  console.error('Admin build directory not found');
}

if (fs.existsSync(clientBrowserPath)) {
  console.log(`Setting up client static files from: ${clientBrowserPath}`);
  app.use(express.static(clientBrowserPath));
} else if (fs.existsSync(clientBuildPath)) {
  console.log(`Setting up client static files from: ${clientBuildPath}`);
  app.use(express.static(clientBuildPath));
} else {
  console.error('Client build directory not found');
}

// Add a test endpoint
app.get('/test', (req, res) => {
  res.send({
    message: 'Server is running',
    time: new Date().toISOString(),
    directories: {
      clientBuildExists: fs.existsSync(clientBuildPath),
      adminBuildExists: fs.existsSync(adminBuildPath),
      clientBrowserExists: fs.existsSync(clientBrowserPath),
      adminBrowserExists: fs.existsSync(adminBrowserPath)
    }
  });
});

// Modify the index.html's base href for Render.com environment
app.use((req, res, next) => {
  res.sendIndexWithBaseHref = (indexPath, baseHref = '/') => {
    if (fs.existsSync(indexPath)) {
      try {
        let html = fs.readFileSync(indexPath, 'utf8');
        // Replace base href with the correct value
        html = html.replace(/<base href=".*">/, `<base href="${baseHref}">`);
        res.set('Content-Type', 'text/html');
        res.send(html);
      } catch (error) {
        console.error(`Error reading/modifying index.html: ${error}`);
        res.sendFile(indexPath);
      }
    } else {
      res.status(404).send(`
        <h1>Application Error</h1>
        <p>Index file not found: ${indexPath}</p>
      `);
    }
  };
  next();
});

// Handle all routes and return the appropriate app's index.html
app.get('*', (req, res) => {
  let indexPath;
  let baseHref = '/';
  
  if (req.isAdmin) {
    baseHref = '/admin/';
    if (fs.existsSync(adminBrowserPath)) {
      indexPath = path.join(adminBrowserPath, 'index.html');
    } else if (fs.existsSync(adminBuildPath)) {
      indexPath = path.join(adminBuildPath, 'index.html');
    }
  } else {
    if (fs.existsSync(clientBrowserPath)) {
      indexPath = path.join(clientBrowserPath, 'index.html');
    } else if (fs.existsSync(clientBuildPath)) {
      indexPath = path.join(clientBuildPath, 'index.html');
    }
  }
  
  if (indexPath && fs.existsSync(indexPath)) {
    console.log(`Sending file: ${indexPath} with baseHref: ${baseHref}`);
    res.sendIndexWithBaseHref(indexPath, baseHref);
  } else {
    console.error(`Index file not found for ${req.isAdmin ? 'admin' : 'client'} app`);
    res.status(404).send(`
      <h1>Application Error</h1>
      <p>Application files not found. Please check your deployment configuration.</p>
    `);
  }
});

// Get port from environment or default to 3000
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  
  // Log status of build directories
  console.log(`Client build directory exists: ${fs.existsSync(clientBuildPath)}`);
  console.log(`Admin build directory exists: ${fs.existsSync(adminBuildPath)}`);
  
  console.log(`Client browser directory exists: ${fs.existsSync(clientBrowserPath)}`);
  console.log(`Admin browser directory exists: ${fs.existsSync(adminBrowserPath)}`);
  
  if (fs.existsSync(clientBrowserPath)) {
    console.log(`Client browser directory contents: ${fs.readdirSync(clientBrowserPath).join(', ')}`);
  }
  
  if (fs.existsSync(adminBrowserPath)) {
    console.log(`Admin browser directory contents: ${fs.readdirSync(adminBrowserPath).join(', ')}`);
  }
}); 