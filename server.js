const express = require('express');
const path = require('path');
const app = express();

// Detect which app to serve based on URL
app.use((req, res, next) => {
  const host = req.get('host');
  if (host.includes('admin')) {
    // Serve admin app
    app.use(express.static(path.join(__dirname, 'dist/admin')));
    req.appPath = path.join(__dirname, 'dist/admin/index.html');
  } else {
    // Serve client app by default
    app.use(express.static(path.join(__dirname, 'dist/client')));
    req.appPath = path.join(__dirname, 'dist/client/index.html');
  }
  next();
});

// Handle all routes and return the appropriate app
app.get('*', (req, res) => {
  res.sendFile(req.appPath);
});

// Get port from environment or default to 3000
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Serving Angular applications from dist/client and dist/admin`);
}); 