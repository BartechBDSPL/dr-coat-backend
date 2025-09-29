import { executeQuery, sql } from '../../config/db.js';

export const getFGLabelSerialNoInfo = async (req, res) => {
  const { PalletBarcode } = req.body;

  try {
    const result = await executeQuery(`EXEC [dbo].[Sp_FGLabelSerialNoInfo] @PalletBarcode`, [
      { name: 'PalletBarcode', type: sql.NVarChar(50), value: PalletBarcode },
    ]);
    res.json(result);
  } catch (error) {
    console.error('Error fetching FG Label Serial No Info:', error);
    res.status(500).json({ error: error.message });
  }
};
