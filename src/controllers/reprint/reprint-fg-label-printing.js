import { executeQuery, sql } from '../../config/db.js';
import moment from 'moment';
import path from 'path';
import net from 'net';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const getFGLabelPrintData = async (req, res) => {
  const { OrderNo, Material, Batch, Line, Tank, Shift, FrmDate, ToDate } = req.body;

  try {
    const fgLabelPrintData = await executeQuery(
      'EXEC Sp_RePrint_FGLabelPrinting @OrderNo, @Material, @Batch, @Line , @Tank, @Shift , @FrmDate, @ToDate',
      [
        { name: 'OrderNo', type: sql.NVarChar, value: OrderNo },
        { name: 'Material', type: sql.NVarChar, value: Material },
        { name: 'Batch', type: sql.NVarChar, value: Batch },
        { name: 'Line', type: sql.NVarChar, value: Line },
        { name: 'Tank', type: sql.NVarChar, value: Tank },
        { name: 'Shift', type: sql.NVarChar, value: Shift },
        { name: 'FrmDate', type: sql.Date, value: FrmDate },
        { name: 'ToDate', type: sql.Date, value: ToDate },
      ]
    );

    res.json(fgLabelPrintData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

function isPrinterReachable(ip, port) {
  return new Promise(resolve => {
    const socket = new net.Socket();
    socket.setTimeout(3000);

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

    socket.connect(port, ip);
  });
}

export const insertFGLabelPrintingData = async (req, res) => {
  const {
    Order_Number,
    Material,
    Material_Text,
    Batch,
    Storage_Location,
    Target_Quantity,
    RePrintQty,
    RePrintBy,
    Print_Date,
    SerialNo,
    Qty,
    RePrintReason,
    Work_Center,
    Order_Type,
    Unit_ISO,
    PRINTER_IP,
    PrinterDpi,
    Shift,
    SorterNo,
  } = req.body;
  // return
  try {
    const [printerIP, printerPort] = PRINTER_IP.split(':');
    const printerInRange = await isPrinterReachable(printerIP, printerPort);
    if (!printerInRange) {
      return res.status(400).json({ error: 'Printer out of range' });
    }

    // Log the parameters being sent to the stored procedure
    const spParams = [
      { name: 'Order_Number', type: sql.NVarChar, value: Order_Number },
      { name: 'Material', type: sql.NVarChar, value: Material },
      { name: 'Material_Text', type: sql.NVarChar, value: Material_Text },
      { name: 'Batch', type: sql.NVarChar, value: Batch },
      { name: 'Storage_Location', type: sql.NVarChar, value: Storage_Location },
      {
        name: 'Target_Quantity',
        type: sql.NVarChar,
        value: String(Target_Quantity),
      },
      { name: 'RePrintQty', type: sql.NVarChar, value: RePrintQty },
      { name: 'RePrintBy', type: sql.NVarChar, value: RePrintBy },
      { name: 'SerialNo', type: sql.NVarChar, value: SerialNo },
      { name: 'Qty', type: sql.NVarChar, value: String(Qty) },
      { name: 'RePrintReason', type: sql.NVarChar, value: RePrintReason },
      { name: 'Work_Center', type: sql.NVarChar, value: Work_Center },
      { name: 'Order_Type', type: sql.NVarChar, value: Order_Type },
      { name: 'Unit_ISO', type: sql.NVarChar, value: Unit_ISO },
      { name: 'Shift', type: sql.NVarChar, value: Shift },
    ];

    // First, do the database insertion once
    const result = await executeQuery(
      'EXEC Sp_RePrint_InsertFGLabelPrintingData @Order_Number, @Material, @Material_Text, @Batch, @Storage_Location, @Target_Quantity, @RePrintQty, @RePrintBy, @SerialNo, @Qty, @RePrintReason, @Work_Center, @Order_Type, @Unit_ISO, @Shift',
      spParams
    );

    const dbResult = result[0];
    if (dbResult.Status === 'T') {
      const printCount = parseInt(RePrintQty, 10);
      if (isNaN(printCount) || printCount <= 0) {
        return res.status(400).json({ error: 'Invalid RePrintQty value' });
      }

      const boxNumber = SerialNo.split('|')[3];
      const printData = {
        VArticle: Material_Text,
        VItemCode: Material.replace(/^0+/, ''),
        VPacking: 'SAFE-PACK',
        VBatchNo: Batch,
        VShift: Shift,
        VSorter: SorterNo,
        VMfgDate: moment(Print_Date).format('DD-MM-YYYY'),
        VLine: Work_Center.slice(-2),
        VQty: Qty,
        VBoxNo: boxNumber,
        VPrintBy: RePrintBy,
        VBarcode: SerialNo,
      };

      // Now loop through the printing process
      for (let i = 0; i < printCount; i++) {
        try {
          const prnFilePath = preparePrnFile(printData, PrinterDpi);
          if (prnFilePath) {
            await printToTscPrinter(prnFilePath, printerIP, printerPort);
          }
        } catch (printError) {
          console.error(`Error printing label ${i + 1}:`, printError);
          throw new Error('Printing failed: ' + printError.message);
        }
      }

      res.json({ ...dbResult, printCount });
    } else {
      res.status(400).json({ Status: 'F', Message: 'Database insertion failed' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ Status: 'F', Message: error.message });
  }
};

function preparePrnFile(data, dpi) {
  const basePath = path.join(__dirname, '..', '..', 'prn-printer', 'box-label');
  const templatePath = `${basePath}${dpi === '200' ? '_200' : '_300'}.prn`;
  const tempPrnPath = path.join(__dirname, `temp_${Date.now()}.prn`);

  try {
    let template = fs.readFileSync(templatePath, 'utf-8');

    // Replace all variables in the PRN template
    Object.keys(data).forEach(key => {
      template = template.replace(new RegExp(key, 'g'), data[key]);
    });

    fs.writeFileSync(tempPrnPath, template);

    return tempPrnPath;
  } catch (error) {
    console.error('Error preparing PRN file:', error);
    if (fs.existsSync(tempPrnPath)) {
      fs.unlinkSync(tempPrnPath);
    }
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
        const fileContent = fs.readFileSync(prnFilePath);

        client.write(fileContent, err => {
          // Clean up the temporary file immediately after sending
          try {
            if (fs.existsSync(prnFilePath)) {
              fs.unlinkSync(prnFilePath);
            }
          } catch (cleanupError) {
            console.error('Error cleaning up temporary file:', cleanupError);
          }

          if (err) {
            console.error('Error sending print job:', err);
            reject(new Error('Failed to send print job. Please check printer connection.'));
          } else {
            resolve();
          }
          client.destroy();
        });
      } catch (readError) {
        client.destroy();
        reject(new Error('Failed to read print file: ' + readError.message));
      }
    });

    client.on('timeout', () => {
      console.error('Printer connection timeout');
      client.destroy();
      // Clean up on timeout
      try {
        if (fs.existsSync(prnFilePath)) {
          fs.unlinkSync(prnFilePath);
        }
      } catch (cleanupError) {
        console.error('Error cleaning up temporary file:', cleanupError);
      }
      reject(new Error('Printer is not in network. Please try again or update printer master.'));
    });

    client.on('error', err => {
      console.error('Printer connection error:', err);
      client.destroy();
      // Clean up on error
      try {
        if (fs.existsSync(prnFilePath)) {
          fs.unlinkSync(prnFilePath);
        }
      } catch (cleanupError) {
        console.error('Error cleaning up temporary file:', cleanupError);
      }
      reject(new Error('Printer is not in network. Please try again or update printer master.'));
    });
  });
}
