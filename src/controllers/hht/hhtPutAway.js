import { executeQuery, sql } from '../../config/db.js';
import axios from 'axios';
import { SAP_CONNECTOR_MIDDLEWARE_URL, SAP_SERVER } from '../../utils/constants.js';
import { format } from 'date-fns';

export const putAwayValidation = async (req, res) => {
  const { serial_no } = req.body;

  try {
    const result = await executeQuery(`EXEC [dbo].[fg_hht_put_away_validation] @serial_no`, [
      { name: 'serial_no', type: sql.NVarChar(255), value: serial_no },
    ]);
    res.json(result[0]);
  } catch (error) {
    console.error('Error validating put away barcode:', error);
    res.status(500).json({ error: 'Failed to validate barcode' });
  }
};

export const putAwayUpdate = async (req, res) => {
  const { warehouse_code, put_location, put_quantity, serial_no, put_by } = req.body;

  try {
    const serialNos = serial_no.split('$');
    const quantities = put_quantity.split('$');
    const results = [];

    for (let i = 0; i < serialNos.length; i++) {
      const result = await executeQuery(`EXEC [dbo].[fg_hht_put_away_update] @warehouse_code, @put_location, @put_quantity, @serial_no, @put_by`, [
        { name: 'warehouse_code', type: sql.NVarChar(50), value: warehouse_code },
        { name: 'put_location', type: sql.NVarChar(20), value: put_location },
        { name: 'put_quantity', type: sql.Decimal(18,3), value: parseFloat(quantities[i]) },
        { name: 'serial_no', type: sql.NVarChar(255), value: serialNos[i] },
        { name: 'put_by', type: sql.NVarChar(50), value: put_by },
      ]);
      results.push(result[0]);
    }
    res.json(results[0]);
  } catch (error) {
    console.error('Error updating put away:', error);
    res.status(500).json({ error: 'Failed to update put away' });
  }
};

export const putAwayLocationSuggestion = async (req, res) => {
  const { warehouse_code } = req.body;

  try {
    const result = await executeQuery(`EXEC [dbo].[fg_hht_location_suggestion] @warehouse_code`, [
      { name: 'warehouse_code', type: sql.NVarChar(50), value: warehouse_code },
    ]);
    res.json(result);
  } catch (error) {
    console.error('Error fetching put away location suggestions:', error);
    res.status(500).json({ error: 'Failed to fetch location suggestions' });
  }
};


export const checkLocationExists = async (req, res) => {
  const { warehouse_code, bin } = req.body;

  try {
    const result = await executeQuery(`EXEC [dbo].[hht_location_exists] @warehouse_code, @bin`, [
      { name: 'warehouse_code', type: sql.NVarChar(50), value: warehouse_code },
      { name: 'bin', type: sql.NVarChar(50), value: bin },
    ]);
    res.json(result[0]);
  } catch (error) {
    console.error('Error checking location exists:', error);
    res.status(500).json({ error: 'Failed to check location' });
  }
};

export const getAllWarehouseCodes = async (req, res) => {
  try {
    const result = await executeQuery(`EXEC [dbo].[hht_warehouse_code_get_all]`, []);
    res.json(result);
  } catch (error) {
    console.error('Error getting warehouse codes:', error);
    res.status(500).json({ error: 'Failed to get warehouse codes' });
  }
};