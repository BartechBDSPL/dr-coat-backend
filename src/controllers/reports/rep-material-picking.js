import { executeQuery, sql } from '../../config/db.js';

export const getFGMaterialPickingDetails = async (req, res) => {
  const { FromDate, ToDate, OrderNo, Material, MaterialText } = req.body;

  try {
    const paddedOrderNumber = OrderNo ? OrderNo.padStart(12, '0') : '';
    const paddedMaterial = Material ? Material.padStart(18, '0') : '';

    const result = await executeQuery(
      `EXEC [dbo].[Sp_Rep_FGMaterialPicking] @FromDate, @ToDate, @OrderNo, @Material, @MaterialText`,
      [
        { name: 'FromDate', type: sql.NVarChar(50), value: FromDate },
        { name: 'ToDate', type: sql.NVarChar(50), value: ToDate },
        { name: 'OrderNo', type: sql.NVarChar(50), value: paddedOrderNumber },
        { name: 'Material', type: sql.NVarChar(50), value: paddedMaterial },
        { name: 'MaterialText', type: sql.NVarChar(50), value: MaterialText },
      ]
    );

    res.json(result);
  } catch (error) {
    console.error('Error fetching FG Material Picking details:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};
