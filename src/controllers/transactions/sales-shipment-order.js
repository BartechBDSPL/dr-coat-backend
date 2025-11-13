import { executeQuery, sql } from '../../config/db.js';
import axios from 'axios';
import { ODATA_BASE_URL, ODATA_USERNAME, ODATA_PASSWORD } from '../../utils/constants.js';
export const insertSalesShipmentOrder = async (req, res) => {
    const {
        entry_no,
        order_no,
        shipment_no,
        sell_to_customer_no,
        sell_to_customer_name,
        order_date,
        posting_date,
        external_document_no,
        item_code,
        item_description,
        variant_code,
        location_code,
        quantity,
        packing_details,
        uom,
        lot_no,
        truck_no,
        driver_name,
        driver_contact_no,
        created_by,
        assign_user
    } = req.body;

    try {
        const result = await executeQuery(`EXEC [dbo].[sp_shipment_order_insert] @entry_no, @order_no, @shipment_no, @sell_to_customer_no, @sell_to_customer_name, @order_date, @posting_date, @external_document_no, @item_code, @item_description, @variant_code, @location_code, @quantity, @packing_details, @uom, @lot_no, @truck_no, @driver_name, @driver_contact_no, @assign_user, @created_by`, [
            { name: 'entry_no', type: sql.NVarChar(10), value: entry_no },
            { name: 'order_no', type: sql.NVarChar(50), value: order_no },
            { name: 'shipment_no', type: sql.NVarChar(50), value: shipment_no },
            { name: 'sell_to_customer_no', type: sql.NVarChar(50), value: sell_to_customer_no },
            { name: 'sell_to_customer_name', type: sql.NVarChar(200), value: sell_to_customer_name },
            { name: 'order_date', type: sql.NVarChar(10), value: order_date },
            { name: 'posting_date', type: sql.NVarChar(10), value: posting_date },
            { name: 'external_document_no', type: sql.NVarChar(50), value: external_document_no },
            { name: 'item_code', type: sql.NVarChar(50), value: item_code },
            { name: 'item_description', type: sql.NVarChar(200), value: item_description },
            { name: 'variant_code', type: sql.NVarChar(50), value: variant_code },
            { name: 'location_code', type: sql.NVarChar(50), value: location_code },
            { name: 'quantity', type: sql.Decimal(18,3), value: quantity },
            { name: 'packing_details', type: sql.NVarChar(50), value: packing_details },
            { name: 'uom', type: sql.NVarChar(10), value: uom },
            { name: 'lot_no', type: sql.NVarChar(50), value: lot_no },
            { name: 'truck_no', type: sql.NVarChar(10), value: truck_no },
            { name: 'driver_name', type: sql.NVarChar(50), value: driver_name },
            { name: 'driver_contact_no', type: sql.NVarChar(20), value: driver_contact_no },
            { name: 'assign_user', type: sql.NVarChar(200), value: assign_user },
            { name: 'created_by', type: sql.NVarChar(50), value: created_by },
        ]);
        res.json(result[0]);
    } catch (error) {
        console.error('Error inserting sales shipment order:', error);
        res.status(500).json({ error: 'Failed to insert sales shipment order' });
    }
};

export const assignUserToSalesShipmentOrder = async (req, res) => {
  const { shipment_no, item_code, lot_no, assign_user, updated_by } = req.body;

  try {
    const result = await executeQuery(`EXEC [dbo].[sp_shipment_order_assign_user] @shipment_no, @item_code, @lot_no, @assign_user, @updated_by`, [
      { name: 'shipment_no', type: sql.NVarChar(50), value: shipment_no },
      { name: 'item_code', type: sql.NVarChar(50), value: item_code },
      { name: 'lot_no', type: sql.NVarChar(50), value: lot_no },
      { name: 'assign_user', type: sql.NVarChar(200), value: assign_user },
      { name: 'updated_by', type: sql.NVarChar(50), value: updated_by },
    ]);
    res.json(result[0]);
  } catch (error) {
    console.error('Error assigning user to sales shipment order:', error);
    res.status(500).json({ error: 'Failed to assign user' });
  }
};

export const getSalesShipmentOrderDetails = async (req, res) => {
  const { shipment_no } = req.body;

  try {
    const result = await executeQuery(`EXEC [dbo].[sp_shipment_order_get_details] @shipment_no`, [
      { name: 'shipment_no', type: sql.NVarChar(50), value: shipment_no },
    ]);
    console.log(result);

    if (!result || result.length === 0 || (result.length > 0 && result[0].Status === 'F' && result[0].Message.includes('Incorrect shipment no.'))) {
      // Fetch from SAP OData
      try {
        const url = `${ODATA_BASE_URL}/DR_UAT/ODataV4/Company('DRC UAT 05032024')/SalesShipmentDetailsWMS?$filter=ShipmentNo eq '${encodeURIComponent(shipment_no)}'`;
        const response = await axios.get(url, {
          auth: {
            username: ODATA_USERNAME,
            password: ODATA_PASSWORD,
          },
        });
        const data = response.data.value;
        console.log("Response is ",response, url)
        if (!data || data.length === 0) {
          return res.json({ Status: 'F', Message: 'Sales shipment order not found in ERP' });
        }
        const formattedResult = data.map(item => ({
          shipment_no: item.ShipmentNo,
          order_no: item.Order_No,
          item_code: item.ItemNo,
          item_description: item.Description,
          lot_no: item.Lot_No,
          packing_details: item.Packing_Details,
          item_reference_number: item.Item_Reference_No,
          assigned_user: '',
          picked_status: 'Open',
          quantity: item.Quantity,
          remaining_qty: item.Quantity,
          truck_no: '',
          driver_name: '',
          driver_contact_no: ''
        }));

        res.json({ isFromAPI: true, data: formattedResult });
      } catch (odataError) {
        console.error('Error fetching from OData:', odataError);
        res.status(500).json({ error: 'Failed to fetch from ERP' });
      }
    } else if(result[0].Status === 'F' && result[0].Message.includes('Shipment order picking is completed')){
      res.json(result[0]);
    } else {
      const formattedResult = result.map(item => ({
        shipment_no: item.shipment_no,
        order_no: item.order_no,
        item_code: item.item_code,
        item_description: item.item_description,
        lot_no: item.lot_no,
        packing_details: item.packing_details,
        item_reference_number: item.item_reference_number,
        assigned_user: item.assigned_user,
        picked_status: item.picked_status,
        quantity: item.quantity,
        remaining_qty: item.remaining_qty,
        truck_no: item.truck_no,
        driver_name: item.driver_name,
        driver_contact_no: item.driver_contact_no
      }));
      res.json({ isFromAPI: false, data: formattedResult });
    }
  } catch (error) {
    console.error('Error getting sales shipment order details:', error);
    res.status(500).json({ error: 'Failed to get details' });
  }
};

export const getRecentSalesShipmentOrders = async (req, res) => {
  try {
    const result = await executeQuery(`EXEC [dbo].[sp_shipment_order_get_recent]`, []);
    res.json(result);
  } catch (error) {
    console.error('Error getting recent sales shipment orders:', error);
    res.status(500).json({ error: 'Failed to get recent orders' });
  }
};