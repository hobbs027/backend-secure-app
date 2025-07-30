const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const verifyToken = require('../middleware/verifyToken');
const authorizeRole = require('../middleware/authorizeRole');

// 🟢 Signup Route
router.post('/signup', async (req, res, next) => {
  console.log("/signup triggered");
  console.log("Request body:", req.body);

  const { username, email, password, role } = req.body;

  try {
    // Validate input
    if (!username || !email || !password || !role) {
      console.warn("Missing signup fields:", req.body);
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert into DB
    const [result] = await db.execute(
      'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [username, email, hashedPassword, role]
    );

    console.log("DB insert result:", result);

    const userId = result.insertId || null;
    if (!userId) throw new Error("User ID not returned after insert");

    // Generate JWT
    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is not defined in .env");
    }

    const token = jwt.sign(
      { id: userId, role, username },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    return res.status(201).json({ message: 'User registered successfully', token });

  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      console.warn("Duplicate email:", email);
      return res.status(409).json({ message: 'Email already exists' });
    }

    console.error("Signup error:", err);
    next(err); // Forward to global error handler
  }
});

// 🔐 Login Route
router.post('/login', async (req, res, next) => {
  console.log("/login request received");

  const { email, password } = req.body;

  try {
    if (!email || !password) {
      console.warn("Missing login fields");
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Lookup user
    const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
    if (!rows || rows.length === 0) {
      console.warn("User not found:", email);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = rows[0];

    // Validate password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      console.warn("Incorrect password for:", email);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Generate token
    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is not defined in .env");
    }

    const token = jwt.sign(
      { id: user.user_id, role: user.role, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    console.log("Token issued for:", user.username);
    res.json({ token });

  } catch (err) {
    console.error("Login error:", err);
    next(err);
  }
});

// Protected Routes
router.get('/protected', verifyToken, (req, res) => {
  res.json({ message: `Welcome, ${req.user.username}! You accessed a protected route.` });
});

router.get('/admin-only', verifyToken, authorizeRole('admin'), (req, res) => {
  res.json({ message: `Hello ${req.user.username}, you have admin access.` });
});

// Test Route
router.get('/test', (req, res) => {
  res.json({ message: 'API test successful' });
});

module.exports = router;
