import { executeQuery, sql } from '../../config/db.js';

export const insertPalletMaster = async (req, res) => {
  const { PalletBarcode, Qty, Height, Width, CreatedBy } = req.body;

  try {
    const result = await executeQuery(
      'EXEC [dbo].[Sp_PalletMaster_Insert] @PalletBarcode, @Qty, @Height, @Width, @CreatedBy ',
      [
        {
          name: 'PalletBarcode',
          type: sql.NVarChar(100),
          value: PalletBarcode,
        },
        { name: 'Qty', type: sql.Decimal(18, 3), value: Qty },
        { name: 'Height', type: sql.Decimal(18, 3), value: Height },
        { name: 'Width', type: sql.Decimal(18, 3), value: Width },
        { name: 'CreatedBy', type: sql.NVarChar(100), value: CreatedBy },
      ]
    );

    res.json(result);
  } catch (error) {
    console.error('Error executing Invalid Barcode Scan, Material Pending for Put Away..!stored procedure:', error);
    res.status(500).json({ error: error.message });
  }
};

export const updatePalletMaster = async (req, res) => {
  const { PalletBarcode, Qty, Height, Width, UpdatedBy } = req.body;

  try {
    const result = await executeQuery(
      'EXEC [dbo].[Sp_PalletMaster_Update] @PalletBarcode, @Qty, @Height, @Width, @UpdatedBy',
      [
        {
          name: 'PalletBarcode',
          type: sql.NVarChar(100),
          value: PalletBarcode,
        },
        { name: 'Qty', type: sql.Decimal(18, 3), value: Qty },
        { name: 'Height', type: sql.Decimal(18, 3), value: Height },
        { name: 'Width', type: sql.Decimal(18, 3), value: Width },
        { name: 'UpdatedBy', type: sql.NVarChar(100), value: UpdatedBy },
      ]
    );

    res.json(result);
  } catch (error) {
    console.error('Error executing stored procedure:', error);
    res.status(500).json({ error: error.message });
  }
};

export const checkPalletBarcode = async (req, res) => {
  const { PalletBarcode } = req.body;

  try {
    // Execute the stored procedure with parameters
    const result = await executeQuery('EXEC [dbo].[Sp_CheckPalletBarcode] @PalletBarcode', [
      { name: 'PalletBarcode', type: sql.NVarChar(100), value: PalletBarcode },
    ]);

    // Check if result contains data and send it back to the client
    if (result.length > 0) {
      res.json(result[0]); // Return the first object from the result
    } else {
      res.json({ message: 'No data returned from the stored procedure.' });
    }
  } catch (error) {
    console.error('Error executing stored procedure:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getAllPalletMasterDetails = async (req, res) => {
  try {
    const result = await executeQuery('EXEC [dbo].[Sp_PalletMaster_GetAllDetails]');

    res.json(result);
  } catch (error) {
    console.error('Error executing stored procedure:', error);
    res.status(500).json({ error: error.message });
  }
};
