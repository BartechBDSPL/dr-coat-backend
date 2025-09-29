import { executeQuery, sql } from '../../config/db.js';

export const editHHTRegisterStatus = async (req, res) => {
  const { device_sn, register_by, mobile_no } = req.body;

  try {
    const result = await executeQuery('EXEC [dbo].[hht_register_edit_status] @device_sn, @register_by, @mobile_no', [
      { name: 'device_sn', type: sql.NVarChar(50), value: device_sn },
      { name: 'register_by', type: sql.NVarChar(50), value: register_by },
      { name: 'mobile_no', type: sql.NVarChar(50), value: mobile_no },
    ]);

    res.json(result[0]);
  } catch (error) {
    console.error('Error executing stored procedure:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getHHTRegisterSpecific = async (req, res) => {
  const { name, mobile_no, device_status } = req.body;

  try {
    const result = await executeQuery('EXEC [dbo].[hht_register_select_specific] @name, @mobile_no, @device_status', [
      { name: 'name', type: sql.NVarChar(50), value: name || '' },
      { name: 'mobile_no', type: sql.NVarChar(50), value: mobile_no || '' },
      {
        name: 'device_status',
        type: sql.NVarChar(50),
        value: device_status || '',
      },
    ]);

    res.json(result);
  } catch (error) {
    console.error('Error executing stored procedure:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getAllRegisterHHTDevice = async (req, res) => {
  try {
    // Execute the stored procedure
    const result = await executeQuery('EXEC [dbo].[sp_get_all_register_hht_device]');

    // Return the result directly to the client
    res.json(result);
  } catch (error) {
    console.error('Error executing stored procedure:', error);
    res.status(500).json({ error: error.message });
  }
};

export const addHHTRegisterRequest = async (req, res) => {
  const { device_sn, mobile_no, request_by } = req.body;

  try {
    const result = await executeQuery('EXEC [dbo].[hht_register_insert] @device_sn, @mobile_no, @request_by', [
      { name: 'device_sn', type: sql.NVarChar(50), value: device_sn },
      { name: 'mobile_no', type: sql.NVarChar(50), value: mobile_no },
      { name: 'request_by', type: sql.NVarChar(250), value: request_by },
    ]);

    res.json(result[0]);
  } catch (error) {
    console.error('Error executing stored procedure:', error);
    res.status(500).json({ error: error.message });
  }
};

export const updateAndroidAccess = async (req, res) => {
  const { user_id, user_name, approved_by } = req.body;

  try {
    const result = await executeQuery('EXEC [dbo].[sp_android_access_update] @user_id, @user_name, @approved_by', [
      { name: 'user_id', type: sql.NVarChar(100), value: user_id },
      { name: 'user_name', type: sql.NVarChar(255), value: user_name },
      { name: 'approved_by', type: sql.NVarChar(255), value: approved_by },
    ]);
    res.json(result[0]);
  } catch (error) {
    console.error('Error updating Android access:', error);
    res.status(500).json({ error: 'Failed to update Android access' });
  }
};

export const getPendingApprovals = async (req, res) => {
  try {
    const result = await executeQuery('EXEC [dbo].[sp_android_access_approval_pending]', []);
    res.json(result);
  } catch (error) {
    console.error('Error fetching pending approvals:', error);
    res.status(500).json({ error: 'Failed to fetch pending approvals' });
  }
};
