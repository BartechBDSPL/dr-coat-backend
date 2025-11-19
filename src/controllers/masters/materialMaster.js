import { executeQuery } from '../../config/db.js';
import { sql } from '../../config/db.js';
import multer from 'multer';
import xlsx from 'xlsx';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import { ODATA_BASE_URL, ODATA_USERNAME, ODATA_PASSWORD } from '../../utils/constants.js';

export const getAllMaterialDetails = async (req, res) => {
  try {
    const result = await executeQuery('EXEC sp_material_master_get_all_details');
    const dbCount = result.length;

    try {
      const url = `${ODATA_BASE_URL}/ItemMasterWMS`;
      const odataResponse = await axios.get(url, {
        auth: {
          username: ODATA_USERNAME,
          password: ODATA_PASSWORD,
        },
      });
      const odataData = odataResponse.data.value;
      const odataCount = odataData.length;

      if (dbCount !== odataCount) {
        console.log(`Counts differ: DB ${dbCount}, OData ${odataCount}. Syncing materials...`);
        for (const item of odataData) {
          await executeQuery(
            'EXEC sp_material_master_upsert @item_code, @item_description, @inventory_posting_group, @category_l1, @category_l2, @category_l3, @base_uom, @hazardous, @approval_status, @item_tracking_code, @updated_by',
            [
              { name: 'item_code', type: sql.NVarChar, value: item.no },
              { name: 'item_description', type: sql.NVarChar, value: item.description },
              { name: 'inventory_posting_group', type: sql.NVarChar, value: item.inventoryPostingGroup },
              { name: 'category_l1', type: sql.NVarChar, value: item.Product_Group_Code_L_1 },
              { name: 'category_l2', type: sql.NVarChar, value: item.Product_Group_Code_L_2 },
              { name: 'category_l3', type: sql.NVarChar, value: '' },
              { name: 'base_uom', type: sql.NVarChar, value: item.Base_Unit_of_Measure },
              { name: 'hazardous', type: sql.NVarChar, value: item.Hazardous ? 'Yes' : 'No' },
              { name: 'approval_status', type: sql.NVarChar, value: item.Approval_Status },
              { name: 'item_tracking_code', type: sql.NVarChar, value: item.Item_Tracking_Code },
              { name: 'updated_by', type: sql.NVarChar, value: 'system' },
            ]
          );
        }
        // Refetch after sync
        const updatedResult = await executeQuery('EXEC sp_material_master_get_all_details');
        res.status(200).json(updatedResult);
      } else {
        res.status(200).json(result);
      }
    } catch (odataError) {
      console.error('Error fetching OData:', odataError.message);
      res.status(200).json(result);
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

export const insertMaterialDetails = async (req, res) => {
  const {
    item_code,
    item_description,
    inventory_posting_group,
    category_l1,
    category_l2,
    category_l3,
    base_uom,
    hazardous,
    approval_status,
    item_tracking_code,
    created_by,
  } = req.body;

  try {
    const result = await executeQuery(
      'EXEC sp_material_master_insert @item_code, @item_description, @inventory_posting_group, @category_l1, @category_l2, @category_l3, @base_uom, @hazardous, @approval_status, @item_tracking_code, @created_by',
      [
        { name: 'item_code', type: sql.NVarChar, value: item_code },
        { name: 'item_description', type: sql.NVarChar, value: item_description },
        { name: 'inventory_posting_group', type: sql.NVarChar, value: inventory_posting_group },
        { name: 'category_l1', type: sql.NVarChar, value: category_l1 },
        { name: 'category_l2', type: sql.NVarChar, value: category_l2 },
        { name: 'category_l3', type: sql.NVarChar, value: category_l3 },
        { name: 'base_uom', type: sql.NVarChar, value: base_uom },
        { name: 'hazardous', type: sql.NVarChar, value: hazardous },
        { name: 'approval_status', type: sql.NVarChar, value: approval_status },
        { name: 'item_tracking_code', type: sql.NVarChar, value: item_tracking_code },
        { name: 'created_by', type: sql.NVarChar, value: created_by },
      ]
    );

    res.status(200).json(result[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

export const updateMaterialDetails = async (req, res) => {
  const {
    id,
    item_code,
    item_description,
    inventory_posting_group,
    category_l1,
    category_l2,
    category_l3,
    base_uom,
    hazardous,
    approval_status,
    item_tracking_code,
    updated_by,
  } = req.body;

  try {
    const result = await executeQuery(
      'EXEC sp_material_master_update @id, @item_code, @item_description, @inventory_posting_group, @category_l1, @category_l2, @category_l3, @base_uom, @hazardous, @approval_status, @item_tracking_code, @updated_by',
      [
        { name: 'id', type: sql.Int, value: id },
        { name: 'item_code', type: sql.NVarChar, value: item_code },
        { name: 'item_description', type: sql.NVarChar, value: item_description },
        { name: 'inventory_posting_group', type: sql.NVarChar, value: inventory_posting_group },
        { name: 'category_l1', type: sql.NVarChar, value: category_l1 },
        { name: 'category_l2', type: sql.NVarChar, value: category_l2 },
        { name: 'category_l3', type: sql.NVarChar, value: category_l3 },
        { name: 'base_uom', type: sql.NVarChar, value: base_uom },
        { name: 'hazardous', type: sql.NVarChar, value: hazardous },
        { name: 'approval_status', type: sql.NVarChar, value: approval_status },
        { name: 'item_tracking_code', type: sql.NVarChar, value: item_tracking_code },
        { name: 'updated_by', type: sql.NVarChar, value: updated_by },
      ]
    );

    res.status(200).json(result[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

export const checkUniqueItemNos = async (req, res) => {
  try {
    const url = `${ODATA_BASE_URL}/ItemMasterWMS`;
    const response = await axios.get(url, {
      auth: {
        username: ODATA_USERNAME,
        password: ODATA_PASSWORD,
      },
    });

    const data = response.data.value;
    const nos = data.map(item => item.no);
    const uniqueNos = new Set(nos);

    if (uniqueNos.size === nos.length) {
      console.log('All item nos are unique');
      res.status(200).json({ unique: true, message: 'All item nos are unique' });
    } else {
      const duplicates = nos.filter((no, index) => nos.indexOf(no) !== index);
      const uniqueDuplicates = [...new Set(duplicates)];
      console.log('Duplicate item nos:', uniqueDuplicates);
      res.status(200).json({ unique: false, duplicates: uniqueDuplicates, message: 'Some item nos are not unique' });
    }
  } catch (error) {
    console.error('Error checking unique item nos:', error);
    res.status(500).json({ error: error.message });
  }
};

export const checkUniquePackingList = async (req, res) => {
  try {
    const url = `${ODATA_BASE_URL}/ItemPackingListWMS`;
    const response = await axios.get(url, {
      auth: {
        username: ODATA_USERNAME,
        password: ODATA_PASSWORD,
      },
    });

    const data = response.data.value;
    const nos = data.map(item => item.Item_No);
    const uniqueNos = new Set(nos);

    if (uniqueNos.size === nos.length) {
      console.log('All item nos are unique');
      res.status(200).json({ unique: true, message: 'All item nos are unique' });
    } else {
      const duplicates = nos.filter((Item_No, index) => nos.indexOf(Item_No) !== index);
      const uniqueDuplicates = [...new Set(duplicates)];
      console.log('Duplicate item nos:', uniqueDuplicates);
      res.status(200).json({ unique: false, duplicates: uniqueDuplicates, message: 'Some item nos are not unique' });
    }
  } catch (error) {
    console.error('Error checking unique item nos:', error);
    res.status(500).json({ error: error.message });
  }
};
export const checkUniqueShipmentNo = async (req, res) => {
  try {
    const url = `${ODATA_BASE_URL}/SalesShipmentDetailsWMS`;
    const response = await axios.get(url, {
      auth: {
        username: ODATA_USERNAME,
        password: ODATA_PASSWORD,
      },
    });

    const data = response.data.value;
    const nos = data.map(item => item.ShipmentNo);
    const uniqueNos = new Set(nos);

    if (uniqueNos.size === nos.length) {
      console.log('All item nos are unique');
      res.status(200).json({ unique: true, message: 'All item nos are unique' });
    } else {
      const duplicates = nos.filter((ShipmentNo, index) => nos.indexOf(ShipmentNo) !== index);
      const uniqueDuplicates = [...new Set(duplicates)];
      console.log('Duplicate item nos:', uniqueDuplicates);
      res.status(200).json({ unique: false, duplicates: uniqueDuplicates, message: 'Some item nos are not unique' });
    }
  } catch (error) {
    console.error('Error checking unique item nos:', error);
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
// Accept any field name for the uploaded file
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
}).any();

// Function to upload and process Excel file
export const uploadMaterialExcel = async (req, res) => {
  try {
    upload(req, res, async function (err) {
      if (err) {
        return res.status(400).json({
          Status: 'F',
          Message: err.message,
        });
      }

      // Check if file exists. Multer.any() stores files in req.files array
      const fileObj = req.files && req.files.length > 0 ? req.files[0] : null;

      if (!fileObj) {
        return res.status(400).json({
          Status: 'F',
          Message: 'Please upload an Excel file',
        });
      }

      const filePath = fileObj.path;

      try {
        // Read the Excel file
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(worksheet);

        if (data.length === 0) {
          // Delete the file after processing
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          return res.status(400).json({
            Status: 'F',
            Message: 'Excel file is empty',
          });
        }

        // Check if required headers exist
        const requiredHeaders = [
          'Item Code',
          'Item Description',
          'Inventory Posting Group',
          'Category L1',
          'Category L2',
          'Category L3',
          'Base UOM',
          'Hazardous',
          'Approval Status',
          'Item Tracking Code',
        ];

        const fileHeaders = Object.keys(data[0]);
        const missingHeaders = requiredHeaders.filter(header => !fileHeaders.includes(header));

        if (missingHeaders.length > 0) {
          // Delete the file after processing
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
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
              const result = await executeQuery(
                'EXEC sp_material_master_upsert @item_code, @item_description, @inventory_posting_group, @category_l1, @category_l2, @category_l3, @base_uom, @hazardous, @approval_status, @item_tracking_code, @updated_by',
                [
                  { name: 'item_code', type: sql.NVarChar, value: row['Item Code'] },
                  { name: 'item_description', type: sql.NVarChar, value: row['Item Description'] },
                  { name: 'inventory_posting_group', type: sql.NVarChar, value: row['Inventory Posting Group'] },
                  { name: 'category_l1', type: sql.NVarChar, value: row['Category L1'] },
                  { name: 'category_l2', type: sql.NVarChar, value: row['Category L2'] },
                  { name: 'category_l3', type: sql.NVarChar, value: row['Category L3'] },
                  { name: 'base_uom', type: sql.NVarChar, value: row['Base UOM'] },
                  { name: 'hazardous', type: sql.NVarChar, value: row['Hazardous'] },
                  { name: 'approval_status', type: sql.NVarChar, value: row['Approval Status'] },
                  { name: 'item_tracking_code', type: sql.NVarChar, value: row['Item Tracking Code'] },
                  { name: 'updated_by', type: sql.NVarChar, value: username },
                ]
              );

              // Handle different result structures from stored procedure
              const spResult = result && result.length > 0 ? result[0] : null;

              if (!spResult) {
                return {
                  row,
                  status: 'T',
                  message: 'Record processed successfully',
                };
              }

              return {
                row,
                status: spResult.Status || 'T',
                message: spResult.Message || spResult.ErrorMsg || 'Record processed successfully',
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
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

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
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

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
