import { executeQuery, sql } from '../../config/db.js';

export const getExcessProductionOrderDetails = async (req, res) => {
  const { ORDER_NUMBER, MATERIAL, Line, FromDate, ToDate } = req.body;

  try {
    // Padding similar to other reports
    const paddedOrderNumber = ORDER_NUMBER ? ORDER_NUMBER.padStart(12, '0') : '';
    const paddedMaterial = MATERIAL ? MATERIAL.padStart(18, '0') : '';

    const result = await executeQuery(
      `EXEC [dbo].[Sp_Rep_ExcessProductionOrder] @ORDER_NUMBER, @MATERIAL, @Line, @FromDate, @ToDate`,
      [
        {
          name: 'ORDER_NUMBER',
          type: sql.NVarChar(150),
          value: paddedOrderNumber,
        },
        { name: 'MATERIAL', type: sql.NVarChar(150), value: paddedMaterial },
        { name: 'Line', type: sql.NVarChar(10), value: Line },
        { name: 'FromDate', type: sql.NVarChar(10), value: FromDate },
        { name: 'ToDate', type: sql.NVarChar(10), value: ToDate },
      ]
    );

    res.json(result);
  } catch (error) {
    console.error('Error fetching Excess Production Order details:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};
