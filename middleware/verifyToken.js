const jwt = require('jsonwebtoken');

function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; 

  if (!Token) {
    return res.status(401).json({ message: 'No Token provided' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
   if (err) {
    return res.status(403).json({ message: 'Invalid Token' });
    }
    req.user = user; // Attach decoded user info to request 
    next(); //proceed to the next middleware or route 
  });
}

module.exports = verifyToken;