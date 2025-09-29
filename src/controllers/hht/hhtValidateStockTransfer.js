import { executeQuery, sql } from '../../config/db.js';

export const validateTripNo = async (req, res) => {
  try {
    const { TripNo } = req.body;
    const result = await executeQuery(`EXEC [dbo].[HHT_MaterialReceipt_TripNoValidate] @TripNo`, [
      { name: 'TripNo', type: sql.NVarChar, value: TripNo },
    ]);
    res.json(result.length == 0 ? [{ Status: 'F', Message: 'Picking Done for this Challan Number' }] : result);
  } catch (error) {
    console.error('Error validating trip number:', error);
    res.status(500).json({
      error: 'Failed to execute stored procedure',
      details: error.message,
    });
  }
};

export const updateTripNo = async (req, res) => {
  try {
    const { PalletBarcode, TripNo, ReceiptBy } = req.body;
    const result = await executeQuery(
      `EXEC [dbo].[HHT_MaterialReceipt_UpdateTripNo] @TripNo, @PalletBarcode, @ReceiptBy`,
      [
        { name: 'TripNo', type: sql.NVarChar, value: TripNo },
        { name: 'PalletBarcode', type: sql.NVarChar, value: PalletBarcode },
        { name: 'ReceiptBy', type: sql.NVarChar, value: ReceiptBy },
      ]
    );
    res.json(result[0]);
  } catch (error) {
    console.error('Error updating trip number:', error);
    res.status(500).json({
      error: 'Failed to execute stored procedure',
      details: error.message,
    });
  }
};
