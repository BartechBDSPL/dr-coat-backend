import { executeQuery, sql } from '../../config/db.js';

export const getMaterialWiseStock = async (req, res) => {
  const { FromDate, ToDate, MATERIAL, BATCH } = req.body;
  try {
    const result = await executeQuery('EXEC Sp_Rep_MaterialWiseStock @FromDate, @ToDate, @MATERIAL, @BATCH', [
      { name: 'FromDate', type: sql.NVarChar, value: FromDate },
      { name: 'ToDate', type: sql.NVarChar, value: ToDate },
      {
        name: 'MATERIAL',
        type: sql.NVarChar(50),
        value: MATERIAL ? MATERIAL.padStart(18, ' ') : '',
      },
      { name: 'BATCH', type: sql.NVarChar(50), value: BATCH },
    ]);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      Status: 'F',
      Message: error.message,
    });
  }
};

export const getLiveStock = async (req, res) => {
  try {
    const result = await executeQuery('EXEC Sp_Rep_LiveStock', []);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      Status: 'F',
      Message: error.message,
    });
  }
};
