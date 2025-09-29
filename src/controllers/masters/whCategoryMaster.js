import { executeQuery } from '../../config/db.js';
import { sql } from '../../config/db.js';

export const insertWhCategory = async (req, res) => {
  const { category_code, category_desc, created_by } = req.body;
  try {
    const insertDetails = await executeQuery(
      'EXEC sp_warehouse_category_master_insert @category_code, @category_desc, @created_by',
      [
        { name: 'category_code', type: sql.NVarChar, value: category_code },
        { name: 'category_desc', type: sql.NVarChar, value: category_desc },
        { name: 'created_by', type: sql.NVarChar, value: created_by },
      ]
    );
    res.json(insertDetails[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

export const getAllWarehouseCategory = async (req, res) => {
  try {
    const getAllWHCategory = await executeQuery('EXEC sp_warehouse_category_master_get_all_details');
    res.json(getAllWHCategory);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

export const updateWarehouseCategory = async (req, res) => {
  const { category_code, category_desc, updated_by } = req.body;
  console.log(req.body);
  try {
    const updateDetails = await executeQuery(
      'EXEC sp_warehouse_category_master_update @category_code, @category_desc, @updated_by',
      [
        { name: 'category_code', type: sql.NVarChar, value: category_code },
        { name: 'category_desc', type: sql.NVarChar, value: category_desc },
        { name: 'updated_by', type: sql.NVarChar, value: updated_by },
      ]
    );
    console.log(updateDetails);
    res.json(updateDetails[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};
