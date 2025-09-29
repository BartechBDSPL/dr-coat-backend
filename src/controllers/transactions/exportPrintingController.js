import { executeQuery, sql } from '../../config/db.js';
import path from 'path';
import net from 'net';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';
import { isPrinterReachable } from '../../utils/printer.js';
import { format } from 'date-fns';
// Sp_Find_LabelSerialNo

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const getPalletSrNo = async (req, res) => {
  const { ORDER_NUMBER, MATERIAL, BATCH } = req.body;

  const paddedOrderNumber = ORDER_NUMBER.padStart(12, '0');
  const paddedMaterial = MATERIAL.padStart(18, '0');

  const labelSerialResult = await executeQuery('EXEC Sp_Find_PalletSrNo @ORDER_NUMBER, @MATERIAL', [
    { name: 'ORDER_NUMBER', type: sql.NVarChar, value: paddedOrderNumber },
    { name: 'MATERIAL', type: sql.NVarChar, value: paddedMaterial },
  ]);

  const palletSrNo = labelSerialResult[0].SrNo;
  return res.status(200).json({ palletSrNo });
};

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
    PAL_VALUE,
    pcsInBox,
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
    WORK_CENTER,
    Shift,
  } = req.body;
  const [printerIP, printerPort] = PRINTER_IP.split(':');
  const portNumber = parseInt(printerPort) || 9100;
  // console.log(req.body);
  let tempFilePath = null;

  try {
    // Check if printer is reachable before proceeding
    const printerInRange = await isPrinterReachable(printerIP, portNumber);
    if (!printerInRange) {
      return res.status(200).json({ Status: 'F', Message: 'Printer out of range' });
    }

    // Execute initial operations concurrently
    const [updateLabelCount, upsertPalletNoResult] = await Promise.all([
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
          { name: 'OrderType', type: sql.NVarChar, value: 'EXPORT' },
        ]
      ),
      executeQuery('EXEC Sp_Upsert_FG_Label_PalletNo @Order_Number, @Material, @GeneratedPalletNo', [
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
      ]),
    ]);

    // Check results of concurrent operations
    if (updateLabelCount[0].Status === 'F' || upsertPalletNoResult[0].Status === 'F') {
      return res.status(400).json({
        error: 'Failed to update initial records',
        details: {
          labelCount: updateLabelCount[0],
          palletNo: upsertPalletNoResult[0],
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
            { name: 'PalletBarcode', type: sql.NVarChar, value: serialNo },
            { name: 'Line', type: sql.NVarChar, value: WORK_CENTER.slice(-2) },
            { name: 'ShiftName', type: sql.NVarChar, value: Shift },
          ]);
        }

        // Execute database operations in parallel within the batch
        await Promise.all(
          batchParams.map(params =>
            executeQuery(
              'EXEC Sp_FG_InsertPrinting_Export_Production @ORDER_NUMBER, @MATERIAL, @PRODUCTION_PLANT, @MATERIAL_TEXT, @BATCH, @STORAGE_LOCATION, ' +
                '@SCRAP, @TARGET_QUANTITY, @DELIVERED_QUANTITY, @UNIT_ISO, @UNIT, @PRODUCTION_START_DATE, ' +
                '@PRODUCTION_FINISH_DATE, @ENTERED_BY, @ENTER_DATE, @PrintQty, @SerialNo, @PrintBy, @Printed_Labels, @PalletBarcode, @Line,@ShiftName',
              params
            )
          )
        );

        // Process content for each label in the batch
        for (let i = batchStart; i < batchEnd; i++) {
          const serialNo = serialNumbers[i];
          const boxInside = serialNo.split('|')[1];
          const palletNumber = serialNo.split('|').pop().replace('FG', '');

          const printData = {
            MATERIAL: MATERIAL.replace(/^0+/, ''), // Removes leading zeros
            MATERIAL_TEXT,
            boxInside,
            PAL_VALUE,
            serialNo,
            PcsPerPallet: boxInside,
            PalletNumber: palletNumber,
            PcsPerBox: pcsInBox,
            BATCH: BATCH,
            Line: WORK_CENTER.slice(-2),
          };
          //  console.log('Print Data:', printData);

          // Generate PRN content for this label and add to combined content
          const prnContent = preparePrnFile(printData, PrinterDpi);
          if (prnContent) {
            combinedPrnContent += prnContent;
          }
        }
      }

      // Write all combined content to a single file
      fs.writeFileSync(tempFilePath, combinedPrnContent);

      // Send all labels to the printer in one batch operation
      await batchPrintToTscPrinter({ tempFilePath }, printerIP, portNumber);

      return res.status(200).json({
        Status: 'T',
        Message: 'Pallet Label printing completed successfully',
        totalLabels: serialNumbers.length,
      });
    } catch (error) {
      console.error('Error in print process:', error);
      throw error;
    } finally {
      // Clean up the temporary file in any case
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        try {
          fs.unlinkSync(tempFilePath);
        } catch (cleanupError) {
          console.error('Error cleaning up temporary file:', cleanupError);
        }
      }
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
  const basePath = path.join(__dirname, '..', '..', 'prn-printer', 'Pallet');
  const templatePath = `${basePath}${dpi === '200' ? '_200' : '_300'}.prn`;

  try {
    let template = fs.readFileSync(templatePath, 'binary');
    template = template
      .replace(/VItemCode/g, data.MATERIAL)
      .replace(/VItemName/g, data.MATERIAL_TEXT)
      .replace(/VPalletNumber/g, data.PalletNumber)
      .replace(/VDate/g, format(new Date(), 'dd-MM-yyyy'))
      .replace(/VPcsPal/g, data.PAL_VALUE)
      .replace(/VBoxPal/g, data.PcsPerPallet)
      .replace(/VPcsBox/g, data.PcsPerBox)
      .replace(/VBatch/g, data.BATCH)
      .replace(/PalletCount/g, data.PAL_VALUE)
      .replace(/VBarcode/g, data.serialNo)
      .replace(/VLine/g, data.Line);

    return template;
  } catch (error) {
    console.error('Error preparing PRN content:', error);
    return null;
  }
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
          console.error('Error during print process:', error);
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
