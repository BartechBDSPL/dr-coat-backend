import { executeQuery, sql } from '../../config/db.js';

export const getStockTransferNumbers = async (req, res) => {
  try {
    const result = await executeQuery(`EXEC [dbo].[hht_material_receipt_get_stock_transfer_number]`);
    res.json(result);
  } catch (error) {
    console.error('Error getting stock transfer numbers:', error);
    res.status(500).json({ error: 'Failed to get stock transfer numbers' });
  }
};

export const getAllSerialNos = async (req, res) => {
  const { stock_transfer_number } = req.body;

  try {
    const result = await executeQuery(`EXEC [dbo].[hht_material_receipt_get_all_serialno] @stock_transfer_number`, [
      { name: 'stock_transfer_number', type: sql.NVarChar(50), value: stock_transfer_number },
    ]);
    res.json(result);
  } catch (error) {
    console.error('Error getting all serial nos:', error);
    res.status(500).json({ error: 'Failed to get serial nos' });
  }
};

export const updateMaterialReceipt = async (req, res) => {
  const { stock_transfer_number, serial_no, material_receipt_by } = req.body;

  try {
    const result = await executeQuery(
      `EXEC [dbo].[hht_material_receipt_update] @stock_transfer_number, @serial_no, @material_receipt_by`,
      [
        { name: 'stock_transfer_number', type: sql.NVarChar(50), value: stock_transfer_number },
        { name: 'serial_no', type: sql.NVarChar(50), value: serial_no },
        { name: 'material_receipt_by', type: sql.NVarChar(50), value: material_receipt_by },
      ]
    );
    res.json(result);
  } catch (error) {
    console.error('Error updating material receipt:', error);
    res.status(500).json({ error: 'Failed to update material receipt' });
  }
};
