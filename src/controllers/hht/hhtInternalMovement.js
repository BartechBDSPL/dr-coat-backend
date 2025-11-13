import { executeQuery, sql } from '../../config/db.js';
import axios from 'axios';
import { SAP_CONNECTOR_MIDDLEWARE_URL, SAP_SERVER } from '../../utils/constants.js';
import { format } from 'date-fns';

export const internalBarcodeValidation = async (req, res) => {
  const { serial_no } = req.body;

  try {
    const result = await executeQuery(`EXEC [dbo].[fg_hht_internal_movement_validation] @serial_no`, [
      { name: 'serial_no', type: sql.NVarChar(255), value: serial_no },
    ]);
    res.json(result[0]);
  } catch (error) {
    console.error('Error validating internal movement barcode:', error);
    res.status(500).json({ error: 'Failed to validate barcode' });
  }
};
export const IntBarcodeDataUpdate = async (req, res) => {
  const { warehouse_code, move_location, serial_no, move_by } = req.body;

  try {
    const serialNos = serial_no.split('$');
    const results = [];
    for (const sn of serialNos) {
      const result = await executeQuery(`EXEC [dbo].[fg_hht_internal_movement_update] @warehouse_code, @move_location, @serial_no, @move_by`, [
        { name: 'warehouse_code', type: sql.NVarChar(50), value: warehouse_code },
        { name: 'move_location', type: sql.NVarChar(20), value: move_location },
        { name: 'serial_no', type: sql.NVarChar(255), value: sn },
        { name: 'move_by', type: sql.NVarChar(50), value: move_by },
      ]);
      results.push(result[0]);
    }
    res.json(results[0]);
  } catch (error) {
    console.error('Error updating internal movement:', error);
    res.status(500).json({ error: 'Failed to update internal movement' });
  }
};

