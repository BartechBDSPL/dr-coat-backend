import { executeQuery } from '../../config/db.js';
import { sql } from '../../config/db.js';

// Get all company names from Company Master
export const getAllCompanyName = async (req, res) => {
  try {
    const getAllNames = await executeQuery('EXEC sp_company_master_get_company_name');
    res.json(getAllNames);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

// Insert details into Plant Master
export const insertAllDetails = async (req, res) => {
  const { companyCode, plantCode, plantName, address, city, state, plantStatus, createdBy } = req.body;
  try {
    const insertDetails = await executeQuery(
      'EXEC sp_plant_master_insert @company_code, @plant_code, @plant_name, @address, @city, @state, @plant_status, @created_by, @barcode',
      [
        { name: 'company_code', type: sql.NVarChar, value: companyCode },
        { name: 'plant_code', type: sql.NVarChar, value: plantCode },
        { name: 'plant_name', type: sql.NVarChar, value: plantName },
        { name: 'address', type: sql.NVarChar, value: address },
        { name: 'city', type: sql.NVarChar, value: city },
        { name: 'state', type: sql.NVarChar, value: state },
        { name: 'plant_status', type: sql.NVarChar, value: plantStatus },
        { name: 'created_by', type: sql.NVarChar, value: createdBy },
        { name: 'barcode', type: sql.NVarChar, value: plantCode },
      ]
    );
    res.json({
      Status: insertDetails[0].Status,
      Message: insertDetails[0].Message,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

// Update details in Plant Master
export const updateDetails = async (req, res) => {
  const { plantId, plantCode, plantName, address, city, state, plantStatus, updatedBy } = req.body;
  try {
    const updateDetails = await executeQuery(
      'EXEC sp_plant_master_update @plant_id, @plant_code, @plant_name, @address, @city, @state, @plant_status, @updated_by',
      [
        { name: 'plant_id', type: sql.Int, value: plantId },
        { name: 'plant_code', type: sql.NVarChar, value: plantCode },
        { name: 'plant_name', type: sql.NVarChar, value: plantName },
        { name: 'address', type: sql.NVarChar, value: address },
        { name: 'city', type: sql.NVarChar, value: city },
        { name: 'state', type: sql.NVarChar, value: state },
        { name: 'plant_status', type: sql.NVarChar, value: plantStatus },
        { name: 'updated_by', type: sql.NVarChar, value: updatedBy },
      ]
    );
    res.json({
      Status: updateDetails[0].Status,
      Message: updateDetails[0].Message,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

// Get all details for plant master - To show in the table
export const getAllDetailsPlantMaster = async (req, res) => {
  try {
    const getAllDetailsPlantMaster = await executeQuery('EXEC sp_plant_master_get_all_details');
    res.json(getAllDetailsPlantMaster);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

// Get all plant codes
export const getAllPlantCodes = async (req, res) => {
  try {
    const getAllPlantCodes = await executeQuery('EXEC sp_plant_master_get_plant_codes');
    res.json(getAllPlantCodes);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};
