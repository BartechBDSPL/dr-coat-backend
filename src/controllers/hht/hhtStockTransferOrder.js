import { executeQuery, sql } from '../../config/db.js';

export const getPendingStockTransferOrders = async (req, res) => {
  const { user_name } = req.body;

  try {
    const result = await executeQuery(`EXEC [dbo].[hht_stock_transfer_order_pending_orders] @user_name`, [
      { name: 'user_name', type: sql.NVarChar(50), value: user_name },
    ]);
    res.json(result);
  } catch (error) {
    console.error('Error getting pending stock transfer orders:', error);
    res.status(500).json({ error: 'Failed to get pending orders' });
  }
};

export const getStockTransferOrderDetails = async (req, res) => {
  const { stock_transfer_number, item_code, line_no, picked_status } = req.body;

  try {
    const result = await executeQuery(
      `EXEC [dbo].[hht_stock_transfer_order_details] @stock_transfer_number, @item_code, @line_no, @picked_status`,
      [
        { name: 'stock_transfer_number', type: sql.NVarChar(50), value: stock_transfer_number },
        { name: 'item_code', type: sql.NVarChar(50), value: item_code },
        { name: 'line_no', type: sql.NVarChar(10), value: line_no },
        { name: 'picked_status', type: sql.NVarChar(10), value: picked_status },
      ]
    );
    res.json(result);
  } catch (error) {
    console.error('Error getting stock transfer order details:', error);
    res.status(500).json({ error: 'Failed to get details' });
  }
};

export const validateStockTransfer = async (req, res) => {
  const { stock_transfer_number, item_code, line_no, serial_no } = req.body;

  try {
    const result = await executeQuery(
      `EXEC [dbo].[hht_stock_transfer_validation] @stock_transfer_number, @item_code, @line_no, @serial_no`,
      [
        { name: 'stock_transfer_number', type: sql.NVarChar(50), value: stock_transfer_number },
        { name: 'item_code', type: sql.NVarChar(50), value: item_code },
        { name: 'line_no', type: sql.NVarChar(10), value: line_no },
        { name: 'serial_no', type: sql.NVarChar(255), value: serial_no },
      ]
    );
    res.json(result);
  } catch (error) {
    console.error('Error validating stock transfer:', error);
    res.status(500).json({ error: 'Failed to validate' });
  }
};

export const updateStockTransfer = async (req, res) => {
  const { stock_transfer_number, item_code, lot_no, line_no, serial_no, picked_by } = req.body;

  try {
    const result = await executeQuery(
      `EXEC [dbo].[hht_stock_transfer_update] @stock_transfer_number, @item_code, @lot_no, @line_no, @serial_no, @picked_by`,
      [
        { name: 'stock_transfer_number', type: sql.NVarChar(50), value: stock_transfer_number },
        { name: 'item_code', type: sql.NVarChar(50), value: item_code },
        { name: 'lot_no', type: sql.NVarChar(50), value: lot_no },
        { name: 'line_no', type: sql.NVarChar(10), value: line_no },
        { name: 'serial_no', type: sql.NVarChar(255), value: serial_no },
        { name: 'picked_by', type: sql.NVarChar(50), value: picked_by },
      ]
    );
    res.json(result[0]);
  } catch (error) {
    console.error('Error updating stock transfer:', error);
    res.status(500).json({ error: 'Failed to update' });
  }
};

export const reverseStockTransfer = async (req, res) => {
  const { stock_transfer_number, item_code, line_no, serial_no, reverse_by } = req.body;

  try {
    const result = await executeQuery(
      `EXEC [dbo].[hht_stock_transfer_reversal] @stock_transfer_number, @item_code, @line_no, @serial_no, @reverse_by`,
      [
        { name: 'stock_transfer_number', type: sql.NVarChar(50), value: stock_transfer_number },
        { name: 'item_code', type: sql.NVarChar(50), value: item_code },
        { name: 'line_no', type: sql.NVarChar(10), value: line_no },
        { name: 'serial_no', type: sql.NVarChar(255), value: serial_no },
        { name: 'reverse_by', type: sql.NVarChar(50), value: reverse_by },
      ]
    );
    res.json(result[0]);
  } catch (error) {
    console.error('Error reversing stock transfer:', error);
    res.status(500).json({ error: 'Failed to reverse' });
  }
};

export const getSerialNoSuggestions = async (req, res) => {
  const { item_code } = req.body;

  try {
    const result = await executeQuery(`EXEC [dbo].[hht_stock_transfer_order_serial_no_suggestion] @item_code`, [
      { name: 'item_code', type: sql.NVarChar(50), value: item_code },
    ]);
    res.json(result);
  } catch (error) {
    console.error('Error getting serial no suggestions:', error);
    res.status(500).json({ error: 'Failed to get suggestions' });
  }
};

export const manualCloseStockTransferOrder = async (req, res) => {
  const { stock_transfer_no, item_code, line_no, closed_by } = req.body;

  try {
    const result = await executeQuery(
      `EXEC [dbo].[hht_stock_transfer_order_manual_close] @stock_transfer_no, @item_code, @line_no, @closed_by`,
      [
        { name: 'stock_transfer_no', type: sql.NVarChar(50), value: stock_transfer_no },
        { name: 'item_code', type: sql.NVarChar(50), value: item_code },
        { name: 'line_no', type: sql.NVarChar(10), value: line_no },
        { name: 'closed_by', type: sql.NVarChar(50), value: closed_by },
      ]
    );

    res.json(result[0]);
  } catch (error) {
    console.error('Error closing stock transfer order:', error);
    res.status(500).json({ error: 'Failed to close order' });
  }
};

export const getRecentPickedDetails = async (req, res) => {
  const { stock_transfer_number, line_no, item_code } = req.body;

  try {
    const result = await executeQuery(
      `EXEC [dbo].[hht_stock_transfer_order_recent_picked_details] @stock_transfer_number, @line_no, @item_code`,
      [
        { name: 'stock_transfer_number', type: sql.NVarChar(50), value: stock_transfer_number },
        { name: 'line_no', type: sql.NVarChar(10), value: line_no },
        { name: 'item_code', type: sql.NVarChar(50), value: item_code },
      ]
    );

    res.json(result);
  } catch (error) {
    console.error('Error getting recent picked details:', error);
    res.status(500).json({ error: 'Failed to get recent picked details' });
  }
};
