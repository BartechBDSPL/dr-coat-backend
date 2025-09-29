import { executeQuery, sql } from '../../config/db.js';
import { SAP_CONNECTOR_MIDDLEWARE_URL, SAP_SERVER } from '../../utils/constants.js';
import axios from 'axios';
import path from 'path';
import net from 'net';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';
import moment from 'moment';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const validateOrderNumber = orderNumber => {
  if (!orderNumber.startsWith('00010') && !orderNumber.startsWith('10')) {
    return { error: 'Order number invalid', status: 400 };
  }
  const expectedLength = orderNumber.startsWith('000') ? 12 : 9;
  if (orderNumber.length !== expectedLength) {
    return {
      error: `Order number must be ${expectedLength} digits`,
      status: 400,
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

  // Check if all required units are present exactly once
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

export const getSeriialNumberAndBoxNumber = async (req, res) => {
  try {
    const { ORDER_NUMBER, MATERIAL, BATCH } = req.body;
    const labelSerialResult = await executeQuery('EXEC Sp_Find_LabelSerialNo @ORDER_NUMBER, @BATCH, @MATERIAL', [
      { name: 'ORDER_NUMBER', type: sql.NVarChar, value: ORDER_NUMBER },
      { name: 'BATCH', type: sql.NVarChar, value: BATCH },
      { name: 'MATERIAL', type: sql.NVarChar, value: MATERIAL },
    ]);

    const labelSerialNo = labelSerialResult[0].SrNo;

    const boxNoResult = await executeQuery('EXEC Sp_Find_BoxNo @ORDER_NUMBER, @MATERIAL', [
      { name: 'ORDER_NUMBER', type: sql.NVarChar, value: ORDER_NUMBER },
      { name: 'MATERIAL', type: sql.NVarChar, value: MATERIAL },
    ]);

    const labelBoxNo = parseInt(boxNoResult[0].BoxNo);

    return res.status(200).json({ labelSerialNo, labelBoxNo });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

export const getPrintData = async (req, res) => {
  try {
    const { ORDER_NUMBER, USER, EXPORT } = req.body;
    const orderValidation = validateOrderNumber(ORDER_NUMBER);
    if (orderValidation.error) {
      return res.status(orderValidation.status).json({ error: orderValidation.error });
    }
    const NUMBER = orderValidation.value;
    const materialResultExist = await executeQuery('EXEC Sp_SubMaterialMaster_GetAllby_OrderNo @OrderNumber', [
      { name: 'OrderNumber', type: sql.NVarChar, value: NUMBER },
    ]);
    const orderExist = await executeQuery('EXEC Sp_ProductionOrder_Check @OrderNumber', [
      { name: 'OrderNumber', type: sql.NVarChar, value: NUMBER },
    ]);
    if (orderExist[0].Status === 'T') {
      if (orderExist[0].ORDER_TYPE == 'PP02') {
        return res.status(400).json({ error: "This is not production order it's resorting order" });
      }
      // if(EXPORT === true && !materialResultExist[0].MATL_DESC.includes("EXP")) {
      //     return res.status(400).json({ error: "This is not production order it's resorting order" });
      // }

      if (EXPORT === true && !orderExist[0].OrderType?.includes('EXP') && orderExist[0].PRINTED_LABELS > 0) {
        return res.status(400).json({ error: 'This order is being used for printing BOXES' });
      }

      if (EXPORT === false && !orderExist[0].OrderType?.includes('DOMESTIC') && orderExist[0].PRINTED_LABELS > 0) {
        return res.status(400).json({
          error: 'This order is being used for the Export Production Order (PALLET)',
        });
      }
      // if(EXPORT === false && materialResultExist[0].MATL_DESC.includes("EXP")) {
      //     return res.status(400).json({ error: "This is an export production order for pallet printing" });
      // }
      // Update production order open time before returning
      await updateProductionOrderOpened(NUMBER);
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
    }

    const { data: orderData } = await axios.post(`${SAP_CONNECTOR_MIDDLEWARE_URL}/api/order/details`, {
      ConnectionParams: SAP_SERVER,
      NUMBER,
    });

    if (orderData.Return.MESSAGE?.includes('does not exist')) {
      return res.status(400).json({ error: orderData.Return.MESSAGE });
    }

    const [posData] = orderData.PositionTable;
    const [headerData] = orderData.HeaderTable;

    const operationData = orderData.OperationTable.find(op => op.OPERATION_NUMBER === '0020');
    if (!headerData.SYSTEM_STATUS.startsWith('REL')) {
      return res.status(400).json({ error: 'Production order not yet released' });
    }
    const { data: materialData } = await axios.post(`${SAP_CONNECTOR_MIDDLEWARE_URL}/api/material/getall`, {
      ConnectionParams: SAP_SERVER,
      Material: posData.MATERIAL,
      Plant: posData.PROD_PLANT,
    });

    const unitsValidation = validateUnits(materialData.UnitsOfMeasure);
    if (unitsValidation.error) {
      return res.status(unitsValidation.status).json({ error: unitsValidation.error });
    }

    if (posData.ORDER_TYPE == 'PP02') {
      return res.status(400).json({ error: "This is not production order it's resorting order" });
    }

    // if(EXPORT === true && !materialData.MaterialDescription[1].MATL_DESC.includes("EXP")) {

    //     return res.status(400).json({ error: "This is not an export production order for pallet printing" });
    // }
    // if(EXPORT === false && materialData.MaterialDescription[1].MATL_DESC.includes("EXP")) {
    //     return res.status(400).json({ error: "This is an export production order for pallet printing" });
    // }

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
      `EXEC Sp_ProductionOrder_Insert 
            @OrderNumber, @OrderItemNumber, @Scrap, @Quantity, @Material, 
            @StorageLocation, @ProdPlant, @OrderType, @ProductionFinishDate, 
            @Batch, @MaterialText, @Unit, @UnitISO, @ProductionStartDate, 
            @ProductionScheduler, @MRPController, @EnteredBy, @EnterDate, 
            @TargetQuantity, @ReservationNumber, @SchedReleaseDate, 
            @SystemStatus, @WorkCenter, @StandardValueKey, @CreatedBy`,
      [
        {
          name: 'OrderNumber',
          type: sql.NVarChar,
          value: posData.ORDER_NUMBER,
        },
        {
          name: 'OrderItemNumber',
          type: sql.NVarChar,
          value: posData.ORDER_ITEM_NUMBER,
        },
        { name: 'Scrap', type: sql.DECIMAL, value: parseFloat(posData.SCRAP) },
        {
          name: 'Quantity',
          type: sql.DECIMAL,
          value: parseFloat(posData.QUANTITY),
        },
        { name: 'Material', type: sql.NVarChar, value: posData.MATERIAL },
        {
          name: 'StorageLocation',
          type: sql.NVarChar,
          value: posData.STORAGE_LOCATION,
        },
        { name: 'ProdPlant', type: sql.NVarChar, value: posData.PROD_PLANT },
        { name: 'OrderType', type: sql.NVarChar, value: posData.ORDER_TYPE },
        {
          name: 'ProductionFinishDate',
          type: sql.NVarChar,
          value: posData.PRODUCTION_FINISH_DATE,
        },
        { name: 'Batch', type: sql.NVarChar, value: posData.BATCH },
        {
          name: 'MaterialText',
          type: sql.NVarChar,
          value: posData.MATERIAL_TEXT,
        },
        { name: 'Unit', type: sql.NVarChar, value: posData.BASE_UNIT },
        { name: 'UnitISO', type: sql.NVarChar, value: posData.BASE_UNIT_ISO },
        {
          name: 'ProductionStartDate',
          type: sql.NVarChar,
          value: headerData.PRODUCTION_START_DATE,
        },
        {
          name: 'ProductionScheduler',
          type: sql.NVarChar,
          value: headerData.PRODUCTION_SCHEDULER,
        },
        {
          name: 'MRPController',
          type: sql.NVarChar,
          value: headerData.MRP_CONTROLLER,
        },
        { name: 'EnteredBy', type: sql.NVarChar, value: headerData.ENTERED_BY },
        { name: 'EnterDate', type: sql.NVarChar, value: headerData.ENTER_DATE },
        {
          name: 'TargetQuantity',
          type: sql.DECIMAL,
          value: parseFloat(headerData.TARGET_QUANTITY),
        },
        {
          name: 'ReservationNumber',
          type: sql.NVarChar,
          value: headerData.RESERVATION_NUMBER,
        },
        {
          name: 'SchedReleaseDate',
          type: sql.NVarChar,
          value: headerData.SCHED_RELEASE_DATE,
        },
        {
          name: 'SystemStatus',
          type: sql.NVarChar,
          value: headerData.SYSTEM_STATUS,
        },
        {
          name: 'WorkCenter',
          type: sql.NVarChar,
          value: operationData.WORK_CENTER,
        },
        {
          name: 'StandardValueKey',
          type: sql.NVarChar,
          value: operationData.STANDARD_VALUE_KEY,
        },
        { name: 'CreatedBy', type: sql.NVarChar, value: USER },
      ]
    );

    if (insertResult[0].Status === 'F') {
      return res.status(500).json(insertResult);
    }

    const finalResult = await executeQuery('EXEC Sp_ProductionOrder_Check @OrderNumber', [
      { name: 'OrderNumber', type: sql.NVarChar, value: NUMBER },
    ]);
    const materialResult = await executeQuery('EXEC Sp_SubMaterialMaster_GetAllby_OrderNo @OrderNumber', [
      { name: 'OrderNumber', type: sql.NVarChar, value: NUMBER },
    ]);

    // Update production order open time before returning
    await updateProductionOrderOpened(NUMBER);

    return res.status(200).json({ OrderDetails: finalResult[0], materialDetails: materialResult });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

export const getRecentlyAddedProductionOrderNumber = async (req, res) => {
  try {
    const { OrderType } = req.query;
    const result = await executeQuery(`EXEC [dbo].[Sp_ProductionOrders_GetRecent] @OrderType`, [
      { name: 'OrderType', type: sql.NVarChar, value: OrderType },
    ]);

    res.json(result);
  } catch (error) {
    console.error('Error in recent label printing:', error);
    res.status(500).json({ Status: 'F', Message: `Error: ${error.message}` });
  }
};

export const updateProductionOrderOpened = async orderNumber => {
  try {
    if (!orderNumber) {
      console.error('Order number is required for updating open time');
      return;
    }

    await executeQuery(`EXEC Sp_ProductionOrders_LatestOpenTime @ORDER_NUMBER`, [
      { name: 'ORDER_NUMBER', type: sql.NVarChar, value: orderNumber },
    ]);
  } catch (error) {
    console.error('Error updating production order open time:', error);
  }
};

export const recentLabelPrinting = async (req, res) => {
  try {
    const result = await executeQuery(`EXEC [dbo].[Sp_RecentLabelPrinting]`, []);

    res.json(result);
  } catch (error) {
    console.error('Error in recent label printing:', error);
    res.status(500).json({ Status: 'F', Message: `Error: ${error.message}` });
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

export const updateLabelPrinting = async (req, res) => {
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
  } = req.body;
  const [printerIP, printerPort] = PRINTER_IP.split(':');
  const portNumber = parseInt(printerPort) || 9100;

  let tempFilePath = null;

  try {
    // const printerInRange = await isPrinterReachable(printerIP, portNumber);
    // if (!printerInRange) {
    //     return res.status(400).json({ error: 'Printer out of range' });
    // }

    // Execute initial operations concurrently
    const [upsertSrNoResult, upsertBoxNoResult, updateLabelCount] = await Promise.all([
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
      executeQuery(
        'EXEC Sp_Update_LabelCount @OrderNumber, @Material, @Batch, @Printed_Labels, @Remaining_Labels, @OrderType',
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
          { name: 'OrderType', type: sql.NVarChar, value: 'DOMESTIC' },
        ]
      ),
    ]);

    // Check results of concurrent operations
    if (
      upsertSrNoResult[0].Status === 'F' ||
      upsertBoxNoResult[0].Status === 'F' ||
      updateLabelCount[0].Status === 'F'
    ) {
      return res.status(400).json({
        error: 'Failed to update initial records',
        details: {
          srNo: upsertSrNoResult[0],
          boxNo: upsertBoxNoResult[0],
          labelCount: updateLabelCount[0],
        },
      });
    }

    const serialNumbers = SerialNo.split('$');
    const printQuantities = PrintQty.split('$');

    if (serialNumbers.length !== printQuantities.length) {
      return res.status(400).json({ error: 'Serial numbers and print quantities do not match' });
    }

    tempFilePath = path.join(__dirname, `combined_temp_${Date.now()}.prn`);
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
            {
              name: 'STORAGE_LOCATION',
              type: sql.NVarChar,
              value: STORAGE_LOCATION,
            },
            { name: 'SCRAP', type: sql.NVarChar, value: SCRAP },
            {
              name: 'TARGET_QUANTITY',
              type: sql.NVarChar,
              value: TARGET_QUANTITY,
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
          ]);
        }
        // Execute database operations in parallel within the batch
        await Promise.all(
          batchParams.map(params =>
            executeQuery(
              'EXEC Sp_FG_InsertPrinting @ORDER_NUMBER, @MATERIAL, @PRODUCTION_PLANT, @MATERIAL_TEXT, @BATCH, @STORAGE_LOCATION, ' +
                '@SCRAP, @TARGET_QUANTITY, @DELIVERED_QUANTITY, @UNIT_ISO, @UNIT, @PRODUCTION_START_DATE, ' +
                '@PRODUCTION_FINISH_DATE, @ENTERED_BY, @ENTER_DATE, @PrintQty, @SerialNo, @PrintBy, @Printed_Labels,@ShiftName,@SorterNo,@LINE',
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
          // await batchPrintToTscPrinter({ tempFilePath }, printerIP, portNumber);

          if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
          }

          return res.status(200).json({
            Status: 'T',
            Message: 'Label printing completed successfully',
            totalLabels: serialNumbers.length,
          });
        } catch (printError) {
          console.error('Batch printing error:', printError);
          throw printError;
        }
      }

      // Clean up the temporary file if we didn't print anything
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }

      return res.status(200).json({
        Status: 'T',
        Message: 'Label printing completed successfully',
        totalLabels: serialNumbers.length,
      });
    } catch (error) {
      console.error('Error in print process:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error in print process:', error);

    // Final cleanup of temporary file in case of any error
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (cleanupError) {
        console.error('Error cleaning up temporary file:', cleanupError);
      }
    }

    return res.status(500).json({
      Status: 'F',
      Message: 'Printing process failed',
      error: error.message,
    });
  }
};

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
