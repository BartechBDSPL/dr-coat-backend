import { sql, executeQuery } from '../../config/db.js';
import ping from 'ping';

export const getLineDataByPlant = async (req, res) => {
  const { plant_code } = req.body;

  try {
    const result = await executeQuery('EXEC sp_printer_line_data @plant', [
      { name: 'plant', type: sql.NVarChar(50), value: plant_code },
    ]);

    res.json(result);
  } catch (error) {
    console.error('Error executing stored procedure:', error);
    res.status(500).json({ error: error.message });
  }
};

export const insertPrinter = async (req, res) => {
  const { PlantCode, DeviceName, DeviceSrNo, DeviceIp, DeviceMake, AssetCode, Status, Createdby, dpi, LineCode } =
    req.body;

  try {
    const result = await executeQuery(
      'EXEC sp_printer_insert @plant_code, @device_name, @device_sr_no, @device_ip, @device_make, @asset_code, @printer_status, @created_by, @dpi, @line_code',
      [
        { name: 'plant_code', type: sql.NVarChar(150), value: PlantCode },
        { name: 'device_name', type: sql.NVarChar(150), value: DeviceName },
        { name: 'device_sr_no', type: sql.NVarChar(150), value: DeviceSrNo },
        { name: 'device_ip', type: sql.NVarChar(150), value: DeviceIp },
        { name: 'device_make', type: sql.NVarChar(150), value: DeviceMake },
        { name: 'asset_code', type: sql.NVarChar(150), value: AssetCode },
        { name: 'printer_status', type: sql.NVarChar(150), value: Status },
        { name: 'created_by', type: sql.NVarChar(150), value: Createdby },
        { name: 'dpi', type: sql.NVarChar(50), value: dpi },
        { name: 'line_code', type: sql.NVarChar(50), value: LineCode },
      ]
    );

    res.json(result);
  } catch (error) {
    console.error('Error executing stored procedure:', error);
    res.status(500).json({ error: error.message });
  }
};

export const updatePrinter = async (req, res) => {
  const {
    DvcID,
    PlantCode,
    DeviceName,
    DeviceSrNo,
    DeviceIp,
    DeviceMake,
    AssetCode,
    Status,
    Updatedby,
    OldPlantCode,
    OldDeviceSrNo,
    OldDeviceIp,
    LineCode,
    dpi,
    DefaultValue,
  } = req.body;

  try {
    const result = await executeQuery(
      'EXEC sp_printer_update @id, @plant_code, @device_name, @device_sr_no, @device_ip, @device_make, @asset_code, @printer_status, @updated_by, @old_plant_code, @old_device_sr_no, @old_device_ip, @line_code, @dpi',
      [
        { name: 'id', type: sql.Int, value: DvcID },
        { name: 'plant_code', type: sql.NVarChar(150), value: PlantCode },
        { name: 'device_name', type: sql.NVarChar(150), value: DeviceName },
        { name: 'device_sr_no', type: sql.NVarChar(150), value: DeviceSrNo },
        { name: 'device_ip', type: sql.NVarChar(150), value: DeviceIp },
        { name: 'device_make', type: sql.NVarChar(150), value: DeviceMake },
        { name: 'asset_code', type: sql.NVarChar(150), value: AssetCode },
        { name: 'printer_status', type: sql.NVarChar(150), value: Status },
        { name: 'updated_by', type: sql.NVarChar(150), value: Updatedby },
        {
          name: 'old_plant_code',
          type: sql.NVarChar(150),
          value: OldPlantCode,
        },
        {
          name: 'old_device_sr_no',
          type: sql.NVarChar(150),
          value: OldDeviceSrNo,
        },
        { name: 'old_device_ip', type: sql.NVarChar(150), value: OldDeviceIp },
        { name: 'line_code', type: sql.NVarChar(50), value: LineCode },
        { name: 'dpi', type: sql.NVarChar(50), value: dpi },
      ]
    );

    res.json(result);
  } catch (error) {
    console.error('Error executing stored procedure:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getAllPrinters = async (req, res) => {
  try {
    const result = await executeQuery('EXEC sp_printer_get_all_printer');

    res.json(result);
  } catch (error) {
    console.error('Error executing stored procedure:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getPrinterByPlantCode = async (req, res) => {
  const { PlantCode } = req.body;

  try {
    const result = await executeQuery('EXEC sp_printer_get_printer @plant_code', [
      { name: 'plant_code', type: sql.NVarChar(50), value: PlantCode },
    ]);

    res.json(result);
  } catch (error) {
    console.error('Error executing stored procedure:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getDefaultPrinterByPlantCode = async (req, res) => {
  const { PlantCode } = req.body;

  try {
    const result = await executeQuery('EXEC sp_printer_get_printer_default @plant_code', [
      { name: 'plant_code', type: sql.NVarChar(50), value: PlantCode },
    ]);

    res.json(result);
  } catch (error) {
    console.error('Error executing stored procedure:', error);
    res.status(500).json({ error: error.message });
  }
};

export const pingPrinter = async (req, res) => {
  const { ip } = req.query;

  if (!ip) {
    return res.status(400).json({ error: 'IP address is required' });
  }

  try {
    const [ipAddress, port] = ip.split(':');

    if (!ipAddress) {
      return res.status(400).json({ error: 'Invalid IP address format' });
    }

    const result = await ping.promise.probe(ipAddress, {
      timeout: 2,
      min_reply: 2,
    });

    res.json({
      alive: result.alive,
      time: result.time !== 'unknown' ? result.time : null,
      ip: ipAddress,
      port: port || null,
      packets: {
        transmitted: 1,
        received: result.alive ? 1 : 0,
      },
    });
  } catch (error) {
    console.error('Error pinging printer:', error);
    res.status(500).json({ error: error.message });
  }
};
