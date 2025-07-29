const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const checkRole = require('../middleware/checkRole');

router.post(
  '/secure-data',
  authMiddleware,
  checkRole(['admin']),
  (req, res) => {
    res.json({ message: 'Access granted to admin-only data.' });
  }
);
