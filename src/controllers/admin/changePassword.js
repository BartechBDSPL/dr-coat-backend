import { executeQuery } from '../../config/db.js';
import { sql } from '../../config/db.js';
import { encryptPassword } from '../../utils/passswordHelper.js';

// export const changePassword = async (req, res) => {
//   const { user_id, old_user_password, new_user_password, is_first_change } = req.body;
//   try {
//     const result = await executeQuery(
//       'EXEC [dbo].[sp_change_password] @user_id, @old_user_password, @new_user_password, @is_first_change',
//       [
//         { name: 'user_id', type: sql.NVarChar(50), value: user_id },
//         {
//           name: 'old_user_password',
//           type: sql.NVarChar(100),
//           value: encryptPassword(old_user_password.toString()),
//         },
//         {
//           name: 'new_user_password',
//           type: sql.NVarChar(100),
//           value: encryptPassword(new_user_password.toString()),
//         },
//         {
//           name: 'is_first_change',
//           type: sql.Bit,
//           value: is_first_change ? 1 : 0,
//         },
//       ]
//     );
//     res.status(200).json(result[0]);
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// };



export const changePassword = async (req, res) => {
  const { user_id, old_user_password, new_user_password, is_first_change } = req.body;
  try {
    // Dummy 440 status for testing
    res.status(440).json({ Status:'T',Message: "Dummy 440 status for testing", status: 440 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
