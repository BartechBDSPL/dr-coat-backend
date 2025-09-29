import { executeQuery } from '../../config/db.js';
import { sql } from '../../config/db.js';

export const insertUserRole = async (req, res) => {
  const { user_type, web_menu_access, hht_menu_access, created_by } = req.body;

  try {
    const result = await executeQuery(
      'EXEC sp_user_type_insert @user_type, @web_menu_access, @hht_menu_access, @created_by',
      [
        { name: 'user_type', type: sql.NVarChar, value: user_type },
        { name: 'web_menu_access', type: sql.NVarChar, value: web_menu_access },
        { name: 'hht_menu_access', type: sql.NVarChar, value: hht_menu_access },
        { name: 'created_by', type: sql.NVarChar, value: created_by },
      ]
    );

    res.status(200).json(result[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

export const getAllUserType = async (req, res) => {
  try {
    const result = await executeQuery('EXEC sp_user_type_get_all');

    res.status(200).json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

export const updateUserRoles = async (req, res) => {
  const { id, user_type, web_menu_access, hht_menu_access, updated_by } = req.body;

  try {
    const result = await executeQuery(
      'EXEC sp_user_type_update @id, @user_type, @web_menu_access, @hht_menu_access, @updated_by',
      [
        { name: 'id', type: sql.Int, value: id },
        { name: 'user_type', type: sql.NVarChar, value: user_type },
        { name: 'web_menu_access', type: sql.NVarChar, value: web_menu_access },
        { name: 'hht_menu_access', type: sql.NVarChar, value: hht_menu_access },
        { name: 'updated_by', type: sql.NVarChar, value: updated_by },
      ]
    );
    res.status(200).json(result[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};
