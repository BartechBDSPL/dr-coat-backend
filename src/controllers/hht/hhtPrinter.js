import { executeQuery } from '../../config/db.js';
export const getPrinterData = async (req, res) => {
  try {
    const result = await executeQuery('EXEC [dbo].[HHT_Printer_Data]');
    // console.log(result)
    res.json(result);
  } catch (error) {
    console.error('Error fetching printer data:', error);
    res.status(500).json({ error: 'Failed to fetch printer data' });
  }
};
