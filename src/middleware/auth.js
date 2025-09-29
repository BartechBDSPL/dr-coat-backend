import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../utils/constants.js';

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

export default auth;
