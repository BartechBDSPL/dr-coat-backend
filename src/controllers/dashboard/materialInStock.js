import { executeQuery } from '../../config/db.js';

export const getMaterialInStock = async (req, res) => {
  try {
    const result = await executeQuery('EXEC [dbo].[Sp_MaterialInStock]');
    res.json(result);
  } catch (error) {
    console.error('Error fetching material stock details:', error);
    res.status(500).json({ error: 'Failed to fetch material stock details' });
  }
};
