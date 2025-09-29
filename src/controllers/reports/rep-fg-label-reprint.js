import { executeQuery, sql } from '../../config/db.js';

export const getRePrintFGLabelDetails = async (req, res) => {
  const { ORDER_NUMBER, MATERIAL, MATERIAL_TEXT, BATCH, Line, Tank, Shift, FromDate, ToDate } = req.body;

  try {
    const result = await executeQuery(
      `EXEC [dbo].[Sp_Rep_RePrint_FGLabelDetails] 
                @ORDER_NUMBER, 
                @MATERIAL, 
                @MATERIAL_TEXT, 
                @BATCH,
                @Line,
                @Tank,
                @Shift,
                @FromDate, 
                @ToDate`,
      [
        { name: 'ORDER_NUMBER', type: sql.NVarChar(150), value: ORDER_NUMBER },
        { name: 'MATERIAL', type: sql.NVarChar(150), value: MATERIAL },
        {
          name: 'MATERIAL_TEXT',
          type: sql.NVarChar(250),
          value: MATERIAL_TEXT,
        },
        { name: 'BATCH', type: sql.NVarChar(150), value: BATCH },
        { name: 'Line', type: sql.NVarChar(100), value: Line },
        { name: 'Tank', type: sql.NVarChar(100), value: Tank },
        { name: 'Shift', type: sql.NVarChar(100), value: Shift },
        { name: 'FromDate', type: sql.NVarChar(10), value: FromDate },
        { name: 'ToDate', type: sql.NVarChar(10), value: ToDate },
      ]
    );
    res.json(result);
  } catch (error) {
    console.error('Error executing stored procedure:', error);
    res.status(500).json({ error: 'Failed to retrieve FG Label details' });
  }
};
