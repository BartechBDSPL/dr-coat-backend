import { executeQuery, sql } from '../../config/db.js';

export const validateStockAdjustment = async (req, res) => {
  const { serial_no } = req.body;
  try {
    const result = await executeQuery(
      `EXEC hht_stock_adjustment_validation @serial_no`,
      [
        { name: 'serial_no', type: sql.NVarChar(255), value: serial_no || null },
      ]
    );
    res.json(result);
  } catch (error) {
    console.error('Error validating stock adjustment:', error);
    res.status(500).json({ error: 'Failed to validate stock adjustment' });
  }
};

export const updateStockAdjustment = async (req, res) => {
  const { serial_no, adjusted_by, adjustment_quantity } = req.body;
  try {
    const result = await executeQuery(
      `EXEC hht_stock_adjustment_update @serial_no, @adjusted_by, @adjustment_quantity`,
      [
        { name: 'serial_no', type: sql.NVarChar(255), value: serial_no },
        { name: 'adjusted_by', type: sql.NVarChar(50), value: adjusted_by },
        { name: 'adjustment_quantity', type: sql.Decimal(18,3), value: adjustment_quantity },
      ]
    );
    res.json(result[0]);
  } catch (error) {
    console.error('Error updating stock adjustment:', error);
    res.status(500).json({ error: 'Failed to update stock adjustment' });
  }
};