import { executeQuery } from '../../config/db.js';

export const getLocationWiseItemQty = async (req, res) => {
  try {
    const result = await executeQuery(`EXEC [dbo].[Sp_GetLocationWiseItemQty]`);

    if (Array.isArray(result) && result.length > 0) {
      res.json(result);
    } else {
      // Handle case where no data is found
      res.json({
        Status: 'F',
        Message: 'No data found for locations and item quantities.',
      });
    }
  } catch (error) {
    console.error('Error in fetching location-wise item quantities:', error);
    res.status(500).json({ Status: 'F', Message: `Error: ${error.message}` });
  }
};
