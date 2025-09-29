import { executeQuery } from '../../config/db.js';
import { sql } from '../../config/db.js';

// export const getLocationQtyDetails = async (req, res) => {
//     const { Location } = req.body;
// console.log(req.body)
//     try {
//         const result = await executeQuery(
//             `EXEC [dbo].[Sp_RepLocationQtyDetails] @Location`,
//             [{ name: 'Location', type: sql.NVarChar(255), value: Location }]
//         );
//         res.json(result);
//     } catch (error) {
//         console.error("Error fetching location quantity details:", error);
//         res.status(500).json({ error: "Failed to execute stored procedure" });
//     }
// };

export const getLocationQtyDetails = async (req, res) => {
  const { Location } = req.body;

  try {
    // Execute the stored procedure to get the data
    const result = await executeQuery(`EXEC [dbo].[Sp_RepLocationQtyDetails] @Location`, [
      { name: 'Location', type: sql.NVarChar(255), value: Location },
    ]);

    // Initialize variables for the desired metrics
    let distinctOrderCount = 0;
    let serialNoCount = 0;
    let distinctPalletBarcodeCount = 0;
    let totalPrintQty = 0;

    // Assuming `result` is an array of rows returned from the stored procedure
    if (result && result.length > 0) {
      // Set to track distinct `ORDER_NUMBER` and `PalletBarcode`
      const distinctOrders = new Set();
      const distinctPalletBarcodes = new Set();

      // Iterate over the result and compute the required values
      result.forEach(row => {
        // Count of distinct `ORDER_NUMBER`
        distinctOrders.add(row.ORDER_NUMBER);

        // Count of `SerialNo`
        if (row.SerialNo) {
          serialNoCount += 1;
        }

        // Count of distinct `PalletBarcode`
        if (row.PalletBarcode) {
          distinctPalletBarcodes.add(row.PalletBarcode);
        }

        // Sum of `PrintQty`
        if (row.PrintQty) {
          totalPrintQty += row.PrintQty;
        }
      });

      // Final counts
      distinctOrderCount = distinctOrders.size;
      distinctPalletBarcodeCount = distinctPalletBarcodes.size;
    }

    // Send the result back with the desired metrics and the original data
    res.json({
      distinctOrderCount,
      serialNoCount,
      distinctPalletBarcodeCount,
      totalPrintQty,
      data: result, // Original data from the stored procedure
    });
  } catch (error) {
    console.error('Error fetching location quantity details:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};
