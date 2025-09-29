import { executeQuery, sql } from '../../config/db.js';
import fs from 'fs';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { format } from 'date-fns';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function preparePrnFile(data, dpi) {
  const basePath = path.join(__dirname, '..', '..', 'prn-printer', 'Pallet');
  const templatePath = `${basePath}${dpi === '200' ? '_200' : '_300'}.prn`;
  try {
    // Read the template as binary data
    let template = fs.readFileSync(templatePath, 'binary');

    // Replace placeholders
    // If PalletCount is 1, show empty string, otherwise show PalletCount
    const palletCountValue = data.PalletCount === 1 || data.PalletCount === '1' ? '' : data.PalletCount;

    template = template
      .replace(/VItemCode/g, data.Material)
      .replace(/VItemName/g, data.MaterialDescription)
      .replace(/VPalletNumber/g, data.PalletNumber)
      .replace(/VDate/g, format(new Date(), 'dd-MM-yyyy'))
      .replace(/VPcsPal/g, data.QtyInside)
      .replace(/VBoxPal/g, palletCountValue)
      .replace(/VPcsBox/g, data.PcsPerBox)
      .replace(/VBatch/g, data.Batch)
      .replace(/PalletCount/g, palletCountValue)
      .replace(/VBarcode/g, data.PalletBarcode)
      .replace(/VLine/g, data.Line);

    const tempPrnPath = path.join(__dirname, 'palletreprint.prn');
    fs.writeFileSync(tempPrnPath, template, 'binary');
    return tempPrnPath;
  } catch (error) {
    console.error('Error preparing PRN file:', error);
    return null;
  }
}

function isPrinterReachable(ip, port) {
  return new Promise(resolve => {
    const socket = new net.Socket();
    socket.setTimeout(30000);

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
    client.setTimeout(30000); // 30 seconds timeout for batch printing

    client.connect(
      {
        host: printerIP,
        port: parseInt(printerPort) || 9100,
      },
      async () => {
        try {
          // Concatenate all PRN files into a single buffer
          let combinedContent = Buffer.concat(printJobs.map(job => fs.readFileSync(job.prnFilePath)));

          client.write(combinedContent, err => {
            if (err) {
              console.error('Error in batch printing:', err);
              reject(err);
            } else {
              // Clean up temp files
              printJobs.forEach(job => {
                try {
                  if (fs.existsSync(job.prnFilePath)) {
                    fs.unlinkSync(job.prnFilePath);
                  }
                } catch (cleanupError) {
                  console.error('Error cleaning up temp file:', cleanupError);
                }
              });
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

export const insertPalletRePrintDetails = async (req, res) => {
  const {
    PalletBarcode,
    Order_Number,
    Item_Code,
    Item_Description,
    TotalQty,
    PalletBarcodeCount,
    PalletDate,
    PalletBy,
    RePrintReason,
    RePrintQty,
    RePrintBy,
    RePrintDate,
    Line,
    Tank,
    PlantCode,
    PrinterIP,
    PrinterDpi,
    Batch,
  } = req.body;

  if (!PrinterIP || !PrinterIP.includes(':')) {
    return res.status(200).json({ Status: 'F', Message: 'Invalid printer IP format' });
  }

  const [printerIP, printerPort] = PrinterIP.split(':');

  try {
    const printerInRange = await isPrinterReachable(printerIP, printerPort);
    if (!printerInRange) {
      return res.status(200).json({ Status: 'F', Message: 'Printer out of range' });
    }
    const printJobs = [];
    const pcsInBoxResult = await executeQuery(`EXEC [dbo].[HHT_Pallet_DetailsforPrinting] @ScanBarcode`, [
      { name: 'ScanBarcode', type: sql.NVarChar, value: PalletBarcode },
    ]);

    const pcsInBox = Math.floor(pcsInBoxResult[0].NUMERATOR / pcsInBoxResult[0].DENOMINATOR);
    for (let i = 0; i < RePrintQty; i++) {
      const printData = {
        Material: Item_Code,
        MaterialDescription: Item_Description,
        PalletCount: PalletBarcodeCount,
        QtyInside: TotalQty,
        PalletBarcode,
        PalletNumber: PalletBarcode.split('|').pop().replace('FG', ''),
        PcsPerBox: pcsInBox,
        Batch: Batch,
        Line: Line,
      };

      const prnFilePath = preparePrnFile(printData, PrinterDpi);
      if (prnFilePath) {
        printJobs.push({ prnFilePath });
      }
    }

    // Execute batch printing
    if (printJobs.length > 0) {
      try {
        await batchPrintToTscPrinter(printJobs, printerIP, printerPort);

        await executeQuery(
          `DECLARE @RES VARCHAR(50);
                     EXEC [dbo].[Sp_Pallet_RePrintInsertPalletDetails]
                        @PalletBarcode, @Order_Number, @Item_Code, @Item_Description,
                        @TotalQty, @PalletBarcodeCount, @PalletDate, @PalletBy,
                        @RePrintReason, @RePrintQty, @RePrintBy, @RePrintDate, @PlantCode`,
          [
            {
              name: 'PalletBarcode',
              type: sql.NVarChar,
              value: PalletBarcode || '',
            },
            {
              name: 'Order_Number',
              type: sql.NVarChar,
              value: Order_Number || '',
            },
            { name: 'Item_Code', type: sql.NVarChar, value: Item_Code || '' },
            {
              name: 'Item_Description',
              type: sql.NVarChar,
              value: Item_Description || '',
            },
            {
              name: 'TotalQty',
              type: sql.NVarChar,
              value: String(TotalQty) || '',
            },
            {
              name: 'PalletBarcodeCount',
              type: sql.NVarChar,
              value: String(PalletBarcodeCount) || '',
            },
            { name: 'PalletDate', type: sql.NVarChar, value: PalletDate || '' },
            { name: 'PalletBy', type: sql.NVarChar, value: PalletBy || '' },
            {
              name: 'RePrintReason',
              type: sql.NVarChar,
              value: RePrintReason || '',
            },
            {
              name: 'RePrintQty',
              type: sql.NVarChar,
              value: String(RePrintQty) || '',
            },
            { name: 'RePrintBy', type: sql.NVarChar, value: RePrintBy || '' },
            {
              name: 'RePrintDate',
              type: sql.NVarChar,
              value: RePrintDate || '',
            },
            { name: 'PlantCode', type: sql.NVarChar, value: PlantCode || '' },
          ]
        );

        return res.status(200).json({
          Status: 'T',
          Message: 'Pallet label printing and database insertion completed successfully',
          totalLabels: RePrintQty,
        });
      } catch (error) {
        console.error('Error in print process:', error);
        printJobs.forEach(job => {
          try {
            if (fs.existsSync(job.prnFilePath)) {
              fs.unlinkSync(job.prnFilePath);
            }
          } catch (cleanupError) {
            console.error('Error cleaning up temp file:', cleanupError);
          }
        });
        return res.status(500).json({
          Status: 'F',
          Message: 'Failed to insert pallet reprint details into database',
        });
      }
    } else {
      return res.status(500).json({
        Status: 'F',
        Message: 'Failed to prepare PRN files for printing',
      });
    }
  } catch (error) {
    console.error('Error in pallet reprint process:', error);
    return res.status(500).json({ error: 'Failed to process pallet reprint' });
  }
};

export const getRePrintPalletData = async (req, res) => {
  const { FromDate, ToDate, ORDER_NUMBER, User, MATERIAL, BATCH, Tank, Line } = req.body;

  try {
    const result = await executeQuery(
      `EXEC [dbo].[Sp_RePrint_PalletData] 
                @FromDate, 
                @ToDate, 
                @ORDER_NUMBER, 
                @User, 
                @MATERIAL, 
                @BATCH,
                @Tank,
                @Line`,
      [
        { name: 'FromDate', type: sql.NVarChar, value: FromDate || '' },
        { name: 'ToDate', type: sql.NVarChar, value: ToDate || '' },
        { name: 'ORDER_NUMBER', type: sql.NVarChar, value: ORDER_NUMBER || '' },
        { name: 'User', type: sql.NVarChar, value: User || '' },
        { name: 'MATERIAL', type: sql.NVarChar, value: MATERIAL || '' },
        { name: 'BATCH', type: sql.NVarChar, value: BATCH || '' },
        { name: 'Tank', type: sql.NVarChar, value: Tank || '' },
        { name: 'Line', type: sql.NVarChar, value: Line || '' },
      ]
    );
    res.json(result);
  } catch (error) {
    console.error('Error fetching reprint pallet data:', error);
    res.status(500).json({ error: 'Failed to fetch reprint pallet data' });
  }
};
