import { executeQuery, sql } from '../../config/db.js';

export const getReprintStockTransferNoteDetails = async (req, res) => {
  const { TripNo, FromDate, ToDate } = req.body;
  try {
    const result = await executeQuery(
      `EXEC [dbo].[Sp_TripChallanDetails_GetReprintDetails] @TripNo, @FromDate, @ToDate`,
      [
        { name: 'TripNo', type: sql.NVarChar, value: TripNo },
        { name: 'FromDate', type: sql.NVarChar, value: FromDate },
        { name: 'ToDate', type: sql.NVarChar, value: ToDate },
      ]
    );

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const insertReprintStockTransferNoteDetails = async (req, res) => {
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
    Reason,
    ReprintBy,
  } = req.body;
  try {
    const result = await executeQuery(
      `EXEC [dbo].[Sp_TripChallanDetails_ReprintInsert] @TripNo, @MATERIAL, @MATERIAL_TEXT, @BATCH, @Qty, @TotalBox, @TotalPallet, @FromStorageLocation, @FromStorageLocationAddress, @ToStorageLocation, @ToStorageLocationAddress, @ChallanDate, @EwayBillNo, @LRNumber, @VehicleNo, @TransporterName, @TransporterGSTINNo, @Reason, @ReprintBy`,
      [
        { name: 'TripNo', type: sql.NVarChar(50), value: TripNo },
        { name: 'MATERIAL', type: sql.NVarChar(100), value: MATERIAL },
        {
          name: 'MATERIAL_TEXT',
          type: sql.NVarChar(255),
          value: MATERIAL_TEXT,
        },
        { name: 'BATCH', type: sql.NVarChar(50), value: BATCH },
        { name: 'Qty', type: sql.Decimal(18, 3), value: Qty },
        { name: 'TotalBox', type: sql.Int, value: TotalBox },
        { name: 'TotalPallet', type: sql.Int, value: TotalPallet },
        {
          name: 'FromStorageLocation',
          type: sql.NVarChar(50),
          value: FromStorageLocation,
        },
        {
          name: 'FromStorageLocationAddress',
          type: sql.NVarChar(sql.MAX),
          value: FromStorageLocationAddress,
        },
        {
          name: 'ToStorageLocation',
          type: sql.NVarChar(50),
          value: ToStorageLocation,
        },
        {
          name: 'ToStorageLocationAddress',
          type: sql.NVarChar(sql.MAX),
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
          type: sql.NVarChar(20),
          value: TransporterGSTINNo,
        },
        { name: 'Reason', type: sql.NVarChar(sql.MAX), value: Reason },
        { name: 'ReprintBy', type: sql.NVarChar(50), value: ReprintBy },
      ]
    );

    res.status(200).json(result[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};
