import { executeQuery } from '../../config/db.js';
import { sql } from '../../config/db.js';

export const getAllUom = async (req, res) => {
  try {
    const getAllUomData = await executeQuery('EXEC sp_uom_master_get_all_details');
    res.json(getAllUomData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

export const getAllUomUnits = async (req, res) => {
  try {
    const getAllUnits = await executeQuery('EXEC sp_uom_master_get_all_uom_unit');
    res.json(getAllUnits);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

export const updateUom = async (req, res) => {
  const { unit, description, user } = req.body;
  try {
    const updateDetails = await executeQuery('EXEC sp_uom_master_update @unit, @description, @updated_by', [
      { name: 'unit', type: sql.NVarChar, value: unit },
      { name: 'description', type: sql.NVarChar, value: description },
      { name: 'updated_by', type: sql.NVarChar, value: user },
    ]);

    const { Status, Message } = updateDetails[0];

    res.json(updateDetails[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

export const insertUom = async (req, res) => {
  const { unit, description, user } = req.body;
  try {
    const insertDetails = await executeQuery('EXEC sp_uom_master_insert @unit, @description, @created_by', [
      { name: 'unit', type: sql.NVarChar, value: unit },
      { name: 'description', type: sql.NVarChar, value: description },
      { name: 'created_by', type: sql.NVarChar, value: user },
    ]);

    const { Status, Message } = insertDetails[0];

    if (Status === 'T') {
      res.json({ Status: 'T', Message: Message });
    } else if (Status === 'F') {
      res.status(200).json({ Status: 'F', Message: Message });
    } else {
      res.status(500).json({ Status: 'F', Message: Message });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};
