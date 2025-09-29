import { executeQuery, sql } from '../../config/db.js';

export const getGRDetails = async (req, res) => {
  const { ORDER_NUMBER, MATERIAL, MATERIAL_TEXT, BATCH, GRStatus, FromDate, Line, Tank, ToDate } = req.body;

  try {
    const result = await executeQuery(
      `EXEC [dbo].[Sp_Rep_GRDetails] @ORDER_NUMBER, @MATERIAL, @MATERIAL_TEXT, @BATCH, @GRStatus,@Line,@Tank, @FromDate, @ToDate`,
      [
        { name: 'ORDER_NUMBER', type: sql.NVarChar(150), value: ORDER_NUMBER },
        { name: 'MATERIAL', type: sql.NVarChar(150), value: MATERIAL },
        {
          name: 'MATERIAL_TEXT',
          type: sql.NVarChar(250),
          value: MATERIAL_TEXT,
        },
        { name: 'BATCH', type: sql.NVarChar(150), value: BATCH },
        { name: 'GRStatus', type: sql.NVarChar(3), value: GRStatus },
        { name: 'Line', type: sql.NVarChar(100), value: Line },
        { name: 'Tank', type: sql.NVarChar(100), value: Tank },
        { name: 'FromDate', type: sql.NVarChar(10), value: FromDate },
        { name: 'ToDate', type: sql.NVarChar(10), value: ToDate },
      ]
    );
    res.json(result);
  } catch (error) {
    console.error('Error fetching GR details:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const getSummaryReportTillQC = async (req, res) => {
  const { ShiftDate } = req.body;

  try {
    const result = await executeQuery(`EXEC [dbo].[Sp_SummaryReport_TillQC] @ShiftDate`, [
      { name: 'ShiftDate', type: sql.Date, value: ShiftDate },
    ]);
    res.json(result);
  } catch (error) {
    console.error('Error fetching Summary Report Till QC:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};
