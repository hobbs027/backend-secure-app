const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const verifyToken = require('../middleware/verifyToken');
const authorizeRole = require('../middleware/authorizeRole');

// Signup route
router.post('/signup', async (req, res) => {
  console.log("Signup route triggered");
  console.log("Request body:", req.body);

  const { username, email, password, role } = req.body;

  try {
    // Validate required fields
    if (!username || !email || !password || !role) {
      console.log("Missing signup fields:", req.body);
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert new user
    const [result] = await db.execute(
      'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [username, email, hashedPassword, role]
    );

    console.log("User inserted with ID:", result.insertId);

    // Issue JWT token
    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is not defined in environment");
    }

    const token = jwt.sign(
      { id: result.insertId, role, username },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.status(201).json({ message: 'User registered successfully', token });

  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      console.warn("Duplicate email:", email);
      return res.status(409).json({ message: 'Email already exists' });
    }

    console.error("Signup error:", err.name || err.code, err.message || err);
    res.status(500).json({ message: err.message || 'Signup failed' });
  }
});

// Login route
router.post('/login', async (req, res) => {
  console.log("Login request received");
  console.log("Request body:", req.body);

  const { email, password } = req.body;

  try {
    if (!email || !password) {
      console.log("Missing login fields");
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Find user by email
    const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);

    if (rows.length === 0) {
      console.log("User not found:", email);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = rows[0];

    // Check password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      console.log("Invalid password for:", email);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // 🎟 Issue JWT
    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is not defined in environment");
    }

    const token = jwt.sign(
      { id: user.user_id, role: user.role, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    console.log("Token issued for:", user.username);
    res.json({ token });

  } catch (err) {
    console.error("Login error:", err.message || err);
    res.status(500).json({ message: err.message || 'Login failed due to server error' });
  }
});

// Protected routes
router.get('/protected', verifyToken, (req, res) => {
  res.json({ message: `Welcome, ${req.user.username}! You accessed a protected route.` });
});

router.get('/admin-only', verifyToken, authorizeRole('admin'), (req, res) => {
  res.json({ message: `Hello ${req.user.username}, you have admin access.` });
});

// Test route
router.get('/test', (req, res) => {
  res.json({ message: 'URL reached successfully!' });
});

module.exports = router;

