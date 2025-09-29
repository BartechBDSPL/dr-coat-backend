import { executeQuery, sql } from '../../config/db.js';

export const getStockTakeNo = async (req, res) => {
  const { StockType } = req.body;

  const params = [{ name: 'StockType', type: sql.NVarChar(50), value: StockType }];

  try {
    const result = await executeQuery(`EXEC [dbo].[HHT_StockTakeNo_Get] @StockType`, params);
    res.json(result[0]);
  } catch (error) {
    console.error('Error fetching stock take number:', error);
    res.status(500).json({ error: 'Failed to fetch stock take number' });
  }
};

export const validateStockTakePallet = async (req, res) => {
  const { ScanBarcode, StockNo } = req.body;

  const params = [
    { name: 'ScanBarcode', type: sql.NVarChar(100), value: ScanBarcode },
    { name: 'StockNo', type: sql.NVarChar(50), value: StockNo },
  ];

  try {
    const result = await executeQuery(`EXEC [dbo].[HHT_StockTake_PalletValidate] @ScanBarcode, @StockNo`, params);

    res.json(result[0]);
  } catch (error) {
    console.error('Error validating stock take pallet:', error);
    res.status(500).json({ error: 'Failed to validate stock take pallet' });
  }
};

export const updateStockTakeBarcode = async (req, res) => {
  const {
    Barcode,
    StockTakeNo,
    ORDER_NUMBER,
    MATERIAL,
    MATERIAL_TEXT,
    BATCH,
    STORAGE_LOCATION,
    Location,
    SystemStock,
    PhysicalStock,
    CreatedBy,
  } = req.body;

  const params = [
    { name: 'Barcode', type: sql.NVarChar(70), value: Barcode },
    { name: 'StockTakeNo', type: sql.NVarChar(70), value: StockTakeNo },
    { name: 'ORDER_NUMBER', type: sql.NVarChar(50), value: ORDER_NUMBER },
    { name: 'MATERIAL', type: sql.NVarChar(50), value: MATERIAL },
    { name: 'MATERIAL_TEXT', type: sql.NVarChar(255), value: MATERIAL_TEXT },
    { name: 'BATCH', type: sql.Decimal(18, 3), value: BATCH },
    {
      name: 'STORAGE_LOCATION',
      type: sql.NVarChar(50),
      value: STORAGE_LOCATION,
    },
    { name: 'Location', type: sql.NVarChar(50), value: Location },
    { name: 'SystemStock', type: sql.Decimal(18, 3), value: SystemStock },
    { name: 'PhysicalStock', type: sql.Decimal(18, 3), value: PhysicalStock },
    { name: 'CreatedBy', type: sql.NVarChar(50), value: CreatedBy },
  ];

  try {
    const result = await executeQuery(
      `EXEC [dbo].[HHT_StockTake_BarcodeUpdate] 
            @Barcode, @StockTakeNo, @ORDER_NUMBER, @MATERIAL, @MATERIAL_TEXT, 
            @BATCH, @STORAGE_LOCATION, @Location, @SystemStock, @PhysicalStock, @CreatedBy`,
      params
    );

    res.json(result[0]);
  } catch (error) {
    console.error('Error updating stock take barcode:', error);
    res.status(500).json({ error: 'Failed to update stock take barcode' });
  }
};

export const getRecentStockTakeDetails = async (req, res) => {
  const { StockNo } = req.body;

  const params = [{ name: 'StockNo', type: sql.NVarChar(50), value: StockNo }];

  try {
    const result = await executeQuery(`EXEC [dbo].[HHT_StockTake_RecentDetails] @StockNo`, params);

    res.json(result);
  } catch (error) {
    console.error('Error fetching recent stock take details:', error);
    res.status(500).json({ error: 'Failed to fetch recent stock take details' });
  }
};
