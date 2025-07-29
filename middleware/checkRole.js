// middleware/checkRole.js
module.exports = (allowedRoles) => {
  return (req, res, next) => {
    const userRole = req.user?.role;
    if (!userRole || !allowedRoles.includes(userRole)) {
      return res.status(403).json({ message: 'Forbidden: Role not permitted' });
    }
    next();
  };
};
