import { executeQueryExisiting, sql } from '../../config/db.js';

// Exisiting Stock UP
export const validateBarcode = async (req, res) => {
  let { ScanBarcode } = req.body;

  try {
    if (!ScanBarcode) {
      return res.status(400).json({
        Status: 'F',
        Message: 'Invalid barcode format. Barcode is missing.',
      });
    }

    try {
      if (typeof ScanBarcode === 'string' && /^[A-Za-z0-9+/=]+$/.test(ScanBarcode)) {
        const decodedBarcode = Buffer.from(ScanBarcode, 'base64').toString('utf8');
        ScanBarcode = decodedBarcode;
      }
    } catch (decodeError) {
      console.warn('Base64 decoding failed, using original input:', decodeError);
    }

    if (typeof ScanBarcode !== 'string') {
      return res.status(400).json({
        Status: 'F',
        Message: 'Invalid barcode format. Barcode must be a string.',
      });
    }

    const parts = ScanBarcode.split(';');
    if (parts.length < 7) {
      return res.status(400).json({
        Status: 'F',
        Message: 'Invalid barcode format.',
      });
    }

    const BATCH = parts[0];
    const MATERIAL_TEXT = parts[1];
    const MATERIAL = parts[2].replace(/^0+/, '');
    const PALLET_QTY = parts[3];
    const BOX_PER_PALLET = parts[4];
    const PCS_PER_BOX = parts[5];
    const PALLET_NUMBER = parts[6].replace(/^0+/, '');
    const LOCATION = '';

    const ORDER_NUMBER = '100' + BATCH.replace(/0$/, '');

    const result = await executeQueryExisiting(`EXEC [dbo].[HHT_ESU_BarcodeValidation] @ScanBarcode`, [
      {
        name: 'ScanBarcode',
        type: sql.NVarChar(255),
        value: ScanBarcode.trim(),
      },
    ]);

    let responseData;

    if (result[0].Status === 'F' && result[0].Message !== 'Pallet Got Dispatched.') {
      const avalQty = parseInt(PALLET_QTY);
      responseData = {
        Status: 'T',
        Message: 'Valid Barcode',
        ORDER_NUMBER: ORDER_NUMBER,
        MATERIAL: MATERIAL,
        MATERIAL_TEXT: MATERIAL_TEXT,
        BATCH: BATCH,
        AvalQty: avalQty,
        STORAGE_LOCATION: '',
        Location: LOCATION || '',
        PCS_PER_BOX: PCS_PER_BOX,
        BOX_PER_PALLET:
          parseInt(PCS_PER_BOX) > 0 ? parseFloat((avalQty / parseInt(PCS_PER_BOX)).toFixed(1)) : BOX_PER_PALLET,
        PALLET_NUMBER: PALLET_NUMBER,
        PALLET_QTY: PALLET_QTY,
      };
    } else if (result[0].Status == 'T' && result[0].AvalQty === 0) {
      const avalQty = parseInt(PALLET_QTY);

      responseData = {
        Status: 'T',
        Message: 'Valid Barcode',
        ORDER_NUMBER: ORDER_NUMBER,
        MATERIAL: MATERIAL,
        MATERIAL_TEXT: MATERIAL_TEXT,
        BATCH: BATCH,
        AvalQty: avalQty,
        STORAGE_LOCATION: '',
        Location: LOCATION || '',
        PCS_PER_BOX: PCS_PER_BOX,
        BOX_PER_PALLET:
          parseInt(PCS_PER_BOX) > 0 ? parseFloat((avalQty / parseInt(PCS_PER_BOX)).toFixed(1)) : BOX_PER_PALLET,
        PALLET_NUMBER: PALLET_NUMBER,
        PALLET_QTY: PALLET_QTY,
      };
    } else if (result[0].Message == 'Pallet Got Dispatched.') {
      responseData = result[0];
    } else {
      const avalQty = result[0].AvalQty || 0;
      responseData = {
        ...result[0],
        MATERIAL: result[0].MATERIAL ? result[0].MATERIAL.replace(/^0+/, '') : '',
        PCS_PER_BOX: PCS_PER_BOX,
        BOX_PER_PALLET:
          parseInt(PCS_PER_BOX) > 0 ? parseFloat((avalQty / parseInt(PCS_PER_BOX)).toFixed(1)) : BOX_PER_PALLET,
        PALLET_NUMBER: PALLET_NUMBER,
        PALLET_QTY: PALLET_QTY,
      };
    }
    return res.json(responseData);
  } catch (error) {
    console.error('Error validating barcode:', error);
    res.status(500).json({
      Status: 'F',
      Message: 'Failed to validate barcode',
      error: error.message,
    });
  }
};

export const updateStockInfo = async (req, res) => {
  let { ScanBarcode, ORDER_NUMBER, MATERIAL, MATERIAL_TEXT, BATCH, Qty, STORAGE_LOCATION, Location, User } = req.body;

  try {
    try {
      if (typeof ScanBarcode === 'string' && /^[A-Za-z0-9+/=]+$/.test(ScanBarcode)) {
        const decodedBarcode = Buffer.from(ScanBarcode, 'base64').toString('utf8');
        ScanBarcode = decodedBarcode;
      }
    } catch (decodeError) {
      console.warn('Base64 decoding failed, using original input:', decodeError);
    }

    if (!ScanBarcode || !ORDER_NUMBER || !MATERIAL || !MATERIAL_TEXT || !BATCH || !Qty || !User) {
      return res.status(400).json({
        Status: 'F',
        Message: 'Missing required fields',
      });
    }

    // Pad MATERIAL with leading zeros to make it 12 characters long
    const paddedOrderNumber = ORDER_NUMBER.padStart(12, '0');
    const paddedMaterial = MATERIAL.padStart(18, '0');
    const parts = ScanBarcode.split(';');
    if (parts.length < 7) {
      return res.status(400).json({
        Status: 'F',
        Message: 'Invalid barcode format.',
      });
    }

    const PCS_PER_BOX = parts[5];

    const result = await executeQueryExisiting(
      `EXEC [dbo].[HHT_ESU_StockUp] 
            @ScanBarcode, 
            @ORDER_NUMBER, 
            @MATERIAL, 
            @MATERIAL_TEXT, 
            @BATCH, 
            @Qty, 
            @STORAGE_LOCATION, 
            @Location, 
            @BoxNo,
            @User`,
      [
        {
          name: 'ScanBarcode',
          type: sql.NVarChar(255),
          value: ScanBarcode.trim(),
        },
        {
          name: 'ORDER_NUMBER',
          type: sql.NVarChar(50),
          value: paddedOrderNumber,
        },
        { name: 'MATERIAL', type: sql.NVarChar(50), value: paddedMaterial },
        {
          name: 'MATERIAL_TEXT',
          type: sql.NVarChar(100),
          value: MATERIAL_TEXT,
        },
        { name: 'BATCH', type: sql.NVarChar(50), value: BATCH },
        { name: 'Qty', type: sql.Decimal(18, 2), value: Qty },
        {
          name: 'STORAGE_LOCATION',
          type: sql.NVarChar(20),
          value: STORAGE_LOCATION || '',
        },
        { name: 'Location', type: sql.NVarChar(20), value: Location || '' },
        {
          name: 'BoxNo',
          type: sql.NVarChar(10),
          value: parseFloat((Qty / PCS_PER_BOX).toFixed(2)).toString() || '0',
        },
        { name: 'User', type: sql.NVarChar(50), value: User },
      ]
    );

    return res.json(result[0]);
  } catch (error) {
    console.error('Error updating stock:', error);
    res.status(500).json({
      Status: 'F',
      Message: 'Failed to update stock',
      error: error.message,
    });
  }
};

export const validateDispatchBarcode = async (req, res) => {
  let { ScanBarcode, STORAGE_LOCATION } = req.body;

  try {
    if (!ScanBarcode) {
      return res.status(400).json({
        Status: 'F',
        Message: 'Invalid barcode format. Barcode is missing.',
      });
    }

    if (!STORAGE_LOCATION) {
      return res.status(400).json({
        Status: 'F',
        Message: 'Storage location is required.',
      });
    }

    try {
      if (typeof ScanBarcode === 'string' && /^[A-Za-z0-9+/=]+$/.test(ScanBarcode)) {
        const decodedBarcode = Buffer.from(ScanBarcode, 'base64').toString('utf8');
        ScanBarcode = decodedBarcode;
      }
    } catch (decodeError) {
      console.warn('Base64 decoding failed, using original input:', decodeError);
    }

    if (typeof ScanBarcode !== 'string') {
      return res.status(400).json({
        Status: 'F',
        Message: 'Invalid barcode format. Barcode must be a string.',
      });
    }

    // Extract PCS_PER_BOX from barcode
    let PCS_PER_BOX = '';
    const parts = ScanBarcode.split(';');
    if (parts.length >= 6) {
      PCS_PER_BOX = parts[5];
    }

    const result = await executeQueryExisiting(
      `EXEC [dbo].[HHT_ESU_DispatchValidation] @ScanBarcode, @Storage_Location`,
      [
        {
          name: 'ScanBarcode',
          type: sql.NVarChar(255),
          value: ScanBarcode.trim(),
        },
        {
          name: 'Storage_Location',
          type: sql.NVarChar(20),
          value: STORAGE_LOCATION,
        },
      ]
    );

    // Add PCS_PER_BOX to response
    const response = {
      ...result[0],
      PCS_PER_BOX: PCS_PER_BOX,
    };

    return res.json(response);
  } catch (error) {
    console.error('Error validating dispatch barcode:', error);
    res.status(500).json({
      Status: 'F',
      Message: 'Failed to validate dispatch barcode',
      error: error.message,
    });
  }
};
export const updateDispatchInfo = async (req, res) => {
  let { ScanBarcode, PickQty, User } = req.body;
  if (!ScanBarcode) {
    return res.status(400).json({
      Status: 'F',
      Message: 'Invalid barcode format. Barcode is missing.',
    });
  }

  try {
    if (typeof ScanBarcode === 'string' && /^[A-Za-z0-9+/=]+$/.test(ScanBarcode)) {
      const decodedBarcode = Buffer.from(ScanBarcode, 'base64').toString('utf8');
      ScanBarcode = decodedBarcode;
    }
  } catch (decodeError) {
    console.warn('Base64 decoding failed, using original input:', decodeError);
  }

  const parts = ScanBarcode.split(';');
  if (parts.length < 7) {
    return res.status(400).json({
      Status: 'F',
      Message: 'Invalid barcode format.',
    });
  }

  try {
    let PCS_PER_BOX = '';
    const parts = ScanBarcode.split(';');
    if (parts.length >= 6) {
      PCS_PER_BOX = parts[5];
    }

    const result = await executeQueryExisiting(
      `EXEC [dbo].[HHT_ESU_DispatchUpdate] 
                @ScanBarcode, 
                @PickQty,
                @BoxNo,
                @User`,
      [
        {
          name: 'ScanBarcode',
          type: sql.NVarChar(255),
          value: ScanBarcode.trim(),
        },
        { name: 'PickQty', type: sql.Decimal(18, 3), value: PickQty },
        {
          name: 'BoxNo',
          type: sql.NVarChar(10),
          value: parseFloat((PickQty / PCS_PER_BOX).toFixed(2)).toString() || '0',
        },
        { name: 'User', type: sql.NVarChar(50), value: User },
      ]
    );

    return res.json(result[0]);
  } catch (error) {
    // console.error(chalk.bgRed.white('❌ Error updating dispatch info:'), chalk.red(error.message));
    res.status(500).json({
      Status: 'F',
      Message: 'Failed to update dispatch info',
      error: error.message,
    });
  }
};
