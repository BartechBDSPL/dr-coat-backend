import { executeQuery, sql } from '../../config/db.js';
import axios from 'axios';
import { SAP_CONNECTOR_MIDDLEWARE_URL, SAP_SERVER } from '../../utils/constants.js';
import path from 'path';
import net from 'net';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';
import moment from 'moment';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const validateOrderNumber = orderNumber => {
  if (!orderNumber || (orderNumber.length !== 9 && orderNumber.length !== 12)) {
    return {
      Status: 'F',
      Message: 'Invalid order number length.',
      status: 200,
    };
  }
  const expectedLength = orderNumber.startsWith('000') ? 12 : 9;
  if (orderNumber.length !== expectedLength) {
    return {
      Status: 'F',
      Message: `Order number must be ${expectedLength} digits`,
      status: 200,
    };
  }
  return {
    value: orderNumber.startsWith('000') ? orderNumber : `000${orderNumber}`,
  };
};

const validateUnits = unitsOfMeasure => {
  const requiredUnits = ['PAL', 'ST', 'ZPE'];
  const requiredUnitCounts = unitsOfMeasure
    .filter(unit => requiredUnits.includes(unit.ALT_UNIT))
    .reduce(
      (acc, { ALT_UNIT }) => ({
        ...acc,
        [ALT_UNIT]: (acc[ALT_UNIT] || 0) + 1,
      }),
      {}
    );

  const missingUnits = requiredUnits.filter(unit => !requiredUnitCounts[unit]);
  const duplicateUnits = Object.entries(requiredUnitCounts)
    .filter(([_, count]) => count > 1)
    .map(([unit]) => unit);

  if (missingUnits.length > 0 || duplicateUnits.length > 0) {
    let errorMessage = [];
    if (missingUnits.length > 0) {
      errorMessage.push(`Missing required units: ${missingUnits.join(', ')}`);
    }
    if (duplicateUnits.length > 0) {
      errorMessage.push(`Duplicate units found: ${duplicateUnits.join(', ')}`);
    }
    return { error: errorMessage.join('. '), status: 400 };
  }

  return { value: true };
};

export const getResOrderNo = async (req, res) => {
  try {
    const { ORDER_NUMBER, USER } = req.body;
    const orderValidation = validateOrderNumber(ORDER_NUMBER);
    if (orderValidation.error) {
      return res.status(orderValidation.status).json({ error: orderValidation.error });
    }
    const NUMBER = ORDER_NUMBER.startsWith('000') ? ORDER_NUMBER : `000${ORDER_NUMBER}`;
    const materialResultExist = await executeQuery('EXEC Sp_SubMaterialMaster_GetAllby_OrderNo @OrderNumber', [
      { name: 'OrderNumber', type: sql.NVarChar, value: NUMBER },
    ]);
    const orderExist = await executeQuery('EXEC Sp_ResortingOrder_Check @OrderNumber', [
      { name: 'OrderNumber', type: sql.NVarChar, value: NUMBER },
    ]);

    const resortingOrderRequestCheck = await executeQuery('EXEC Sp_ResortingOrderRequest_Check @RESORTING_ORDERNO', [
      { name: 'RESORTING_ORDERNO', type: sql.NVarChar, value: NUMBER },
    ]);

    if (
      resortingOrderRequestCheck[0].Status === 'F' &&
      resortingOrderRequestCheck[0].Message.includes('Resorting Order already got picked')
    ) {
      return res.status(200).json(resortingOrderRequestCheck[0]);
    }

    // Added: Check ResortingOrderRequest if order exists
    if (orderExist[0].Status === 'T' && resortingOrderRequestCheck[0].Status === 'T') {
      return res.status(200).json({
        resortingOrder: orderExist[0],
        resortingOrderRequest: resortingOrderRequestCheck[0],
        material: materialResultExist,
      });
    }

    const { data: orderData } = await axios.post(`${SAP_CONNECTOR_MIDDLEWARE_URL}/api/order/details`, {
      ConnectionParams: SAP_SERVER,
      NUMBER,
    });
    if (orderData.Return.MESSAGE?.includes('does not exist')) {
      return res.status(200).json({ Status: 'F', Message: orderData.Return.MESSAGE });
    }

    const [posData] = orderData.PositionTable;
    const [compontData] = orderData.ComponentTable;
    console.log(compontData);
    const [headerData] = orderData.HeaderTable;
    const operationData = orderData.OperationTable.find(op => op.OPERATION_NUMBER === '0020');

    const { data: materialData } = await axios.post(`${SAP_CONNECTOR_MIDDLEWARE_URL}/api/material/getall`, {
      ConnectionParams: SAP_SERVER,
      Material: posData.MATERIAL,
      Plant: posData.PROD_PLANT,
    });

    const unitsValidation = validateUnits(materialData.UnitsOfMeasure);
    if (unitsValidation.error) {
      return res.status(unitsValidation.status).json({ error: unitsValidation.error });
    }
    if (posData.ORDER_TYPE !== 'PP02') {
      return res.status(200).json({
        Status: 'F',
        Message: "This is not resorting order it's production order",
      });
    }

    // Insert material data
    for (const uom of materialData.UnitsOfMeasure) {
      const materialResult = await executeQuery(
        'EXEC Sp_SubMaterialMaster_Insert @Material, @LanguISO, @MatlDesc, @AltUnit, @AltUnitISO, @Numerator, @Denominator, @OrderNumber, @CreatedBy',
        [
          {
            name: 'Material',
            type: sql.NVarChar,
            value: materialData.ClientData.MATERIAL,
          },
          {
            name: 'LanguISO',
            type: sql.NVarChar,
            value: materialData.MaterialDescription[1].LANGU_ISO,
          },
          {
            name: 'MatlDesc',
            type: sql.NVarChar,
            value: materialData.MaterialDescription[1].MATL_DESC,
          },
          { name: 'AltUnit', type: sql.NVarChar, value: uom.ALT_UNIT },
          { name: 'AltUnitISO', type: sql.NVarChar, value: uom.ALT_UNIT_ISO },
          { name: 'Numerator', type: sql.Int, value: parseInt(uom.NUMERATOR) },
          {
            name: 'Denominator',
            type: sql.Int,
            value: parseInt(uom.DENOMINATR),
          },
          {
            name: 'OrderNumber',
            type: sql.NVarChar,
            value: posData.ORDER_NUMBER,
          },
          { name: 'CreatedBy', type: sql.NVarChar, value: USER },
        ]
      );

      const materialMasterResult = await executeQuery(
        'EXEC Sp_MaterialMaster_Insert @Material, @LanguISO, @MatlDesc, @AltUnit, @AltUnitISO, @Numerator, @Denominator, @GrossWt, @NetWeight, @UnitOfWt, @UnitOfWtISO, @Base_UOM, @Base_UOM_ISO, @Matl_Type, @Size_Dim, @Length, @Width, @Height, @Volume, @VolumeUnit, @VolumeUnitISO, @CreatedBy',
        [
          {
            name: 'Material',
            type: sql.NVarChar,
            value: materialData.ClientData.MATERIAL,
          },
          {
            name: 'LanguISO',
            type: sql.NVarChar,
            value: materialData.MaterialDescription[1].LANGU_ISO,
          },
          {
            name: 'MatlDesc',
            type: sql.NVarChar,
            value: materialData.MaterialDescription[1].MATL_DESC,
          },
          { name: 'AltUnit', type: sql.NVarChar, value: uom.ALT_UNIT },
          { name: 'AltUnitISO', type: sql.NVarChar, value: uom.ALT_UNIT_ISO },
          { name: 'Numerator', type: sql.Int, value: parseInt(uom.NUMERATOR) },
          {
            name: 'Denominator',
            type: sql.Int,
            value: parseInt(uom.DENOMINATR),
          },
          {
            name: 'GrossWt',
            type: sql.Float,
            value: parseFloat(uom.GROSS_WT || 0),
          },
          {
            name: 'NetWeight',
            type: sql.Float,
            value: parseFloat(uom.NET_WEIGHT || 0),
          },
          {
            name: 'UnitOfWt',
            type: sql.NVarChar,
            value: materialData.ClientData.UNIT_OF_WT || '',
          },
          {
            name: 'UnitOfWtISO',
            type: sql.NVarChar,
            value: materialData.ClientData.UNIT_OF_WT_ISO || '',
          },
          {
            name: 'Base_UOM',
            type: sql.NVarChar,
            value: materialData.ClientData.BASE_UOM || '',
          },
          {
            name: 'Base_UOM_ISO',
            type: sql.NVarChar,
            value: materialData.ClientData.BASE_UOM_ISO || '',
          },
          {
            name: 'Matl_Type',
            type: sql.NVarChar,
            value: materialData.ClientData.MATL_TYPE || '',
          },
          {
            name: 'Size_Dim',
            type: sql.NVarChar,
            value: materialData.ClientData.SIZE_DIM || '',
          },
          {
            name: 'Length',
            type: sql.Float,
            value: parseFloat(uom.LENGTH || 0),
          },
          { name: 'Width', type: sql.Float, value: parseFloat(uom.WIDTH || 0) },
          {
            name: 'Height',
            type: sql.Float,
            value: parseFloat(uom.HEIGHT || 0),
          },
          {
            name: 'Volume',
            type: sql.Float,
            value: parseFloat(uom.VOLUME || 0),
          },
          {
            name: 'VolumeUnit',
            type: sql.NVarChar,
            value: uom.VOLUMEUNIT || '',
          },
          {
            name: 'VolumeUnitISO',
            type: sql.NVarChar,
            value: uom.VOLUMEUNIT_ISO || '',
          },
          { name: 'CreatedBy', type: sql.NVarChar, value: USER },
        ]
      );

      if (materialResult[0].Message === 'Error occurred while inserting data into Sub_Material_Master.') {
        return res.status(500).json(materialResult);
      }
    }
    // Insert production order
    const insertResult = await executeQuery(
      `EXEC Sp_ResortingOrder_Insert 
            @OrderNumber, @ReservationNumber, @ReservationItem, @Material, @MaterialText,
            @ProdPlant, @StorageLocation, @SupplyArea, @Batch, @ReqDate, @ReqQuan,
            @BaseUOM, @BaseUOMISO, @EntryQuantity, @MovementType, @OrderType,
            @Scrap, @ProductionStartDate, @ProductionFinishDate, @EnteredBy, @BatchToPick,@WorkCenter,@TargetQuantity`,
      [
        {
          name: 'OrderNumber',
          type: sql.NVarChar,
          value: compontData.ORDER_NUMBER,
        },
        {
          name: 'ReservationNumber',
          type: sql.NVarChar,
          value: compontData.RESERVATION_NUMBER,
        },
        {
          name: 'ReservationItem',
          type: sql.NVarChar,
          value: compontData.RESERVATION_ITEM,
        },
        { name: 'Material', type: sql.NVarChar, value: compontData.MATERIAL },
        {
          name: 'MaterialText',
          type: sql.NVarChar,
          value: compontData.MATERIAL_DESCRIPTION,
        },
        {
          name: 'ProdPlant',
          type: sql.NVarChar,
          value: compontData.PROD_PLANT,
        },
        {
          name: 'StorageLocation',
          type: sql.NVarChar,
          value: compontData.STORAGE_LOCATION,
        },
        {
          name: 'SupplyArea',
          type: sql.NVarChar,
          value: compontData.SUPPLY_AREA,
        },
        { name: 'Batch', type: sql.NVarChar, value: posData.BATCH },
        { name: 'ReqDate', type: sql.NVarChar, value: compontData.REQ_DATE },
        {
          name: 'ReqQuan',
          type: sql.NVarChar,
          value: compontData.REQ_QUAN.toString() || '',
        },
        { name: 'BaseUOM', type: sql.NVarChar, value: compontData.BASE_UOM },
        {
          name: 'BaseUOMISO',
          type: sql.NVarChar,
          value: compontData.BASE_UOM_ISO,
        },
        {
          name: 'EntryQuantity',
          type: sql.NVarChar,
          value: compontData.ENTRY_QUANTITY,
        },
        {
          name: 'MovementType',
          type: sql.NVarChar,
          value: compontData.MOVEMENT_TYPE,
        },
        { name: 'OrderType', type: sql.NVarChar, value: posData.ORDER_TYPE },
        {
          name: 'Scrap',
          type: sql.NVarChar,
          value: headerData.SCRAP?.toString() || '',
        },
        {
          name: 'ProductionStartDate',
          type: sql.NVarChar,
          value: headerData.PRODUCTION_START_DATE,
        },
        {
          name: 'ProductionFinishDate',
          type: sql.NVarChar,
          value: posData.PRODUCTION_FINISH_DATE,
        },
        { name: 'EnteredBy', type: sql.NVarChar, value: headerData.ENTERED_BY },
        { name: 'BatchToPick', type: sql.NVarChar, value: compontData.BATCH },
        {
          name: 'WorkCenter',
          type: sql.NVarChar,
          value: operationData.WORK_CENTER || '',
        },
        {
          name: 'TargetQuantity',
          type: sql.NVarChar,
          value: headerData.TARGET_QUANTITY || '',
        },
      ]
    );

    // Added: Insert into ResortingOrderRequest
    const resortingOrderRequestResult = await executeQuery(
      `EXEC Sp_ResortingOrderRequest_Insert 
            @RESORTING_ORDERNO, @MATERIAL, @MATERIAL_TEXT, @PROD_PLANT, @BATCH, @REQ_DATE, @REQ_QUANTITY,@BatchToPick, @InsertedBy`,
      [
        {
          name: 'RESORTING_ORDERNO',
          type: sql.NVarChar,
          value: compontData.ORDER_NUMBER,
        },
        { name: 'MATERIAL', type: sql.VarChar, value: compontData.MATERIAL },
        {
          name: 'MATERIAL_TEXT',
          type: sql.VarChar,
          value: compontData.MATERIAL_DESCRIPTION,
        },
        {
          name: 'PROD_PLANT',
          type: sql.VarChar,
          value: compontData.PROD_PLANT,
        },
        { name: 'BATCH', type: sql.VarChar, value: posData.BATCH },
        {
          name: 'REQ_DATE',
          type: sql.DateTime,
          value: new Date(compontData.REQ_DATE),
        },
        {
          name: 'REQ_QUANTITY',
          type: sql.Decimal,
          value: parseFloat(compontData.REQ_QUAN),
        },
        {
          name: 'BatchToPick',
          type: sql.Decimal,
          value: parseFloat(compontData.BATCH),
        },
        { name: 'InsertedBy', type: sql.NVarChar, value: USER },
      ]
    );

    if (insertResult[0].Status === 'F') {
      return res.status(500).json(insertResult);
    }

    const finalResult = await executeQuery('EXEC Sp_ResortingOrder_Check @OrderNumber', [
      { name: 'OrderNumber', type: sql.NVarChar, value: NUMBER },
    ]);

    // Added: Final check of ResortingOrderRequest
    const finalResortingOrderRequestCheck = await executeQuery(
      'EXEC Sp_ResortingOrderRequest_Check @RESORTING_ORDERNO',
      [{ name: 'RESORTING_ORDERNO', type: sql.NVarChar, value: NUMBER }]
    );

    const materialResult = await executeQuery('EXEC Sp_SubMaterialMaster_GetAllby_OrderNo @OrderNumber', [
      { name: 'OrderNumber', type: sql.NVarChar, value: NUMBER },
    ]);
    if (finalResortingOrderRequestCheck[0].Status === 'F') {
      return res.status(200).json(finalResortingOrderRequestCheck[0]);
    }
    if (finalResult[0].Status === 'T' && finalResortingOrderRequestCheck[0].Status === 'T') {
      return res.status(200).json({
        resortingOrder: orderExist[0],
        resortingOrderRequest: finalResortingOrderRequestCheck[0],
        material: materialResult,
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

export const updateResortingLabelPrinting = async (req, res) => {
  const {
    ORDER_NUMBER,
    PRODUCTION_PLANT,
    MATERIAL,
    MATERIAL_TEXT,
    BATCH,
    STORAGE_LOCATION,
    SCRAP,
    TARGET_QUANTITY,
    DELIVERED_QUANTITY,
    UNIT_ISO,
    UNIT,
    WORK_CENTER,
    PRODUCTION_START_DATE,
    PRODUCTION_FINISH_DATE,
    ENTERED_BY,
    ENTER_DATE,
    PrintQty,
    SerialNo,
    PrintBy,
    Printed_Labels,
    Remaining_Labels,
    PRINTER_IP,
    PrinterDpi,
    SHIFT,
    SorterNo,
    OrderType,
    BATCH_TO_PICK,
    RESERVATION_NUMBER,
    RESERVATION_ITEM,
  } = req.body;

  const [printerIP, printerPort] = PRINTER_IP.split(':');
  const portNumber = parseInt(printerPort) || 9100;

  try {
    const printerInRange = await isPrinterReachable(printerIP, portNumber);
    if (!printerInRange) {
      return res.status(400).json({ error: 'Printer out of range' });
    }

    // Execute initial operations concurrently
    const serialNumbers = SerialNo.split('$');
    const printQuantities = PrintQty.split('$');
    const totalPrintedQty = printQuantities.reduce((sum, qty) => sum + (parseInt(qty) || 0), 0);

    // Initialize SAP operation tracking
    let sapError = false;
    let errorMessage = '';
    let materialDocument = '';
    const currentDate = moment().format('DD.MM.YYYY');
    const paddedMaterial = MATERIAL.padStart(18, '0');
    const paddedOrderNo = ORDER_NUMBER.padStart(12, '0');
    let upsertSrNoResult, upsertBoxNoResult, upsertPalletNoResult;
    if (OrderType === 'BOX') {
      [upsertSrNoResult, upsertBoxNoResult] = await Promise.all([
        executeQuery('EXEC Sp_Upsert_FG_Label_SrNo @Order_Number, @Batch, @Material, @GeneratedSrNo', [
          {
            name: 'Order_Number',
            type: sql.NVarChar(255),
            value: ORDER_NUMBER,
          },
          { name: 'Batch', type: sql.NVarChar(255), value: BATCH },
          { name: 'Material', type: sql.NVarChar(255), value: MATERIAL },
          {
            name: 'GeneratedSrNo',
            type: sql.Int,
            value: parseInt(Printed_Labels),
          },
        ]),
        executeQuery('EXEC Sp_Upsert_FG_Label_BoxNo @Order_Number, @Material, @GeneratedBoxNo', [
          {
            name: 'Order_Number',
            type: sql.NVarChar(255),
            value: ORDER_NUMBER,
          },
          { name: 'Material', type: sql.NVarChar(255), value: MATERIAL },
          {
            name: 'GeneratedBoxNo',
            type: sql.Int,
            value: parseInt(Printed_Labels),
          },
        ]),
      ]);
    } else if (OrderType === 'PALLET') {
      upsertPalletNoResult = await executeQuery(
        'EXEC Sp_Upsert_FG_Label_PalletNo @Order_Number, @Material, @GeneratedPalletNo',
        [
          {
            name: 'Order_Number',
            type: sql.NVarChar(255),
            value: ORDER_NUMBER,
          },
          { name: 'Material', type: sql.NVarChar(255), value: MATERIAL },
          {
            name: 'GeneratedPalletNo',
            type: sql.Int,
            value: parseInt(Printed_Labels),
          },
        ]
      );
    }
    const updateLabelCount = await executeQuery(
      'EXEC Sp_Update_LabelCount_Resorting @OrderNumber, @Material, @Batch, @Printed_Labels, @Remaining_Labels,@OrderType, @PrintedQty',
      [
        { name: 'OrderNumber', type: sql.NVarChar, value: ORDER_NUMBER },
        { name: 'Material', type: sql.NVarChar, value: MATERIAL },
        { name: 'Batch', type: sql.NVarChar, value: BATCH },
        {
          name: 'Printed_Labels',
          type: sql.Int,
          value: parseInt(Printed_Labels),
        },
        {
          name: 'Remaining_Labels',
          type: sql.Int,
          value: parseInt(Remaining_Labels),
        },
        { name: 'OrderType', type: sql.NVarChar, value: OrderType },
        { name: 'PrintedQty', type: sql.Int, value: totalPrintedQty },
      ]
    );

    // Check results of concurrent operations
    if (
      (OrderType === 'BOX' && (upsertSrNoResult[0].Status === 'F' || upsertBoxNoResult[0].Status === 'F')) ||
      (OrderType === 'PALLET' && upsertPalletNoResult[0].Status === 'F') ||
      updateLabelCount[0].Status === 'F'
    ) {
      return res.status(400).json({
        error: 'Failed to update initial records',
        details: {
          srNo: upsertSrNoResult ? upsertSrNoResult[0] : undefined,
          boxNo: upsertBoxNoResult ? upsertBoxNoResult[0] : undefined,
          palletNo: upsertPalletNoResult ? upsertPalletNoResult[0] : undefined,
          labelCount: updateLabelCount[0],
        },
      });
    }

    // SAP Good Issue Operation - Execute after local operations but continue even if it fails
    const goodIssueBody = {
      ConnectionParams: SAP_SERVER,
      GOODSMVT_CODE: { GM_CODE: '03' },
      GOODSMVT_HEADER: {
        PSTNG_DATE: currentDate,
        DOC_DATE: currentDate,
        HEADER_TXT: 'Resorting GI',
      },
      GOODSMVT_ITEM: [
        {
          MATERIAL: paddedMaterial,
          PLANT: PRODUCTION_PLANT || '5100',
          STGE_LOC: '5190',
          BATCH: BATCH_TO_PICK,
          MOVE_TYPE: '261',
          STCK_TYPE: 'S',
          ITEM_TEXT: `Good issue`,
          SPEC_STOCK: '',
          ENTRY_QNT: totalPrintedQty,
          ENTRY_UOM: UNIT,
          ENTRY_UOM_ISO: UNIT_ISO,
          ORDERID: paddedOrderNo,
          MVT_IND: '',
          // RESERV_NO: RESERVATION_NUMBER || "",
          // RES_ITEM: RESERVATION_ITEM || "",
        },
      ],
      TESTRUN: false,
    };

    try {
      // console.log( goodIssueBody);
      // console.log('Attempting SAP Good Issue for resorting order:', ORDER_NUMBER);
      const goodIssueResponse = await axios.post(
        `${SAP_CONNECTOR_MIDDLEWARE_URL}/api/goods-movement/create`,
        goodIssueBody,
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 300000,
        }
      );

      const sapResponse = goodIssueResponse.data;
      materialDocument = sapResponse.GoodsMovementHeadRet?.MAT_DOC;

      if (!materialDocument) {
        sapError = true;
        errorMessage = sapResponse.Return?.[0]?.MESSAGE || 'Failed to get material document number from SAP';
        console.error('SAP Good Issue failed:', errorMessage);

        // Log the good issue error
        await executeQuery(
          `EXEC [dbo].[Sp_SAP_RESORTING_ERROR_LOG_Insert] 
                        @PalletBarcode, @ORDER_NUMBER, @MATERIAL, @BATCH, @PRODUCTION_PLANT,
                        @STORAGE_LOCATION, @MOVE_TYPE, @STOCK_TYPE, @MOVE_BATCH, @MOVE_STORAGELOCATION,
                        @SPEC_STOCK, @MOVEMENT_INDICATOR, @UOM, @UOM_ISO, @Qty, @Error_Message, @GM_CODE, @CreatedBy`,
          [
            {
              name: 'PalletBarcode',
              type: sql.NVarChar(255),
              value: `Resorting-${ORDER_NUMBER}`,
            },
            {
              name: 'ORDER_NUMBER',
              type: sql.NVarChar(50),
              value: paddedOrderNo,
            },
            { name: 'MATERIAL', type: sql.NVarChar(50), value: paddedMaterial },
            { name: 'BATCH', type: sql.NVarChar(50), value: BATCH_TO_PICK },
            {
              name: 'PRODUCTION_PLANT',
              type: sql.NVarChar(50),
              value: PRODUCTION_PLANT || '5100',
            },
            { name: 'STORAGE_LOCATION', type: sql.NVarChar(50), value: '5190' },
            { name: 'MOVE_TYPE', type: sql.NVarChar(50), value: '261' },
            { name: 'STOCK_TYPE', type: sql.NVarChar(50), value: 'S' },
            { name: 'MOVE_BATCH', type: sql.NVarChar(50), value: '' },
            { name: 'MOVE_STORAGELOCATION', type: sql.NVarChar(50), value: '' },
            { name: 'SPEC_STOCK', type: sql.NVarChar(50), value: '' },
            { name: 'MOVEMENT_INDICATOR', type: sql.NVarChar(50), value: '' },
            { name: 'UOM', type: sql.NVarChar(50), value: UNIT },
            { name: 'UOM_ISO', type: sql.NVarChar(50), value: UNIT_ISO },
            { name: 'Qty', type: sql.Decimal(18, 3), value: totalPrintedQty },
            {
              name: 'Error_Message',
              type: sql.NVarChar(500),
              value: errorMessage,
            },
            { name: 'GM_CODE', type: sql.NVarChar(50), value: '03' },
            { name: 'CreatedBy', type: sql.NVarChar(50), value: PrintBy },
          ]
        );
      } else {
        // console.log('SAP Good Issue successful. Material Document:', materialDocument);
      }
    } catch (axiosError) {
      sapError = true;
      errorMessage =
        axiosError.response?.data?.Return?.[0]?.MESSAGE ||
        axiosError.response?.data?.Message ||
        (axiosError.response?.data?.ModelState
          ? JSON.stringify(axiosError.response.data.ModelState)
          : axiosError.message);

      // Log the good issue API error
      await executeQuery(
        `EXEC [dbo].[Sp_SAP_RESORTING_ERROR_LOG_Insert] 
                    @PalletBarcode, @ORDER_NUMBER, @MATERIAL, @BATCH, @PRODUCTION_PLANT,
                    @STORAGE_LOCATION, @MOVE_TYPE, @STOCK_TYPE, @MOVE_BATCH, @MOVE_STORAGELOCATION,
                    @SPEC_STOCK, @MOVEMENT_INDICATOR, @UOM, @UOM_ISO, @Qty, @Error_Message, @GM_CODE, @CreatedBy`,
        [
          {
            name: 'PalletBarcode',
            type: sql.NVarChar(255),
            value: `Resorting-${ORDER_NUMBER}`,
          },
          {
            name: 'ORDER_NUMBER',
            type: sql.NVarChar(50),
            value: paddedOrderNo,
          },
          { name: 'MATERIAL', type: sql.NVarChar(50), value: paddedMaterial },
          { name: 'BATCH', type: sql.NVarChar(50), value: BATCH_TO_PICK },
          {
            name: 'PRODUCTION_PLANT',
            type: sql.NVarChar(50),
            value: PRODUCTION_PLANT || '5100',
          },
          { name: 'STORAGE_LOCATION', type: sql.NVarChar(50), value: '5190' },
          { name: 'MOVE_TYPE', type: sql.NVarChar(50), value: '261' },
          { name: 'STOCK_TYPE', type: sql.NVarChar(50), value: 'S' },
          { name: 'MOVE_BATCH', type: sql.NVarChar(50), value: '' },
          { name: 'MOVE_STORAGELOCATION', type: sql.NVarChar(50), value: '' },
          { name: 'SPEC_STOCK', type: sql.NVarChar(50), value: '' },
          { name: 'MOVEMENT_INDICATOR', type: sql.NVarChar(50), value: '' },
          { name: 'UOM', type: sql.NVarChar(50), value: UNIT },
          { name: 'UOM_ISO', type: sql.NVarChar(50), value: UNIT_ISO },
          { name: 'Qty', type: sql.Decimal(18, 3), value: totalPrintedQty },
          {
            name: 'Error_Message',
            type: sql.NVarChar(500),
            value: `SAP API Error (Good Issue): ${errorMessage}`,
          },
          { name: 'GM_CODE', type: sql.NVarChar(50), value: '03' },
          { name: 'CreatedBy', type: sql.NVarChar(50), value: PrintBy },
        ]
      );
    }

    const tempFilePath = path.join(__dirname, `combined_temp_${Date.now()}.prn`);
    let combinedPrnContent = '';

    try {
      const batchSize = 100;
      const totalLabels = serialNumbers.length;

      // Process all batches sequentially
      for (let batchStart = 0; batchStart < totalLabels; batchStart += batchSize) {
        const batchEnd = Math.min(batchStart + batchSize, totalLabels);
        const currentBatch = serialNumbers.slice(batchStart, batchEnd);
        const currentQtyBatch = printQuantities.slice(batchStart, batchEnd);

        // Prepare batch parameters for bulk insertion
        const batchParams = [];

        // Create params for each item in the batch
        for (let i = 0; i < currentBatch.length; i++) {
          const serialNo = currentBatch[i];
          const printQty = currentQtyBatch[i];
          batchParams.push([
            { name: 'ORDER_NUMBER', type: sql.NVarChar, value: ORDER_NUMBER },
            { name: 'MATERIAL', type: sql.NVarChar, value: MATERIAL },
            {
              name: 'PRODUCTION_PLANT',
              type: sql.NVarChar,
              value: PRODUCTION_PLANT,
            },
            { name: 'MATERIAL_TEXT', type: sql.NVarChar, value: MATERIAL_TEXT },
            { name: 'BATCH', type: sql.NVarChar, value: BATCH },
            { name: 'STORAGE_LOCATION', type: sql.NVarChar, value: '5190' },
            { name: 'SCRAP', type: sql.NVarChar, value: SCRAP },
            {
              name: 'TARGET_QUANTITY',
              type: sql.NVarChar,
              value: String(TARGET_QUANTITY),
            },
            {
              name: 'DELIVERED_QUANTITY',
              type: sql.NVarChar,
              value: DELIVERED_QUANTITY,
            },
            { name: 'UNIT_ISO', type: sql.NVarChar, value: UNIT_ISO },
            { name: 'UNIT', type: sql.NVarChar, value: UNIT },
            {
              name: 'PRODUCTION_START_DATE',
              type: sql.NVarChar,
              value: PRODUCTION_START_DATE,
            },
            {
              name: 'PRODUCTION_FINISH_DATE',
              type: sql.NVarChar,
              value: PRODUCTION_FINISH_DATE,
            },
            { name: 'ENTERED_BY', type: sql.NVarChar, value: ENTERED_BY },
            { name: 'ENTER_DATE', type: sql.NVarChar, value: ENTER_DATE },
            { name: 'PrintQty', type: sql.Int, value: parseInt(printQty) },
            { name: 'SerialNo', type: sql.NVarChar, value: serialNo },
            { name: 'PrintBy', type: sql.NVarChar, value: PrintBy },
            {
              name: 'Printed_Labels',
              type: sql.Int,
              value: parseInt(Printed_Labels),
            },
            { name: 'ShiftName', type: sql.NVarChar, value: SHIFT },
            { name: 'SorterNo', type: sql.NVarChar, value: SorterNo },
            { name: 'LINE', type: sql.NVarChar, value: WORK_CENTER.slice(-2) },
            { name: 'OrderType', type: sql.NVarChar, value: OrderType },
          ]);
        }
        // Execute database operations in parallel within the batch
        await Promise.all(
          batchParams.map(params =>
            executeQuery(
              'EXEC Sp_FG_InsertPrinting_Resorting @ORDER_NUMBER, @MATERIAL, @PRODUCTION_PLANT, @MATERIAL_TEXT, @BATCH, @STORAGE_LOCATION, ' +
                '@SCRAP, @TARGET_QUANTITY, @DELIVERED_QUANTITY, @UNIT_ISO, @UNIT, @PRODUCTION_START_DATE, ' +
                '@PRODUCTION_FINISH_DATE, @ENTERED_BY, @ENTER_DATE, @PrintQty, @SerialNo, @PrintBy, @Printed_Labels,@ShiftName,@SorterNo,@LINE, @OrderType',
              params
            )
          )
        );

        for (let i = batchStart; i < batchEnd; i++) {
          const serialNo = serialNumbers[i];
          const boxNumber = serialNo.split('|')[3];
          const printData = {
            VArticle: MATERIAL_TEXT,
            VItemCode: MATERIAL.replace(/^0+/, ''),
            VPacking: 'SAFE-PACK',
            VBatchNo: BATCH,
            VShift: SHIFT,
            VSorter: SorterNo,
            VMfgDate: moment().format('DD-MM-YYYY'),
            VLine: WORK_CENTER.slice(-2),
            VQty: parseInt(printQuantities[i]),
            VBoxNo: boxNumber,
            VPrintBy: PrintBy,
            VBarcode: serialNo,
          };
          const prnContent = preparePrnFile(printData, PrinterDpi);
          if (prnContent) {
            combinedPrnContent += prnContent;
          }
        }
      }

      // Write all combined content to a single file
      fs.writeFileSync(tempFilePath, combinedPrnContent);

      if (combinedPrnContent) {
        try {
          await batchPrintToTscPrinter({ tempFilePath }, printerIP, portNumber);
          return res.status(200).json({
            Status: 'T',
            Message: 'Label printing completed successfully',
            totalLabels: serialNumbers.length,
          });
        } catch (printError) {
          console.error('Batch printing error:', printError);
          // Clean up the temporary file if it exists
          if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
          }
          throw printError;
        }
      }
      // Clean up the temporary file now that printing is complete
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }

      // Return response with SAP status information
      if (sapError) {
        return res.status(200).json({
          Status: 'T',
          Message: 'Label printing completed successfully',
          SapMessage: `Process done but SAP pending⚠️ - Error: ${errorMessage}`,
          ErrorInSAP: true,
          totalLabels: serialNumbers.length,
          totalPrintedQty: totalPrintedQty,
        });
      } else {
        return res.status(200).json({
          Status: 'T',
          Message: 'Label printing completed successfully',
          SapMessage: materialDocument
            ? `SAP process completed successfully. Material Document: ${materialDocument}`
            : 'SAP process completed successfully',
          MaterialDocument: materialDocument,
          totalLabels: serialNumbers.length,
          totalPrintedQty: totalPrintedQty,
        });
      }
    } catch (error) {
      // Clean up the temporary file if it exists
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
      console.error('Error in print process:', error);

      // Return error response with SAP status if applicable
      let responseMessage = 'Printing process failed';
      if (sapError) {
        responseMessage += ` (SAP also failed: ${errorMessage})`;
      }

      return res.status(500).json({
        Status: 'F',
        Message: responseMessage,
        error: error.message,
        ErrorInSAP: sapError,
        SapMessage: sapError ? errorMessage : null,
      });
    }
  } catch (error) {
    console.error('Error in print process:', error);

    // Return error response with SAP status if applicable
    let responseMessage = 'Printing process failed';
    if (typeof sapError !== 'undefined' && sapError) {
      responseMessage += ` (SAP also failed: ${errorMessage})`;
    }

    return res.status(500).json({
      Status: 'F',
      Message: responseMessage,
      error: error.message,
      ErrorInSAP: typeof sapError !== 'undefined' ? sapError : false,
      SapMessage: typeof sapError !== 'undefined' && sapError ? errorMessage : null,
    });
  }
};

export const getResortingOrderForPrinting = async (req, res) => {
  const { ORDER_NUMBER, USER } = req.body;
  // const orderValidation = validateOrderNumber(ORDER_NUMBER);
  // if (orderValidation.error) {
  //     return res.status(orderValidation.status).json({ error: orderValidation.error });
  // }
  const NUMBER = ORDER_NUMBER;
  const materialResultExist = await executeQuery('EXEC Sp_SubMaterialMaster_GetAllby_OrderNo @OrderNumber', [
    { name: 'OrderNumber', type: sql.NVarChar, value: NUMBER },
  ]);
  const orderExist = await executeQuery('EXEC Sp_ResortingOrder_Check @OrderNumber', [
    { name: 'OrderNumber', type: sql.NVarChar, value: NUMBER },
  ]);

  // Added: Check ResortingOrderRequest if order exists
  if (orderExist[0].REMAINING_LABELS === 0 && orderExist[0].PRINTED_LABELS !== 0) {
    return res.status(200).json({
      OrderDetails: {
        Status: 'T',
        Message: '✅ Printing Done for this Order - You can reprint the labels',
      },
    });
  } else {
    return res.status(200).json({
      OrderDetails: orderExist[0],
      materialDetails: materialResultExist,
    });
  }
};

function isPrinterReachable(ip, port) {
  return new Promise(resolve => {
    const socket = new net.Socket();
    socket.setTimeout(3000);

    const printerPort = parseInt(port) || 9100;

    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect({
      host: ip,
      port: printerPort,
    });
  });
}

function preparePrnFile(data, dpi) {
  const basePath = path.join(__dirname, '..', '..', 'prn-printer', 'box-label');
  const templatePath = `${basePath}${dpi === '200' ? '_200' : '_300'}.prn`;

  try {
    let template = fs.readFileSync(templatePath, 'utf-8');

    Object.keys(data).forEach(key => {
      template = template.replace(new RegExp(key, 'g'), data[key]);
    });

    return template; // Return the processed template content instead of writing to file
  } catch (error) {
    console.error('Error preparing PRN content:', error);
    return null;
  }
}

export const validateSerialNo = async (req, res) => {
  const { Barcode, Material, Batch, Qty } = req.body;

  try {
    const delimiterCount = (Barcode.match(/\|/g) || []).length;

    const params = [
      { name: 'Barcode', type: sql.VarChar(50), value: Barcode },
      {
        name: 'Material',
        type: sql.VarChar(50),
        value: Material.padStart(18, '0'),
      },
      { name: 'Batch', type: sql.VarChar(50), value: Batch },
      { name: 'Qty', type: sql.Decimal, value: Qty },
    ];

    let result;
    if (delimiterCount === 2) {
      result = await executeQuery(
        'EXEC [dbo].[HHT_Resorting_PalletValidate] @Barcode, @Material, @Batch, @Qty',
        params
      );
    } else if (delimiterCount === 4) {
      result = await executeQuery(
        'EXEC [dbo].[HHT_Resorting_SerialNoValidate] @Barcode, @Material, @Batch, @Qty',
        params
      );
    } else {
      return res.json({ Status: 'F', Message: 'Invalid Barcode scanned' }).status(200);
    }
    res.json(result[0]);
  } catch (error) {
    console.error('Error validating serial number/pallet:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const updateResortingOrderType = async (req, res) => {
  const { OrderNumber, Batch, OrderType } = req.body;
  try {
    const result = await executeQuery('EXEC Sp_Update_ResortingOrderType @OrderNumber, @Batch, @OrderType', [
      { name: 'OrderNumber', type: sql.NVarChar(255), value: OrderNumber },
      { name: 'Batch', type: sql.NVarChar(50), value: Batch },
      { name: 'OrderType', type: sql.NVarChar(100), value: OrderType },
    ]);
    res.json(result[0]);
  } catch (error) {
    console.error('Error updating ResortingOrderType:', error);
    res.status(500).json({ error: 'Failed to update ResortingOrderType' });
  }
};

export const getRecentResortingTransactions = async (req, res) => {
  try {
    const result = await executeQuery(`EXEC [dbo].[Sp_ResortingOrderRequest_RecentTransaction]`);
    res.json(result);
  } catch (error) {
    console.error('Error fetching recent resorting transactions:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const getUnqiqueOrderNo = async (req, res) => {
  const { UserName } = req.body;

  try {
    const result = await executeQuery('EXEC HHT_FGPick_ResortingPendingOrders @UserName', [
      { name: 'UserName', type: sql.NVarChar, value: UserName },
    ]);
    // Transform the result to remove leading zeros from OrderNo
    const transformedResult = result.map(item => ({
      OrderNo: item.OrderNo.replace(/^0+/, ''),
    }));
    res.json(transformedResult);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};
export const fgPickOrderNOGetData = async (req, res) => {
  const { OrderNo, UserName } = req.body;
  try {
    const result = await executeQuery('EXEC HHT_FGPick_ResortingOrderNoGetData @OrderNo, @UserName', [
      {
        name: 'OrderNo',
        type: sql.NVarChar,
        value: OrderNo.padStart(12, '0'),
      },
      { name: 'UserName', type: sql.NVarChar, value: UserName },
    ]);
    const processedResult = result.map(item => ({
      ...item,
      PickedDate: item.PickedDate ? moment(item.PickedDate).format('DD-MM-YYYY') : null,
    }));
    console.log('Processed Result:', processedResult);
    res.json(processedResult);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

export const orderNoGetAllData = async (req, res) => {
  const { UserName } = req.body;

  try {
    const result = await executeQuery('EXEC HHT_FGPick_ResortingOrderNoGetDataALL @UserName', [
      { name: 'UserName', type: sql.NVarChar, value: UserName },
    ]);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

export const getClosedResortingOrders = async (req, res) => {
  try {
    const result = await executeQuery(`EXEC [dbo].[HHT_FGPick_ResortingOrderClosed]`);
    res.json(result);
  } catch (error) {
    console.error('Error fetching closed resorting orders:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const updateResortingOrderRequest = async (req, res) => {
  const { ResortingOrderNo, Material, Batch, AssignUser, AssignedBy } = req.body;

  try {
    const result = await executeQuery(
      `EXEC [dbo].[Sp_ResortingOrderRequest_Update] 
            @RESORTING_ORDERNO, @MATERIAL, @BATCH, @AssignUser, @AssignedBy`,
      [
        {
          name: 'RESORTING_ORDERNO',
          type: sql.NVarChar(70),
          value: ResortingOrderNo,
        },
        { name: 'MATERIAL', type: sql.NVarChar(50), value: Material },
        { name: 'BATCH', type: sql.NVarChar(50), value: Batch },
        { name: 'AssignUser', type: sql.NVarChar(50), value: AssignUser },
        { name: 'AssignedBy', type: sql.NVarChar(50), value: AssignedBy },
      ]
    );
    res.json(result);
  } catch (error) {
    console.error('Error updating resorting order request:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

async function batchPrintToTscPrinter(printJobs, printerIP, printerPort) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    client.setTimeout(30000);

    client.connect(
      {
        host: printerIP,
        port: parseInt(printerPort) || 9100,
      },
      async () => {
        try {
          // Read the combined temporary file
          const combinedContent = fs.readFileSync(printJobs.tempFilePath);

          client.write(combinedContent, err => {
            if (err) {
              console.error('Error in batch printing:', err);
              reject(err);
            } else {
              // Clean up the single temp file
              try {
                if (fs.existsSync(printJobs.tempFilePath)) {
                  fs.unlinkSync(printJobs.tempFilePath);
                }
              } catch (cleanupError) {
                console.error('Error cleaning up temp file:', cleanupError);
              }
              client.end();
              resolve();
            }
          });
        } catch (error) {
          client.destroy();
          reject(error);
        }
      }
    );

    client.on('error', err => {
      console.error('Printer connection error:', err);
      client.destroy();
      reject(new Error('Printer connection failed'));
    });

    client.on('timeout', () => {
      console.error('Printer connection timeout');
      client.destroy();
      reject(new Error('Printer connection timeout'));
    });
  });
}

export const getResortingOrderNumberForWebPrinting = async (req, res) => {
  const { ORDER_NUMBER, USER } = req.body;
  const orderValidation = validateOrderNumber(ORDER_NUMBER);
  if (orderValidation.error) {
    return res.status(orderValidation.status).json({ error: orderValidation.error });
  }
  const NUMBER = orderValidation.value;
  const materialResultExist = await executeQuery('EXEC Sp_SubMaterialMaster_GetAllby_OrderNo @OrderNumber', [
    { name: 'OrderNumber', type: sql.NVarChar, value: NUMBER },
  ]);
  const orderExist = await executeQuery('EXEC Sp_ResortingOrder_Check @OrderNumber', [
    { name: 'OrderNumber', type: sql.NVarChar, value: NUMBER },
  ]);

  const resortingOrderRequestCheck = await executeQuery('EXEC Sp_ResortingOrderRequest_Check @RESORTING_ORDERNO', [
    { name: 'RESORTING_ORDERNO', type: sql.NVarChar, value: NUMBER },
  ]);

  // Added: Check ResortingOrderRequest if order exists
  if (orderExist[0].Status === 'T' && resortingOrderRequestCheck[0].Status === 'T') {
    return res.status(200).json({
      resortingOrder: orderExist[0],
      resortingOrderRequest: resortingOrderRequestCheck[0],
      material: materialResultExist,
    });
  }
};
export const checkResortingMaterialPickOrder = async (req, res) => {
  const { Batch } = req.body;
  try {
    const result = await executeQuery(`EXEC [dbo].[HHT_FGPick_Resorting_MaterialPickCheckOrder] @Batch`, [
      { name: 'Batch', type: sql.NVarChar(50), value: Batch },
    ]);
    const formattedResult = result.map(item => ({
      ...item,
      MATERIAL: item.MATERIAL ? item.MATERIAL.replace(/^0+/, '') : item.MATERIAL,
      PRODUCTION_START_DATE: item.PRODUCTION_START_DATE
        ? moment(item.PRODUCTION_START_DATE).format('YYYY-MM-DD')
        : null,
      PRODUCTION_FINISH_DATE: item.PRODUCTION_FINISH_DATE
        ? moment(item.PRODUCTION_FINISH_DATE).format('YYYY-MM-DD')
        : null,
      PutDate: item.PutDate ? moment(item.PutDate).format('YYYY-MM-DD') : null,
    }));
    res.json(formattedResult);
  } catch (error) {
    console.error('Error fetching material pick order:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const closeResortingOrderManually = async (req, res) => {
  const { DeliveryNo, Material, Batch, ClosedBy } = req.body;
  try {
    const result = await executeQuery(
      `EXEC HHT_Resorting_OrderClose_Manually @DeliveryNo, @Material, @Batch, @ClosedBy`,
      [
        {
          name: 'DeliveryNo',
          type: sql.NVarChar(50),
          value: DeliveryNo.padStart(12, '0'),
        },
        {
          name: 'Material',
          type: sql.NVarChar(50),
          value: Material.padStart(18, '0'),
        },
        { name: 'Batch', type: sql.NVarChar(50), value: Batch },
        { name: 'ClosedBy', type: sql.NVarChar(50), value: ClosedBy },
      ]
    );
    res.json(result[0]);
  } catch (error) {
    console.error('Error closing resorting order manually:', error);
    res.status(500).json({
      Status: 'F',
      Message: 'Failed to close order manually',
      error: error.message,
    });
  }
};
