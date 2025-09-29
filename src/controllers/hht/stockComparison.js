import { executeQuery, sql } from '../../config/db.js';
import { SAP_SERVER, SAP_CONNECTOR_MIDDLEWARE_URL } from '../../utils/constants.js';
import axios from 'axios';

// Internal function to generate unique ID
const generateUniqueId = async () => {
  try {
    const result = await executeQuery(`EXEC [dbo].[StockComparison_GenerateUniqueId]`);
    return Array.isArray(result) && result.length > 0 ? result[0].UniqueId : null;
  } catch (error) {
    console.error('Error generating unique ID:', error);
    throw new Error('Failed to generate unique ID');
  }
};

export const getStockComparison = async (req, res) => {
  try {
    const { LAGERORT, CreatedBy } = req.body;

    if (!LAGERORT || !CreatedBy) {
      return res.status(400).json({
        Status: 'F',
        Message: 'LAGERORT and CreatedBy are required fields',
      });
    }

    const WERK = '5100';

    const requestBody = {
      ConnectionParams: {
        SAPServer: SAP_SERVER.SAPServer,
        SystemNumber: SAP_SERVER.SystemNumber,
        Client: SAP_SERVER.Client,
        UserId: SAP_SERVER.UserId,
        Password: SAP_SERVER.Password,
        Language: SAP_SERVER.Language,
      },
      LAGERORT: LAGERORT,
      WERK: WERK,
    };

    // Set a 5-minute timeout for the SAP API request
    const response = await axios.post(
      `${SAP_CONNECTOR_MIDDLEWARE_URL}/api/materials/quantities`,
      requestBody,
      { timeout: 300000 } // 5 minutes in milliseconds
    );

    // Check if the response contains data
    if (!response.data || !response.data.Quantities) {
      return res.status(500).json({
        Status: 'F',
        Message: 'Invalid response data structure from SAP',
      });
    }

    if (response.data.Return && response.data.Return.TYPE === 'E') {
      return res.status(500).json({
        Status: 'F',
        Message: response.data.Return.MESSAGE || 'Error received from SAP',
      });
    }

    const stockData = response.data.Quantities.filter(item => item.CHARG !== '');

    if (stockData.length === 0) {
      return res.status(200).json({
        Status: 'F',
        Message: 'No valid stock data found with batch information',
      });
    }

    // Generate unique ID only once for the entire request
    const uniqueId = await generateUniqueId();

    // Process all stock data records with the same uniqueId
    for (const item of stockData) {
      const {
        MATNR, // MATERIAL
        WERKS, // PRODUCTION_PLANT
        LGORT, // STORAGE_LOCATION
        CHARG, // BATCH
        LABST, // UNRESTRICTED_STOCK_QUANTITY
        INSME, // STOCK_IN_QUALITY_INSPECTION
        SPEME, // BLOCKED_STOCK_QUANTITY
        RETME, // RETRUNABLE_STOCK_QUANTITY
        KLABS, // STOCK_IN_TRANSFER
        KINSM, // STOCK_IN_STORAGE_LOCATION
        KSPEM, // STOCK_IN_OTHER_SPECIAL_CONDITION
      } = item;

      await executeQuery(
        `EXEC [dbo].[Sp_StockComparison_Insert] 
                    @Unique_Id, @MATERIAL, @PRODUCTION_PLANT, @STORAGE_LOCATION, @BATCH,
                    @UNRESTRICTED_STOCK_QUANTITY, @STOCK_IN_QUALITY_INSPECTION, 
                    @BLOCKED_STOCK_QUANTITY, @RETRUNABLE_STOCK_QUANTITY, 
                    @STOCK_IN_TRANSFER, @STOCK_IN_STORAGE_LOCATION, 
                    @STOCK_IN_OTHER_SPECIAL_CONDITION, @CreatedBy`,
        [
          { name: 'Unique_Id', type: sql.NVarChar(50), value: uniqueId },
          { name: 'MATERIAL', type: sql.NVarChar(50), value: MATNR },
          { name: 'PRODUCTION_PLANT', type: sql.NVarChar(50), value: WERKS },
          { name: 'STORAGE_LOCATION', type: sql.NVarChar(50), value: LGORT },
          { name: 'BATCH', type: sql.NVarChar(50), value: CHARG },
          {
            name: 'UNRESTRICTED_STOCK_QUANTITY',
            type: sql.Decimal(18, 2),
            value: parseFloat(LABST) || 0,
          },
          {
            name: 'STOCK_IN_QUALITY_INSPECTION',
            type: sql.Decimal(18, 2),
            value: parseFloat(INSME) || 0,
          },
          {
            name: 'BLOCKED_STOCK_QUANTITY',
            type: sql.Decimal(18, 2),
            value: parseFloat(SPEME) || 0,
          },
          {
            name: 'RETRUNABLE_STOCK_QUANTITY',
            type: sql.Decimal(18, 2),
            value: parseFloat(RETME) || 0,
          },
          {
            name: 'STOCK_IN_TRANSFER',
            type: sql.Decimal(18, 2),
            value: parseFloat(KLABS) || 0,
          },
          {
            name: 'STOCK_IN_STORAGE_LOCATION',
            type: sql.Decimal(18, 2),
            value: parseFloat(KINSM) || 0,
          },
          {
            name: 'STOCK_IN_OTHER_SPECIAL_CONDITION',
            type: sql.Decimal(18, 2),
            value: parseFloat(KSPEM) || 0,
          },
          { name: 'CreatedBy', type: sql.NVarChar(50), value: CreatedBy },
        ]
      );
    }

    const stockComparisonData = await executeQuery(`EXEC [dbo].[Sp_StockComparison_GetAll] @Unique_Id`, [
      { name: 'Unique_Id', type: sql.NVarChar(50), value: uniqueId },
    ]);

    return res.status(200).json({
      Status: 'T',
      Message: `Successfully processed ${stockData.length} stock items`,
      uniqueId: uniqueId,
      data: stockComparisonData,
    });
  } catch (error) {
    console.error('Error in getStockComparison:', error);
    return res.status(500).json({
      Status: 'F',
      Message: 'Failed to process stock comparison data',
      error: error.message,
    });
  }
};

// Keeping this as a separate endpoint for direct use if needed
export const insertStockComparison = async (req, res) => {
  try {
    // First get a unique ID
    const uniqueId = await generateUniqueId();

    const {
      MATERIAL,
      PRODUCTION_PLANT,
      STORAGE_LOCATION,
      BATCH,
      UNRESTRICTED_STOCK_QUANTITY,
      STOCK_IN_QUALITY_INSPECTION,
      BLOCKED_STOCK_QUANTITY,
      RETRUNABLE_STOCK_QUANTITY,
      STOCK_IN_TRANSFER,
      STOCK_IN_STORAGE_LOCATION,
      STOCK_IN_OTHER_SPECIAL_CONDITION,
      CreatedBy,
    } = req.body;

    const result = await executeQuery(
      `EXEC [dbo].[Sp_StockComparison_Insert] 
                @Unique_Id, @MATERIAL, @PRODUCTION_PLANT, @STORAGE_LOCATION, @BATCH,
                @UNRESTRICTED_STOCK_QUANTITY, @STOCK_IN_QUALITY_INSPECTION, 
                @BLOCKED_STOCK_QUANTITY, @RETRUNABLE_STOCK_QUANTITY, 
                @STOCK_IN_TRANSFER, @STOCK_IN_STORAGE_LOCATION, 
                @STOCK_IN_OTHER_SPECIAL_CONDITION, @CreatedBy`,
      [
        { name: 'Unique_Id', type: sql.NVarChar(50), value: uniqueId },
        { name: 'MATERIAL', type: sql.NVarChar(50), value: MATERIAL },
        {
          name: 'PRODUCTION_PLANT',
          type: sql.NVarChar(50),
          value: PRODUCTION_PLANT,
        },
        {
          name: 'STORAGE_LOCATION',
          type: sql.NVarChar(50),
          value: STORAGE_LOCATION,
        },
        { name: 'BATCH', type: sql.NVarChar(50), value: BATCH },
        {
          name: 'UNRESTRICTED_STOCK_QUANTITY',
          type: sql.Decimal(18, 2),
          value: UNRESTRICTED_STOCK_QUANTITY,
        },
        {
          name: 'STOCK_IN_QUALITY_INSPECTION',
          type: sql.Decimal(18, 2),
          value: STOCK_IN_QUALITY_INSPECTION,
        },
        {
          name: 'BLOCKED_STOCK_QUANTITY',
          type: sql.Decimal(18, 2),
          value: BLOCKED_STOCK_QUANTITY,
        },
        {
          name: 'RETRUNABLE_STOCK_QUANTITY',
          type: sql.Decimal(18, 2),
          value: RETRUNABLE_STOCK_QUANTITY,
        },
        {
          name: 'STOCK_IN_TRANSFER',
          type: sql.Decimal(18, 2),
          value: STOCK_IN_TRANSFER,
        },
        {
          name: 'STOCK_IN_STORAGE_LOCATION',
          type: sql.Decimal(18, 2),
          value: STOCK_IN_STORAGE_LOCATION,
        },
        {
          name: 'STOCK_IN_OTHER_SPECIAL_CONDITION',
          type: sql.Decimal(18, 2),
          value: STOCK_IN_OTHER_SPECIAL_CONDITION,
        },
        { name: 'CreatedBy', type: sql.NVarChar(50), value: CreatedBy },
      ]
    );

    return res.json({
      Status: 'T',
      Message: 'Stock comparison data inserted successfully',
      uniqueId: uniqueId,
      result,
    });
  } catch (error) {
    console.error('Error inserting stock comparison:', error);
    return res.status(500).json({
      Status: 'F',
      Message: 'Failed to insert stock comparison data',
      error: error.message,
    });
  }
};
