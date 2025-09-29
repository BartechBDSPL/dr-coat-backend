import { executeQuery, sql } from '../../config/db.js';

export const getResortingPickingDetails = async (req, res) => {
  const { FromDate, ToDate, OrderNo, Batch, Material, MaterialText } = req.body;

  try {
    const paddedOrderNumber = OrderNo ? OrderNo.padStart(12, '0') : '';
    const paddedMaterial = Material ? Material.padStart(18, '0') : '';

    const result = await executeQuery(
      `EXEC [dbo].[Sp_Rep_ResortingPicking] @FromDate, @ToDate, @OrderNo, @Batch, @Material, @MaterialText`,
      [
        { name: 'FromDate', type: sql.NVarChar(50), value: FromDate },
        { name: 'ToDate', type: sql.NVarChar(50), value: ToDate },
        { name: 'OrderNo', type: sql.NVarChar(50), value: paddedOrderNumber },
        { name: 'Batch', type: sql.NVarChar(50), value: Batch },
        { name: 'Material', type: sql.NVarChar(50), value: paddedMaterial },
        { name: 'MaterialText', type: sql.NVarChar(50), value: MaterialText },
      ]
    );

    res.json(result);
  } catch (error) {
    console.error('Error fetching Resorting Picking details:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};
