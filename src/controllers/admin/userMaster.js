import { executeQuery } from '../../config/db.js';
import { sql } from '../../config/db.js';
import { encryptPassword } from '../../utils/passswordHelper.js';

export const getAllUserDetails = async (req, res) => {
  try {
    const result = await executeQuery('EXEC [dbo].[sp_user_get_all_details]');
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateUserDetails = async (req, res) => {
  const { User_ID, User_Name, User_Role, Status, Locked, UpdatedBy, PassExpDays, PlantCode, Line, EmailId, MobileNo } =
    req.body;

  try {
    const result = await executeQuery(
      'EXEC [dbo].[sp_user_update] @id, @user_role, @user_status, @locked, @updated_by, @user_name, @plant_code, @line, @email_id, @mobile_no, @pass_exp_days',
      {
        id: { type: sql.Int, value: parseInt(User_ID) },
        user_role: { type: sql.NVarChar(150), value: User_Role },
        user_status: { type: sql.NVarChar(150), value: Status },
        locked: { type: sql.NVarChar(150), value: Locked },
        updated_by: { type: sql.NVarChar(150), value: UpdatedBy },
        user_name: { type: sql.NVarChar(150), value: User_Name },
        plant_code: { type: sql.NVarChar(150), value: PlantCode },
        line: { type: sql.NVarChar(150), value: Line },
        email_id: { type: sql.NVarChar(150), value: EmailId },
        mobile_no: { type: sql.BigInt, value: parseInt(MobileNo) },
        pass_exp_days: { type: sql.Int, value: parseInt(PassExpDays) },
      }
    );
    res.status(200).json(result[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getAllUserTypeDD = async (req, res) => {
  try {
    // Execute the stored procedure
    const result = await executeQuery('EXEC [dbo].[sp_get_all_user_type]');

    res.status(200).json(result);
  } catch (error) {
    // Log error and send a 500 response
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

export const insertUserDetails = async (req, res) => {
  const {
    User_ID,
    User_Name,
    User_Password,
    User_Role,
    Status,
    Locked,
    CreatedBy,
    PassExpDays,
    LoginAttempt,
    Name,
    PlantCode,
    Line,
    EmailId,
    MobileNo,
    isChangePassword,
  } = req.body;

  try {
    const result = await executeQuery(
      'EXEC [dbo].[sp_user_insert] @user_id, @user_name, @user_password, @user_role, @user_status, @locked, @created_by, @pass_exp_days, @login_attempt, @name, @plant_code, @line_code, @email_id, @mobile_no, @is_change_password',
      {
        user_id: { type: sql.NVarChar(150), value: User_ID },
        user_name: { type: sql.NVarChar(150), value: User_Name },
        user_password: {
          type: sql.NVarChar(150),
          value: encryptPassword(User_Password.toString()),
        },
        user_role: { type: sql.NVarChar(150), value: User_Role },
        user_status: { type: sql.NVarChar(150), value: Status },
        locked: { type: sql.NVarChar(150), value: Locked },
        created_by: { type: sql.NVarChar(150), value: CreatedBy },
        pass_exp_days: { type: sql.Int, value: parseInt(PassExpDays) },
        login_attempt: { type: sql.Int, value: parseInt(LoginAttempt) },
        name: { type: sql.NVarChar(150), value: Name },
        plant_code: { type: sql.NVarChar(150), value: PlantCode },
        line_code: { type: sql.NVarChar(150), value: Line },
        email_id: { type: sql.NVarChar(150), value: EmailId },
        mobile_no: { type: sql.BigInt, value: parseInt(MobileNo) },
        is_change_password: {
          type: sql.Bit,
          value: isChangePassword === true ? 1 : 0,
        },
      }
    );

    res.status(200).json(result[0]);
  } catch (error) {
    if (error.message.includes('User ID already exists')) {
      res.status(400).json({ error: 'User ID already exists in User Master.' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
};
