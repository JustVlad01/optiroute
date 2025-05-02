const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

// Check if client and admin builds exist
const clientBuildPath = path.join(__dirname, 'dist/client');
const adminBuildPath = path.join(__dirname, 'dist/admin');

// Configure middleware based on URL
app.use((req, res, next) => {
  const host = req.get('host') || '';
  
  let staticPath;
  let indexPath;
  
  if (host.includes('admin')) {
    // Serve admin app
    staticPath = adminBuildPath;
    indexPath = path.join(adminBuildPath, 'index.html');
  } else {
    // Serve client app by default
    staticPath = clientBuildPath;
    indexPath = path.join(clientBuildPath, 'index.html');
  }
  
  // Check if the build directory exists before setting paths
  if (fs.existsSync(staticPath)) {
    // Set static file serving for the appropriate app
    app.use(express.static(staticPath));
    req.appPath = indexPath;
  } else {
    console.error(`Build directory not found: ${staticPath}`);
    return res.status(500).send(`
      <h1>Application Error</h1>
      <p>Build files not found. Please check your deployment configuration.</p>
      <p>Missing directory: ${staticPath}</p>
    `);
  }
  
  next();
});

// Handle all routes and return the appropriate app
app.get('*', (req, res) => {
  if (req.appPath && fs.existsSync(req.appPath)) {
    res.sendFile(req.appPath);
  } else {
    res.status(404).send(`
      <h1>File Not Found</h1>
      <p>The requested application build files could not be found.</p>
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
  
  if (fs.existsSync(clientBuildPath)) {
    console.log(`Client build directory contents: ${fs.readdirSync(clientBuildPath).join(', ')}`);
  }
  
  if (fs.existsSync(adminBuildPath)) {
    console.log(`Admin build directory contents: ${fs.readdirSync(adminBuildPath).join(', ')}`);
  }
}); 