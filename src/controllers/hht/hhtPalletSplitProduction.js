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
      `EXEC [dbo].[HHT_PaletBarcode_ProductionBreak_Validation] 
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
      .replace(/VBoxPal/g, data.PalletCount)
      .replace(/VPcsBox/g, data.PcsPerBox)
      .replace(/VBatch/g, data.Batch)
      .replace(/VLine/g, data.Line || '')
      .replace(/VBarcode/g, data.PalletBarcode);

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

export const updatePalletBreak = async (req, res) => {
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
    const validationResult = await executeQuery(
      `EXEC [dbo].[HHT_PaletBarcode_ProductionBreak_Validation] @PalletBarcode`,
      [{ name: 'PalletBarcode', type: sql.NVarChar(100), value: PalletBarcode }]
    );
    const pcsInBoxResult = await executeQuery(`EXEC [dbo].[HHT_Pallet_DetailsforPrinting] @ScanBarcode`, [
      { name: 'ScanBarcode', type: sql.NVarChar, value: PalletBarcode },
    ]);

    const pcsInBox = Math.floor(pcsInBoxResult[0].NUMERATOR / pcsInBoxResult[0].DENOMINATOR);
    const allSerialNumbers = new Set(validationResult.map(item => item.SerialNo));

    const serialNumbersToMove = SerialNo.split('$');

    serialNumbersToMove.forEach(sn => allSerialNumbers.delete(sn));

    const remainingSerialNumbers = Array.from(allSerialNumbers);

    for (const serialNumber of serialNumbersToMove) {
      const splitResult = await executeQuery(`EXEC [dbo].[Sp_PalletSplit_Insert] @SerialNo, @PalletBarcode, @TransBy`, [
        { name: 'SerialNo', type: sql.NVarChar(50), value: serialNumber },
        {
          name: 'PalletBarcode',
          type: sql.NVarChar(50),
          value: PalletBarcode,
        },
        {
          name: 'TransBy',
          type: sql.NVarChar(50),
          value: TransBy || 'System',
        },
      ]);

      if (splitResult[0].Status === 'F') {
        return res.status(400).json({
          Status: 'F',
          Message: splitResult[0].Message || 'Failed to split pallet',
        });
      }
    }

    const result2 = await executeQuery(`EXEC [dbo].[HHT_PalletBarcode_Break_SrNo] @PalletBarcode`, [
      { name: 'PalletBarcode', type: sql.NVarChar(250), value: PalletBarcode },
    ]);
    const newPalletBarcode2 = result2[0].PalletBarcode;

    for (const serialNumber of remainingSerialNumbers) {
      await executeQuery(`EXEC [dbo].[HHT_PalletBreak_Update] @SerialNo, @OldPalBarcode, @NewPalBarcode`, [
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
      ]);
    }

    if (PrinterIp) {
      const [printerIP, printerPort] = PrinterIp.split(':');
      const portNumber = parseInt(printerPort) || 9100;

      // Print second label
      const palletNumber2 = newPalletBarcode2.split('|').pop().replace('FG', '');
      const printData2 = {
        Material,
        MaterialDescription,
        PalletCount: validationResult.length - PalletCount,
        QtyInside: parseInt(QtyInside) * remainingSerialNumbers.length,
        PalletBarcode: newPalletBarcode2,
        PcsPerBox: pcsInBox,
        PcsPerPallet: QtyInside,
        PalletNumber: palletNumber2,
        Batch,
        Line,
      };

      // Print both labels
      for (const printData of [printData2]) {
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
      Message: `Successfully Pallet Split Done. New Pallet Numbers:, ${newPalletBarcode2}`,
      SecondPallet: newPalletBarcode2,
    });
  } catch (error) {
    console.error('Error updating pallet break:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};
