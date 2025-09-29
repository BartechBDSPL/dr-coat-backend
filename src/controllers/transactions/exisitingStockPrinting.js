import { executeQuery, sql } from '../../config/db.js';

export const getAllMaterials = async (req, res) => {
  try {
    const result = await executeQuery(`EXEC [dbo].[Sp_PSV_MaterialGetAll]`);
    res.json(result);
  } catch (error) {
    console.error('Error fetching all materials:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const getMaterialBatches = async (req, res) => {
  const { Material } = req.body;

  try {
    const result = await executeQuery('EXEC Sp_PSV_MaterialBatchGetAll @Material', [
      { name: 'Material', type: sql.NVarChar(50), value: Material },
    ]);

    if (result[0] && result[0].Status === 'F') {
      return res.status(200).json({
        Status: 'F',
        Message: result[0].Message,
      });
    }

    res.json(result);
  } catch (error) {
    console.error('Error fetching material batches:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getMaterialDetails = async (req, res) => {
  const { Material } = req.body;

  try {
    if (!Material) {
      return res.status(400).json({
        Status: 'F',
        Message: 'Material is required',
      });
    }

    const result = await executeQuery('EXEC Sp_PSV_MaterialMaster_Details @Material', [
      { name: 'Material', type: sql.NVarChar(50), value: Material },
    ]);

    if (result[0] && result[0].Status === 'F') {
      return res.status(200).json({
        Status: 'F',
        Message: result[0].Message,
      });
    }

    res.json(result[0]);
  } catch (error) {
    console.error('Error fetching material details:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getMaterialBatchDetails = async (req, res) => {
  const { Material, Batch } = req.body;

  try {
    if (!Material || !Batch) {
      return res.status(400).json({
        Status: 'F',
        Message: 'Material and Batch are required',
      });
    }

    // First call Sp_PSV_MaterialMaster_Details
    const materialResult = await executeQuery('EXEC Sp_PSV_MaterialMaster_Details @Material', [
      { name: 'Material', type: sql.NVarChar(50), value: Material },
    ]);

    if (materialResult[0] && materialResult[0].Status === 'F') {
      return res.status(200).json({
        Status: 'F',
        Message: materialResult[0].Message,
      });
    }

    // If material details are successful, then call batch details
    const batchResult = await executeQuery('EXEC Sp_PSV_MaterialBatchDetails @Material, @Batch', [
      { name: 'Material', type: sql.NVarChar(50), value: Material },
      { name: 'Batch', type: sql.NVarChar(50), value: Batch },
    ]);

    if (batchResult[0] && batchResult[0].Status === 'F') {
      return res.status(200).json({
        Status: 'F',
        Message: batchResult[0].Message,
      });
    }

    // Combine results if needed or just return batch details
    res.json({
      materialDetails: materialResult[0],
      stockDetails: batchResult[0],
    });
  } catch (error) {
    console.error('Error fetching material batch details:', error);
    res.status(500).json({ error: error.message });
  }
};
