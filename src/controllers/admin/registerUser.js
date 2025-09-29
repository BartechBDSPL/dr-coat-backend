import { executeQuery, sql } from '../../config/db.js';
import { encryptPassword } from '../../utils/passswordHelper.js';

export const insertAndroidAccess = async (req, res) => {
  const { User_ID, User_Name, User_Password } = req.body;

  try {
    const result = await executeQuery('EXEC [dbo].[HHT_Insert_Android_Access] @User_ID, @User_Name, @User_Password', {
      User_ID: { type: sql.NVarChar(100), value: User_ID },
      User_Name: { type: sql.NVarChar(100), value: User_Name },
      User_Password: {
        type: sql.NVarChar(100),
        value: encryptPassword(User_Password).toString(),
      },
    });
    res.status(200).json(result[0]);
  } catch (error) {
    console.error('Error inserting Android Access:', error);
    res.status(500).json({ error: error.message });
  }
};

export const updateAndroidAccessStatus = async (req, res) => {
  const { User_ID, Status, ApprovedBy } = req.body;

  try {
    const result = await executeQuery('EXEC [dbo].[HHT_Update_Android_Access_Status] @User_ID, @Status, @ApprovedBy', {
      User_ID: { type: sql.NVarChar(100), value: User_ID },
      Status: { type: sql.NVarChar(50), value: Status },
      ApprovedBy: { type: sql.NVarChar(100), value: ApprovedBy },
    });
    res.status(200).json(result[0]);
  } catch (error) {
    console.error('Error updating Android Access status:', error);
    res.status(500).json({ error: error.message });
  }
};
