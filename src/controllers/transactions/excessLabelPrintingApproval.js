import { executeQuery, sql } from '../../config/db.js';

export const approveExcessProductionOrder = async (req, res) => {
  const { OrderNumber, ApprovedBy, ApprovedStatus, Remark } = req.body;

  try {
    // Split the order numbers by $ delimiter
    const orderNumbers = OrderNumber.split('$');
    const results = [];

    // Process each order number
    for (const singleOrderNumber of orderNumbers) {
      if (singleOrderNumber.trim()) {
        const result = await executeQuery(
          `EXEC [dbo].[Sp_ExcessProductionOrder_Approve] @OrderNumber, @ApprovedBy, @ApproveStatus, @Remark`,
          [
            {
              name: 'OrderNumber',
              type: sql.NVarChar(100),
              value: singleOrderNumber.trim(),
            },
            { name: 'ApprovedBy', type: sql.VarChar(100), value: ApprovedBy },
            {
              name: 'ApproveStatus',
              type: sql.VarChar(100),
              value: ApprovedStatus,
            },
            {
              name: 'Remark',
              type: sql.VarChar(100),
              value: ApprovedStatus === 'Y' ? '' : Remark,
            },
          ]
        );
        results.push(result[0]);
      }
    }

    res.json(results[0]);
  } catch (error) {
    console.error('Error approving excess production order:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const getRecentRequestedApprovalOrder = async (req, res) => {
  try {
    const result = await executeQuery(`EXEC [dbo].[SP_Recent_ExcessApprovalOrders]`);

    res.json(result);
  } catch (error) {
    console.error('Error fetching pending excess approval orders:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const getPendingExcessApprovalOrders = async (req, res) => {
  try {
    const result = await executeQuery(`EXEC [dbo].[SP_ExcessApprovalOrders_Pending]`);

    res.json(result);
  } catch (error) {
    console.error('Error fetching pending excess approval orders:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};
