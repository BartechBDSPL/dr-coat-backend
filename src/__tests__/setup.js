import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../utils/constants.js';
import { initializeDatabases, closeDatabases } from '../config/db.js';

// Real test user credentials - replace these with actual test user data from your database
export const TEST_CREDENTIALS = {
  User_ID: 'admin',
  User_Password: 'admin',
};

export const generateTestToken = user => {
  return jwt.sign({ user }, JWT_SECRET, { expiresIn: '1h' });
};

beforeAll(async () => {
  try {
    await initializeDatabases();
    console.log('Test database connection initialized');
  } catch (error) {
    console.error('Failed to initialize test database:', error);
    throw error;
  }
});

afterAll(async () => {
  try {
    await closeDatabases();
    console.log('Test database connection closed');
  } catch (error) {
    console.error('Failed to close test database:', error);
  }
});
