import { executeQuery, sql } from '../../config/db.js';

export const getShipmentOrderPendingOrders = async (req, res) => {
  const { user_name } = req.body;

  try {
    const result = await executeQuery(`EXEC [dbo].[fg_hht_shipment_order_pending_orders] @user_name`, [
      { name: 'user_name', type: sql.NVarChar(50), value: user_name },
    ]);
    res.json(result);
  } catch (error) {
    console.error('Error getting shipment order pending orders:', error);
    res.status(500).json({ error: 'Failed to get pending orders' });
  }
};

export const getShipmentOrderDetails = async (req, res) => {
  const { shipment_no, item_code, lot_no, picked_status } = req.body;

  try {
    const result = await executeQuery(
      `EXEC [dbo].[fg_hht_shipment_order_details] @shipment_no, @item_code, @lot_no, @picked_status`,
      [
        { name: 'shipment_no', type: sql.NVarChar(50), value: shipment_no },
        { name: 'item_code', type: sql.NVarChar(50), value: item_code || '' },
        { name: 'lot_no', type: sql.NVarChar(50), value: lot_no || '' },
        { name: 'picked_status', type: sql.NVarChar(10), value: picked_status },
      ]
    );
    res.json(result);
  } catch (error) {
    console.error('Error getting shipment order details:', error);
    res.status(500).json({ error: 'Failed to get details' });
  }
};

export const validateShipmentOrderBarcode = async (req, res) => {
  const { serial_no, shipment_no, shipment_lot_no, shipment_item_code } = req.body;

  try {
    const result = await executeQuery(
      `EXEC [dbo].[fg_hht_shipment_order_validation] @serial_no, @shipment_no, @shipment_lot_no, @shipment_item_code`,
      [
        { name: 'serial_no', type: sql.NVarChar(255), value: serial_no },
        { name: 'shipment_no', type: sql.NVarChar(50), value: shipment_no },
        { name: 'shipment_lot_no', type: sql.NVarChar(50), value: shipment_lot_no },
        { name: 'shipment_item_code', type: sql.NVarChar(50), value: shipment_item_code },
      ]
    );
    res.json(result[0]);
  } catch (error) {
    console.error('Error validating shipment order barcode:', error);
    res.status(500).json({ error: 'Failed to validate barcode' });
  }
};

export const updateShipmentOrderPicking = async (req, res) => {
  const { serial_no, shipment_no, shipment_item_code, picked_by, lot_no } = req.body;
  console.log(req.body);
  try {
    const result = await executeQuery(
      `EXEC [dbo].[fg_hht_shipment_order_update] @serial_no, @shipment_no, @shipment_item_code, @picked_by, @lot_no`,
      [
        { name: 'serial_no', type: sql.NVarChar(255), value: serial_no },
        { name: 'shipment_no', type: sql.NVarChar(50), value: shipment_no },
        { name: 'shipment_item_code', type: sql.NVarChar(50), value: shipment_item_code },
        { name: 'picked_by', type: sql.NVarChar(50), value: picked_by },
        { name: 'lot_no', type: sql.NVarChar(50), value: lot_no },
      ]
    );
    res.json(result[0]);
  } catch (error) {
    console.error('Error updating shipment order picking:', error);
    res.status(500).json({ error: 'Failed to update picking' });
  }
};
export const reverseShipmentOrderPicking = async (req, res) => {
  const { shipment_no, lot_no, serial_no, item_code, reverse_by } = req.body;

  try {
    const result = await executeQuery(
      `EXEC [dbo].[fg_hht_shipment_order_reversal] @shipment_no, @lot_no, @serial_no, @item_code, @reverse_by`,
      [
        { name: 'shipment_no', type: sql.NVarChar(50), value: shipment_no },
        { name: 'lot_no', type: sql.NVarChar(50), value: lot_no },
        { name: 'serial_no', type: sql.NVarChar(255), value: serial_no },
        { name: 'item_code', type: sql.NVarChar(50), value: item_code },
        { name: 'reverse_by', type: sql.NVarChar(50), value: reverse_by },
      ]
    );
    res.json(result[0]);
  } catch (error) {
    console.error('Error reversing shipment order picking:', error);
    res.status(500).json({ error: 'Failed to reverse picking' });
  }
};

export const manualCloseShipmentOrder = async (req, res) => {
  const { shipment_no, item_code, lot_no, close_by } = req.body;

  try {
    const result = await executeQuery(
      `EXEC [dbo].[fg_hht_shipment_order_manual_close] @shipment_no, @item_code, @lot_no, @close_by`,
      [
        { name: 'shipment_no', type: sql.NVarChar(50), value: shipment_no },
        { name: 'item_code', type: sql.NVarChar(50), value: item_code },
        { name: 'lot_no', type: sql.NVarChar(50), value: lot_no },
        { name: 'close_by', type: sql.NVarChar(50), value: close_by },
      ]
    );
    res.json(result[0]);
  } catch (error) {
    console.error('Error manually closing shipment order:', error);
    res.status(500).json({ error: 'Failed to close shipment order' });
  }
};

export const getShipmentOrderSerialNoSuggestions = async (req, res) => {
  const { item_code, lot_no } = req.body;

  try {
    const result = await executeQuery(`EXEC [dbo].[fg_hht_shipment_order_serial_no_suggestion] @item_code, @lot_no`, [
      { name: 'item_code', type: sql.NVarChar(50), value: item_code },
      { name: 'lot_no', type: sql.NVarChar(50), value: lot_no },
    ]);
    res.json(result);
  } catch (error) {
    console.error('Error getting serial no suggestions:', error);
    res.status(500).json({ error: 'Failed to get suggestions' });
  }
};

export const getShipmentOrderRecentPickedDetails = async (req, res) => {
  const { shipment_no, item_code, lot_no } = req.body;

  try {
    const result = await executeQuery(
      `EXEC [dbo].[fg_hht_shipment_order_recent_picked_details] @shipment_no, @item_code, @lot_no`,
      [
        { name: 'shipment_no', type: sql.NVarChar(50), value: shipment_no },
        { name: 'item_code', type: sql.NVarChar(50), value: item_code },
        { name: 'lot_no', type: sql.NVarChar(50), value: lot_no },
      ]
    );
    res.json(result);
  } catch (error) {
    console.error('Error getting recent picked details:', error);
    res.status(500).json({ error: 'Failed to get recent picked details' });
  }
};
