import { executeQuery, sql } from '../../config/db.js';

export const getLocationMaterialBatchWiseStock = async (req, res) => {
  const { Material, Batch, Location } = req.body;

  try {
    const result = await executeQuery(
      `EXEC [dbo].[Sp_Rep_Location_Material_Batch_WiseStock] 
                @Material, @Batch, @Location`,
      [
        { name: 'Material', type: sql.NVarChar(50), value: Material || '' },
        { name: 'Batch', type: sql.NVarChar(50), value: Batch || '' },
        { name: 'Location', type: sql.NVarChar(50), value: Location || '' },
      ]
    );
    res.json(result);
  } catch (error) {
    console.error('Error fetching batch-wise stock:', error);
    res.status(500).json({ error: 'Failed to fetch batch-wise stock data' });
  }
};
