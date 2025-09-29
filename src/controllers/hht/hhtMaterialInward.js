import { executeQuery, sql } from '../../config/db.js';
import axios from 'axios';
import { SAP_CONNECTOR_MIDDLEWARE_URL, SAP_SERVER } from '../../utils/constants.js';
import { format } from 'date-fns';

export const inwardPalletBarcodeValidation = async (req, res) => {
  const { ScanBarcode } = req.body;
  try {
    const result = await executeQuery(`EXEC [dbo].[HHT_FG_Inward_Pallet_BarcodeValidation] @ScanBarcode`, [
      { name: 'ScanBarcode', type: sql.NVarChar(70), value: ScanBarcode },
    ]);

    try {
      const qcResult = await executeQuery(`EXEC [dbo].[HHT_QcStatus_PalletBarcode] @PalletBarcode`, [
        { name: 'PalletBarcode', type: sql.NVarChar, value: ScanBarcode },
      ]);

      const qcStatus = qcResult[0]?.QCStatus || null;

      res.json({ result: result, qcStatus });
    } catch (qcError) {
      console.error('Error fetching QC status for pallet:', qcError);
      res.json({ result: result, qcStatus: null });
    }
  } catch (error) {
    console.error('Error validating inward pallet barcode:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const inwardBarcodeValidation = async (req, res) => {
  const { ScanBarcode } = req.body;

  try {
    const result = await executeQuery(`EXEC [dbo].[HHT_FG_Inward_BarcodeValidation]  @ScanBarcode`, [
      { name: 'ScanBarcode', type: sql.NVarChar(70), value: ScanBarcode },
    ]);

    // Get QC status for serial barcode
    try {
      const qcResult = await executeQuery(`EXEC [dbo].[HHT_QcStatus_SerialNo] @SerialNo`, [
        { name: 'SerialNo', type: sql.NVarChar, value: ScanBarcode },
      ]);

      const qcStatus = qcResult[0]?.QCStatus || null;

      res.json({ result: result, qcStatus });
    } catch (qcError) {
      console.error('Error fetching QC status for serial:', qcError);
      res.json({ result: result, qcStatus: null });
    }
  } catch (error) {
    console.error('Error validating barcode:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const inwardBarcodeDataUpdate = async (req, res) => {
  const { V_ScanBarcodes, UserId, UNIT, UNIT_ISO, storageLocation, Approve, QC } = req.body;

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
    let goodsmvtItemsQC = [];
    const gmCode = '04';
    let errorMessages = [];
    let qcFailed = false;

    // Parse concatenated values
    const unitValues = UNIT ? UNIT.split('$') : [];
    const unitIsoValues = UNIT_ISO ? UNIT_ISO.split('$') : [];
    const qcValues = QC ? QC.split('$') : [];

    const palletGroups = V_ScanBarcodes.split('*').filter(group => group.trim());

    // Process each pallet group
    for (let i = 0; i < palletGroups.length; i++) {
      const group = palletGroups[i];
      if (group.includes('#')) {
        const [pallet, rest] = group.split('#');
        if (rest) {
          const [quantity, serialList] = rest.split(';');
          if (serialList) {
            const palletQC = qcValues[i] || 'N';
            const serials = serialList.split('$').filter(s => s);
            const currentPalletBarcode = pallet;
            const parsedQuantity = parseFloat(quantity || 0);
            palletQuantities.set(pallet, parsedQuantity);

            // Get units for this pallet
            const currentUnit = unitValues[i] || 'ST';
            const currentUnitIso = unitIsoValues[i] || 'PCE';

            // Get details from first serial of this pallet
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

            let moveType, stockType, moveStloc, destinationStorage;

            if (Approve === true) {
              moveType = '311';
              stockType = ' ';
              moveStloc = '5120';
              destinationStorage = '5110';
            }

            // If QC value is N, add to QC items array
            if (palletQC === 'N') {
              goodsmvtItemsQC.push({
                MATERIAL: formattedMaterialNo,
                PLANT: '5100',
                STGE_LOC: '5110',
                BATCH: Batch,
                MOVE_TYPE: '321',
                STCK_TYPE: ' ',
                ITEM_TEXT: currentPalletBarcode,
                ENTRY_QNT: parsedQuantity,
                ENTRY_UOM: currentUnit,
                ENTRY_UOM_ISO: currentUnitIso,
                PO_PR_QNT: parsedQuantity,
                ORDERID: formattedOrderNo,
                MVT_IND: '',
              });
            }

            // Add pallet item to regular GOODSMVT_ITEM array (for all pallets)
            goodsmvtItems.push({
              MATERIAL: formattedMaterialNo,
              PLANT: '5100',
              STGE_LOC: destinationStorage,
              BATCH: Batch,
              MOVE_TYPE: moveType,
              STCK_TYPE: stockType,
              MOVE_BATCH: Batch,
              MOVE_STLOC: moveStloc,
              SPEC_STOCK: '',
              MVT_IND: '',
              ITEM_TEXT: currentPalletBarcode, // Using pallet barcode as ITEM_TEXT
              ENTRY_QNT: parsedQuantity,
              ENTRY_UOM: currentUnit,
              ENTRY_UOM_ISO: currentUnitIso,
              PO_PR_QNT: parsedQuantity,
              ORDERID: formattedOrderNo,
            });

            // Storing serial numbers for database update
            allSerialNumbers = [
              ...allSerialNumbers,
              ...serials.map(serial => ({
                serial,
                palletBarcode: currentPalletBarcode,
                quantity: parsedQuantity,
                qcValue: palletQC,
              })),
            ];
          }
        }
      }
    }

    if (goodsmvtItems.length === 0) {
      return res.json({
        Status: 'F',
        Message: 'No valid items to process',
      });
    }

    const currentDate = format(new Date(), 'dd.MM.yyyy');
    let materialDocument = '';
    let qcMaterialDocument = '';

    // First process QC items if any exist
    if (goodsmvtItemsQC.length > 0) {
      const qcSapRequestBody = {
        ConnectionParams: SAP_SERVER,
        GOODSMVT_CODE: { GM_CODE: gmCode },
        GOODSMVT_HEADER: {
          PSTNG_DATE: currentDate,
          DOC_DATE: currentDate,
          HEADER_TXT: 'Internal Movement',
          PR_UNAME: UserId,
        },
        GOODSMVT_ITEM: goodsmvtItemsQC,
        TESTRUN: false,
      };

      try {
        const qcResponse = await axios.post(
          `${SAP_CONNECTOR_MIDDLEWARE_URL}/api/goods-movement/create`,
          qcSapRequestBody,
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 60000,
          }
        );

        const qcSapResponse = qcResponse.data;

        qcMaterialDocument = qcSapResponse.GoodsMovementHeadRet?.MAT_DOC;

        if (qcResponse.data.Return && qcResponse.data.Return.length > 0) {
          const returnMessage = qcResponse.data.Return[0];
          if (['E', 'I', 'A'].includes(returnMessage.TYPE)) {
            // Log error for QC items
            for (const item of goodsmvtItemsQC) {
              await executeQuery(
                `EXEC [dbo].[Sp_SAP_INWARD_ERROR_LOG_Insert] 
                                    @PalletBarcode, 
                                    @ORDER_NUMBER, 
                                    @MATERIAL, 
                                    @BATCH,
                                    @MOVE_BATCH,
                                    @MOVE_STORAGELOCATION,
                                    @MOVEMENT_TYPE,
                                    @STOCK_TYPE,
                                    @STORAGE_LOCATION,
                                    @MOVEMENT_INDICATOR,
                                    @PRODUCTION_PLANT,
                                    @Qty,
                                    @Error_Message,
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
                    name: 'MOVE_BATCH',
                    type: sql.NVarChar(50),
                    value: item.MOVE_BATCH || '',
                  },
                  {
                    name: 'MOVE_STORAGELOCATION',
                    type: sql.NVarChar(50),
                    value: item.MOVE_STLOC || '',
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
                    value: item.MVT_IND || '',
                  },
                  {
                    name: 'PRODUCTION_PLANT',
                    type: sql.NVarChar(50),
                    value: item.PLANT,
                  },
                  { name: 'Qty', type: sql.Decimal, value: item.ENTRY_QNT },
                  {
                    name: 'Error_Message',
                    type: sql.NVarChar(500),
                    value: `QC Error: ${returnMessage.MESSAGE}`,
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
                  { name: 'GM_CODE', type: sql.NVarChar(50), value: gmCode },
                  { name: 'CreatedBy', type: sql.NVarChar(50), value: UserId },
                ]
              );
            }

            // Also log the same errors for corresponding items in goodsmvtItems
            for (const item of goodsmvtItems) {
              const matchingQCItem = goodsmvtItemsQC.find(qcItem => qcItem.ITEM_TEXT === item.ITEM_TEXT);
              if (matchingQCItem) {
                await executeQuery(
                  `EXEC [dbo].[Sp_SAP_INWARD_ERROR_LOG_Insert] 
                                        @PalletBarcode, 
                                        @ORDER_NUMBER, 
                                        @MATERIAL, 
                                        @BATCH,
                                        @MOVE_BATCH,
                                        @MOVE_STORAGELOCATION,
                                        @MOVEMENT_TYPE,
                                        @STOCK_TYPE,
                                        @STORAGE_LOCATION,
                                        @MOVEMENT_INDICATOR,
                                        @PRODUCTION_PLANT,
                                        @Qty,
                                        @Error_Message,
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
                    {
                      name: 'BATCH',
                      type: sql.NVarChar(50),
                      value: item.BATCH,
                    },
                    {
                      name: 'MOVE_BATCH',
                      type: sql.NVarChar(50),
                      value: item.MOVE_BATCH || '',
                    },
                    {
                      name: 'MOVE_STORAGELOCATION',
                      type: sql.NVarChar(50),
                      value: item.MOVE_STLOC || '',
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
                      value: item.MVT_IND || '',
                    },
                    {
                      name: 'PRODUCTION_PLANT',
                      type: sql.NVarChar(50),
                      value: item.PLANT,
                    },
                    { name: 'Qty', type: sql.Decimal, value: item.ENTRY_QNT },
                    {
                      name: 'Error_Message',
                      type: sql.NVarChar(500),
                      value: `QC Error affected this movement: ${returnMessage.MESSAGE}`,
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
                    { name: 'GM_CODE', type: sql.NVarChar(50), value: gmCode },
                    {
                      name: 'CreatedBy',
                      type: sql.NVarChar(50),
                      value: UserId,
                    },
                  ]
                );
              }
            }

            errorMessages.push(`QC Error: ${returnMessage.MESSAGE}`);
            qcFailed = true;
          }
        }

        if (!qcMaterialDocument) {
          const errorMessage =
            qcSapResponse.Return[0]?.MESSAGE || 'Failed to get material document number for QC transaction';
          errorMessages.push(errorMessage);

          // Log error for QC items
          for (const item of goodsmvtItemsQC) {
            await executeQuery(
              `EXEC [dbo].[Sp_SAP_INWARD_ERROR_LOG_Insert] 
                                @PalletBarcode, 
                                @ORDER_NUMBER, 
                                @MATERIAL, 
                                @BATCH,
                                @MOVE_BATCH,
                                @MOVE_STORAGELOCATION,
                                @MOVEMENT_TYPE,
                                @STOCK_TYPE,
                                @STORAGE_LOCATION,
                                @MOVEMENT_INDICATOR,
                                @PRODUCTION_PLANT,
                                @Qty,
                                @Error_Message,
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
                  name: 'MOVE_BATCH',
                  type: sql.NVarChar(50),
                  value: item.MOVE_BATCH || '',
                },
                {
                  name: 'MOVE_STORAGELOCATION',
                  type: sql.NVarChar(50),
                  value: item.MOVE_STLOC || '',
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
                  value: item.MVT_IND || '',
                },
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
                { name: 'UNIT', type: sql.NVarChar(50), value: item.ENTRY_UOM },
                {
                  name: 'UNIT_ISO',
                  type: sql.NVarChar(50),
                  value: item.ENTRY_UOM_ISO,
                },
                { name: 'GM_CODE', type: sql.NVarChar(50), value: gmCode },
                { name: 'CreatedBy', type: sql.NVarChar(50), value: UserId },
              ]
            );
          }

          // Also log for corresponding main movement items
          for (const item of goodsmvtItems) {
            const matchingQCItem = goodsmvtItemsQC.find(qcItem => qcItem.ITEM_TEXT === item.ITEM_TEXT);
            if (matchingQCItem) {
              await executeQuery(
                `EXEC [dbo].[Sp_SAP_INWARD_ERROR_LOG_Insert] 
                                    @PalletBarcode, 
                                    @ORDER_NUMBER, 
                                    @MATERIAL, 
                                    @BATCH,
                                    @MOVE_BATCH,
                                    @MOVE_STORAGELOCATION,
                                    @MOVEMENT_TYPE,
                                    @STOCK_TYPE,
                                    @STORAGE_LOCATION,
                                    @MOVEMENT_INDICATOR,
                                    @PRODUCTION_PLANT,
                                    @Qty,
                                    @Error_Message,
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
                    name: 'MOVE_BATCH',
                    type: sql.NVarChar(50),
                    value: item.MOVE_BATCH || '',
                  },
                  {
                    name: 'MOVE_STORAGELOCATION',
                    type: sql.NVarChar(50),
                    value: item.MOVE_STLOC || '',
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
                    value: item.MVT_IND || '',
                  },
                  {
                    name: 'PRODUCTION_PLANT',
                    type: sql.NVarChar(50),
                    value: item.PLANT,
                  },
                  { name: 'Qty', type: sql.Decimal, value: item.ENTRY_QNT },
                  {
                    name: 'Error_Message',
                    type: sql.NVarChar(500),
                    value: `QC transaction failed: ${errorMessage}`,
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
                  { name: 'GM_CODE', type: sql.NVarChar(50), value: gmCode },
                  { name: 'CreatedBy', type: sql.NVarChar(50), value: UserId },
                ]
              );
            }
          }

          qcFailed = true;
        }

        if (!qcFailed) {
          // console.log(`QC posting successful with document: ${qcMaterialDocument}`);
        }
      } catch (qcError) {
        console.error('QC SAP API Error Details:', {
          response: qcError.response?.data,
          status: qcError.response?.status,
          headers: qcError.response?.headers,
        });

        const errorMessage =
          qcError.response?.data?.Message || qcError.response?.data?.ModelState
            ? JSON.stringify(qcError.response.data.ModelState)
            : qcError.message;

        // Log error for QC items
        for (const item of goodsmvtItemsQC) {
          await executeQuery(
            `EXEC [dbo].[Sp_SAP_INWARD_ERROR_LOG_Insert] 
                            @PalletBarcode, 
                            @ORDER_NUMBER, 
                            @MATERIAL, 
                            @BATCH,
                            @MOVE_BATCH,
                            @MOVE_STORAGELOCATION,
                            @MOVEMENT_TYPE,
                            @STOCK_TYPE,
                            @STORAGE_LOCATION,
                            @MOVEMENT_INDICATOR,
                            @PRODUCTION_PLANT,
                            @Qty,
                            @Error_Message,
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
                name: 'MOVE_BATCH',
                type: sql.NVarChar(50),
                value: item.MOVE_BATCH || '',
              },
              {
                name: 'MOVE_STORAGELOCATION',
                type: sql.NVarChar(50),
                value: item.MOVE_STLOC || '',
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
                value: item.MVT_IND || '',
              },
              {
                name: 'PRODUCTION_PLANT',
                type: sql.NVarChar(50),
                value: item.PLANT,
              },
              { name: 'Qty', type: sql.Decimal, value: item.ENTRY_QNT },
              {
                name: 'Error_Message',
                type: sql.NVarChar(500),
                value: `QC SAP Error: ${errorMessage}`,
              },
              { name: 'UNIT', type: sql.NVarChar(50), value: item.ENTRY_UOM },
              {
                name: 'UNIT_ISO',
                type: sql.NVarChar(50),
                value: item.ENTRY_UOM_ISO,
              },
              { name: 'GM_CODE', type: sql.NVarChar(50), value: gmCode },
              { name: 'CreatedBy', type: sql.NVarChar(50), value: UserId },
            ]
          );
        }

        // Also log for corresponding main movement items
        for (const item of goodsmvtItems) {
          const matchingQCItem = goodsmvtItemsQC.find(qcItem => qcItem.ITEM_TEXT === item.ITEM_TEXT);
          if (matchingQCItem) {
            await executeQuery(
              `EXEC [dbo].[Sp_SAP_INWARD_ERROR_LOG_Insert] 
                                @PalletBarcode, 
                                @ORDER_NUMBER, 
                                @MATERIAL, 
                                @BATCH,
                                @MOVE_BATCH,
                                @MOVE_STORAGELOCATION,
                                @MOVEMENT_TYPE,
                                @STOCK_TYPE,
                                @STORAGE_LOCATION,
                                @MOVEMENT_INDICATOR,
                                @PRODUCTION_PLANT,
                                @Qty,
                                @Error_Message,
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
                  name: 'MOVE_BATCH',
                  type: sql.NVarChar(50),
                  value: item.MOVE_BATCH || '',
                },
                {
                  name: 'MOVE_STORAGELOCATION',
                  type: sql.NVarChar(50),
                  value: item.MOVE_STLOC || '',
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
                  value: item.MVT_IND || '',
                },
                {
                  name: 'PRODUCTION_PLANT',
                  type: sql.NVarChar(50),
                  value: item.PLANT,
                },
                { name: 'Qty', type: sql.Decimal, value: item.ENTRY_QNT },
                {
                  name: 'Error_Message',
                  type: sql.NVarChar(500),
                  value: `Related QC posting failed: ${errorMessage}`,
                },
                { name: 'UNIT', type: sql.NVarChar(50), value: item.ENTRY_UOM },
                {
                  name: 'UNIT_ISO',
                  type: sql.NVarChar(50),
                  value: item.ENTRY_UOM_ISO,
                },
                { name: 'GM_CODE', type: sql.NVarChar(50), value: gmCode },
                { name: 'CreatedBy', type: sql.NVarChar(50), value: UserId },
              ]
            );
          }
        }

        errorMessages.push(`QC SAP Error: ${errorMessage}`);
        qcFailed = true;
      }
    }

    const sapRequestBody = {
      ConnectionParams: SAP_SERVER,
      GOODSMVT_CODE: { GM_CODE: gmCode },
      GOODSMVT_HEADER: {
        PSTNG_DATE: currentDate,
        DOC_DATE: currentDate,
        HEADER_TXT: '',
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

      if (!materialDocument) {
        const errorMessage = sapResponse.Return[0]?.MESSAGE || 'Failed to get material document number from SAP';
        errorMessages.push(errorMessage);

        for (const item of goodsmvtItems) {
          await executeQuery(
            `EXEC [dbo].[Sp_SAP_INWARD_ERROR_LOG_Insert] 
                            @PalletBarcode, 
                            @ORDER_NUMBER, 
                            @MATERIAL, 
                            @BATCH,
                            @MOVE_BATCH,
                            @MOVE_STORAGELOCATION,
                            @MOVEMENT_TYPE,
                            @STOCK_TYPE,
                            @STORAGE_LOCATION,
                            @MOVEMENT_INDICATOR,
                            @PRODUCTION_PLANT,
                            @Qty,
                            @Error_Message,
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
                name: 'MOVE_BATCH',
                type: sql.NVarChar(50),
                value: item.MOVE_BATCH || '',
              },
              {
                name: 'MOVE_STORAGELOCATION',
                type: sql.NVarChar(50),
                value: item.MOVE_STLOC || '',
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
                value: item.MVT_IND || '',
              },
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
              { name: 'UNIT', type: sql.NVarChar(50), value: item.ENTRY_UOM },
              {
                name: 'UNIT_ISO',
                type: sql.NVarChar(50),
                value: item.ENTRY_UOM_ISO,
              },
              { name: 'GM_CODE', type: sql.NVarChar(50), value: gmCode },
              { name: 'CreatedBy', type: sql.NVarChar(50), value: UserId },
            ]
          );
        }

        materialDocument = '';
      }

      if (response.data.Return && response.data.Return.length > 0) {
        const returnMessage = response.data.Return[0];
        if (['E', 'I', 'A'].includes(returnMessage.TYPE)) {
          for (const item of goodsmvtItems) {
            await executeQuery(
              `EXEC [dbo].[Sp_SAP_INWARD_ERROR_LOG_Insert] 
                                @PalletBarcode, 
                                @ORDER_NUMBER, 
                                @MATERIAL, 
                                @BATCH,
                                @MOVE_BATCH,
                                @MOVE_STORAGELOCATION,
                                @MOVEMENT_TYPE,
                                @STOCK_TYPE,
                                @STORAGE_LOCATION,
                                @MOVEMENT_INDICATOR,
                                @PRODUCTION_PLANT,
                                @Qty,
                                @Error_Message,
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
                  name: 'MOVE_BATCH',
                  type: sql.NVarChar(50),
                  value: item.MOVE_BATCH || '',
                },
                {
                  name: 'MOVE_STORAGELOCATION',
                  type: sql.NVarChar(50),
                  value: item.MOVE_STLOC || '',
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
                  value: item.MVT_IND || '',
                },
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
                { name: 'UNIT', type: sql.NVarChar(50), value: item.ENTRY_UOM },
                {
                  name: 'UNIT_ISO',
                  type: sql.NVarChar(50),
                  value: item.ENTRY_UOM_ISO,
                },
                { name: 'GM_CODE', type: sql.NVarChar(50), value: gmCode },
                { name: 'CreatedBy', type: sql.NVarChar(50), value: UserId },
              ]
            );
          }

          errorMessages.push(returnMessage.MESSAGE);
          materialDocument = '';
        }
      }

      // Continue with database updates regardless of SAP success/failure
      for (const { serial, palletBarcode, qcValue } of allSerialNumbers) {
        if (serial.trim()) {
          await executeQuery(
            `EXEC [dbo].[HHT_FG_Inward_BarcodeUpdate] @ScanBarcode, @PalletBarcode, @MaterialDocument, @StorageLocation, @UserId,@QCStatus`,
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
                value: materialDocument,
              },
              {
                name: 'StorageLocation',
                type: sql.NVarChar(50),
                value: storageLocation,
              },
              { name: 'UserId', type: sql.NVarChar(50), value: UserId },
              {
                name: 'QCStatus',
                type: sql.NVarChar(50),
                value: Approve === true ? 'Unrestricted' : 'Blocked',
              },
            ]
          );
        }
      }

      // Determine the response message based on errors and documents
      let responseMessage;
      if (errorMessages.length > 0) {
        responseMessage = `Inward done but SAP pending ⚠️ - errors: ${errorMessages.join('; ')}`;
      } else if (qcMaterialDocument && materialDocument) {
        responseMessage = `Good receipt done. Document numbers: ${materialDocument} (5120 Posted), ${qcMaterialDocument} (QC)`;
      } else if (materialDocument) {
        responseMessage = `Good receipt done. Document number: ${materialDocument}`;
      } else if (qcMaterialDocument) {
        responseMessage = `Good receipt done. Document number: ${qcMaterialDocument} (QC only)`;
      } else {
        responseMessage = 'Good receipt done but SAP documents pending';
      }

      res.json({
        Status: 'T',
        Message: responseMessage,
        ProcessedCount: allSerialNumbers.length,
        TotalQuantity: Array.from(palletQuantities.values()).reduce((a, b) => a + b, 0),
        MaterialDocument: materialDocument || undefined,
        QCMaterialDocument: qcMaterialDocument || undefined,
        PartialFailures: errorMessages.length > 0,
        ErrorMessages: errorMessages.length > 0 ? errorMessages : undefined,
      });
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

      errorMessages.push(`SAP API Error: ${errorMessage}`);

      // Log error for each item
      for (const item of goodsmvtItems) {
        await executeQuery(
          `EXEC [dbo].[Sp_SAP_INWARD_ERROR_LOG_Insert] 
                        @PalletBarcode, 
                        @ORDER_NUMBER, 
                        @MATERIAL, 
                        @BATCH,
                        @MOVE_BATCH,
                        @MOVE_STORAGELOCATION,
                        @MOVEMENT_TYPE,
                        @STOCK_TYPE,
                        @STORAGE_LOCATION,
                        @MOVEMENT_INDICATOR,
                        @PRODUCTION_PLANT,
                        @Qty,
                        @Error_Message,
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
            { name: 'MATERIAL', type: sql.NVarChar(50), value: item.MATERIAL },
            { name: 'BATCH', type: sql.NVarChar(50), value: item.BATCH },
            {
              name: 'MOVE_BATCH',
              type: sql.NVarChar(50),
              value: item.MOVE_BATCH || '',
            },
            {
              name: 'MOVE_STORAGELOCATION',
              type: sql.NVarChar(50),
              value: item.MOVE_STLOC || '',
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
              value: item.MVT_IND || '',
            },
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
            { name: 'UNIT', type: sql.NVarChar(50), value: item.ENTRY_UOM },
            {
              name: 'UNIT_ISO',
              type: sql.NVarChar(50),
              value: item.ENTRY_UOM_ISO,
            },
            { name: 'GM_CODE', type: sql.NVarChar(50), value: gmCode },
            { name: 'CreatedBy', type: sql.NVarChar(50), value: UserId },
          ]
        );
      }

      // Still proceed with database updates
      for (const { serial, palletBarcode, qcValue } of allSerialNumbers) {
        if (serial.trim()) {
          await executeQuery(
            `EXEC [dbo].[HHT_FG_Inward_BarcodeUpdate] @ScanBarcode, @PalletBarcode, @MaterialDocument, @StorageLocation, @UserId,@QCStatus`,
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
              { name: 'MaterialDocument', type: sql.NVarChar(50), value: '' }, // Empty material document
              {
                name: 'StorageLocation',
                type: sql.NVarChar(50),
                value: storageLocation,
              },
              { name: 'UserId', type: sql.NVarChar(50), value: UserId },
              {
                name: 'QCStatus',
                type: sql.NVarChar(50),
                value: Approve === true ? 'Unrestricted' : 'Blocked',
              },
            ]
          );
        }
      }

      res.json({
        Status: 'T', // Using T to indicate process continues despite SAP errors
        Message: `Inward done but SAP pending ⚠️ - errors: ${errorMessages.join('; ')}`,
        ProcessedCount: allSerialNumbers.length,
        TotalQuantity: Array.from(palletQuantities.values()).reduce((a, b) => a + b, 0),
        QCMaterialDocument: qcMaterialDocument || undefined,
        PartialFailures: true,
        ErrorMessages: errorMessages,
      });
    }
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
