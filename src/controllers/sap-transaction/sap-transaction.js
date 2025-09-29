import { executeQuery, sql } from '../../config/db.js';
import { SAP_SERVER, SAP_CONNECTOR_MIDDLEWARE_URL } from '../../utils/constants.js';
import axios from 'axios';

export const getSapTransactionModuleName = async (req, res) => {
  try {
    const result = await executeQuery('EXEC Sp_SAP_Modules_GetAll');
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      Status: 'F',
      Message: error.message,
    });
  }
};

export const getPedndingSapTransaction = async (req, res) => {
  const { ModuleName } = req.body;

  try {
    let storedProcedure = '';

    if (ModuleName === 'Production Entry') {
      storedProcedure = 'Sp_SAP_GR_ERROR_LOG_Pending';
    } else if (ModuleName === 'Quality') {
      storedProcedure = 'Sp_SAP_QC_ERROR_LOG_Pending';
    } else if (ModuleName === 'Warehouse Scan') {
      storedProcedure = 'Sp_SAP_INWARD_ERROR_LOG_Pending';
    } else if (ModuleName === 'Stock Transfer' || ModuleName === 'Internal Movement / Stock Transfer') {
      storedProcedure = 'Sp_SAP_INTERNALMOVEMENT_ERROR_LOG_Pending';
    } else if (ModuleName === 'Delivery Order Picking') {
      storedProcedure = 'Sp_SAP_MATERIALPICKING_ERROR_LOG_Pending';
    } else if (ModuleName === 'Put Away') {
      storedProcedure = 'Sp_SAP_PUTAWAY_ERROR_LOG_Pending';
    } else if (ModuleName === 'WH Scrapping') {
      storedProcedure = 'Sp_SAP_SCRAPPING_ERROR_LOG_Pending';
    } else if (ModuleName === 'WH Block Or Unrestricted') {
      storedProcedure = 'Sp_SAP_WHBlockOrUnrestricted_ERROR_LOG_Pending';
    } else if (ModuleName === 'Resorting Picking') {
      storedProcedure = 'Sp_SAP_RESORTING_ERROR_LOG_Pending';
    } else if (ModuleName === 'Resorting Return') {
      storedProcedure = 'Sp_SAP_RESORTING_RETURN_ERROR_LOG_Pending';
    } else if (ModuleName === 'Resorting Scrapping') {
      storedProcedure = 'Sp_SAP_RESORTING_SCRAPPING_ERROR_LOG_Pending';
    } else {
      return res.status(400).json({
        Status: 'F',
        Message: 'Invalid module name provided',
      });
    }

    if (!storedProcedure) {
      return res.status(400).json({
        Status: 'F',
        Message: 'Stored procedure not configured for this module',
      });
    }

    const result = await executeQuery(`EXEC ${storedProcedure}`);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      Status: 'F',
      Message: error.message,
    });
  }
};

export const updateSapTransactionDetails = async (req, res) => {
  const {
    LogID,
    PalletBarcode,
    ORDER_NUMBER,
    MATERIAL,
    BATCH,
    MOVEMENT_TYPE,
    STOCK_TYPE,
    STORAGE_LOCATION,
    MOVEMENT_INDICATOR,
    PRODUCTION_PLANT,
    Qty,
    GM_CODE,
    ErrorMessage,
    CreatedBy,
    CreatedDate,
    RetryCount,
    UNIT,
    UNIT_ISO,
    MOVE_BATCH,
    MOVE_STORAGELOCATION,
    QCStatus,
    Module_Name,
  } = req.body;

  try {
    // Format material and order number as needed for SAP
    const formattedMaterialNo = MATERIAL.padStart(18, '0');
    const formattedOrderNo = ORDER_NUMBER === '' ? '' : ORDER_NUMBER.padStart(12, '0');

    // Prepare the item for SAP request
    const itemData = {
      MATERIAL: formattedMaterialNo,
      PLANT: PRODUCTION_PLANT || '5100',
      STGE_LOC: STORAGE_LOCATION || '5110',
      BATCH: BATCH,
      MOVE_TYPE: MOVEMENT_TYPE || '101',
      STCK_TYPE: STOCK_TYPE || 'Q',
      ITEM_TEXT: PalletBarcode.length > 45 ? PalletBarcode.substring(0, 45) : PalletBarcode,
      ENTRY_QNT: Qty,
      ENTRY_UOM: UNIT || 'ST',
      ENTRY_UOM_ISO: UNIT_ISO || 'PCE',
      PO_PR_QNT: Qty,
      ORDERID: formattedOrderNo,
      MVT_IND: MOVEMENT_INDICATOR,
    };

    if (MOVE_BATCH) {
      itemData.MOVE_BATCH = MOVE_BATCH;
    }

    if (MOVE_STORAGELOCATION) {
      itemData.MOVE_STLOC = MOVE_STORAGELOCATION;
    }

    // Format date for SAP
    const currentDate = new Date();
    const formattedDate = currentDate
      .toLocaleDateString('en-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
      .replace(/\//g, '.');

    const sapRequestBody = {
      ConnectionParams: SAP_SERVER,
      GOODSMVT_CODE: {
        GM_CODE: GM_CODE || (Module_Name === 'Warehouse Scan' ? '04' : '02'),
      },
      GOODSMVT_HEADER: {
        PSTNG_DATE: formattedDate,
        DOC_DATE: formattedDate,
        HEADER_TXT: `Retries`,
        PR_UNAME: CreatedBy,
      },
      GOODSMVT_ITEM: [itemData],
      TESTRUN: false,
    };

    // Call SAP API
    const response = await axios.post(`${SAP_CONNECTOR_MIDDLEWARE_URL}/api/goods-movement/create`, sapRequestBody, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 60000,
    });
    const sapResponse = response.data;

    // Check for errors in SAP response
    if (sapResponse.Return && sapResponse.Return.length > 0) {
      const returnMessage = sapResponse.Return[0];

      if (['E', 'I', 'A'].includes(returnMessage.TYPE)) {
        return res.status(200).json({
          Status: 'F',
          Message: returnMessage.MESSAGE || 'Error in SAP processing',
          SAPResponse: sapResponse,
        });
      }
    }

    const materialDocument = sapResponse.GoodsMovementHeadRet?.MAT_DOC;

    if (!materialDocument) {
      return res.status(200).json({
        Status: 'F',
        Message: 'Failed to get material document number from SAP',
        SAPResponse: sapResponse,
      });
    }

    let updateResult;

    if (Module_Name === 'Production Entry') {
      updateResult = await executeQuery(
        `EXEC [dbo].[Sp_SAP_GR_ERROR_LOG_Update] @PalletBarcode, @BATCH, @ProcessedBy, @MATERIAL_DOCUMENT`,
        [
          {
            name: 'PalletBarcode',
            type: sql.NVarChar(50),
            value: PalletBarcode,
          },
          { name: 'BATCH', type: sql.NVarChar(50), value: BATCH },
          { name: 'ProcessedBy', type: sql.NVarChar(50), value: CreatedBy },
          {
            name: 'MATERIAL_DOCUMENT',
            type: sql.NVarChar(50),
            value: materialDocument,
          },
        ]
      );
    } else if (Module_Name === 'Quality') {
      updateResult = await executeQuery(`EXEC [dbo].[Sp_SAP_QC_ERROR_LOG_Update] @LogID, @ProcessedBy`, [
        { name: 'LogID', type: sql.Int, value: LogID },
        { name: 'ProcessedBy', type: sql.NVarChar(50), value: CreatedBy },
      ]);

      return res.status(200).json({
        Status: 'T',
        Message: `Successfully processed Quality transaction. Material Document: ${materialDocument}`,
        MaterialDocument: materialDocument,
        UpdateResult: updateResult,
      });
    } else if (Module_Name === 'Warehouse Scan') {
      updateResult = await executeQuery(
        `EXEC [dbo].[Sp_SAP_INWARD_ERROR_LOG_Update] @PalletBarcode, @BATCH, @ProcessedBy, @MATERIAL_DOCUMENT`,
        [
          {
            name: 'PalletBarcode',
            type: sql.NVarChar(50),
            value: PalletBarcode,
          },
          { name: 'BATCH', type: sql.NVarChar(50), value: BATCH },
          { name: 'ProcessedBy', type: sql.NVarChar(50), value: CreatedBy },
          {
            name: 'MATERIAL_DOCUMENT',
            type: sql.NVarChar(70),
            value: materialDocument,
          },
        ]
      );
    } else if (Module_Name === 'Stock Transfer' || Module_Name === 'Internal Movement / Stock Transfer') {
      updateResult = await executeQuery(`EXEC [dbo].[Sp_SAP_INTERNALMOVEMENT_ERROR_LOG_Update] @LogID, @ProcessedBy`, [
        { name: 'LogID', type: sql.Int, value: LogID },
        { name: 'ProcessedBy', type: sql.NVarChar(50), value: CreatedBy },
      ]);
      return res.status(200).json({
        Status: 'T',
        Message: `Successfully processed Internal Movement / Stock Transfer transaction. Material Document: ${materialDocument}`,
        MaterialDocument: materialDocument,
        UpdateResult: updateResult,
      });
    } else if (Module_Name === 'Delivery Order Picking') {
      updateResult = await executeQuery(`EXEC [dbo].[Sp_SAP_MATERIALPICKING_ERROR_LOG_Update] @LogID, @ProcessedBy`, [
        { name: 'LogID', type: sql.Int, value: LogID },
        { name: 'ProcessedBy', type: sql.NVarChar(50), value: CreatedBy },
      ]);
      return res.status(200).json({
        Status: 'T',
        Message: `Successfully processed Delivery Order Picking transaction. Material Document: ${materialDocument}`,
        MaterialDocument: materialDocument,
        UpdateResult: updateResult,
      });
    } else if (Module_Name === 'Put Away') {
      updateResult = await executeQuery(`EXEC [dbo].[Sp_SAP_PUTAWAY_ERROR_LOG_Update] @LogID, @ProcessedBy`, [
        { name: 'LogID', type: sql.Int, value: LogID },
        { name: 'ProcessedBy', type: sql.NVarChar(50), value: CreatedBy },
      ]);
      return res.status(200).json({
        Status: 'T',
        Message: `Successfully processed Putaway transaction. Material Document: ${materialDocument}`,
        MaterialDocument: materialDocument,
        UpdateResult: updateResult,
      });
    } else if (Module_Name === 'WH Scrapping') {
      updateResult = await executeQuery(`EXEC [dbo].[Sp_SAP_SCRAPPING_ERROR_LOG_Update] @LogID, @ProcessedBy`, [
        { name: 'LogID', type: sql.Int, value: LogID },
        { name: 'ProcessedBy', type: sql.NVarChar(50), value: CreatedBy },
      ]);
      return res.status(200).json({
        Status: 'T',
        Message: `Successfully processed Scrapping transaction. Material Document: ${materialDocument}`,
        MaterialDocument: materialDocument,
        UpdateResult: updateResult,
      });
    } else if (Module_Name === 'WH Block Or Unrestricted') {
      updateResult = await executeQuery(
        `EXEC [dbo].[Sp_SAP_WHBlockORUnrestricted_ERROR_LOG_Update] @LogID, @ProcessedBy`,
        [
          { name: 'LogID', type: sql.Int, value: LogID },
          { name: 'ProcessedBy', type: sql.NVarChar(50), value: CreatedBy },
        ]
      );
      return res.status(200).json({
        Status: 'T',
        Message: `Successfully processed WH Block Or Unrestricted transaction. Material Document: ${materialDocument}`,
        MaterialDocument: materialDocument,
        UpdateResult: updateResult,
      });
    } else if (Module_Name === 'Resorting Picking') {
      updateResult = await executeQuery(`EXEC [dbo].[Sp_SAP_RESORTING_ERROR_LOG_Update] @LogID, @ProcessedBy`, [
        { name: 'LogID', type: sql.Int, value: LogID },
        { name: 'ProcessedBy', type: sql.NVarChar(50), value: CreatedBy },
      ]);
      return res.status(200).json({
        Status: 'T',
        Message: `Successfully processed Resorting Picking transaction. Material Document: ${materialDocument}`,
        MaterialDocument: materialDocument,
        UpdateResult: updateResult,
      });
    } else if (Module_Name === 'Resorting Return') {
      updateResult = await executeQuery(`EXEC [dbo].[Sp_SAP_RESORTING_RETURN_ERROR_LOG_Update] @LogID, @ProcessedBy`, [
        { name: 'LogID', type: sql.Int, value: LogID },
        { name: 'ProcessedBy', type: sql.NVarChar(50), value: CreatedBy },
      ]);
      return res.status(200).json({
        Status: 'T',
        Message: `Successfully processed Resorting Return transaction. Material Document: ${materialDocument}`,
        MaterialDocument: materialDocument,
        UpdateResult: updateResult,
      });
    } else if (Module_Name === 'Resorting Scrapping') {
      updateResult = await executeQuery(
        `EXEC [dbo].[Sp_SAP_RESORTING_SCRAPPING_ERROR_LOG_Update] @LogID, @ProcessedBy`,
        [
          { name: 'LogID', type: sql.Int, value: LogID },
          { name: 'ProcessedBy', type: sql.NVarChar(50), value: CreatedBy },
        ]
      );
      return res.status(200).json({
        Status: 'T',
        Message: `Successfully processed Resorting Scrapping transaction. Material Document: ${materialDocument}`,
        MaterialDocument: materialDocument,
        UpdateResult: updateResult,
      });
    } else {
      return res.status(400).json({
        Status: 'F',
        Message: 'Invalid Module Name provided',
      });
    }

    res.status(200).json({
      Status: 'T',
      Message: `Successfully processed transaction. Material Document: ${materialDocument}`,
      MaterialDocument: materialDocument,
      UpdateResult: updateResult,
    });
  } catch (error) {
    console.error('Error processing SAP transaction:', error);

    // Check if this is an Axios error with response data
    const errorMessage =
      error.response?.data?.Message || error.response?.data?.ModelState
        ? JSON.stringify(error.response.data.ModelState)
        : error.message;

    res.status(200).json({
      Status: 'F',
      Message: `Error processing SAP transaction: ${errorMessage}`,
    });
  }
};
