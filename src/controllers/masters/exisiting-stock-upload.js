import { executeQuery, sql } from '../../config/db.js';
import multer from 'multer';
import xlsx from 'xlsx';
import path from 'path';
import fs from 'fs';

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

export const getAllStockUploaded = async (req, res) => {
  try {
    const result = await executeQuery('EXEC Sp_ExistingStockData_GetAll', []);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      Status: 'F',
      Message: 'Error retrieving existing stock data',
      error: error.message,
    });
  }
};

export const uploadStock = async (req, res) => {
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
          'Material',
          'Plant',
          'Storage Location',
          'Stock Category',
          'Batch',
          'Material Description',
          'Storage Type',
          'Storage Bin',
          'Available stock',
          'Base Unit of Measure',
          'GR Date',
        ];

        const fileHeaders = Object.keys(data[1]);
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

        const User = req.body.User;
        const OrderNumber = req.body.OrderNumber || '';

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
              const material = row['Material'];
              const plant = row['Plant'];
              const storageLocation = row['Storage Location'];
              const stockCategory = row['Stock Category'];
              const batch = row['Batch'];
              const materialDescription = row['Material Description'];
              const storageType = row['Storage Type'];
              const storageBin = row['Storage Bin'];
              const availableStock = row['Available stock'];
              const baseUnitOfMeasure = row['Base Unit of Measure'];
              const grDate = row['GR Date'];

              const result = await executeQuery(
                'EXEC Sp_Upsert_ExistingStockData @OrderNumber, @Material, @Plant, @Storage_Location, @Stock_Category, @Batch, @Material_Description, @Storage_Type, @Storage_Bin, @Available_Stock, @Base_Unit_Of_Measure, @GR_Date, @InsertedBy, @UpdatedBy',
                [
                  {
                    name: 'OrderNumber',
                    type: sql.NVarChar,
                    value: OrderNumber,
                  },
                  { name: 'Material', type: sql.NVarChar, value: material },
                  { name: 'Plant', type: sql.NVarChar, value: plant },
                  {
                    name: 'Storage_Location',
                    type: sql.NVarChar,
                    value: storageLocation,
                  },
                  {
                    name: 'Stock_Category',
                    type: sql.NVarChar,
                    value: stockCategory,
                  },
                  { name: 'Batch', type: sql.NVarChar, value: batch },
                  {
                    name: 'Material_Description',
                    type: sql.NVarChar,
                    value: materialDescription,
                  },
                  {
                    name: 'Storage_Type',
                    type: sql.NVarChar,
                    value: storageType,
                  },
                  {
                    name: 'Storage_Bin',
                    type: sql.NVarChar,
                    value: storageBin,
                  },
                  {
                    name: 'Available_Stock',
                    type: sql.Decimal,
                    value: availableStock || 0,
                  },
                  {
                    name: 'Base_Unit_Of_Measure',
                    type: sql.NVarChar,
                    value: baseUnitOfMeasure,
                  },
                  {
                    name: 'GR_Date',
                    type: sql.Date,
                    value: grDate ? new Date(grDate) : null,
                  },
                  { name: 'InsertedBy', type: sql.NVarChar, value: User },
                  { name: 'UpdatedBy', type: sql.NVarChar, value: User },
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
          Message: 'Excel file processed',
          results: {
            totalProcessed: data.length,
            successCount: results.success.length,
            failureCount: results.failure.length,
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
