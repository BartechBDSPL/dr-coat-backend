import { executeQuery, sql } from '../../config/db.js';
import { sendScrappingApprovalEmail } from '../../utils/scrappingTemplate.js';
import { SAP_SERVER, SAP_CONNECTOR_MIDDLEWARE_URL } from '../../utils/constants.js';
import { format } from 'date-fns';
import axios from 'axios';

export const validateSerialBarcodeWHBlockScrapping = async (req, res) => {
  const { ScanBarcode } = req.body;

  try {
    let result;
    result = await executeQuery(`EXEC [dbo].[HHT_WHBlockScrapping_PalletValidation] @ScanBarcode`, [
      { name: 'ScanBarcode', type: sql.NVarChar, value: ScanBarcode },
    ]);

    res.json(result);
  } catch (error) {
    console.error('Error validating barcode:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const validateSerialBarcodeWHReleaseScrapping = async (req, res) => {
  const { ScanBarcode } = req.body;

  try {
    let result;

    result = await executeQuery(`EXEC [dbo].[HHT_WHUnrestrictedScrapping_PalletValidation] @ScanBarcode`, [
      { name: 'ScanBarcode', type: sql.NVarChar, value: ScanBarcode },
    ]);

    console.log(result);
    res.json(result);
  } catch (error) {
    console.error('Error validating barcode:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const updateWHBlockReleaseScrappingStatus = async (req, res) => {
  const { V_ScanBarcodes, NewQCStatus, StorageLocation, UserId, Reason, isExisting } = req.body;

  try {
    if (!V_ScanBarcodes) {
      return res.json({
        Status: 'F',
        Message: 'No scan barcodes provided',
      });
    }

    // Generate scrapping serial number once
    const scrappingSrNoResult = await executeQuery(`EXEC [dbo].[HHT_ScrapppingSrNo_Generate]`, []);

    if (!scrappingSrNoResult || scrappingSrNoResult.length === 0) {
      return res.json({
        Status: 'F',
        Message: 'Failed to generate scrapping serial number',
      });
    }

    const scrappingSrNo = scrappingSrNoResult[0].SrNo;

    let allPalletBarcodes = new Set();
    let palletQuantities = new Map();

    const palletGroups = V_ScanBarcodes.split('*').filter(group => group.trim());
    const isExistingValues = isExisting ? isExisting.split('$') : [];

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
            allPalletBarcodes.add(palletBarcode);
          }
        }
      }
    }

    // Update database with pallet information
    let updatedCount = 0;
    const batchSize = 50;

    for (let i = 0; i < Array.from(allPalletBarcodes).length; i += batchSize) {
      const palletBatch = Array.from(allPalletBarcodes).slice(i, i + batchSize);

      await Promise.all(
        palletBatch.map(async pallet => {
          if (pallet.trim()) {
            await executeQuery(
              `EXEC [dbo].[HHT_WarehouseScrapping_PalletInsert] @ScanBarcode, @Reason, @ScrappingSrNo, @TransBy`,
              [
                {
                  name: 'ScanBarcode',
                  type: sql.NVarChar,
                  value: pallet.trim(),
                },
                {
                  name: 'Reason',
                  type: sql.NVarChar(255),
                  value: Reason || '',
                },
                { name: 'ScrappingSrNo', type: sql.Int, value: scrappingSrNo },
                { name: 'TransBy', type: sql.NVarChar(50), value: UserId },
              ]
            );
            updatedCount++;
          }
        })
      );
    }

    try {
      const currentDate = new Date().toLocaleDateString('en-GB');
      await sendScrappingApprovalEmail(scrappingSrNo, currentDate);
    } catch (emailError) {
      console.error('Failed to send scrapping approval email:', emailError);
    }

    res.json({
      Status: 'T',
      Message: `${NewQCStatus} status update completed successfully. Scrapping processed in database.`,
      ProcessedCount: updatedCount,
      TotalQuantity: Array.from(palletQuantities.values()).reduce((a, b) => a + b, 0),
      ScrappingSrNo: scrappingSrNo,
    });
  } catch (error) {
    res.status(200).json({
      Status: 'F',
      Message: `Error processing request: ${error.message}`,
    });
  }
};

// Function to get pending scrapping approvals
export const getPendingScrappingApprovals = async (req, res) => {
  const { ScrappingSrNo, FromDate, ToDate } = req.body;
  try {
    const result = await executeQuery(
      `EXEC [dbo].[Sp_Scrapping_GetPendingApproval] @ScrappingSrNo, @FromDate, @ToDate`,
      [
        {
          name: 'ScrappingSrNo',
          type: sql.Int,
          value: ScrappingSrNo === 0 ? null : ScrappingSrNo || null,
        },
        { name: 'FromDate', type: sql.NVarChar(12), value: FromDate || null },
        { name: 'ToDate', type: sql.NVarChar(12), value: ToDate || null },
      ]
    );

    res.json({
      Status: 'T',
      Message: 'Pending scrapping approvals retrieved successfully',
      Data: result,
    });
  } catch (error) {
    console.error('Error getting pending scrapping approvals:', error);
    res.status(500).json({
      Status: 'F',
      Message: 'Failed to retrieve pending scrapping approvals',
      Error: error.message,
    });
  }
};

export const approveScrapping = async (req, res) => {
  const { ScrappingSrNo, ApprovedBy } = req.body;

  try {
    if (!ScrappingSrNo || !ApprovedBy) {
      return res.json({
        Status: 'F',
        Message: 'ScrappingSrNo and ApprovedBy are required',
      });
    }

    // Get pending scrapping details for the specific ScrappingSrNo
    const pendingScrappingResult = await executeQuery(
      `EXEC [dbo].[Sp_Scrapping_GetPendingApproval] @ScrappingSrNo, @FromDate, @ToDate`,
      [
        { name: 'ScrappingSrNo', type: sql.Int, value: ScrappingSrNo },
        { name: 'FromDate', type: sql.NVarChar(12), value: null },
        { name: 'ToDate', type: sql.NVarChar(12), value: null },
      ]
    );

    if (!pendingScrappingResult || pendingScrappingResult.length === 0) {
      return res.json({
        Status: 'F',
        Message: 'No pending scrapping found for the given ScrappingSrNo',
      });
    }

    // Group items by QC_Status
    const groupedItems = {
      Unrestricted: [],
      Block: [],
    };

    pendingScrappingResult.forEach(item => {
      const formattedMaterialNo = item.MATERIAL ? item.MATERIAL.padStart(18, '0') : '';
      const formattedOrderNo = item.ORDER_NUMBER ? item.ORDER_NUMBER.padStart(12, '0') : '';

      const sapItem = {
        MATERIAL: formattedMaterialNo,
        PLANT: '5100',
        STGE_LOC: item.STORAGE_LOCATION, // Default storage location
        BATCH: item.BATCH,
        MOVE_TYPE: '551', // Scrapping movement type
        STCK_TYPE: item.QC_Status === 'Unrestricted' ? ' ' : 'S',
        ITEM_TEXT:
          (item.PalletBarcode || '').length > 45
            ? (item.PalletBarcode || '').substring(0, 45)
            : item.PalletBarcode || '',
        ENTRY_QNT: item.PrintQty,
        ENTRY_UOM: 'ST',
        ENTRY_UOM_ISO: 'PCE',
        PO_PR_QNT: item.PrintQty,
        ORDERID: formattedOrderNo,
        MVT_IND: '',
      };

      if (item.QC_Status === 'Unrestricted') {
        groupedItems.Unrestricted.push(sapItem);
      } else {
        groupedItems.Block.push(sapItem);
      }
    });

    const currentDate = format(new Date(), 'dd.MM.yyyy');
    const materialDocuments = [];
    const errorMessages = [];
    let totalProcessedCount = 0;

    // Process Unrestricted items
    if (groupedItems.Unrestricted.length > 0) {
      try {
        const unrestrictedSapRequest = {
          ConnectionParams: SAP_SERVER,
          GOODSMVT_CODE: { GM_CODE: '03' },
          GOODSMVT_HEADER: {
            PSTNG_DATE: currentDate,
            DOC_DATE: currentDate,
            HEADER_TXT: `SCRAPPING UNRESTRICTED WH`,
            PR_UNAME: ApprovedBy,
          },
          GOODSMVT_ITEM: groupedItems.Unrestricted,
          TESTRUN: false,
        };

        const unrestrictedResponse = await axios.post(
          `${SAP_CONNECTOR_MIDDLEWARE_URL}/api/goods-movement/create`,
          unrestrictedSapRequest,
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 60000,
          }
        );

        const sapResponse = unrestrictedResponse.data;

        // Check for SAP errors
        if (sapResponse.Return && sapResponse.Return.length > 0) {
          const returnMessage = sapResponse.Return[0];
          if (['E', 'I', 'A'].includes(returnMessage.TYPE)) {
            // Log error for Unrestricted items
            for (const item of groupedItems.Unrestricted) {
              await executeQuery(
                `EXEC [dbo].[Sp_SAP_SCRAPPING_ERROR_LOG_Insert] 
                                    @SerialNo, @ORDER_NUMBER, @MATERIAL, @BATCH, @QC_Status, @Qty, @PRODUCTION_PLANT,
                                    @STORAGE_LOCATION, @MOVE_TYPE, @STOCK_TYPE, @UOM, @UOM_ISO, @MOVEMENT_INDICATOR,
                                    @COST_CENTER, @Error_Message, @GM_CODE, @CreatedBy`,
                [
                  {
                    name: 'SerialNo',
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
                    name: 'QC_Status',
                    type: sql.NVarChar(50),
                    value: 'Unrestricted',
                  },
                  {
                    name: 'Qty',
                    type: sql.Decimal,
                    precision: 18,
                    scale: 3,
                    value: item.ENTRY_QNT,
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
                    name: 'MOVEMENT_INDICATOR',
                    type: sql.NVarChar(50),
                    value: item.MVT_IND || '',
                  },
                  {
                    name: 'COST_CENTER',
                    type: sql.NVarChar(50),
                    value: item.COSTCENTER || '',
                  },
                  {
                    name: 'Error_Message',
                    type: sql.NVarChar(500),
                    value: returnMessage.MESSAGE,
                  },
                  { name: 'GM_CODE', type: sql.NVarChar(50), value: '03' },
                  {
                    name: 'CreatedBy',
                    type: sql.NVarChar(50),
                    value: ApprovedBy,
                  },
                ]
              );
            }
            errorMessages.push(`Unrestricted items error: ${returnMessage.MESSAGE}`);
          } else {
            const materialDoc = sapResponse.GoodsMovementHeadRet?.MAT_DOC;
            if (materialDoc) {
              materialDocuments.push(materialDoc);
              totalProcessedCount += groupedItems.Unrestricted.length;
            }
          }
        } else {
          const materialDoc = sapResponse.GoodsMovementHeadRet?.MAT_DOC;
          if (materialDoc) {
            materialDocuments.push(materialDoc);
            totalProcessedCount += groupedItems.Unrestricted.length;
          }
        }
      } catch (axiosError) {
        console.error('SAP API Error for Unrestricted items:', axiosError);
        const errorMessage =
          axiosError.response?.data?.Message || axiosError.response?.data?.ModelState
            ? JSON.stringify(axiosError.response.data.ModelState)
            : axiosError.message;

        // Log error for all Unrestricted items
        for (const item of groupedItems.Unrestricted) {
          await executeQuery(
            `EXEC [dbo].[Sp_SAP_SCRAPPING_ERROR_LOG_Insert] 
                            @SerialNo, @ORDER_NUMBER, @MATERIAL, @BATCH, @QC_Status, @Qty, @PRODUCTION_PLANT,
                            @STORAGE_LOCATION, @MOVE_TYPE, @STOCK_TYPE, @UOM, @UOM_ISO, @MOVEMENT_INDICATOR,
                            @COST_CENTER, @Error_Message, @GM_CODE, @CreatedBy`,
            [
              {
                name: 'SerialNo',
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
                name: 'QC_Status',
                type: sql.NVarChar(50),
                value: 'Unrestricted',
              },
              {
                name: 'Qty',
                type: sql.Decimal,
                precision: 18,
                scale: 3,
                value: item.ENTRY_QNT,
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
              { name: 'UOM', type: sql.NVarChar(50), value: item.ENTRY_UOM },
              {
                name: 'UOM_ISO',
                type: sql.NVarChar(50),
                value: item.ENTRY_UOM_ISO,
              },
              {
                name: 'MOVEMENT_INDICATOR',
                type: sql.NVarChar(50),
                value: item.MVT_IND || '',
              },
              {
                name: 'COST_CENTER',
                type: sql.NVarChar(50),
                value: item.COSTCENTER || '',
              },
              {
                name: 'Error_Message',
                type: sql.NVarChar(500),
                value: `SAP API Error: ${errorMessage}`,
              },
              { name: 'GM_CODE', type: sql.NVarChar(50), value: '03' },
              { name: 'CreatedBy', type: sql.NVarChar(50), value: ApprovedBy },
            ]
          );
        }
        errorMessages.push(`Unrestricted SAP API Error: ${errorMessage}`);
      }
    }

    // Process Block items
    if (groupedItems.Block.length > 0) {
      try {
        const blockSapRequest = {
          ConnectionParams: SAP_SERVER,
          GOODSMVT_CODE: { GM_CODE: '03' },
          GOODSMVT_HEADER: {
            PSTNG_DATE: currentDate,
            DOC_DATE: currentDate,
            HEADER_TXT: `SCRAPPING BLOCK WH`,
            PR_UNAME: ApprovedBy,
          },
          GOODSMVT_ITEM: groupedItems.Block,
          TESTRUN: false,
        };

        const blockResponse = await axios.post(
          `${SAP_CONNECTOR_MIDDLEWARE_URL}/api/goods-movement/create`,
          blockSapRequest,
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 60000,
          }
        );

        const sapResponse = blockResponse.data;

        // Check for SAP errors
        if (sapResponse.Return && sapResponse.Return.length > 0) {
          const returnMessage = sapResponse.Return[0];
          if (['E', 'I', 'A'].includes(returnMessage.TYPE)) {
            // Log error for Block items
            for (const item of groupedItems.Block) {
              await executeQuery(
                `EXEC [dbo].[Sp_SAP_SCRAPPING_ERROR_LOG_Insert] 
                                    @SerialNo, @ORDER_NUMBER, @MATERIAL, @BATCH, @QC_Status, @Qty, @PRODUCTION_PLANT,
                                    @STORAGE_LOCATION, @MOVE_TYPE, @STOCK_TYPE, @UOM, @UOM_ISO, @MOVEMENT_INDICATOR,
                                    @COST_CENTER, @Error_Message, @GM_CODE, @CreatedBy`,
                [
                  {
                    name: 'SerialNo',
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
                  { name: 'QC_Status', type: sql.NVarChar(50), value: 'Block' },
                  {
                    name: 'Qty',
                    type: sql.Decimal,
                    precision: 18,
                    scale: 3,
                    value: item.ENTRY_QNT,
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
                    name: 'MOVEMENT_INDICATOR',
                    type: sql.NVarChar(50),
                    value: item.MVT_IND || '',
                  },
                  {
                    name: 'COST_CENTER',
                    type: sql.NVarChar(50),
                    value: item.COSTCENTER || '',
                  },
                  {
                    name: 'Error_Message',
                    type: sql.NVarChar(500),
                    value: returnMessage.MESSAGE,
                  },
                  { name: 'GM_CODE', type: sql.NVarChar(50), value: '03' },
                  {
                    name: 'CreatedBy',
                    type: sql.NVarChar(50),
                    value: ApprovedBy,
                  },
                ]
              );
            }
            errorMessages.push(`Block items error: ${returnMessage.MESSAGE}`);
          } else {
            const materialDoc = sapResponse.GoodsMovementHeadRet?.MAT_DOC;
            if (materialDoc) {
              materialDocuments.push(materialDoc);
              totalProcessedCount += groupedItems.Block.length;
            }
          }
        } else {
          const materialDoc = sapResponse.GoodsMovementHeadRet?.MAT_DOC;
          if (materialDoc) {
            materialDocuments.push(materialDoc);
            totalProcessedCount += groupedItems.Block.length;
          }
        }
      } catch (axiosError) {
        console.error('SAP API Error for Block items:', axiosError);
        const errorMessage =
          axiosError.response?.data?.Message || axiosError.response?.data?.ModelState
            ? JSON.stringify(axiosError.response.data.ModelState)
            : axiosError.message;

        // Log error for all Block items
        for (const item of groupedItems.Block) {
          await executeQuery(
            `EXEC [dbo].[Sp_SAP_SCRAPPING_ERROR_LOG_Insert] 
                            @SerialNo, @ORDER_NUMBER, @MATERIAL, @BATCH, @QC_Status, @Qty, @PRODUCTION_PLANT,
                            @STORAGE_LOCATION, @MOVE_TYPE, @STOCK_TYPE, @UOM, @UOM_ISO, @MOVEMENT_INDICATOR,
                            @COST_CENTER, @Error_Message, @GM_CODE, @CreatedBy`,
            [
              {
                name: 'SerialNo',
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
              { name: 'QC_Status', type: sql.NVarChar(50), value: 'Block' },
              {
                name: 'Qty',
                type: sql.Decimal,
                precision: 18,
                scale: 3,
                value: item.ENTRY_QNT,
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
              { name: 'UOM', type: sql.NVarChar(50), value: item.ENTRY_UOM },
              {
                name: 'UOM_ISO',
                type: sql.NVarChar(50),
                value: item.ENTRY_UOM_ISO,
              },
              {
                name: 'MOVEMENT_INDICATOR',
                type: sql.NVarChar(50),
                value: item.MVT_IND || '',
              },
              {
                name: 'COST_CENTER',
                type: sql.NVarChar(50),
                value: item.COSTCENTER || '',
              },
              {
                name: 'Error_Message',
                type: sql.NVarChar(500),
                value: `SAP API Error: ${errorMessage}`,
              },
              { name: 'GM_CODE', type: sql.NVarChar(50), value: '03' },
              { name: 'CreatedBy', type: sql.NVarChar(50), value: ApprovedBy },
            ]
          );
        }
        errorMessages.push(`Block SAP API Error: ${errorMessage}`);
      }
    }

    // Update approval status in database
    const approvalResult = await executeQuery(`EXEC [dbo].[Sp_Scrapping_ApprovalUpdate] @ScrappingSrNo, @ApprovedBy`, [
      { name: 'ScrappingSrNo', type: sql.Int, value: ScrappingSrNo },
      { name: 'ApprovedBy', type: sql.NVarChar(50), value: ApprovedBy },
    ]);

    // Prepare response message
    const responseMessage =
      errorMessages.length > 0
        ? `Scrapping approved with SAP processing warnings: ${errorMessages.join('; ')}`
        : `Scrapping approved successfully. Material Documents: ${materialDocuments.join(', ')}`;
    console.log(approvalResult, responseMessage);
    res.json({
      ...approvalResult[0],
      Message: responseMessage,
    });
  } catch (error) {
    console.error('Error approving scrapping:', error);
    res.status(500).json({
      Status: 'F',
      Message: 'Failed to approve scrapping',
      Error: error.message,
    });
  }
};
