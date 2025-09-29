import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../utils/constants.js';
import sessionManager from '../utils/sessionManager.js';

const authWithSession = (req, res, next) => {
  try {
    const token = req.headers['authorization'];

    if (!token || !token.startsWith('Bearer ')) {
      return res.status(401).json({
        Status: 'F',
        Message: 'Not authorized, token missing or invalid',
      });
    }

    const actualToken = token.split(' ')[1];

    jwt.verify(actualToken, JWT_SECRET, { ignoreExpiration: true }, async (err, decoded) => {
      if (err) {
        return res.status(401).json({
          Status: 'F',
          Message: 'Token verification failed',
        });
      }

      // Check session timeout - user ID is in decoded.user.user_id
      const userId = decoded.user?.user_id;
      if (!userId) {
        console.error('❌ Token structure missing user.user_id:', JSON.stringify(decoded, null, 2));
        return res.status(401).json({
          Status: 'F',
          Message: 'Invalid token: user ID not found in token structure',
        });
      }

      // Check if session is still valid
      const sessionCheck = sessionManager.isSessionValid(userId);

      if (!sessionCheck.valid) {
        // Return HTTP 440 (Login Time-out) for frontend axios interceptor
        return res.status(440).json({
          Status: 'F',
          Message: sessionCheck.message,
          Title: 'Session Expired',
          InactiveTime: sessionCheck.inactiveTime,
          Code: 'SESSION_EXPIRED',
        });
      }

      // Update user activity for this request
      await sessionManager.updateUserActivity(userId);

      req.user = decoded;
      next();
    });
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({
      Status: 'F',
      Message: 'Authentication failed',
    });
  }
};

// Original auth middleware (without session checking) for backward compatibility
const auth = (req, res, next) => {
  try {
    const token = req.headers['authorization'];

    if (!token || !token.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Not authorized, token missing or invalid' });
    }

    const actualToken = token.split(' ')[1];

    jwt.verify(actualToken, JWT_SECRET, { ignoreExpiration: true }, (err, decoded) => {
      if (err) {
        return res.status(401).json({ Status: 'F', Message: 'Token verification failed' });
      }

      req.user = decoded;
      next();
    });
  } catch (error) {
    res.status(401).json({ message: 'Not authorized' });
  }
};

export { authWithSession, sessionManager };
export default auth;
