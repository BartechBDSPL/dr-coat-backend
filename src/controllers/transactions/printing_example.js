import { executeQuery, sql } from '../../config/db.js';
import net from 'net';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { isPrinterReachable } from '../../utils/printer.js';

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

    // Read the entire file as a buffer to preserve binary data
    let contentBuffer = fs.readFileSync(templatePath);

    // Convert to string using latin1 encoding (preserves all byte values 0-255)
    let content = contentBuffer.toString('latin1');

    // Replace variables in template
    Object.keys(data).forEach(key => {
      const regex = new RegExp(key, 'g');
      const value = String(data[key] || '');
      content = content.replace(regex, value);
    });

    // Convert back to buffer using latin1 to preserve binary integrity
    return Buffer.from(content, 'latin1');
  } catch (error) {
    console.error('Error preparing PRN content:', error);
    throw error;
  }
}

// Function to prepare label data based on PRN file type
function prepareFGLabelData(prnDetails, reqData, labelFile) {
  const baseData = {
    VAddress1: prnDetails.company_address_1 || '',
    VAddress2: prnDetails.company_address_2 || '',
    VCategoryName: reqData.sub_category_name || '',
    VCompanyName: prnDetails.company_name || '',
    VCustCareNo: prnDetails.customer_care_no || '',
    VEmail: prnDetails.email || '',
    VMake: prnDetails.make || '',
    VModel: reqData.model_name || '',
    VSerialNo: reqData.serial_no || '',
  };

  // Add specific fields based on label file type
  if (labelFile.includes('BINOCULAR_MICROSCOPE')) {
    return {
      ...baseData,
      VSupply: reqData.input_rating || '',
    };
  } else if (labelFile.includes('BLOOD_BANK_REFRIGERATOR') || labelFile.includes('DEEP_FREEZER')) {
    return {
      ...baseData,
      VCapacity: reqData.capacity || '',
      VInputRating: reqData.input_rating || '',
      VNameOfRefrigerant: reqData.name_of_refrigerant || '',
      VOperatingTemp: reqData.operating_temp || '',
      VWeightOfMachine: reqData.weight_of_machine || '',
    };
  } else if (labelFile.includes('MULTICHANNEL_PIPETTE')) {
    return baseData;
  } else if (labelFile.includes('SERVO_CONTROLLED_VOLTAGE_STABILIZER')) {
    return {
      ...baseData,
      VCapacity: reqData.capacity || '',
      VOutputVolt: reqData.output_volt || '',
      VVoltMax: reqData.input_volt_max || '',
      VVoltMin: reqData.input_volt_min || '',
    };
  }

  // Default return all fields
  return {
    ...baseData,
    VCapacity: reqData.capacity || '',
    VInputRating: reqData.input_rating || '',
    VNameOfRefrigerant: reqData.name_of_refrigerant || '',
    VOperatingTemp: reqData.operating_temp || '',
    VWeightOfMachine: reqData.weight_of_machine || '',
    VOutputVolt: reqData.output_volt || '',
    VVoltMax: reqData.input_volt_max || '',
    VVoltMin: reqData.input_volt_min || '',
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

export const findLabelSerialNo = async (req, res) => {
  try {
    const { factory_code, mfg_month, mfg_year, product_code, model_code, model_name } = req.body;

    const paddedModelCode = model_code.padStart(2, '0');

    const result = await executeQuery(`EXEC [dbo].[sp_find_label_serialno] @model_code, @model_name`, [
      { name: 'model_code', type: sql.NVarChar(5), value: paddedModelCode },
      { name: 'model_name', type: sql.NVarChar(100), value: model_name },
    ]);

    res.status(200).json({ sr_no: result[0].sr_no });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

export const insertFGLabelPrinting = async (req, res) => {
  try {
    const {
      category_code,
      category_name,
      sub_category_code,
      sub_category_name,
      model_code,
      model_description,
      serial_no,
      print_by,
      factory_code,
      factory_name,
      mfg_month,
      mfg_year,
      model_name,
      product_code,
      generated_srno,
      warranty,
      printer_ip,
      label_file,
      label_name,
      capacity,
      input_rating,
      name_of_refrigerant,
      operating_temp,
      weight_of_machine,
      output_volt,
      input_volt_min,
      input_volt_max,
      customer_remark,
    } = req.body;

    // Check if printer_ip and label_file are provided for printing
    let printerIP, printerPort;
    console.log(req.body);
    if (printer_ip && label_file) {
      [printerIP, printerPort] = printer_ip.split(':');
      const portNumber = parseInt(printerPort) || 9100;

      // Check printer connectivity
      // const printerInRange = await isPrinterReachable(printerIP, portNumber);
      // if (!printerInRange) {
      //   return res.status(400).json({
      //     Status: 'F',
      //     Message: 'Printer is out of range or not reachable',
      //   });
      // }
    }
    const paddedModelCode = model_code.padStart(2, '0');

    // Get PRN file details only if label_name is provided
    let prnDetails = null;
    if (label_name) {
      prnDetails = await executeQuery(`EXEC [dbo].[sp_prn_file_get_all_details] @prn_file_name`, [
        { name: 'prn_file_name', type: sql.NVarChar(100), value: label_name },
      ]);

      if (!prnDetails || prnDetails.length === 0) {
        return res.status(400).json({
          Status: 'F',
          Message: 'PRN file details not found',
        });
      }
    }

    // Proceed with inserts only if upsert succeeded
    const serialNumbers = serial_no.split('$').filter(s => s.trim());

    for (const sn of serialNumbers) {
      const result = await executeQuery(
        `EXEC [dbo].[sp_fg_label_printing_insert] @factory_name, @category_code, @category_name, @sub_category_code, @sub_category_name, @model_code,@model_name, @model_description, @serial_no,@warranty, @capacity, @input_rating, @name_of_refrigerant, @operating_temp, @weight_of_machine, @output_volt, @input_volt_min, @input_volt_max, @label_file, @customer_remark, @print_by`,
        [
          { name: 'factory_name', type: sql.NVarChar(50), value: `${factory_code}-${factory_name}` },
          { name: 'category_code', type: sql.NVarChar(2), value: category_code },
          { name: 'category_name', type: sql.NVarChar(100), value: category_name },
          { name: 'sub_category_code', type: sql.NVarChar(2), value: sub_category_code },
          { name: 'sub_category_name', type: sql.NVarChar(100), value: sub_category_name },
          { name: 'model_code', type: sql.NVarChar(2), value: paddedModelCode },
          { name: 'model_name', type: sql.NVarChar(50), value: model_name },
          { name: 'model_description', type: sql.NVarChar(150), value: model_description },
          { name: 'serial_no', type: sql.NVarChar(255), value: sn.trim() },
          { name: 'warranty', type: sql.Int, value: parseInt(warranty) },
          { name: 'capacity', type: sql.NVarChar(50), value: capacity },
          { name: 'input_rating', type: sql.NVarChar(50), value: input_rating },
          { name: 'name_of_refrigerant', type: sql.NVarChar(50), value: name_of_refrigerant },
          { name: 'operating_temp', type: sql.NVarChar(50), value: operating_temp },
          { name: 'weight_of_machine', type: sql.NVarChar(50), value: weight_of_machine },
          { name: 'output_volt', type: sql.NVarChar(50), value: output_volt },
          { name: 'input_volt_min', type: sql.NVarChar(10), value: input_volt_min },
          { name: 'input_volt_max', type: sql.NVarChar(10), value: input_volt_max },
          { name: 'label_file', type: sql.NVarChar(100), value: label_file },
          { name: 'customer_remark', type: sql.NVarChar(200), value: customer_remark || '' },
          { name: 'print_by', type: sql.NVarChar(50), value: print_by },
        ]
      );
      if (result[0].Status !== 'T') {
        res.status(200).json({ Status: 'F', Message: result[0].Message, failed_serial_no: sn.trim() });
        return;
      }
    }

    const upsertResult = await executeQuery(
      `EXEC [dbo].[sp_upsert_fg_label_srno] @model_code,@model_name, @generated_srno`,
      [
        { name: 'model_code', type: sql.NVarChar, value: paddedModelCode },
        { name: 'model_name', type: sql.NVarChar, value: model_name },
        { name: 'generated_srno', type: sql.Int, value: generated_srno },
      ]
    );

    console.log('Parameters for upsert:', {
      model_code: paddedModelCode,
      model_name: model_name,
      generated_srno: generated_srno,
    });

    // Check if upsert succeeded (Status 'T')
    if (upsertResult[0].Status !== 'T') {
      res.status(200).json({ Status: 'F', Message: 'Upsert failed' });
      return;
    }

    // If printer_ip and label_file are provided, proceed with printing
    if (printer_ip && label_file) {
      try {
        // Extract printer IP and port
        const [printerIP, printerPort] = printer_ip.split(':');

        // Use a persistent file path - single file that gets overwritten each time
        const persistentFilePath = path.join(__dirname, 'fg_label_print.prn');
        const prnBuffers = [];

        // Prepare PRN content for each serial number
        for (const sn of serialNumbers) {
          const prnData = prepareFGLabelData(
            prnDetails[0],
            {
              category_name,
              sub_category_name,
              model_name,
              serial_no: sn.trim(),
              capacity,
              input_rating,
              name_of_refrigerant,
              operating_temp,
              weight_of_machine,
              output_volt,
              input_volt_min,
              input_volt_max,
            },
            label_file
          );

          const prnContent = preparePrnFile(prnData, label_file);
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
          category_name,
          model_name,
          serial_no: serialNumbers[0].trim(),
          label_file,
        });

        // Send to printer using batch print function
        await batchPrintToTscPrinter({ tempFilePath: persistentFilePath }, printerIP, printerPort || '9100');

        res.status(200).json({
          Status: 'T',
          Message: `Inserted and printed ${serialNumbers.length} labels successfully`,
          printed: true,
          labels_count: serialNumbers.length,
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
        Message: `Inserted ${serialNumbers.length} records`,
        printed: false,
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

export const getAllLabels = async (req, res) => {
  try {
    const result = await executeQuery(`EXEC [dbo].[sp_label_prn_get_all]`);

    res.status(200).json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

export const getActivePrinters = async (req, res) => {
  try {
    const result = await executeQuery(`EXEC [dbo].[hht_printer_data]`);

    res.status(200).json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

export const checkPrinterConnectivity = async (req, res) => {
  try {
    const { printer_ip } = req.body;

    if (!printer_ip) {
      return res.status(400).json({
        Status: 'F',
        Message: 'Printer IP is required',
      });
    }

    const [printerIP, printerPort] = printer_ip.split(':');
    const portNumber = parseInt(printerPort) || 9100;

    const isReachable = await isPrinterReachable(printerIP, portNumber);

    if (isReachable) {
      res.status(200).json({
        Status: 'T',
        Message: 'Printer is reachable and ready for printing',
        printer_ip: printer_ip,
        reachable: true,
      });
    } else {
      res.status(200).json({
        Status: 'F',
        Message: 'Printer is out of range or not reachable',
        printer_ip: printer_ip,
        reachable: false,
      });
    }
  } catch (error) {
    console.error('Error checking printer connectivity:', error);
    res.status(500).json({
      Status: 'F',
      Message: 'Error checking printer connectivity',
      error: error.message,
    });
  }
};
