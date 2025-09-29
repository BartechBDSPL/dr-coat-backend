import { executeQuery } from '../../config/db.js';
import { sql } from '../../config/db.js';
import multer from 'multer';
import xlsx from 'xlsx';
import path from 'path';
import fs from 'fs';

export const getAllDetails = async (req, res) => {
  try {
    const result = await executeQuery(`EXEC sp_warehouse_location_master_get_all_details`);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json(error.message);
  }
};

export const getAllWhCode = async (req, res) => {
  try {
    const result = await executeQuery(`EXEC sp_warehouse_master_get_warehouse_code`);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json(error.message);
  }
};

export const insertDetails = async (req, res) => {
  const { WarehouseCode, LocationNameSap, Bin, User, WStatus } = req.body;

  try {
    const result = await executeQuery(
      'EXEC sp_warehouse_location_insert @warehouse_code, @bin, @created_by, @location_name_erp, @location_status',
      [
        { name: 'warehouse_code', type: sql.NVarChar, value: WarehouseCode },
        { name: 'bin', type: sql.NVarChar, value: Bin },
        { name: 'created_by', type: sql.NVarChar, value: User },
        { name: 'location_name_erp', type: sql.NVarChar, value: LocationNameSap },
        { name: 'location_status', type: sql.NVarChar, value: WStatus },
      ]
    );

    res.status(200).json(result[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

export const updateDetails = async (req, res) => {
  const { Id, WarehouseCode, Bin, LocationNameSap, User, Status } = req.body;
  try {
    const result = await executeQuery(
      'EXEC sp_warehouse_location_update @id, @warehouse_code, @bin, @location_name_erp, @location_status, @updated_by',
      [
        { name: 'id', type: sql.Int, value: Id },
        { name: 'warehouse_code', type: sql.NVarChar, value: WarehouseCode },
        { name: 'bin', type: sql.NVarChar, value: Bin },
        { name: 'location_name_erp', type: sql.NVarChar, value: LocationNameSap },
        { name: 'location_status', type: sql.NVarChar, value: Status },
        { name: 'updated_by', type: sql.NVarChar, value: User },
      ]
    );

    res.status(200).json(result[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

// Set up multer storage configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: 'T' });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
  },
});

// Filter function to allow only Excel files
const fileFilter = (req, file, cb) => {
  const allowedFileTypes = ['.xlsx', '.xls'];
  const extname = path.extname(file.originalname).toLowerCase();
  if (allowedFileTypes.includes(extname)) {
    cb(null, 'T');
  } else {
    cb(new Error('Only Excel files are allowed!'), 'F');
  }
};

// Initialize upload middleware
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
}).single('excelFile');

// Function to upload and process Excel file
export const uploadWhLocationExcel = async (req, res) => {
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
          // Delete the file after processing
          fs.unlinkSync(filePath);
          return res.status(400).json({
            Status: 'F',
            Message: 'Excel file is empty',
          });
        }

        // Check if required headers exist
        const requiredHeaders = [
          'Storage Type (Bartech)',
          'Storage Type (SAP)',
          'Storage Bin (SAP & Bartech)',
          'Bin Status (SAP)',
        ];

        const fileHeaders = Object.keys(data[0]);
        const missingHeaders = requiredHeaders.filter(header => !fileHeaders.includes(header));

        if (missingHeaders.length > 0) {
          // Delete the file after processing
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

        const username = req.user.UserName;

        // Function to split array into chunks
        const chunkArray = (array, chunkSize) => {
          const chunks = [];
          for (let i = 0; i < array.length; i += chunkSize) {
            chunks.push(array.slice(i, i + chunkSize));
          }
          return chunks;
        };

        // Split data into chunks of 50 records
        const CHUNK_SIZE = 50;
        const dataChunks = chunkArray(data, CHUNK_SIZE);

        // Process each chunk
        for (const chunk of dataChunks) {
          // Process all rows in the chunk concurrently
          const chunkPromises = chunk.map(async row => {
            try {
              const warehouseCode = row['Storage Type (Bartech)'];
              const locationNameSAP = row['Storage Type (SAP)'];
              const bin = row['Storage Bin (SAP & Bartech)'];
              const status = row['Bin Status (SAP)'];

              const result = await executeQuery(
                'EXEC sp_warehouse_location_master_upsert_details @warehouse_code, @bin, @updated_by, @location_name_erp, @location_status',
                [
                  {
                    name: 'warehouse_code',
                    type: sql.NVarChar,
                    value: warehouseCode,
                  },
                  { name: 'bin', type: sql.NVarChar, value: bin },
                  { name: 'updated_by', type: sql.NVarChar, value: username },
                  {
                    name: 'location_name_erp',
                    type: sql.NVarChar,
                    value: locationNameSAP,
                  },
                  { name: 'location_status', type: sql.NVarChar, value: status },
                ]
              );

              const spResult = result[0];

              return {
                row,
                status: spResult.Status,
                message: spResult.Message || spResult.ErrorMsg,
              };
            } catch (error) {
              return {
                row,
                status: 'F',
                message: error.message,
              };
            }
          });

          const chunkResults = await Promise.all(chunkPromises);

          // Categorize the results
          chunkResults.forEach(result => {
            if (result.status === 'T') {
              results.success.push({
                row: result.row,
                Message: result.message,
              });
            } else {
              results.failure.push({
                row: result.row,
                Message: result.message,
              });
            }
          });
        }

        // Delete the file after processing
        fs.unlinkSync(filePath);

        return res.status(200).json({
          Status: 'T',
          Message: 'Excel file processed',
          results: {
            totalProcessed: data.length,
            successCount: results.success.length,
            failureCount: results.failure.length,
            failures: results.failure.length > 0 ? results.failure : null,
          },
        });
      } catch (error) {
        // Delete the file in case of error
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
