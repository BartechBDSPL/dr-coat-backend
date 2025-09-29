import { executeQuery, sql } from '../../config/db.js';
import axios from 'axios';
import { SAP_CONNECTOR_MIDDLEWARE_URL, SAP_SERVER } from '../../utils/constants.js';
import { format } from 'date-fns';

export const inwardPalletBarcodeValidation = async (req, res) => {
  const { ScanBarcode } = req.body;
  try {
    const result = await executeQuery(`EXEC [dbo].[HHT_FG_GR_Pallet_BarcodeValidation] @ScanBarcode`, [
      { name: 'ScanBarcode', type: sql.NVarChar(70), value: ScanBarcode },
    ]);

    res.json(result);
  } catch (error) {
    console.error('Error validating inward pallet barcode:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const inwardBarcodeValidation = async (req, res) => {
  const { ScanBarcode } = req.body;
  // console.log(req.body)

  try {
    const result = await executeQuery(`EXEC [dbo].[HHT_FG_GR_BarcodeValidation] @ScanBarcode`, [
      { name: 'ScanBarcode', type: sql.NVarChar(70), value: ScanBarcode },
    ]);
    // console.log("Checking",result)
    res.json(result);
  } catch (error) {
    console.error('Error validating barcode:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const goodReceieptBarcodeUpdate = async (req, res) => {
  const { V_ScanBarcodes, UserId, UNIT, UNIT_ISO } = req.body;

  try {
    if (!V_ScanBarcodes) {
      return res.json({
        Status: 'F',
        Message: 'No scan barcodes provided',
      });
    }

    let allSerialNumbers = [];
    let palletQuantities = new Map();
    let goodsmvtItems = [];

    // Parse concatenated unit values
    const unitValues = UNIT ? UNIT.split('$') : [];
    const unitIsoValues = UNIT_ISO ? UNIT_ISO.split('$') : [];

    const palletGroups = V_ScanBarcodes.split('*').filter(group => group.trim());

    // Process each pallet group
    for (let i = 0; i < palletGroups.length; i++) {
      const group = palletGroups[i];
      if (group.includes('#')) {
        const [pallet, rest] = group.split('#');
        if (rest) {
          const [quantity, serialList] = rest.split(';');
          if (serialList) {
            const serials = serialList.split('$').filter(s => s);
            const currentPalletBarcode = pallet;
            const parsedQuantity = parseFloat(quantity || 0);
            palletQuantities.set(pallet, parsedQuantity);

            // Get units for this pallet
            const currentUnit = unitValues[i] || 'ST';
            const currentUnitIso = unitIsoValues[i] || 'PCE';

            const firstSerial = serials[0];
            const serialParts = firstSerial.split('|');

            if (serialParts.length < 3) {
              throw new Error(`Invalid serial format for ${firstSerial}`);
            }

            let OrderNo = serialParts[0];
            let ItemCode = serialParts[1];
            let Batch = serialParts[2];

            if (OrderNo.length !== 9) {
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
            }

            const formattedOrderNo = OrderNo.padStart(12, '0');
            const formattedMaterialNo = ItemCode.padStart(18, '0');

            // Determine storage location based on batch
            const storageLocation = Batch.includes('RS') ? '5190' : '5110';

            goodsmvtItems.push({
              MATERIAL: formattedMaterialNo,
              PLANT: '5100',
              STGE_LOC: storageLocation,
              BATCH: Batch,
              MOVE_TYPE: '101',
              STCK_TYPE: 'Q',
              ITEM_TEXT: currentPalletBarcode,
              ENTRY_QNT: parsedQuantity,
              ENTRY_UOM: currentUnit,
              ENTRY_UOM_ISO: currentUnitIso,
              PO_PR_QNT: parsedQuantity,
              ORDERID: formattedOrderNo,
              MVT_IND: 'F',
            });

            allSerialNumbers = [
              ...allSerialNumbers,
              ...serials.map(serial => ({
                serial,
                palletBarcode: currentPalletBarcode,
                quantity: parsedQuantity,
                orderNo: formattedOrderNo,
                material: formattedMaterialNo,
                batch: Batch,
                unit: currentUnit,
                unitIso: currentUnitIso,
              })),
            ];
          }
        }
      }
    }

    const currentDate = format(new Date(), 'dd.MM.yyyy');
    const batchSize = 50;
    const materialDocuments = [];
    const errorMessages = [];
    // console.log(goodsmvtItems);
    for (let i = 0; i < goodsmvtItems.length; i += batchSize) {
      const itemsBatch = goodsmvtItems.slice(i, i + batchSize);

      const sapRequestBody = {
        ConnectionParams: SAP_SERVER,
        GOODSMVT_CODE: { GM_CODE: '02' },
        GOODSMVT_HEADER: {
          PSTNG_DATE: currentDate,
          DOC_DATE: currentDate,
          HEADER_TXT: `GR SCAN`,
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
            for (const item of itemsBatch) {
              await executeQuery(
                `EXEC [dbo].[Sp_SAP_GR_ERROR_LOG_Insert] 
                                    @PalletBarcode, 
                                    @ORDER_NUMBER, 
                                    @MATERIAL, 
                                    @BATCH, 
                                    @PRODUCTION_PLANT,
                                    @Qty,
                                    @Error_Message,
                                    @MOVEMENT_TYPE,
                                    @STOCK_TYPE,
                                    @STORAGE_LOCATION,
                                    @MOVEMENT_INDICATOR,
                                    @UNIT,
                                    @UNIT_ISO,
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
                  { name: 'Qty', type: sql.Decimal, value: item.ENTRY_QNT },
                  {
                    name: 'Error_Message',
                    type: sql.NVarChar(500),
                    value: returnMessage.MESSAGE,
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
                    name: 'STORAGE_LOCATION',
                    type: sql.NVarChar(50),
                    value: item.STGE_LOC,
                  },
                  {
                    name: 'MOVEMENT_INDICATOR',
                    type: sql.NVarChar(50),
                    value: item.MVT_IND,
                  },
                  {
                    name: 'UNIT',
                    type: sql.NVarChar(50),
                    value: item.ENTRY_UOM,
                  },
                  {
                    name: 'UNIT_ISO',
                    type: sql.NVarChar(50),
                    value: item.ENTRY_UOM_ISO,
                  },
                  { name: 'GM_CODE', type: sql.NVarChar(50), value: '02' },
                  { name: 'CreatedBy', type: sql.NVarChar(50), value: UserId },
                ]
              );
            }
            errorMessages.push(returnMessage.MESSAGE);

            // Find and update all serial numbers related to this batch
            const relatedSerials = allSerialNumbers.filter(sn =>
              itemsBatch.some(item => item.ITEM_TEXT === sn.palletBarcode)
            );

            // Update with empty material document to allow process to continue
            for (const serial of relatedSerials) {
              if (serial.serial.trim()) {
                await executeQuery(
                  `EXEC [dbo].[HHT_FG_GR_BarcodeUpdate] @ScanBarcode, @PalletBarcode, @MaterialDocument, @UserId`,
                  [
                    {
                      name: 'ScanBarcode',
                      type: sql.NVarChar(70),
                      value: serial.serial.trim(),
                    },
                    {
                      name: 'PalletBarcode',
                      type: sql.NVarChar(50),
                      value: serial.palletBarcode,
                    },
                    {
                      name: 'MaterialDocument',
                      type: sql.NVarChar(50),
                      value: '',
                    },
                    { name: 'UserId', type: sql.NVarChar(50), value: UserId },
                  ]
                );
              }
            }
            continue;
          }
        }

        if (!materialDocument) {
          const errorMessage = sapResponse.Return[0]?.MESSAGE || 'Failed to get material document number from SAP';
          for (const item of itemsBatch) {
            await executeQuery(
              `EXEC [dbo].[Sp_SAP_GR_ERROR_LOG_Insert] 
                                @PalletBarcode, 
                                @ORDER_NUMBER, 
                                @MATERIAL, 
                                @BATCH, 
                                @PRODUCTION_PLANT,
                                @Qty,
                                @Error_Message,
                                @MOVEMENT_TYPE,
                                @STOCK_TYPE,
                                @STORAGE_LOCATION,
                                @MOVEMENT_INDICATOR,
                                @UNIT,
                                @UNIT_ISO,
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
                { name: 'Qty', type: sql.Decimal, value: item.ENTRY_QNT },
                {
                  name: 'Error_Message',
                  type: sql.NVarChar(500),
                  value: errorMessage,
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
                  name: 'STORAGE_LOCATION',
                  type: sql.NVarChar(50),
                  value: item.STGE_LOC,
                },
                {
                  name: 'MOVEMENT_INDICATOR',
                  type: sql.NVarChar(50),
                  value: item.MVT_IND,
                },
                { name: 'UNIT', type: sql.NVarChar(50), value: item.ENTRY_UOM },
                {
                  name: 'UNIT_ISO',
                  type: sql.NVarChar(50),
                  value: item.ENTRY_UOM_ISO,
                },
                { name: 'GM_CODE', type: sql.NVarChar(50), value: '02' },
                { name: 'CreatedBy', type: sql.NVarChar(50), value: UserId },
              ]
            );
          }
          errorMessages.push(errorMessage);

          // Find and update all serial numbers related to this batch
          const relatedSerials = allSerialNumbers.filter(sn =>
            itemsBatch.some(item => item.ITEM_TEXT === sn.palletBarcode)
          );

          // Update with empty material document to allow process to continue
          for (const serial of relatedSerials) {
            if (serial.serial.trim()) {
              await executeQuery(
                `EXEC [dbo].[HHT_FG_GR_BarcodeUpdate] @ScanBarcode, @PalletBarcode, @MaterialDocument, @UserId`,
                [
                  {
                    name: 'ScanBarcode',
                    type: sql.NVarChar(70),
                    value: serial.serial.trim(),
                  },
                  {
                    name: 'PalletBarcode',
                    type: sql.NVarChar(50),
                    value: serial.palletBarcode,
                  },
                  {
                    name: 'MaterialDocument',
                    type: sql.NVarChar(50),
                    value: '',
                  },
                  { name: 'UserId', type: sql.NVarChar(50), value: UserId },
                ]
              );
            }
          }
          continue; // Skip to next batch
        }

        // Store the material document for this batch
        materialDocuments.push(materialDocument);
      } catch (axiosError) {
        const errorMessage =
          axiosError.response?.data?.Message || axiosError.response?.data?.ModelState
            ? JSON.stringify(axiosError.response.data.ModelState)
            : axiosError.message;

        // Log error for each item in the failed batch
        for (const item of itemsBatch) {
          await executeQuery(
            `EXEC [dbo].[Sp_SAP_GR_ERROR_LOG_Insert] 
                            @PalletBarcode, 
                            @ORDER_NUMBER, 
                            @MATERIAL, 
                            @BATCH, 
                            @PRODUCTION_PLANT,
                            @Qty,
                            @Error_Message,
                            @MOVEMENT_TYPE,
                            @STOCK_TYPE,
                            @STORAGE_LOCATION,
                            @MOVEMENT_INDICATOR,
                            @UNIT,
                            @UNIT_ISO,
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
              { name: 'Qty', type: sql.Decimal, value: item.ENTRY_QNT },
              {
                name: 'Error_Message',
                type: sql.NVarChar(500),
                value: `SAP API Error: ${errorMessage}`,
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
                name: 'STORAGE_LOCATION',
                type: sql.NVarChar(50),
                value: item.STGE_LOC,
              },
              {
                name: 'MOVEMENT_INDICATOR',
                type: sql.NVarChar(50),
                value: item.MVT_IND,
              },
              { name: 'UNIT', type: sql.NVarChar(50), value: item.ENTRY_UOM },
              {
                name: 'UNIT_ISO',
                type: sql.NVarChar(50),
                value: item.ENTRY_UOM_ISO,
              },
              { name: 'GM_CODE', type: sql.NVarChar(50), value: '02' },
              { name: 'CreatedBy', type: sql.NVarChar(50), value: UserId },
            ]
          );
        }

        errorMessages.push(`SAP API Error: ${errorMessage}`);

        // Find and update all serial numbers related to this batch
        const relatedSerials = allSerialNumbers.filter(sn =>
          itemsBatch.some(item => item.ITEM_TEXT === sn.palletBarcode)
        );

        // Update with empty material document to allow process to continue
        for (const serial of relatedSerials) {
          if (serial.serial.trim()) {
            await executeQuery(
              `EXEC [dbo].[HHT_FG_GR_BarcodeUpdate] @ScanBarcode, @PalletBarcode, @MaterialDocument, @UserId`,
              [
                {
                  name: 'ScanBarcode',
                  type: sql.NVarChar(70),
                  value: serial.serial.trim(),
                },
                {
                  name: 'PalletBarcode',
                  type: sql.NVarChar(50),
                  value: serial.palletBarcode,
                },
                { name: 'MaterialDocument', type: sql.NVarChar(50), value: '' },
                { name: 'UserId', type: sql.NVarChar(50), value: UserId },
              ]
            );
          }
        }
        continue;
      }
    }

    if (materialDocuments.length === 0) {
      return res.status(200).json({
        Status: 'T', // Changed to T to indicate process continues despite SAP errors
        Message: `GR Done but SAP pending⚠️ - errors: ${errorMessages.join('; ')}`,
        ProcessedCount: allSerialNumbers.length,
        TotalQuantity: Array.from(palletQuantities.values()).reduce((a, b) => a + b, 0),
        MaterialDocument: '',
        AllDocuments: [],
        PartialFailures: true,
        ErrorMessages: errorMessages,
      });
    }

    const primaryMaterialDocument = materialDocuments[0];

    let updatedCount = 0;
    // Only update serials for successful batches (ones without error handling above)
    const successSerials = allSerialNumbers.filter(sn => !errorMessages.some(err => sn.palletBarcode.includes(err)));

    for (let i = 0; i < successSerials.length; i += batchSize) {
      const serialBatch = successSerials.slice(i, i + batchSize);

      await Promise.all(
        serialBatch.map(async ({ serial, palletBarcode }) => {
          if (serial.trim()) {
            await executeQuery(
              `EXEC [dbo].[HHT_FG_GR_BarcodeUpdate] @ScanBarcode, @PalletBarcode, @MaterialDocument, @UserId`,
              [
                {
                  name: 'ScanBarcode',
                  type: sql.NVarChar(70),
                  value: serial.trim(),
                },
                {
                  name: 'PalletBarcode',
                  type: sql.NVarChar(50),
                  value: palletBarcode,
                },
                {
                  name: 'MaterialDocument',
                  type: sql.NVarChar(50),
                  value: primaryMaterialDocument,
                },
                { name: 'UserId', type: sql.NVarChar(50), value: UserId },
              ]
            );
            updatedCount++;
          }
        })
      );
    }

    // Return success response with some info about partial failures if applicable
    const responseMessage =
      errorMessages.length > 0
        ? `Good receipt done, Pending in SAP ⚠️. Warnings: ${errorMessages.join('; ')}`
        : `Good receipt done. Document number: ${primaryMaterialDocument}`;

    res.json({
      Status: 'T',
      Message: responseMessage,
      ProcessedCount: updatedCount,
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
