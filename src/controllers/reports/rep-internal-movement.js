import { executeQuery, sql } from '../../config/db.js';

export const getInternalMovementDetails = async (req, res) => {
  const { OrderNo, Material, Batch, FromDate, ToDate } = req.body;
  try {
    const paddedOrderNumber = OrderNo ? OrderNo.padStart(12, '0') : '';
    const paddedMaterial = Material ? Material.padStart(18, '0') : '';

    const result = await executeQuery(
      `EXEC [dbo].[Sp_Rep_InternalTransfer] @OrderNo, @Material, @Batch, @FromDate, @ToDate`,
      [
        { name: 'OrderNo', type: sql.NVarChar(50), value: paddedOrderNumber },
        { name: 'Material', type: sql.NVarChar(50), value: paddedMaterial },
        { name: 'Batch', type: sql.NVarChar(50), value: Batch },
        { name: 'FromDate', type: sql.NVarChar(10), value: FromDate },
        { name: 'ToDate', type: sql.NVarChar(10), value: ToDate },
      ]
    );

    res.json(result);
  } catch (error) {
    console.error('Error fetching Internal Movement details:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};
