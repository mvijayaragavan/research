const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'privacyguard_super_secret_jwt_key_2026_change_in_production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '2h';

/**
 * Generate signed JWT token containing user identity and role payload
 */
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      department: user.department
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

/**
 * Verify and decode JWT token
 */
const verifyToken = (token) => {
  return jwt.verify(token, JWT_SECRET);
};

module.exports = {
  generateToken,
  verifyToken
};
