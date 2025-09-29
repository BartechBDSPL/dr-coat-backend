import { executeQuery, sql } from '../../config/db.js';

export const getRemovedBoxes = async (req, res) => {
  const { OrderNo, Material, Batch, FromDate, ToDate } = req.body;

  try {
    const result = await executeQuery(
      `EXEC [dbo].[Sp_Rep_FGPalletSplit_RemovedBoxes] @OrderNo, @Material, @Batch, @FromDate, @ToDate`,
      [
        { name: 'OrderNo', type: sql.NVarChar(50), value: OrderNo },
        { name: 'Material', type: sql.NVarChar(50), value: Material },
        { name: 'Batch', type: sql.NVarChar(50), value: Batch },
        { name: 'FromDate', type: sql.NVarChar(10), value: FromDate },
        { name: 'ToDate', type: sql.NVarChar(10), value: ToDate },
      ]
    );

    res.json(result);
  } catch (error) {
    console.error('Error fetching removed boxes:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const getPalletSplitLog = async (req, res) => {
  const { OrderNo, Material, Batch, FromDate, ToDate } = req.body;

  try {
    const result = await executeQuery(
      `EXEC [dbo].[Sp_Rep_FGPalletSplit_Log] @OrderNo, @Material, @Batch, @FromDate, @ToDate`,
      [
        { name: 'OrderNo', type: sql.NVarChar(50), value: OrderNo },
        { name: 'Material', type: sql.NVarChar(50), value: Material },
        { name: 'Batch', type: sql.NVarChar(50), value: Batch },
        { name: 'FromDate', type: sql.NVarChar(10), value: FromDate },
        { name: 'ToDate', type: sql.NVarChar(10), value: ToDate },
      ]
    );

    res.json(result);
  } catch (error) {
    console.error('Error fetching pallet split log:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};
