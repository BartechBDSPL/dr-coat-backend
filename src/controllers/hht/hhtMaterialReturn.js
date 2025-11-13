import { executeQuery, sql } from '../../config/db.js';

export const getMaterialReturnDetails = async (req, res) => {
  const { serial_no } = req.body;

  try {
    const result = await executeQuery(`EXEC [dbo].[fg_hht_material_return] @serial_no`, [
      { name: 'serial_no', type: sql.NVarChar(255), value: serial_no },
    ]);
    res.json(result[0]);
  } catch (error) {
    console.error('Error getting material return details:', error);
    res.status(500).json({ error: 'Failed to get material return details' });
  }
};

export const updateMaterialReturn = async (req, res) => {
  const { shipment_no, serial_no, return_by } = req.body;
  console.log('Update Material Return Request Body:', req.body);
  try {
    const shipmentNos = shipment_no.split('$').filter(s => s.trim());
    const serialNos = serial_no.split('$').filter(s => s.trim());

    if (shipmentNos.length !== serialNos.length) {
      return res.status(400).json({ Status: 'F', Message: 'Shipment numbers and serial numbers count mismatch' });
    }

    for (let i = 0; i < serialNos.length; i++) {
      const result = await executeQuery(
        `EXEC [dbo].[fg_hht_material_return_update] @shipment_no, @serial_no, @return_by`,
        [
          { name: 'shipment_no', type: sql.NVarChar(50), value: shipmentNos[i] },
          { name: 'serial_no', type: sql.NVarChar(255), value: serialNos[i] },
          { name: 'return_by', type: sql.NVarChar(50), value: return_by },
        ]
      );

      if (result[0].Status === 'F') {
        return res.json(result[0]);
      }
    }
    res.json({ Status: 'T', Message: `Material return done successfully for ${serialNos.length} items` });
  } catch (error) {
    console.error('Error updating material return:', error);
    res.status(500).json({ error: 'Failed to update material return' });
  }
};
