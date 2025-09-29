import { executeQuery, sql } from '../../config/db.js';
import axios from 'axios';
import { SAP_CONNECTOR_MIDDLEWARE_URL, SAP_SERVER } from '../../utils/constants.js';
import { format } from 'date-fns';

export const putCheckValidLocation = async (req, res) => {
  const { PlantCode, Location, WHCat } = req.body;

  try {
    const result = await executeQuery(`EXEC [dbo].[HHT_FG_Put_CheckValidLocation_N] @PlantCode, @Location, @WHCat`, [
      { name: 'PlantCode', type: sql.NVarChar(50), value: PlantCode },
      { name: 'Location', type: sql.VarChar(100), value: Location },
      { name: 'WHCat', type: sql.NVarChar(50), value: WHCat },
    ]);
    res.json(result);
  } catch (error) {
    console.error('Error checking valid location:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const putLocationSuggestion = async (req, res) => {
  const { PlantCode, WHCategory, UserName } = req.body;
  try {
    const result = await executeQuery(`EXEC [dbo].[HHT_FG_Put_LocationSuggestion] @PlantCode, @WHCategory, @UserName`, [
      { name: 'PlantCode', type: sql.NVarChar(50), value: PlantCode },
      { name: 'WHCategory', type: sql.NVarChar(50), value: WHCategory },
      { name: 'UserName', type: sql.NVarChar(50), value: UserName },
    ]);

    res.json(result);
  } catch (error) {
    console.error('Error fetching location suggestions:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const putBarcodeValidation = async (req, res) => {
  const { PlantCode, ScanBarcode, MovementType } = req.body;
  try {
    const result = await executeQuery(
      `EXEC [dbo].[HHT_FG_Put_BarcodeValidation] @PlantCode, @ScanBarcode, @MovementType`,
      [
        { name: 'PlantCode', type: sql.NVarChar(50), value: PlantCode },
        { name: 'ScanBarcode', type: sql.NVarChar, value: ScanBarcode },
        { name: 'MovementType', type: sql.NVarChar(70), value: MovementType },
      ]
    );
    res.json(result[0]);
  } catch (error) {
    console.error('Error validating barcode:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const getWarehouseCodeDescConcat = async (req, res) => {
  try {
    const result = await executeQuery(`EXEC [dbo].[HHT_WarhouseCodeDescConcat]`, []);
    res.json(result);
  } catch (error) {
    console.error('Error concatenating warehouse code and description:', error);
    res.status(500).json({ error: 'Failed to concatenate warehouse code and description' });
  }
};

export const putPalletBarcodeValidation = async (req, res) => {
  const { PlantCode, ScanBarcode, MovementType } = req.body;

  try {
    const result = await executeQuery(
      `EXEC [dbo].[HHT_FG_Put_Pallet_BarcodeValidation] @PlantCode, @ScanBarcode, @MovementType`,
      [
        { name: 'PlantCode', type: sql.NVarChar(50), value: PlantCode },
        { name: 'ScanBarcode', type: sql.NVarChar, value: ScanBarcode },
        { name: 'MovementType', type: sql.NVarChar(70), value: MovementType },
      ]
    );
    console.log(result);
    res.json(result);
  } catch (error) {
    console.error('Error validating pallet barcode:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const putBarcodeDataUpdate = async (req, res) => {
  const { V_ScanBarcodes, UserId, PlantCode, Location, BinNo, UNIT = 'ST', UNIT_ISO = 'PCE', isExisting } = req.body;
  console.log(req.body);
  try {
    if (!V_ScanBarcodes) {
      return res.json({
        Status: 'F',
        Message: 'No scan barcodes provided',
      });
      ``;
    }

    let allSerialNumbers = [];
    let palletQuantities = new Map();
    let goodsmvtItems = [];
    let errorMessages = [];

    const palletGroups = V_ScanBarcodes.split('*').filter(group => group.trim());
    const isExistingValues = isExisting ? isExisting.split('$') : [];

    // Process each pallet group
    for (let i = 0; i < palletGroups.length; i++) {
      const group = palletGroups[i];
      const currentIsExisting = isExistingValues[i] === 'true';

      if (group.includes('#')) {
        const [pallet, rest] = group.split('#');
        if (rest) {
          let quantity, serialList;

          if (currentIsExisting) {
            const parts = rest.split(';');
            quantity = parts[0];
            serialList = parts.slice(1).join(';');
          } else {
            [quantity, serialList] = rest.split(';');
          }

          if (serialList) {
            const serials = currentIsExisting ? [serialList] : serialList.split('$').filter(s => s);
            const currentPalletBarcode = pallet;
            const parsedQuantity = parseFloat(quantity || 0);

            palletQuantities.set(currentPalletBarcode, parsedQuantity);

            let OrderNo = '';
            let ItemCode = '';
            let Batch = '';

            try {
              const palletDetails = await executeQuery(`EXEC [dbo].[HHT_PalletSAPDetails] @ScanBarcode`, [
                {
                  name: 'ScanBarcode',
                  type: sql.NVarChar,
                  value: currentPalletBarcode,
                },
              ]);

              if (palletDetails && palletDetails.length > 0) {
                OrderNo = palletDetails[0].ORDER_NUMBER || OrderNo;
                ItemCode = palletDetails[0].MATERIAL || ItemCode;
                Batch = palletDetails[0].BATCH || Batch;
              }
            } catch (spError) {
              console.error('Error fetching pallet details:', spError);
            }

            const formattedOrderNo = OrderNo.padStart(12, '0');
            const formattedMaterialNo = ItemCode.padStart(18, '0');

            goodsmvtItems.push({
              MATERIAL: formattedMaterialNo,
              PLANT: '5100',
              STGE_LOC: '5110',
              BATCH: Batch,
              MOVE_TYPE: '311',
              STCK_TYPE: ' ',
              MOVE_BATCH: Batch,
              MOVE_STLOC: Location,
              SPEC_STOCK: '',
              MVT_IND: '',
              ITEM_TEXT:
                currentPalletBarcode.length > 45 ? currentPalletBarcode.substring(0, 45) : currentPalletBarcode,
              ENTRY_QNT: parsedQuantity,
              ENTRY_UOM: UNIT,
              ENTRY_UOM_ISO: UNIT_ISO,
              PO_PR_QNT: parsedQuantity,
              ORDERID: formattedOrderNo,
            });

            allSerialNumbers = [
              ...allSerialNumbers,
              {
                serials,
                palletBarcode: currentPalletBarcode,
                quantity: parsedQuantity,
                isExisting: currentIsExisting,
              },
            ];
          }
        }
      }
    }

    let materialDocument = '';

    // Only perform SAP transaction if Location is not '5120' and we have items to process
    if (goodsmvtItems.length > 0) {
      const currentDate = format(new Date(), 'dd.MM.yyyy');
      const sapRequestBody = {
        ConnectionParams: SAP_SERVER,
        GOODSMVT_CODE: { GM_CODE: '04' },
        GOODSMVT_HEADER: {
          PSTNG_DATE: currentDate,
          DOC_DATE: currentDate,
          HEADER_TXT: 'PUT AWAY SCAN',
          PR_UNAME: UserId,
        },
        GOODSMVT_ITEM: goodsmvtItems,
        TESTRUN: false,
      };

      try {
        const response = await axios.post(`${SAP_CONNECTOR_MIDDLEWARE_URL}/api/goods-movement/create`, sapRequestBody, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 30000,
        });

        const sapResponse = response.data;
        materialDocument = sapResponse.GoodsMovementHeadRet?.MAT_DOC;

        if (response.data.Return && response.data.Return.length > 0) {
          const returnMessage = response.data.Return[0];
          if (['E', 'I', 'A'].includes(returnMessage.TYPE)) {
            // Log error for each item that failed
            for (const item of goodsmvtItems) {
              await executeQuery(
                `EXEC [dbo].[Sp_SAP_PUT_ERROR_LOG_Insert] 
                                    @PalletBarcode, 
                                    @ORDER_NUMBER, 
                                    @MATERIAL, 
                                    @BATCH, 
                                    @PRODUCTION_PLANT,
                                    @STORAGE_LOCATION,
                                    @MOVEMENT_TYPE,
                                    @STOCK_TYPE,
                                    @MOVE_BATCH,
                                    @MOVE_STORAGELOCATION,
                                    @SPEC_STOCK,
                                    @MOVEMENT_INDICATOR,
                                    @UOM,
                                    @UOM_ISO,
                                    @Qty,
                                    @Error_Message,
                                    @GM_CODE,
                                    @CreatedBy`,
                [
                  {
                    name: 'PalletBarcode',
                    type: sql.NVarChar(255),
                    value: item.ITEM_TEXT,
                  },
                  {
                    name: 'ORDER_NUMBER',
                    type: sql.NVarChar(50),
                    value: item.ORDERID,
                  },
                  {
                    name: 'MATERIAL',
                    type: sql.NVarChar(50),
                    value: item.MATERIAL,
                  },
                  { name: 'BATCH', type: sql.NVarChar(50), value: item.BATCH },
                  {
                    name: 'PRODUCTION_PLANT',
                    type: sql.NVarChar(50),
                    value: item.PLANT,
                  },
                  {
                    name: 'STORAGE_LOCATION',
                    type: sql.NVarChar(50),
                    value: item.STGE_LOC,
                  },
                  {
                    name: 'MOVEMENT_TYPE',
                    type: sql.NVarChar(50),
                    value: item.MOVE_TYPE,
                  },
                  {
                    name: 'STOCK_TYPE',
                    type: sql.NVarChar(50),
                    value: item.STCK_TYPE,
                  },
                  {
                    name: 'MOVE_BATCH',
                    type: sql.NVarChar(50),
                    value: item.MOVE_BATCH,
                  },
                  {
                    name: 'MOVE_STORAGELOCATION',
                    type: sql.NVarChar(50),
                    value: item.MOVE_STLOC,
                  },
                  {
                    name: 'SPEC_STOCK',
                    type: sql.NVarChar(50),
                    value: item.SPEC_STOCK || '',
                  },
                  {
                    name: 'MOVEMENT_INDICATOR',
                    type: sql.NVarChar(50),
                    value: item.MVT_IND || '',
                  },
                  {
                    name: 'UOM',
                    type: sql.NVarChar(50),
                    value: item.ENTRY_UOM,
                  },
                  {
                    name: 'UOM_ISO',
                    type: sql.NVarChar(50),
                    value: item.ENTRY_UOM_ISO,
                  },
                  { name: 'Qty', type: sql.Decimal, value: item.ENTRY_QNT },
                  {
                    name: 'Error_Message',
                    type: sql.NVarChar(500),
                    value: returnMessage.MESSAGE,
                  },
                  { name: 'GM_CODE', type: sql.NVarChar(50), value: '04' },
                  { name: 'CreatedBy', type: sql.NVarChar(50), value: UserId },
                ]
              );
            }

            errorMessages.push(returnMessage.MESSAGE);
            materialDocument = '';
          }
        }

        if (!materialDocument) {
          const errorMessage = sapResponse.Return[0]?.MESSAGE || 'Failed to get material document number from SAP';
          errorMessages.push(errorMessage);

          // Log error for each item that failed
          for (const item of goodsmvtItems) {
            await executeQuery(
              `EXEC [dbo].[Sp_SAP_PUT_ERROR_LOG_Insert] 
                                @PalletBarcode, 
                                @ORDER_NUMBER, 
                                @MATERIAL, 
                                @BATCH, 
                                @PRODUCTION_PLANT,
                                @STORAGE_LOCATION,
                                @MOVEMENT_TYPE,
                                @STOCK_TYPE,
                                @MOVE_BATCH,
                                @MOVE_STORAGELOCATION,
                                @SPEC_STOCK,
                                @MOVEMENT_INDICATOR,
                                @UOM,
                                @UOM_ISO,
                                @Qty,
                                @Error_Message,
                                @GM_CODE,
                                @CreatedBy`,
              [
                {
                  name: 'PalletBarcode',
                  type: sql.NVarChar(255),
                  value: item.ITEM_TEXT,
                },
                {
                  name: 'ORDER_NUMBER',
                  type: sql.NVarChar(50),
                  value: item.ORDERID,
                },
                {
                  name: 'MATERIAL',
                  type: sql.NVarChar(50),
                  value: item.MATERIAL,
                },
                { name: 'BATCH', type: sql.NVarChar(50), value: item.BATCH },
                {
                  name: 'PRODUCTION_PLANT',
                  type: sql.NVarChar(50),
                  value: item.PLANT,
                },
                {
                  name: 'STORAGE_LOCATION',
                  type: sql.NVarChar(50),
                  value: item.STGE_LOC,
                },
                {
                  name: 'MOVEMENT_TYPE',
                  type: sql.NVarChar(50),
                  value: item.MOVE_TYPE,
                },
                {
                  name: 'STOCK_TYPE',
                  type: sql.NVarChar(50),
                  value: item.STCK_TYPE,
                },
                {
                  name: 'MOVE_BATCH',
                  type: sql.NVarChar(50),
                  value: item.MOVE_BATCH,
                },
                {
                  name: 'MOVE_STORAGELOCATION',
                  type: sql.NVarChar(50),
                  value: item.MOVE_STLOC,
                },
                {
                  name: 'SPEC_STOCK',
                  type: sql.NVarChar(50),
                  value: item.SPEC_STOCK || '',
                },
                {
                  name: 'MOVEMENT_INDICATOR',
                  type: sql.NVarChar(50),
                  value: item.MVT_IND || '',
                },
                { name: 'UOM', type: sql.NVarChar(50), value: item.ENTRY_UOM },
                {
                  name: 'UOM_ISO',
                  type: sql.NVarChar(50),
                  value: item.ENTRY_UOM_ISO,
                },
                { name: 'Qty', type: sql.Decimal, value: item.ENTRY_QNT },
                {
                  name: 'Error_Message',
                  type: sql.NVarChar(500),
                  value: errorMessage,
                },
                { name: 'GM_CODE', type: sql.NVarChar(50), value: '04' },
                { name: 'CreatedBy', type: sql.NVarChar(50), value: UserId },
              ]
            );
          }
        }
      } catch (axiosError) {
        console.error('SAP API Error Details:', {
          response: axiosError.response?.data,
          status: axiosError.response?.status,
          headers: axiosError.response?.headers,
        });

        const errorMessage =
          axiosError.response?.data?.Message || axiosError.response?.data?.ModelState
            ? JSON.stringify(axiosError.response.data.ModelState)
            : axiosError.message;

        // Log error for each item that failed
        for (const item of goodsmvtItems) {
          await executeQuery(
            `EXEC [dbo].[Sp_SAP_PUT_ERROR_LOG_Insert] 
                            @PalletBarcode, 
                            @ORDER_NUMBER, 
                            @MATERIAL, 
                            @BATCH, 
                            @PRODUCTION_PLANT,
                            @STORAGE_LOCATION,
                            @MOVEMENT_TYPE,
                            @STOCK_TYPE,
                            @MOVE_BATCH,
                            @MOVE_STORAGELOCATION,
                            @SPEC_STOCK,
                            @MOVEMENT_INDICATOR,
                            @UOM,
                            @UOM_ISO,
                            @Qty,
                            @Error_Message,
                            @GM_CODE,
                            @CreatedBy`,
            [
              {
                name: 'PalletBarcode',
                type: sql.NVarChar(255),
                value: item.ITEM_TEXT,
              },
              {
                name: 'ORDER_NUMBER',
                type: sql.NVarChar(50),
                value: item.ORDERID,
              },
              {
                name: 'MATERIAL',
                type: sql.NVarChar(50),
                value: item.MATERIAL,
              },
              { name: 'BATCH', type: sql.NVarChar(50), value: item.BATCH },
              {
                name: 'PRODUCTION_PLANT',
                type: sql.NVarChar(50),
                value: item.PLANT,
              },
              {
                name: 'STORAGE_LOCATION',
                type: sql.NVarChar(50),
                value: item.STGE_LOC,
              },
              {
                name: 'MOVEMENT_TYPE',
                type: sql.NVarChar(50),
                value: item.MOVE_TYPE,
              },
              {
                name: 'STOCK_TYPE',
                type: sql.NVarChar(50),
                value: item.STCK_TYPE,
              },
              {
                name: 'MOVE_BATCH',
                type: sql.NVarChar(50),
                value: item.MOVE_BATCH,
              },
              {
                name: 'MOVE_STORAGELOCATION',
                type: sql.NVarChar(50),
                value: item.MOVE_STLOC,
              },
              {
                name: 'SPEC_STOCK',
                type: sql.NVarChar(50),
                value: item.SPEC_STOCK || '',
              },
              {
                name: 'MOVEMENT_INDICATOR',
                type: sql.NVarChar(50),
                value: item.MVT_IND || '',
              },
              { name: 'UOM', type: sql.NVarChar(50), value: item.ENTRY_UOM },
              {
                name: 'UOM_ISO',
                type: sql.NVarChar(50),
                value: item.ENTRY_UOM_ISO,
              },
              { name: 'Qty', type: sql.Decimal, value: item.ENTRY_QNT },
              {
                name: 'Error_Message',
                type: sql.NVarChar(500),
                value: `SAP API Error: ${errorMessage}`,
              },
              { name: 'GM_CODE', type: sql.NVarChar(50), value: '04' },
              { name: 'CreatedBy', type: sql.NVarChar(50), value: UserId },
            ]
          );
        }

        errorMessages.push(`SAP API Error: ${errorMessage}`);
        // Continue with process despite SAP error
        materialDocument = '';
      }
    }

    // Update database for all serial numbers
    for (const { serials, palletBarcode } of allSerialNumbers) {
      for (const serial of serials) {
        console.log('Calling HHT_FG_Put_BarcodeUpdate with params:', {
          PlantCode,
          ScanBarcode: serial.trim(),
          PalletBarcode: palletBarcode,
          UserId,
          StorageLocation: Location,
          BinNo,
        });
        if (serial.trim()) {
          await executeQuery(
            `EXEC [dbo].[HHT_FG_Put_BarcodeUpdate] @PlantCode, @ScanBarcode, @PalletBarcode, @UserId, @StorageLocation, @BinNo`,
            [
              { name: 'PlantCode', type: sql.NVarChar(50), value: PlantCode },
              { name: 'ScanBarcode', type: sql.NVarChar, value: serial.trim() },
              {
                name: 'PalletBarcode',
                type: sql.NVarChar,
                value: palletBarcode,
              },
              { name: 'UserId', type: sql.NVarChar(50), value: UserId },
              {
                name: 'StorageLocation',
                type: sql.NVarChar(50),
                value: Location,
              },
              { name: 'BinNo', type: sql.NVarChar(50), value: BinNo },
            ]
          );
        }
      }
    }

    const responseMessage =
      errorMessages.length > 0
        ? `Put away done but SAP pending ⚠️ - errors: ${errorMessages.join('; ')}`
        : `Put away completed successfully. Document number: ${materialDocument}`;

    res.json({
      Status: 'T',
      Message: responseMessage,
      ProcessedCount: allSerialNumbers.length,
      TotalQuantity: Array.from(palletQuantities.values()).reduce((a, b) => a + b, 0),
      MaterialDocument: materialDocument,
      PartialFailures: errorMessages.length > 0,
      ErrorMessages: errorMessages.length > 0 ? errorMessages : undefined,
    });
  } catch (error) {
    console.error('❌ Process Failed:', {
      error: error.message,
      stack: error.stack,
      details: error.response?.data || 'No additional details',
    });
    res.status(200).json({
      Status: 'F',
      Message: `Error processing request: ${error.message}`,
    });
  }
};

export const logPutawayError = async (req, res) => {
  const {
    PalletBarcode,
    ORDER_NUMBER,
    MATERIAL,
    BATCH,
    PRODUCTION_PLANT,
    STORAGE_LOCATION,
    MOVEMENT_TYPE,
    STOCK_TYPE,
    MOVE_BATCH,
    MOVE_STORAGELOCATION,
    SPEC_STOCK,
    MOVEMENT_INDICATOR,
    UOM,
    UOM_ISO,
    Qty,
    Error_Message,
    GM_CODE,
    CreatedBy,
  } = req.body;

  try {
    const result = await executeQuery(
      `EXEC [dbo].[Sp_SAP_PUT_ERROR_LOG_Insert] 
                @PalletBarcode, 
                @ORDER_NUMBER, 
                @MATERIAL, 
                @BATCH, 
                @PRODUCTION_PLANT,
                @STORAGE_LOCATION,
                @MOVEMENT_TYPE,
                @STOCK_TYPE,
                @MOVE_BATCH,
                @MOVE_STORAGELOCATION,
                @SPEC_STOCK,
                @MOVEMENT_INDICATOR,
                @UOM,
                @UOM_ISO,
                @Qty,
                @Error_Message,
                @GM_CODE,
                @CreatedBy`,
      [
        {
          name: 'PalletBarcode',
          type: sql.NVarChar(255),
          value: PalletBarcode,
        },
        { name: 'ORDER_NUMBER', type: sql.NVarChar(50), value: ORDER_NUMBER },
        { name: 'MATERIAL', type: sql.NVarChar(50), value: MATERIAL },
        { name: 'BATCH', type: sql.NVarChar(50), value: BATCH },
        {
          name: 'PRODUCTION_PLANT',
          type: sql.NVarChar(50),
          value: PRODUCTION_PLANT,
        },
        {
          name: 'STORAGE_LOCATION',
          type: sql.NVarChar(50),
          value: STORAGE_LOCATION,
        },
        { name: 'MOVEMENT_TYPE', type: sql.NVarChar(50), value: MOVEMENT_TYPE },
        { name: 'STOCK_TYPE', type: sql.NVarChar(50), value: STOCK_TYPE },
        { name: 'MOVE_BATCH', type: sql.NVarChar(50), value: MOVE_BATCH },
        {
          name: 'MOVE_STORAGELOCATION',
          type: sql.NVarChar(50),
          value: MOVE_STORAGELOCATION,
        },
        { name: 'SPEC_STOCK', type: sql.NVarChar(50), value: SPEC_STOCK },
        {
          name: 'MOVEMENT_INDICATOR',
          type: sql.NVarChar(50),
          value: MOVEMENT_INDICATOR,
        },
        { name: 'UOM', type: sql.NVarChar(50), value: UOM },
        { name: 'UOM_ISO', type: sql.NVarChar(50), value: UOM_ISO },
        { name: 'Qty', type: sql.Decimal(18, 3), value: Qty },
        {
          name: 'Error_Message',
          type: sql.NVarChar(500),
          value: Error_Message,
        },
        { name: 'GM_CODE', type: sql.NVarChar(50), value: GM_CODE },
        { name: 'CreatedBy', type: sql.NVarChar(50), value: CreatedBy },
      ]
    );

    res.json(result[0]);
  } catch (error) {
    console.error('Error logging putaway error:', error);
    res.status(500).json({
      Status: 'F',
      Message: 'Failed to log putaway error',
    });
  }
};

export const handlePutawaySapError = async (
  palletBarcode,
  orderNumber,
  material,
  batch,
  productionPlant,
  storageLocation,
  movementType,
  stockType,
  moveBatch,
  moveStorageLocation,
  specStock,
  movementIndicator,
  uom,
  uomIso,
  qty,
  errorMessage,
  gmCode,
  createdBy
) => {
  try {
    await executeQuery(
      `EXEC [dbo].[Sp_SAP_PUT_ERROR_LOG_Insert] 
                @PalletBarcode, 
                @ORDER_NUMBER, 
                @MATERIAL, 
                @BATCH, 
                @PRODUCTION_PLANT,
                @STORAGE_LOCATION,
                @MOVEMENT_TYPE,
                @STOCK_TYPE,
                @MOVE_BATCH,
                @MOVE_STORAGELOCATION,
                @SPEC_STOCK,
                @MOVEMENT_INDICATOR,
                @UOM,
                @UOM_ISO,
                @Qty,
                @Error_Message,
                @GM_CODE,
                @CreatedBy`,
      [
        {
          name: 'PalletBarcode',
          type: sql.NVarChar(255),
          value: palletBarcode,
        },
        { name: 'ORDER_NUMBER', type: sql.NVarChar(50), value: orderNumber },
        { name: 'MATERIAL', type: sql.NVarChar(50), value: material },
        { name: 'BATCH', type: sql.NVarChar(50), value: batch },
        {
          name: 'PRODUCTION_PLANT',
          type: sql.NVarChar(50),
          value: productionPlant,
        },
        {
          name: 'STORAGE_LOCATION',
          type: sql.NVarChar(50),
          value: storageLocation,
        },
        { name: 'MOVEMENT_TYPE', type: sql.NVarChar(50), value: movementType },
        { name: 'STOCK_TYPE', type: sql.NVarChar(50), value: stockType },
        { name: 'MOVE_BATCH', type: sql.NVarChar(50), value: moveBatch },
        {
          name: 'MOVE_STORAGELOCATION',
          type: sql.NVarChar(50),
          value: moveStorageLocation,
        },
        { name: 'SPEC_STOCK', type: sql.NVarChar(50), value: specStock },
        {
          name: 'MOVEMENT_INDICATOR',
          type: sql.NVarChar(50),
          value: movementIndicator,
        },
        { name: 'UOM', type: sql.NVarChar(50), value: uom },
        { name: 'UOM_ISO', type: sql.NVarChar(50), value: uomIso },
        { name: 'Qty', type: sql.Decimal(18, 3), value: qty },
        { name: 'Error_Message', type: sql.NVarChar(500), value: errorMessage },
        { name: 'GM_CODE', type: sql.NVarChar(50), value: gmCode },
        { name: 'CreatedBy', type: sql.NVarChar(50), value: createdBy },
      ]
    );
    return { success: true };
  } catch (error) {
    console.error('Error logging putaway error:', error);
    return { success: false, error: error.message };
  }
};
