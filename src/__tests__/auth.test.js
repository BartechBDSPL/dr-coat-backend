import request from 'supertest';
import app from '../index.js';
import { TEST_CREDENTIALS } from './setup.js';

// Mock app.listen to prevent server from starting during tests
jest.mock('../index.js', () => {
  const originalModule = jest.requireActual('../index.js');
  originalModule.listen = jest.fn();
  return originalModule;
});

describe('Authentication Endpoints', () => {
  let authToken;

  describe('POST /api/auth/check-credentials', () => {
    it('should authenticate user with valid credentials', async () => {
      const response = await request(app).post('/api/auth/check-credentials').send({
        User_ID: TEST_CREDENTIALS.User_ID,
        User_Password: TEST_CREDENTIALS.User_Password,
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      ``;
      authToken = response.body.token;
    }, 10000); //

    it('should reject invalid credentials', async () => {
      const response = await request(app).post('/api/auth/check-credentials').send({
        User_ID: 'wronguser',
        User_Password: 'wrongpass',
      });

      expect(response.status).toBe(401);
    });
  });
});
