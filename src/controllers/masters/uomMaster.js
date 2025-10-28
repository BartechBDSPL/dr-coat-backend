import { executeQuery } from '../../config/db.js';
import { sql } from '../../config/db.js';
import multer from 'multer';
import xlsx from 'xlsx';
import path from 'path';
import fs from 'fs';

export const getAllUom = async (req, res) => {
  try {
    const getAllUomData = await executeQuery('EXEC sp_uom_master_get_all_details');
    res.json(getAllUomData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

export const getAllUomUnits = async (req, res) => {
  try {
    const getAllUnits = await executeQuery('EXEC sp_uom_master_get_all_uom_unit');
    res.json(getAllUnits);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

export const updateUom = async (req, res) => {
  const { id, uom_code, description, international_standard_code, user } = req.body;
  try {
    const updateDetails = await executeQuery(
      'EXEC sp_uom_master_update @id, @uom_code, @description, @international_standard_code, @updated_by',
      [
        { name: 'id', type: sql.Int, value: id },
        { name: 'uom_code', type: sql.NVarChar, value: uom_code },
        { name: 'description', type: sql.NVarChar, value: description },
        { name: 'international_standard_code', type: sql.NVarChar, value: international_standard_code },
        { name: 'updated_by', type: sql.NVarChar, value: user },
      ]
    );

    const { Status, Message } = updateDetails[0];

    res.json(updateDetails[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

export const insertUom = async (req, res) => {
  const { uom_code, description, international_standard_code, user } = req.body;
  try {
    const insertDetails = await executeQuery(
      'EXEC sp_uom_master_insert @uom_code, @description, @international_standard_code, @created_by',
      [
        { name: 'uom_code', type: sql.NVarChar, value: uom_code },
        { name: 'description', type: sql.NVarChar, value: description },
        { name: 'international_standard_code', type: sql.NVarChar, value: international_standard_code },
        { name: 'created_by', type: sql.NVarChar, value: user },
      ]
    );

    const { Status, Message } = insertDetails[0];

    if (Status === 'T') {
      res.json({ Status: 'T', Message: Message });
    } else if (Status === 'F') {
      res.status(200).json({ Status: 'F', Message: Message });
    } else {
      res.status(500).json({ Status: 'F', Message: Message });
    }
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
      fs.mkdirSync(uploadDir, { recursive: true });
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
    cb(null, true);
  } else {
    cb(new Error('Only Excel files are allowed!'), false);
  }
};

// Initialize upload middleware
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
}).fields([
  { name: 'excelFile', maxCount: 1 },
  { name: 'username', maxCount: 1 },
]);

// Function to upload and process Excel file
export const uploadUomExcel = async (req, res) => {
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
        const requiredHeaders = ['Code', 'Description', 'International Standard Code'];

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

        const username = req.body.username || req.user?.UserName;

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
              const uomCode = row['Code'];
              const description = row['Description'];
              const internationalStandardCode = row['International Standard Code'];

              const result = await executeQuery(
                'EXEC sp_uom_master_upsert_details @uom_code, @description, @international_standard_code, @updated_by',
                [
                  {
                    name: 'uom_code',
                    type: sql.NVarChar,
                    value: uomCode,
                  },
                  { name: 'description', type: sql.NVarChar, value: description },
                  { name: 'international_standard_code', type: sql.NVarChar, value: internationalStandardCode },
                  { name: 'updated_by', type: sql.NVarChar, value: username },
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
