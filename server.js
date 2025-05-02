const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

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