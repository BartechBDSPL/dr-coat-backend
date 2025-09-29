import { executeQuery, sql } from '../../config/db.js';
import axios from 'axios';
import { SAP_CONNECTOR_MIDDLEWARE_URL, SAP_SERVER } from '../../utils/constants.js';
import { format } from 'date-fns';

export const internalBarcodeValidation = async (req, res) => {
  const { PlantCode, OldLocation, ScanBarcode } = req.body;

  try {
    const result = await executeQuery(
      `EXEC [dbo].[HHT_FG_INT_BarcodeValidation] 
             @PlantCode, 
             @OldLocation, 
             @ScanBarcode`,
      [
        { name: 'PlantCode', type: sql.NVarChar(50), value: PlantCode },
        { name: 'OldLocation', type: sql.NVarChar(50), value: OldLocation },
        { name: 'ScanBarcode', type: sql.NVarChar, value: ScanBarcode },
      ]
    );

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const intCheckValidLocation = async (req, res) => {
  const { Location, WHCat } = req.body;

  try {
    const result = await executeQuery(
      `EXEC [dbo].[HHT_Int_BinExists] 
            @Location, @WHCat`,
      [
        { name: 'Location', type: sql.NVarChar(100), value: Location },
        { name: 'WHCat', type: sql.NVarChar(100), value: WHCat },
      ]
    );
    res.json(result);
  } catch (error) {
    console.error('Error checking bin existence:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const internalBarcodePalletValidation = async (req, res) => {
  const { PlantCode, OldLocation, ScanBarcode } = req.body;
  try {
    const result = await executeQuery(
      `EXEC [dbo].[HHT_FG_INT_Pallet_BarcodeValidation] 
             @PlantCode, 
             @OldLocation, 
             @ScanBarcode`,
      [
        { name: 'PlantCode', type: sql.NVarChar(50), value: PlantCode },
        { name: 'OldLocation', type: sql.NVarChar(50), value: OldLocation },
        { name: 'ScanBarcode', type: sql.NVarChar, value: ScanBarcode },
      ]
    );
    console.log(result);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const IntBarcodeDataUpdate = async (req, res) => {
  const { V_ScanBarcodes, UserId, PlantCode, OldLocation, NewLocation, isExisting } = req.body;

  try {
    if (!V_ScanBarcodes) {
      return res.json({
        Status: 'F',
        Message: 'No scan barcodes provided',
      });
    }

    // Initialize variables at the top level
    let allSerialNumbers = [];
    let goodsmvtItems = [];
    let errorMessages = [];
    const gmCode = '04';

    // Validate locations first
    const oldLocationResult = await executeQuery(`EXEC [dbo].[Sp_Bin_GetStorageLocation] @BinNo`, [
      { name: 'BinNo', type: sql.NVarChar(20), value: OldLocation },
    ]);

    if (oldLocationResult[0].Status === 'F') {
      return res.status(400).json({ Status: 'F', Message: oldLocationResult[0].Message });
    }

    const newLocationResult = await executeQuery(`EXEC [dbo].[Sp_Bin_GetStorageLocation] @BinNo`, [
      { name: 'BinNo', type: sql.NVarChar(20), value: NewLocation },
    ]);

    if (newLocationResult[0].Status === 'F') {
      return res.status(400).json({ Status: 'F', Message: newLocationResult[0].Message });
    }

    const sameWarehouse = oldLocationResult[0].WarehouseCode === newLocationResult[0].WarehouseCode;

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

            const delimiterCount = (currentPalletBarcode.match(/\|/g) || []).length;
            let uomData;

            let palletLocationResult;

            palletLocationResult = await executeQuery(`EXEC [dbo].[HHT_FGPick_PalletLocation] @PalletBarcode`, [
              {
                name: 'PalletBarcode',
                type: sql.NVarChar,
                value: currentPalletBarcode,
              },
            ]);

            if (palletLocationResult[0].Status !== 'T') {
              throw new Error(`Invalid pallet location: ${palletLocationResult[0].Message}`);
            }

            uomData = palletLocationResult[0];

            // Get details from first serial of this pallet
            const firstSerial = serials[0];
            const serialParts = firstSerial.split('|');

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
              STGE_LOC: palletLocationResult[0].StorageLocation,
              BATCH: Batch,
              MOVE_TYPE: '311',
              MOVE_STLOC: newLocationResult[0].WarehouseCode,
              STCK_TYPE: ' ',
              MOVE_BATCH: Batch,
              SPEC_STOCK: '',
              MVT_IND: '',
              ITEM_TEXT:
                currentPalletBarcode.length > 45 ? currentPalletBarcode.substring(0, 45) : currentPalletBarcode,
              ENTRY_QNT: parsedQuantity,
              ENTRY_UOM: uomData.Unit,
              ENTRY_UOM_ISO: uomData.UnitISO,
              PO_PR_QNT: parsedQuantity,
              ORDERID: formattedOrderNo,
            });

            allSerialNumbers = [
              ...allSerialNumbers,
              ...serials.map(serial => ({
                serial,
                palletBarcode: currentPalletBarcode,
                quantity: parsedQuantity,
                isExisting: currentIsExisting,
              })),
            ];
          }
        }
      }
    }

    // Prepare and make SAP API call
    const currentDate = format(new Date(), 'dd.MM.yyyy');

    let materialDocument = null;

    // Skip SAP call if warehouses are the same
    if (sameWarehouse) {
      // console.log('Same warehouse detected, skipping SAP call');
    } else {
      const sapRequestBody = {
        ConnectionParams: SAP_SERVER,
        GOODSMVT_CODE: { GM_CODE: '04' },
        GOODSMVT_HEADER: {
          PSTNG_DATE: currentDate,
          DOC_DATE: currentDate,
          HEADER_TXT: 'Internal Transfer',
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
              await logInternalMoveError(
                item.ITEM_TEXT,
                item.ORDERID,
                item.MATERIAL,
                item.BATCH,
                item.PLANT,
                item.STGE_LOC,
                item.MOVE_TYPE,
                item.STCK_TYPE,
                item.MOVE_BATCH,
                item.MOVE_STLOC,
                item.SPEC_STOCK,
                item.MVT_IND,
                item.ENTRY_UOM,
                item.ENTRY_UOM_ISO,
                item.ENTRY_QNT,
                returnMessage.MESSAGE,
                gmCode,
                UserId
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
            await logInternalMoveError(
              item.ITEM_TEXT,
              item.ORDERID,
              item.MATERIAL,
              item.BATCH,
              item.PLANT,
              item.STGE_LOC,
              item.MOVE_TYPE,
              item.STCK_TYPE,
              item.MOVE_BATCH,
              item.MOVE_STLOC,
              item.SPEC_STOCK,
              item.MVT_IND,
              item.ENTRY_UOM,
              item.ENTRY_UOM_ISO,
              item.ENTRY_QNT,
              errorMessage,
              gmCode,
              UserId
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
          await logInternalMoveError(
            item.ITEM_TEXT,
            item.ORDERID,
            item.MATERIAL,
            item.BATCH,
            item.PLANT,
            item.STGE_LOC,
            item.MOVE_TYPE,
            item.STCK_TYPE,
            item.MOVE_BATCH,
            item.MOVE_STLOC,
            item.SPEC_STOCK,
            item.MVT_IND,
            item.ENTRY_UOM,
            item.ENTRY_UOM_ISO,
            item.ENTRY_QNT,
            `SAP API Error: ${errorMessage}`,
            gmCode,
            UserId
          );
        }

        errorMessages.push(`SAP API Error: ${errorMessage}`);
        // Continue with process despite SAP error
        materialDocument = '';
      }
    }

    // Update database regardless of SAP call
    for (const { serial } of allSerialNumbers) {
      await executeQuery(
        `EXEC [dbo].[HHT_FG_INT_BarcodeUpdate] 
                 @PlantCode, @OldLocation, @NewLocation, @ScanBarcode, @User`,
        [
          { name: 'PlantCode', type: sql.NVarChar(50), value: PlantCode },
          { name: 'OldLocation', type: sql.NVarChar(50), value: OldLocation },
          { name: 'NewLocation', type: sql.NVarChar(50), value: NewLocation },
          { name: 'ScanBarcode', type: sql.NVarChar, value: serial },
          { name: 'User', type: sql.NVarChar(50), value: UserId },
        ]
      );
    }

    const responseMessage = sameWarehouse
      ? `Internal transfer completed within same warehouse.`
      : errorMessages.length > 0
        ? `Stock Transfer completed but SAP pending ⚠️ - errors: ${errorMessages.join('; ')}`
        : `Stock Transfer completed. Document number: ${materialDocument}`;

    res.json({
      Status: 'T',
      Message: responseMessage,
      ProcessedCount: allSerialNumbers.length,
      TotalQuantity: allSerialNumbers.length,
      MaterialDocument: materialDocument,
      PartialFailures: errorMessages.length > 0,
      ErrorMessages: errorMessages.length > 0 ? errorMessages : undefined,
    });
  } catch (error) {
    const errorMessage =
      error.response?.data?.Message || error.response?.data?.ModelState
        ? JSON.stringify(error.response.data.ModelState)
        : error.message;
    res.status(200).json({
      Status: 'F',
      Message: `Error processing request: ${errorMessage}`,
    });
  }
};

// Add a new function to log internal movement errors to the database
export const logInternalMovementError = async (req, res) => {
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
      `EXEC [dbo].[Sp_SAP_INTERNALMOVEMENT_ERROR_LOG_Insert] 
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
    console.error('Error logging internal movement error:', error);
    res.status(500).json({
      Status: 'F',
      Message: 'Failed to log internal movement error',
    });
  }
};

// Helper function for internal use to log errors
export const logInternalMoveError = async (
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
      `EXEC [dbo].[Sp_SAP_INTERNALMOVEMENT_ERROR_LOG_Insert] 
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
    console.error('Error logging internal movement error:', error);
    return { success: false, error: error.message };
  }
};
