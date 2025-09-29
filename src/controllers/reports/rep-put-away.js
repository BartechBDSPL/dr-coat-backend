import { executeQuery, sql } from '../../config/db.js';

export const putAwayDetails = async (req, res) => {
  const { OrderNo, Batch, Material, FromDate, ToDate } = req.body;

  try {
    const result = await executeQuery(`EXEC [dbo].[Sp_Rep_PutAway] @OrderNo, @Batch, @Material, @FromDate, @ToDate`, [
      { name: 'OrderNo', type: sql.NVarChar(50), value: OrderNo },
      { name: 'Batch', type: sql.NVarChar(50), value: Batch },
      { name: 'Material', type: sql.NVarChar(50), value: Material },
      { name: 'FromDate', type: sql.NVarChar(10), value: FromDate },
      { name: 'ToDate', type: sql.NVarChar(10), value: ToDate },
    ]);

    res.json(result);
  } catch (error) {
    console.error('Error fetching Put Away Info:', error);
    res.status(500).json({ error: error.message });
  }
};
