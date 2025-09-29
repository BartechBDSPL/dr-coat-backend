import sql from 'mssql/msnodesqlv8.js';

const config = {
  server: '15.206.183.202',
  database: 'BoilerPlate_WMS',
  driver: 'msnodesqlv8',
  options: {
    trustedConnection: true,
    trustServerCertificate: true,
    encrypt: false,
  },
  user: 'sa',
  password: 'bdspl@123',
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 80000,
  },
};

// const updateConfig = {
//     connectionString: 'Driver={SQL Server` Native Client 10.0};Server=15.206.183.202,1433;Database=Application_Updates;Uid=sa;Pwd=bdspl@123;',
//     options: {
//         trustServerCertificate: true,
//     },
//     pool: {
//         max: 10,
//         min: 0,
//         idleTimeoutMillis: 30000
//     }
// };

let mainPool, customerPool;

async function initializeDatabases() {
  try {
    mainPool = await sql.connect(config);
    console.log('Connected to MSSQL (BoilerPlate_WMS)');
    // customerPool = await new sql.ConnectionPool(updateConfig).connect();
  } catch (err) {
    console.error('Database initialization failed:', err);
    throw err;
  }
}

async function executeQuery(query, params = {}) {
  if (!mainPool) {
    throw new Error('Main database connection not initialized');
  }

  try {
    const request = mainPool.request();

    if (Array.isArray(params)) {
      params.forEach(param => request.input(param.name, param.type, param.value));
    } else {
      for (const [name, { type, value }] of Object.entries(params)) {
        request.input(name, type, value);
      }
    }

    console.log('Executing Query for own database:', query);
    const result = await request.query(query);
    return result.recordset;
  } catch (error) {
    console.error('Error executing query:', error);
    throw error;
  }
}
async function executeQueryExisiting(query, params = {}) {
  if (!mainPool) {
    throw new Error('Main database connection not initialized');
  }

  try {
    const request = mainPool.request();

    if (Array.isArray(params)) {
      params.forEach(param => request.input(param.name, param.type, param.value));
    } else {
      for (const [name, { type, value }] of Object.entries(params)) {
        request.input(name, type, value);
      }
    }

    console.log('Executing Query for own database:', query);
    const result = await request.query(query);
    return result.recordset;
  } catch (error) {
    console.error('Error executing query:', error);
    throw error;
  }
}

async function executeUpdateQuery(query, params = {}) {
  if (!customerPool) {
    throw new Error('Customer database connection not initialized');
  }

  try {
    const request = customerPool.request();

    if (Array.isArray(params)) {
      params.forEach(param => request.input(param.name, param.type, param.value));
    } else {
      for (const [name, { type, value }] of Object.entries(params)) {
        request.input(name, type, value);
      }
    }

    // console.log('Executing Query for customer DB:', query);
    const result = await request.query(query);
    return result.recordset;
  } catch (error) {
    console.error('Error executing customer DB query:', error);
    throw error;
  }
}

async function closeDatabases() {
  try {
    if (mainPool) {
      await mainPool.close();
      console.log('Closed MSSQL (BoilerPlate_WMS) connection');
    }
    if (customerPool) {
      await customerPool.close();
      console.log('Closed Customer DB (Application_Updates) connection');
    }
  } catch (err) {
    console.error('Error closing database connections:', err);
  }
}

export { sql, initializeDatabases, executeQuery, closeDatabases, executeUpdateQuery, executeQueryExisiting };
