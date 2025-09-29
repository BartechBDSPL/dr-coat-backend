import { executeQuery } from '../../config/db.js';
import { sql } from '../../config/db.js';

export const getAllPlantCode = async (req, res) => {
  try {
    const result = await executeQuery('EXEC sp_plant_master_get_plant_codes');
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

export const getCategoryCode = async (req, res) => {
  try {
    const result = await executeQuery('EXEC Sp_warehouse_category_master_get_category_code');
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

export const getAllDetails = async (req, res) => {
  try {
    const result = await executeQuery('EXEC sp_warehouse_master_get_all_details');
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

export const updateDetails = async (req, res) => {
  const { ID, PlantCode, WarehouseCode, WarehouseDesc, WarehouseAddress, WarehouseCategory, WStatus, User } = req.body;
  try {
    const result = await executeQuery(
      'EXEC sp_warehouse_master_update @id, @warehouse_code, @warehouse_desc, @warehouse_address, @warehouse_category, @warehouse_status, @updated_by',
      [
        { name: 'id', type: sql.Int, value: ID },
        { name: 'warehouse_code', type: sql.NVarChar, value: WarehouseCode },
        { name: 'warehouse_desc', type: sql.NVarChar, value: WarehouseDesc },
        {
          name: 'warehouse_address',
          type: sql.NVarChar,
          value: WarehouseAddress,
        },
        {
          name: 'warehouse_category',
          type: sql.NVarChar,
          value: WarehouseCategory,
        },
        { name: 'warehouse_status', type: sql.NVarChar, value: WStatus },
        { name: 'updated_by', type: sql.NVarChar, value: User },
      ]
    );
    res.json(result[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

// Insert new data
export const insertDetails = async (req, res) => {
  const { PlantCode, WarehouseCode, WarehouseDesc, WarehouseAddress, WarehouseCategory, WStatus, User } = req.body;
  try {
    const result = await executeQuery(
      'EXEC sp_warehouse_master_insert @plant_code,@warehouse_code, @warehouse_desc, @warehouse_address, @warehouse_category, @warehouse_status, @created_by',
      [
        { name: 'plant_code', type: sql.NVarChar, value: PlantCode },
        { name: 'warehouse_code', type: sql.NVarChar, value: WarehouseCode },
        { name: 'warehouse_desc', type: sql.NVarChar, value: WarehouseDesc },
        {
          name: 'warehouse_address',
          type: sql.NVarChar,
          value: WarehouseAddress,
        },
        {
          name: 'warehouse_category',
          type: sql.NVarChar,
          value: WarehouseCategory,
        },
        { name: 'warehouse_status', type: sql.NVarChar, value: WStatus },
        { name: 'created_by', type: sql.NVarChar, value: User },
      ]
    );
    res.json(result[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};
