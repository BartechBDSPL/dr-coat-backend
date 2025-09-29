import { executeQuery, sql } from '../../config/db.js';

export const getPalletMergeReport = async (req, res) => {
  const { FromDate, ToDate } = req.body;

  try {
    const result = await executeQuery(
      `EXEC [dbo].[Sp_Rep_PalletMerge] 
             @FromDate, 
             @ToDate`,
      [
        { name: 'FromDate', type: sql.NVarChar(10), value: FromDate },
        { name: 'ToDate', type: sql.NVarChar(10), value: ToDate },
      ]
    );
    res.json(result);
  } catch (error) {
    console.error('Error fetching pallet merge report:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};
