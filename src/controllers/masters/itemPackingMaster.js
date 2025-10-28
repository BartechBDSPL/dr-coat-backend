import { executeQuery } from '../../config/db.js';
import { sql } from '../../config/db.js';
import axios from 'axios';
import { ODATA_BASE_URL, ODATA_USERNAME, ODATA_PASSWORD } from '../../utils/constants.js';

export const getAllItemPackingDetails = async (req, res) => {
  try {
    const result = await executeQuery('EXEC sp_item_packing_list_get_all');
    const dbCount = result.length;

    try {
      const url = `${ODATA_BASE_URL}/DR_UAT/ODataV4/Company('DRC%20UAT%2005032024')/ItemPackingListWMS`;
      const odataResponse = await axios.get(url, {
        auth: {
          username: ODATA_USERNAME,
          password: ODATA_PASSWORD,
        },
      });
      const odataData = odataResponse.data.value;
      const odataCount = odataData.length;

      if (dbCount !== odataCount) {
        console.log(`Counts differ: DB ${dbCount}, OData ${odataCount}. Syncing item packing list...`);
        for (const item of odataData) {
          await executeQuery(
            'EXEC sp_item_packing_list_upsert @item_no, @cust_no, @packing_code, @qty_per_uom, @description, @uom_major_value, @updated_by',
            [
              { name: 'item_no', type: sql.NVarChar, value: item.Item_No },
              { name: 'cust_no', type: sql.NVarChar, value: item.Cust_No },
              { name: 'packing_code', type: sql.NVarChar, value: item.packingCode },
              { name: 'qty_per_uom', type: sql.NVarChar, value: item.qtyPerUOM.toString() },
              { name: 'description', type: sql.NVarChar, value: item.description },
              { name: 'uom_major_value', type: sql.NVarChar, value: item.UnitOfMeasureMajorValue },
              { name: 'updated_by', type: sql.NVarChar, value: 'system' },
            ]
          );
        }
        // Refetch after sync
        const updatedResult = await executeQuery('EXEC sp_item_packing_list_get_all');
        res.status(200).json(updatedResult);
      } else {
        res.status(200).json(result);
      }
    } catch (odataError) {
      console.error('Error fetching OData:', odataError.message);
      res.status(200).json(result);
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

export const insertItemPackingDetails = async (req, res) => {
  const {
    item_no,
    cust_no,
    packing_code,
    qty_per_uom,
    description,
    uom_major_value,
    created_by,
  } = req.body;

  try {
    const result = await executeQuery(
      'EXEC sp_item_packing_list_insert @item_no, @cust_no, @packing_code, @qty_per_uom, @description, @uom_major_value, @created_by',
      [
        { name: 'item_no', type: sql.NVarChar, value: item_no },
        { name: 'cust_no', type: sql.NVarChar, value: cust_no },
        { name: 'packing_code', type: sql.NVarChar, value: packing_code },
        { name: 'qty_per_uom', type: sql.NVarChar, value: qty_per_uom },
        { name: 'description', type: sql.NVarChar, value: description },
        { name: 'uom_major_value', type: sql.NVarChar, value: uom_major_value },
        { name: 'created_by', type: sql.NVarChar, value: created_by },
      ]
    );

    res.status(200).json(result[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

export const updateItemPackingDetails = async (req, res) => {
  const {
    id,
    item_no,
    cust_no,
    packing_code,
    qty_per_uom,
    description,
    uom_major_value,
    updated_by,
  } = req.body;

  try {
    const result = await executeQuery(
      'EXEC sp_item_packing_list_update @id, @item_no, @cust_no, @packing_code, @qty_per_uom, @description, @uom_major_value, @updated_by',
      [
        { name: 'id', type: sql.Int, value: id },
        { name: 'item_no', type: sql.NVarChar, value: item_no },
        { name: 'cust_no', type: sql.NVarChar, value: cust_no },
        { name: 'packing_code', type: sql.NVarChar, value: packing_code },
        { name: 'qty_per_uom', type: sql.NVarChar, value: qty_per_uom },
        { name: 'description', type: sql.NVarChar, value: description },
        { name: 'uom_major_value', type: sql.NVarChar, value: uom_major_value },
        { name: 'updated_by', type: sql.NVarChar, value: updated_by },
      ]
    );

    res.status(200).json(result[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};