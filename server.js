const express = require('express');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg'); // Add PostgreSQL
const app = express();

// JSON body parser middleware
app.use(express.json({ limit: '10mb' })); // Limit file size to 10MB

// Add security and cache-control headers
app.use((req, res, next) => {
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // For HTML files and API endpoints, prevent caching
  if (req.url.endsWith('.html') || req.url.startsWith('/api/') || req.url === '/' || req.url.includes('index.html')) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store'); // For CDNs
    res.setHeader('CDN-Cache-Control', 'no-store'); // For Cloudflare and other CDNs
  }
  
  next();
});

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

// API endpoint to get all orders
app.get('/api/orders', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM get_all_orders()`);
    res.json(result.rows);
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Database error', details: error.message });
  }
});

// API endpoint to get a specific order's details
app.get('/api/orders/:id', async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    if (isNaN(orderId)) {
      return res.status(400).json({ error: 'Invalid order ID' });
    }
    
    const result = await pool.query(`SELECT * FROM get_order_details($1)`, [orderId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Format the response to be more hierarchical
    const order = {
      id: result.rows[0].import_id,
      fileName: result.rows[0].file_name,
      importDate: result.rows[0].import_date,
      deliveryDate: result.rows[0].order_delivery_date,
      status: result.rows[0].order_status,
      routes: []
    };
    
    // Group by routes
    const routeMap = new Map();
    result.rows.forEach(row => {
      if (!routeMap.has(row.route_id)) {
        routeMap.set(row.route_id, {
          id: row.route_id,
          name: row.route_name,
          routeNumber: row.route_number,
          driverName: row.driver_name,
          deliveryDate: row.route_delivery_date,
          status: row.route_status,
          stores: []
        });
      }
      
      routeMap.get(row.route_id).stores.push({
        id: row.store_id,
        customerName: row.customer_name,
        customerCode: row.customer_code,
        totalItems: row.total_items,
        status: row.store_status
      });
    });
    
    // Convert Map to array for response
    order.routes = Array.from(routeMap.values());
    
    res.json(order);
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Database error', details: error.message });
  }
});

// API endpoint to update order status
app.patch('/api/orders/:id/status', async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const { status } = req.body;
    
    if (isNaN(orderId)) {
      return res.status(400).json({ error: 'Invalid order ID' });
    }
    
    if (!status || !['pending', 'processing', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Update order status
      const result = await client.query(
        'UPDATE order_imports SET status = $1 WHERE id = $2 RETURNING id',
        [status, orderId]
      );
      
      if (result.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Order not found' });
      }
      
      // Optionally update the status of all associated routes and store orders
      if (status === 'completed' || status === 'cancelled') {
        await client.query(
          'UPDATE routes SET status = $1 WHERE import_id = $2',
          [status, orderId]
        );
        
        await client.query(
          'UPDATE store_orders SET order_status = $1 WHERE route_id IN (SELECT id FROM routes WHERE import_id = $2)',
          [status, orderId]
        );
      }
      
      await client.query('COMMIT');
      
      res.json({ 
        success: true, 
        message: `Order status updated to ${status}`,
        orderId: orderId
      });
    } catch (error) {
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

// Set up static file serving
if (fs.existsSync(adminBrowserPath)) {
  console.log(`Setting up admin static files from: ${adminBrowserPath}`);
  // Set cache headers for static files
  app.use('/admin', express.static(adminBrowserPath, {
    maxAge: '1y', // Cache static assets for 1 year
    etag: true,
    lastModified: true,
    setHeaders: (res, path) => {
      // Don't cache index.html and service worker files
      if (path.endsWith('index.html') || path.endsWith('service-worker.js') || path.endsWith('ngsw.json') || path.endsWith('ngsw-worker.js') || path.endsWith('safety-worker.js')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      } else if (path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
        // Cache static assets with hash for 1 year
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }
  }));
} else if (fs.existsSync(adminBuildPath)) {
  console.log(`Setting up admin static files from: ${adminBuildPath}`);
  app.use('/admin', express.static(adminBuildPath, {
    maxAge: '1y',
    etag: true,
    lastModified: true,
    setHeaders: (res, path) => {
      if (path.endsWith('index.html') || path.endsWith('service-worker.js') || path.endsWith('ngsw.json') || path.endsWith('ngsw-worker.js') || path.endsWith('safety-worker.js')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      } else if (path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }
  }));
} else {
  console.error('Admin build directory not found');
}

if (fs.existsSync(clientBrowserPath)) {
  console.log(`Setting up client static files from: ${clientBrowserPath}`);
  app.use(express.static(clientBrowserPath, {
    maxAge: '1y',
    etag: true,
    lastModified: true,
    setHeaders: (res, path) => {
      if (path.endsWith('index.html') || path.endsWith('service-worker.js') || path.endsWith('ngsw.json') || path.endsWith('ngsw-worker.js') || path.endsWith('safety-worker.js')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      } else if (path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }
  }));
} else if (fs.existsSync(clientBuildPath)) {
  console.log(`Setting up client static files from: ${clientBuildPath}`);
  app.use(express.static(clientBuildPath, {
    maxAge: '1y',
    etag: true,
    lastModified: true,
    setHeaders: (res, path) => {
      if (path.endsWith('index.html') || path.endsWith('service-worker.js') || path.endsWith('ngsw.json') || path.endsWith('ngsw-worker.js') || path.endsWith('safety-worker.js')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      } else if (path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }
  }));
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

// Add version endpoint for cache busting
app.get('/api/version', (req, res) => {
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  
  // Try to read version from generated file
  let versionInfo = {
    version: Date.now(),
    deployTime: new Date().toISOString(),
    buildHash: process.env.RENDER_GIT_COMMIT || 'local-dev'
  };
  
  try {
    const versionPath = path.join(__dirname, 'dist', 'version.json');
    if (fs.existsSync(versionPath)) {
      const versionData = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
      versionInfo = {
        version: versionData.buildTime || Date.now(),
        deployTime: versionData.deployTime,
        buildHash: versionData.gitHash || process.env.RENDER_GIT_COMMIT || 'local-dev'
      };
    }
  } catch (error) {
    console.warn('Could not read version file:', error.message);
  }
  
  res.json(versionInfo);
});

// Add force update endpoint
app.post('/api/force-update', (req, res) => {
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  
  // Send a message to trigger service worker update
  res.json({
    message: 'Force update requested',
    timestamp: Date.now(),
    action: 'reload'
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
        
        // Add cache-busting meta tags and build timestamp
        const timestamp = Date.now();
        const cacheMetaTags = `
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
  <meta http-equiv="Pragma" content="no-cache">
  <meta http-equiv="Expires" content="0">
  <meta name="build-timestamp" content="${timestamp}">`;
        
        // Insert cache meta tags after the existing meta tags
        html = html.replace('</head>', `${cacheMetaTags}\n</head>`);
        
        // Set headers to prevent caching of index.html
        res.set({
          'Content-Type': 'text/html',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
          'Last-Modified': new Date().toUTCString(),
          'ETag': `"${timestamp}"`
        });
        
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