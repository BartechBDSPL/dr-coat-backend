import sql from 'mssql';
import { executeQuery } from '../../config/db.js';
import { format } from 'date-fns';
import axios from 'axios';
import { SAP_CONNECTOR_MIDDLEWARE_URL, SAP_SERVER } from '../../utils/constants.js';

export const insertResortingScrapDetails = async (req, res) => {
  const {
    ORDER_NUMBER,
    PRODUCTION_PLANT,
    MATERIAL,
    MATERIAL_TEXT,
    BATCH,
    BATCH_TO_PICK,
    STORAGE_LOCATION,
    WORK_CENTER,
    UNIT,
    UNIT_ISO,
    ScrapQty,
    ScrapBy,
  } = req.body;

  try {
    const paddedOrderNumber = ORDER_NUMBER.toString().padStart(12, '0');
    const paddedMaterial = MATERIAL.toString().padStart(18, '0');

    const currentDate = format(new Date(), 'dd.MM.yyyy');
    let materialDocument = '';
    let sapError = false;
    let sapErrorMessage = '';

    // Create SAP request body with proper formatting (matching Postman)
    const sapRequestBody = {
      ConnectionParams: SAP_SERVER, // Make sure SAP_SERVER matches the Postman structure
      GOODSMVT_CODE: { GM_CODE: '03' },
      GOODSMVT_HEADER: {
        PSTNG_DATE: currentDate,
        DOC_DATE: currentDate,
        REF_DOC_NO: '',
        BILL_OF_LADING: '',
        GR_GI_SLIP_NO: '',
        PR_UNAME: ScrapBy,
        HEADER_TXT: '', // Match Postman
      },
      GOODSMVT_ITEM: [
        {
          MATERIAL: paddedMaterial,
          PLANT: PRODUCTION_PLANT || '5100',
          STGE_LOC: '5190',
          BATCH: BATCH_TO_PICK,
          MOVE_TYPE: '555', // Match Postman
          STCK_TYPE: 'S',
          ITEM_TEXT: '',
          ENTRY_QNT: ScrapQty, // Ensure number
          ENTRY_UOM: UNIT || 'ST',
          ENTRY_UOM_ISO: UNIT_ISO || 'PCE',
          ORDERID: '',
          MVT_IND: '',
        },
      ],
      TESTRUN: false,
    };

    try {
      const response = await axios.post(`${SAP_CONNECTOR_MIDDLEWARE_URL}/api/goods-movement/create`, sapRequestBody, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 60000,
      });
      // console.log('SAP API Response Status:', response.status);
      // console.log('SAP API Response Data:', JSON.stringify(response.data, null, 2));
      const sapResponse = response.data;
      materialDocument = sapResponse.GoodsMovementHeadRet?.MAT_DOC || '';

      if (response.data.Return && response.data.Return.length > 0) {
        const returnMessage = response.data.Return[0];
        // console.log('SAP Return Message:', JSON.stringify(returnMessage, null, 2));
        if (['E', 'I', 'A'].includes(returnMessage.TYPE)) {
          sapError = true;
          sapErrorMessage = returnMessage.MESSAGE;
        }
      }
      if (!materialDocument && !sapError) {
        sapError = true;
        sapErrorMessage = sapResponse.Return?.[0]?.MESSAGE || 'Failed to get material document number from SAP';
      }
    } catch (error) {
      sapError = true;
      sapErrorMessage =
        error.response?.data?.Message || error.response?.data?.error || `SAP API Error: ${error.message}`;
    }

    // Log errors to database if SAP transaction failed
    if (sapError) {
      try {
        // console.log('Logging SAP error to DB:', sapErrorMessage);
        await executeQuery(
          `EXEC [dbo].[Sp_SAP_RESORTING_SCRAPPING_ERROR_LOG_Insert] 
                        @SerialNo, 
                        @ORDER_NUMBER, 
                        @MATERIAL, 
                        @BATCH, 
                        @QC_Status,
                        @Qty,
                        @PRODUCTION_PLANT,
                        @STORAGE_LOCATION,
                        @MOVE_TYPE,
                        @STOCK_TYPE,
                        @UOM,
                        @UOM_ISO,
                        @MOVEMENT_INDICATOR,
                        @COST_CENTER,
                        @Error_Message,
                        @GM_CODE,
                        @CreatedBy`,
          [
            {
              name: 'SerialNo',
              type: sql.NVarChar(255),
              value: `Resorting Scrap - Order: ${paddedOrderNumber}`,
            },
            { name: 'ORDER_NUMBER', type: sql.NVarChar(50), value: '' },
            { name: 'MATERIAL', type: sql.NVarChar(50), value: paddedMaterial },
            { name: 'BATCH', type: sql.NVarChar(50), value: BATCH_TO_PICK },
            { name: 'QC_Status', type: sql.NVarChar(50), value: 'Blocked' },
            {
              name: 'Qty',
              type: sql.Decimal,
              precision: 18,
              scale: 3,
              value: parseFloat(ScrapQty),
            },
            {
              name: 'PRODUCTION_PLANT',
              type: sql.NVarChar(50),
              value: PRODUCTION_PLANT || '5100',
            },
            {
              name: 'STORAGE_LOCATION',
              type: sql.NVarChar(50),
              value: STORAGE_LOCATION || '5190',
            },
            { name: 'MOVE_TYPE', type: sql.NVarChar(50), value: '555' },
            { name: 'STOCK_TYPE', type: sql.NVarChar(50), value: 'S' },
            { name: 'UOM', type: sql.NVarChar(50), value: UNIT || 'ST' },
            {
              name: 'UOM_ISO',
              type: sql.NVarChar(50),
              value: UNIT_ISO || 'PCE',
            },
            { name: 'MOVEMENT_INDICATOR', type: sql.NVarChar(50), value: '' },
            { name: 'COST_CENTER', type: sql.NVarChar(50), value: '' },
            {
              name: 'Error_Message',
              type: sql.NVarChar(500),
              value: sapErrorMessage,
            },
            { name: 'GM_CODE', type: sql.NVarChar(50), value: '03' },
            { name: 'CreatedBy', type: sql.NVarChar(50), value: ScrapBy },
          ]
        );
        // console.log('SAP error logged to DB successfully.');
      } catch (logError) {
        console.error('Error logging SAP error to DB:', logError);
      }
    }

    // Continue with database update regardless of SAP success/failure
    try {
      // console.log('Inserting Resorting Scrap Details to DB...');
      const result = await executeQuery(
        'EXEC Sp_ResortingScrap_DetailsInsert @ORDER_NUMBER, @PRODUCTION_PLANT, @MATERIAL, @MATERIAL_TEXT, @BATCH, @STORAGE_LOCATION, @WORK_CENTER, @UNIT, @UNIT_ISO, @ScrapQty, @ScrapBy',
        [
          {
            name: 'ORDER_NUMBER',
            type: sql.NVarChar(100),
            value: paddedOrderNumber,
          },
          {
            name: 'PRODUCTION_PLANT',
            type: sql.NVarChar(100),
            value: PRODUCTION_PLANT,
          },
          { name: 'MATERIAL', type: sql.NVarChar(100), value: paddedMaterial },
          {
            name: 'MATERIAL_TEXT',
            type: sql.NVarChar(100),
            value: MATERIAL_TEXT,
          },
          { name: 'BATCH', type: sql.NVarChar(100), value: BATCH },
          {
            name: 'STORAGE_LOCATION',
            type: sql.NVarChar(50),
            value: STORAGE_LOCATION,
          },
          { name: 'WORK_CENTER', type: sql.NVarChar(50), value: WORK_CENTER },
          { name: 'UNIT', type: sql.NVarChar(50), value: UNIT },
          { name: 'UNIT_ISO', type: sql.NVarChar(50), value: UNIT_ISO },
          {
            name: 'ScrapQty',
            type: sql.Decimal(18, 3),
            value: parseFloat(ScrapQty),
          },
          { name: 'ScrapBy', type: sql.NVarChar(50), value: ScrapBy },
        ]
      );
      // console.log('DB Insert Result:', JSON.stringify(result, null, 2));

      let responseMessage = 'Resorting scrap details inserted successfully';
      let status = 'T';

      if (sapError) {
        responseMessage += ` - SAP transaction failed and logged for retry. Error: ${sapErrorMessage}`;
        status = 'T';
      } else {
        responseMessage += ` - SAP material document: ${materialDocument}`;
      }

      res.status(200).json({
        ...result,
        Status: status,
        Message: responseMessage,
        MaterialDocument: materialDocument,
        SAPError: sapError,
        SAPErrorMessage: sapError ? sapErrorMessage : null,
      });
    } catch (dbError) {
      console.error('Error inserting resorting scrap details to DB:', dbError);
      res.status(500).json({
        Status: 'F',
        Message: 'Failed to insert scrap details',
        error: dbError.message,
      });
    }
  } catch (error) {
    console.error('Error in insertResortingScrapDetails handler:', error);
    res.status(500).json({
      Status: 'F',
      Message: 'Failed to insert scrap details',
      error: error.message,
    });
  }
};
