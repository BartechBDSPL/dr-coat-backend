import { executeQuery, sql } from '../../config/db.js';
import axios from 'axios';
import { ODATA_BASE_URL, ODATA_USERNAME, ODATA_PASSWORD } from '../../utils/constants.js';

export const insertStockTransferOrder = async (req, res) => {
  const {
    stock_transfer_number,
    transfer_from_code,
    transfer_to_code,
    posting_date,
    item_code,
    lot_no,
    quantity,
    packing_details,
    item_description,
    quantity_shipped,
    quantity_received,
    line_no,
    assign_user,
    created_by,
  } = req.body;

  try {
    const result = await executeQuery(
      `EXEC [dbo].[sp_stock_transfer_order_insert] @stock_transfer_number, @transfer_from_code, @transfer_to_code, @posting_date, @item_code, @lot_no, @quantity, @packing_details, @item_description, @quantity_shipped, @quantity_received, @line_no, @assign_user, @created_by`,
      [
        { name: 'stock_transfer_number', type: sql.NVarChar(50), value: stock_transfer_number },
        { name: 'transfer_from_code', type: sql.NVarChar(50), value: transfer_from_code },
        { name: 'transfer_to_code', type: sql.NVarChar(50), value: transfer_to_code },
        { name: 'posting_date', type: sql.NVarChar(15), value: posting_date },
        { name: 'item_code', type: sql.NVarChar(50), value: item_code },
        { name: 'lot_no', type: sql.NVarChar(50), value: lot_no },
        { name: 'quantity', type: sql.Decimal(18, 3), value: quantity },
        { name: 'packing_details', type: sql.NVarChar(50), value: packing_details },
        { name: 'item_description', type: sql.NVarChar(100), value: item_description },
        { name: 'quantity_shipped', type: sql.Decimal(18, 3), value: quantity_shipped },
        { name: 'quantity_received', type: sql.Decimal(18, 3), value: quantity_received },
        { name: 'line_no', type: sql.NVarChar(10), value: line_no },
        { name: 'assign_user', type: sql.NVarChar(200), value: assign_user },
        { name: 'created_by', type: sql.NVarChar(50), value: created_by },
      ]
    );
    res.json(result[0]);
  } catch (error) {
    console.error('Error inserting stock transfer order:', error);
    res.status(500).json({ error: 'Failed to insert stock transfer order' });
  }
};

export const assignUserToStockTransferOrder = async (req, res) => {
  const { id, stock_transfer_number, assign_user, updated_by } = req.body;

  try {
    const result = await executeQuery(
      `EXEC [dbo].[sp_stock_transfer_order_assign_user] @id, @stock_transfer_number, @assign_user, @updated_by`,
      [
        { name: 'id', type: sql.Int, value: id },
        { name: 'stock_transfer_number', type: sql.NVarChar(50), value: stock_transfer_number },
        { name: 'assign_user', type: sql.NVarChar(200), value: assign_user },
        { name: 'updated_by', type: sql.NVarChar(50), value: updated_by },
      ]
    );
    res.json(result[0]);
  } catch (error) {
    console.error('Error assigning user to stock transfer order:', error);
    res.status(500).json({ error: 'Failed to assign user' });
  }
};

export const getStockTransferOrderDetails = async (req, res) => {
  const { stock_transfer_number } = req.body;

  try {
    const result = await executeQuery(`EXEC [dbo].[sp_stock_transfer_order_get_details] @stock_transfer_number`, [
      { name: 'stock_transfer_number', type: sql.NVarChar(50), value: stock_transfer_number },
    ]);
    console.log(result);
    if (!result || result.length === 0 || result[0].Status === 'F') {
      // Fetch from SAP OData
      try {
        const headerUrl = `${ODATA_BASE_URL}/StockTransferWMS?$filter=No eq '${encodeURIComponent(stock_transfer_number)}'`;
        const headerResponse = await axios.get(headerUrl, {
          auth: {
            username: ODATA_USERNAME,
            password: ODATA_PASSWORD,
          },
        });
        const headerData = headerResponse.data.value;

        if (!headerData || headerData.length === 0) {
          return res.json({ Status: 'F', Message: 'Stock transfer order not found in ERP' });
        }

        const header = headerData[0];

        const lineUrl = `${ODATA_BASE_URL}/StockTransferLineWMS?$filter=Document_No eq '${encodeURIComponent(stock_transfer_number)}'`;
        const lineResponse = await axios.get(lineUrl, {
          auth: {
            username: ODATA_USERNAME,
            password: ODATA_PASSWORD,
          },
        });
        const lineData = lineResponse.data.value;

        if (!lineData || lineData.length === 0) {
          return res.json({ Status: 'F', Message: 'No line items found for this stock transfer order' });
        }

        const formattedResult = lineData.map(line => ({
          Status: 'T',
          Message: 'Valid stock transfer.',
          stock_transfer_number: header.No,
          transfer_from_code: header.Transfer_from_Code,
          transfer_to_code: header.Transfer_to_Code,
          posting_date: header.Posting_Date,
          item_code: line.No,
          lot_no: '',
          quantity: line.Quantity,
          item_description: line.Description,
          line_no: line.Line_No,
          quantity_shipped: line.Quantity_Shipped,
          quantity_received: line.Quantity_Received,
          created_by: '',
          created_date: null,
          updated_by: '',
          updated_date: null,
        }));

        res.json(formattedResult);
      } catch (odataError) {
        console.error('Error fetching from OData:', odataError);
        res.status(500).json({ error: 'Failed to fetch from ERP' });
      }
    } else {
      res.json(result);
    }
  } catch (error) {
    console.error('Error getting stock transfer order details:', error);
    res.status(500).json({ error: 'Failed to get details' });
  }
};

export const getRecentStockTransferOrders = async (req, res) => {
  try {
    const result = await executeQuery(`EXEC [dbo].[sp_stock_transfer_order_get_recent]`, []);
    res.json(result);
  } catch (error) {
    console.error('Error getting recent stock transfer orders:', error);
    res.status(500).json({ error: 'Failed to get recent orders' });
  }
};

export const getStockTransferOrdersByDateRange = async (req, res) => {
  const { from_date, to_date } = req.body;

  if (!from_date || !to_date) {
    return res.status(400).json({ error: 'from_date and to_date are required' });
  }

  try {
    const url = `${ODATA_BASE_URL}/StockTransferWMS?$filter=Posting_Date ge ${from_date} and Posting_Date le ${to_date}`;

    const response = await axios.get(url, {
      auth: {
        username: ODATA_USERNAME,
        password: ODATA_PASSWORD,
      },
      timeout: 30000, // 30 seconds timeout
    });

    const data = response.data.value;

    if (!data || data.length === 0) {
      return res.json({ Status: 'T', Message: 'No stock transfer orders found for the given date range', data: [] });
    }

    // Extract only the stock transfer numbers
    const stockTransferNumbers = data.map(item => item.No);

    res.json({ Status: 'T', Message: 'Stock transfer orders fetched successfully', data: stockTransferNumbers });
  } catch (error) {
    console.error('Error fetching stock transfer orders by date range:', error);

    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return res
        .status(504)
        .json({ Status: 'F', Message: 'ERP API request timeout. Please try again later.', data: [] });
    }

    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return res
        .status(503)
        .json({ Status: 'F', Message: 'ERP API is not responding. Please try again later.', data: [] });
    }

    if (error.response) {
      return res
        .status(error.response.status)
        .json({ Status: 'F', Message: `ERP API error: ${error.response.statusText}`, data: [] });
    }

    res.status(500).json({ Status: 'F', Message: 'Failed to fetch stock transfer orders from ERP', data: [] });
  }
};
