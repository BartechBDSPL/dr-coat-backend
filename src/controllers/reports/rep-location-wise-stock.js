import { executeQuery, sql } from '../../config/db.js';

export const getLocationWiseStock = async (req, res) => {
  try {
    const { FromDate, ToDate, Location, MATERIAL } = req.body;

    const result = await executeQuery('EXEC Sp_Rep_LocationWiseStock @FromDate, @ToDate, @Location, @MATERIAL', [
      { name: 'FromDate', type: sql.NVarChar(10), value: FromDate },
      { name: 'ToDate', type: sql.NVarChar(10), value: ToDate },
      { name: 'Location', type: sql.NVarChar(50), value: Location || '' },
      { name: 'MATERIAL', type: sql.NVarChar(50), value: MATERIAL || '' },
    ]);

    res.json(result);
  } catch (error) {
    res.status(500).json({
      Status: 'F',
      Message: error.message,
    });
  }
};
