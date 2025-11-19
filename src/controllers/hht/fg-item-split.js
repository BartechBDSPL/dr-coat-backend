import { executeQuery, sql } from '../../config/db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import net from 'net';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Function to prepare PRN file content
function preparePrnFileSplit(data, labelFile) {
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
function prepareFGLabelDataForCoatSplit(reqData) {
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
async function batchPrintToTscPrinterSplit(printJobs, printerIP, printerPort) {
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

export const validateItemSplit = async (req, res) => {
  const { serial_no } = req.body;
  try {
    const result = await executeQuery(`EXEC hht_item_split_validation @serial_no`, [
      { name: 'serial_no', type: sql.NVarChar(255), value: serial_no || null },
    ]);
    res.json(result);
  } catch (error) {
    console.error('Error validating item split:', error);
    res.status(500).json({ error: 'Failed to validate item split' });
  }
};

export const updateItemSplit = async (req, res) => {
  console.log('Starting item split update process');
  const {
    old_serial_no,
    new_serial_no,
    split_quantity,
    split_by,
    production_order_no,
    item_code,
    item_description,
    lot_no,
    finished_quantity,
    uom,
    quantity,
    warehouse_code,
    put_location,
    put_quantity,
    printer_ip,
  } = req.body;

  console.log('Received request body:', {
    old_serial_no,
    new_serial_no,
    split_quantity,
    split_by,
    production_order_no,
    item_code,
    lot_no,
    printer_ip,
  });

  try {
    // Split the new_serial_no and split_quantity by '$'
    const newSerialNos = new_serial_no.split('$');
    const splitQuantities = split_quantity.split('$');

    console.log('Split serial numbers:', newSerialNos);
    console.log('Split quantities:', splitQuantities);

    // Validate that arrays have the same length
    if (newSerialNos.length !== splitQuantities.length) {
      console.error('Validation failed: Number of serial numbers and quantities do not match');
      return res.status(400).json({
        Status: 'F',
        Message: 'Number of serial numbers and quantities do not match',
      });
    }

    console.log(`Processing ${newSerialNos.length} splits`);
    const results = [];
    let allSuccess = true;

    // Loop through each split and call the SP
    for (let i = 0; i < newSerialNos.length; i++) {
      console.log(
        `Processing split ${i + 1}/${newSerialNos.length}: Serial=${newSerialNos[i].trim()}, Quantity=${splitQuantities[i].trim()}`
      );

      const result = await executeQuery(
        `EXEC hht_item_split_update @old_serial_no, @new_serial_no, @split_quantity, @split_by, @production_order_no, @item_code, @item_description, @lot_no, @finished_quantity, @uom, @quantity, @warehouse_code, @put_location, @put_quantity`,
        [
          { name: 'old_serial_no', type: sql.NVarChar(255), value: old_serial_no || '' },
          { name: 'new_serial_no', type: sql.NVarChar(255), value: newSerialNos[i].trim() || '' },
          { name: 'split_quantity', type: sql.Decimal(18, 3), value: parseFloat(splitQuantities[i].trim()) || 0 },
          { name: 'split_by', type: sql.NVarChar(50), value: split_by || '' },
          { name: 'production_order_no', type: sql.NVarChar(50), value: production_order_no || '' },
          { name: 'item_code', type: sql.NVarChar(50), value: item_code || '' },
          { name: 'item_description', type: sql.NVarChar(200), value: item_description || '' },
          { name: 'lot_no', type: sql.NVarChar(50), value: lot_no || '' },
          { name: 'finished_quantity', type: sql.Decimal(18, 3), value: finished_quantity || 0 },
          { name: 'uom', type: sql.NVarChar(10), value: uom || '' },
          { name: 'quantity', type: sql.Decimal(18, 3), value: quantity || 0 },
          { name: 'warehouse_code', type: sql.NVarChar(50), value: warehouse_code || '' },
          { name: 'put_location', type: sql.NVarChar(50), value: put_location || '' },
          { name: 'put_quantity', type: sql.Decimal(18, 3), value: put_quantity || 0 },
        ]
      );

      console.log(`Split ${i + 1} result:`, result[0]);
      results.push(result[0]);

      // Check if this operation failed
      if (result[0] && result[0].Status === 'F') {
        allSuccess = false;
        return res.json({
          Status: 'F',
          Message: result[0].Message || `Failed at serial '${newSerialNos[i].trim()}'`,
        });
      }
    }

    // If printer_ip is provided and all splits succeeded, print labels
    if (printer_ip && allSuccess) {
      try {
        const [printerIP, printerPort] = printer_ip.split(':');
        const persistentFilePath = path.join(__dirname, 'fg_item_split_label_print.prn');
        const prnBuffers = [];

        // Print one label for each new serial number
        for (let i = 0; i < newSerialNos.length; i++) {
          const prnData = prepareFGLabelDataForCoatSplit({
            production_order_no: production_order_no || '',
            item_code: item_code || '',
            item_description: item_description || '',
            lot_no: lot_no || '',
            quantity: parseFloat(splitQuantities[i].trim()) || 0,
            serial_no: newSerialNos[i].trim() || '',
            printed_qty: parseFloat(splitQuantities[i].trim()) || 0,
            print_by: split_by || '',
          });

          const prnContent = preparePrnFileSplit(prnData, 'DRCoatLabel_300.prn');
          if (!prnContent) {
            throw new Error('Failed to prepare PRN content');
          }
          prnBuffers.push(prnContent);
        }

        // Combine all buffers and write to persistent file
        const combinedBuffer = Buffer.concat(prnBuffers);
        fs.writeFileSync(persistentFilePath, combinedBuffer);

        console.log('Print data for split labels:', {
          production_order_no,
          item_description,
          lot_no,
          item_code,
          new_serial_numbers: newSerialNos,
          split_quantities: splitQuantities,
          split_by,
        });

        // Send to printer
        await batchPrintToTscPrinterSplit({ tempFilePath: persistentFilePath }, printerIP, printerPort || '9100');

        console.log('All splits completed successfully with printing');
        res.json({
          Status: 'T',
          Message: `Item split completed successfully for ${newSerialNos.length} item(s). Labels printed.`,
          printed: true,
          labels_count: newSerialNos.length,
        });
      } catch (printError) {
        console.error('Printing error:', printError);
        const errorMessage =
          printError.message === 'Printer not found'
            ? `Item split completed successfully for ${newSerialNos.length} item(s) but cannot find printer`
            : `Item split completed successfully for ${newSerialNos.length} item(s) but printing failed: ${printError.message}`;
        res.json({
          Status: 'T',
          Message: errorMessage,
          printed: false,
        });
      }
    } else {
      console.log('All splits completed successfully');
      res.json({
        Status: 'T',
        Message: `Item split completed successfully for ${newSerialNos.length} item(s)`,
        printed: false,
      });
    }
  } catch (error) {
    console.error('Error updating item split:', error);
    res.status(500).json({
      Status: 'F',
      Message: `Failed to update item split: ${error.message}`,
    });
  }
};
