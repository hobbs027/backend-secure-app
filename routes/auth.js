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
  console.log("Request headers:", req.headers);
  console.log("Request body:", req.body);

  const { username, email, password, role } = req.body;
  console.log("Incoming signup data:", { username, email, role });

  try {
    if (!username || !email || !password || !role) {
      console.log("Missing fields:", req.body);
      return res.status(400).json({ message: 'All fields are required' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    console.log("Hashed password:", hashedPassword);

    console.log("Attempting to insert user:", { username, email, role });
    const [result] = await db.execute(
      'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [username, email, hashedPassword, role]
    );
    console.log("Insert result:", result);

    console.log("User inserted with ID:", result.insertId);
    res.json({ message: 'User registered successfully' });

  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Email already exists' });
    }
    console.error("Signup error:", err.code || err.name, err.message || err);
    res.status(500).json({ message: 'Signup failed' });
  }
});

// Login route
router.post('/login', async (req, res) => {
  console.log("Login request received");
  console.log("Request body:", req.body);
   if (!req.body) {
    console.log(" req.body is undefined");
    return res.status(400).json({ message: 'Missing request body' });
  }
  if (!req.body || !req.body.email || !req.body.password) {
  console.log("Missing login fields:", req.body);
  return res.status(400).json({ message: 'Email and password are required' });
 }

  const { email, password } = req.body;
  console.log("Login request body:", email);

  try {
    console.log("Login request body:", req.body);
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const [rows] = await db.execute(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    if (rows.length === 0) {
      console.log("User not found for:", email);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      console.log("Incorrect password for:", email);
      return res.status(401).json({ message: 'Invalid credentials' });
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
    res.status(500).json({ message: 'Login failed due to server error' });
  }
});

// Protected routes
router.get('/protected', verifyToken, (req, res) => {
  res.json({ message: `Welcome, ${req.user.username}! You accessed a protected route.` });
});

router.get('/admin-only', verifyToken, authorizeRole('admin'), (req, res) => {
  res.json({ message: `Hello ${req.user.username}, you have admin access.` });
});

router.get('/test', (req, res) => {
  res.json({ message: 'URL reached successfully!' });
});

module.exports = router;

