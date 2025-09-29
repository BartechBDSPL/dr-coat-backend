import { executeQuery, sql } from '../../config/db.js';

export const getInwardDetails = async (req, res) => {
  const { ORDER_NUMBER, MATERIAL, MATERIAL_TEXT, BATCH, InwardStatus, FromDate, ToDate } = req.body;

  try {
    const paddedOrderNumber = ORDER_NUMBER ? ORDER_NUMBER.padStart(12, '0') : null;
    const paddedMaterial = MATERIAL ? MATERIAL.padStart(18, '0') : null;

    const result = await executeQuery(
      `EXEC [dbo].[Sp_Rep_InwardDetails] @ORDER_NUMBER, @MATERIAL, @MATERIAL_TEXT, @BATCH, @InwardStatus, @FromDate, @ToDate`,
      [
        {
          name: 'ORDER_NUMBER',
          type: sql.NVarChar(150),
          value: paddedOrderNumber,
        },
        { name: 'MATERIAL', type: sql.NVarChar(150), value: paddedMaterial },
        {
          name: 'MATERIAL_TEXT',
          type: sql.NVarChar(250),
          value: MATERIAL_TEXT,
        },
        { name: 'BATCH', type: sql.NVarChar(150), value: BATCH },
        { name: 'InwardStatus', type: sql.NVarChar(3), value: InwardStatus },
        { name: 'FromDate', type: sql.NVarChar(10), value: FromDate },
        { name: 'ToDate', type: sql.NVarChar(10), value: ToDate },
      ]
    );
    res.json(result);
  } catch (error) {
    console.error('Error fetching Inward details:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};
