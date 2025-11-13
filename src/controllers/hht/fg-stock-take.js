import { executeQuery, sql } from '../../config/db.js';

export const getStockTakeNo = async (req, res) => {
  const { category, type } = req.body;
  try {
    const result = await executeQuery(`EXEC hht_stock_take_no_get @category, @type`, [
      { name: 'category', type: sql.NVarChar(10), value: category || null },
      { name: 'type', type: sql.NVarChar(10), value: type || null },
    ]);
    res.json(result[0]);
  } catch (error) {
    console.error('Error getting stock take no:', error);
    res.status(500).json({ error: 'Failed to get stock take no' });
  }
};

export const validateStockTake = async (req, res) => {
  const { location, serial_no } = req.body;
  try {
    const result = await executeQuery(`EXEC hht_stock_take_validation @location, @serial_no`, [
      { name: 'location', type: sql.NVarChar(50), value: location || null },
      { name: 'serial_no', type: sql.NVarChar(255), value: serial_no || null },
    ]);
    res.json(result);
  } catch (error) {
    console.error('Error validating stock take:', error);
    res.status(500).json({ error: 'Failed to validate stock take' });
  }
};

export const updateStockTake = async (req, res) => {
  const { stock_take_no, serial_no, system_quantity, physical_quantity, stock_take_by } = req.body;
  try {
    const result = await executeQuery(
      `EXEC hht_stock_take_update @stock_take_no, @serial_no, @system_quantity, @physical_quantity, @stock_take_by`,
      [
        { name: 'stock_take_no', type: sql.Int, value: stock_take_no },
        { name: 'serial_no', type: sql.NVarChar(255), value: serial_no },
        { name: 'system_quantity', type: sql.Decimal(18, 3), value: system_quantity },
        { name: 'physical_quantity', type: sql.Decimal(18, 3), value: physical_quantity },
        { name: 'stock_take_by', type: sql.NVarChar(50), value: stock_take_by },
      ]
    );
    res.json(result);
  } catch (error) {
    console.error('Error updating stock take:', error);
    res.status(500).json({ error: 'Failed to update stock take' });
  }
};
