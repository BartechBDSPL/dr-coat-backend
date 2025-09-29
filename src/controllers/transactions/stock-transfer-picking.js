import { executeQuery, sql } from '../../config/db.js';
import { SAP_CONNECTOR_MIDDLEWARE_URL, SAP_SERVER } from '../../utils/constants.js';
import axios from 'axios';
import { format } from 'date-fns';

export const validatePalletBarcode = async (req, res) => {
  const {
    DeliveryNo,
    Material,
    Barcode,
    ToWarehouseCode,
    UserId,
    PendingPick,
    ReqQty,
    TotalPicked,
    Batch,
    FromWarehouseCode,
    TripNo,
  } = req.body;
  // return
  try {
    const palletLocationResult = await executeQuery(
      `EXEC [dbo].[HHT_TripDetails_PalletLocation] @TripNo , @PalletBarcode`,
      [
        { name: 'TripNo', type: sql.NVarChar(50), value: TripNo },
        { name: 'PalletBarcode', type: sql.NVarChar(50), value: Barcode },
      ]
    );
    const palletLocationData = palletLocationResult[0];
    if (palletLocationData.Status == 'F') {
      return res.json({ Status: 'F', Message: palletLocationData.Message }).status(200);
    }

    if (palletLocationData.StorageLocation !== FromWarehouseCode) {
      return res
        .json({
          Status: 'F',
          Message: `Pallet Barcode ${Barcode} is not in ${FromWarehouseCode} location.`,
        })
        .status(200);
    }
    // if(palletLocationData.Qty > PendingPick) {
    //     const boxesToPick = Math.ceil(parseFloat(PendingPick) / parseFloat(palletLocationData.ZPE));
    //     return res.json({
    //         Status: 'F',
    //         Message: `Pallet Total Qty is ${parseFloat(palletLocationData.Qty)} which exceeds Pending Pick Qty ${parseFloat(PendingPick)}. Please pick ${boxesToPick} box(es).`
    //     }).status(200);
    // }

    let sapError = false;
    let errorMessage = '';
    let materialDocument = '';

    // Only proceed with SAP transaction if QC_Status is null
    if (palletLocationData.QC_Status === null) {
      const currentDate = format(new Date(), 'dd.MM.yyyy');
      const sapRequestBody = {
        ConnectionParams: SAP_SERVER,
        GOODSMVT_CODE: { GM_CODE: '04' },
        GOODSMVT_HEADER: {
          PSTNG_DATE: currentDate,
          DOC_DATE: currentDate,
          HEADER_TXT: '',
        },
        GOODSMVT_ITEM: [
          {
            MATERIAL: Material.padStart(18, '0'),
            PLANT: '5100',
            STGE_LOC: '5110',
            BATCH: palletLocationData.Batch,
            MOVE_TYPE: '321',
            STCK_TYPE: ' ',
            ITEM_TEXT: Barcode.length > 45 ? Barcode.substring(0, 45) : Barcode,
            ENTRY_QNT: parseInt(palletLocationData.Qty),
            ENTRY_UOM: palletLocationData.Unit,
            ENTRY_UOM_ISO: palletLocationData.UnitISO,
            PO_PR_QNT: parseInt(palletLocationData.Qty),
            ORDERID: palletLocationData.OrderNo,
            MVT_IND: '',
          },
        ],
        TESTRUN: false,
      };

      try {
        const response = await axios.post(`${SAP_CONNECTOR_MIDDLEWARE_URL}/api/goods-movement/create`, sapRequestBody, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 300_000,
        });

        const sapResponse = response.data;
        materialDocument = sapResponse.GoodsMovementHeadRet?.MAT_DOC;

        if (!materialDocument) {
          sapError = true;
          errorMessage = sapResponse.Return[0]?.MESSAGE || 'Failed to get material document number from SAP';

          // Log the error in the database
          await executeQuery(
            `EXEC [dbo].[Sp_SAP_QC_ERROR_LOG_Insert] 
                            @PalletBarcode,
                            @ORDER_NUMBER,
                            @MATERIAL,
                            @BATCH,
                            @PRODUCTION_PLANT,
                            @Requested_Status,
                            @Current_Status,
                            @Qty,
                            @Error_Message,
                            @MOVEMENT_TYPE,
                            @STOCK_TYPE,
                            @STORAGE_LOCATION,
                            @MOVEMENT_INDICATOR,
                            @UNIT,
                            @UNIT_ISO,
                            @GM_CODE,
                            @MOVE_BATCH,
                            @MOVE_STORAGELOCATION,
                            @CreatedBy`,
            [
              { name: 'PalletBarcode', type: sql.NVarChar, value: Barcode },
              {
                name: 'ORDER_NUMBER',
                type: sql.NVarChar,
                value: palletLocationData.OrderNo || '',
              },
              {
                name: 'MATERIAL',
                type: sql.NVarChar,
                value: Material.padStart(18, '0') || '',
              },
              {
                name: 'BATCH',
                type: sql.NVarChar,
                value: palletLocationData.Batch || '',
              },
              {
                name: 'PRODUCTION_PLANT',
                type: sql.NVarChar,
                value: '5100' || '',
              },
              { name: 'Requested_Status', type: sql.NVarChar, value: '' },
              { name: 'Current_Status', type: sql.NVarChar, value: '' },
              {
                name: 'Qty',
                type: sql.Decimal,
                value: palletLocationData.Qty || 0,
              },
              {
                name: 'Error_Message',
                type: sql.NVarChar,
                value: errorMessage || '',
              },
              { name: 'MOVEMENT_TYPE', type: sql.NVarChar, value: '321' || '' },
              { name: 'STOCK_TYPE', type: sql.NVarChar, value: ' ' || '' },
              {
                name: 'STORAGE_LOCATION',
                type: sql.NVarChar,
                value: '5110' || '',
              },
              {
                name: 'MOVEMENT_INDICATOR',
                type: sql.NVarChar,
                value: '' || '',
              },
              {
                name: 'UNIT',
                type: sql.NVarChar,
                value: palletLocationData.Unit || '',
              },
              {
                name: 'UNIT_ISO',
                type: sql.NVarChar,
                value: palletLocationData.UnitISO || '',
              },
              { name: 'GM_CODE', type: sql.NVarChar, value: '04' },
              { name: 'MOVE_BATCH', type: sql.NVarChar, value: '' },
              { name: 'MOVE_STORAGELOCATION', type: sql.NVarChar, value: '' },
              { name: 'CreatedBy', type: sql.NVarChar, value: UserId || '' },
            ]
          );
        }
      } catch (error) {
        sapError = true;
        errorMessage =
          error.response?.data?.Message || error.response?.data?.ModelState
            ? JSON.stringify(error.response.data.ModelState)
            : error.message;

        await executeQuery(
          `EXEC [dbo].[Sp_SAP_QC_ERROR_LOG_Insert] 
                        @PalletBarcode,
                        @ORDER_NUMBER,
                        @MATERIAL,
                        @BATCH,
                        @PRODUCTION_PLANT,
                        @Requested_Status,
                        @Current_Status,
                        @Qty,
                        @Error_Message,
                        @MOVEMENT_TYPE,
                        @STOCK_TYPE,
                        @STORAGE_LOCATION,
                        @MOVEMENT_INDICATOR,
                        @UNIT,
                        @UNIT_ISO,
                        @GM_CODE,
                        @MOVE_BATCH,
                        @MOVE_STORAGELOCATION,
                        @CreatedBy`,
          [
            { name: 'PalletBarcode', type: sql.NVarChar, value: Barcode },
            {
              name: 'ORDER_NUMBER',
              type: sql.NVarChar,
              value: palletLocationData.OrderNo || '',
            },
            {
              name: 'MATERIAL',
              type: sql.NVarChar,
              value: Material.padStart(18, '0') || '',
            },
            {
              name: 'BATCH',
              type: sql.NVarChar,
              value: palletLocationData.Batch || '',
            },
            {
              name: 'PRODUCTION_PLANT',
              type: sql.NVarChar,
              value: '5100' || '',
            },
            { name: 'Requested_Status', type: sql.NVarChar, value: '' },
            { name: 'Current_Status', type: sql.NVarChar, value: '' },
            {
              name: 'Qty',
              type: sql.Decimal,
              value: palletLocationData.Qty || 0,
            },
            {
              name: 'Error_Message',
              type: sql.NVarChar,
              value: `${errorMessage}` || '',
            },
            { name: 'MOVEMENT_TYPE', type: sql.NVarChar, value: '321' || '' },
            { name: 'STOCK_TYPE', type: sql.NVarChar, value: ' ' || '' },
            {
              name: 'STORAGE_LOCATION',
              type: sql.NVarChar,
              value: '5110' || '',
            },
            { name: 'MOVEMENT_INDICATOR', type: sql.NVarChar, value: '' || '' },
            {
              name: 'UNIT',
              type: sql.NVarChar,
              value: palletLocationData.Unit || '',
            },
            {
              name: 'UNIT_ISO',
              type: sql.NVarChar,
              value: palletLocationData.UnitISO || '',
            },
            { name: 'GM_CODE', type: sql.NVarChar, value: '04' },
            { name: 'MOVE_BATCH', type: sql.NVarChar, value: '' },
            { name: 'MOVE_STORAGELOCATION', type: sql.NVarChar, value: '' },
            { name: 'CreatedBy', type: sql.NVarChar, value: UserId || '' },
          ]
        );
      }
    }

    // Always execute the stored procedure regardless of SAP success or failure
    const result = await executeQuery(
      `EXEC [dbo].[HHT_TripDetails_BarcodeValidation_Pallet] @DeliveryNo, @Material, @Barcode, @ToWarehouseCode, @Batch, @UserId, @PendingPick, @ReqQty, @TotalPicked`,
      [
        { name: 'DeliveryNo', type: sql.NVarChar(50), value: DeliveryNo },
        {
          name: 'Material',
          type: sql.NVarChar(50),
          value: Material.padStart(18, '0'),
        },
        { name: 'Barcode', type: sql.NVarChar(50), value: Barcode },
        {
          name: 'ToWarehouseCode',
          type: sql.NVarChar(50),
          value: ToWarehouseCode.trim(),
        },
        { name: 'Batch', type: sql.NVarChar(50), value: Batch },
        { name: 'UserId', type: sql.NVarChar(50), value: UserId },
        { name: 'PendingPick', type: sql.Decimal(18, 3), value: PendingPick },
        { name: 'ReqQty', type: sql.Decimal(18, 3), value: ReqQty },
        { name: 'TotalPicked', type: sql.Decimal(18, 3), value: TotalPicked },
      ]
    );

    if (palletLocationData.QC_Status !== null) {
      return res.json({
        ...result[0],
        SapMessage: '',
        SkippedDueToQC: true,
      });
    } else if (sapError) {
      return res.json({
        ...result[0],
        SapMessage: `Process done but SAP pending⚠️ - Error: ${errorMessage}`,
        ErrorInSAP: true,
      });
    } else {
      return res.json({
        ...result[0],
        SapMessage: `SAP process completed successfully. Material Document: ${materialDocument}`,
        MaterialDocument: materialDocument,
      });
    }
  } catch (error) {
    console.error('Error in validatePalletBarcode:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};
