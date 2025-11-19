import { executeQuery, sql } from '../../config/db.js';
import multer from 'multer';
import xlsx from 'xlsx';
import path from 'path';
import fs from 'fs';
import net from 'net';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
  },
});

const fileFilter = (req, file, cb) => {
  const allowedFileTypes = ['.xlsx', '.xls'];
  const extname = path.extname(file.originalname).toLowerCase();
  if (allowedFileTypes.includes(extname)) {
    cb(null, true);
  } else {
    cb(new Error('Only Excel files are allowed!'), false);
  }
};

// Initialize upload middleware
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
}).single('excelFile');

// Upload existing data from Excel file
export const uploadExistingData = async (req, res) => {
  try {
    upload(req, res, async function (err) {
      if (err) {
        return res.status(400).json({
          Status: 'F',
          Message: err.message,
        });
      }

      // Check if file exists
      if (!req.file) {
        return res.status(400).json({
          Status: 'F',
          Message: 'Please upload an Excel file',
        });
      }

      const filePath = req.file.path;

      try {
        // Read the Excel file
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(worksheet);

        if (data.length === 0) {
          fs.unlinkSync(filePath);
          return res.status(400).json({
            Status: 'F',
            Message: 'Excel file is empty',
          });
        }

        // Check if required headers exist
        const requiredHeaders = [
          'item_code',
          'item_description',
          'lot_no',
          'mfg_date',
          'exp_date',
          'quantity',
        ];

        const fileHeaders = Object.keys(data[0]);
        const missingHeaders = requiredHeaders.filter(header => !fileHeaders.includes(header));

        if (missingHeaders.length > 0) {
          fs.unlinkSync(filePath);
          return res.status(400).json({
            Status: 'F',
            Message: `Missing required headers: ${missingHeaders.join(', ')}`,
          });
        }

        const results = {
          success: [],
          failure: [],
        };

        const uploadedBy = req.body.uploaded_by || 'System';
        const printStatus = req.body.print_status || 'Open';

        // Process data in chunks
        const chunkArray = (array, chunkSize) => {
          const chunks = [];
          for (let i = 0; i < array.length; i += chunkSize) {
            chunks.push(array.slice(i, i + chunkSize));
          }
          return chunks;
        };

        const CHUNK_SIZE = 50;
        const dataChunks = chunkArray(data, CHUNK_SIZE);

        for (const chunk of dataChunks) {
          const chunkPromises = chunk.map(async row => {
            try {
              const itemCode = row['item_code'];
              const itemDescription = row['item_description'];
              const lotNo = row['lot_no'];
              const mfgDate = row['mfg_date'] ? new Date(row['mfg_date']) : null;
              const expDate = row['exp_date'] ? new Date(row['exp_date']) : null;
              const quantity = row['quantity'] || 0;

              const result = await executeQuery(
                'EXEC sp_existing_data_upload_update @item_code, @item_description, @lot_no, @mfg_date, @exp_date, @quantity, @print_status, @uploaded_by',
                [
                  { name: 'item_code', type: sql.NVarChar, value: itemCode },
                  { name: 'item_description', type: sql.NVarChar, value: itemDescription },
                  { name: 'lot_no', type: sql.NVarChar, value: lotNo },
                  { name: 'mfg_date', type: sql.DateTime, value: mfgDate },
                  { name: 'exp_date', type: sql.DateTime, value: expDate },
                  { name: 'quantity', type: sql.Decimal(18, 3), value: quantity },
                  { name: 'print_status', type: sql.NVarChar, value: printStatus },
                  { name: 'uploaded_by', type: sql.NVarChar, value: uploadedBy },
                ]
              );

              if (result && result.length > 0) {
                const spResult = result[0];
                return {
                  row,
                  Status: spResult.Status,
                  Message: spResult.Message || 'Operation successful',
                };
              } else {
                return {
                  row,
                  Status: 'F',
                  Message: 'No result returned from stored procedure',
                };
              }
            } catch (error) {
              return {
                row,
                Status: 'F',
                Message: error.message,
              };
            }
          });

          const chunkResults = await Promise.all(chunkPromises);

          // Categorize the results
          chunkResults.forEach(result => {
            if (result.Status === 'T') {
              results.success.push({
                row: result.row,
                message: result.Message,
              });
            } else {
              results.failure.push({
                row: result.row,
                message: result.Message,
              });
            }
          });
        }

        // Delete the file after processing
        fs.unlinkSync(filePath);

        return res.status(200).json({
          Status: 'T',
          Message: 'Excel file processed successfully',
          results: {
            totalProcessed: data.length,
            successCount: results.success.length,
            failureCount: results.failure.length,
            successData: results.success,
            failureData: results.failure,
          },
        });
      } catch (error) {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }

        return res.status(500).json({
          Status: 'F',
          Message: 'Error processing Excel file',
          error: error.message,
        });
      }
    });
  } catch (error) {
    return res.status(500).json({
      Status: 'F',
      Message: 'Server error',
      error: error.message,
    });
  }
};

// Get all item codes with open print status
export const getItemCodes = async (req, res) => {
  try {
    const result = await executeQuery('EXEC sp_existing_data_upload_get_item_code', []);
    return res.status(200).json({
      Status: 'T',
      Message: 'Item codes retrieved successfully',
      data: result,
    });
  } catch (error) {
    return res.status(500).json({
      Status: 'F',
      Message: 'Error retrieving item codes',
      error: error.message,
    });
  }
};

// Get lot numbers for a specific item code
export const getLotNumbers = async (req, res) => {
  try {
    const { item_code } = req.body;

    if (!item_code) {
      return res.status(400).json({
        Status: 'F',
        Message: 'item_code is required',
      });
    }

    const result = await executeQuery('EXEC sp_existing_data_upload_get_lot_no @item_code', [
      { name: 'item_code', type: sql.NVarChar, value: item_code },
    ]);

    return res.status(200).json({
      Status: 'T',
      Message: 'Lot numbers retrieved successfully',
      data: result,
    });
  } catch (error) {
    return res.status(500).json({
      Status: 'F',
      Message: 'Error retrieving lot numbers',
      error: error.message,
    });
  }
};

// Get details for a specific item code and lot number
export const getDetails = async (req, res) => {
  try {
    const { item_code, lot_no } = req.body;

    if (!item_code || !lot_no) {
      return res.status(400).json({
        Status: 'F',
        Message: 'item_code and lot_no are required',
      });
    }

    const result = await executeQuery(
      'EXEC sp_existing_data_upload_get_details @item_code, @lot_no',
      [
        { name: 'item_code', type: sql.NVarChar, value: item_code },
        { name: 'lot_no', type: sql.NVarChar, value: lot_no },
      ]
    );

    if (result && result.length > 0) {
      return res.status(200).json({
        Status: 'T',
        Message: 'Details retrieved successfully',
        data: result[0],
      });
    } else {
      return res.status(404).json({
        Status: 'F',
        Message: 'No data found for the given item_code and lot_no',
      });
    }
  } catch (error) {
    return res.status(500).json({
      Status: 'F',
      Message: 'Error retrieving details',
      error: error.message,
    });
  }
};

// Upsert serial number
export const upsertSerialNumber = async (req, res) => {
  try {
    const { item_code, lot_no, generated_sr_no } = req.body;

    if (!item_code || !lot_no || !generated_sr_no) {
      return res.status(400).json({
        Status: 'F',
        Message: 'item_code, lot_no, and generated_sr_no are required',
      });
    }

    const result = await executeQuery(
      'EXEC sp_existing_data_upload_sr_no_upsert @item_code, @lot_no, @generated_sr_no',
      [
        { name: 'item_code', type: sql.NVarChar, value: item_code },
        { name: 'lot_no', type: sql.NVarChar, value: lot_no },
        { name: 'generated_sr_no', type: sql.Int, value: generated_sr_no },
      ]
    );

    if (result && result.length > 0) {
      const spResult = result[0];
      return res.status(200).json({
        Status: spResult.Status,
        Message: spResult.Status === 'T' ? 'Serial number updated successfully' : 'Failed to update serial number',
      });
    } else {
      return res.status(500).json({
        Status: 'F',
        Message: 'No result returned from stored procedure',
      });
    }
  } catch (error) {
    return res.status(500).json({
      Status: 'F',
      Message: 'Error updating serial number',
      error: error.message,
    });
  }
};

// Find serial number
export const findSerialNumber = async (req, res) => {
  try {
    const { item_code, lot_no } = req.body;

    if (!item_code || !lot_no) {
      return res.status(400).json({
        Status: 'F',
        Message: 'item_code and lot_no are required',
      });
    }

    const result = await executeQuery(
      'EXEC sp_existing_data_upload_sr_no_find_sr_no @item_code, @lot_no',
      [
        { name: 'item_code', type: sql.NVarChar, value: item_code },
        { name: 'lot_no', type: sql.NVarChar, value: lot_no },
      ]
    );

    if (result && result.length > 0) {
      return res.status(200).json({
        Status: 'T',
        Message: 'Serial number retrieved successfully',
        data: result[0],
      });
    } else {
      return res.status(404).json({
        Status: 'F',
        Message: 'No serial number found',
      });
    }
  } catch (error) {
    return res.status(500).json({
      Status: 'F',
      Message: 'Error retrieving serial number',
      error: error.message,
    });
  }
};

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
        content = content.replace(regex, String(data[key] || ''));
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
          for (const job of printJobs) {
            client.write(job);
            // Small delay between jobs to prevent buffer overflow on printer
            await new Promise(r => setTimeout(r, 100));
          }
          client.end();
          resolve();
        } catch (error) {
          console.error('Error sending data to printer:', error);
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

// Insert existing data label printing
export const insertExistingDataLabelPrinting = async (req, res) => {
  const {
    item_code,
    item_description,
    lot_no,
    quantity,
    serial_no,
    print_quantity,
    mfg_date,
    exp_date,
    warehouse_code,
    put_location,
    print_by,
    printer_ip,
    dpi
  } = req.body;

  try {
    const serialNos = serial_no.split('$').filter(s => s.trim());
    const printQuantities = print_quantity.split('$').filter(q => q.trim());

    if (serialNos.length !== printQuantities.length) {
      return res.status(400).json({ Status: 'F', Message: 'Serial numbers and print quantities count mismatch' });
    }

    const results = [];
    const printJobs = [];

    for (let i = 0; i < serialNos.length; i++) {
        // Insert into DB
        const result = await executeQuery(
            'EXEC sp_existing_data_upload_fg_label_printing_insert @item_code, @item_description, @lot_no, @quantity, @serial_no, @print_quantity, @mfg_date, @exp_date, @warehouse_code, @put_location, @print_by',
            [
                { name: 'item_code', type: sql.NVarChar, value: item_code },
                { name: 'item_description', type: sql.NVarChar, value: item_description },
                { name: 'lot_no', type: sql.NVarChar, value: lot_no },
                { name: 'quantity', type: sql.Decimal(18, 3), value: quantity },
                { name: 'serial_no', type: sql.NVarChar, value: serialNos[i] },
                { name: 'print_quantity', type: sql.Decimal(18, 3), value: printQuantities[i] },
                { name: 'mfg_date', type: sql.DateTime, value: mfg_date },
                { name: 'exp_date', type: sql.DateTime, value: exp_date },
                { name: 'warehouse_code', type: sql.NVarChar, value: warehouse_code || '' },
                { name: 'put_location', type: sql.NVarChar, value: put_location || '' },
                { name: 'print_by', type: sql.NVarChar, value: print_by }
            ]
        );
        
        if (result && result.length > 0) {
             results.push(result[0]);
        }

        // Prepare print job
        if (printer_ip) {
             const labelData = prepareFGLabelDataForCoat({
                production_order_no: '',
                item_code,
                item_description,
                lot_no,
                quantity,
                serial_no: serialNos[i],
                printed_qty: printQuantities[i],
                print_by
             });
             
             const prnContent = preparePrnFile(labelData, 'DRCoatLabel_300.prn');
             printJobs.push(prnContent);
        }
    }

    // Upsert SR No
    await executeQuery(
        'EXEC sp_existing_data_upload_sr_no_upsert @item_code, @lot_no, @generated_sr_no',
        [
            { name: 'item_code', type: sql.NVarChar, value: item_code },
            { name: 'lot_no', type: sql.NVarChar, value: lot_no },
            { name: 'generated_sr_no', type: sql.Int, value: serialNos.length }
        ]
    );

    // Execute printing if needed
    if (printer_ip && printJobs.length > 0) {
        try {
            await batchPrintToTscPrinter(printJobs, printer_ip, 9100);
             return res.status(200).json({
                Status: 'T',
                Message: 'Data saved and labels printed successfully',
                results
            });
        } catch (err) {
             return res.status(200).json({
                Status: 'T',
                Message: 'Data saved but printing failed: ' + err.message,
                results
            });
        }
    }

    return res.status(200).json({
        Status: 'T',
        Message: 'Data saved successfully',
        results
    });

  } catch (error) {
    return res.status(500).json({
      Status: 'F',
      Message: 'Error processing request',
      error: error.message,
    });
  }
};
