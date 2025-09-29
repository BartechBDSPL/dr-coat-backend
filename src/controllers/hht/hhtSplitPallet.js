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

export const validatePalletBarcodeBreak = async (req, res) => {
  const { PalletBarcode } = req.body;

  try {
    const result = await executeQuery(
      `EXEC [dbo].[HHT_PaletBarcode_Break_Validation] 
            @PalletBarcode`,
      [{ name: 'PalletBarcode', type: sql.NVarChar(100), value: PalletBarcode }]
    );
    res.json(result);
  } catch (error) {
    console.error('Error validating pallet barcode break:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

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
              // console.log('Print job completed successfully');
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

export const updatePalletBreakNotProduction = async (req, res) => {
  const {
    SerialNo,
    PalletBarcode,
    PrinterIp,
    Material,
    MaterialDescription,
    PalletCount,
    QtyInside,
    Batch,
    TransBy,
    printerDPI,
  } = req.body;

  try {
    const getLineResult = await executeQuery(`EXEC [dbo].[HHT_FG_Pallet_GetLineNumber] @ScanBarcode`, [
      { name: 'ScanBarcode', type: sql.NVarChar, value: PalletBarcode },
    ]);

    const Line = getLineResult[0].Line;

    if (PrinterIp) {
      const [printerIP, printerPort] = PrinterIp.split(':');
      const portNumber = parseInt(printerPort) || 9100;
      const printerInRange = await isPrinterReachable(printerIP, portNumber);
      if (!printerInRange) {
        return res.status(200).json({ Status: 'F', Message: 'Printer out of range' });
      }
    }
    const validationResult = await executeQuery(`EXEC [dbo].[HHT_PaletBarcode_Break_Validation] @PalletBarcode`, [
      { name: 'PalletBarcode', type: sql.NVarChar(100), value: PalletBarcode },
    ]);
    const pcsInBoxResult = await executeQuery(`EXEC [dbo].[HHT_Pallet_DetailsforPrinting] @ScanBarcode`, [
      { name: 'ScanBarcode', type: sql.NVarChar, value: PalletBarcode },
    ]);

    const pcsInBox = Math.floor(pcsInBoxResult[0].NUMERATOR / pcsInBoxResult[0].DENOMINATOR);

    const allSerialNumbers = new Set(validationResult.map(item => item.SerialNo));

    const serialNumbersToMove = SerialNo.split('$');

    serialNumbersToMove.forEach(sn => allSerialNumbers.delete(sn));

    const remainingSerialNumbers = Array.from(allSerialNumbers);

    const result1 = await executeQuery(`EXEC [dbo].[HHT_PalletBarcode_Break_SrNo] @PalletBarcode`, [
      { name: 'PalletBarcode', type: sql.NVarChar(250), value: PalletBarcode },
    ]);
    const newPalletBarcode1 = result1[0].PalletBarcode;

    for (const serialNumber of serialNumbersToMove) {
      await executeQuery(
        `EXEC [dbo].[HHT_PalletBreak_Update] @SerialNo, @OldPalBarcode, @NewPalBarcode, @Material, @OrderNo, @Batch, @TransBy`,
        [
          { name: 'SerialNo', type: sql.NVarChar(50), value: serialNumber },
          {
            name: 'OldPalBarcode',
            type: sql.NVarChar(50),
            value: PalletBarcode,
          },
          {
            name: 'NewPalBarcode',
            type: sql.NVarChar(50),
            value: newPalletBarcode1,
          },
          { name: 'Material', type: sql.NVarChar(50), value: Material },
          { name: 'OrderNo', type: sql.NVarChar(50), value: newPalletBarcode1 },
          { name: 'Batch', type: sql.NVarChar(50), value: Batch },
          { name: 'TransBy', type: sql.NVarChar(50), value: TransBy },
        ]
      );
    }

    const result2 = await executeQuery(`EXEC [dbo].[HHT_PalletBarcode_Break_SrNo] @PalletBarcode`, [
      { name: 'PalletBarcode', type: sql.NVarChar(250), value: PalletBarcode },
    ]);
    const newPalletBarcode2 = result2[0].PalletBarcode;

    for (const serialNumber of remainingSerialNumbers) {
      await executeQuery(
        `EXEC [dbo].[HHT_PalletBreak_Update] @SerialNo, @OldPalBarcode, @NewPalBarcode, @Material, @OrderNo, @Batch, @TransBy`,
        [
          { name: 'SerialNo', type: sql.NVarChar(50), value: serialNumber },
          {
            name: 'OldPalBarcode',
            type: sql.NVarChar(50),
            value: PalletBarcode,
          },
          {
            name: 'NewPalBarcode',
            type: sql.NVarChar(50),
            value: newPalletBarcode2,
          },
          { name: 'Material', type: sql.NVarChar(50), value: Material },
          { name: 'OrderNo', type: sql.NVarChar(50), value: newPalletBarcode2 },
          { name: 'Batch', type: sql.NVarChar(50), value: Batch },
          { name: 'TransBy', type: sql.NVarChar(50), value: TransBy },
        ]
      );
    }

    if (PrinterIp) {
      const [printerIP, printerPort] = PrinterIp.split(':');
      const portNumber = parseInt(printerPort) || 9100;

      const palletNumber1 = newPalletBarcode1.split('|').pop().replace('FG', '');
      const printData1 = {
        Material,
        MaterialDescription,
        PalletCount,
        QtyInside: parseInt(QtyInside) * serialNumbersToMove.length,
        PalletBarcode: newPalletBarcode1,
        PcsPerPallet: QtyInside,
        PalletNumber: palletNumber1,
        PcsPerBox: pcsInBox,
        Batch,
        Line,
      };
      const palletNumber2 = newPalletBarcode2.split('|').pop().replace('FG', '');
      const printData2 = {
        Material,
        MaterialDescription,
        PalletCount: validationResult.length - PalletCount,
        QtyInside: parseInt(QtyInside) * remainingSerialNumbers.length,
        PalletBarcode: newPalletBarcode2,
        PcsPerPallet: QtyInside,
        PalletNumber: palletNumber2,
        PcsPerBox: pcsInBox,
        Batch,
        Line,
      };

      // Print both labels
      for (const printData of [printData1, printData2]) {
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
            return res.status(200).json({ message: printError.message });
          }
        }
      }
    }

    res.json({
      Status: 'T',
      Message: `Successfully Pallet Split Done. New Pallet Numbers:, ${newPalletBarcode1}, ${newPalletBarcode2}`,
      SecondPallet: newPalletBarcode2,
    });
  } catch (error) {
    console.error('Error updating pallet break:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const getPalletDetailsForPrinting = async (req, res) => {
  const { ScanBarcode } = req.body;

  try {
    const result = await executeQuery(`EXEC [dbo].[HHT_Pallet_DetailsforPrinting] @ScanBarcode`, [
      { name: 'ScanBarcode', type: sql.NVarChar, value: ScanBarcode },
    ]);

    res.json(result[0]);
  } catch (error) {
    console.error('Error fetching pallet details for printing:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};
