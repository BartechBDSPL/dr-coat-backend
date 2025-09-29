import { executeQuery, sql } from '../../config/db.js';

export const insertShift = async (req, res) => {
  const { Shift_Name, Shift_Description, FromTime, ToTime, Created_By } = req.body;

  try {
    const result = await executeQuery(
      `EXEC [dbo].[Sp_Shift_Master_Insert] 
                @Shift_Name, 
                @Shift_Description, 
                @FromTime, 
                @ToTime, 
                @Created_By`,
      [
        { name: 'Shift_Name', type: sql.NVarChar(100), value: Shift_Name },
        {
          name: 'Shift_Description',
          type: sql.NVarChar(255),
          value: Shift_Description,
        },
        { name: 'FromTime', type: sql.Time, value: FromTime },
        { name: 'ToTime', type: sql.Time, value: ToTime },
        { name: 'Created_By', type: sql.NVarChar(100), value: Created_By },
      ]
    );

    res.json(result[0]);
  } catch (error) {
    console.error('Error inserting shift master:', error);
    res.status(500).json({ error: error.message });
  }
};

export const updateShift = async (req, res) => {
  const { Shift_Name, Shift_Description, FromTime, ToTime, Updated_By } = req.body;

  try {
    const result = await executeQuery(
      `EXEC [dbo].[Sp_Shift_Master_Update] 
                @Shift_Name, 
                @Shift_Description, 
                @FromTime, 
                @ToTime, 
                @Updated_By`,
      [
        { name: 'Shift_Name', type: sql.NVarChar(100), value: Shift_Name },
        {
          name: 'Shift_Description',
          type: sql.NVarChar(255),
          value: Shift_Description,
        },
        { name: 'FromTime', type: sql.Time, value: FromTime },
        { name: 'ToTime', type: sql.Time, value: ToTime },
        { name: 'Updated_By', type: sql.NVarChar(100), value: Updated_By },
      ]
    );
    res.json(result[0]);
  } catch (error) {
    console.error('Error executing stored procedure:', error);
    res.status(500).json({ error: 'Failed to update shift master' });
  }
};

export const getAllShift = async (req, res) => {
  try {
    const result = await executeQuery(`EXEC [dbo].[Sp_Shift_Master_GetAll]`);
    res.json(result);
  } catch (error) {
    console.error('Error executing stored procedure:', error);
    res.status(500).json({ error: 'Failed to retrieve shifts' });
  }
};
