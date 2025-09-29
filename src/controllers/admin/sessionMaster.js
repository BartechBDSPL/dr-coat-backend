import { executeQuery } from '../../config/db.js';
import { sql } from '../../config/db.js';

export const getAllDetails = async (req, res) => {
  try {
    const result = await executeQuery('EXEC sp_session_master_get_all_details');
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

export const updateDetails = async (req, res) => {
  const { id, session_time, unit, updated_by } = req.body;
  try {
    const result = await executeQuery('EXEC sp_session_master_update @id, @session_time, @unit, @updated_by', [
      { name: 'id', type: sql.Int, value: id },
      { name: 'session_time', type: sql.Int, value: session_time },
      { name: 'unit', type: sql.NVarChar, value: unit },
      { name: 'updated_by', type: sql.NVarChar, value: updated_by },
    ]);
    res.json(result[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};
