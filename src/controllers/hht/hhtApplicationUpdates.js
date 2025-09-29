import { executeUpdateQuery, sql } from '../../config/db.js';

export const insertApplicationVersion = async (req, res) => {
  const { Application_Name, Application_Version_Code, Application_Version_Name, UpdatedBy } = req.body;

  try {
    const result = await executeUpdateQuery(
      'EXEC [dbo].[Sp_Application_Version_Insert] @Application_Name, @Application_Version_Code, @Application_Version_Name, @UpdatedBy',
      [
        {
          name: 'Application_Name',
          type: sql.NVarChar(255),
          value: Application_Name,
        },
        {
          name: 'Application_Version_Code',
          type: sql.NVarChar(50),
          value: Application_Version_Code,
        },
        {
          name: 'Application_Version_Name',
          type: sql.NVarChar(255),
          value: Application_Version_Name,
        },
        { name: 'UpdatedBy', type: sql.NVarChar(255), value: UpdatedBy },
      ]
    );
    res.json(result[0]);
  } catch (error) {
    console.error('Error inserting application version:', error);
    res.status(500).json({ error: 'Failed to insert application version' });
  }
};

export const fetchApplicationVersionByName = async (req, res) => {
  const { Application_Name } = req.body;

  try {
    const result = await executeUpdateQuery('EXEC [dbo].[Sp_Application_Version_FetchByName] @Application_Name', [
      {
        name: 'Application_Name',
        type: sql.NVarChar(255),
        value: Application_Name,
      },
    ]);
    res.json(result[0]);
  } catch (error) {
    console.error('Error fetching application version by name:', error);
    res.status(500).json({ error: 'Failed to fetch application version' });
  }
};
