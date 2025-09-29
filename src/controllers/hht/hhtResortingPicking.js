import { executeQuery, sql } from '../../config/db.js';
import { SAP_CONNECTOR_MIDDLEWARE_URL, SAP_SERVER } from '../../utils/constants.js';
import axios from 'axios';
import { format } from 'date-fns';
import chalk from 'chalk';

export const insertPalletBarcodeResorting = async (req, res) => {
  // console.log(chalk.blue("[insertPalletBarcodeResorting] ====== STARTING OPERATION ======"));
  const { OrderNo, Material, Barcode, PickOrderFlag, UserId, PendingPick, ReqQty, TotalPicked, BATCH } = req.body;
  console.log(chalk.blue('[insertPalletBarcodeResorting] called with body:'), req.body);

  try {
    // console.log(chalk.blue("[insertPalletBarcodeResorting] Executing pallet location query..."));
    const palletLocationResult = await executeQuery(`EXEC [dbo].[HHT_FGPick_PalletLocation_Resorting] @PalletBarcode`, [
      { name: 'PalletBarcode', type: sql.NVarChar, value: Barcode },
    ]);
    console.log(chalk.green('[insertPalletBarcodeResorting] Pallet location result:'), palletLocationResult);

    const palletLocationData = palletLocationResult[0];
    const qcStatusOfPallet = palletLocationData.QCStatus;

    if (palletLocationData.Status == 'F') {
      const failureResponse = {
        Status: 'F',
        Message: palletLocationData.Message,
      };
      return res.json(failureResponse).status(200);
    }

    if (palletLocationData.Batch !== BATCH) {
      const batchMismatchResponse = {
        Status: 'F',
        Message: `BATCH number mismatch scanned BATCH - ${palletLocationData.Batch} picked BATCH - ${BATCH}`,
      };
      return res.json(batchMismatchResponse).status(200);
    }

    if (palletLocationData.Qty > PendingPick) {
      const qtyExceedsResponse = {
        Status: 'F',
        Message: `Pallet Total Aval Qty is ${palletLocationData.Qty} which exceeds Pending Pick Qty ${PendingPick}`,
      };
      return res.json(qtyExceedsResponse).status(200);
    }

    const currentDate = format(new Date(), 'dd.MM.yyyy');
    let materialDocument = '';
    let sapError = false;
    let errorMessage = '';
    let blockError = false;
    let transferError = false;
    let blockErrorMessage = '';
    let transferErrorMessage = '';
    const paddedMaterial = Material.padStart(18, '0');
    const paddedOrderNo = palletLocationData.OrderNo.padStart(12, '0');

    // Step 1: If QC status is Unrestricted, block the stock first (move type 344)
    if (qcStatusOfPallet === 'Unrestricted') {
      const blockStockBody = {
        ConnectionParams: SAP_SERVER,
        GOODSMVT_CODE: { GM_CODE: '04' },
        GOODSMVT_HEADER: {
          PSTNG_DATE: currentDate,
          DOC_DATE: currentDate,
          HEADER_TXT: 'Resorting Block',
        },
        GOODSMVT_ITEM: [
          {
            MATERIAL: paddedMaterial,
            PLANT: '5100',
            STGE_LOC: palletLocationData.StorageLocation,
            BATCH: palletLocationData.Batch,
            MOVE_TYPE: '344',
            STCK_TYPE: 'S',
            ITEM_TEXT: Barcode.length > 45 ? Barcode.substring(0, 45) : Barcode,
            ENTRY_QNT: palletLocationData.Qty,
            ENTRY_UOM: palletLocationData.Unit,
            ENTRY_UOM_ISO: palletLocationData.UnitISO,
            PO_PR_QNT: palletLocationData.Qty,
            ORDERID: paddedOrderNo,
            MVT_IND: '',
          },
        ],
        TESTRUN: false,
      };

      try {
        const blockResponse = await axios.post(
          `${SAP_CONNECTOR_MIDDLEWARE_URL}/api/goods-movement/create`,
          blockStockBody,
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 300000,
          }
        );

        if (!blockResponse.data.GoodsMovementHeadRet?.MAT_DOC) {
          blockError = true;
          sapError = true;
          blockErrorMessage = blockResponse.data.Return?.[0]?.MESSAGE || 'Failed to block stock in SAP';
          errorMessage = `Block Stock Error: ${blockErrorMessage}`;
          // console.log(chalk.red("[insertPalletBarcodeResorting] Block stock failed:"), blockErrorMessage);

          // Log the block stock error using actual values from the SAP request
          const blockItem = blockStockBody.GOODSMVT_ITEM[0];
          await executeQuery(
            `EXEC [dbo].[Sp_SAP_RESORTING_ERROR_LOG_Insert] 
                            @PalletBarcode, @ORDER_NUMBER, @MATERIAL, @BATCH, @PRODUCTION_PLANT,
                            @STORAGE_LOCATION, @MOVE_TYPE, @STOCK_TYPE, @MOVE_BATCH, @MOVE_STORAGELOCATION,
                            @SPEC_STOCK, @MOVEMENT_INDICATOR, @UOM, @UOM_ISO, @Qty, @Error_Message, @GM_CODE, @CreatedBy`,
            [
              {
                name: 'PalletBarcode',
                type: sql.NVarChar(255),
                value: Barcode,
              },
              {
                name: 'ORDER_NUMBER',
                type: sql.NVarChar(50),
                value: blockItem.ORDERID,
              },
              {
                name: 'MATERIAL',
                type: sql.NVarChar(50),
                value: blockItem.MATERIAL,
              },
              { name: 'BATCH', type: sql.NVarChar(50), value: blockItem.BATCH },
              {
                name: 'PRODUCTION_PLANT',
                type: sql.NVarChar(50),
                value: blockItem.PLANT,
              },
              {
                name: 'STORAGE_LOCATION',
                type: sql.NVarChar(50),
                value: blockItem.STGE_LOC,
              },
              {
                name: 'MOVE_TYPE',
                type: sql.NVarChar(50),
                value: blockItem.MOVE_TYPE,
              },
              {
                name: 'STOCK_TYPE',
                type: sql.NVarChar(50),
                value: blockItem.STCK_TYPE,
              },
              {
                name: 'MOVE_BATCH',
                type: sql.NVarChar(50),
                value: blockItem.MOVE_BATCH || '',
              },
              {
                name: 'MOVE_STORAGELOCATION',
                type: sql.NVarChar(50),
                value: blockItem.MOVE_STLOC || '',
              },
              {
                name: 'SPEC_STOCK',
                type: sql.NVarChar(50),
                value: blockItem.SPEC_STOCK || '',
              },
              {
                name: 'MOVEMENT_INDICATOR',
                type: sql.NVarChar(50),
                value: blockItem.MVT_IND,
              },
              {
                name: 'UOM',
                type: sql.NVarChar(50),
                value: blockItem.ENTRY_UOM,
              },
              {
                name: 'UOM_ISO',
                type: sql.NVarChar(50),
                value: blockItem.ENTRY_UOM_ISO,
              },
              {
                name: 'Qty',
                type: sql.Decimal(18, 3),
                value: blockItem.ENTRY_QNT,
              },
              {
                name: 'Error_Message',
                type: sql.NVarChar(500),
                value: blockErrorMessage,
              },
              {
                name: 'GM_CODE',
                type: sql.NVarChar(50),
                value: blockStockBody.GOODSMVT_CODE.GM_CODE,
              },
              { name: 'CreatedBy', type: sql.NVarChar(50), value: UserId },
            ]
          );
        } else {
          // console.log(chalk.green("[insertPalletBarcodeResorting] Block stock successful with MAT_DOC:"), blockResponse.data.GoodsMovementHeadRet?.MAT_DOC);
        }
      } catch (axiosError) {
        blockError = true;
        sapError = true;
        blockErrorMessage =
          axiosError.response?.data?.Return?.[0]?.MESSAGE ||
          axiosError.response?.data?.Message ||
          (axiosError.response?.data?.ModelState
            ? JSON.stringify(axiosError.response.data.ModelState)
            : axiosError.message);
        errorMessage = `Block Stock API Error: ${blockErrorMessage}`;

        // Log the block stock error using actual values from the SAP request
        const blockItem = blockStockBody.GOODSMVT_ITEM[0];
        await executeQuery(
          `EXEC [dbo].[Sp_SAP_RESORTING_ERROR_LOG_Insert] 
                        @PalletBarcode, @ORDER_NUMBER, @MATERIAL, @BATCH, @PRODUCTION_PLANT,
                        @STORAGE_LOCATION, @MOVE_TYPE, @STOCK_TYPE, @MOVE_BATCH, @MOVE_STORAGELOCATION,
                        @SPEC_STOCK, @MOVEMENT_INDICATOR, @UOM, @UOM_ISO, @Qty, @Error_Message, @GM_CODE, @CreatedBy`,
          [
            { name: 'PalletBarcode', type: sql.NVarChar(255), value: Barcode },
            {
              name: 'ORDER_NUMBER',
              type: sql.NVarChar(50),
              value: blockItem.ORDERID,
            },
            {
              name: 'MATERIAL',
              type: sql.NVarChar(50),
              value: blockItem.MATERIAL,
            },
            { name: 'BATCH', type: sql.NVarChar(50), value: blockItem.BATCH },
            {
              name: 'PRODUCTION_PLANT',
              type: sql.NVarChar(50),
              value: blockItem.PLANT,
            },
            {
              name: 'STORAGE_LOCATION',
              type: sql.NVarChar(50),
              value: blockItem.STGE_LOC,
            },
            {
              name: 'MOVE_TYPE',
              type: sql.NVarChar(50),
              value: blockItem.MOVE_TYPE,
            },
            {
              name: 'STOCK_TYPE',
              type: sql.NVarChar(50),
              value: blockItem.STCK_TYPE,
            },
            {
              name: 'MOVE_BATCH',
              type: sql.NVarChar(50),
              value: blockItem.MOVE_BATCH || '',
            },
            {
              name: 'MOVE_STORAGELOCATION',
              type: sql.NVarChar(50),
              value: blockItem.MOVE_STLOC || '',
            },
            {
              name: 'SPEC_STOCK',
              type: sql.NVarChar(50),
              value: blockItem.SPEC_STOCK || '',
            },
            {
              name: 'MOVEMENT_INDICATOR',
              type: sql.NVarChar(50),
              value: blockItem.MVT_IND,
            },
            { name: 'UOM', type: sql.NVarChar(50), value: blockItem.ENTRY_UOM },
            {
              name: 'UOM_ISO',
              type: sql.NVarChar(50),
              value: blockItem.ENTRY_UOM_ISO,
            },
            {
              name: 'Qty',
              type: sql.Decimal(18, 3),
              value: blockItem.ENTRY_QNT,
            },
            {
              name: 'Error_Message',
              type: sql.NVarChar(500),
              value: `SAP API Error (Block): ${blockErrorMessage}`,
            },
            {
              name: 'GM_CODE',
              type: sql.NVarChar(50),
              value: blockStockBody.GOODSMVT_CODE.GM_CODE,
            },
            { name: 'CreatedBy', type: sql.NVarChar(50), value: UserId },
          ]
        );
      }
    } else {
    }

    // Step 2: Transfer to location 5190 (only if not already at 5190)
    // Try transfer even if block failed - we'll log both errors separately
    if (palletLocationData.StorageLocation !== '5190') {
      // console.log(chalk.yellow("[insertPalletBarcodeResorting] Current storage location is"), palletLocationData.StorageLocation, chalk.yellow("- transferring to location 5190..."));
      const transferBody = {
        ConnectionParams: SAP_SERVER,
        GOODSMVT_CODE: { GM_CODE: '04' },
        GOODSMVT_HEADER: {
          PSTNG_DATE: currentDate,
          DOC_DATE: currentDate,
          HEADER_TXT: 'Stock Transfer',
        },
        GOODSMVT_ITEM: [
          {
            MATERIAL: paddedMaterial,
            PLANT: '5100',
            STGE_LOC: palletLocationData.StorageLocation,
            BATCH: palletLocationData.Batch,
            MOVE_TYPE: '325',
            STCK_TYPE: 'S',
            MOVE_STLOC: '5190',
            ITEM_TEXT: Barcode.length > 45 ? Barcode.substring(0, 45) : Barcode,
            ENTRY_QNT: palletLocationData.Qty,
            ENTRY_UOM: palletLocationData.Unit,
            ENTRY_UOM_ISO: palletLocationData.UnitISO,
            PO_PR_QNT: palletLocationData.Qty,
            ORDERID: paddedOrderNo,
            MVT_IND: '',
          },
        ],
        TESTRUN: false,
      };

      // console.log(chalk.yellow("[insertPalletBarcodeResorting] Transfer body:"), JSON.stringify(transferBody, null, 2));

      try {
        // console.log(chalk.blue("[insertPalletBarcodeResorting] Sending transfer request to SAP..."));
        const transferResponse = await axios.post(
          `${SAP_CONNECTOR_MIDDLEWARE_URL}/api/goods-movement/create`,
          transferBody,
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 300000,
          }
        );

        if (!transferResponse.data.GoodsMovementHeadRet?.MAT_DOC) {
          transferError = true;
          sapError = true;
          transferErrorMessage = transferResponse.data.Return?.[0]?.MESSAGE || 'Failed to transfer stock in SAP';
          // console.log(chalk.red("[insertPalletBarcodeResorting] Transfer failed:"), transferErrorMessage);

          // If we already had a block error, combine the messages
          if (blockError) {
            errorMessage = `Block: ${blockErrorMessage} | Transfer: ${transferErrorMessage}`;
          } else {
            errorMessage = `Transfer Error: ${transferErrorMessage}`;
          }

          // Log the transfer error using actual values from the SAP request
          const transferItem = transferBody.GOODSMVT_ITEM[0];
          await executeQuery(
            `EXEC [dbo].[Sp_SAP_RESORTING_ERROR_LOG_Insert] 
                            @PalletBarcode, @ORDER_NUMBER, @MATERIAL, @BATCH, @PRODUCTION_PLANT,
                            @STORAGE_LOCATION, @MOVE_TYPE, @STOCK_TYPE, @MOVE_BATCH, @MOVE_STORAGELOCATION,
                            @SPEC_STOCK, @MOVEMENT_INDICATOR, @UOM, @UOM_ISO, @Qty, @Error_Message, @GM_CODE, @CreatedBy`,
            [
              {
                name: 'PalletBarcode',
                type: sql.NVarChar(255),
                value: Barcode,
              },
              {
                name: 'ORDER_NUMBER',
                type: sql.NVarChar(50),
                value: transferItem.ORDERID,
              },
              {
                name: 'MATERIAL',
                type: sql.NVarChar(50),
                value: transferItem.MATERIAL,
              },
              {
                name: 'BATCH',
                type: sql.NVarChar(50),
                value: transferItem.BATCH,
              },
              {
                name: 'PRODUCTION_PLANT',
                type: sql.NVarChar(50),
                value: transferItem.PLANT,
              },
              {
                name: 'STORAGE_LOCATION',
                type: sql.NVarChar(50),
                value: transferItem.STGE_LOC,
              },
              {
                name: 'MOVE_TYPE',
                type: sql.NVarChar(50),
                value: transferItem.MOVE_TYPE,
              },
              {
                name: 'STOCK_TYPE',
                type: sql.NVarChar(50),
                value: transferItem.STCK_TYPE,
              },
              {
                name: 'MOVE_BATCH',
                type: sql.NVarChar(50),
                value: transferItem.MOVE_BATCH || '',
              },
              {
                name: 'MOVE_STORAGELOCATION',
                type: sql.NVarChar(50),
                value: transferItem.MOVE_STLOC,
              },
              {
                name: 'SPEC_STOCK',
                type: sql.NVarChar(50),
                value: transferItem.SPEC_STOCK || '',
              },
              {
                name: 'MOVEMENT_INDICATOR',
                type: sql.NVarChar(50),
                value: transferItem.MVT_IND,
              },
              {
                name: 'UOM',
                type: sql.NVarChar(50),
                value: transferItem.ENTRY_UOM,
              },
              {
                name: 'UOM_ISO',
                type: sql.NVarChar(50),
                value: transferItem.ENTRY_UOM_ISO,
              },
              {
                name: 'Qty',
                type: sql.Decimal(18, 3),
                value: transferItem.ENTRY_QNT,
              },
              {
                name: 'Error_Message',
                type: sql.NVarChar(500),
                value: transferErrorMessage,
              },
              {
                name: 'GM_CODE',
                type: sql.NVarChar(50),
                value: transferBody.GOODSMVT_CODE.GM_CODE,
              },
              { name: 'CreatedBy', type: sql.NVarChar(50), value: UserId },
            ]
          );
        } else {
          // console.log(chalk.green("[insertPalletBarcodeResorting] Transfer successful with MAT_DOC:"), transferResponse.data.GoodsMovementHeadRet?.MAT_DOC);
        }
      } catch (axiosError) {
        transferError = true;
        sapError = true;
        transferErrorMessage =
          axiosError.response?.data?.Return?.[0]?.MESSAGE ||
          axiosError.response?.data?.Message ||
          (axiosError.response?.data?.ModelState
            ? JSON.stringify(axiosError.response.data.ModelState)
            : axiosError.message);

        // If we already had a block error, combine the messages
        if (blockError) {
          errorMessage = `Block: ${blockErrorMessage} | Transfer API Error: ${transferErrorMessage}`;
        } else {
          errorMessage = `Transfer API Error: ${transferErrorMessage}`;
        }

        // Log the transfer error using actual values from the SAP request
        const transferItem = transferBody.GOODSMVT_ITEM[0];
        await executeQuery(
          `EXEC [dbo].[Sp_SAP_RESORTING_ERROR_LOG_Insert] 
                        @PalletBarcode, @ORDER_NUMBER, @MATERIAL, @BATCH, @PRODUCTION_PLANT,
                        @STORAGE_LOCATION, @MOVE_TYPE, @STOCK_TYPE, @MOVE_BATCH, @MOVE_STORAGELOCATION,
                        @SPEC_STOCK, @MOVEMENT_INDICATOR, @UOM, @UOM_ISO, @Qty, @Error_Message, @GM_CODE, @CreatedBy`,
          [
            { name: 'PalletBarcode', type: sql.NVarChar(255), value: Barcode },
            {
              name: 'ORDER_NUMBER',
              type: sql.NVarChar(50),
              value: transferItem.ORDERID,
            },
            {
              name: 'MATERIAL',
              type: sql.NVarChar(50),
              value: transferItem.MATERIAL,
            },
            {
              name: 'BATCH',
              type: sql.NVarChar(50),
              value: transferItem.BATCH,
            },
            {
              name: 'PRODUCTION_PLANT',
              type: sql.NVarChar(50),
              value: transferItem.PLANT,
            },
            {
              name: 'STORAGE_LOCATION',
              type: sql.NVarChar(50),
              value: transferItem.STGE_LOC,
            },
            {
              name: 'MOVE_TYPE',
              type: sql.NVarChar(50),
              value: transferItem.MOVE_TYPE,
            },
            {
              name: 'STOCK_TYPE',
              type: sql.NVarChar(50),
              value: transferItem.STCK_TYPE,
            },
            {
              name: 'MOVE_BATCH',
              type: sql.NVarChar(50),
              value: transferItem.MOVE_BATCH || '',
            },
            {
              name: 'MOVE_STORAGELOCATION',
              type: sql.NVarChar(50),
              value: transferItem.MOVE_STLOC,
            },
            {
              name: 'SPEC_STOCK',
              type: sql.NVarChar(50),
              value: transferItem.SPEC_STOCK || '',
            },
            {
              name: 'MOVEMENT_INDICATOR',
              type: sql.NVarChar(50),
              value: transferItem.MVT_IND,
            },
            {
              name: 'UOM',
              type: sql.NVarChar(50),
              value: transferItem.ENTRY_UOM,
            },
            {
              name: 'UOM_ISO',
              type: sql.NVarChar(50),
              value: transferItem.ENTRY_UOM_ISO,
            },
            {
              name: 'Qty',
              type: sql.Decimal(18, 3),
              value: transferItem.ENTRY_QNT,
            },
            {
              name: 'Error_Message',
              type: sql.NVarChar(500),
              value: `SAP API Error (Transfer): ${transferErrorMessage}`,
            },
            {
              name: 'GM_CODE',
              type: sql.NVarChar(50),
              value: transferBody.GOODSMVT_CODE.GM_CODE,
            },
            { name: 'CreatedBy', type: sql.NVarChar(50), value: UserId },
          ]
        );
      }
    } else {
      // console.log(chalk.cyan("[insertPalletBarcodeResorting] Pallet already at storage location 5190, skipping transfer operation"));
    }

    // Always execute the stored procedure regardless of SAP success or failure
    // console.log(chalk.blue("[insertPalletBarcodeResorting] Executing stored procedure..."));
    const params = [
      {
        name: 'DeliveryNo',
        type: sql.NVarChar(50),
        value: OrderNo.padStart(12, '0'),
      },
      { name: 'Material', type: sql.NVarChar(50), value: paddedMaterial },
      { name: 'Barcode', type: sql.NVarChar, value: Barcode },
      {
        name: 'PickOrderFlag',
        type: sql.NVarChar(50),
        value: PickOrderFlag || '',
      },
      { name: 'Batch', type: sql.NVarChar(50), value: BATCH },
      { name: 'UserId', type: sql.NVarChar(50), value: UserId },
      {
        name: 'PendingPick',
        type: sql.Decimal(18, 3),
        value: parseFloat(PendingPick) || 0,
      },
      {
        name: 'ReqQty',
        type: sql.Decimal(18, 3),
        value: parseFloat(ReqQty) || 0,
      },
      {
        name: 'TotalPicked',
        type: sql.Decimal(18, 3),
        value: parseFloat(TotalPicked) || 0,
      },
    ];

    console.log(chalk.cyan('[insertPalletBarcodeResorting] Stored procedure parameters:'), params);

    const result = await executeQuery(
      `EXEC [dbo].[HHT_FGPick_Resorting_PalletValidation] 
                @DeliveryNo, @Material, @Barcode, @PickOrderFlag, @Batch, @UserId, @PendingPick, @ReqQty, @TotalPicked`,
      params
    );
    console.log(chalk.green('[insertPalletBarcodeResorting] Stored procedure result:'), result);

    // Return response with proper Status from stored procedure
    const response = {
      ...result[0],
      Status: result[0]?.Status || 'T',
    };

    // Add SAP message if there was an error
    if (sapError) {
      response.SapMessage = `Process done but SAP pending⚠️ - Error: ${errorMessage}`;
      response.ErrorInSAP = true;
    } else {
      response.SapMessage = `SAP process completed successfully.`;
    }
    return res.json(response);
  } catch (error) {
    const errorResponse = {
      Status: 'F',
      error: 'Failed to execute stored procedure',
      details: error.message,
    };
    console.error(chalk.red('[insertPalletBarcodeResorting] General error:'), error);
    console.error(chalk.red('[insertPalletBarcodeResorting] ERROR RESPONSE:'), errorResponse);
    res.status(500).json(errorResponse);
  }
};

export const validatePalletBarcodeResorting = async (req, res) => {
  const { OrderNo, Material, Barcode, PickOrderFlag, UserId, PendingPick, ReqQty, TotalPicked, BATCH } = req.body;
  // console.log(req.body);
  try {
    const palletLocationResult = await executeQuery(`EXEC [dbo].[HHT_FGPick_PalletLocation_Resorting] @PalletBarcode`, [
      { name: 'PalletBarcode', type: sql.NVarChar, value: Barcode },
    ]);

    const palletLocationData = palletLocationResult[0];
    const qcStatusOfPallet = palletLocationData.QCStatus;
    if (palletLocationData.Status == 'F') {
      return res.json({ Status: 'F', Message: palletLocationData.Message }).status(200);
    }

    if (palletLocationData.Batch !== BATCH) {
      return res
        .json({
          Status: 'F',
          Message: `BATCH number mismatch scanned BATCH - ${palletLocationData.Batch} picked BATCH - ${BATCH}`,
        })
        .status(200);
    }

    if (palletLocationData.Qty > PendingPick) {
      return res
        .json({
          Status: 'F',
          Message: `Pallet Total Aval Qty is ${palletLocationData.Qty} which exceeds Pending Pick Qty ${PendingPick}`,
        })
        .status(200);
    }

    if (palletLocationData.Status === 'T') {
      return res.json(palletLocationData).status(200);
    }
  } catch (error) {
    console.error('General error:', error);
    res.status(200).json({
      Status: 'F',
      error: 'Failed to execute stored procedure',
      details: error.message,
    });
  }
};

export const getOrderPickingDetailsData = async (req, res) => {
  const { UserName, OrderNo, MatCode } = req.body;

  try {
    const result = await executeQuery(
      `EXEC [dbo].[HHT_FGPickResorting_MaterialDetailsData] @UserName, @OrderNo, @MatCode`,
      [
        { name: 'UserName', type: sql.NVarChar(50), value: UserName },
        {
          name: 'OrderNo',
          type: sql.NVarChar(50),
          value: OrderNo.padStart(12, '0'),
        },
        {
          name: 'MatCode',
          type: sql.NVarChar(50),
          value: MatCode.padStart(18, '0'),
        },
      ]
    );
    // Format response: remove leading zeros and format PickedDate
    const formatted = result.map(row => ({
      ...row,
      MATERIAL: row.MATERIAL ? row.MATERIAL.replace(/^0+/, '') : row.MATERIAL,
      ORDER_NUMBER: row.ORDER_NUMBER ? row.ORDER_NUMBER.replace(/^0+/, '') : row.ORDER_NUMBER,
      PickedDate: row.PickedDate ? format(new Date(row.PickedDate), 'yyyy-MM-dd HH:mm:ss') : null,
    }));
    res.json(formatted);
  } catch (error) {
    console.error('Error fetching material details data:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

// export const insertPalletBarcodeResorting = async (req, res) => {
//     const { update-sap-transaction, Material, Barcode, PickOrderFlag, UserId, PendingPick, ReqQty, TotalPicked , BATCH } = req.body;
//     try {
//         const palletLocationResult = await executeQuery(
//             `EXEC [dbo].[HHT_FGPick_PalletLocation_Resorting] @PalletBarcode`,
//             [{ name: 'PalletBarcode', type: sql.NVarChar(50), value: Barcode }]
//         );

//         const palletLocationData = palletLocationResult[0];
//         const qcStatusOfPallet = palletLocationData.QCStatus;
//         if (palletLocationData.Status == 'F') {
//             return res.json({ Status: 'F', Message: palletLocationData.Message }).status(200);
//         }

//         if(palletLocationData.Batch!==BATCH){
//             return res.json({ Status: 'F', Message: `BATCH number mismatch scanned BATCH - ${palletLocationData.Batch} picked BATCH - ${BATCH}` }).status(200);
//         }

//         if(palletLocationData.Qty > PendingPick) {
//             return res.json({ Status: 'F', Message: `Pallet Total Aval Qty is ${palletLocationData.Qty} which exceeds Pending Pick Qty ${PendingPick}` }).status(200);
//         }

//         const currentDate = format(new Date(), 'dd.MM.yyyy');
//         let materialDocument = "";
//         let sapError = false;
//         let errorMessage = "";
//         let blockError = false;
//         let transferError = false;
//         let blockErrorMessage = "";
//         let transferErrorMessage = "";
//         const paddedMaterial = Material.padStart(18, '0');
//         const paddedOrderNo = OrderNo.padStart(12, '0');

//         // Step 1: If QC status is Unrestricted, block the stock first (move type 344)
//         if (qcStatusOfPallet === 'Unrestricted') {
//             const blockStockBody = {
//                 ConnectionParams: SAP_SERVER,
//                 GOODSMVT_CODE: { GM_CODE: "04" },
//                 GOODSMVT_HEADER: {
//                     PSTNG_DATE: currentDate,
//                     DOC_DATE: currentDate,
//                     HEADER_TXT: "Resorting Block"
//                 },
//                 GOODSMVT_ITEM: [
//                     {
//                         MATERIAL: paddedMaterial,
//                         PLANT: "5100",
//                         STGE_LOC: palletLocationData.StorageLocation,
//                         BATCH: palletLocationData.Batch,
//                         MOVE_TYPE: "344",
//                         STCK_TYPE: "S",
//                         ITEM_TEXT: Barcode,
//                         ENTRY_QNT: palletLocationData.Qty,
//                         ENTRY_UOM: palletLocationData.Unit,
//                         ENTRY_UOM_ISO: palletLocationData.UnitISO,
//                         PO_PR_QNT: palletLocationData.Qty,
//                         ORDERID: paddedOrderNo,
//                         MVT_IND: ""
//                     }
//                 ],
//                 TESTRUN: false
//             };

//             try {
//                 const blockResponse = await axios.post(
//                     `${SAP_CONNECTOR_MIDDLEWARE_URL}/api/goods-movement/create`,
//                     blockStockBody,
//                     {
//                         headers: { 'Content-Type': 'application/json' },
//                         timeout: 300000
//                     }
//                 );

//                 if (!blockResponse.data.GoodsMovementHeadRet?.MAT_DOC) {
//                     blockError = true;
//                     sapError = true;
//                     blockErrorMessage = blockResponse.data.Return?.[0]?.MESSAGE || 'Failed to block stock in SAP';
//                     errorMessage = `Block Stock Error: ${blockErrorMessage}`;

//                     // Log the block stock error
//                     await executeQuery(
//                         `EXEC [dbo].[Sp_SAP_RESORTING_ERROR_LOG_Insert]
//                             @PalletBarcode, @ORDER_NUMBER, @MATERIAL, @BATCH, @PRODUCTION_PLANT,
//                             @STORAGE_LOCATION, @MOVE_TYPE, @STOCK_TYPE, @MOVE_BATCH, @MOVE_STORAGELOCATION,
//                             @SPEC_STOCK, @MOVEMENT_INDICATOR, @UOM, @UOM_ISO, @Qty, @Error_Message, @CreatedBy`,
//                         [
//                             { name: 'PalletBarcode', type: sql.NVarChar(255), value: Barcode },
//                             { name: 'ORDER_NUMBER', type: sql.NVarChar(50), value: paddedOrderNo },
//                             { name: 'MATERIAL', type: sql.NVarChar(50), value: paddedMaterial },
//                             { name: 'BATCH', type: sql.NVarChar(50), value: palletLocationData.Batch },
//                             { name: 'PRODUCTION_PLANT', type: sql.NVarChar(50), value: "5100" },
//                             { name: 'STORAGE_LOCATION', type: sql.NVarChar(50), value: "5110" },
//                             { name: 'MOVE_TYPE', type: sql.NVarChar(50), value: "344" },
//                             { name: 'STOCK_TYPE', type: sql.NVarChar(50), value: "S" },
//                             { name: 'MOVE_BATCH', type: sql.NVarChar(50), value: "" },
//                             { name: 'MOVE_STORAGELOCATION', type: sql.NVarChar(50), value: "" },
//                             { name: 'SPEC_STOCK', type: sql.NVarChar(50), value: "" },
//                             { name: 'MOVEMENT_INDICATOR', type: sql.NVarChar(50), value: "" },
//                             { name: 'UOM', type: sql.NVarChar(50), value: palletLocationData.Unit },
//                             { name: 'UOM_ISO', type: sql.NVarChar(50), value: palletLocationData.UnitISO },
//                             { name: 'Qty', type: sql.Decimal(18, 3), value: palletLocationData.Qty },
//                             { name: 'Error_Message', type: sql.NVarChar(500), value: blockErrorMessage },
//                             { name: 'CreatedBy', type: sql.NVarChar(50), value: UserId }
//                         ]
//                     );
//                 }
//             } catch (axiosError) {
//                 blockError = true;
//                 sapError = true;
//                 blockErrorMessage = axiosError.response?.data?.Return?.[0]?.MESSAGE ||
//                             axiosError.response?.data?.Message ||
//                             (axiosError.response?.data?.ModelState ? JSON.stringify(axiosError.response.data.ModelState) : axiosError.message);
//                 errorMessage = `Block Stock API Error: ${blockErrorMessage}`;

//                 // Log the block stock error
//                 await executeQuery(
//                     `EXEC [dbo].[Sp_SAP_RESORTING_ERROR_LOG_Insert]
//                         @PalletBarcode, @ORDER_NUMBER, @MATERIAL, @BATCH, @PRODUCTION_PLANT,
//                         @STORAGE_LOCATION, @MOVE_TYPE, @STOCK_TYPE, @MOVE_BATCH, @MOVE_STORAGELOCATION,
//                         @SPEC_STOCK, @MOVEMENT_INDICATOR, @UOM, @UOM_ISO, @Qty, @Error_Message, @CreatedBy`,
//                     [
//                         { name: 'PalletBarcode', type: sql.NVarChar(255), value: Barcode },
//                         { name: 'ORDER_NUMBER', type: sql.NVarChar(50), value: paddedOrderNo },
//                         { name: 'MATERIAL', type: sql.NVarChar(50), value: paddedMaterial },
//                         { name: 'BATCH', type: sql.NVarChar(50), value: palletLocationData.Batch },
//                         { name: 'PRODUCTION_PLANT', type: sql.NVarChar(50), value: "5100" },
//                         { name: 'STORAGE_LOCATION', type: sql.NVarChar(50), value: "5110" },
//                         { name: 'MOVE_TYPE', type: sql.NVarChar(50), value: "344" },
//                         { name: 'STOCK_TYPE', type: sql.NVarChar(50), value: "S" },
//                         { name: 'MOVE_BATCH', type: sql.NVarChar(50), value: "" },
//                         { name: 'MOVE_STORAGELOCATION', type: sql.NVarChar(50), value: "" },
//                         { name: 'SPEC_STOCK', type: sql.NVarChar(50), value: "" },
//                         { name: 'MOVEMENT_INDICATOR', type: sql.NVarChar(50), value: "" },
//                         { name: 'UOM', type: sql.NVarChar(50), value: palletLocationData.Unit },
//                         { name: 'UOM_ISO', type: sql.NVarChar(50), value: palletLocationData.UnitISO },
//                         { name: 'Qty', type: sql.Decimal(18, 3), value: palletLocationData.Qty },
//                         { name: 'Error_Message', type: sql.NVarChar(500), value: `SAP API Error (Block): ${blockErrorMessage}` },
//                         { name: 'CreatedBy', type: sql.NVarChar(50), value: UserId }
//                     ]
//                 );
//             }
//         }

//         // Step 2: Transfer to location 5190 (only if not already at 5190)
//         // Try transfer even if block failed - we'll log both errors separately
//         if (palletLocationData.StorageLocation !== "5190") {
//             const transferBody = {
//                 ConnectionParams: SAP_SERVER,
//                 GOODSMVT_CODE: { GM_CODE: "04" },
//                 GOODSMVT_HEADER: {
//                     PSTNG_DATE: currentDate,
//                     DOC_DATE: currentDate,
//                     HEADER_TXT: "Stock Transfer"
//                 },
//                 GOODSMVT_ITEM: [
//                     {
//                         MATERIAL: paddedMaterial,
//                         PLANT: "5100",
//                         STGE_LOC: "5190",
//                         BATCH: palletLocationData.Batch,
//                         MOVE_TYPE: "325",
//                         STCK_TYPE: "S",
//                         MOVE_STLOC: palletLocationData.StorageLocation,
//                         ITEM_TEXT: Barcode,
//                         ENTRY_QNT: palletLocationData.Qty,
//                         ENTRY_UOM: palletLocationData.Unit,
//                         ENTRY_UOM_ISO: palletLocationData.UnitISO,
//                         PO_PR_QNT: palletLocationData.Qty,
//                         ORDERID: paddedOrderNo,
//                         MVT_IND: ""
//                     }
//                 ],
//                 TESTRUN: false
//             };

//             try {
//                 const transferResponse = await axios.post(
//                     `${SAP_CONNECTOR_MIDDLEWARE_URL}/api/goods-movement/create`,
//                     transferBody,
//                     {
//                         headers: { 'Content-Type': 'application/json' },
//                         timeout: 300000
//                     }
//                 );

//                 if (!transferResponse.data.GoodsMovementHeadRet?.MAT_DOC) {
//                     transferError = true;
//                     sapError = true;
//                     transferErrorMessage = transferResponse.data.Return?.[0]?.MESSAGE || 'Failed to transfer stock in SAP';

//                     // If we already had a block error, combine the messages
//                     if (blockError) {
//                         errorMessage = `Block: ${blockErrorMessage} | Transfer: ${transferErrorMessage}`;
//                     } else {
//                         errorMessage = `Transfer Error: ${transferErrorMessage}`;
//                     }

//                     // Log the transfer error
//                     await executeQuery(
//                         `EXEC [dbo].[Sp_SAP_RESORTING_ERROR_LOG_Insert]
//                             @PalletBarcode, @ORDER_NUMBER, @MATERIAL, @BATCH, @PRODUCTION_PLANT,
//                             @STORAGE_LOCATION, @MOVE_TYPE, @STOCK_TYPE, @MOVE_BATCH, @MOVE_STORAGELOCATION,
//                             @SPEC_STOCK, @MOVEMENT_INDICATOR, @UOM, @UOM_ISO, @Qty, @Error_Message, @CreatedBy`,
//                         [
//                             { name: 'PalletBarcode', type: sql.NVarChar(255), value: Barcode },
//                             { name: 'ORDER_NUMBER', type: sql.NVarChar(50), value: paddedOrderNo },
//                             { name: 'MATERIAL', type: sql.NVarChar(50), value: paddedMaterial },
//                             { name: 'BATCH', type: sql.NVarChar(50), value: palletLocationData.Batch },
//                             { name: 'PRODUCTION_PLANT', type: sql.NVarChar(50), value: "5100" },
//                             { name: 'STORAGE_LOCATION', type: sql.NVarChar(50), value: "5190" },
//                             { name: 'MOVE_TYPE', type: sql.NVarChar(50), value: "325" },
//                             { name: 'STOCK_TYPE', type: sql.NVarChar(50), value: "S" },
//                             { name: 'MOVE_BATCH', type: sql.NVarChar(50), value: "" },
//                             { name: 'MOVE_STORAGELOCATION', type: sql.NVarChar(50), value: "5110" },
//                             { name: 'SPEC_STOCK', type: sql.NVarChar(50), value: "" },
//                             { name: 'MOVEMENT_INDICATOR', type: sql.NVarChar(50), value: "" },
//                             { name: 'UOM', type: sql.NVarChar(50), value: palletLocationData.Unit },
//                             { name: 'UOM_ISO', type: sql.NVarChar(50), value: palletLocationData.UnitISO },
//                             { name: 'Qty', type: sql.Decimal(18, 3), value: palletLocationData.Qty },
//                             { name: 'Error_Message', type: sql.NVarChar(500), value: transferErrorMessage },
//                             { name: 'CreatedBy', type: sql.NVarChar(50), value: UserId }
//                         ]
//                     );
//                 }
//             } catch (axiosError) {
//                 transferError = true;
//                 sapError = true;
//                 transferErrorMessage = axiosError.response?.data?.Return?.[0]?.MESSAGE ||
//                             axiosError.response?.data?.Message ||
//                             (axiosError.response?.data?.ModelState ? JSON.stringify(axiosError.response.data.ModelState) : axiosError.message);

//                 // If we already had a block error, combine the messages
//                 if (blockError) {
//                     errorMessage = `Block: ${blockErrorMessage} | Transfer API Error: ${transferErrorMessage}`;
//                 } else {
//                     errorMessage = `Transfer API Error: ${transferErrorMessage}`;
//                 }

//                 // Log the transfer error
//                 await executeQuery(
//                     `EXEC [dbo].[Sp_SAP_RESORTING_ERROR_LOG_Insert]
//                         @PalletBarcode, @ORDER_NUMBER, @MATERIAL, @BATCH, @PRODUCTION_PLANT,
//                         @STORAGE_LOCATION, @MOVE_TYPE, @STOCK_TYPE, @MOVE_BATCH, @MOVE_STORAGELOCATION,
//                         @SPEC_STOCK, @MOVEMENT_INDICATOR, @UOM, @UOM_ISO, @Qty, @Error_Message, @CreatedBy`,
//                     [
//                         { name: 'PalletBarcode', type: sql.NVarChar(255), value: Barcode },
//                         { name: 'ORDER_NUMBER', type: sql.NVarChar(50), value: paddedOrderNo },
//                         { name: 'MATERIAL', type: sql.NVarChar(50), value: paddedMaterial },
//                         { name: 'BATCH', type: sql.NVarChar(50), value: palletLocationData.Batch },
//                         { name: 'PRODUCTION_PLANT', type: sql.NVarChar(50), value: "5100" },
//                         { name: 'STORAGE_LOCATION', type: sql.NVarChar(50), value: "5190" },
//                         { name: 'MOVE_TYPE', type: sql.NVarChar(50), value: "325" },
//                         { name: 'STOCK_TYPE', type: sql.NVarChar(50), value: "S" },
//                         { name: 'MOVE_BATCH', type: sql.NVarChar(50), value: "" },
//                         { name: 'MOVE_STORAGELOCATION', type: sql.NVarChar(50), value: "5110" },
//                         { name: 'SPEC_STOCK', type: sql.NVarChar(50), value: "" },
//                         { name: 'MOVEMENT_INDICATOR', type: sql.NVarChar(50), value: "" },
//                         { name: 'UOM', type: sql.NVarChar(50), value: palletLocationData.Unit },
//                         { name: 'UOM_ISO', type: sql.NVarChar(50), value: palletLocationData.UnitISO },
//                         { name: 'Qty', type: sql.Decimal(18, 3), value: palletLocationData.Qty },
//                         { name: 'Error_Message', type: sql.NVarChar(500), value: `SAP API Error (Transfer): ${transferErrorMessage}` },
//                         { name: 'CreatedBy', type: sql.NVarChar(50), value: UserId }
//                     ]
//                 );
//             }
//         }

//         // Step 3: Final good issue - attempt even if previous steps failed, so we log all errors
//         const goodIssueBody = {
//             ConnectionParams: SAP_SERVER,
//             GOODSMVT_CODE: { GM_CODE: "04" },
//             GOODSMVT_HEADER: {
//                 PSTNG_DATE: currentDate,
//                 DOC_DATE: currentDate,
//                 HEADER_TXT: "Good Issue"
//             },
//             GOODSMVT_ITEM: [
//                 {
//                     MATERIAL: paddedMaterial,
//                     PLANT: "5100",
//                     // Use original storage location if at 5190, otherwise use 5190
//                     STGE_LOC: (palletLocationData.StorageLocation === "5190") ? "5190" : "5190",
//                     BATCH: palletLocationData.Batch,
//                     MOVE_TYPE: "261",
//                     STCK_TYPE: "S",
//                     ITEM_TEXT: Barcode,
//                     SPEC_STOCK: "",
//                     ENTRY_QNT: palletLocationData.Qty,
//                     ENTRY_UOM: palletLocationData.Unit,
//                     ENTRY_UOM_ISO: palletLocationData.UnitISO,
//                     ORDERID: paddedOrderNo,
//                     MVT_IND: ""
//                 }
//             ],
//             TESTRUN: false
//         };

//         try {
//             const goodIssueResponse = await axios.post(
//                 `${SAP_CONNECTOR_MIDDLEWARE_URL}/api/goods-movement/create`,
//                 goodIssueBody,
//                 {
//                     headers: { 'Content-Type': 'application/json' },
//                     timeout: 300000
//                 }
//             );

//             const sapResponse = goodIssueResponse.data;

//             materialDocument = sapResponse.GoodsMovementHeadRet?.MAT_DOC;
//             if (!materialDocument) {
//                 sapError = true;
//                 let goodIssueErrorMessage = sapResponse.Return?.[0]?.MESSAGE || 'Failed to get material document number from SAP';

//                 // Combine all error messages if we had previous errors
//                 if (blockError || transferError) {
//                     errorMessage = errorMessage + ` | Good Issue: ${goodIssueErrorMessage}`;
//                 } else {
//                     errorMessage = `Good Issue Error: ${goodIssueErrorMessage}`;
//                 }

//                 // Log the good issue error
//                 await executeQuery(
//                     `EXEC [dbo].[Sp_SAP_RESORTING_ERROR_LOG_Insert]
//                         @PalletBarcode, @ORDER_NUMBER, @MATERIAL, @BATCH, @PRODUCTION_PLANT,
//                         @STORAGE_LOCATION, @MOVE_TYPE, @STOCK_TYPE, @MOVE_BATCH, @MOVE_STORAGELOCATION,
//                         @SPEC_STOCK, @MOVEMENT_INDICATOR, @UOM, @UOM_ISO, @Qty, @Error_Message, @CreatedBy`,
//                     [
//                         { name: 'PalletBarcode', type: sql.NVarChar(255), value: Barcode },
//                         { name: 'ORDER_NUMBER', type: sql.NVarChar(50), value: paddedOrderNo },
//                         { name: 'MATERIAL', type: sql.NVarChar(50), value: paddedMaterial },
//                         { name: 'BATCH', type: sql.NVarChar(50), value: palletLocationData.Batch },
//                         { name: 'PRODUCTION_PLANT', type: sql.NVarChar(50), value: "5100" },
//                         { name: 'STORAGE_LOCATION', type: sql.NVarChar(50), value: "5190" },
//                         { name: 'MOVE_TYPE', type: sql.NVarChar(50), value: "261" },
//                         { name: 'STOCK_TYPE', type: sql.NVarChar(50), value: "S" },
//                         { name: 'MOVE_BATCH', type: sql.NVarChar(50), value: "" },
//                         { name: 'MOVE_STORAGELOCATION', type: sql.NVarChar(50), value: "" },
//                         { name: 'SPEC_STOCK', type: sql.NVarChar(50), value: "" },
//                         { name: 'MOVEMENT_INDICATOR', type: sql.NVarChar(50), value: "" },
//                         { name: 'UOM', type: sql.NVarChar(50), value: palletLocationData.Unit },
//                         { name: 'UOM_ISO', type: sql.NVarChar(50), value: palletLocationData.UnitISO },
//                         { name: 'Qty', type: sql.Decimal(18, 3), value: palletLocationData.Qty },
//                         { name: 'Error_Message', type: sql.NVarChar(500), value: goodIssueErrorMessage },
//                         { name: 'CreatedBy', type: sql.NVarChar(50), value: UserId }
//                     ]
//                 );
//             }
//         } catch (axiosError) {
//             sapError = true;
//             let goodIssueErrorMessage = axiosError.response?.data?.Return?.[0]?.MESSAGE ||
//                       axiosError.response?.data?.Message ||
//                       (axiosError.response?.data?.ModelState ? JSON.stringify(axiosError.response.data.ModelState) : axiosError.message);

//             // Combine all error messages if we had previous errors
//             if (blockError || transferError) {
//                 errorMessage = errorMessage + ` | Good Issue API Error: ${goodIssueErrorMessage}`;
//             } else {
//                 errorMessage = `Good Issue API Error: ${goodIssueErrorMessage}`;
//             }

//             // Log the good issue error
//             await executeQuery(
//                 `EXEC [dbo].[Sp_SAP_RESORTING_ERROR_LOG_Insert]
//                     @PalletBarcode, @ORDER_NUMBER, @MATERIAL, @BATCH, @PRODUCTION_PLANT,
//                     @STORAGE_LOCATION, @MOVE_TYPE, @STOCK_TYPE, @MOVE_BATCH, @MOVE_STORAGELOCATION,
//                     @SPEC_STOCK, @MOVEMENT_INDICATOR, @UOM, @UOM_ISO, @Qty, @Error_Message, @CreatedBy`,
//                 [
//                     { name: 'PalletBarcode', type: sql.NVarChar(255), value: Barcode },
//                     { name: 'ORDER_NUMBER', type: sql.NVarChar(50), value: paddedOrderNo },
//                     { name: 'MATERIAL', type: sql.NVarChar(50), value: paddedMaterial },
//                     { name: 'BATCH', type: sql.NVarChar(50), value: palletLocationData.Batch },
//                     { name: 'PRODUCTION_PLANT', type: sql.NVarChar(50), value: "5100" },
//                     { name: 'STORAGE_LOCATION', type: sql.NVarChar(50), value: "5190" },
//                     { name: 'MOVE_TYPE', type: sql.NVarChar(50), value: "261" },
//                     { name: 'STOCK_TYPE', type: sql.NVarChar(50), value: "S" },
//                     { name: 'MOVE_BATCH', type: sql.NVarChar(50), value: "" },
//                     { name: 'MOVE_STORAGELOCATION', type: sql.NVarChar(50), value: "" },
//                     { name: 'SPEC_STOCK', type: sql.NVarChar(50), value: "" },
//                     { name: 'MOVEMENT_INDICATOR', type: sql.NVarChar(50), value: "" },
//                     { name: 'UOM', type: sql.NVarChar(50), value: palletLocationData.Unit },
//                     { name: 'UOM_ISO', type: sql.NVarChar(50), value: palletLocationData.UnitISO },
//                     { name: 'Qty', type: sql.Decimal(18, 3), value: palletLocationData.Qty },
//                     { name: 'Error_Message', type: sql.NVarChar(500), value: `SAP API Error (Good Issue): ${goodIssueErrorMessage}` },
//                     { name: 'CreatedBy', type: sql.NVarChar(50), value: UserId }
//                 ]
//             );
//         }

//         // Always execute the stored procedure regardless of SAP success or failure
//         const params = [
//             { name: 'DeliveryNo', type: sql.NVarChar(50), value: paddedOrderNo },
//             { name: 'Material', type: sql.NVarChar(50), value: paddedMaterial },
//             { name: 'Barcode', type: sql.NVarChar(50), value: Barcode },
//             { name: 'PickOrderFlag', type: sql.NVarChar(50), value: PickOrderFlag || "" },
//             { name: 'Batch', type: sql.NVarChar(50), value: BATCH },
//             { name: 'UserId', type: sql.NVarChar(50), value: UserId },
//             { name: 'PendingPick', type: sql.Decimal(18, 3), value: parseFloat(PendingPick) || 0 },
//             { name: 'ReqQty', type: sql.Decimal(18, 3), value: parseFloat(ReqQty) || 0 },
//             { name: 'TotalPicked', type: sql.Decimal(18, 3), value: parseFloat(TotalPicked) || 0 }
//         ];

//         const result = await executeQuery(
//             `EXEC [dbo].[HHT_FGPick_Resorting_PalletValidation]
//                 @DeliveryNo, @Material, @Barcode, @PickOrderFlag, @Batch, @UserId, @PendingPick, @ReqQty, @TotalPicked`,
//             params
//         );

//         if (sapError) {
//             return res.json({
//                 ...(result[0]),
//                 SapMessage: `Process done but SAP pending⚠️ - Error: ${errorMessage}`,
//                 ErrorInSAP: true,
//                 Status: result[0]?.Status || 'T'
//             });
//         } else {
//             return res.json({
//                 ...(result[0]),
//                 SapMessage: `SAP process completed successfully. Material Document: ${materialDocument}`,
//                 MaterialDocument: materialDocument,
//                 Status: result[0]?.Status || 'T'
//             });
//         }

//     } catch (error) {
//         console.error("General error:", error);
//         res.status(500).json({
//             Status: 'F',
//             error: 'Failed to execute stored procedure',
//             details: error.message
//         });
//     }
// };
