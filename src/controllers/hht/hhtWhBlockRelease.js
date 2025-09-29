import { executeQuery, sql } from '../../config/db.js';
import axios from 'axios';
import { SAP_CONNECTOR_MIDDLEWARE_URL, SAP_SERVER } from '../../utils/constants.js';
import { format } from 'date-fns';

export const validateSerialBarcodeWHBlock = async (req, res) => {
  const { ScanBarcode } = req.body;

  try {
    let result;

    result = await executeQuery(`EXEC [dbo].[HHT_WHBlock_PalletValidation] @ScanBarcode`, [
      { name: 'ScanBarcode', type: sql.NVarChar, value: ScanBarcode },
    ]);

    res.json(result);
  } catch (error) {
    console.error('Error validating barcode:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const validateSerialBarcodeWHRelease = async (req, res) => {
  const { ScanBarcode } = req.body;

  try {
    let result;

    result = await executeQuery(`EXEC [dbo].[HHT_WHUnrestricted_PalletValidation] @ScanBarcode`, [
      { name: 'ScanBarcode', type: sql.NVarChar, value: ScanBarcode },
    ]);

    res.json(result);
  } catch (error) {
    console.error('Error validating barcode:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const updateWHBlockReleaseStatus = async (req, res) => {
  const { V_ScanBarcodes, NewQCStatus, StorageLocation, UserId, UNIT, UNIT_ISO, Reason, isExisting } = req.body;
  try {
    if (!V_ScanBarcodes) {
      return res.json({
        Status: 'F',
        Message: 'No scan barcodes provided',
      });
    }

    let allPalletBarcodes = new Set();
    let palletQuantities = new Map();
    let goodsmvtItems = [];

    const unitValues = UNIT ? UNIT.split('$') : [];
    const unitIsoValues = UNIT_ISO ? UNIT_ISO.split('$') : [];
    const isExistingValues = isExisting ? isExisting.split('$') : [];

    const palletGroups = V_ScanBarcodes.split('*').filter(group => group.trim());

    // Process each pallet group - Format: palletnumber1#pallet1Qty;PalletNumber1*palletnumber2#pallet2Qty;PalletNumber2
    for (let i = 0; i < palletGroups.length; i++) {
      const group = palletGroups[i];
      const currentIsExisting = isExistingValues[i] === 'true'; // Convert string to boolean

      if (group.includes('#')) {
        const [pallet, rest] = group.split('#');
        if (rest) {
          let quantity, serialList;

          if (currentIsExisting) {
            // For existing pallets: first element is quantity, rest is one single serial
            const parts = rest.split(';');
            quantity = parts[0];
            serialList = parts.slice(1).join(';'); // The entire remaining string is one serial
          } else {
            // For new pallets: original logic - quantity;serialList
            const quantityWithExtra = rest;
            quantity = quantityWithExtra.split(';')[0];
          }

          const palletBarcode = pallet;
          const parsedQuantity = parseFloat(quantity || 0);

          if (palletBarcode && parsedQuantity > 0) {
            palletQuantities.set(palletBarcode, parsedQuantity);

            try {
              const palletDetails = await executeQuery(`EXEC [dbo].[HHT_Pallet_DetailsforPrinting] @ScanBarcode`, [
                {
                  name: 'ScanBarcode',
                  type: sql.NVarChar,
                  value: palletBarcode,
                },
              ]);

              if (palletDetails && palletDetails.length > 0) {
                const detail = palletDetails[0];
                // Get units for this pallet
                const currentUnit = unitValues[i] || detail.ALT_UNIT || 'PC';
                const currentUnitIso = unitIsoValues[i] || 'PCE';

                const formattedMaterialNo = detail.MATERIAL?.padStart(18, '0') || '';
                const moveType = NewQCStatus === 'Unrestricted' ? '343' : '344';

                goodsmvtItems.push({
                  MATERIAL: formattedMaterialNo,
                  PLANT: '5100',
                  STGE_LOC: StorageLocation || '5110',
                  BATCH: detail.BATCH || '',
                  MOVE_TYPE: moveType,
                  STCK_TYPE: NewQCStatus === 'Unrestricted' ? ' ' : 'S',
                  ENTRY_QNT: parsedQuantity,
                  ENTRY_UOM: currentUnit,
                  ENTRY_UOM_ISO: currentUnitIso,
                  ITEM_TEXT: palletBarcode.length > 45 ? palletBarcode.substring(0, 45) : palletBarcode,
                  MVT_IND: '',
                });

                allPalletBarcodes.add(palletBarcode);
              } else {
                console.warn(`No details found for pallet: ${palletBarcode}`);
                allPalletBarcodes.add(palletBarcode);
              }
            } catch (error) {
              console.error(`Error getting pallet details for ${palletBarcode}:`, error);
              allPalletBarcodes.add(palletBarcode);
            }
          }
        }
      }
    }

    const currentDate = format(new Date(), 'dd.MM.yyyy');
    const batchSize = 50;
    const materialDocuments = [];
    const errorMessages = [];

    for (let i = 0; i < goodsmvtItems.length; i += batchSize) {
      const itemsBatch = goodsmvtItems.slice(i, i + batchSize);

      const sapRequestBody = {
        ConnectionParams: SAP_SERVER,
        GOODSMVT_CODE: { GM_CODE: '04' },
        GOODSMVT_HEADER: {
          PSTNG_DATE: currentDate,
          DOC_DATE: currentDate,
          HEADER_TXT: `${NewQCStatus === 'Unrestricted' ? 'RELEASE' : 'BLOCK'} WH ${StorageLocation || ''}`,
          PR_UNAME: UserId,
        },
        GOODSMVT_ITEM: itemsBatch,
        TESTRUN: false,
      };

      try {
        const response = await axios.post(`${SAP_CONNECTOR_MIDDLEWARE_URL}/api/goods-movement/create`, sapRequestBody, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 60000,
        });

        const sapResponse = response.data;
        const materialDocument = sapResponse.GoodsMovementHeadRet?.MAT_DOC;

        if (response.data.Return && response.data.Return.length > 0) {
          const returnMessage = response.data.Return[0];
          if (['E', 'I', 'A'].includes(returnMessage.TYPE)) {
            // Log error for each item that failed
            for (const item of itemsBatch) {
              await executeQuery(
                `EXEC [dbo].[Sp_SAP_WHBlockORUnrestricted_ERROR_LOG_Insert] 
                                    @PalletBarcode, 
                                    @ORDER_NUMBER, 
                                    @MATERIAL, 
                                    @BATCH, 
                                    @PRODUCTION_PLANT,
                                    @QC_Status,
                                    @STORAGE_LOCATION,
                                    @MOVE_TYPE,
                                    @STOCK_TYPE,
                                    @QTY,
                                    @UOM,
                                    @UOM_ISO,
                                    @MOVEMENT_INDICATOR,
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
                    value: item.ORDERID || '',
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
                    value: '5100',
                  },
                  {
                    name: 'QC_Status',
                    type: sql.NVarChar(50),
                    value: NewQCStatus,
                  },
                  {
                    name: 'STORAGE_LOCATION',
                    type: sql.NVarChar(50),
                    value: item.STGE_LOC || '',
                  },
                  {
                    name: 'MOVE_TYPE',
                    type: sql.NVarChar(50),
                    value: item.MOVE_TYPE || '',
                  },
                  {
                    name: 'STOCK_TYPE',
                    type: sql.NVarChar(50),
                    value: item.STCK_TYPE || '',
                  },
                  {
                    name: 'QTY',
                    type: sql.NVarChar(50),
                    value: item.ENTRY_QNT?.toString() || '',
                  },
                  {
                    name: 'UOM',
                    type: sql.NVarChar(50),
                    value: item.ENTRY_UOM || '',
                  },
                  {
                    name: 'UOM_ISO',
                    type: sql.NVarChar(50),
                    value: item.ENTRY_UOM_ISO || '',
                  },
                  {
                    name: 'MOVEMENT_INDICATOR',
                    type: sql.NVarChar(50),
                    value: item.MVT_IND || '',
                  },
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
            continue;
          }
        }

        if (!materialDocument) {
          const errorMessage = sapResponse.Return[0]?.MESSAGE || 'Failed to get material document number from SAP';
          for (const item of itemsBatch) {
            await executeQuery(
              `EXEC [dbo].[Sp_SAP_WHBlockORUnrestricted_ERROR_LOG_Insert] 
                                @PalletBarcode, 
                                @ORDER_NUMBER, 
                                @MATERIAL, 
                                @BATCH, 
                                @PRODUCTION_PLANT,  
                                @QC_Status,
                                @STORAGE_LOCATION,
                                @MOVE_TYPE,
                                @STOCK_TYPE,
                                @QTY,
                                @UOM,
                                @UOM_ISO,
                                @MOVEMENT_INDICATOR,
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
                  value: item.ORDERID || '',
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
                  value: '5100',
                },
                {
                  name: 'QC_Status',
                  type: sql.NVarChar(50),
                  value: NewQCStatus,
                },
                {
                  name: 'STORAGE_LOCATION',
                  type: sql.NVarChar(50),
                  value: item.STGE_LOC || '',
                },
                {
                  name: 'MOVE_TYPE',
                  type: sql.NVarChar(50),
                  value: item.MOVE_TYPE || '',
                },
                {
                  name: 'STOCK_TYPE',
                  type: sql.NVarChar(50),
                  value: item.STCK_TYPE || '',
                },
                {
                  name: 'QTY',
                  type: sql.NVarChar(50),
                  value: item.ENTRY_QNT?.toString() || '',
                },
                {
                  name: 'UOM',
                  type: sql.NVarChar(50),
                  value: item.ENTRY_UOM || '',
                },
                {
                  name: 'UOM_ISO',
                  type: sql.NVarChar(50),
                  value: item.ENTRY_UOM_ISO || '',
                },
                {
                  name: 'MOVEMENT_INDICATOR',
                  type: sql.NVarChar(50),
                  value: item.MVT_IND || '',
                },
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
          errorMessages.push(errorMessage);
          continue;
        }

        materialDocuments.push(materialDocument);
      } catch (axiosError) {
        console.error(`SAP API Error Details for ${NewQCStatus} Batch ${Math.floor(i / batchSize) + 1}:`, {
          response: axiosError.response?.data,
          status: axiosError.response?.status,
          headers: axiosError.response?.headers,
        });

        const errorMessage =
          axiosError.response?.data?.Message || axiosError.response?.data?.ModelState
            ? JSON.stringify(axiosError.response.data.ModelState)
            : axiosError.message;

        // Log error for each item in the failed batch
        for (const item of itemsBatch) {
          await executeQuery(
            `EXEC [dbo].[Sp_SAP_WHBlockORUnrestricted_ERROR_LOG_Insert] 
                            @PalletBarcode, 
                            @ORDER_NUMBER, 
                            @MATERIAL, 
                            @BATCH, 
                            @PRODUCTION_PLANT,
                            @QC_Status,
                            @STORAGE_LOCATION,
                            @MOVE_TYPE,
                            @STOCK_TYPE,
                            @QTY,
                            @UOM,
                            @UOM_ISO,
                            @MOVEMENT_INDICATOR,
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
                value: item.ORDERID || '',
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
                value: '5100',
              },
              { name: 'QC_Status', type: sql.NVarChar(50), value: NewQCStatus },
              {
                name: 'STORAGE_LOCATION',
                type: sql.NVarChar(50),
                value: item.STGE_LOC || '',
              },
              {
                name: 'MOVE_TYPE',
                type: sql.NVarChar(50),
                value: item.MOVE_TYPE || '',
              },
              {
                name: 'STOCK_TYPE',
                type: sql.NVarChar(50),
                value: item.STCK_TYPE || '',
              },
              {
                name: 'QTY',
                type: sql.NVarChar(50),
                value: item.ENTRY_QNT?.toString() || '',
              },
              {
                name: 'UOM',
                type: sql.NVarChar(50),
                value: item.ENTRY_UOM || '',
              },
              {
                name: 'UOM_ISO',
                type: sql.NVarChar(50),
                value: item.ENTRY_UOM_ISO || '',
              },
              {
                name: 'MOVEMENT_INDICATOR',
                type: sql.NVarChar(50),
                value: item.MVT_IND || '',
              },
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
        continue;
      }
    }

    for (const palletBarcode of allPalletBarcodes) {
      await executeQuery(
        `EXEC [dbo].[HHT_WHBlockORUnrestricted_PalletUpdate] @ScanBarcode, @NewQCStatus, @Reason, @CreatedBy`,
        [
          {
            name: 'ScanBarcode',
            type: sql.NVarChar,
            value: palletBarcode.trim(),
          },
          { name: 'NewQCStatus', type: sql.NVarChar, value: NewQCStatus },
          { name: 'Reason', type: sql.NVarChar, value: Reason || '' },
          { name: 'CreatedBy', type: sql.NVarChar, value: UserId },
        ]
      );
    }

    if (materialDocuments.length === 0) {
      return res.status(200).json({
        Status: 'T',
        Message: `Process continues with SAP errors: ${errorMessages.join('; ')}`,
        ProcessedCount: allPalletBarcodes.size,
        TotalQuantity: Array.from(palletQuantities.values()).reduce((a, b) => a + b, 0),
        MaterialDocument: '',
        AllDocuments: [],
        PartialFailures: true,
        ErrorMessages: errorMessages,
      });
    }

    const primaryMaterialDocument = materialDocuments[0];

    const responseMessage =
      errorMessages.length > 0
        ? `${NewQCStatus} status update done, Pending in SAP ⚠️. Warnings: ${errorMessages.join('; ')}`
        : `${NewQCStatus} status update completed successfully. Document number: ${primaryMaterialDocument}`;

    res.json({
      Status: 'T',
      Message: responseMessage,
      ProcessedCount: allPalletBarcodes.size,
      TotalQuantity: Array.from(palletQuantities.values()).reduce((a, b) => a + b, 0),
      MaterialDocument: primaryMaterialDocument,
      AllDocuments: materialDocuments,
      PartialFailures: errorMessages.length > 0,
    });
  } catch (error) {
    res.status(200).json({
      Status: 'F',
      Message: `Error processing request: ${error.message}`,
    });
  }
};

// export const updateWHBlockReleaseStatus = async (req, res) => {
//     const { V_ScanBarcodes, NewQCStatus, StorageLocation, UserId, UNIT, UNIT_ISO } = req.body;
//     // return
//     try {
//         if (!V_ScanBarcodes) {
//             return res.json({
//                 Status: 'F',
//                 Message: 'No scan barcodes provided'
//             });
//         }

//         let allSerialNumbers = [];
//         let palletQuantities = new Map();
//         let goodsmvtItems = [];

//         // Parse concatenated unit values
//         const unitValues = UNIT ? UNIT.split('$') : [];
//         const unitIsoValues = UNIT_ISO ? UNIT_ISO.split('$') : [];

//         const palletGroups = V_ScanBarcodes.split('*').filter(group => group.trim());

//         // Process each pallet group
//         for (let i = 0; i < palletGroups.length; i++) {
//             const group = palletGroups[i];
//             if (group.includes('#')) {
//                 const [pallet, rest] = group.split('#');
//                 if (rest) {
//                     const [quantity, serialList] = rest.split(';');
//                     if (serialList) {
//                         const serials = serialList.split('$').filter(s => s);
//                         const currentPalletBarcode = pallet;
//                         const parsedQuantity = parseFloat(quantity || 0);
//                         palletQuantities.set(pallet, parsedQuantity);

//                         // Get units for this pallet
//                         const currentUnit = unitValues[i] || "PC"; // Default to 'PC' if not provided
//                         const currentUnitIso = unitIsoValues[i] || "PCE"; // Default to 'PCE' if not provided

//                         const firstSerial = serials[0];
//                         const serialParts = firstSerial.split('|');

//                         if (serialParts.length < 3) {
//                             throw new Error(`Invalid serial format for ${firstSerial}`);
//                         }

//                         const OrderNo = serialParts[0];
//                         const ItemCode = serialParts[1];
//                         const Batch = serialParts[2];

//                         const formattedOrderNo = OrderNo.padStart(12, '0');
//                         const formattedMaterialNo = ItemCode.padStart(18, '0');

//                         const moveType = NewQCStatus === 'Unrestricted' ? '343' : '344';

//                         goodsmvtItems.push({
//                             MATERIAL: formattedMaterialNo,
//                             PLANT: "5100",
//                             STGE_LOC: StorageLocation || "5110",
//                             BATCH: Batch,
//                             MOVE_TYPE: moveType,
//                             STCK_TYPE: NewQCStatus === 'Unrestricted' ? ' ' : 'S',
//                             ENTRY_QNT: parsedQuantity,
//                             ENTRY_UOM: currentUnit,
//                             ENTRY_UOM_ISO: currentUnitIso,
//                             ITEM_TEXT: currentPalletBarcode,
//                             MVT_IND: ""
//                         });

//                         allSerialNumbers = [...allSerialNumbers, ...serials.map(serial => ({
//                             serial,
//                             palletBarcode: currentPalletBarcode,
//                             quantity: parsedQuantity,
//                             orderNo: formattedOrderNo,
//                             material: formattedMaterialNo,
//                             batch: Batch,
//                             unit: currentUnit,
//                             unitIso: currentUnitIso
//                         }))];
//                     }
//                 }
//             }
//         }

//         const currentDate = format(new Date(), 'dd.MM.yyyy');
//         const batchSize = 50;
//         const materialDocuments = [];
//         const errorMessages = [];

//         for (let i = 0; i < goodsmvtItems.length; i += batchSize) {
//             const itemsBatch = goodsmvtItems.slice(i, i + batchSize);

//             const sapRequestBody = {
//                 ConnectionParams: SAP_SERVER,
//                 GOODSMVT_CODE: { GM_CODE: "04" },
//                 GOODSMVT_HEADER: {
//                     PSTNG_DATE: currentDate,
//                     DOC_DATE: currentDate,
//                     HEADER_TXT: `${NewQCStatus === 'Unrestricted' ? 'RELEASE' : 'BLOCK'} WH ${StorageLocation || ''}`,
//                     PR_UNAME: UserId
//                 },
//                 GOODSMVT_ITEM: itemsBatch,
//                 TESTRUN: false
//             };

//             try {
//                 const response = await axios.post(
//                     `${SAP_CONNECTOR_MIDDLEWARE_URL}/api/goods-movement/create`,
//                     sapRequestBody,
//                     {
//                         headers: { 'Content-Type': 'application/json' },
//                         timeout: 60000
//                     }
//                 );

//                 const sapResponse = response.data;
//                 const materialDocument = sapResponse.GoodsMovementHeadRet?.MAT_DOC;

//                 if (response.data.Return && response.data.Return.length > 0) {
//                     const returnMessage = response.data.Return[0];
//                     if (['E', 'I', 'A'].includes(returnMessage.TYPE)) {
//                         // Log error for each item that failed
//                         for (const item of itemsBatch) {
//                             await executeQuery(
//                                 `EXEC [dbo].[Sp_SAP_WHBlockORUnrestricted_ERROR_LOG_Insert]
//                                     @PalletBarcode,
//                                     @ORDER_NUMBER,
//                                     @MATERIAL,
//                                     @BATCH,
//                                     @PRODUCTION_PLANT,
//                                     @QC_Status,
//                                     @STORAGE_LOCATION,
//                                     @MOVE_TYPE,
//                                     @STOCK_TYPE,
//                                     @QTY,
//                                     @UOM,
//                                     @UOM_ISO,
//                                     @MOVEMENT_INDICATOR,
//                                     @Error_Message,
//                                     @GM_CODE,
//                                     @CreatedBy`,
//                                 [
//                                     { name: 'PalletBarcode', type: sql.NVarChar(255), value: item.ITEM_TEXT },
//                                     { name: 'ORDER_NUMBER', type: sql.NVarChar(50), value: item.ORDERID || "" },
//                                     { name: 'MATERIAL', type: sql.NVarChar(50), value: item.MATERIAL },
//                                     { name: 'BATCH', type: sql.NVarChar(50), value: item.BATCH },
//                                     { name: 'PRODUCTION_PLANT', type: sql.NVarChar(50), value: "5100" },
//                                     { name: 'QC_Status', type: sql.NVarChar(50), value: NewQCStatus },
//                                     { name: 'STORAGE_LOCATION', type: sql.NVarChar(50), value: item.STGE_LOC || "" },
//                                     { name: 'MOVE_TYPE', type: sql.NVarChar(50), value: item.MOVE_TYPE || "" },
//                                     { name: 'STOCK_TYPE', type: sql.NVarChar(50), value: item.STCK_TYPE || "" },
//                                     { name: 'QTY', type: sql.NVarChar(50), value: item.ENTRY_QNT?.toString() || "" },
//                                     { name: 'UOM', type: sql.NVarChar(50), value: item.ENTRY_UOM || "" },
//                                     { name: 'UOM_ISO', type: sql.NVarChar(50), value: item.ENTRY_UOM_ISO || "" },
//                                     { name: 'MOVEMENT_INDICATOR', type: sql.NVarChar(50), value: item.MVT_IND || "" },
//                                     { name: 'Error_Message', type: sql.NVarChar(500), value: returnMessage.MESSAGE },
//                                     { name: 'GM_CODE', type: sql.NVarChar(50), value: "04" },
//                                     { name: 'CreatedBy', type: sql.NVarChar(50), value: UserId }
//                                 ]
//                             );
//                         }
//                         errorMessages.push(returnMessage.MESSAGE);

//                         const relatedSerials = allSerialNumbers.filter(sn =>
//                             itemsBatch.some(item => item.ITEM_TEXT === sn.palletBarcode)
//                         );

//                         // Batch process serials
//                         const serialBatch = relatedSerials.map(serial => [
//                             { name: 'ScanBarcode', type: sql.NVarChar(50), value: serial.serial.trim() },
//                             { name: 'NewQCStatus', type: sql.NVarChar(50), value: NewQCStatus }
//                         ]).filter(params => params[0].value);

//                         // Process in smaller chunks to avoid overwhelming the DB
//                         for (let j = 0; j < serialBatch.length; j += 100) {
//                             const chunk = serialBatch.slice(j, j + 100);
//                             await Promise.all(chunk.map(params =>
//                                 executeQuery(`EXEC [dbo].[HHT_WHBlockORUnrestricted_SerialUpdate] @ScanBarcode, @NewQCStatus`, params)
//                             ));
//                         }
//                         continue;
//                     }
//                 }

//                 if (!materialDocument) {
//                     const errorMessage = sapResponse.Return[0]?.MESSAGE || 'Failed to get material document number from SAP';
//                     for (const item of itemsBatch) {
//                         await executeQuery(
//                             `EXEC [dbo].[Sp_SAP_WHBlockORUnrestricted_ERROR_LOG_Insert]
//                                 @PalletBarcode,
//                                 @ORDER_NUMBER,
//                                 @MATERIAL,
//                                 @BATCH,
//                                 @PRODUCTION_PLANT,
//                                 @QC_Status,
//                                 @STORAGE_LOCATION,
//                                 @MOVE_TYPE,
//                                 @STOCK_TYPE,
//                                 @QTY,
//                                 @UOM,
//                                 @UOM_ISO,
//                                 @MOVEMENT_INDICATOR,
//                                 @Error_Message,
//                                 @GM_CODE,
//                                 @CreatedBy`,
//                             [
//                                 { name: 'PalletBarcode', type: sql.NVarChar(255), value: item.ITEM_TEXT },
//                                 { name: 'ORDER_NUMBER', type: sql.NVarChar(50), value: item.ORDERID || "" },
//                                 { name: 'MATERIAL', type: sql.NVarChar(50), value: item.MATERIAL },
//                                 { name: 'BATCH', type: sql.NVarChar(50), value: item.BATCH },
//                                 { name: 'PRODUCTION_PLANT', type: sql.NVarChar(50), value: "5100" },
//                                 { name: 'QC_Status', type: sql.NVarChar(50), value: NewQCStatus },
//                                 { name: 'STORAGE_LOCATION', type: sql.NVarChar(50), value: item.STGE_LOC || "" },
//                                 { name: 'MOVE_TYPE', type: sql.NVarChar(50), value: item.MOVE_TYPE || "" },
//                                 { name: 'STOCK_TYPE', type: sql.NVarChar(50), value: item.STCK_TYPE || "" },
//                                 { name: 'QTY', type: sql.NVarChar(50), value: item.ENTRY_QNT?.toString() || "" },
//                                 { name: 'UOM', type: sql.NVarChar(50), value: item.ENTRY_UOM || "" },
//                                 { name: 'UOM_ISO', type: sql.NVarChar(50), value: item.ENTRY_UOM_ISO || "" },
//                                 { name: 'MOVEMENT_INDICATOR', type: sql.NVarChar(50), value: item.MVT_IND || "" },
//                                 { name: 'Error_Message', type: sql.NVarChar(500), value: errorMessage },
//                                 { name: 'GM_CODE', type: sql.NVarChar(50), value: "04" },
//                                 { name: 'CreatedBy', type: sql.NVarChar(50), value: UserId }
//                             ]
//                         );
//                     }
//                     errorMessages.push(errorMessage);

//                     const relatedSerials = allSerialNumbers.filter(sn =>
//                         itemsBatch.some(item => item.ITEM_TEXT === sn.palletBarcode)
//                     );

//                     // Batch process serials
//                     const serialBatch = relatedSerials.map(serial => [
//                         { name: 'ScanBarcode', type: sql.NVarChar(50), value: serial.serial.trim() },
//                         { name: 'NewQCStatus', type: sql.NVarChar(50), value: NewQCStatus }
//                     ]).filter(params => params[0].value);

//                     // Process in smaller chunks
//                     for (let j = 0; j < serialBatch.length; j += 100) {
//                         const chunk = serialBatch.slice(j, j + 100);
//                         await Promise.all(chunk.map(params =>
//                             executeQuery(`EXEC [dbo].[HHT_WHBlockORUnrestricted_SerialUpdate] @ScanBarcode, @NewQCStatus`, params)
//                         ));
//                     }
//                     continue;
//                 }

//                 materialDocuments.push(materialDocument);

//             } catch (axiosError) {
//                 console.error(`SAP API Error Details for ${NewQCStatus} Batch ${Math.floor(i / batchSize) + 1}:`, {
//                     response: axiosError.response?.data,
//                     status: axiosError.response?.status,
//                     headers: axiosError.response?.headers
//                 });

//                 const errorMessage = axiosError.response?.data?.Message
//                     || axiosError.response?.data?.ModelState
//                         ? JSON.stringify(axiosError.response.data.ModelState)
//                         : axiosError.message;

//                 // Log error for each item in the failed batch
//                 for (const item of itemsBatch) {
//                     await executeQuery(
//                         `EXEC [dbo].[Sp_SAP_WHBlockORUnrestricted_ERROR_LOG_Insert]
//                             @PalletBarcode,
//                             @ORDER_NUMBER,
//                             @MATERIAL,
//                             @BATCH,
//                             @PRODUCTION_PLANT,
//                             @QC_Status,
//                             @STORAGE_LOCATION,
//                             @MOVE_TYPE,
//                             @STOCK_TYPE,
//                             @QTY,
//                             @UOM,
//                             @UOM_ISO,
//                             @MOVEMENT_INDICATOR,
//                             @Error_Message,
//                             @GM_CODE,
//                             @CreatedBy`,
//                         [
//                             { name: 'PalletBarcode', type: sql.NVarChar(255), value: item.ITEM_TEXT },
//                             { name: 'ORDER_NUMBER', type: sql.NVarChar(50), value: item.ORDERID || "" },
//                             { name: 'MATERIAL', type: sql.NVarChar(50), value: item.MATERIAL },
//                             { name: 'BATCH', type: sql.NVarChar(50), value: item.BATCH },
//                             { name: 'PRODUCTION_PLANT', type: sql.NVarChar(50), value: "5100" },
//                             { name: 'QC_Status', type: sql.NVarChar(50), value: NewQCStatus },
//                             { name: 'STORAGE_LOCATION', type: sql.NVarChar(50), value: item.STGE_LOC || "" },
//                             { name: 'MOVE_TYPE', type: sql.NVarChar(50), value: item.MOVE_TYPE || "" },
//                             { name: 'STOCK_TYPE', type: sql.NVarChar(50), value: item.STCK_TYPE || "" },
//                             { name: 'QTY', type: sql.NVarChar(50), value: item.ENTRY_QNT?.toString() || "" },
//                             { name: 'UOM', type: sql.NVarChar(50), value: item.ENTRY_UOM || "" },
//                             { name: 'UOM_ISO', type: sql.NVarChar(50), value: item.ENTRY_UOM_ISO || "" },
//                             { name: 'MOVEMENT_INDICATOR', type: sql.NVarChar(50), value: item.MVT_IND || "" },
//                             { name: 'Error_Message', type: sql.NVarChar(500), value: `SAP API Error: ${errorMessage}` },
//                             { name: 'GM_CODE', type: sql.NVarChar(50), value: "04" },
//                             { name: 'CreatedBy', type: sql.NVarChar(50), value: UserId }
//                         ]
//                     );
//                 }

//                 errorMessages.push(`SAP API Error: ${errorMessage}`);

//                 // Find and update all serial numbers related to this batch
//                 const relatedSerials = allSerialNumbers.filter(sn =>
//                     itemsBatch.some(item => item.ITEM_TEXT === sn.palletBarcode)
//                 );

//                 // Batch process serials
//                 const serialBatch = relatedSerials.map(serial => [
//                     { name: 'ScanBarcode', type: sql.NVarChar(50), value: serial.serial.trim() },
//                     { name: 'NewQCStatus', type: sql.NVarChar(50), value: NewQCStatus }
//                 ]).filter(params => params[0].value);

//                 // Process in smaller chunks
//                 for (let j = 0; j < serialBatch.length; j += 100) {
//                     const chunk = serialBatch.slice(j, j + 100);
//                     await Promise.all(chunk.map(params =>
//                         executeQuery(`EXEC [dbo].[HHT_WHBlockORUnrestricted_SerialUpdate] @ScanBarcode, @NewQCStatus`, params)
//                     ));
//                 }
//                 continue;
//             }
//         }

//         if (materialDocuments.length === 0) {
//             return res.status(200).json({
//                 Status: 'T',
//                 Message: `Process continues with SAP errors: ${errorMessages.join('; ')}`,
//                 ProcessedCount: allSerialNumbers.length,
//                 TotalQuantity: Array.from(palletQuantities.values()).reduce((a, b) => a + b, 0),
//                 MaterialDocument: "",
//                 AllDocuments: [],
//                 PartialFailures: true,
//                 ErrorMessages: errorMessages
//             });
//         }

//         const primaryMaterialDocument = materialDocuments[0];

//         let updatedCount = 0;
//         const successSerials = allSerialNumbers.filter(sn =>
//             !errorMessages.some(err => sn.palletBarcode.includes(err))
//         );

//         // Batch process successful serials
//         const serialBatchParams = successSerials
//             .map(({serial}) => [
//                 { name: 'ScanBarcode', type: sql.NVarChar(50), value: serial.trim() },
//                 { name: 'NewQCStatus', type: sql.NVarChar(50), value: NewQCStatus }
//             ])
//             .filter(params => params[0].value);

//         updatedCount = serialBatchParams.length;

//         // Process in chunks of 100 for better performance
//         for (let i = 0; i < serialBatchParams.length; i += 100) {
//             const chunk = serialBatchParams.slice(i, i + 100);
//             await Promise.all(chunk.map(params =>
//                 executeQuery(`EXEC [dbo].[HHT_WHBlockORUnrestricted_SerialUpdate] @ScanBarcode, @NewQCStatus`, params)
//             ));
//         }

//         const responseMessage = errorMessages.length > 0
//             ? `${NewQCStatus} status update done, Pending in SAP ⚠️. Warnings: ${errorMessages.join('; ')}`
//             : `${NewQCStatus} status update completed successfully. Document number: ${primaryMaterialDocument}`;

//         res.json({
//             Status: 'T',
//             Message: responseMessage,
//             ProcessedCount: updatedCount,
//             TotalQuantity: Array.from(palletQuantities.values()).reduce((a, b) => a + b, 0),
//             MaterialDocument: primaryMaterialDocument,
//             AllDocuments: materialDocuments,
//             PartialFailures: errorMessages.length > 0
//         });

//     } catch (error) {

//         res.status(200).json({
//             Status: 'F',
//             Message: `Error processing request: ${error.message}`
//         });
//     }
// };
