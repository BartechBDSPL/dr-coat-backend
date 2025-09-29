import { executeQuery, sql } from '../../config/db.js';

export const dashboardDetails = async (req, res) => {
  const { FromDate, ToDate } = req.body;

  try {
    const result = await executeQuery(`EXEC [dbo].[Sp_DashboardDetails] @FromDate, @ToDate`, {
      FromDate: { type: sql.NVarChar(10), value: FromDate },
      ToDate: { type: sql.NVarChar(10), value: ToDate },
    });

    res.status(200).json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};
