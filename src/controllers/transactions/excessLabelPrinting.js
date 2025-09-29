import { executeQuery, sql } from '../../config/db.js';

export const insertExcessProductionOrder = async (req, res) => {
  const {
    OrderNumber,
    PRINT_QTY,
    RequestedQuantity,
    Material,
    MaterialType,
    WorkCenter,
    UNIT,
    UNIT_ISO,
    PrintedLabels,
    Reason,
    RequestedBy,
    BoxToBePrinted,
  } = req.body;

  try {
    const result = await executeQuery(
      `EXEC [dbo].[Sp_ExcessProductionOrder_Insert] @OrderNumber, @PRINT_QTY, @RequestedQuantity, @Material, @MaterialType, @WorkCenter, @UNIT, @UNIT_ISO, @PrintedLabels, @Reason, @RequestedBy, @BoxToBePrinted`,
      [
        { name: 'OrderNumber', type: sql.NVarChar(100), value: OrderNumber },
        { name: 'PRINT_QTY', type: sql.Decimal(18, 3), value: PRINT_QTY },
        {
          name: 'RequestedQuantity',
          type: sql.Decimal(18, 3),
          value: RequestedQuantity,
        },
        { name: 'Material', type: sql.VarChar(100), value: Material },
        { name: 'MaterialType', type: sql.VarChar(50), value: MaterialType },
        { name: 'WorkCenter', type: sql.VarChar(50), value: WorkCenter },
        { name: 'UNIT', type: sql.VarChar(50), value: UNIT },
        { name: 'UNIT_ISO', type: sql.VarChar(10), value: UNIT_ISO },
        { name: 'PrintedLabels', type: sql.Int, value: PrintedLabels },
        { name: 'Reason', type: sql.VarChar(255), value: Reason },
        { name: 'RequestedBy', type: sql.VarChar(100), value: RequestedBy },
        {
          name: 'BoxToBePrinted',
          type: sql.Int,
          value: parseInt(BoxToBePrinted),
        },
      ]
    );

    res.json(result[0]);
  } catch (error) {
    console.error('Error inserting excess production order:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const getExcessProductionOrderDetails = async (req, res) => {
  const { OrderNumber } = req.body;

  try {
    const result = await executeQuery(`EXEC [dbo].[Sp_GetExcessProductionOrderDetails] @OrderNumber`, [
      { name: 'OrderNumber', type: sql.NVarChar(100), value: OrderNumber },
    ]);
    // console.log(result)
    res.json(result);
  } catch (error) {
    console.error('Error getting excess production order:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};
