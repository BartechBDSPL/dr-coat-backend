import { executeQuery, sql } from '../../config/db.js';

export const getFGLabelBarcodeInfo = async (req, res) => {
  const { FromDate, ToDate, ORDERNO, User, MATERIAL, BATCH, LINE, TANK, Shift } = req.body;

  try {
    const paddedORDERNO = ORDERNO ? ORDERNO.padStart(12, '0') : '';
    const paddedMATERIAL = MATERIAL ? MATERIAL.padStart(18, '0') : '';

    const result = await executeQuery(
      `EXEC [dbo].[Sp_GetFGLabelBarcodeInfo] @FromDate, @ToDate, @ORDERNO, @User, @MATERIAL, @BATCH, @LINE, @TANK, @Shift`,
      [
        { name: 'FromDate', type: sql.NVarChar(50), value: FromDate },
        { name: 'ToDate', type: sql.NVarChar(50), value: ToDate },
        { name: 'ORDERNO', type: sql.NVarChar(50), value: paddedORDERNO },
        { name: 'User', type: sql.NVarChar(50), value: User || '' },
        { name: 'MATERIAL', type: sql.NVarChar(50), value: paddedMATERIAL },
        { name: 'BATCH', type: sql.NVarChar(50), value: BATCH || '' },
        { name: 'LINE', type: sql.NVarChar(50), value: LINE || '' },
        { name: 'TANK', type: sql.NVarChar(50), value: TANK || '' },
        { name: 'Shift', type: sql.NVarChar(50), value: Shift || '' },
      ]
    );

    res.json(result);
  } catch (error) {
    console.error('Error fetching FG label barcode info:', error);
    res.status(500).json({ error: error.message });
  }
};
