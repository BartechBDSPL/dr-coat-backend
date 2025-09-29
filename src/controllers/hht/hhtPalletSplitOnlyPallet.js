import { executeQuery, sql } from '../../config/db.js';
import fs from 'fs';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { format } from 'date-fns';
import { isPrinterReachable } from '../../utils/printer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function preparePrnFile(data, dpi) {
  const basePath = path.join(__dirname, '..', '..', 'prn-printer', 'Pallet');
  const templatePath = `${basePath}${dpi === '200' ? '_200' : '_300'}.prn`;
  try {
    let template = fs.readFileSync(templatePath, 'binary');
    template = template
      .replace(/VItemCode/g, data.Material)
      .replace(/VItemName/g, data.MaterialDescription)
      .replace(/VPalletNumber/g, data.PalletNumber)
      .replace(/VDate/g, format(new Date(), 'dd-MM-yyyy'))
      .replace(/VPcsPal/g, data.QtyInside)
      .replace(/VPcsBox/g, data.PcsPerBox)
      .replace(/VBoxPal/g, data.PalletCount)
      .replace(/VBatch/g, data.Batch)
      .replace(/VBarcode/g, data.PalletBarcode)
      .replace(/VLine/g, data.Line);
    const tempPrnPath = path.join(__dirname, 'temp.prn');
    fs.writeFileSync(tempPrnPath, template, 'binary');
    return tempPrnPath;
  } catch (error) {
    console.error('Error preparing PRN file:', error);
    return null;
  }
}

function printToTscPrinter(prnFilePath, ip, port) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    client.setTimeout(5000);
    client.connect(port, ip, () => {
      try {
        const fileContent = fs.readFileSync(prnFilePath, null);
        client.write(fileContent, err => {
          if (err) {
            console.error('Error sending print job:', err);
            client.destroy();
            reject(new Error('Failed to send print job'));
          } else {
            client.end(() => {
              resolve();
            });
          }
        });
      } catch (error) {
        console.error('Error reading PRN file:', error);
        client.destroy();
        reject(error);
      }
    });
    client.on('timeout', () => {
      client.destroy();
      reject(new Error('Printer connection timeout'));
    });
    client.on('error', err => {
      client.destroy();
      reject(new Error(`Printer connection error: ${err.message}`));
    });
  });
}

export const validateExportPalletSplit = async (req, res) => {
  let { ScanBarcode } = req.body;
  try {
    try {
      if (typeof ScanBarcode === 'string' && /^[A-Za-z0-9+/=]+$/.test(ScanBarcode)) {
        const decodedBarcode = Buffer.from(ScanBarcode, 'base64').toString('utf8');
        ScanBarcode = decodedBarcode;
      }
    } catch (decodeError) {
      console.warn('Base64 decoding failed, using original input:', decodeError);
    }

    const result = await executeQuery(`EXEC [dbo].[HHT_Export_PalletSplit_Validation] @ScanBarcode`, [
      { name: 'ScanBarcode', type: sql.NVarChar(255), value: ScanBarcode },
    ]);

    const processedResult = result.map(item => ({
      ...item,
      ORDER_NUMBER: item.ORDER_NUMBER ? item.ORDER_NUMBER.replace(/^0+/, '') : item.ORDER_NUMBER,
      MATERIAL: item.MATERIAL ? item.MATERIAL.replace(/^0+/, '') : item.MATERIAL,
    }));

    res.json(processedResult);
  } catch (error) {
    console.error('Error validating export pallet split:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const exportPalletSplitUpdate = async (req, res) => {
  let { OldBarcode, Qty, SplitBy, PrinterIp, printerDPI } = req.body;
  // console.log(req.body);
  try {
    // Decode OldBarcode if base64
    try {
      if (typeof OldBarcode === 'string' && /^[A-Za-z0-9+/=]+$/.test(OldBarcode)) {
        const decodedBarcode = Buffer.from(OldBarcode, 'base64').toString('utf8');
        OldBarcode = decodedBarcode;
      }
    } catch (decodeError) {
      console.warn('Base64 decoding failed for OldBarcode, using original input:', decodeError);
    }
    // 1. Get Line Number
    // console.log('Fetching Line Number for Old Barcode:', OldBarcode);
    const getLineResult = await executeQuery(`EXEC [dbo].[HHT_FG_Pallet_GetLineNumber] @ScanBarcode`, [
      { name: 'ScanBarcode', type: sql.NVarChar, value: OldBarcode },
    ]);
    const Line = getLineResult[0]?.Line || '';

    // 2. Get new barcode
    const result1 = await executeQuery(`EXEC [dbo].[HHT_PalletBarcode_Break_SrNo] @PalletBarcode`, [
      { name: 'PalletBarcode', type: sql.NVarChar(250), value: OldBarcode },
    ]);
    const NewBarcode = result1[0]?.PalletBarcode;
    if (!NewBarcode) {
      return res.status(400).json({ Status: 'F', Message: 'Failed to get new barcode.' });
    }
    console.log('New Barcode:', NewBarcode);

    // 3. Call export split update SP
    const spResult = await executeQuery(
      `EXEC [dbo].[HHT_Export_PalletSplit_Update] @OldBarcode, @NewBarcode, @Qty, @SplitBy`,
      [
        { name: 'OldBarcode', type: sql.NVarChar(255), value: OldBarcode },
        { name: 'NewBarcode', type: sql.NVarChar(255), value: NewBarcode },
        { name: 'Qty', type: sql.Decimal(18, 3), value: Qty },
        { name: 'SplitBy', type: sql.NVarChar(50), value: SplitBy },
      ]
    );
    const { Status, Message } = spResult[0] || {};

    // 4. If success, do printing
    if (Status === 'T' && PrinterIp && printerDPI) {
      const [printerIP, printerPort] = PrinterIp.split(':');
      const portNumber = parseInt(printerPort) || 9100;
      const printerInRange = await isPrinterReachable(printerIP, portNumber);
      if (!printerInRange) {
        return res.status(200).json({ Status: 'F', Message: 'Printer out of range' });
      }
      // Get details for printing (QtyInside, PcsPerBox, etc.)
      const printDetails = await executeQuery(`EXEC [dbo].[HHT_Pallet_DetailsforPrinting] @ScanBarcode`, [
        { name: 'ScanBarcode', type: sql.NVarChar, value: OldBarcode },
      ]);
      const details = printDetails[0] || {};
      const palletNumber = NewBarcode.split('|').pop()?.replace('FG', '') || '';
      const printData = {
        Material: details.MATERIAL ? details.MATERIAL.replace(/^0+/, '') : '',
        MaterialDescription: details.MATERIAL_TEXT || '',
        PalletCount: details.PalletCount ? String(details.PalletCount).replace(/^0+/, '') : '',
        QtyInside: Qty || (details.PrintQty ? String(details.PrintQty).replace(/^0+/, '') : ''),
        PalletBarcode: NewBarcode,
        PcsPerPallet: '',
        PalletNumber: palletNumber ? palletNumber.replace(/^0+/, '') : '',
        PcsPerBox:
          details.NUMERATOR && details.DENOMINATOR
            ? String(Math.floor(details.NUMERATOR / details.DENOMINATOR)).replace(/^0+/, '')
            : '',
        Batch: details.BATCH ? details.BATCH.replace(/^0+/, '') : '',
        Line: Line ? String(Line).replace(/^0+/, '') : '',
      };
      const prnFilePath = preparePrnFile(printData, printerDPI);
      if (prnFilePath) {
        try {
          await printToTscPrinter(prnFilePath, printerIP, portNumber);
          fs.unlinkSync(prnFilePath);
        } catch (printError) {
          fs.unlinkSync(prnFilePath);
          console.error('Error printing pallet barcode:', {
            message: printError.message,
          });
          return res.status(200).json({
            Status: 'T',
            Message: Message + ' (Print error: ' + printError.message + ')',
          });
        }
      }
    }
    return res.json({ Status, Message, NewBarcode });
  } catch (error) {
    console.error('Error in exportPalletSplitUpdate:', error);
    res.status(500).json({
      Status: 'F',
      Message: 'Failed to execute export pallet split update',
    });
  }
};
