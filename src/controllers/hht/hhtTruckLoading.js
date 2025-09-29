import { executeQuery, sql } from '../../config/db.js';

export const truckLoadingPalletValidation = async (req, res) => {
  const { ScanBarcode } = req.body;

  try {
    const result = await executeQuery(`EXEC [dbo].[HHT_TruckLoading_PalletValidation] @ScanBarcode`, [
      { name: 'ScanBarcode', type: sql.NVarChar(70), value: ScanBarcode },
    ]);
    res.json(result[0]);
  } catch (error) {
    console.error('Error validating truck loading pallet:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const truckLoadingInsert = async (req, res) => {
  const {
    OrderNo,
    ScanBarcode,
    TransporterName,
    GSTNo,
    TruckNo,
    DriverName,
    InvoiceNo,
    Material,
    MaterialText,
    Batch,
    Quantity,
    WarehouseSupervisor,
    PDISupervisor,
    SecuritySupervisor,
    CreatedBy,
  } = req.body;
  // console.log(req.body)
  try {
    const result = await executeQuery(
      `EXEC [dbo].[HHT_TruckLoading_Insert] @OrderNo, @ScanBarcode, @TransporterName, @GSTNo, @TruckNo, @DriverName, @InvoiceNo, @Material, @MaterialText, @Batch, @Quantity, @WarehouseSupervisor, @PDISupervisor, @SecuritySupervisor, @CreatedBy`,
      [
        { name: 'OrderNo', type: sql.NVarChar(50), value: OrderNo },
        { name: 'ScanBarcode', type: sql.NVarChar(70), value: ScanBarcode },
        {
          name: 'TransporterName',
          type: sql.NVarChar(100),
          value: TransporterName,
        },
        { name: 'GSTNo', type: sql.NVarChar(50), value: GSTNo },
        { name: 'TruckNo', type: sql.NVarChar(50), value: TruckNo },
        { name: 'DriverName', type: sql.NVarChar(50), value: DriverName },
        { name: 'InvoiceNo', type: sql.NVarChar(sql.MAX), value: InvoiceNo },
        { name: 'Material', type: sql.NVarChar(50), value: Material },
        { name: 'MaterialText', type: sql.NVarChar(100), value: MaterialText },
        { name: 'Batch', type: sql.NVarChar(50), value: Batch },
        { name: 'Quantity', type: sql.Decimal(18, 3), value: Quantity },
        {
          name: 'WarehouseSupervisor',
          type: sql.NVarChar(50),
          value: WarehouseSupervisor,
        },
        { name: 'PDISupervisor', type: sql.NVarChar(50), value: PDISupervisor },
        {
          name: 'SecuritySupervisor',
          type: sql.NVarChar(50),
          value: SecuritySupervisor,
        },
        { name: 'CreatedBy', type: sql.NVarChar(50), value: CreatedBy },
      ]
    );
    // console.log(result)
    res.json(result[0]);
  } catch (error) {
    console.error('Error inserting truck loading:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const getOrderNoData = async (req, res) => {
  const { OrderNo } = req.body;

  try {
    const result = await executeQuery(`EXEC [dbo].[HHT_TruckLoading_OrderNoGetData] @OrderNo`, [
      { name: 'OrderNo', type: sql.NVarChar(50), value: OrderNo },
    ]);
    res.json(result);
  } catch (error) {
    console.error('Error getting order number data:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const getPickedClosedOrders = async (req, res) => {
  try {
    const result = await executeQuery(`EXEC [dbo].[HHT_TruckLoading_PickedClosedOrder]`);
    res.json(result);
  } catch (error) {
    console.error('Error getting picked closed orders:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const validateSerialBarcode = async (req, res) => {
  const { ScanBarcode } = req.body;

  try {
    const result = await executeQuery(`EXEC [dbo].[HHT_TruckLoading_SerialValidation] @ScanBarcode`, [
      { name: 'ScanBarcode', type: sql.NVarChar(70), value: ScanBarcode },
    ]);
    res.json(result[0]);
  } catch (error) {
    console.error('Error validating serial barcode for truck loading:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};
