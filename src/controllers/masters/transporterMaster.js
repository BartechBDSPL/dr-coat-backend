import { executeQuery, sql } from '../../config/db.js';

export const insertTransporter = async (req, res) => {
  const { TransporterName, GSTNo, ContactPerson, ContactMobile, ContactPhone, ContactEmail, VehicleNumber, CreatedBy } =
    req.body;

  try {
    const result = await executeQuery(
      `EXEC [dbo].[Sp_Transporter_Insert] @TransporterName, @GSTNo, @VehicleNumber,@ContactPerson, @ContactMobile, @ContactPhone, @ContactEmail, @CreatedBy`,
      [
        {
          name: 'TransporterName',
          type: sql.VarChar(100),
          value: TransporterName,
        },
        { name: 'GSTNo', type: sql.VarChar(20), value: GSTNo },
        { name: 'VehicleNumber', type: sql.VarChar(20), value: VehicleNumber },
        { name: 'ContactPerson', type: sql.NVarChar(50), value: ContactPerson },
        { name: 'ContactMobile', type: sql.NVarChar(15), value: ContactMobile },
        { name: 'ContactPhone', type: sql.NVarChar(15), value: ContactPhone },
        { name: 'ContactEmail', type: sql.NVarChar(50), value: ContactEmail },
        { name: 'CreatedBy', type: sql.VarChar(50), value: CreatedBy },
      ]
    );

    res.json(result[0]);
  } catch (error) {
    console.error('Error inserting transporter:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const getAllTransporters = async (req, res) => {
  try {
    const result = await executeQuery(`EXEC [dbo].[Sp_Transporter_GetAll]`, []);
    res.json(result);
  } catch (error) {
    console.error('Error fetching transporters:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const updateTransporter = async (req, res) => {
  const { TransporterName, GSTNo, ContactPerson, ContactMobile, ContactPhone, VehicleNumber, ContactEmail, UpdatedBy } =
    req.body;

  try {
    const result = await executeQuery(
      `EXEC [dbo].[Sp_Transporter_Update] @TransporterName, @GSTNo,@VehicleNumber, @ContactPerson, @ContactMobile, @ContactPhone, @ContactEmail, @UpdatedBy`,
      [
        {
          name: 'TransporterName',
          type: sql.VarChar(100),
          value: TransporterName,
        },
        { name: 'GSTNo', type: sql.VarChar(20), value: GSTNo },
        { name: 'VehicleNumber', type: sql.VarChar(20), value: VehicleNumber },
        { name: 'ContactPerson', type: sql.NVarChar(50), value: ContactPerson },
        { name: 'ContactMobile', type: sql.NVarChar(15), value: ContactMobile },
        { name: 'ContactPhone', type: sql.NVarChar(15), value: ContactPhone },
        { name: 'ContactEmail', type: sql.NVarChar(50), value: ContactEmail },
        { name: 'UpdatedBy', type: sql.VarChar(50), value: UpdatedBy },
      ]
    );

    res.json(result[0]);
  } catch (error) {
    console.error('Error updating transporter:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};
