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

export const getReprintFgLabelDetails = async (req, res) => {
  const { production_order_no, item_code, item_description, lot_no, from_date, to_date } = req.body;

  try {
    const result = await executeQuery(
      `EXEC [dbo].[sp_reprint_fg_label_get_details] @production_order_no, @item_code, @item_description, @lot_no, @from_date, @to_date`,
      [
        { name: 'production_order_no', type: sql.NVarChar(50), value: production_order_no || null },
        { name: 'item_code', type: sql.NVarChar(50), value: item_code || null },
        { name: 'item_description', type: sql.NVarChar(200), value: item_description || null },
        { name: 'lot_no', type: sql.NVarChar(50), value: lot_no || null },
        { name: 'from_date', type: sql.NVarChar(10), value: from_date || null },
        { name: 'to_date', type: sql.NVarChar(10), value: to_date || null },
      ]
    );
    res.json(result);
  } catch (error) {
    console.error('Error getting reprint FG label details:', error);
    res.status(500).json({ error: 'Failed to get reprint FG label details' });
  }
};

export const insertReprintFgLabel = async (req, res) => {
  const {
    production_order_no,
    item_code,
    item_description,
    lot_no,
    customer_no,
    customer_name,
    finished_quantity,
    uom,
    quantity,
    serial_no,
    print_quantity,
    reprint_by,
    reprint_reason,
    printer_ip,
    dpi,
  } = req.body;
  console.log(req.body);
  try {
    const result = await executeQuery(
      `EXEC [dbo].[sp_reprint_fg_label_insert] @production_order_no, @item_code, @item_description, @lot_no, @customer_no, @customer_name, @finished_quantity, @uom, @quantity, @serial_no, @print_quantity, @reprint_by, @reprint_reason`,
      [
        { name: 'production_order_no', type: sql.NVarChar(50), value: production_order_no },
        { name: 'item_code', type: sql.NVarChar(50), value: item_code },
        { name: 'item_description', type: sql.NVarChar(200), value: item_description },
        { name: 'lot_no', type: sql.NVarChar(50), value: lot_no },
        { name: 'customer_no', type: sql.NVarChar(50), value: customer_no },
        { name: 'customer_name', type: sql.NVarChar(200), value: customer_name },
        { name: 'finished_quantity', type: sql.Decimal(18, 3), value: finished_quantity },
        { name: 'uom', type: sql.NVarChar(10), value: uom },
        { name: 'quantity', type: sql.Decimal(18, 3), value: quantity },
        { name: 'serial_no', type: sql.NVarChar(255), value: serial_no },
        { name: 'print_quantity', type: sql.Decimal(18, 3), value: print_quantity },
        { name: 'reprint_by', type: sql.NVarChar(50), value: reprint_by },
        { name: 'reprint_reason', type: sql.NVarChar(200), value: reprint_reason },
      ]
    );

    if (result[0].Status !== 'T') {
      return res.json(result[0]);
    }

    if (printer_ip) {
      try {
        const [printerIP, printerPort] = printer_ip.split(':');

        // Use a persistent file path - single file that gets overwritten each time
        const persistentFilePath = path.join(__dirname, 'reprint_fg_label_print_coat.prn');

        // Prepare PRN content for one print
        const prnData = prepareFGLabelDataForCoat({
          production_order_no,
          item_code,
          item_description,
          lot_no,
          quantity,
          serial_no,
          printed_qty: print_quantity,
          print_by: reprint_by,
        });

        const prnContent = preparePrnFileCoat(prnData, 'DRCoatLabel_300.prn');
        if (!prnContent) {
          throw new Error('Failed to prepare PRN content');
        }

        // Write the single PRN content to file
        fs.writeFileSync(persistentFilePath, prnContent);

        console.log('Print data for reprint label:', {
          production_order_no,
          item_description,
          lot_no,
          item_code,
          quantity,
          serial_no,
          printed_qty: print_quantity,
          print_by: reprint_by,
        });

        await batchPrintToTscPrinter({ tempFilePath: persistentFilePath }, printerIP, printerPort || '9100');

        res.status(200).json({
          ...result[0],
          printed: true,
          labels_count: 1,
        });
      } catch (printError) {
        console.error('Printing error:', printError);
        const errorMessage =
          printError.message === 'Printer not found'
            ? 'Cannot find printer but transaction performed successfully'
            : `Printing failed: ${printError.message}. Transaction performed successfully`;
        res.status(200).json({
          ...result[0],
          printed: false,
          error: errorMessage,
        });
      }
    } else {
      res.status(200).json({
        ...result[0],
        printed: false,
      });
    }
  } catch (error) {
    console.error('Error inserting reprint FG label:', error);
    res.status(500).json({ error: 'Failed to insert reprint FG label' });
  }
};

// Function to prepare PRN file content for coat labels
function preparePrnFileCoat(data, labelFile) {
  const basePath = path.join(__dirname, '..', '..', 'prn-printer');
  const templatePath = path.join(basePath, labelFile);

  try {
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template file not found: ${labelFile}`);
    }

    const contentBuffer = fs.readFileSync(templatePath);
    const bitmapMarker = Buffer.from('BITMAP');
    const bitmapStartIndex = contentBuffer.indexOf(bitmapMarker);

    if (bitmapStartIndex === -1) {
      // Fallback for templates without a BITMAP command
      let content = contentBuffer.toString('latin1');
      Object.keys(data).forEach(key => {
        const regex = new RegExp(key, 'g');
        const value = String(data[key] || '');
        content = content.replace(regex, value);
      });
      return Buffer.from(content, 'latin1');
    }

    // The text part of the template is everything after the binary data.
    const boxMarker = Buffer.from('BOX');
    const boxStartIndex = contentBuffer.indexOf(boxMarker, bitmapStartIndex);

    if (boxStartIndex === -1) {
      throw new Error('Could not find the BOX command after BITMAP.');
    }

    // The binary part is everything from BITMAP up to BOX.
    const binaryPartBuffer = contentBuffer.subarray(bitmapStartIndex, boxStartIndex);

    // The text parts are before BITMAP and from BOX to the end.
    const textPart1Buffer = contentBuffer.subarray(0, bitmapStartIndex);
    const textPart2Buffer = contentBuffer.subarray(boxStartIndex);

    let textPart1String = textPart1Buffer.toString('latin1');
    let textPart2String = textPart2Buffer.toString('latin1');

    // Replace variables in both text parts
    Object.keys(data).forEach(key => {
      const regex = new RegExp(key, 'g');
      const value = String(data[key] || '');
      textPart1String = textPart1String.replace(regex, value);
      textPart2String = textPart2String.replace(regex, value);
    });

    const modifiedTextPart1Buffer = Buffer.from(textPart1String, 'latin1');
    const modifiedTextPart2Buffer = Buffer.from(textPart2String, 'latin1');

    // Combine the parts back together
    return Buffer.concat([modifiedTextPart1Buffer, binaryPartBuffer, modifiedTextPart2Buffer]);
  } catch (error) {
    console.error('Error preparing PRN content:', error);
    throw error;
  }
}

// Function to prepare label data for DRCoatLabel_300.prn
function prepareFGLabelDataForCoat(reqData) {
  // Split item_description into two parts if needed
  const description = reqData.item_description || '';
  const maxLength = 40; // Assuming reasonable split
  const VItem_Description1 = description.length > maxLength ? description.substring(0, maxLength) : description;
  const VItem_Description2 = description.length > maxLength ? description.substring(maxLength) : '';

  return {
    VProduction_Order_No: reqData.production_order_no || '',
    VItem_Description1: VItem_Description1,
    VLot_No: reqData.lot_no || '',
    VItem_Code: reqData.item_code || '',
    VProduction_Quantity: String(reqData.quantity || ''),
    VSerial_No: reqData.serial_no || '',
    VItem_Description2: VItem_Description2,
    VPrinted_Quantity: String(reqData.printed_qty || ''),
    VPrinted_By: reqData.print_by || '',
  };
}

// Batch print function for TSC printer
async function batchPrintToTscPrinter(printJobs, printerIP, printerPort) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    // Set 2-second timeout for quick printer check
    client.setTimeout(2000);

    client.connect(
      {
        host: printerIP,
        port: parseInt(printerPort) || 9100,
      },
      async () => {
        try {
          // Read the persistent print file
          const combinedContent = fs.readFileSync(printJobs.tempFilePath);

          client.write(combinedContent, err => {
            if (err) {
              console.error('Error in batch printing:', err);
              reject(err);
            } else {
              // Don't delete the file - keep it for debugging and memory efficiency
              console.log(`Print job completed. File retained at: ${printJobs.tempFilePath}`);
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
      reject(new Error('Printer not found'));
    });

    client.on('timeout', () => {
      console.error('Printer connection timeout');
      client.destroy();
      reject(new Error('Printer not found'));
    });
  });
}
