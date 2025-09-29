import { executeQuery } from '../../config/db.js';
import { sql } from '../../config/db.js';

export const getAllLineMaster = async (req, res) => {
  try {
    const result = await executeQuery('EXEC [dbo].[Sp_Line_GetAllDetails]');
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const insertLineMaster = async (req, res) => {
  const { plant, lineCode, lineDesc, lineIP, user } = req.body;
  try {
    const result = await executeQuery(
      'EXEC [dbo].[Sp_Line_InsertDetails] @Plant, @LineCode, @LineDesc, @LineIP, @User',
      {
        Plant: { type: sql.NVarChar(50), value: plant },
        LineCode: { type: sql.NVarChar(50), value: lineCode },
        LineDesc: { type: sql.NVarChar(50), value: lineDesc },
        LineIP: { type: sql.NVarChar(50), value: lineIP },
        User: { type: sql.NVarChar(50), value: user },
      }
    );
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
export const updateLineMaster = async (req, res) => {
  const { plant, lineCode, lineDesc, lineIP, user, id } = req.body;
  try {
    const result = await executeQuery(
      'EXEC [dbo].[Sp_Line_UpdateDetails] @Plant, @LineCode, @LineDesc, @LineIP, @User, @Id',
      {
        plant: { type: sql.NVarChar(50), value: plant },
        lineCode: { type: sql.NVarChar(50), value: lineCode },
        lineDesc: { type: sql.NVarChar(50), value: lineDesc },
        lineIP: { type: sql.NVarChar(50), value: lineIP },
        user: { type: sql.NVarChar(50), value: user },
        id: { type: sql.Int, value: id },
      }
    );
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getPlantName = async (req, res) => {
  try {
    const result = await executeQuery('EXEC [dbo].[Sp_Line_GetAllPlantNames]');
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
