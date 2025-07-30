require('dotenv').config();

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

// Security & Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(helmet());

app.use(cors({
  origin: 'https://doc-secure-frontend.vercel.app',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  credentials: true,
}));

app.options('*', cors());

// Request Logger
app.use((req, res, next) => {
  console.log(` ${req.method} ${req.originalUrl}`);
  next();
});

//  Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/protected', require('./routes/protected'));

// Static frontend assets (if used locally or packaged)
app.use(express.static(path.join(__dirname, 'public')));

// SPA Fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Catch undefined API routes
app.all('/api/*', (req, res, next) => {
  const error = new Error(`Can't find ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Server error:', err.stack || err);
  res.status(err.statusCode || 500).json({
    message: err.message || 'Internal Server Error',
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on port 3001`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port 3001 is already in use`);
    process.exit(1);
  } else {
    throw err;
  }
});
