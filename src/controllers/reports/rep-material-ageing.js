import { executeQuery, sql } from '../../config/db.js';

export const getMaterialAgeingReport = async (req, res) => {
  const { orderNumber, material, batch } = req.body;

  try {
    const paddedOrderNumber = orderNumber ? orderNumber.padStart(12, '0') : '';
    const paddedMaterial = material ? material.padStart(18, '0') : '';

    const result = await executeQuery(`EXEC [dbo].[Sp_Rep_MaterialAgeing] @ORDER_NUMBER, @MATERIAL, @BATCH`, [
      {
        name: 'ORDER_NUMBER',
        type: sql.NVarChar(50),
        value: paddedOrderNumber,
      },
      { name: 'MATERIAL', type: sql.NVarChar(50), value: paddedMaterial },
      { name: 'BATCH', type: sql.NVarChar(50), value: batch || '' },
    ]);

    res.json(result);
  } catch (error) {
    console.error('Error in getMaterialAgeingReport:', error);
    res.status(500).json({ error: 'Failed to retrieve material ageing report' });
  }
};
