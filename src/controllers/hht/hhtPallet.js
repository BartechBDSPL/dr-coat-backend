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
    // Read the template as binary data
    let template = fs.readFileSync(templatePath, 'binary');

    // Replace placeholders
    template = template
      .replace(/VItemCode/g, data.Material)
      .replace(/VItemName/g, data.MaterialDescription)
      .replace(/VPalletNumber/g, data.PalletNumber)
      .replace(/VDate/g, format(new Date(), 'dd-MM-yyyy'))
      .replace(/VPcsPal/g, data.QtyInside)
      .replace(/VBoxPal/g, data.PalletCount)
      .replace(/VPcsBox/g, data.PcsPerBox)
      .replace(/VBatch/g, data.Batch)
      .replace(/PalletCount/g, data.PalletCount)
      .replace(/VBarcode/g, data.PalletBarcode)
      .replace(/VLine/g, data.Line);

    const tempPrnPath = path.join(__dirname, `temp.prn`);
    // Write the file as binary data
    fs.writeFileSync(tempPrnPath, template, 'binary');
    return tempPrnPath;
  } catch (error) {
    console.error('Error preparing PRN file:', error);
    return null;
  }
}

function printToTscPrinter(prnFilePath, ip, port) {
  return new Promise((resolve, reject) => {
    const printerIP = ip;
    const printerPort = port;
    const timeout = 5000;

    const client = new net.Socket();
    client.setTimeout(timeout);

    client.connect(printerPort, printerIP, () => {
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

export const fetchPalletBarcode = async (req, res) => {
  const { ScanBarcode } = req.body;
  try {
    const result = await executeQuery(`EXEC [dbo].[HHT_FG_Pallet_Fetch] @ScanBarcode`, [
      { name: 'ScanBarcode', type: sql.NVarChar(70), value: ScanBarcode },
    ]);
    const materialResultExist = await executeQuery('EXEC Sp_SubMaterialMaster_GetAllby_OrderNo @OrderNumber', [
      {
        name: 'OrderNumber',
        type: sql.NVarChar,
        value: result[0].ORDER_NUMBER,
      },
    ]);
    res.json({
      PalletDetails: result[0],
      MaterialDetails: materialResultExist,
    });
  } catch (error) {
    console.error('Error fetching pallet barcode:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const updatePalletBarcode = async (req, res) => {
  const {
    ScanBarcode,
    PalletCount,
    PalletBy,
    Material,
    OrderNo,
    QtyInside,
    MaterialDescription,
    Batch,
    PrinterIp,
    Emp_ID,
    PackType,
    printerDpi,
  } = req.body;

  try {
    const [printerIP, printerPort] = PrinterIp.split(':');
    const portNumber = parseInt(printerPort) || 9100;
    const printerInRange = await isPrinterReachable(printerIP, portNumber);
    if (!printerInRange) {
      return res.status(200).json({ Status: 'F', Message: 'Printer out of range' });
    }
    const pcsInBoxResult = await executeQuery(`EXEC [dbo].[HHT_Pallet_DetailstoPrinting] @ORDER_NUMBER, @MATERIAL`, [
      {
        name: 'ORDER_NUMBER',
        type: sql.NVarChar(100),
        value: OrderNo.padStart(12, '0'),
      },
      {
        name: 'MATERIAL',
        type: sql.NVarChar(100),
        value: Material.padStart(18, '0'),
      },
    ]);

    const pcsInBox = Math.floor(pcsInBoxResult[0].NUMERATOR / pcsInBoxResult[0].DENOMINATOR);
    const decodedBarcodes = decodeURIComponent(ScanBarcode);
    const uniqueNoResult = await executeQuery(
      `EXEC [dbo].[HHT_FG_Pallet_GenrateUniqueNo] @Material, @OrderNo, @PalletCount`,
      [
        { name: 'Material', type: sql.NVarChar(100), value: Material },
        { name: 'OrderNo', type: sql.NVarChar(100), value: OrderNo },
        { name: 'PalletCount', type: sql.NVarChar(100), value: PalletCount },
      ]
    );
    const PalletBarcode = uniqueNoResult[0].PalletBarcode;
    const barcodes = decodedBarcodes.split('$');
    const firstSerialNumner = barcodes[0];

    for (let barcode of barcodes) {
      if (barcode.trim() !== '') {
        await executeQuery(
          `EXEC [dbo].[HHT_FG_Pallet_BarcodeUpdate]  @ScanBarcode, @PalletBarcode, @PalletBy,@Emp_ID, @PackType`,
          [
            {
              name: 'ScanBarcode',
              type: sql.NVarChar(70),
              value: barcode.trim(),
            },
            {
              name: 'PalletBarcode',
              type: sql.NVarChar(50),
              value: PalletBarcode,
            },
            { name: 'PalletBy', type: sql.NVarChar(20), value: PalletBy },
            { name: 'Emp_ID', type: sql.NVarChar(10), value: Emp_ID },
            { name: 'PackType', type: sql.NVarChar(10), value: PackType },
          ]
        );
      }
    }

    const getLineResult = await executeQuery(`EXEC [dbo].[HHT_FG_Pallet_GetLineNumber] @ScanBarcode`, [
      { name: 'ScanBarcode', type: sql.NVarChar, value: PalletBarcode },
    ]);

    const Line = getLineResult[0].Line;
    const palletNumber = PalletBarcode.split('|').pop().replace('FG', '');
    const printData = {
      Material,
      MaterialDescription,
      PalletCount,
      QtyInside,
      PalletBarcode,
      PcsPerPallet: QtyInside,
      PalletNumber: palletNumber,
      PcsPerBox: pcsInBox,
      Batch,
      Line: Line,
    };

    const prnFilePath = preparePrnFile(printData, printerDpi);

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
    res.json({
      Status: 'T',
      Message: `Successfully Palletization Done for the Scanned Barcode: ${PalletBarcode}`,
    });
  } catch (error) {
    console.error('Error updating pallet barcode:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const mergePallet = async (req, res) => {};

export const checkPalletAndSerial = async (req, res) => {
  const { PalletBarcode, SerialNo } = req.body;

  try {
    const result = await executeQuery(
      `EXEC [dbo].[HHT_FG_Relation_Pallet_Serial] 
             @PalletBarcode, 
             @SerialNo`,
      [
        { name: 'PalletBarcode', type: sql.NVarChar(50), value: PalletBarcode },
        { name: 'SerialNo', type: sql.NVarChar(50), value: SerialNo },
      ]
    );
    res.json(result[0]);
  } catch (error) {
    console.error('Error checking pallet and serial:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const updateBoxMergeWithoutPallet = async (req, res) => {
  const { PalletBarcode, SerialNo } = req.body;

  try {
    const result = await executeQuery(`EXEC [dbo].[HHT_BoxMerge_WithoutPallet_Update] @PalletBarcode, @SerialNo`, [
      { name: 'PalletBarcode', type: sql.NVarChar(50), value: PalletBarcode },
      { name: 'SerialNo', type: sql.NVarChar(70), value: SerialNo },
    ]);
    res.json(result[0]);
  } catch (error) {
    console.error('Error updating box merge without pallet:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const boxMergeWithPalletSerialValidation = async (req, res) => {
  const { ScanBarcode, StorageLocation, QCStatus, Material, Batch } = req.body;
  try {
    const result = await executeQuery(
      `EXEC [dbo].[HHT_BoxMerge_WithPallet_SerialValidation] 
            @ScanBarcode, 
            @StorageLocation, 
            @QCStatus, 
            @Material, 
            @Batch`,
      [
        { name: 'ScanBarcode', type: sql.NVarChar(50), value: ScanBarcode },
        {
          name: 'StorageLocation',
          type: sql.NVarChar(50),
          value: StorageLocation,
        },
        {
          name: 'QCStatus',
          type: sql.NVarChar(50),
          value: QCStatus === '' ? null : QCStatus,
        },
        {
          name: 'Material',
          type: sql.NVarChar(50),
          value: Material ? '00000000' + Material : null,
        },
        { name: 'Batch', type: sql.NVarChar(50), value: Batch },
      ]
    );
    res.json(result[0]);
  } catch (error) {
    console.error('Error validating box for merge:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const boxMergeWithPalletPalletValidation = async (req, res) => {
  const { ScanBarcode } = req.body;

  try {
    const result = await executeQuery(`EXEC [dbo].[HHT_BoxMerge_WithPallet_PalletValidation] @ScanBarcode`, [
      { name: 'ScanBarcode', type: sql.NVarChar(50), value: ScanBarcode },
    ]);

    const transformed = result.map(item => {
      const serialParts = (item.SerialNo || '').split('|');
      return {
        ...item,
        ORDER_NUMBER: item.ORDER_NUMBER ? item.ORDER_NUMBER.replace(/^0+/, '') : item.ORDER_NUMBER,
        MATERIAL: item.MATERIAL ? item.MATERIAL.replace(/^0+/, '') : item.MATERIAL,
        BoxNumber: serialParts.length > 3 ? serialParts[3] : null,
      };
    });

    res.json(transformed);
  } catch (error) {
    console.error('Error validating pallet for box merge:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const updateBoxMergeWithPallet = async (req, res) => {
  try {
    const { data, MergedBy } = req.body;

    if (!data || typeof data !== 'string' || !data.includes('$')) {
      return res.status(400).json({
        error: 'Invalid or missing data format. Expected format: PalletBarcode$Serial1$Serial2...',
      });
    }

    const parts = data.split('$');
    const PalletBarcode = parts[0];
    const SerialNumbers = parts.slice(1);

    if (!PalletBarcode || SerialNumbers.length === 0) {
      return res.status(400).json({ error: 'PalletBarcode or SerialNumbers missing' });
    }

    const results = [];
    let hasError = false;

    for (const SerialNo of SerialNumbers) {
      try {
        const result = await executeQuery(
          `EXEC [dbo].[HHT_BoxMerge_WithPallet_Update] @PalletBarcode, @SerialNo, @MergedBy`,
          [
            {
              name: 'PalletBarcode',
              type: sql.NVarChar(50),
              value: PalletBarcode,
            },
            { name: 'SerialNo', type: sql.NVarChar(70), value: SerialNo },
            { name: 'MergedBy', type: sql.NVarChar(50), value: MergedBy },
          ]
        );
        results.push(result[0]);
      } catch (err) {
        hasError = true;
        console.error(`Error processing SerialNo '${SerialNo}':`, err);
        results.push({ SerialNo, error: 'Failed to update this serial' });
      }
    }

    if (hasError) {
      return res.status(500).json({
        Status: 'F',
        Message: `Some serials failed to link for Pallet Barcode: ${PalletBarcode}`,
      });
    }

    res.json({
      Status: 'T',
      Message: `Box linking done successfully for Pallet Barcode: ${PalletBarcode}`,
    });
  } catch (error) {
    console.error('Unhandled error in updateBoxMergeWithPallet:', error);
    if (!res.headersSent) {
      res.status(500).json({ Status: 'F', error: 'Server error. Please check logs.' });
    }
  }
};

export const boxRemovalValidation = async (req, res) => {
  const { ScanBarcode } = req.body;

  try {
    const result = await executeQuery(`EXEC [dbo].[HHT_BoxRemovalValidation] @ScanBarcode`, [
      { name: 'ScanBarcode', type: sql.NVarChar(50), value: ScanBarcode },
    ]);
    if (result[0]) {
      result[0].ORDER_NUMBER = result[0].ORDER_NUMBER
        ? result[0].ORDER_NUMBER.replace(/^0+/, '')
        : result[0].ORDER_NUMBER;
      result[0].MATERIAL = result[0].MATERIAL ? result[0].MATERIAL.replace(/^0+/, '') : result[0].MATERIAL;
    }
    res.json(result[0]);
  } catch (error) {
    console.error('Error validating box removal:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};
export const updateBoxRemoval = async (req, res) => {
  const { ScanBarcode, RemovedBy } = req.body;

  try {
    const decodedBarcodes = decodeURIComponent(ScanBarcode);
    const barcodes = decodedBarcodes.split('$');

    for (let barcode of barcodes) {
      if (barcode.trim() !== '') {
        await executeQuery(`EXEC [dbo].[HHT_BoxRemovalUpdate] @ScanBarcode, @RemovedBy`, [
          {
            name: 'ScanBarcode',
            type: sql.NVarChar(50),
            value: barcode.trim(),
          },
          { name: 'RemovedBy', type: sql.NVarChar(50), value: RemovedBy },
        ]);
      }
    }

    res.json({
      Status: 'T',
      Message: 'Box removal completed successfully',
    });
  } catch (error) {
    console.error('Error updating box removal:', error);
    res.status(500).json({
      Status: 'F',
      Message: 'Failed to execute stored procedure',
    });
  }
};
