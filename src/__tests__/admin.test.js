import request from 'supertest';
import app from '../index.js';
import { TEST_CREDENTIALS } from './setup.js';

describe('Admin Endpoints', () => {
  let authToken;

  // Get auth token before running admin tests
  beforeAll(async () => {
    const response = await request(app).post('/api/auth/check-credentials').send({
      User_ID: TEST_CREDENTIALS.User_ID,
      User_Password: TEST_CREDENTIALS.User_Password,
    });

    authToken = response.body.token;
  }, 10000);

  describe('GET /api/admin/all-user-master', () => {
    it('should get all users when authenticated', async () => {
      const response = await request(app).get('/api/admin/all-user-master').set('Authorization', `Bearer ${authToken}`);

      console.log(response.body);
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    }, 10000);

    it('should reject request without token', async () => {
      const response = await request(app).get('/api/admin/all-user-master');

      expect(response.status).toBe(401);
    });
  });

  // describe('POST /api/admin/insert-user-master', () => {
  //     it('should create new user when authenticated', async () => {
  //         const newUser = {
  //             User_ID: `TEST_${Date.now()}`, // Generate unique ID
  //             User_Name: 'Integration Test User',
  //             User_Password: 'testpass123',
  //             User_Role: 'User',
  //             Status: 'Active',
  //             Locked: 'N',
  //             CreatedBy: TEST_CREDENTIALS.User_ID,
  //             PassExpDays: 90,
  //             LoginAttempt: 0,
  //             Name: 'Test User Full Name',
  //             PlantCode: 'PLANT1',
  //             Line: 'LINE1',
  //             EmailId: 'test@test.com',
  //             MobileNo: '1234567890'
  //         };

  //         const response = await request(app)
  //             .post('/api/admin/insert-user-master')
  //             .set('Authorization', `Bearer ${authToken}`)
  //             .send(newUser);

  //         expect(response.status).toBe(200);
  //     }, 10000);
  // });

  // describe('PATCH /api/admin/edit-user-master', () => {
  //     it('should update existing user when authenticated', async () => {
  //         const updateUser = {
  //             User_ID: TEST_CREDENTIALS.User_ID,
  //             User_Name: 'Updated Test User',
  //             User_Role: 'Admin',
  //             Status: 'Active',
  //             Locked: 'N',
  //             UpdatedBy: TEST_CREDENTIALS.User_ID,
  //             PassExpDays: 90,
  //             PlantCode: 'PLANT1',
  //             Line: 'LINE1',
  //             EmailId: 'test@test.com',
  //             MobileNo: '1234567890'
  //         };

  //         const response = await request(app)
  //             .patch('/api/admin/edit-user-master')
  //             .set('Authorization', `Bearer ${authToken}`)
  //             .send(updateUser);

  //         expect(response.status).toBe(200);
  //     }, 10000);
  // });
});
