import { executeQuery, sql } from '../../config/db.js';

export const getTripWarehouseDetails = async (req, res) => {
  try {
    const result = await executeQuery(`EXEC [dbo].[Sp_TripDetails_WHDetails]`, []);
    res.json(result);
  } catch (error) {
    console.error('Error fetching warehouse details:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const getTripTransporterDetails = async (req, res) => {
  try {
    const result = await executeQuery(`EXEC [dbo].[Sp_TripDetails_TransporterDetail]`, []);
    res.json(result);
  } catch (error) {
    console.error('Error fetching transporter details:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const getTripMaterials = async (req, res) => {
  const { STORAGE_LOCATION } = req.body;

  try {
    const result = await executeQuery(`EXEC [dbo].[Sp_TripDetails_Material] @STORAGE_LOCATION`, [
      {
        name: 'STORAGE_LOCATION',
        type: sql.NVarChar,
        value: STORAGE_LOCATION,
      },
    ]);
    res.json(result);
  } catch (error) {
    console.error('Error fetching trip materials:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const getTripBatches = async (req, res) => {
  const { MATERIAL, STORAGE_LOCATION } = req.body;

  try {
    const result = await executeQuery(`EXEC [dbo].[Sp_TripDetails_Batch] @MATERIAL, @STORAGE_LOCATION`, [
      { name: 'MATERIAL', type: sql.NVarChar, value: MATERIAL },
      {
        name: 'STORAGE_LOCATION',
        type: sql.NVarChar,
        value: STORAGE_LOCATION,
      },
    ]);
    res.json(result);
  } catch (error) {
    console.error('Error fetching trip batches:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const getTripTotalQty = async (req, res) => {
  const { MATERIAL, BATCH, STORAGE_LOCATION } = req.body;

  try {
    const result = await executeQuery(`EXEC [dbo].[Sp_TripDetails_TotalQty] @MATERIAL, @BATCH, @STORAGE_LOCATION`, [
      { name: 'MATERIAL', type: sql.NVarChar, value: MATERIAL },
      { name: 'BATCH', type: sql.NVarChar, value: BATCH },
      {
        name: 'STORAGE_LOCATION',
        type: sql.NVarChar,
        value: STORAGE_LOCATION,
      },
    ]);
    res.json(result);
  } catch (error) {
    console.error('Error fetching total quantity:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const getTripPalZpe = async (req, res) => {
  const { ORDER_NUMBER, MATERIAL } = req.body;

  try {
    const result = await executeQuery(`EXEC [dbo].[Sp_TripDetails_GetPalZpe] @ORDER_NUMBER, @MATERIAL`, [
      { name: 'ORDER_NUMBER', type: sql.NVarChar, value: ORDER_NUMBER },
      { name: 'MATERIAL', type: sql.NVarChar, value: MATERIAL },
    ]);
    res.json(result);
  } catch (error) {
    console.error('Error fetching pallet details:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const getPallet = async (req, res) => {
  const { ORDER_NUMBER, MATERIAL } = req.body;

  try {
    const result = await executeQuery(`EXEC [dbo].[Sp_TripDetails_GetPalZpe] @ORDER_NUMBER, @MATERIAL`, [
      { name: 'ORDER_NUMBER', type: sql.NVarChar, value: ORDER_NUMBER },
      { name: 'MATERIAL', type: sql.NVarChar, value: MATERIAL },
    ]);
    res.json(result);
  } catch (error) {
    console.error('Error fetching pallet details:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const getPalletBarcodes = async (req, res) => {
  try {
    const { MATERIAL, BATCH, Qty, Location } = req.body;
    const result = await executeQuery(
      `EXEC [dbo].[Sp_TripDetails_GetPalletBarcodes] @MATERIAL, @BATCH, @Qty, @Location`,
      [
        { name: 'MATERIAL', type: sql.NVarChar, value: MATERIAL },
        { name: 'BATCH', type: sql.NVarChar, value: BATCH },
        { name: 'Qty', type: sql.Int, value: Qty },
        { name: 'Location', type: sql.NVarChar, value: Location },
      ]
    );
    res.json(result);
  } catch (error) {
    console.error('Error fetching pallet barcodes:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const getPendingTripOrders = async (req, res) => {
  try {
    const result = await executeQuery(`EXEC [dbo].[HHT_TripDetails_PendingOrders]`, []);
    res.json(result);
  } catch (error) {
    console.error('Error fetching pending trip orders:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const getTripNoData = async (req, res) => {
  try {
    const { OrderNo } = req.body;

    const result = await executeQuery(`EXEC [dbo].[HHT_TripDetails_TripNoData] @OrderNo`, [
      { name: 'OrderNo', type: sql.NVarChar, value: OrderNo },
    ]);

    res.json(result);
  } catch (error) {
    console.error('Error fetching trip details:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
  ṇ;
};

export const generateTripSrNo = async (req, res) => {
  try {
    const result = await executeQuery(`EXEC [dbo].[Sp_TripDetails_GenerateSrNo]`, []);

    res.json(result[0]);
  } catch (error) {
    console.error('Error generating TripNo:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const insertTripDetails = async (req, res) => {
  try {
    const tripResult = await executeQuery(`EXEC [dbo].[Sp_TripDetails_GenerateSrNo]`, []);

    const newTripNo = tripResult[0].TripNo;

    const {
      WarehouseName,
      WarehouseAddress,
      LRNumber,
      VehicleNo,
      TransporterName,
      TransporterGSTINNo,
      FromWarehouseName,
      FromWarehouseAddress,
      CreatedBy,
    } = req.body;

    const { Material, Material_Desc, Batch, Qty, TotalBox, TotalPallet, PalletNumber } = req.body;

    const materials = Material.split('$');
    const materialDescs = Material_Desc.split('$');
    const batches = Batch.split('$');
    const qtys = Qty.split('$');
    const totalBoxes = TotalBox.split('$');
    const totalPallets = TotalPallet.split('$');
    const palletNumbers = PalletNumber.split('$');

    let results = [];

    const dataLength = materials.length;
    for (let i = 0; i < dataLength; i++) {
      if (!materials[i].trim()) continue;

      const result = await executeQuery(
        `EXEC [dbo].[Sp_TripDetailsInsert] 
                    @TripNo, @WarehouseName, @WarehouseAddress, @LRNumber, 
                    @VehicleNo, @TransporterName, @TransporterGSTINNo, 
                    @Material, @Material_Desc, @Batch, @Qty, @TotalBox, 
                    @TotalPallet, @FromWarehouseName, @FromWarehouseAddress, @CreaatedBy`,
        [
          { name: 'TripNo', type: sql.NVarChar, value: newTripNo },
          {
            name: 'WarehouseName',
            type: sql.NVarChar(70),
            value: WarehouseName,
          },
          {
            name: 'WarehouseAddress',
            type: sql.NVarChar(sql.MAX),
            value: WarehouseAddress,
          },
          { name: 'LRNumber', type: sql.NVarChar(100), value: LRNumber },
          { name: 'VehicleNo', type: sql.NVarChar(50), value: VehicleNo },
          {
            name: 'TransporterName',
            type: sql.NVarChar(100),
            value: TransporterName,
          },
          {
            name: 'TransporterGSTINNo',
            type: sql.NVarChar(20),
            value: TransporterGSTINNo,
          },
          {
            name: 'Material',
            type: sql.NVarChar(50),
            value: materials[i] || '',
          },
          {
            name: 'Material_Desc',
            type: sql.NVarChar(255),
            value: materialDescs[i] || '',
          },
          { name: 'Batch', type: sql.NVarChar(50), value: batches[i] || '' },
          {
            name: 'Qty',
            type: sql.Decimal(18, 3),
            value: parseFloat(qtys[i]) || 0,
          },
          {
            name: 'TotalBox',
            type: sql.Int,
            value: parseInt(totalBoxes[i]) || 0,
          },
          {
            name: 'TotalPallet',
            type: sql.Int,
            value: parseInt(totalPallets[i]) || 0,
          },
          {
            name: 'FromWarehouseName',
            type: sql.NVarChar(50),
            value: FromWarehouseName,
          },
          {
            name: 'FromWarehouseAddress',
            type: sql.NVarChar(sql.MAX),
            value: FromWarehouseAddress,
          },
          { name: 'CreaatedBy', type: sql.NVarChar(50), value: req.CreatedBy },
        ]
      );

      if (result[0] && result[0].Status === 'F') {
        return res.json({
          Status: 'F',
          Message: result[0].Message,
        });
      } else if (result[0]) {
        results.push(result[0]);
      }
    }

    res.json({
      TripNo: newTripNo,
      Status: 'T',
      Message: 'Trip details inserted successfully',
    });
  } catch (error) {
    console.error('Error inserting trip details:', error);
    res.status(500).json({ error: 'Failed to process trip details' });
  }
};

export const getRecentTrips = async (req, res) => {
  try {
    const result = await executeQuery(`EXEC [dbo].[Sp_TripDetails_GetRecentTrip]`, []);

    res.json(result);
  } catch (error) {
    console.error('Error fetching recent trips:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const getTripDetails = async (req, res) => {
  try {
    const result = await executeQuery(`EXEC [dbo].[Sp_StockTransfer_Details]`, []);
    res.json(result);
  } catch (error) {
    console.error('Error fetching trip details:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};
