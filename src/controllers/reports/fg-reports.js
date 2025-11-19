import { executeQuery, sql } from '../../config/db.js';

export const putAwayReport = async (req, res) => {
  const { production_order_no, item_code, lot_no, from_date, to_date, warehouse_code } = req.body;

  try {
    const result = await executeQuery(
      `EXEC [dbo].[sp_rep_put_away] @production_order_no, @warehouse_code, @item_code, @lot_no, @from_date, @to_date`,
      [
        { name: 'production_order_no', type: sql.NVarChar(50), value: production_order_no || null },
        { name: 'warehouse_code', type: sql.NVarChar(50), value: warehouse_code || null },
        { name: 'item_code', type: sql.NVarChar(50), value: item_code || null },
        { name: 'lot_no', type: sql.NVarChar(50), value: lot_no || null },
        { name: 'from_date', type: sql.NVarChar(10), value: from_date || null },
        { name: 'to_date', type: sql.NVarChar(10), value: to_date || null },
      ]
    );
    res.json(result);
  } catch (error) {
    console.error('Error getting put away report:', error);
    res.status(500).json({ error: 'Failed to get put away report' });
  }
};

export const fgLabelPrintingReport = async (req, res) => {
  const { production_order_no, item_code, lot_no, from_date, to_date } = req.body;

  try {
    const result = await executeQuery(
      `EXEC [dbo].[sp_rep_fg_label_printing] @production_order_no, @item_code, @lot_no, @from_date, @to_date`,
      [
        { name: 'production_order_no', type: sql.NVarChar(50), value: production_order_no || null },
        { name: 'item_code', type: sql.NVarChar(50), value: item_code || null },
        { name: 'lot_no', type: sql.NVarChar(50), value: lot_no || null },
        { name: 'from_date', type: sql.NVarChar(10), value: from_date || null },
        { name: 'to_date', type: sql.NVarChar(10), value: to_date || null },
      ]
    );
    res.json(result);
  } catch (error) {
    console.error('Error getting FG label printing report:', error);
    res.status(500).json({ error: 'Failed to get FG label printing report' });
  }
};

export const internalMovementReport = async (req, res) => {
  const { production_order_no, item_code, lot_no, from_date, to_date } = req.body;

  try {
    const result = await executeQuery(
      `EXEC [dbo].[sp_rep_internal_movement] @production_order_no, @item_code, @lot_no, @from_date, @to_date`,
      [
        { name: 'production_order_no', type: sql.NVarChar(50), value: production_order_no || null },
        { name: 'item_code', type: sql.NVarChar(50), value: item_code || null },
        { name: 'lot_no', type: sql.NVarChar(50), value: lot_no || null },
        { name: 'from_date', type: sql.NVarChar(10), value: from_date || null },
        { name: 'to_date', type: sql.NVarChar(10), value: to_date || null },
      ]
    );
    res.json(result);
  } catch (error) {
    console.error('Error getting internal movement report:', error);
    res.status(500).json({ error: 'Failed to get internal movement report' });
  }
};

export const reprintFgLabelReport = async (req, res) => {
  const { production_order_no, item_code, item_description, lot_no, from_date, to_date } = req.body;

  try {
    const result = await executeQuery(
      `EXEC [dbo].[sp_rep_reprint_fg_label] @production_order_no, @item_code, @item_description, @lot_no, @from_date, @to_date`,
      [
        { name: 'production_order_no', type: sql.NVarChar(50), value: production_order_no || null },
        { name: 'item_code', type: sql.NVarChar(50), value: item_code || null },
        { name: 'item_description', type: sql.NVarChar(200), value: item_description || null },
        { name: 'lot_no', type: sql.NVarChar(50), value: lot_no || null },
        { name: 'from_date', type: sql.NVarChar(10), value: from_date || null },
        { name: 'to_date', type: sql.NVarChar(10), value: to_date || null },
      ]
    );
    res.json(result);
  } catch (error) {
    console.error('Error getting reprint FG label report:', error);
    res.status(500).json({ error: 'Failed to get reprint FG label report' });
  }
};

export const stockTransferPickingReport = async (req, res) => {
  const { stock_transfer_number, item_code, item_description, lot_no, line_no, from_date, to_date } = req.body;

  try {
    const result = await executeQuery(
      `EXEC [dbo].[sp_rep_stock_transfer_picking] @stock_transfer_number, @item_code, @item_description, @lot_no, @line_no, @from_date, @to_date`,
      [
        { name: 'stock_transfer_number', type: sql.NVarChar(50), value: stock_transfer_number || null },
        { name: 'item_code', type: sql.NVarChar(50), value: item_code || null },
        { name: 'item_description', type: sql.NVarChar(200), value: item_description || null },
        { name: 'lot_no', type: sql.NVarChar(50), value: lot_no || null },
        { name: 'line_no', type: sql.NVarChar(10), value: line_no || null },
        { name: 'from_date', type: sql.NVarChar(50), value: from_date || null },
        { name: 'to_date', type: sql.NVarChar(50), value: to_date || null },
      ]
    );
    res.json(result);
  } catch (error) {
    console.error('Error getting stock transfer picking report:', error);
    res.status(500).json({ error: 'Failed to get stock transfer picking report' });
  }
};

export const materialReceiptReport = async (req, res) => {
  const { stock_transfer_number, item_code, item_description, lot_no, line_no, from_date, to_date } = req.body;

  try {
    const result = await executeQuery(
      `EXEC [dbo].[sp_rep_material_receipt] @stock_transfer_number, @item_code, @item_description, @lot_no, @line_no, @from_date, @to_date`,
      [
        { name: 'stock_transfer_number', type: sql.NVarChar(50), value: stock_transfer_number || null },
        { name: 'item_code', type: sql.NVarChar(50), value: item_code || null },
        { name: 'item_description', type: sql.NVarChar(200), value: item_description || null },
        { name: 'lot_no', type: sql.NVarChar(50), value: lot_no || null },
        { name: 'line_no', type: sql.NVarChar(10), value: line_no || null },
        { name: 'from_date', type: sql.NVarChar(10), value: from_date || null },
        { name: 'to_date', type: sql.NVarChar(10), value: to_date || null },
      ]
    );
    res.json(result);
  } catch (error) {
    console.error('Error getting material receipt report:', error);
    res.status(500).json({ error: 'Failed to get material receipt report' });
  }
};

export const shipmentPickingReport = async (req, res) => {
  const { shipment_no, item_code, item_description, lot_no, from_date, to_date } = req.body;

  try {
    const result = await executeQuery(
      `EXEC [dbo].[sp_rep_shipment_picking] @shipment_no, @item_code, @item_description, @lot_no, @from_date, @to_date`,
      [
        { name: 'shipment_no', type: sql.NVarChar(50), value: shipment_no || null },
        { name: 'item_code', type: sql.NVarChar(50), value: item_code || null },
        { name: 'item_description', type: sql.NVarChar(200), value: item_description || null },
        { name: 'lot_no', type: sql.NVarChar(50), value: lot_no || null },
        { name: 'from_date', type: sql.NVarChar(10), value: from_date || null },
        { name: 'to_date', type: sql.NVarChar(10), value: to_date || null },
      ]
    );
    res.json(result);
  } catch (error) {
    console.error('Error getting shipment picking report:', error);
    res.status(500).json({ error: 'Failed to get shipment picking report' });
  }
};

export const materialReturnReport = async (req, res) => {
  const { shipment_no, item_code, item_description, lot_no, from_date, to_date } = req.body;

  try {
    const result = await executeQuery(
      `EXEC [dbo].[sp_rep_material_return] @shipment_no, @item_code, @item_description, @lot_no, @from_date, @to_date`,
      [
        { name: 'shipment_no', type: sql.NVarChar(50), value: shipment_no || null },
        { name: 'item_code', type: sql.NVarChar(50), value: item_code || null },
        { name: 'item_description', type: sql.NVarChar(200), value: item_description || null },
        { name: 'lot_no', type: sql.NVarChar(50), value: lot_no || null },
        { name: 'from_date', type: sql.NVarChar(10), value: from_date || null },
        { name: 'to_date', type: sql.NVarChar(10), value: to_date || null },
      ]
    );
    res.json(result);
  } catch (error) {
    console.error('Error getting material return report:', error);
    res.status(500).json({ error: 'Failed to get material return report' });
  }
};

export const fgStockTakeReport = async (req, res) => {
  const { stock_take_no, item_code, item_description, lot_no, stock_take_status, from_date, to_date } = req.body;

  try {
    const result = await executeQuery(`EXEC [dbo].[sp_rep_fg_stock_take] @stock_take_no, @item_code, @item_description, @lot_no, @stock_take_status, @from_date, @to_date`, [
      { name: 'stock_take_no', type: sql.Int, value: stock_take_no || null },
      { name: 'item_code', type: sql.NVarChar(50), value: item_code || null },
      { name: 'item_description', type: sql.NVarChar(200), value: item_description || null },
      { name: 'lot_no', type: sql.NVarChar(50), value: lot_no || null },
      { name: 'stock_take_status', type: sql.NVarChar(10), value: stock_take_status || null },
      { name: 'from_date', type: sql.NVarChar(10), value: from_date || null },
      { name: 'to_date', type: sql.NVarChar(10), value: to_date || null },
    ]);
    res.json(result);
  } catch (error) {
    console.error('Error getting FG stock take report:', error);
    res.status(500).json({ error: 'Failed to get FG stock take report' });
  }
};

export const fgStockAdjustmentReport = async (req, res) => {
  const { item_code, item_description, lot_no, from_date, to_date } = req.body;

  try {
    const result = await executeQuery(`EXEC [dbo].[sp_rep_fg_stock_asjutment] @item_code, @item_description, @lot_no, @from_date, @to_date`, [
      { name: 'item_code', type: sql.NVarChar(50), value: item_code || null },
      { name: 'item_description', type: sql.NVarChar(200), value: item_description || null },
      { name: 'lot_no', type: sql.NVarChar(50), value: lot_no || null },
      { name: 'from_date', type: sql.NVarChar(10), value: from_date || null },
      { name: 'to_date', type: sql.NVarChar(10), value: to_date || null },
    ]);
    res.json(result);
  } catch (error) {
    console.error('Error getting FG stock adjustment report:', error);
    res.status(500).json({ error: 'Failed to get FG stock adjustment report' });
  }
};
