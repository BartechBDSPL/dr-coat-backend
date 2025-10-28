import { executeQuery } from '../../config/db.js';
import { sql } from '../../config/db.js';

export const insertFgLabelPrinting = async (req, res) => {
  const {
    fg_label_number,
    source_no,
    item_code,
    item_description,
    lot_no,
    qc_status,
    plan_quantity,
    customer_no,
    customer_name,
    due_date,
    location,
    starting_date,
    ending_date,
    uom,
    finished_quantity,
    sub_contractor_order_no,
    sub_contractor_code,
    created_by,
  } = req.body;

  try {
    const result = await executeQuery(
      'EXEC sp_fg_label_printing_insert @fg_label_number, @source_no, @item_code, @item_description, @lot_no, @qc_status, @plan_quantity, @customer_no, @customer_name, @due_date, @location, @starting_date, @ending_date, @uom, @finished_quantity, @sub_contractor_order_no, @sub_contractor_code, @created_by',
      [
        { name: 'fg_label_number', type: sql.NVarChar, value: fg_label_number },
        { name: 'source_no', type: sql.NVarChar, value: source_no },
        { name: 'item_code', type: sql.NVarChar, value: item_code },
        { name: 'item_description', type: sql.NVarChar, value: item_description },
        { name: 'lot_no', type: sql.NVarChar, value: lot_no },
        { name: 'qc_status', type: sql.NVarChar, value: qc_status },
        { name: 'plan_quantity', type: sql.Decimal, value: plan_quantity },
        { name: 'customer_no', type: sql.NVarChar, value: customer_no },
        { name: 'customer_name', type: sql.NVarChar, value: customer_name },
        { name: 'due_date', type: sql.NVarChar, value: due_date },
        { name: 'location', type: sql.NVarChar, value: location },
        { name: 'starting_date', type: sql.NVarChar, value: starting_date },
        { name: 'ending_date', type: sql.NVarChar, value: ending_date },
        { name: 'uom', type: sql.NVarChar, value: uom },
        { name: 'finished_quantity', type: sql.Decimal, value: finished_quantity },
        { name: 'sub_contractor_order_no', type: sql.NVarChar, value: sub_contractor_order_no },
        { name: 'sub_contractor_code', type: sql.NVarChar, value: sub_contractor_code },
        { name: 'created_by', type: sql.NVarChar, value: created_by },
      ]
    );

    res.status(200).json(result[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

export const getAllFgLabelPrinting = async (req, res) => {
  try {
    const result = await executeQuery('EXEC sp_fg_label_printing_get_all');
    res.status(200).json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

export const getFgLabelPrintingDetails = async (req, res) => {
  const { fg_label_number } = req.params;

  try {
    const result = await executeQuery(
      'EXEC sp_fg_label_printing_get_details @fg_label_number',
      [
        { name: 'fg_label_number', type: sql.NVarChar, value: fg_label_number },
      ]
    );

    res.status(200).json(result[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};