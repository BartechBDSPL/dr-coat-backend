import { executeQuery } from '../../config/db.js';
import { sql } from '../../config/db.js';
import jwt from 'jsonwebtoken';
import { encryptPassword } from '../../utils/passswordHelper.js';
import sessionManager from '../../utils/sessionManager.js';

// Secret key for JWT
const JWT_SECRET = 'bdspl';

export const checkUserExist = async (req, res) => {
  const { User_ID } = req.body;

  try {
    const result = await executeQuery('EXEC sp_user_check_exist @user_id', [
      { name: 'user_id', type: sql.NVarChar, value: User_ID },
    ]);

    res.status(200).json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

// Check user credentials
export const checkCredentials = async (req, res) => {
  const { User_ID, User_Password, DeviceSN, ApplicationType } = req.body;
  console.log(req.body);

  if (!ApplicationType === 'HHT' || !ApplicationType === 'WEB') {
    return res.status(401).json({ Status: 'F', Message: 'Invalid Application Type' });
  }
  try {
    const result = await executeQuery(
      'EXEC sp_user_check_credentials @user_id, @user_password, @device_sn, @application_type',
      [
        { name: 'user_id', type: sql.NVarChar, value: User_ID },
        {
          name: 'user_password',
          type: sql.NVarChar,
          value: encryptPassword(User_Password.toString()),
        },
        { name: 'device_sn', type: sql.NVarChar, value: DeviceSN },
        {
          name: 'application_type',
          type: sql.NVarChar,
          value: ApplicationType,
        },
      ]
    );
    if (result && result.length > 0) {
      const status = result[0]?.Status;
      const message = result[0]?.Message;
      const is_change_password = result[0]?.is_change_password;
      console.log(result);
      if (message === 'Login successful') {
        // Fetch user details
        const userDetails = await executeQuery('EXEC sp_user_master_details_by_user_id @user_id', [
          { name: 'user_id', type: sql.NVarChar, value: User_ID },
        ]);

        if (userDetails && userDetails.length > 0) {
          const user = userDetails[0];

          const token = jwt.sign({ user }, JWT_SECRET, { expiresIn: '365d' });

          // Initialize user session after successful login
          try {
            await sessionManager.updateUserActivity(user.user_id);
            console.log(`Session initialized for user: ${user.user_id}`);
          } catch (sessionError) {
            console.error('Error initializing session:', sessionError);
            // Don't fail login if session init fails
          }

          return res.status(200).json({
            Status: status,
            Message: message,
            token,
            is_change_password: is_change_password,
          });
        }
      }

      return res.status(200).json({ Status: status, Message: message });
    } else {
      return res.status(500).json({
        Status: 'F',
        Message: 'An unexpected error occurred. No record found.',
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

export const getAllUserTypes = async (req, res) => {
  try {
    const result = await executeQuery('EXEC hht_get_all_user_types');

    res.status(200).json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ Status: 'F', Message: error.message });
  }
};
