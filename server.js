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
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.options('*', cors());

// Request Logger
app.use((req, res, next) => {
  console.log(`Incoming request:`, req.method, req.originalUrl);
  next();
});

//  Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/protected', require('./routes/protected'));

app.use(express.static(path.join(__dirname, 'public')));

app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.all('/api/*', (req, res, next) => {
  const error = new Error(`Can't find ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
});

app.use((err, req, res, next) => {
  console.error('Server error:', err.stack || err);
  res.status(err.statusCode || 500).json({
    message: err.message || 'Internal Server Error',
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use`);
    process.exit(1);
  } else {
    throw err;
  }
});
