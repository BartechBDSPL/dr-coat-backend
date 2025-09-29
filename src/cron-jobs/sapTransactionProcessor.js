import cron from 'node-cron';
import { executeQuery, sql } from '../config/db.js';
import { SAP_SERVER, SAP_CONNECTOR_MIDDLEWARE_URL } from '../utils/constants.js';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '..', '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Log file path
const logFilePath = path.join(logsDir, 'sap-transaction-processor.log');

// Logger function with different log levels
const logToFile = (message, level = 'INFO') => {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp} [${level}] - ${message}\n`;

  // Console log based on level
  if (level === 'ERROR') {
    console.error(message);
  } else if (level === 'WARN') {
    console.warn(message);
  } else {
  }

  // Write to log file
  try {
    fs.appendFileSync(logFilePath, logMessage);
  } catch (error) {
    console.error('Failed to write to log file:', error.message);
  }
};

// Function to validate transaction data
function validateTransactionData(transaction, moduleName) {
  const errors = [];

  if (!transaction.MATERIAL && !transaction.PalletBarcode) {
    errors.push('Missing MATERIAL or PalletBarcode');
  }

  if (!transaction.BATCH) {
    errors.push('Missing BATCH');
  }

  if (!transaction.Qty || transaction.Qty <= 0) {
    errors.push('Invalid or missing Qty');
  }

  // Module-specific validations
  switch (moduleName) {
    case 'Production Entry':
    case 'Warehouse Scan':
      if (!transaction.PalletBarcode) {
        errors.push('Missing PalletBarcode for ' + moduleName);
      }
      break;
    case 'Quality':
    case 'Stock Transfer':
    case 'Internal Movement / Stock Transfer':
    case 'Delivery Order Picking':
    case 'Put Away':
    case 'WH Scrapping':
    case 'WH Block Or Unrestricted':
    case 'Resorting Picking':
      if (!transaction.LogID) {
        errors.push('Missing LogID for ' + moduleName);
      }
      break;
  }

  return errors;
}

// Function to handle retries for failed operations
async function executeWithRetry(operation, maxRetries = 3, delay = 5000) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation();
      return result;
    } catch (error) {
      lastError = error;
      logToFile(`Attempt ${attempt}/${maxRetries} failed: ${error.message}`, 'WARN');

      if (attempt < maxRetries) {
        logToFile(`Retrying after ${delay}ms...`, 'INFO');
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 1.5; // Exponential backoff
      }
    }
  }

  throw lastError;
}

// Order of modules to process
const modulesProcessingOrder = [
  'Production Entry',
  'Quality',
  'Warehouse Scan',
  'Put Away',
  'Stock Transfer',
  'Internal Movement / Stock Transfer',
  'Delivery Order Picking',
  'WH Scrapping',
  'WH Block Or Unrestricted',
  'Resorting Picking',
  'Resorting Return',
  'Resorting Scrapping',
];

// Map module names to their stored procedures
const moduleToStoredProcedure = {
  'Production Entry': 'Sp_SAP_GR_ERROR_LOG_Pending',
  Quality: 'Sp_SAP_QC_ERROR_LOG_Pending',
  'Warehouse Scan': 'Sp_SAP_INWARD_ERROR_LOG_Pending',
  'Stock Transfer': 'Sp_SAP_INTERNALMOVEMENT_ERROR_LOG_Pending',
  'Internal Movement / Stock Transfer': 'Sp_SAP_INTERNALMOVEMENT_ERROR_LOG_Pending',
  'Delivery Order Picking': 'Sp_SAP_MATERIALPICKING_ERROR_LOG_Pending',
  'Put Away': 'Sp_SAP_PUTAWAY_ERROR_LOG_Pending',
  'WH Scrapping': 'Sp_SAP_SCRAPPING_ERROR_LOG_Pending',
  'WH Block Or Unrestricted': 'Sp_SAP_WHBlockOrUnrestricted_ERROR_LOG_Pending',
  'Resorting Picking': 'Sp_SAP_RESORTING_ERROR_LOG_Pending',
  'Resorting Return': 'Sp_SAP_RESORTING_RETURN_ERROR_LOG_Pending',
  'Resorting Scrapping': 'Sp_SAP_RESORTING_SCRAPPING_ERROR_LOG_Pending',
};

// Function to get pending transactions for a specific module
async function getPendingTransactions(moduleName) {
  try {
    const storedProcedure = moduleToStoredProcedure[moduleName];
    if (!storedProcedure) {
      logToFile(`Invalid module name: ${moduleName}`, 'ERROR');
      return [];
    }

    const result = await executeWithRetry(async () => {
      return await executeQuery(`EXEC ${storedProcedure}`);
    });

    logToFile(`Found ${result.length} pending transactions for ${moduleName}`);
    console.log(result);
    // Validate transaction data
    const validTransactions = [];
    const invalidTransactions = [];

    for (const transaction of result) {
      const validationErrors = validateTransactionData(transaction, moduleName);

      if (validationErrors.length === 0) {
        validTransactions.push(transaction);
      } else {
        invalidTransactions.push({
          transaction,
          errors: validationErrors,
        });
        logToFile(
          `Invalid transaction data for ${moduleName} - LogID: ${transaction.LogID}, Errors: ${validationErrors.join(', ')}`,
          'WARN'
        );
      }
    }

    if (invalidTransactions.length > 0) {
      logToFile(`Found ${invalidTransactions.length} invalid transactions for ${moduleName}`, 'WARN');
    }

    logToFile(`${validTransactions.length} valid transactions ready for processing in ${moduleName}`);
    // Sort by LogID if present
    if (validTransactions.length > 0 && validTransactions[0].LogID !== undefined) {
      validTransactions.sort((a, b) => a.LogID - b.LogID);
    }
    return validTransactions;
  } catch (error) {
    logToFile(`Error getting pending transactions for ${moduleName}: ${error.message}`, 'ERROR');
    return [];
  }
}

// Function to group transactions by material, batch, movement type and storage location
function groupTransactionsByMaterialBatchMovementType(transactions) {
  const groups = new Map();

  transactions.forEach(transaction => {
    const key = `${transaction.MATERIAL || ''}_${transaction.BATCH || ''}_${transaction.MOVEMENT_TYPE || transaction.MOVE_TYPE || ''}_${transaction.STORAGE_LOCATION || ''}`;

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(transaction);
  });

  return groups;
}

// Function to create batches of maximum 50 items
function createBatches(transactions, maxBatchSize = 50) {
  const batches = [];

  for (let i = 0; i < transactions.length; i += maxBatchSize) {
    const batch = transactions.slice(i, i + maxBatchSize);
    batches.push(batch);
  }

  return batches;
}

// Function to prepare item data for SAP request
function prepareItemData(transaction, moduleName) {
  const formattedMaterialNo = transaction.MATERIAL ? transaction.MATERIAL.padStart(18, '0') : '';
  const formattedOrderNo = transaction.ORDER_NUMBER ? transaction.ORDER_NUMBER.padStart(12, '0') : '';

  const itemData = {
    MATERIAL: formattedMaterialNo,
    PLANT: transaction.PRODUCTION_PLANT || '5100',
    STGE_LOC: transaction.STORAGE_LOCATION || '',
    BATCH: transaction.BATCH,
    MOVE_TYPE: transaction.MOVEMENT_TYPE || transaction.MOVE_TYPE || '',
    STCK_TYPE: transaction.STOCK_TYPE || 'Q',
    ITEM_TEXT:
      (transaction.PalletBarcode || transaction.SerialNo || '').length > 45
        ? (transaction.PalletBarcode || transaction.SerialNo || '').substring(0, 45)
        : transaction.PalletBarcode || transaction.SerialNo || '',
    ENTRY_QNT: transaction.Qty,
    ENTRY_UOM: transaction.UNIT || transaction.UOM || 'ST',
    ENTRY_UOM_ISO: transaction.UNIT_ISO || transaction.UOM_ISO || 'PCE',
    PO_PR_QNT: transaction.Qty,
    ORDERID: formattedOrderNo,
    MVT_IND: transaction.MOVEMENT_INDICATOR,
  };

  if (transaction.MOVE_STORAGELOCATION) {
    itemData.MOVE_STLOC = transaction.MOVE_STORAGELOCATION;
  }

  if (transaction.COST_CENTER) {
    itemData.COSTCENTER = transaction.COST_CENTER;
  }

  return itemData;
}

// Function to update database records after successful SAP processing
async function updateDatabaseRecords(transactions, materialDocument, moduleName, createdBy) {
  const updatePromises = [];

  for (const transaction of transactions) {
    let updatePromise;

    switch (moduleName) {
      case 'Production Entry':
        updatePromise = executeQuery(
          `EXEC [dbo].[Sp_SAP_GR_ERROR_LOG_Update] @PalletBarcode, @BATCH, @ProcessedBy, @MATERIAL_DOCUMENT`,
          [
            {
              name: 'PalletBarcode',
              type: sql.NVarChar(50),
              value: transaction.PalletBarcode,
            },
            { name: 'BATCH', type: sql.NVarChar(50), value: transaction.BATCH },
            { name: 'ProcessedBy', type: sql.NVarChar(50), value: createdBy },
            {
              name: 'MATERIAL_DOCUMENT',
              type: sql.NVarChar(50),
              value: materialDocument,
            },
          ]
        );
        break;

      case 'Quality':
        updatePromise = executeQuery(`EXEC [dbo].[Sp_SAP_QC_ERROR_LOG_Update] @LogID, @ProcessedBy`, [
          { name: 'LogID', type: sql.Int, value: transaction.LogID },
          { name: 'ProcessedBy', type: sql.NVarChar(50), value: createdBy },
        ]);
        break;

      case 'Warehouse Scan':
        updatePromise = executeQuery(
          `EXEC [dbo].[Sp_SAP_INWARD_ERROR_LOG_Update] @PalletBarcode, @BATCH, @ProcessedBy, @MATERIAL_DOCUMENT`,
          [
            {
              name: 'PalletBarcode',
              type: sql.NVarChar(50),
              value: transaction.PalletBarcode,
            },
            { name: 'BATCH', type: sql.NVarChar(50), value: transaction.BATCH },
            { name: 'ProcessedBy', type: sql.NVarChar(50), value: createdBy },
            {
              name: 'MATERIAL_DOCUMENT',
              type: sql.NVarChar(70),
              value: materialDocument,
            },
          ]
        );
        break;

      case 'Stock Transfer':
      case 'Internal Movement / Stock Transfer':
        updatePromise = executeQuery(`EXEC [dbo].[Sp_SAP_INTERNALMOVEMENT_ERROR_LOG_Update] @LogID, @ProcessedBy`, [
          { name: 'LogID', type: sql.Int, value: transaction.LogID },
          { name: 'ProcessedBy', type: sql.NVarChar(50), value: createdBy },
        ]);
        break;

      case 'Delivery Order Picking':
        updatePromise = executeQuery(`EXEC [dbo].[Sp_SAP_MATERIALPICKING_ERROR_LOG_Update] @LogID, @ProcessedBy`, [
          { name: 'LogID', type: sql.Int, value: transaction.LogID },
          { name: 'ProcessedBy', type: sql.NVarChar(50), value: createdBy },
        ]);
        break;

      case 'Put Away':
        updatePromise = executeQuery(`EXEC [dbo].[Sp_SAP_PUTAWAY_ERROR_LOG_Update] @LogID, @ProcessedBy`, [
          { name: 'LogID', type: sql.Int, value: transaction.LogID },
          { name: 'ProcessedBy', type: sql.NVarChar(50), value: createdBy },
        ]);
        break;

      case 'WH Scrapping':
        updatePromise = executeQuery(`EXEC [dbo].[Sp_SAP_SCRAPPING_ERROR_LOG_Update] @LogID, @ProcessedBy`, [
          { name: 'LogID', type: sql.Int, value: transaction.LogID },
          { name: 'ProcessedBy', type: sql.NVarChar(50), value: createdBy },
        ]);
        break;

      case 'WH Block Or Unrestricted':
        updatePromise = executeQuery(
          `EXEC [dbo].[Sp_SAP_WHBlockORUnrestricted_ERROR_LOG_Update] @LogID, @ProcessedBy`,
          [
            { name: 'LogID', type: sql.Int, value: transaction.LogID },
            { name: 'ProcessedBy', type: sql.NVarChar(50), value: createdBy },
          ]
        );
        break;

      case 'Resorting Picking':
        updatePromise = executeQuery(`EXEC [dbo].[Sp_SAP_RESORTING_ERROR_LOG_Update] @LogID, @ProcessedBy`, [
          { name: 'LogID', type: sql.Int, value: transaction.LogID },
          { name: 'ProcessedBy', type: sql.NVarChar(50), value: createdBy },
        ]);
        break;

      case 'Resorting Return':
        updatePromise = executeQuery(`EXEC [dbo].[Sp_SAP_RESORTING_RETURN_ERROR_LOG_Update] @LogID, @ProcessedBy`, [
          { name: 'LogID', type: sql.Int, value: transaction.LogID },
          { name: 'ProcessedBy', type: sql.NVarChar(50), value: createdBy },
        ]);
        break;
      case 'Resorting Scrapping':
        updatePromise = executeQuery(`EXEC [dbo].[Sp_SAP_RESORTING_SCRAPPING_ERROR_LOG_Update] @LogID, @ProcessedBy`, [
          { name: 'LogID', type: sql.Int, value: transaction.LogID },
          { name: 'ProcessedBy', type: sql.NVarChar(50), value: createdBy },
        ]);
        break;
      default:
        logToFile(`Invalid module name for update: ${moduleName}`);
        continue;
    }

    updatePromises.push(updatePromise);
  }

  try {
    await Promise.all(updatePromises);
    logToFile(
      `Successfully updated ${transactions.length} database records for ${moduleName} with Material Document: ${materialDocument}`
    );
    return { success: true };
  } catch (error) {
    logToFile(`Error updating database records for ${moduleName}: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Function to process a batch of transactions
async function processBatchedTransactions(transactionBatch, moduleName) {
  try {
    const createdBy = transactionBatch[0]?.CreatedBy || 'SYSTEM_CRON';
    const batchSize = transactionBatch.length;
    const firstTransaction = transactionBatch[0];

    logToFile(
      `Processing batch for ${moduleName}: ${batchSize} transactions, Material: ${firstTransaction.MATERIAL}, Batch: ${firstTransaction.BATCH}`
    );

    // Prepare all items for SAP request
    const itemsData = transactionBatch.map(transaction => prepareItemData(transaction, moduleName));

    // Format date for SAP
    const currentDate = new Date();
    const formattedDate = currentDate
      .toLocaleDateString('en-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
      .replace(/\//g, '.');

    const sapRequestBody = {
      ConnectionParams: SAP_SERVER,
      GOODSMVT_CODE: {
        GM_CODE: firstTransaction.GM_CODE || (moduleName === 'Warehouse Scan' ? '04' : '02'),
      },
      GOODSMVT_HEADER: {
        PSTNG_DATE: formattedDate,
        DOC_DATE: formattedDate,
        HEADER_TXT: `Scheduler Update`,
        PR_UNAME: createdBy,
      },
      GOODSMVT_ITEM: itemsData,
      TESTRUN: false,
    };

    // Call SAP API with retry logic
    const response = await executeWithRetry(
      async () => {
        return await axios.post(`${SAP_CONNECTOR_MIDDLEWARE_URL}/api/goods-movement/create`, sapRequestBody, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 120000, // Increased timeout for batch processing
        });
      },
      3,
      5000
    );

    const sapResponse = response.data;
    console.log(sapRequestBody);
    // Check for errors in SAP response
    if (sapResponse.Return && sapResponse.Return.length > 0) {
      const returnMessage = sapResponse.Return[0];

      if (['E', 'I', 'A'].includes(returnMessage.TYPE)) {
        logToFile(`SAP error for ${moduleName} batch (${batchSize} items): ${returnMessage.MESSAGE}`, 'ERROR');
        return {
          success: false,
          message: returnMessage.MESSAGE || 'Error in SAP processing',
          processedCount: 0,
        };
      }
    }

    const materialDocument = sapResponse.GoodsMovementHeadRet?.MAT_DOC;

    if (!materialDocument) {
      logToFile(
        `Failed to get material document number from SAP for ${moduleName} batch (${batchSize} items)`,
        'ERROR'
      );
      return {
        success: false,
        message: 'Failed to get material document number from SAP',
        processedCount: 0,
      };
    }

    // Update all database records in the batch with retry logic
    const updateResult = await executeWithRetry(
      async () => {
        return await updateDatabaseRecords(transactionBatch, materialDocument, moduleName, createdBy);
      },
      3,
      2000
    );

    if (!updateResult.success) {
      logToFile(`Failed to update database records for ${moduleName} batch: ${updateResult.error}`, 'ERROR');
      return {
        success: false,
        message: `Database update failed: ${updateResult.error}`,
        processedCount: 0,
      };
    }

    logToFile(
      `Successfully processed ${moduleName} batch: ${batchSize} transactions - Material Document: ${materialDocument}`
    );
    return {
      success: true,
      message: `Successfully processed ${batchSize} transactions. Material Document: ${materialDocument}`,
      materialDocument,
      processedCount: batchSize,
    };
  } catch (error) {
    // Check if this is an Axios error with response data
    const errorMessage =
      error.response?.data?.Message || error.response?.data?.ModelState
        ? JSON.stringify(error.response.data.ModelState)
        : error.message;

    logToFile(`Error processing SAP batch for ${moduleName}: ${errorMessage}`, 'ERROR');
    return {
      success: false,
      message: `Error processing SAP batch: ${errorMessage}`,
      processedCount: 0,
    };
  }
}

// Main function to process all pending transactions
async function processAllPendingTransactions() {
  const startTime = new Date();
  logToFile('Starting SAP transaction processor cron job...');

  let totalProcessed = 0;
  let totalApiCalls = 0;
  let totalFailed = 0;
  const moduleStats = {};

  try {
    // Process each module in order
    for (const moduleName of modulesProcessingOrder) {
      const moduleStartTime = new Date();
      moduleStats[moduleName] = {
        processed: 0,
        failed: 0,
        apiCalls: 0,
        duration: 0,
      };

      try {
        logToFile(`Processing module: ${moduleName}`);

        // Get pending transactions for this module
        const pendingTransactions = await getPendingTransactions(moduleName);

        if (pendingTransactions.length === 0) {
          logToFile(`No pending transactions for ${moduleName}`);
          continue;
        }

        logToFile(`Found ${pendingTransactions.length} pending transactions for ${moduleName}`);

        // Group transactions by material, batch, movement type and storage location
        const groupedTransactions = groupTransactionsByMaterialBatchMovementType(pendingTransactions);

        logToFile(
          `Grouped transactions into ${groupedTransactions.size} material-batch-movement-storage groups for ${moduleName}`
        );

        // Process each group
        for (const [groupKey, groupTransactions] of groupedTransactions) {
          try {
            const [material, batch, movementType, storageLocation] = groupKey.split('_');
            logToFile(
              `Processing group: Material ${material}, Batch ${batch}, Movement Type ${movementType}, Storage Location ${storageLocation} - ${groupTransactions.length} transactions`
            );

            // Create batches of maximum 50 items
            const batches = createBatches(groupTransactions, 50);

            logToFile(
              `Split into ${batches.length} batches for Material ${material}, Batch ${batch}, Movement Type ${movementType}, Storage Location ${storageLocation}`
            );

            // Process each batch
            for (let i = 0; i < batches.length; i++) {
              const batch = batches[i];

              try {
                logToFile(
                  `Processing batch ${i + 1}/${batches.length} for Material ${material}, Batch ${batch[0]?.BATCH}, Movement Type ${movementType}, Storage Location ${storageLocation} - ${batch.length} items`
                );

                const result = await processBatchedTransactions(batch, moduleName);
                moduleStats[moduleName].apiCalls++;
                totalApiCalls++;

                if (result.success) {
                  moduleStats[moduleName].processed += result.processedCount;
                  totalProcessed += result.processedCount;
                  logToFile(`Batch ${i + 1} processed successfully: ${result.processedCount} items`);
                } else {
                  // Instead of failing the entire batch, try processing individual transactions
                  logToFile(
                    `Batch processing failed, attempting individual transaction processing for batch ${i + 1}`,
                    'WARN'
                  );

                  for (const singleTransaction of batch) {
                    try {
                      const singleResult = await processBatchedTransactions([singleTransaction], moduleName);
                      moduleStats[moduleName].apiCalls++;
                      totalApiCalls++;

                      if (singleResult.success) {
                        moduleStats[moduleName].processed += singleResult.processedCount;
                        totalProcessed += singleResult.processedCount;
                        logToFile(
                          `Individual transaction processed successfully: LogID ${singleTransaction.LogID || singleTransaction.PalletBarcode}`
                        );
                      } else {
                        moduleStats[moduleName].failed += 1;
                        totalFailed += 1;
                        logToFile(
                          `Failed to process individual transaction: LogID ${singleTransaction.LogID || singleTransaction.PalletBarcode} - ${singleResult.message}`,
                          'ERROR'
                        );
                      }

                      // Small delay between individual transactions
                      await new Promise(resolve => setTimeout(resolve, 500));
                    } catch (error) {
                      moduleStats[moduleName].failed += 1;
                      totalFailed += 1;
                      logToFile(
                        `Error processing individual transaction: LogID ${singleTransaction.LogID || singleTransaction.PalletBarcode} - ${error.message}`,
                        'ERROR'
                      );
                    }
                  }
                }

                // Add delay between batches to avoid overwhelming SAP
                if (i < batches.length - 1) {
                  await new Promise(resolve => setTimeout(resolve, 2000));
                }
              } catch (error) {
                // If batch processing fails completely, try individual transactions
                logToFile(
                  `Batch processing error, attempting individual transaction processing: ${error.message}`,
                  'WARN'
                );

                for (const singleTransaction of batch) {
                  try {
                    const singleResult = await processBatchedTransactions([singleTransaction], moduleName);
                    moduleStats[moduleName].apiCalls++;
                    totalApiCalls++;

                    if (singleResult.success) {
                      moduleStats[moduleName].processed += singleResult.processedCount;
                      totalProcessed += singleResult.processedCount;
                      logToFile(
                        `Individual transaction processed successfully: LogID ${singleTransaction.LogID || singleTransaction.PalletBarcode}`
                      );
                    } else {
                      moduleStats[moduleName].failed += 1;
                      totalFailed += 1;
                      logToFile(
                        `Failed to process individual transaction: LogID ${singleTransaction.LogID || singleTransaction.PalletBarcode} - ${singleResult.message}`,
                        'ERROR'
                      );
                    }

                    // Small delay between individual transactions
                    await new Promise(resolve => setTimeout(resolve, 500));
                  } catch (individualError) {
                    moduleStats[moduleName].failed += 1;
                    totalFailed += 1;
                    logToFile(
                      `Error processing individual transaction: LogID ${singleTransaction.LogID || singleTransaction.PalletBarcode} - ${individualError.message}`,
                      'ERROR'
                    );
                  }
                }
              }
            }

            // Add delay between different material-batch-movement-storage groups
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (error) {
            logToFile(`Error processing group ${groupKey} for ${moduleName}: ${error.message}`, 'ERROR');
            // Even if group processing fails, try to process each transaction individually
            for (const singleTransaction of groupTransactions) {
              try {
                const singleResult = await processBatchedTransactions([singleTransaction], moduleName);
                moduleStats[moduleName].apiCalls++;
                totalApiCalls++;

                if (singleResult.success) {
                  moduleStats[moduleName].processed += singleResult.processedCount;
                  totalProcessed += singleResult.processedCount;
                  logToFile(
                    `Individual transaction processed successfully after group error: LogID ${singleTransaction.LogID || singleTransaction.PalletBarcode}`
                  );
                } else {
                  moduleStats[moduleName].failed += 1;
                  totalFailed += 1;
                  logToFile(
                    `Failed to process individual transaction after group error: LogID ${singleTransaction.LogID || singleTransaction.PalletBarcode} - ${singleResult.message}`,
                    'ERROR'
                  );
                }

                await new Promise(resolve => setTimeout(resolve, 500));
              } catch (individualError) {
                moduleStats[moduleName].failed += 1;
                totalFailed += 1;
                logToFile(
                  `Error processing individual transaction after group error: LogID ${singleTransaction.LogID || singleTransaction.PalletBarcode} - ${individualError.message}`,
                  'ERROR'
                );
              }
            }
          }
        }

        moduleStats[moduleName].duration = new Date() - moduleStartTime;
        logToFile(
          `Completed processing for module: ${moduleName} - Processed: ${moduleStats[moduleName].processed} transactions, Failed: ${moduleStats[moduleName].failed}, API calls: ${moduleStats[moduleName].apiCalls}, Duration: ${Math.round(moduleStats[moduleName].duration / 1000)}s`
        );

        // Add delay between modules
        await new Promise(resolve => setTimeout(resolve, 3000));
      } catch (error) {
        moduleStats[moduleName].duration = new Date() - moduleStartTime;
        logToFile(`Error processing module ${moduleName}: ${error.message}`, 'ERROR');
      }
    }
  } catch (error) {
    logToFile(`Critical error in processAllPendingTransactions: ${error.message}`, 'ERROR');
  }

  const totalDuration = new Date() - startTime;

  // Log final statistics
  logToFile(`=== SAP Transaction Processing Summary ===`);
  logToFile(`Total Duration: ${Math.round(totalDuration / 1000)}s`);
  logToFile(`Total Processed: ${totalProcessed} transactions`);
  logToFile(`Total Failed: ${totalFailed} transactions`);
  logToFile(`Total API Calls: ${totalApiCalls}`);
  logToFile(
    `API Call Efficiency: ${totalProcessed > 0 ? Math.round(totalProcessed / totalApiCalls) : 0} transactions per API call`
  );

  // Log module-wise statistics
  for (const [moduleName, stats] of Object.entries(moduleStats)) {
    if (stats.processed > 0 || stats.failed > 0) {
      logToFile(
        `${moduleName}: Processed=${stats.processed}, Failed=${stats.failed}, API Calls=${stats.apiCalls}, Duration=${Math.round(stats.duration / 1000)}s`
      );
    }
  }

  logToFile('Completed SAP transaction processor cron job run.');
}

// Schedule the job to run every 2 hours
// Cron format: second(0-59) minute(0-59) hour(0-23) day_of_month(1-31) month(1-12) day_of_week(0-6)
export const startSapTransactionCronJob = () => {
  logToFile('Initializing SAP transaction processor cron job - scheduled to run every 2 hours');

  // Schedule the cron job
  cron.schedule(
    '0 */2 * * *',
    async () => {
      try {
        logToFile('=== Cron Job Triggered ===');
        await processAllPendingTransactions();
      } catch (error) {
        logToFile(`Critical error in SAP transaction processor cron job: ${error.message}`, 'ERROR');
      }
    },
    {
      scheduled: true,
      timezone: 'UTC',
    }
  );

  logToFile('SAP transaction processor cron job initialized successfully');

  // Run once at startup to process any pending transactions
  setTimeout(async () => {
    try {
      logToFile('=== Initial Startup Run ===');
      await processAllPendingTransactions();
    } catch (error) {
      logToFile(`Error during initial SAP transaction processing: ${error.message}`, 'ERROR');
    }
  }, 5000); // Wait 5 seconds after startup
};

// Export function to manually trigger the processing
export const manuallyTriggerSapProcessing = async () => {
  try {
    logToFile('=== Manual Trigger Initiated ===');
    const startTime = new Date();

    await processAllPendingTransactions();

    const duration = new Date() - startTime;
    const message = `SAP transaction processing completed successfully in ${Math.round(duration / 1000)} seconds`;

    logToFile(message);
    return {
      success: true,
      message: message,
      duration: duration,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    const errorMessage = `Error during manual SAP transaction processing: ${error.message}`;
    logToFile(errorMessage, 'ERROR');
    return {
      success: false,
      message: errorMessage,
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
};

// Export function to get processing statistics
export const getSapProcessingStats = async () => {
  try {
    // Read recent log entries for statistics
    const logContent = fs.readFileSync(logFilePath, 'utf8');
    const logLines = logContent.split('\n').filter(line => line.trim());

    // Get last 100 lines for analysis
    const recentLogs = logLines.slice(-100);

    const stats = {
      lastRun: null,
      totalApiCalls: 0,
      totalProcessed: 0,
      totalFailed: 0,
      isHealthy: true,
      recentErrors: [],
    };

    // Parse recent logs for statistics
    recentLogs.forEach(line => {
      if (line.includes('=== SAP Transaction Processing Summary ===')) {
        stats.lastRun = new Date(line.substring(0, 24));
      }
      if (line.includes('Total API Calls:')) {
        const match = line.match(/Total API Calls: (\d+)/);
        if (match) stats.totalApiCalls = parseInt(match[1]);
      }
      if (line.includes('Total Processed:')) {
        const match = line.match(/Total Processed: (\d+)/);
        if (match) stats.totalProcessed = parseInt(match[1]);
      }
      if (line.includes('Total Failed:')) {
        const match = line.match(/Total Failed: (\d+)/);
        if (match) stats.totalFailed = parseInt(match[1]);
      }
      if (line.includes('[ERROR]')) {
        stats.recentErrors.push(line);
        stats.isHealthy = false;
      }
    });

    return {
      success: true,
      stats: stats,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      success: false,
      message: `Error reading processing stats: ${error.message}`,
      timestamp: new Date().toISOString(),
    };
  }
};
