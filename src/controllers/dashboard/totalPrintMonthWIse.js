import { executeQuery, sql } from '../../config/db.js';

export const getBoxAndPalletCountByMonth = async (req, res) => {
  const { Year } = req.body;

  try {
    const result = await executeQuery(`EXEC [dbo].[Sp_BoxAndPalletCountByMonth] @Year`, [
      { name: 'Year', type: sql.Int, value: Year },
    ]);
    res.json(result);
  } catch (error) {
    console.error('Error fetching box and pallet count by month:', error);
    res.status(500).json({ error: 'Failed to fetch box and pallet count data' });
  }
};

export const pickVsPutLastSixMonth = async (req, res) => {
  try {
    const result = await executeQuery(`EXEC Sp_PutVsPick_Last6Month`);

    res.json(result);
  } catch (error) {
    console.error('Error fetching pick vs put data for last 6 months:', error);
    res.status(500).json({ error: error.message });
  }
};

export const Sp_PutVsPick_Last7Days = async (req, res) => {
  try {
    // Execute the stored procedure
    const result = await executeQuery(`EXEC Sp_PutVsPick_Last7Days`);

    res.json(result);
  } catch (error) {
    console.error('Error fetching pick vs put data for last 6 months:', error);
    res.status(500).json({ error: error.message });
  }
};
