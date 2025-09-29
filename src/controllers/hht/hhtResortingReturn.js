import { executeQuery, sql } from '../../config/db.js';
import { format } from 'date-fns';
import axios from 'axios';
import { SAP_CONNECTOR_MIDDLEWARE_URL, SAP_SERVER } from '../../utils/constants.js';

export const validateResortingReturnBarcode = async (req, res) => {
  const { ScanBarcode } = req.body;

  try {
    const result = await executeQuery('EXEC [dbo].[HHT_Resorting_ReturnValidation] @ScanBarcode', [
      { name: 'ScanBarcode', type: sql.NVarChar(255), value: ScanBarcode },
    ]);

    if (result[0].Status === 'T') {
      result[0].ORDER_NUMBER = result[0].ORDER_NUMBER
        ? result[0].ORDER_NUMBER.replace(/^0+/, '')
        : result[0].ORDER_NUMBER;
      result[0].MATERIAL = result[0].MATERIAL ? result[0].MATERIAL.replace(/^0+/, '') : result[0].MATERIAL;
    }

    res.status(200).json(result[0]);
  } catch (error) {
    console.error('Error validating resorting return barcode:', error);
    res.status(500).json({
      Status: 'F',
      Message: 'Failed to validate barcode',
      error: error.message,
    });
  }
};

export const updateResortingReturn = async (req, res) => {
  const {
    PalletBarcode,
    UserId,
    ORDER_NUMBER,
    MATERIAL,
    BATCH,
    STORAGE_LOCATION,
    QUANTITY,
    PRODUCTION_PLANT,
    UNIT,
    UNIT_ISO,
    isExisting,
  } = req.body;

  try {
    const barcodeEntries = PalletBarcode ? PalletBarcode.split('$').filter(entry => entry.trim()) : [];

    const units = UNIT ? UNIT.split('$') : [];
    const unitIsos = UNIT_ISO ? UNIT_ISO.split('$') : [];
    const storageLocations = STORAGE_LOCATION ? STORAGE_LOCATION.split('$') : [];
    const batches = BATCH ? BATCH.split('$') : [];
    const quantities = QUANTITY ? QUANTITY.split('$') : [];
    const materials = MATERIAL ? MATERIAL.split('$') : [];
    const isExistingValues = isExisting ? isExisting.split('$') : [];

    let allSerialNumbers = [];
    let goodsmvtItems343 = [];
    let goodsmvtItems311 = [];

    for (let i = 0; i < barcodeEntries.length; i++) {
      const currentIsExisting = isExistingValues[i] === 'true'; // Convert string to boolean

      const pallet = barcodeEntries.length > i ? barcodeEntries[i].trim() : '';

      const material = materials.length > i ? materials[i] : materials[0] || '';
      const paddedMaterial = material.toString().padStart(18, '0');

      const batch = batches.length > i ? batches[i] : batches[0] || '';
      const unit = units.length > i ? units[i] : 'ST';
      const unit_iso = unitIsos.length > i ? unitIsos[i] : 'PCE';
      const targetStorageLoc = storageLocations.length > i ? storageLocations[i] : '5120';
      const actualQty = quantities.length > i ? quantities[i] : '1';

      goodsmvtItems343.push({
        MATERIAL: paddedMaterial,
        PLANT: PRODUCTION_PLANT || '5100',
        STGE_LOC: '5190',
        BATCH: batch,
        MOVE_TYPE: '343',
        STCK_TYPE: 'S',
        MOVE_STLOC: '5190',
        STCK_TYPE_TGT: ' ',
        ITEM_TEXT: pallet.length > 45 ? pallet.substring(0, 45) : pallet,
        ENTRY_QNT: parseInt(actualQty),
        ENTRY_UOM: unit,
        ENTRY_UOM_ISO: unit_iso,
        MVT_IND: '',
      });

      goodsmvtItems311.push({
        MATERIAL: paddedMaterial,
        PLANT: PRODUCTION_PLANT || '5100',
        STGE_LOC: '5190',
        BATCH: batch,
        MOVE_TYPE: '311',
        STCK_TYPE: ' ',
        MOVE_STLOC: targetStorageLoc,
        ITEM_TEXT: pallet.length > 45 ? pallet.substring(0, 45) : pallet,
        ENTRY_QNT: parseInt(actualQty),
        ENTRY_UOM: unit,
        ENTRY_UOM_ISO: unit_iso,
        PO_PR_QNT: parseInt(actualQty),
        MVT_IND: '',
      });

      allSerialNumbers.push({
        serial: pallet,
        orderNo: ORDER_NUMBER ? ORDER_NUMBER.toString().padStart(12, '0') : '',
        material: paddedMaterial,
        batch: batch,
        quantity: parseInt(actualQty),
        unit: unit,
        unitIso: unit_iso,
        targetStorageLoc: targetStorageLoc,
        isExisting: currentIsExisting,
      });
    }

    const batchSize = 50;
    const materialDocuments343 = [];
    const materialDocuments311 = [];
    const errorMessages343 = [];
    const errorMessages311 = [];
    const currentDate = format(new Date(), 'dd.MM.yyyy');
    console.log('Resorting Return Items 343:', goodsmvtItems343);
    console.log('Resorting Return Items 311:', goodsmvtItems311);

    let hasAny343Errors = false;
    let hasAny311Errors = false;

    try {
      for (let i = 0; i < goodsmvtItems343.length; i += batchSize) {
        const batch343 = goodsmvtItems343.slice(i, i + batchSize);

        try {
          const { data: sapResponse343 } = await axios.post(
            `${SAP_CONNECTOR_MIDDLEWARE_URL}/api/goods-movement/create`,
            {
              ConnectionParams: SAP_SERVER,
              GOODSMVT_CODE: { GM_CODE: '04' },
              GOODSMVT_HEADER: {
                PSTNG_DATE: currentDate,
                DOC_DATE: currentDate,
                HEADER_TXT: 'Resorting Return',
                PR_UNAME: UserId,
              },
              GOODSMVT_ITEM: batch343,
              TESTRUN: false,
            },
            {
              headers: { 'Content-Type': 'application/json' },
              timeout: 30000,
            }
          );

          if (sapResponse343.Return && Array.isArray(sapResponse343.Return) && sapResponse343.Return.length > 0) {
            const returnMessage = sapResponse343.Return[0];
            if (['E', 'I', 'A'].includes(returnMessage.TYPE)) {
              hasAny343Errors = true;
              errorMessages343.push(`343 movement error: ${returnMessage.MESSAGE || 'Unknown error'}`);

              for (const item of batch343) {
                await executeQuery(
                  `EXEC [dbo].[Sp_SAP_RESORTING_RETURN_ERROR_LOG_Insert] 
                                        @PalletBarcode, @ORDER_NUMBER, @MATERIAL, @BATCH, @PRODUCTION_PLANT,
                                        @STORAGE_LOCATION, @MOVE_TYPE, @STOCK_TYPE, @MOVE_BATCH, @MOVE_STORAGELOCATION,
                                        @SPEC_STOCK, @MOVEMENT_INDICATOR, @UOM, @UOM_ISO, @Qty, @Error_Message, @GM_CODE, @CreatedBy`,
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
                    {
                      name: 'BATCH',
                      type: sql.NVarChar(50),
                      value: item.BATCH,
                    },
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
                      name: 'MOVE_TYPE',
                      type: sql.NVarChar(50),
                      value: item.MOVE_TYPE,
                    },
                    {
                      name: 'STOCK_TYPE',
                      type: sql.NVarChar(50),
                      value: item.STCK_TYPE,
                    },
                    { name: 'MOVE_BATCH', type: sql.NVarChar(50), value: '' },
                    {
                      name: 'MOVE_STORAGELOCATION',
                      type: sql.NVarChar(50),
                      value: item.MOVE_STLOC || '',
                    },
                    { name: 'SPEC_STOCK', type: sql.NVarChar(50), value: '' },
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
                    {
                      name: 'Qty',
                      type: sql.Decimal(18, 3),
                      value: item.ENTRY_QNT,
                    },
                    {
                      name: 'Error_Message',
                      type: sql.NVarChar(500),
                      value: returnMessage.MESSAGE || 'Unknown error',
                    },
                    { name: 'GM_CODE', type: sql.NVarChar(50), value: '04' },
                    {
                      name: 'CreatedBy',
                      type: sql.NVarChar(50),
                      value: UserId,
                    },
                  ]
                );
              }
              continue;
            }
          }

          // Check if we got a material document number (success indicator)
          const materialDocument343 = sapResponse343.GoodsMovementHeadRet?.MAT_DOC;

          if (!materialDocument343) {
            hasAny343Errors = true;
            const errorMessage = 'Failed to get material document number for 343 transaction';
            errorMessages343.push(errorMessage);

            // Log SAP error to database
            for (const item of batch343) {
              await executeQuery(
                `EXEC [dbo].[Sp_SAP_RESORTING_RETURN_ERROR_LOG_Insert] 
                                    @PalletBarcode, @ORDER_NUMBER, @MATERIAL, @BATCH, @PRODUCTION_PLANT,
                                    @STORAGE_LOCATION, @MOVE_TYPE, @STOCK_TYPE, @MOVE_BATCH, @MOVE_STORAGELOCATION,
                                    @SPEC_STOCK, @MOVEMENT_INDICATOR, @UOM, @UOM_ISO, @Qty, @Error_Message, @GM_CODE, @CreatedBy`,
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
                    value: item.PLANT,
                  },
                  {
                    name: 'STORAGE_LOCATION',
                    type: sql.NVarChar(50),
                    value: item.STGE_LOC,
                  },
                  {
                    name: 'MOVE_TYPE',
                    type: sql.NVarChar(50),
                    value: item.MOVE_TYPE,
                  },
                  {
                    name: 'STOCK_TYPE',
                    type: sql.NVarChar(50),
                    value: item.STCK_TYPE,
                  },
                  { name: 'MOVE_BATCH', type: sql.NVarChar(50), value: '' },
                  {
                    name: 'MOVE_STORAGELOCATION',
                    type: sql.NVarChar(50),
                    value: item.MOVE_STLOC || '',
                  },
                  { name: 'SPEC_STOCK', type: sql.NVarChar(50), value: '' },
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
                  {
                    name: 'Qty',
                    type: sql.Decimal(18, 3),
                    value: item.ENTRY_QNT,
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
          } else {
            materialDocuments343.push(materialDocument343);
          }
        } catch (sap343Error) {
          hasAny343Errors = true;
          const errorMsg = `343 SAP call failed: ${sap343Error.message}`;
          errorMessages343.push(errorMsg);
          console.error(errorMsg, sap343Error);

          for (const item of batch343) {
            await executeQuery(
              `EXEC [dbo].[Sp_SAP_RESORTING_RETURN_ERROR_LOG_Insert] 
                                @PalletBarcode, @ORDER_NUMBER, @MATERIAL, @BATCH, @PRODUCTION_PLANT,
                                @STORAGE_LOCATION, @MOVE_TYPE, @STOCK_TYPE, @MOVE_BATCH, @MOVE_STORAGELOCATION,
                                @SPEC_STOCK, @MOVEMENT_INDICATOR, @UOM, @UOM_ISO, @Qty, @Error_Message, @GM_CODE, @CreatedBy`,
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
                  value: item.PLANT,
                },
                {
                  name: 'STORAGE_LOCATION',
                  type: sql.NVarChar(50),
                  value: item.STGE_LOC,
                },
                {
                  name: 'MOVE_TYPE',
                  type: sql.NVarChar(50),
                  value: item.MOVE_TYPE,
                },
                {
                  name: 'STOCK_TYPE',
                  type: sql.NVarChar(50),
                  value: item.STCK_TYPE,
                },
                { name: 'MOVE_BATCH', type: sql.NVarChar(50), value: '' },
                {
                  name: 'MOVE_STORAGELOCATION',
                  type: sql.NVarChar(50),
                  value: item.MOVE_STLOC || '',
                },
                { name: 'SPEC_STOCK', type: sql.NVarChar(50), value: '' },
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
                {
                  name: 'Qty',
                  type: sql.Decimal(18, 3),
                  value: item.ENTRY_QNT,
                },
                {
                  name: 'Error_Message',
                  type: sql.NVarChar(500),
                  value: `${errorMsg}`,
                },
                { name: 'GM_CODE', type: sql.NVarChar(50), value: '04' },
                { name: 'CreatedBy', type: sql.NVarChar(50), value: UserId },
              ]
            );
          }
        }
      }

      for (let i = 0; i < goodsmvtItems311.length; i += batchSize) {
        const batch311 = goodsmvtItems311.slice(i, i + batchSize);

        try {
          // Call SAP for 311 movement
          const { data: sapResponse311 } = await axios.post(
            `${SAP_CONNECTOR_MIDDLEWARE_URL}/api/goods-movement/create`,
            {
              ConnectionParams: SAP_SERVER,
              GOODSMVT_CODE: { GM_CODE: '04' },
              GOODSMVT_HEADER: {
                PSTNG_DATE: currentDate,
                DOC_DATE: currentDate,
                HEADER_TXT: 'Resorting Return',
                PR_UNAME: UserId,
              },
              GOODSMVT_ITEM: batch311,
              TESTRUN: false,
            },
            {
              headers: { 'Content-Type': 'application/json' },
              timeout: 30000,
            }
          );

          if (sapResponse311.Return && Array.isArray(sapResponse311.Return) && sapResponse311.Return.length > 0) {
            const returnMessage = sapResponse311.Return[0];
            if (['E', 'I', 'A'].includes(returnMessage.TYPE)) {
              hasAny311Errors = true;
              errorMessages311.push(`311 movement error: ${returnMessage.MESSAGE || 'Unknown error'}`);

              // Log SAP error to database
              for (const item of batch311) {
                await executeQuery(
                  `EXEC [dbo].[Sp_SAP_RESORTING_RETURN_ERROR_LOG_Insert] 
                                        @PalletBarcode, @ORDER_NUMBER, @MATERIAL, @BATCH, @PRODUCTION_PLANT,
                                        @STORAGE_LOCATION, @MOVE_TYPE, @STOCK_TYPE, @MOVE_BATCH, @MOVE_STORAGELOCATION,
                                        @SPEC_STOCK, @MOVEMENT_INDICATOR, @UOM, @UOM_ISO, @Qty, @Error_Message, @GM_CODE, @CreatedBy`,
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
                    {
                      name: 'BATCH',
                      type: sql.NVarChar(50),
                      value: item.BATCH,
                    },
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
                      name: 'MOVE_TYPE',
                      type: sql.NVarChar(50),
                      value: item.MOVE_TYPE,
                    },
                    {
                      name: 'STOCK_TYPE',
                      type: sql.NVarChar(50),
                      value: item.STCK_TYPE,
                    },
                    { name: 'MOVE_BATCH', type: sql.NVarChar(50), value: '' },
                    {
                      name: 'MOVE_STORAGELOCATION',
                      type: sql.NVarChar(50),
                      value: item.MOVE_STLOC || '',
                    },
                    { name: 'SPEC_STOCK', type: sql.NVarChar(50), value: '' },
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
                    {
                      name: 'Qty',
                      type: sql.Decimal(18, 3),
                      value: item.ENTRY_QNT,
                    },
                    {
                      name: 'Error_Message',
                      type: sql.NVarChar(500),
                      value: returnMessage.MESSAGE || 'Unknown error',
                    },
                    { name: 'GM_CODE', type: sql.NVarChar(50), value: '04' },
                    {
                      name: 'CreatedBy',
                      type: sql.NVarChar(50),
                      value: UserId,
                    },
                  ]
                );
              }
              continue; // Skip to next batch since this one failed
            }
          }

          // Check if we got a material document number (success indicator)
          const materialDocument311 = sapResponse311.GoodsMovementHeadRet?.MAT_DOC;

          if (!materialDocument311) {
            hasAny311Errors = true;
            const errorMessage = 'Failed to get material document number for 311 transaction';
            errorMessages311.push(errorMessage);

            // Log SAP error to database
            for (const item of batch311) {
              await executeQuery(
                `EXEC [dbo].[Sp_SAP_RESORTING_RETURN_ERROR_LOG_Insert] 
                                    @PalletBarcode, @ORDER_NUMBER, @MATERIAL, @BATCH, @PRODUCTION_PLANT,
                                    @STORAGE_LOCATION, @MOVE_TYPE, @STOCK_TYPE, @MOVE_BATCH, @MOVE_STORAGELOCATION,
                                    @SPEC_STOCK, @MOVEMENT_INDICATOR, @UOM, @UOM_ISO, @Qty, @Error_Message, @GM_CODE, @CreatedBy`,
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
                    value: item.PLANT,
                  },
                  {
                    name: 'STORAGE_LOCATION',
                    type: sql.NVarChar(50),
                    value: item.STGE_LOC,
                  },
                  {
                    name: 'MOVE_TYPE',
                    type: sql.NVarChar(50),
                    value: item.MOVE_TYPE,
                  },
                  {
                    name: 'STOCK_TYPE',
                    type: sql.NVarChar(50),
                    value: item.STCK_TYPE,
                  },
                  { name: 'MOVE_BATCH', type: sql.NVarChar(50), value: '' },
                  {
                    name: 'MOVE_STORAGELOCATION',
                    type: sql.NVarChar(50),
                    value: item.MOVE_STLOC || '',
                  },
                  { name: 'SPEC_STOCK', type: sql.NVarChar(50), value: '' },
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
                  {
                    name: 'Qty',
                    type: sql.Decimal(18, 3),
                    value: item.ENTRY_QNT,
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
          } else {
            // Success - we got material document
            materialDocuments311.push(materialDocument311);
          }
        } catch (sap311Error) {
          hasAny311Errors = true;
          const errorMsg = `311 SAP call failed: ${sap311Error.message}`;
          errorMessages311.push(errorMsg);
          console.error(errorMsg, sap311Error);

          // Log SAP connection error to database
          for (const item of batch311) {
            await executeQuery(
              `EXEC [dbo].[Sp_SAP_RESORTING_RETURN_ERROR_LOG_Insert] 
                                @PalletBarcode, @ORDER_NUMBER, @MATERIAL, @BATCH, @PRODUCTION_PLANT,
                                @STORAGE_LOCATION, @MOVE_TYPE, @STOCK_TYPE, @MOVE_BATCH, @MOVE_STORAGELOCATION,
                                @SPEC_STOCK, @MOVEMENT_INDICATOR, @UOM, @UOM_ISO, @Qty, @Error_Message, @GM_CODE, @CreatedBy`,
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
                  value: item.PLANT,
                },
                {
                  name: 'STORAGE_LOCATION',
                  type: sql.NVarChar(50),
                  value: item.STGE_LOC,
                },
                {
                  name: 'MOVE_TYPE',
                  type: sql.NVarChar(50),
                  value: item.MOVE_TYPE,
                },
                {
                  name: 'STOCK_TYPE',
                  type: sql.NVarChar(50),
                  value: item.STCK_TYPE,
                },
                { name: 'MOVE_BATCH', type: sql.NVarChar(50), value: '' },
                {
                  name: 'MOVE_STORAGELOCATION',
                  type: sql.NVarChar(50),
                  value: item.MOVE_STLOC || '',
                },
                { name: 'SPEC_STOCK', type: sql.NVarChar(50), value: '' },
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
                {
                  name: 'Qty',
                  type: sql.Decimal(18, 3),
                  value: item.ENTRY_QNT,
                },
                {
                  name: 'Error_Message',
                  type: sql.NVarChar(500),
                  value: `${errorMsg}`,
                },
                { name: 'GM_CODE', type: sql.NVarChar(50), value: '04' },
                { name: 'CreatedBy', type: sql.NVarChar(50), value: UserId },
              ]
            );
          }
        }
      }

      // Process database updates for all serials regardless of SAP success/failure
      for (let j = 0; j < allSerialNumbers.length; j += 100) {
        const chunk = allSerialNumbers.slice(j, j + 100);
        await Promise.all(
          chunk.map(serial =>
            executeQuery('EXEC [dbo].[HHT_Resorting_ReturnUpdate] @ScanBarcode, @ReturnBy', [
              {
                name: 'ScanBarcode',
                type: sql.NVarChar(255),
                value: serial.serial.trim(),
              },
              { name: 'ReturnBy', type: sql.NVarChar(50), value: UserId },
            ])
          )
        );
      }

      let responseMessage = 'Resorting return processed successfully';
      let status = 'T';

      if (hasAny343Errors || hasAny311Errors) {
        responseMessage += ' - Some SAP transactions failed and logged for retry';

        const allErrors = [];
        if (errorMessages343.length > 0) {
          allErrors.push(
            `343 errors: ${errorMessages343.slice(0, 3).join(', ')}${errorMessages343.length > 3 ? ` and ${errorMessages343.length - 3} more` : ''}`
          );
        }
        if (errorMessages311.length > 0) {
          allErrors.push(
            `311 errors: ${errorMessages311.slice(0, 3).join(', ')}${errorMessages311.length > 3 ? ` and ${errorMessages311.length - 3} more` : ''}`
          );
        }

        if (allErrors.length > 0) {
          responseMessage += `: ${allErrors.join('; ')}`;
        }
      } else {
        // Success messages
        const docs = [];
        if (materialDocuments343.length > 0) {
          docs.push(
            `343 docs: ${materialDocuments343.slice(0, 3).join(', ')}${materialDocuments343.length > 3 ? ` and ${materialDocuments343.length - 3} more` : ''}`
          );
        }
        if (materialDocuments311.length > 0) {
          docs.push(
            `311 docs: ${materialDocuments311.slice(0, 3).join(', ')}${materialDocuments311.length > 3 ? ` and ${materialDocuments311.length - 3} more` : ''}`
          );
        }

        if (docs.length > 0) {
          responseMessage += ` - SAP material documents: ${docs.join('; ')}`;
        }
      }

      res.status(200).json({
        Status: status,
        Message: responseMessage,
      });
    } catch (processError) {
      console.error('Error processing resorting return:', processError);

      // Try to update database even if SAP transactions failed
      try {
        // Process database updates for all serials
        for (let j = 0; j < allSerialNumbers.length; j += 100) {
          const chunk = allSerialNumbers.slice(j, j + 100);
          await Promise.all(
            chunk.map(serial =>
              executeQuery('EXEC [dbo].[HHT_Resorting_ReturnUpdate] @ScanBarcode, @ReturnBy', [
                {
                  name: 'ScanBarcode',
                  type: sql.NVarChar(255),
                  value: serial.serial.trim(),
                },
                { name: 'ReturnBy', type: sql.NVarChar(50), value: UserId },
              ])
            )
          );
        }

        res.status(200).json({
          Status: 'T', // Success for DB updates
          Message: `Database updated, but SAP transactions failed: ${processError.message}`,
        });
      } catch (dbError) {
        console.error('Error updating resorting return in DB after SAP failure:', dbError);
        res.status(500).json({
          Status: 'F',
          Message: 'Failed to process return in both SAP and database',
        });
      }
    }
  } catch (error) {
    console.error('Error in updateResortingReturn handler:', error);
    res.status(500).json({
      Status: 'F',
      Message: 'Failed to process return',
      error: error.message,
    });
  }
};
