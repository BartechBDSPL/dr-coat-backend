import { executeQuery, sql } from '../../config/db.js';

export const getESUDetails = async (req, res) => {
  const { ORDER_NUMBER, MATERIAL, MATERIAL_TEXT, BATCH, STORAGE_LOCATION, FromDate, ToDate } = req.body;

  try {
    const paddedOrderNumber = ORDER_NUMBER ? ORDER_NUMBER.padStart(12, '0') : null;
    const paddedMaterial = MATERIAL ? MATERIAL.padStart(18, '0') : null;

    const result = await executeQuery(
      `EXEC [dbo].[Sp_Rep_ESUDetails] 
            @ORDER_NUMBER, 
            @MATERIAL, 
            @MATERIAL_TEXT, 
            @BATCH, 
            @STORAGE_LOCATION, 
            @FromDate, 
            @ToDate`,
      [
        {
          name: 'ORDER_NUMBER',
          type: sql.NVarChar(50),
          value: paddedOrderNumber,
        },
        { name: 'MATERIAL', type: sql.NVarChar(50), value: paddedMaterial },
        {
          name: 'MATERIAL_TEXT',
          type: sql.NVarChar(250),
          value: MATERIAL_TEXT,
        },
        { name: 'BATCH', type: sql.NVarChar(50), value: BATCH },
        {
          name: 'STORAGE_LOCATION',
          type: sql.NVarChar(20),
          value: STORAGE_LOCATION,
        },
        { name: 'FromDate', type: sql.NVarChar(10), value: FromDate },
        { name: 'ToDate', type: sql.NVarChar(10), value: ToDate },
      ]
    );
    res.json(result);
  } catch (error) {
    console.error('Error fetching ESU details:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const getESUDispatch = async (req, res) => {
  const { ORDER_NUMBER, MATERIAL, MATERIAL_TEXT, BATCH, STORAGE_LOCATION, FromDate, ToDate } = req.body;

  try {
    const paddedOrderNumber = ORDER_NUMBER ? ORDER_NUMBER.padStart(12, '0') : null;
    const paddedMaterial = MATERIAL ? MATERIAL.padStart(18, '0') : null;

    const result = await executeQuery(
      `EXEC [dbo].[Sp_Rep_ESU_Dispatch] 
            @ORDER_NUMBER, 
            @MATERIAL, 
            @MATERIAL_TEXT, 
            @BATCH, 
            @STORAGE_LOCATION, 
            @FromDate, 
            @ToDate`,
      [
        {
          name: 'ORDER_NUMBER',
          type: sql.NVarChar(50),
          value: paddedOrderNumber,
        },
        { name: 'MATERIAL', type: sql.NVarChar(50), value: paddedMaterial },
        {
          name: 'MATERIAL_TEXT',
          type: sql.NVarChar(250),
          value: MATERIAL_TEXT,
        },
        { name: 'BATCH', type: sql.NVarChar(50), value: BATCH },
        {
          name: 'STORAGE_LOCATION',
          type: sql.NVarChar(20),
          value: STORAGE_LOCATION,
        },
        { name: 'FromDate', type: sql.NVarChar(10), value: FromDate },
        { name: 'ToDate', type: sql.NVarChar(10), value: ToDate },
      ]
    );
    res.json(result);
  } catch (error) {
    console.error('Error fetching ESU Dispatch details:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};
