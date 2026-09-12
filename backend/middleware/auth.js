const { verifyToken } = require('../utils/jwt');
const User = require('../models/User');

/**
 * Deterministic Authentication Middleware
 * Extracts and verifies JWT bearer token from HTTP headers.
 */
const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Access denied: Authentication token required'
    });
  }

  try {
    const decoded = verifyToken(token);
    // Attach validated user payload to request
    req.user = decoded;

    // Optional check: verify user still exists in database
    const dbUser = await User.findById(decoded.id).select('-password');
    if (!dbUser) {
      return res.status(401).json({
        success: false,
        error: 'Authentication failed: User account no longer exists'
      });
    }

    next();
  } catch (err) {
    console.error('[Auth Middleware] Invalid or expired JWT token:', err.message);
    return res.status(401).json({
      success: false,
      error: 'Access denied: Invalid or expired authentication token'
    });
  }
};

/**
 * Role Check Middleware (pass-through for authenticated users)
 */
const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    next();
  };
};

module.exports = {
  protect,
  authorizeRoles
};
