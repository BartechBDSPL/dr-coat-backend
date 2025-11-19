import { executeQuery, sql } from '../../config/db.js';
import axios from 'axios';
import { ODATA_BASE_URL, ODATA_USERNAME, ODATA_PASSWORD } from '../../utils/constants.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import net from 'net';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Function to prepare PRN file content
function preparePrnFile(data, labelFile) {
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

export const upsertProductionOrder = async (req, res) => {
  const {
    qc_status,
    production_order_no,
    line_no,
    item_code,
    item_description,
    quantity,
    customer_no,
    customer_name,
    due_date,
    location_code,
    starting_date,
    ending_date,
    uom_code,
    remaining_quantity,
    finished_quantity,
    sub_contracting_order_no,
    sub_contractor_code,
    entry_no,
    lot_no,
    created_by,
  } = req.body;

  try {
    const result = await executeQuery(
      `EXEC [dbo].[sp_production_order_upsert] @qc_status, @production_order_no, @line_no, @item_code, @item_description, @quantity, @customer_no, @customer_name, @due_date, @location_code, @starting_date, @ending_date, @uom_code, @remaining_quantity, @finished_quantity, @sub_contracting_order_no, @sub_contractor_code, @entry_no, @lot_no, @created_by`,
      [
        { name: 'qc_status', type: sql.NVarChar(50), value: qc_status },
        { name: 'production_order_no', type: sql.NVarChar(50), value: production_order_no },
        { name: 'line_no', type: sql.NVarChar(20), value: line_no },
        { name: 'item_code', type: sql.NVarChar(50), value: item_code },
        { name: 'item_description', type: sql.NVarChar(200), value: item_description },
        { name: 'quantity', type: sql.Decimal(18, 3), value: quantity },
        { name: 'customer_no', type: sql.NVarChar(50), value: customer_no },
        { name: 'customer_name', type: sql.NVarChar(200), value: customer_name },
        { name: 'due_date', type: sql.NVarChar(10), value: due_date },
        { name: 'location_code', type: sql.NVarChar(10), value: location_code },
        { name: 'starting_date', type: sql.NVarChar(10), value: starting_date },
        { name: 'ending_date', type: sql.NVarChar(10), value: ending_date },
        { name: 'uom_code', type: sql.NVarChar(10), value: uom_code },
        { name: 'remaining_quantity', type: sql.Decimal(18, 3), value: remaining_quantity },
        { name: 'finished_quantity', type: sql.Decimal(18, 3), value: finished_quantity },
        { name: 'sub_contracting_order_no', type: sql.NVarChar(50), value: sub_contracting_order_no },
        { name: 'sub_contractor_code', type: sql.NVarChar(50), value: sub_contractor_code },
        { name: 'entry_no', type: sql.NVarChar(50), value: entry_no },
        { name: 'lot_no', type: sql.NVarChar(50), value: lot_no },
        { name: 'created_by', type: sql.NVarChar(50), value: created_by },
      ]
    );
    res.json(result);
  } catch (error) {
    console.error('Error upserting production order:', error);
    res.status(500).json({ error: 'Failed to upsert production order' });
  }
};

export const getProductionOrderDetails = async (req, res) => {
  const { production_order_no, created_by } = req.body;

  try {
    // Update open time first

    let result = await executeQuery(`EXEC [dbo].[sp_production_order_get_details] @production_order_no`, [
      { name: 'production_order_no', type: sql.NVarChar(50), value: production_order_no },
    ]);
    console.log(result);
    if (result && result.length > 0 && result[0].printed_qty !== null) {
      if (result[0].Status === 'T') {
        await updateProductionOrderOpenTime(production_order_no);
      }
      if (result[0].remaining_qty === 0) {
        return res.json({ Status: 'F', Message: 'Printing done for this order number.' });
      }
      return res.json(result[0]);
    }

    // If result is empty or printed_qty is null, fetch from SAP OData
    const sapUrl = `${ODATA_BASE_URL}/DR_UAT/ODataV4/Company('DRC UAT 05032024')/ReleasedProdOrderWMS?$filter=Prod_Order_No eq '${encodeURIComponent(production_order_no)}'`;
    const sapResponse = await axios.get(sapUrl, {
      auth: {
        username: ODATA_USERNAME,
        password: ODATA_PASSWORD,
      },
    });
    const erpData = sapResponse.data.value;

    if (!erpData || erpData.length === 0) {
      return res.json({ Status: 'F', Message: 'Production order not found in ERP' });
    }

    const item = erpData[0];
    // Fetch lot no tracking for entry_no and lot_no
    const lotUrl = `${ODATA_BASE_URL}/DR_UAT/ODataV4/Company('DRC UAT 05032024')/LotNoTrackingWMS?$filter=Order_No eq '${encodeURIComponent(production_order_no)}'`;
    const lotResponse = await axios.get(lotUrl, {
      auth: {
        username: ODATA_USERNAME,
        password: ODATA_PASSWORD,
      },
    });
    const lotData = lotResponse.data.value;

    if (!lotData || lotData.length === 0) {
      return res.json({ Status: 'F', Message: 'Lot number tracking not found for this production order' });
    }

    const lotItem = lotData[0];

    // Call upsert with ERP data
    await executeQuery(
      `EXEC [dbo].[sp_production_order_upsert] @qc_status, @production_order_no, @line_no, @item_code, @item_description, @quantity, @customer_no, @customer_name, @due_date, @location_code, @starting_date, @ending_date, @uom_code, @remaining_quantity, @finished_quantity, @sub_contracting_order_no, @sub_contractor_code, @entry_no, @lot_no, @created_by`,
      [
        { name: 'qc_status', type: sql.NVarChar(50), value: item.Status },
        { name: 'production_order_no', type: sql.NVarChar(50), value: item.Prod_Order_No },
        { name: 'line_no', type: sql.NVarChar(20), value: item.Line_No.toString() },
        { name: 'item_code', type: sql.NVarChar(50), value: item.Item_No },
        { name: 'item_description', type: sql.NVarChar(200), value: item.Description },
        { name: 'quantity', type: sql.Decimal(18, 3), value: item.Quantity },
        { name: 'customer_no', type: sql.NVarChar(50), value: item.CustomerNo },
        { name: 'customer_name', type: sql.NVarChar(200), value: item.CustomerName },
        { name: 'due_date', type: sql.NVarChar(10), value: item.Due_Date },
        { name: 'location_code', type: sql.NVarChar(10), value: item.Location_Code },
        { name: 'starting_date', type: sql.NVarChar(10), value: item.Starting_Date },
        { name: 'ending_date', type: sql.NVarChar(10), value: item.Ending_Date },
        { name: 'uom_code', type: sql.NVarChar(10), value: item.Unit_of_Measure_Code },
        { name: 'remaining_quantity', type: sql.Decimal(18, 3), value: item.Remaining_Quantity },
        { name: 'finished_quantity', type: sql.Decimal(18, 3), value: item.Finished_Quantity },
        { name: 'sub_contracting_order_no', type: sql.NVarChar(50), value: item.Subcontracting_Order_No },
        { name: 'sub_contractor_code', type: sql.NVarChar(50), value: item.Subcontractor_Code },
        { name: 'entry_no', type: sql.NVarChar(50), value: lotItem.Entry_No ? lotItem.Entry_No.toString() : '' },
        { name: 'lot_no', type: sql.NVarChar(50), value: lotItem.lotNo || '' },
        { name: 'created_by', type: sql.NVarChar(50), value: created_by }, // Default
      ]
    );

    // Now get details again
    result = await executeQuery(`EXEC [dbo].[sp_production_order_get_details] @production_order_no`, [
      { name: 'production_order_no', type: sql.NVarChar(50), value: production_order_no },
    ]);

    if (result && result.length > 0 && result[0].Status === 'T') {
      await updateProductionOrderOpenTime(production_order_no);
    }

    if (result[0].remaining_qty === 0) {
      return res.json({ Status: 'F', Message: 'Printing done for this order number.' });
    }

    res.json(result[0]);
  } catch (error) {
    console.error('Error getting production order details:', error);
    res.status(500).json({ error: 'Failed to get production order details' });
  }
};

export const getRecentProductionOrders = async (req, res) => {
  try {
    const result = await executeQuery(`EXEC [dbo].[sp_production_order_get_recent]`, []);
    res.json(result);
  } catch (error) {
    console.error('Error getting recent production orders:', error);
    res.status(500).json({ error: 'Failed to get recent production orders' });
  }
};

export const updateProductionOrderOpenTime = async production_order_no => {
  try {
    await executeQuery(`EXEC [dbo].[sp_production_order_no_open_time_update] @production_order_no`, [
      { name: 'production_order_no', type: sql.NVarChar(50), value: production_order_no },
    ]);
    return { Status: 'T', Message: 'Open time updated successfully' };
  } catch (error) {
    console.error('Error updating production order open time:', error);
    throw error;
  }
};

export const findSrNo = async (req, res) => {
  const { production_order_no, item_code, lot_no } = req.body;

  try {
    const result = await executeQuery(
      `EXEC [dbo].[sp_fg_label_sr_no_find_sr_no] @production_order_no, @item_code, @lot_no`,
      [
        { name: 'production_order_no', type: sql.NVarChar(50), value: production_order_no },
        { name: 'item_code', type: sql.NVarChar(50), value: item_code },
        { name: 'lot_no', type: sql.NVarChar(50), value: lot_no },
      ]
    );
    res.json(result[0]);
  } catch (error) {
    console.error('Error finding SR number:', error);
    res.status(500).json({ error: 'Failed to find SR number' });
  }
};

export const updateProductionOrderLabelCount = async (req, res) => {
  const { production_order_no, item_code, lot_no, printed_label, remaining_label } = req.body;

  try {
    const result = await executeQuery(
      `EXEC [dbo].[sp_production_order_label_count_update] @production_order_no, @item_code, @lot_no, @printed_label, @remaining_label`,
      [
        { name: 'production_order_no', type: sql.NVarChar(50), value: production_order_no },
        { name: 'item_code', type: sql.NVarChar(50), value: item_code },
        { name: 'lot_no', type: sql.NVarChar(50), value: lot_no },
        { name: 'printed_label', type: sql.Int, value: printed_label },
        { name: 'remaining_label', type: sql.Int, value: remaining_label },
      ]
    );
    res.json(result);
  } catch (error) {
    console.error('Error updating production order label count:', error);
    res.status(500).json({ error: 'Failed to update label count' });
  }
};

export const insertFgLabelPrinting = async (req, res) => {
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
    print_by,
    print_quantity,
    mfg_date,
    exp_date,
    printed_qty,
    remaining_qty,
    printer_ip,
    dpi,
  } = req.body;

  console.log(req.body);
  try {
    const serialNos = serial_no.split('$').filter(s => s.trim());
    const printQuantities = print_quantity.split('$').filter(q => q.trim());

    if (serialNos.length !== printQuantities.length) {
      return res.status(400).json({ Status: 'F', Message: 'Serial numbers and print quantities count mismatch' });
    }

    const results = [];

    for (let i = 0; i < serialNos.length; i++) {
      const result = await executeQuery(
        `EXEC [dbo].[sp_fg_label_printing_insert] @production_order_no, @item_code, @item_description, @lot_no, @customer_no, @customer_name, @finished_quantity, @uom, @quantity, @serial_no, @print_by, @print_quantity, @mfg_date, @exp_date`,
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
          { name: 'serial_no', type: sql.NVarChar(255), value: serialNos[i] },
          { name: 'print_by', type: sql.NVarChar(50), value: print_by },
          { name: 'print_quantity', type: sql.Decimal(18, 3), value: parseFloat(printQuantities[i]) },
          { name: 'mfg_date', type: sql.DateTime, value: mfg_date },
          { name: 'exp_date', type: sql.DateTime, value: exp_date },
        ]
      );

      if (result[0].Status === 'F') {
        return res.json(result[0]);
      }

      results.push(result[0]);
    }

    // Call the upsert procedure after all inserts are completed
    const upsertResult = await executeQuery(
      `EXEC [dbo].[sp_fg_label_sr_no_upsert] @production_order_no, @item_code, @lot_no, @generated_sr_no`,
      [
        { name: 'production_order_no', type: sql.NVarChar(50), value: production_order_no },
        { name: 'item_code', type: sql.NVarChar(50), value: item_code },
        { name: 'lot_no', type: sql.NVarChar(50), value: lot_no },
        { name: 'generated_sr_no', type: sql.Int, value: serialNos.length },
      ]
    );

    if (upsertResult[0].Status !== 'T') {
      return res.status(500).json({ error: 'Failed to update SR number' });
    }

    // Call the update label quantity procedure
    console.log('Parameters for sp_production_order_label_qty_update:', [
      { name: 'production_order_no', type: sql.NVarChar(50), value: production_order_no },
      { name: 'item_code', type: sql.NVarChar(50), value: item_code },
      { name: 'lot_no', type: sql.NVarChar(50), value: lot_no },
      { name: 'printed_qty', type: sql.Decimal(18, 3), value: printed_qty },
      { name: 'remaining_qty', type: sql.Decimal(18, 3), value: remaining_qty },
    ]);
    const updateQtyResult = await executeQuery(
      `EXEC [dbo].[sp_production_order_label_qty_update] @production_order_no, @item_code, @lot_no, @printed_qty, @remaining_qty`,
      [
        { name: 'production_order_no', type: sql.NVarChar(50), value: production_order_no },
        { name: 'item_code', type: sql.NVarChar(50), value: item_code },
        { name: 'lot_no', type: sql.NVarChar(50), value: lot_no },
        { name: 'printed_qty', type: sql.Decimal(18, 3), value: printed_qty },
        { name: 'remaining_qty', type: sql.Decimal(18, 3), value: remaining_qty },
      ]
    );

    if (updateQtyResult[0].Status !== 'T') {
      return res.status(500).json({ error: updateQtyResult[0].Message || 'Failed to update label quantity' });
    }

    // If printer_ip is provided, proceed with printing
    if (printer_ip) {
      try {
        // Extract printer IP and port
        const [printerIP, printerPort] = printer_ip.split(':');

        // Use a persistent file path - single file that gets overwritten each time
        const persistentFilePath = path.join(__dirname, 'fg_label_print_coat.prn');
        const prnBuffers = [];

        // Prepare PRN content for each serial number
        for (let i = 0; i < serialNos.length; i++) {
          const prnData = prepareFGLabelDataForCoat({
            production_order_no,
            item_code,
            item_description,
            lot_no,
            quantity,
            serial_no: serialNos[i].trim(),
            printed_qty: parseFloat(printQuantities[i]),
            print_by,
          });

          const prnContent = preparePrnFile(prnData, 'DRCoatLabel_300.prn');
          if (!prnContent) {
            throw new Error('Failed to prepare PRN content');
          }
          prnBuffers.push(prnContent);
        }

        // Combine all buffers and overwrite the persistent file
        const combinedBuffer = Buffer.concat(prnBuffers);
        fs.writeFileSync(persistentFilePath, combinedBuffer);

        // Debug: Log the data being replaced
        console.log('Print data for first label:', {
          production_order_no,
          item_description,
          lot_no,
          item_code,
          quantity,
          serial_no: serialNos[0].trim(),
          printed_qty,
          print_by,
        });

        // Send to printer using batch print function
        await batchPrintToTscPrinter({ tempFilePath: persistentFilePath }, printerIP, printerPort || '9100');

        res.status(200).json({
          Status: 'T',
          Message: `Inserted and printed ${serialNos.length} labels successfully`,
          printed: true,
          labels_count: serialNos.length,
        });
      } catch (printError) {
        console.error('Printing error:', printError);
        const errorMessage =
          printError.message === 'Printer not found'
            ? 'Cannot find printer but transaction performed successfully'
            : `Printing failed: ${printError.message}. Transaction performed successfully`;
        res.status(200).json({
          Status: 'T',
          Message: errorMessage,
          printed: false,
        });
      }
    } else {
      res.status(200).json({
        Status: 'T',
        Message: `Inserted ${serialNos.length} records`,
        printed: false,
      });
    }
  } catch (error) {
    console.error('Error inserting FG label printing:', error);
    res.status(500).json({ error: 'Failed to insert FG label printing' });
  }
};
