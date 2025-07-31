// routes/user.js
const express = require('express');
const router = express.Router();

router.post('/signup', async (req, res) => {
  const { username, email, password, role } = req.body;

  // Add validation, hashing, user creation logic here
  console.log('Received signup:', req.body);

  // Dummy success response
  return res.status(200).json({
    message: 'Signup successful!',
    token: 'sample-token-123',
  });
});

module.exports = router;
