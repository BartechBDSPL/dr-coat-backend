import { executeQuery, sql } from '../../config/db.js';
import { SAP_CONNECTOR_MIDDLEWARE_URL, SAP_SERVER } from '../../utils/constants.js';
import axios from 'axios';
import { format } from 'date-fns';

export const getUnqiqueOrderNo = async (req, res) => {
  const { UserName } = req.body;

  try {
    const result = await executeQuery('EXEC HHT_FGPick_Unique_PendingOrders @UserName', [
      { name: 'UserName', type: sql.NVarChar, value: UserName },
    ]);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

export const orderNoGetAllData = async (req, res) => {
  const { UserName } = req.body;

  try {
    const result = await executeQuery('EXEC HHT_FGPick_OrderNoGetDataALL @UserName', [
      { name: 'UserName', type: sql.NVarChar, value: UserName },
    ]);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

export const getMaterialDetailsData = async (req, res) => {
  const { UserName, OrderNo, MatCode } = req.body;

  try {
    const result = await executeQuery(`EXEC [dbo].[HHT_FGPick_MaterialDetailsData] @UserName, @OrderNo, @MatCode`, [
      { name: 'UserName', type: sql.NVarChar(50), value: UserName },
      { name: 'OrderNo', type: sql.NVarChar(50), value: OrderNo },
      {
        name: 'MatCode',
        type: sql.NVarChar(50),
        value: MatCode.padStart(18, '0'),
      },
    ]);
    res.json(result);
  } catch (error) {
    console.error('Error fetching material details data:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const fgPickOrderNOGetData = async (req, res) => {
  const { OrderNo, UserName } = req.body;
  try {
    const result = await executeQuery('EXEC HHT_FGPick_OrderNoGetData @OrderNo, @UserName', [
      { name: 'OrderNo', type: sql.NVarChar, value: OrderNo },
      { name: 'UserName', type: sql.NVarChar, value: UserName },
    ]);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

export const validateBarcode = async (req, res) => {
  const { DeliveryNo, Material, Barcode, PickOrderFlag, UserId } = req.body;

  try {
    const result = await executeQuery(
      `EXEC [dbo].[HHT_FGPick_BarcodeValidation] @DeliveryNo, @Material, @Barcode, @PickOrderFlag, @UserId`,
      [
        { name: 'DeliveryNo', type: sql.NVarChar(50), value: DeliveryNo },
        { name: 'Material', type: sql.NVarChar(50), value: Material },
        { name: 'Barcode', type: sql.NVarChar(50), value: Barcode },
        { name: 'PickOrderFlag', type: sql.NVarChar(50), value: PickOrderFlag },
        { name: 'UserId', type: sql.NVarChar(50), value: UserId },
      ]
    );

    res.json(result[0]);
  } catch (error) {
    console.error('Error validating barcode:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const validatePalletBarcode = async (req, res) => {
  const { DeliveryNo, Material, Barcode, PickOrderFlag, UserId, PendingPick, ReqQty, TotalPicked } = req.body;
  try {
    const palletLocationResult = await executeQuery(`EXEC [dbo].[HHT_FGPick_PalletLocation] @PalletBarcode`, [
      { name: 'PalletBarcode', type: sql.NVarChar, value: Barcode },
    ]);
    const palletLocationData = palletLocationResult[0];
    if (palletLocationData.Status == 'F') {
      return res.json({ Status: 'F', Message: palletLocationData.Message }).status(200);
    }
    if (palletLocationData.MATERIAL.padStart(18, '0') !== Material.padStart(18, '0')) {
      const deliveryMaterial = Material.replace(/^0+/, '');
      const palletMaterial = palletLocationData.MATERIAL.replace(/^0+/, '');
      return res
        .json({
          Status: 'F',
          Message:
            'Material mismatch: Delivery order is for Material: ' +
            deliveryMaterial +
            ' but Pallet is of Material: ' +
            palletMaterial,
        })
        .status(200);
    }
    if (palletLocationData.Qty > PendingPick) {
      const boxesToPick = Math.ceil(parseFloat(PendingPick) / parseFloat(palletLocationData.ZPE));
      return res
        .json({
          Status: 'F',
          Message: `Pallet Total Qty is ${parseFloat(palletLocationData.Qty)} which exceeds Pending Pick Qty ${parseFloat(PendingPick)}. Please pick ${boxesToPick} box(es).`,
        })
        .status(200);
    }
    let barcodeType = Barcode.includes(';') ? 'Existing Pallet' : 'Our Pallet';
    console.log(palletLocationData);
    return res
      .json({
        Status: 'T',
        Message: 'Pallet barcode validated successfully.',
        Batch: palletLocationData.BATCH,
        Material: palletLocationData.MATERIAL.replace(/^0+/, ''),
        OrderNumber: palletLocationData.OrderNo.replace(/^0+/, ''),
        Bin: palletLocationData.Location,
        Qty: palletLocationData.Qty,
        palletType: barcodeType,
      })
      .status(200);
  } catch (error) {
    console.error('Error in validatePalletBarcode:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const validateBoxBarcode = async (req, res) => {
  const { DeliveryNo, Material, Barcode, PickOrderFlag, UserId, PendingPick, ReqQty, TotalPicked } = req.body;
  try {
    const boxLocationResult = await executeQuery(`EXEC [dbo].[HHT_FGPick_BoxLocation] @BoxBarcode`, [
      { name: 'BoxBarcode', type: sql.NVarChar, value: Barcode },
    ]);
    const boxLocationData = boxLocationResult[0];
    if (boxLocationData.Status == 'F') {
      return res.json({ Status: 'F', Message: boxLocationData.Message }).status(200);
    }
    if (boxLocationData.MATERIAL.padStart(18, '0') !== Material.padStart(18, '0')) {
      // Remove leading zeros for display
      const deliveryMaterial = Material.replace(/^0+/, '');
      const boxMaterial = boxLocationData.MATERIAL.replace(/^0+/, '');
      return res
        .json({
          Status: 'F',
          Message:
            'Material mismatch: Delivery order is for Material: ' +
            deliveryMaterial +
            ' but Box is of Material: ' +
            boxMaterial,
        })
        .status(200);
    }
    if (boxLocationData.Qty > PendingPick) {
      return res
        .json({
          Status: 'F',
          Message: `Box Total Qty is ${parseFloat(boxLocationData.Qty)} which exceeds Pending Pick Qty ${parseFloat(PendingPick)}.`,
        })
        .status(200);
    }
    console.log(boxLocationData.Qty, PendingPick);
    return res
      .json({
        Status: 'T',
        Message: 'Box barcode validated successfully.',
        Batch: boxLocationData.BATCH,
        Material: boxLocationData.MATERIAL.replace(/^0+/, ''),
        OrderNumber: boxLocationData.OrderNo.replace(/^0+/, ''),
        Bin: boxLocationData.Location.replace(/^0+/, ''),
      })
      .status(200);
  } catch (error) {
    console.error('Error in validateBoxBarcode:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const updateBarcodeData = async (req, res) => {
  const { DeliveryNo, Material, Barcode, UserId, ReqQty, TotalPicked, PickedQty } = req.body;

  try {
    const currentDate = format(new Date(), 'dd.MM.yyyy');
    const barcodeElements = Barcode.split('|');
    const batch = barcodeElements[2];

    const boxLocationResult = await executeQuery(`EXEC [dbo].[HHT_FGPick_BoxLocation] @Barcode`, [
      { name: 'Barcode', type: sql.NVarChar(255), value: Barcode },
    ]);

    const boxLocation = boxLocationResult[0];
    if (boxLocation.Status !== 'T') {
      console.warn('[updateBarcodeData] Invalid box location:', boxLocation.Message);
      return res.status(200).json(boxLocation);
    }

    const sapRequestBody = {
      ConnectionParams: SAP_SERVER,
      GOODSMVT_CODE: { GM_CODE: '04' },
      GOODSMVT_HEADER: {
        PSTNG_DATE: currentDate,
        DOC_DATE: currentDate,
        HEADER_TXT: 'Mat Dispatch SCAN',
      },
      GOODSMVT_ITEM: [
        {
          MATERIAL: Material.padStart(18, '0'),
          PLANT: '5100',
          STGE_LOC: boxLocation.StorageLocation,
          BATCH: batch,
          MOVE_TYPE: '311',
          STCK_TYPE: ' ',
          MOVE_BATCH: batch,
          MOVE_STLOC: '5199',
          ITEM_TEXT: Barcode.length > 45 ? Barcode.substring(0, 45) : Barcode,
          SPEC_STOCK: '',
          ENTRY_QNT: boxLocation.Qty, // Updated parsing
          ENTRY_UOM: boxLocation.Unit,
          ENTRY_UOM_ISO: boxLocation.UnitISO,
          ORDERID: boxLocation.OrderNo,
          MVT_IND: '',
        },
      ],
      TESTRUN: false,
    };

    let materialDocument = '';
    let sapErrorOccurred = false;
    let errorMessage = '';

    try {
      const response = await axios.post(`${SAP_CONNECTOR_MIDDLEWARE_URL}/api/goods-movement/create`, sapRequestBody, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000,
      });

      const sapResponse = response.data;

      materialDocument = sapResponse.GoodsMovementHeadRet?.MAT_DOC;
      if (!materialDocument) {
        errorMessage = sapResponse.Return[0]?.MESSAGE || 'Failed to get material document number from SAP';
        sapErrorOccurred = true;

        // Log error to database
        await executeQuery(
          `EXEC [dbo].[Sp_SAP_MATERIALPICKING_ERROR_LOG_Insert] 
                        @PalletBarcode, 
                        @ORDER_NUMBER, 
                        @MATERIAL, 
                        @BATCH, 
                        @PRODUCTION_PLANT,
                        @STORAGE_LOCATION,
                        @MOVE_TYPE,
                        @STOCK_TYPE,
                        @MOVE_BATCH,
                        @MOVE_STORAGELOCATION,
                        @SPEC_STOCK,
                        @MOVEMENT_INDICATOR,
                        @UOM,
                        @UOM_ISO,
                        @Qty,
                        @Error_Message,
                        @CreatedBy`,
          [
            { name: 'PalletBarcode', type: sql.NVarChar(255), value: Barcode },
            {
              name: 'ORDER_NUMBER',
              type: sql.NVarChar(50),
              value: boxLocation.OrderNo,
            },
            {
              name: 'MATERIAL',
              type: sql.NVarChar(50),
              value: Material.padStart(18, '0'),
            },
            { name: 'BATCH', type: sql.NVarChar(50), value: batch },
            { name: 'PRODUCTION_PLANT', type: sql.NVarChar(50), value: '5100' },
            {
              name: 'STORAGE_LOCATION',
              type: sql.NVarChar(50),
              value: boxLocation.StorageLocation,
            },
            { name: 'MOVE_TYPE', type: sql.NVarChar(50), value: '311' },
            { name: 'STOCK_TYPE', type: sql.NVarChar(50), value: ' ' },
            { name: 'MOVE_BATCH', type: sql.NVarChar(50), value: batch },
            {
              name: 'MOVE_STORAGELOCATION',
              type: sql.NVarChar(50),
              value: '5199',
            },
            { name: 'SPEC_STOCK', type: sql.NVarChar(50), value: '' },
            { name: 'MOVEMENT_INDICATOR', type: sql.NVarChar(50), value: '' },
            { name: 'UOM', type: sql.NVarChar(50), value: boxLocation.Unit },
            {
              name: 'UOM_ISO',
              type: sql.NVarChar(50),
              value: boxLocation.UnitISO,
            },
            { name: 'Qty', type: sql.Decimal(18, 3), value: boxLocation.Qty },
            {
              name: 'Error_Message',
              type: sql.NVarChar(500),
              value: errorMessage,
            },
            { name: 'CreatedBy', type: sql.NVarChar(50), value: UserId },
          ]
        );
      }
    } catch (axiosError) {
      sapErrorOccurred = true;
      errorMessage =
        axiosError.response?.data?.Message || axiosError.response?.data?.ModelState
          ? JSON.stringify(axiosError.response.data.ModelState)
          : axiosError.message;

      // Log error to database
      await executeQuery(
        `EXEC [dbo].[Sp_SAP_MATERIALPICKING_ERROR_LOG_Insert] 
                    @PalletBarcode, 
                    @ORDER_NUMBER, 
                    @MATERIAL, 
                    @BATCH, 
                    @PRODUCTION_PLANT,
                    @STORAGE_LOCATION,
                    @MOVE_TYPE,
                    @STOCK_TYPE,
                    @MOVE_BATCH,
                    @MOVE_STORAGELOCATION,
                    @SPEC_STOCK,
                    @MOVEMENT_INDICATOR,
                    @UOM,
                    @UOM_ISO,
                    @Qty,
                    @Error_Message,
                    @CreatedBy`,
        [
          { name: 'PalletBarcode', type: sql.NVarChar(255), value: Barcode },
          {
            name: 'ORDER_NUMBER',
            type: sql.NVarChar(50),
            value: boxLocation.OrderNo,
          },
          {
            name: 'MATERIAL',
            type: sql.NVarChar(50),
            value: Material.padStart(18, '0'),
          },
          { name: 'BATCH', type: sql.NVarChar(50), value: batch },
          { name: 'PRODUCTION_PLANT', type: sql.NVarChar(50), value: '5100' },
          {
            name: 'STORAGE_LOCATION',
            type: sql.NVarChar(50),
            value: boxLocation.StorageLocation,
          },
          { name: 'MOVE_TYPE', type: sql.NVarChar(50), value: '311' },
          { name: 'STOCK_TYPE', type: sql.NVarChar(50), value: ' ' },
          { name: 'MOVE_BATCH', type: sql.NVarChar(50), value: batch },
          {
            name: 'MOVE_STORAGELOCATION',
            type: sql.NVarChar(50),
            value: '5199',
          },
          { name: 'SPEC_STOCK', type: sql.NVarChar(50), value: '' },
          { name: 'MOVEMENT_INDICATOR', type: sql.NVarChar(50), value: '' },
          { name: 'UOM', type: sql.NVarChar(50), value: boxLocation.Unit },
          {
            name: 'UOM_ISO',
            type: sql.NVarChar(50),
            value: boxLocation.UnitISO,
          },
          { name: 'Qty', type: sql.Decimal(18, 3), value: boxLocation.Qty },
          {
            name: 'Error_Message',
            type: sql.NVarChar(500),
            value: `SAP API Error: ${errorMessage}`,
          },
          { name: 'CreatedBy', type: sql.NVarChar(50), value: UserId },
        ]
      );
    }

    // Proceed with database update regardless of SAP success/failure
    const result = await executeQuery(
      `EXEC [dbo].[HHT_FGPick_BarcodeUpdateData] 
                @DeliveryNo, @Material, @Barcode, @Batch, @UserId, 
                @ReqQty, @TotalPicked, @PickedQty`,
      [
        { name: 'DeliveryNo', type: sql.NVarChar(50), value: DeliveryNo },
        { name: 'Material', type: sql.NVarChar(50), value: Material },
        { name: 'Barcode', type: sql.NVarChar(50), value: Barcode },
        { name: 'Batch', type: sql.NVarChar(50), value: batch },
        { name: 'UserId', type: sql.NVarChar(50), value: UserId },
        { name: 'ReqQty', type: sql.Decimal(18, 3), value: ReqQty },
        { name: 'TotalPicked', type: sql.Decimal(18, 3), value: TotalPicked },
        { name: 'PickedQty', type: sql.Decimal(18, 3), value: PickedQty },
      ]
    );

    if (sapErrorOccurred) {
      res.json({
        Status: 'T', // Still return success to allow process to continue
        Message: `Barcode picked in system but SAP pending⚠️ - Error: ${errorMessage}`,
        ErrorInSAP: true,
      });
    } else {
      res.json({
        Status: 'T',
        Message: `Barcode picked successfully. Document number: ${materialDocument}`,
        MaterialDocument: materialDocument,
      });
    }
  } catch (error) {
    console.error('[updateBarcodeData] Error occurred:', error);
    console.error('[updateBarcodeData] Stack trace:', error.stack);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const fgPickBarcodeReversal = async (req, res) => {
  const { Barcode, DeliveryNo, Material, UserId } = req.body;
  try {
    const delimiterCount = (Barcode.match(/\|/g) || []).length;

    if (delimiterCount !== 2 && delimiterCount !== 4) {
      return res.json({
        Status: 'F',
        Message: 'Invalid Barcode',
      });
    }

    const procedureName = delimiterCount === 2 ? 'HHT_FGPick_PalletReversal' : 'HHT_FGPick_BarcodeReversal';

    const result = await executeQuery(`EXEC [dbo].[${procedureName}] @Barcode, @DeliveryNo, @Material, @UserId`, [
      { name: 'Barcode', type: sql.NVarChar(50), value: Barcode },
      { name: 'DeliveryNo', type: sql.NVarChar(50), value: DeliveryNo },
      {
        name: 'Material',
        type: sql.NVarChar(50),
        value: Material.padStart(18, '0'),
      },
      { name: 'UserId', type: sql.NVarChar(50), value: UserId },
    ]);
    res.json(result);
  } catch (error) {
    console.error('Error in barcode reversal:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const getPalletLocation = async (req, res) => {
  try {
    const { PalletBarcode } = req.body;

    if (!PalletBarcode) {
      return res.status(400).json({ error: 'PalletBarcode is required' });
    }

    const result = await executeQuery(`EXEC [dbo].[HHT_FGPick_SerialNoLocation] @Barcode`, [
      { name: 'Barcode', type: sql.NVarChar, value: PalletBarcode },
    ]);

    res.json(result[0]);
  } catch (error) {
    console.error('Error fetching pallet location:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const checkMaterialPickOrder = async (req, res) => {
  const { UserName, MatCode, PickOrder } = req.body;
  try {
    const result = await executeQuery(
      `EXEC [dbo].[HHT_FGPick_MaterialPickCheckOrder] @UserName, @MatCode, @PickOrder`,
      [
        { name: 'UserName', type: sql.NVarChar(50), value: UserName },
        {
          name: 'MatCode',
          type: sql.NVarChar(50),
          value: MatCode.padStart(18, '0'),
        },
        { name: 'PickOrder', type: sql.NVarChar(50), value: PickOrder },
      ]
    );
    res.json(result);
  } catch (error) {
    console.error('Error fetching material pick order:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const updatePalletBarcode = async (req, res) => {
  const { DeliveryNo, Material, Barcode, PickOrderFlag, UserId, PendingPick, ReqQty, TotalPicked } = req.body;
  try {
    const palletLocationResult = await executeQuery(`EXEC [dbo].[HHT_FGPick_PalletLocation] @PalletBarcode`, [
      { name: 'PalletBarcode', type: sql.NVarChar, value: Barcode },
    ]);
    const palletLocationData = palletLocationResult[0];
    if (palletLocationData.Status == 'F') {
      return res.json({ Status: 'F', Message: palletLocationData.Message }).status(200);
    }
    if (palletLocationData.Qty > PendingPick) {
      const boxesToPick = Math.ceil(parseFloat(PendingPick) / parseFloat(palletLocationData.ZPE));
      return res
        .json({
          Status: 'F',
          Message: `Pallet Total Qty is ${parseFloat(palletLocationData.Qty)} which exceeds Pending Pick Qty ${parseFloat(PendingPick)}. Please pick ${boxesToPick} box(es).`,
        })
        .status(200);
    }

    const currentDate = format(new Date(), 'dd.MM.yyyy');
    const sapRequestBody = {
      ConnectionParams: SAP_SERVER,
      GOODSMVT_CODE: { GM_CODE: '04' },
      GOODSMVT_HEADER: {
        PSTNG_DATE: currentDate,
        DOC_DATE: currentDate,
        HEADER_TXT: 'Mat Dispatch SCAN',
      },
      GOODSMVT_ITEM: [
        {
          MATERIAL: Material.padStart(18, '0'),
          PLANT: '5100',
          STGE_LOC: palletLocationData.StorageLocation,
          BATCH: palletLocationData.Batch,
          MOVE_TYPE: '311',
          STCK_TYPE: ' ',
          MOVE_BATCH: palletLocationData.Batch,
          MOVE_STLOC: '5199',
          ITEM_TEXT: Barcode.length > 45 ? Barcode.substring(0, 45) : Barcode,
          SPEC_STOCK: '',
          ENTRY_QNT: palletLocationData.Qty,
          ENTRY_UOM: palletLocationData.Unit,
          ENTRY_UOM_ISO: palletLocationData.UnitISO,
          ORDERID: palletLocationData.OrderNo,
          MVT_IND: '',
        },
      ],
      TESTRUN: false,
    };

    let sapError = false;
    let errorMessage = '';
    let materialDocument = '';

    try {
      const response = await axios.post(`${SAP_CONNECTOR_MIDDLEWARE_URL}/api/goods-movement/create`, sapRequestBody, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 300_000,
      });

      const sapResponse = response.data;
      materialDocument = sapResponse.GoodsMovementHeadRet?.MAT_DOC;

      if (!materialDocument) {
        sapError = true;
        errorMessage = sapResponse.Return[0]?.MESSAGE || 'Failed to get material document number from SAP';

        // Log the error in the database
        await executeQuery(
          `EXEC [dbo].[Sp_SAP_MATERIALPICKING_ERROR_LOG_Insert] 
                        @PalletBarcode, 
                        @ORDER_NUMBER, 
                        @MATERIAL, 
                        @BATCH, 
                        @PRODUCTION_PLANT,
                        @STORAGE_LOCATION,
                        @MOVE_TYPE,
                        @STOCK_TYPE,
                        @MOVE_BATCH,
                        @MOVE_STORAGELOCATION,
                        @SPEC_STOCK,
                        @MOVEMENT_INDICATOR,
                        @UOM,
                        @UOM_ISO,
                        @Qty,
                        @Error_Message,
                        @CreatedBy`,
          [
            { name: 'PalletBarcode', type: sql.NVarChar(255), value: Barcode },
            {
              name: 'ORDER_NUMBER',
              type: sql.NVarChar(50),
              value: palletLocationData.OrderNo,
            },
            {
              name: 'MATERIAL',
              type: sql.NVarChar(50),
              value: Material.padStart(18, '0'),
            },
            {
              name: 'BATCH',
              type: sql.NVarChar(50),
              value: palletLocationData.Batch,
            },
            { name: 'PRODUCTION_PLANT', type: sql.NVarChar(50), value: '5100' },
            {
              name: 'STORAGE_LOCATION',
              type: sql.NVarChar(50),
              value: palletLocationData.StorageLocation,
            },
            { name: 'MOVE_TYPE', type: sql.NVarChar(50), value: '311' },
            { name: 'STOCK_TYPE', type: sql.NVarChar(50), value: ' ' },
            {
              name: 'MOVE_BATCH',
              type: sql.NVarChar(50),
              value: palletLocationData.Batch,
            },
            {
              name: 'MOVE_STORAGELOCATION',
              type: sql.NVarChar(50),
              value: '5199',
            },
            { name: 'SPEC_STOCK', type: sql.NVarChar(50), value: '' },
            { name: 'MOVEMENT_INDICATOR', type: sql.NVarChar(50), value: '' },
            {
              name: 'UOM',
              type: sql.NVarChar(50),
              value: palletLocationData.Unit,
            },
            {
              name: 'UOM_ISO',
              type: sql.NVarChar(50),
              value: palletLocationData.UnitISO,
            },
            {
              name: 'Qty',
              type: sql.Decimal(18, 3),
              value: palletLocationData.Qty,
            },
            {
              name: 'Error_Message',
              type: sql.NVarChar(500),
              value: errorMessage,
            },
            { name: 'CreatedBy', type: sql.NVarChar(50), value: UserId },
          ]
        );
      }
    } catch (error) {
      sapError = true;
      errorMessage =
        error.response?.data?.Message || error.response?.data?.ModelState
          ? JSON.stringify(error.response.data.ModelState)
          : error.message;

      await executeQuery(
        `EXEC [dbo].[Sp_SAP_MATERIALPICKING_ERROR_LOG_Insert] 
                    @PalletBarcode, 
                    @ORDER_NUMBER, 
                    @MATERIAL, 
                    @BATCH, 
                    @PRODUCTION_PLANT,
                    @STORAGE_LOCATION,
                    @MOVE_TYPE,
                    @STOCK_TYPE,
                    @MOVE_BATCH,
                    @MOVE_STORAGELOCATION,
                    @SPEC_STOCK,
                    @MOVEMENT_INDICATOR,
                    @UOM,
                    @UOM_ISO,
                    @Qty,
                    @Error_Message,
                    @CreatedBy`,
        [
          { name: 'PalletBarcode', type: sql.NVarChar(255), value: Barcode },
          {
            name: 'ORDER_NUMBER',
            type: sql.NVarChar(50),
            value: palletLocationData.OrderNo,
          },
          {
            name: 'MATERIAL',
            type: sql.NVarChar(50),
            value: Material.padStart(18, '0'),
          },
          {
            name: 'BATCH',
            type: sql.NVarChar(50),
            value: palletLocationData.Batch,
          },
          { name: 'PRODUCTION_PLANT', type: sql.NVarChar(50), value: '5100' },
          {
            name: 'STORAGE_LOCATION',
            type: sql.NVarChar(50),
            value: palletLocationData.StorageLocation,
          },
          { name: 'MOVE_TYPE', type: sql.NVarChar(50), value: '311' },
          { name: 'STOCK_TYPE', type: sql.NVarChar(50), value: ' ' },
          {
            name: 'MOVE_BATCH',
            type: sql.NVarChar(50),
            value: palletLocationData.Batch,
          },
          {
            name: 'MOVE_STORAGELOCATION',
            type: sql.NVarChar(50),
            value: '5199',
          },
          { name: 'SPEC_STOCK', type: sql.NVarChar(50), value: '' },
          { name: 'MOVEMENT_INDICATOR', type: sql.NVarChar(50), value: '' },
          {
            name: 'UOM',
            type: sql.NVarChar(50),
            value: palletLocationData.Unit,
          },
          {
            name: 'UOM_ISO',
            type: sql.NVarChar(50),
            value: palletLocationData.UnitISO,
          },
          {
            name: 'Qty',
            type: sql.Decimal(18, 3),
            value: palletLocationData.Qty,
          },
          {
            name: 'Error_Message',
            type: sql.NVarChar(500),
            value: `SAP API Error: ${errorMessage}`,
          },
          { name: 'CreatedBy', type: sql.NVarChar(50), value: UserId },
        ]
      );
    }

    // Always execute the stored procedure regardless of SAP success or failure
    const result = await executeQuery(
      `EXEC [dbo].[HHT_FGPick_BarcodeValidation_Pallet] @DeliveryNo, @Material, @Barcode, @PickOrderFlag, @UserId, @PendingPick, @ReqQty, @TotalPicked`,
      [
        { name: 'DeliveryNo', type: sql.NVarChar(50), value: DeliveryNo },
        {
          name: 'Material',
          type: sql.NVarChar(50),
          value: Material.padStart(18, '0'),
        },
        { name: 'Barcode', type: sql.NVarChar(50), value: Barcode },
        { name: 'PickOrderFlag', type: sql.NVarChar(50), value: PickOrderFlag },
        { name: 'UserId', type: sql.NVarChar(50), value: UserId },
        { name: 'PendingPick', type: sql.Decimal(18, 3), value: PendingPick },
        { name: 'ReqQty', type: sql.Decimal(18, 3), value: ReqQty },
        { name: 'TotalPicked', type: sql.Decimal(18, 3), value: TotalPicked },
      ]
    );

    if (sapError) {
      return res.json({
        ...result[0],
        SapMessage: `Process done but SAP pending⚠️ - Error: ${errorMessage}`,
        ErrorInSAP: true,
      });
    } else {
      return res.json({
        ...result[0],
        SapMessage: `SAP process completed successfully. Material Document: ${materialDocument}`,
        MaterialDocument: materialDocument,
      });
    }
  } catch (error) {
    console.error('Error in validatePalletBarcode:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

// Close order manually

export const closeDeliveryOrderManually = async (req, res) => {
  try {
    const { OrderNo, Material } = req.body;

    if (!OrderNo || !Material) {
      return res.status(400).json({ error: 'OrderNo and Material are required' });
    }

    // First, get the picked details from the database
    const pickedDetailsResult = await executeQuery(`EXEC [dbo].[HHT_FGPick_PickedDetails] @OrderNo, @Material`, [
      {
        name: 'OrderNo',
        type: sql.NVarChar(50),
        value: OrderNo.padStart(12, '0'),
      },
      {
        name: 'Material',
        type: sql.NVarChar(50),
        value: Material.padStart(18, '0'),
      },
    ]);

    // Check if we got valid picked details
    if (pickedDetailsResult.length === 0 || pickedDetailsResult[0].Status === 'F') {
      return res.json({
        Status: 'F',
        Message: pickedDetailsResult[0]?.Message || 'No picked details found',
      });
    }

    // Prepare the batch quantity data for SAP
    const batchQtyData = pickedDetailsResult.map(item => ({
      POSNR: item.POSNR,
      CHARG: item.BATCH,
      QUANTITY: parseFloat(item.PickQty),
      MEINS: item.MEINS,
    }));

    // Prepare SAP request body
    const sapRequestBody = {
      ConnectionParams: SAP_SERVER,
      IV_POSNR: pickedDetailsResult[0].POSNR,
      IV_VBELN: OrderNo.padStart(12, '0'),
      IT_BATCH_QTY: batchQtyData,
    };

    let sapError = false;
    let errorMessage = '';

    try {
      const response = await axios.post(`${SAP_CONNECTOR_MIDDLEWARE_URL}/api/delivery-order/close`, sapRequestBody, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000,
      });

      const sapResponse = response.data;

      // Check if SAP returned any errors
      if (sapResponse.Return && sapResponse.Return.length > 0) {
        const errorReturns = sapResponse.Return.filter(ret => ret.TYPE === 'E');
        if (errorReturns.length > 0) {
          sapError = true;
          errorMessage = errorReturns.map(err => err.MESSAGE).join('; ');
        }
      }
    } catch (axiosError) {
      sapError = true;
      errorMessage =
        axiosError.response?.data?.Return?.[0]?.MESSAGE || axiosError.response?.data?.Message || axiosError.message;
    }

    // If SAP call failed, return the error
    if (sapError) {
      return res.json({
        Status: 'F',
        Message: `SAP Error: ${errorMessage}`,
      });
    }

    // If SAP call was successful, proceed with the manual closing stored procedure
    const result = await executeQuery(`EXEC [dbo].[HHT_FGPick_ManualClosing] @OrderNo, @Material`, [
      {
        name: 'OrderNo',
        type: sql.NVarChar(50),
        value: OrderNo.padStart(12, '0'),
      },
      {
        name: 'Material',
        type: sql.NVarChar(50),
        value: Material.padStart(18, '0'),
      },
    ]);

    res.json({
      ...result[0],
      SapMessage: 'SAP delivery order closed successfully',
    });
  } catch (error) {
    console.error('Error in closeDeliveryOrderManually:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};
