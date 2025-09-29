import { executeQuery } from '../../config/db.js';
import { sql } from '../../config/db.js';

export const getAllCompanyDetails = async (req, res) => {
  try {
    const getAllDetails = await executeQuery('EXEC sp_company_master_get_all_details');
    res.json(getAllDetails);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

export const updateCompanyDetails = async (req, res) => {
  const { companyId, companyName, address, city, state, companyStatus, updatedBy } = req.body;
  console.log(req.body);
  try {
    const updateDetails = await executeQuery(
      'EXEC sp_company_master_update @company_id, @company_name, @address, @city, @state, @compnay_status, @updated_by',
      [
        { name: 'company_id', type: sql.Int, value: companyId },
        { name: 'company_name', type: sql.NVarChar, value: companyName },
        { name: 'address', type: sql.NVarChar, value: address },
        { name: 'city', type: sql.NVarChar, value: city },
        { name: 'state', type: sql.NVarChar, value: state },
        { name: 'compnay_status', type: sql.NVarChar, value: companyStatus },
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

export const insertCompanyDetails = async (req, res) => {
  const { companyCode, companyName, address, city, state, companyStatus, createdBy } = req.body;
  try {
    const insertDetails = await executeQuery(
      'EXEC sp_company_master_insert @company_code, @company_name, @address, @city, @state, @company_status, @created_by, @barcode',
      [
        { name: 'company_code', type: sql.NVarChar, value: companyCode },
        { name: 'company_name', type: sql.NVarChar, value: companyName },
        { name: 'address', type: sql.NVarChar, value: address },
        { name: 'city', type: sql.NVarChar, value: city },
        { name: 'state', type: sql.NVarChar, value: state },
        { name: 'company_status', type: sql.NVarChar, value: companyStatus },
        { name: 'created_by', type: sql.NVarChar, value: createdBy },
        { name: 'barcode', type: sql.NVarChar, value: companyCode },
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
