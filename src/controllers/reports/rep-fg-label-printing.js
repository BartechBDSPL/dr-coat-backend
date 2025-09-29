import { executeQuery } from '../../config/db.js';
import { sql } from '../../config/db.js';

export const reportFGPrintingdata = async (req, res) => {
  const { FrmDate, ToDate, ORDER_NUMBER, MATERIAL, BATCH, Rep_Pick, Rep_Put, LINE, TANK, Shift } = req.body;

  try {
    let query = `
            SELECT PRODUCTION_PLANT, ORDER_NUMBER, MATERIAL, MATERIAL_TEXT, BATCH, STORAGE_LOCATION, SCRAP, 
                   TARGET_QUANTITY, DELIVERED_QUANTITY, PalletBarcode, UNIT_ISO, PRODUCTION_START_DATE, PRODUCTION_FINISH_DATE, 
                   ENTERED_BY, ENTER_DATE, PrintQty, SerialNo, PrintBy, PrintDate, PutStatus, PutDate, Location, ShiftName,
                   PickQty, PickBy, PickDate, LINE
            FROM FGLabelPrinting
            WHERE 1=1 
        `;

    if (ORDER_NUMBER && ORDER_NUMBER.trim() !== '') {
      query += " AND ORDER_NUMBER LIKE @ORDER_NUMBER + '%'";
    }

    if (MATERIAL && MATERIAL.trim() !== '') {
      query += " AND MATERIAL LIKE @MATERIAL + '%'";
    }

    if (BATCH && BATCH.trim() !== '') {
      query += " AND BATCH LIKE @BATCH + '%'";
    }
    if (LINE && LINE.trim() !== '') {
      query += " AND LINE LIKE @LINE + '%'";
    }

    if (TANK && TANK.trim() !== '') {
      query += " AND LINE LIKE @TANK + '%'";
    }
    if (Shift && Shift.trim() !== '') {
      query += " AND ShiftName LIKE @Shift + '%'";
    }

    if (Rep_Pick === 'Pending') {
      query += ' AND PickStatus IS NULL';
    } else if (Rep_Pick === 'Done') {
      query += ' AND PickStatus IS NOT NULL';
    }

    if (Rep_Put === 'Pending') {
      query += ' AND PutStatus IS NULL';
    } else if (Rep_Put === 'Done') {
      query += ' AND PutStatus IS NOT NULL';
    }

    query += ' AND (CONVERT(date, PrintDate) BETWEEN @FrmDate AND @ToDate) ORDER BY PrintDate DESC';

    const result = await executeQuery(query, [
      { name: 'FrmDate', type: sql.Date, value: FrmDate },
      { name: 'ToDate', type: sql.Date, value: ToDate },
      { name: 'ORDER_NUMBER', type: sql.NVarChar(50), value: ORDER_NUMBER },
      { name: 'MATERIAL', type: sql.NVarChar(50), value: MATERIAL },
      { name: 'BATCH', type: sql.NVarChar(50), value: BATCH },
      { name: 'LINE', type: sql.NVarChar(50), value: LINE },
      { name: 'TANK', type: sql.NVarChar(50), value: TANK },
      { name: 'Shift', type: sql.NVarChar(50), value: Shift },
    ]);
    res.json(result);
  } catch (error) {
    console.error('Error fetching FG printing data:', error);
    res.status(500).json({ error: error.message });
  }
};
