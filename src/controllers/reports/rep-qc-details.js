import { executeQuery, sql } from '../../config/db.js';

export const getQCDetails = async (req, res) => {
  const { ORDER_NUMBER, MATERIAL, BATCH, QCStatus, FromDate, ToDate } = req.body;

  try {
    const result = await executeQuery(
      `EXEC [dbo].[Sp_Rep_QCDetails] @ORDER_NUMBER, @MATERIAL, @BATCH, @QCStatus, @FromDate, @ToDate`,
      [
        { name: 'ORDER_NUMBER', type: sql.NVarChar(150), value: ORDER_NUMBER },
        { name: 'MATERIAL', type: sql.NVarChar(150), value: MATERIAL },
        { name: 'BATCH', type: sql.NVarChar(150), value: BATCH },
        { name: 'QCStatus', type: sql.NVarChar(3), value: QCStatus },
        { name: 'FromDate', type: sql.NVarChar(10), value: FromDate },
        { name: 'ToDate', type: sql.NVarChar(10), value: ToDate },
      ]
    );
    res.json(result);
  } catch (error) {
    console.error('Error fetching QC details:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};
