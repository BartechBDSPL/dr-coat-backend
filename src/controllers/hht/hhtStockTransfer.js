import { executeQuery, sql } from '../../config/db.js';

export const pickingTripDetails = async (req, res) => {
  const { TripNo, ScanBarcode, PickedBy, StorageLocation } = req.body;
  try {
    const result = await executeQuery(
      `EXEC [dbo].[HHT_TripDetails_Picking] @TripNo, @ScanBarcode, @PickedBy, @StorageLocation`,
      [
        { name: 'TripNo', type: sql.NVarChar(50), value: TripNo },
        { name: 'ScanBarcode', type: sql.NVarChar(255), value: ScanBarcode },
        { name: 'PickedBy', type: sql.NVarChar(50), value: PickedBy },
        {
          name: 'StorageLocation',
          type: sql.NVarChar(50),
          value: StorageLocation,
        },
      ]
    );
    const response = result[0];
    if (response) {
      response.ORDER_NUMBER = response.ORDER_NUMBER?.replace(/^0+/, '');
      response.MATERIAL = response.MATERIAL?.replace(/^0+/, '');
    }
    res.status(200).json(response);
  } catch (error) {
    console.error('Error in pickingTripDetails:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const removeTripDetails = async (req, res) => {
  const { TripNo, ScanBarcode } = req.body;
  try {
    const result = await executeQuery(`EXEC [dbo].[HHT_TripDetails_Remove] @TripNo, @ScanBarcode`, [
      { name: 'TripNo', type: sql.NVarChar(50), value: TripNo },
      { name: 'ScanBarcode', type: sql.NVarChar(255), value: ScanBarcode },
    ]);
    res.status(200).json(result[0]);
  } catch (error) {
    console.error('Error in removeTripDetails:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const recentTransactionTripDetails = async (req, res) => {
  const { TripNo } = req.body;
  try {
    const result = await executeQuery(`EXEC [dbo].[HHT_TripDetails_RecentTransaction] @TripNo`, [
      { name: 'TripNo', type: sql.NVarChar(50), value: TripNo },
    ]);
    const cleanedResult = result.map(row => ({
      ...row,
      ORDER_NUMBER: row.ORDER_NUMBER?.replace(/^0+/, ''),
      MATERIAL: row.MATERIAL?.replace(/^0+/, ''),
    }));
    res.status(200).json(cleanedResult);
  } catch (error) {
    console.error('Error in recentTransactionTripDetails:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const closeOrderTripDetails = async (req, res) => {
  const { TripNo } = req.body;
  try {
    const result = await executeQuery(`EXEC [dbo].[HHT_TripDetails_OrderClose] @TripNo`, [
      { name: 'TripNo', type: sql.NVarChar(50), value: TripNo },
    ]);
    res.status(200).json(result[0]);
  } catch (error) {
    console.error('Error in closeOrderTripDetails:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const getClosedOpenTripNos = async (req, res) => {
  try {
    const result = await executeQuery(`EXEC [dbo].[Sp_TripDetails_GetTripNo]`, []);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error in getClosedOpenTripNos:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const getTripNoDetails = async (req, res) => {
  const { TripNo } = req.body;
  try {
    const result = await executeQuery(`EXEC [dbo].[Sp_TripDetails_GetTripNoDetails] @TripNo`, [
      { name: 'TripNo', type: sql.NVarChar(50), value: TripNo },
    ]);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error in getTripNoDetails:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const insertTripChallanDetails = async (req, res) => {
  const {
    TripNo,
    MATERIAL,
    MATERIAL_TEXT,
    BATCH,
    Qty,
    TotalBox,
    TotalPallet,
    FromStorageLocation,
    FromStorageLocationAddress,
    ToStorageLocation,
    ToStorageLocationAddress,
    ChallanDate,
    EwayBillNo,
    LRNumber,
    VehicleNo,
    TransporterName,
    TransporterGSTINNo,
    CreatedBy,
  } = req.body;
  try {
    const result = await executeQuery(
      `EXEC [dbo].[Sp_TripChallanDetails_Insert] @TripNo, @MATERIAL, @MATERIAL_TEXT, @BATCH, @Qty, @TotalBox, @TotalPallet, @FromStorageLocation, @FromStorageLocationAddress, @ToStorageLocation, @ToStorageLocationAddress, @ChallanDate, @EwayBillNo, @LRNumber, @VehicleNo, @TransporterName, @TransporterGSTINNo, @CreatedBy`,
      [
        { name: 'TripNo', type: sql.NVarChar(50), value: TripNo },
        { name: 'MATERIAL', type: sql.NVarChar(100), value: MATERIAL },
        {
          name: 'MATERIAL_TEXT',
          type: sql.NVarChar(200),
          value: MATERIAL_TEXT,
        },
        { name: 'BATCH', type: sql.NVarChar(50), value: BATCH },
        { name: 'Qty', type: sql.Decimal(18, 2), value: Qty },
        { name: 'TotalBox', type: sql.Int, value: TotalBox },
        { name: 'TotalPallet', type: sql.Int, value: TotalPallet },
        {
          name: 'FromStorageLocation',
          type: sql.NVarChar(50),
          value: FromStorageLocation,
        },
        {
          name: 'FromStorageLocationAddress',
          type: sql.NVarChar(200),
          value: FromStorageLocationAddress,
        },
        {
          name: 'ToStorageLocation',
          type: sql.NVarChar(50),
          value: ToStorageLocation,
        },
        {
          name: 'ToStorageLocationAddress',
          type: sql.NVarChar(200),
          value: ToStorageLocationAddress,
        },
        { name: 'ChallanDate', type: sql.DateTime, value: ChallanDate },
        { name: 'EwayBillNo', type: sql.NVarChar(100), value: EwayBillNo },
        { name: 'LRNumber', type: sql.NVarChar(100), value: LRNumber },
        { name: 'VehicleNo', type: sql.NVarChar(50), value: VehicleNo },
        {
          name: 'TransporterName',
          type: sql.NVarChar(100),
          value: TransporterName,
        },
        {
          name: 'TransporterGSTINNo',
          type: sql.NVarChar(50),
          value: TransporterGSTINNo,
        },
        { name: 'CreatedBy', type: sql.NVarChar(50), value: CreatedBy },
      ]
    );
    res.status(200).json(result[0]);
  } catch (error) {
    console.error('Error in insertTripChallanDetails:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const getTripPalletBarcode = async (req, res) => {
  const { TripNo, Location } = req.body;
  try {
    const result = await executeQuery(`EXEC [dbo].[Sp_TripDetails_GetPalletBarcode] @TripNo`, [
      { name: 'TripNo', type: sql.NVarChar(50), value: TripNo },
    ]);

    let finalStatus = 'T';
    let finalMessage = 'Location Updated Successfully';
    for (const row of result) {
      const palletBarcode = row.PalletBarcode;
      const updateResult = await executeQuery(`EXEC [dbo].[Sp_TripDetails_UpdateLocation] @PalletBarcode, @Location`, [
        {
          name: 'PalletBarcode',
          type: sql.NVarChar(255),
          value: palletBarcode,
        },
        { name: 'Location', type: sql.NVarChar(50), value: Location },
      ]);
      const status = updateResult[0]?.Status || 'F';
      const message = updateResult[0]?.Message || 'Invalid Pallet Scanned.';
      if (status !== 'T') {
        finalStatus = 'F';
        finalMessage = message;
        break;
      }
    }

    res.status(200).json({ Status: finalStatus, Message: finalMessage });
  } catch (error) {
    console.error('Error updating pallet locations:', error);
    res.status(500).json({ Status: 'F', Message: 'Failed to update pallet locations' });
  }
};
