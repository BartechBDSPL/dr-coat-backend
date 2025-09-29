import { executeQuery, sql } from '../../config/db.js';

export const getMaterialReceiptReport = async (req, res) => {
  const { FromDate, ToDate, Material, MaterialText, Batch, FromStorageLocation, ToStorageLocation } = req.body;
  try {
    const result = await executeQuery(
      'EXEC Sp_Rep_MaterialReceipt @FromDate, @ToDate, @Material, @MaterialText, @Batch, @FromStorageLocation, @ToStorageLocation',
      [
        { name: 'FromDate', type: sql.NVarChar, value: FromDate },
        { name: 'ToDate', type: sql.NVarChar, value: ToDate },
        { name: 'Material', type: sql.NVarChar(50), value: Material },
        { name: 'MaterialText', type: sql.NVarChar(50), value: MaterialText },
        { name: 'Batch', type: sql.NVarChar(50), value: Batch },
        {
          name: 'FromStorageLocation',
          type: sql.NVarChar(50),
          value: FromStorageLocation,
        },
        {
          name: 'ToStorageLocation',
          type: sql.NVarChar(50),
          value: ToStorageLocation,
        },
      ]
    );
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      Status: 'F',
      Message: error.message,
    });
  }
};
