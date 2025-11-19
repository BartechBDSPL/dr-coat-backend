import { executeQuery, sql } from '../../config/db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import net from 'net';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Function to prepare PRN file content
function preparePrnFileRepacking(data, labelFile) {
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
function prepareFGLabelDataForCoatRepacking(reqData) {
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
async function batchPrintToTscPrinterRepacking(printJobs, printerIP, printerPort) {
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

export const validateRepacking = async (req, res) => {
  const { serial_no } = req.body;

  try {
    if (!serial_no) {
      return res.status(400).json({ 
        Status: 'F', 
        Message: 'Serial number is required' 
      });
    }

    const result = await executeQuery(
      `EXEC [dbo].[hht_item_repacking_validation] @serial_no`,
      [
        { name: 'serial_no', type: sql.NVarChar(255), value: serial_no },
      ]
    );

    if (result && result.length > 0) {
      res.json(result);
    } else {
      res.status(500).json({ 
        Status: 'F', 
        Message: 'No response from validation procedure' 
      });
    }
  } catch (error) {
    console.error('Error in repacking validation:', error);
    res.status(500).json({ 
      Status: 'F', 
      Message: `Failed to validate repacking: ${error.message}` 
    });
  }
};

export const updateRepacking = async (req, res) => {
  console.log('Starting repacking update process');
  const { 
    serial_no, 
    quantity, 
    repacking_by, 
    printer_ip,
    production_order_no,
    item_code,
    item_description,
    lot_no,
  } = req.body;

  console.log('Received request body:', {
    serial_no,
    quantity,
    repacking_by,
    printer_ip
  });

  try {
    // Validate input
    if (!serial_no || !quantity || !repacking_by) {
      console.error('Validation failed: Missing required fields');
      return res.status(400).json({ 
        Status: 'F', 
        Message: 'Missing required fields: serial_no, quantity, and repacking_by are required' 
      });
    }

    const numberResult = await executeQuery(`EXEC hht_repacking_get_number`, []);
    
    if (!numberResult || !numberResult[0] || numberResult[0].number === undefined) {
      return res.status(500).json({ 
        Status: 'F', 
        Message: 'Failed to get repacking number' 
      });
    }

    const repackingNumber = numberResult[0].number;

    const serialNos = serial_no.split('$').map(s => s.trim()).filter(s => s);
    const quantities = quantity.split('$').map(q => q.trim()).filter(q => q);

    if (serialNos.length !== quantities.length) {
      return res.status(400).json({ 
        Status: 'F', 
        Message: 'Number of serial numbers and quantities do not match' 
      });
    }

    if (serialNos.length === 0) {
         return res.status(400).json({ 
        Status: 'F', 
        Message: 'No serial numbers provided' 
      });
    }

    let totalQuantity = 0;
    for (const qty of quantities) {
      totalQuantity += parseFloat(qty);
    }

    const results = [];
    let allSuccess = true;
    let lastMessage = '';

    for (let i = 0; i < serialNos.length; i++) {
      const currentSerial = serialNos[i];
      const currentQuantity = parseFloat(quantities[i]);

      if (isNaN(currentQuantity) || currentQuantity <= 0) {
        return res.status(400).json({ 
          Status: 'F', 
          Message: `Invalid quantity '${quantities[i]}' for serial number '${currentSerial}'` 
        });
      }

      
      const result = await executeQuery(
        `EXEC hht_item_repacking_update @number, @serial_no, @quantity, @repacking_by`,
        [
          { name: 'number', type: sql.Int, value: repackingNumber },
          { name: 'serial_no', type: sql.NVarChar(255), value: currentSerial },
          { name: 'quantity', type: sql.Decimal(18,3), value: currentQuantity },
          { name: 'repacking_by', type: sql.NVarChar(50), value: repacking_by },
        ]
      );
      
      results.push(result[0]);

      if (result[0] && result[0].Status === 'F') {
        allSuccess = false;
        lastMessage = result[0].Message;
        return res.json({
          Status: 'F',
          Message: `Failed at serial '${currentSerial}': ${lastMessage}`
        });
      }
    }

    if (allSuccess) {
      console.log('Step 4: All items processed successfully, updating repacking number');
      const updateNumberResult = await executeQuery(`EXEC hht_repacking_number_update`, []);
      console.log('Repacking number update result:', updateNumberResult[0]);
    }

    if (printer_ip && allSuccess) {
      try {
        const [printerIP, printerPort] = printer_ip.split(':');

        const persistentFilePath = path.join(__dirname, 'fg_repacking_label_print.prn');

        const repackedSerialNo = `REPK-${repackingNumber}`;

        const prnData = prepareFGLabelDataForCoatRepacking({
          production_order_no: '',
          item_code: item_code || '',
          item_description: item_description || '',
          lot_no: lot_no || '',
          quantity: totalQuantity,
          serial_no: repackedSerialNo,
          printed_qty: totalQuantity,
          print_by: repacking_by,
        });

        const prnContent = preparePrnFileRepacking(prnData, 'DRCoatLabel_300.prn');
        if (!prnContent) {
          throw new Error('Failed to prepare PRN content');
        }

        fs.writeFileSync(persistentFilePath, prnContent);

        console.log('Print data for repacking label:', {
          production_order_no,
          item_description,
          lot_no,
          item_code,
          quantity: totalQuantity,
          serial_no: repackedSerialNo,
          printed_qty: totalQuantity,
          print_by: repacking_by,
        });

        // Send to printer
        await batchPrintToTscPrinterRepacking({ tempFilePath: persistentFilePath }, printerIP, printerPort || '9100');

        res.json({
          Status: 'T',
          Message: `Repacking done successfully for ${serialNos.length} item(s). Label printed with total quantity: ${totalQuantity}`,

        });
      } catch (printError) {
        console.error('Printing error:', printError);
        const errorMessage =
          printError.message === 'Printer not found'
            ? `Repacking done successfully for ${serialNos.length} item(s) but cannot find printer`
            : `Repacking done successfully for ${serialNos.length} item(s) but printing failed: ${printError.message}`;
        res.json({
          Status: 'T',
          Message: errorMessage,
          printed: false,
          total_quantity: totalQuantity
        });
      }
    } else {
      console.log('Repacking process completed successfully');
      res.json({
        Status: 'T',
        Message: `Repacking done successfully for ${serialNos.length} item(s)`,
        printed: false,
        total_quantity: totalQuantity
      });
    }

  } catch (error) {
    console.error('Error in repacking update:', error);
    res.status(500).json({ 
      Status: 'F', 
      Message: `Failed to update repacking: ${error.message}` 
    });
  }
};
