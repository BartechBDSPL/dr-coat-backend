import { executeQuery, sql } from "../../config/db.js";
import axios from 'axios';
import { ODATA_BASE_URL, ODATA_USERNAME, ODATA_PASSWORD } from '../../utils/constants.js';

export const getGRNDetails = async (req, res) => {
  const { grn_no } = req.body;

  try {
    const result = await executeQuery('EXEC sp_grn_get_details @grn_no', [
      { name: 'grn_no', type: sql.NVarChar, value: grn_no }
    ]);

    if (result[0].Status === "F" && result[0].Message.includes("GRN does not")) {
      // Fetch from OData
      const url = `${ODATA_BASE_URL}/DR_UAT/ODataV4/Company('DRC%20UAT%2005032024')/GRNWMS?$filter=GRNNo eq '${grn_no}'`;
      const odataResponse = await axios.get(url, {
        auth: {
          username: ODATA_USERNAME,
          password: ODATA_PASSWORD,
        },
      });
      const odataData = odataResponse.data.value;

      // Insert each item
      for (const item of odataData) {
        await executeQuery(
          'EXEC sp_grn_insert @grn_no, @vendor_code, @vendor_name, @po_no, @po_date, @grn_done_by, @type, @item_code, @item_description, @lot_no, @location_code, @quantity, @packing_detail, @item_category_code, @uom, @product_group_code, @loctain_code, @mfg_date, @exp_date, @created_by',
          [
            { name: 'grn_no', type: sql.NVarChar, value: item.GRNNo },
            { name: 'vendor_code', type: sql.NVarChar, value: item.VendorCode },
            { name: 'vendor_name', type: sql.NVarChar, value: item.VendorName },
            { name: 'po_no', type: sql.NVarChar, value: item.PoNo },
            { name: 'po_date', type: sql.NVarChar, value: item.PODate },
            { name: 'grn_done_by', type: sql.NVarChar, value: item.GRNDoneBy },
            { name: 'type', type: sql.NVarChar, value: item.Entry_Type },
            { name: 'item_code', type: sql.NVarChar, value: item.Item_No },
            { name: 'item_description', type: sql.NVarChar, value: item.Description },
            { name: 'lot_no', type: sql.NVarChar, value: item.LotNo },
            { name: 'location_code', type: sql.NVarChar, value: item.Location_Code },
            { name: 'quantity', type: sql.Decimal(18, 3), value: item.Quantity },
            { name: 'packing_detail', type: sql.NVarChar, value: item.PackingDetail },
            { name: 'item_category_code', type: sql.NVarChar, value: '' },
            { name: 'uom', type: sql.NVarChar, value: item.Unit_Of_Measurement },
            { name: 'product_group_code', type: sql.NVarChar, value: '' },
            { name: 'loctain_code', type: sql.NVarChar, value: '' },
            { name: 'mfg_date', type: sql.NVarChar, value: '' },
            { name: 'exp_date', type: sql.NVarChar, value: '' },
            { name: 'created_by', type: sql.NVarChar, value: 'system' },
          ]
        );
      }

      // Refetch
      const updatedResult = await executeQuery('EXEC sp_grn_get_details @grn_no', [
        { name: 'grn_no', type: sql.NVarChar, value: grn_no }
      ]);

      res.status(200).json(updatedResult[0]);
    } else {
      res.status(200).json(result[0]);
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};


export const checkSalesOrderUniqueNumber = async (req, res) => {
  try {
    const url = `${ODATA_BASE_URL}/DR_UAT/ODataV4/Company('DRC UAT 05032024')/SalesOrdersWMS`;
    const response = await axios.get(url, {
      auth: {
        username: ODATA_USERNAME,
        password: ODATA_PASSWORD,
      },
    });

    const data = response.data.value;
    const nos = data.map(item => item.No);
    const uniqueNos = new Set(nos);

    if (uniqueNos.size === nos.length) {
      console.log('All item nos are unique');
      res.status(200).json({ unique: true, message: 'All item nos are unique' });
    } else {
      const duplicates = nos.filter((No, index) => nos.indexOf(No) !== index);
      const uniqueDuplicates = [...new Set(duplicates)];
      console.log('Duplicate item nos:', uniqueDuplicates);
      res.status(200).json({ unique: false, duplicates: uniqueDuplicates, message: 'Some item nos are not unique' });
    }
  } catch (error) {
    console.error('Error checking unique item nos:', error);
    res.status(500).json({ error: error.message });
  }
};


export const checkSalesOrderLineUniqueNumber = async (req, res) => {
  try {
    const url = `${ODATA_BASE_URL}/DR_UAT/ODataV4/Company(%27DRC UAT 05032024%27)/SalesOrdersLineWMS`;
    const response = await axios.get(url, {
      auth: {
        username: ODATA_USERNAME,
        password: ODATA_PASSWORD,
      },
    });

    const data = response.data.value;
    const nos = data.map(item => item.Document_No);
    const uniqueNos = new Set(nos);

    if (uniqueNos.size === nos.length) {
      console.log('All item nos are unique');
      res.status(200).json({ unique: true, message: 'All item nos are unique' });
    } else {
      const duplicates = nos.filter((Document_No, index) => nos.indexOf(Document_No) !== index);
      const uniqueDuplicates = [...new Set(duplicates)];
      console.log('Duplicate item nos:', uniqueDuplicates);
      res.status(200).json({ unique: false, duplicates: uniqueDuplicates, message: 'Some item nos are not unique' });
    }
  } catch (error) {
    console.error('Error checking unique item nos:', error);
    res.status(500).json({ error: error.message });
  }
};



