import jwt from 'jsonwebtoken';

// Verify the JWT sent in the "Authorization: Bearer <token>" header.
export function authenticate(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  const token = header.split(' ')[1];
  console.log("Received token:", token); // Debugging line
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: decoded.id, role: decoded.role };
    return next();
  } catch (err) {
    console.error("JWT verification failed:", err.name, err.message);

    const message =
      err.name === 'TokenExpiredError'
        ? 'Token expired. Please log in again.'
        : 'Invalid token.';

    return res.status(401).json({ error: message });
  }
}

// Allow only the listed roles, e.g. authorizeRoles('admin').
export function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Forbidden. You do not have permission to perform this action.'
      });
    }
    return next();
  };
}
