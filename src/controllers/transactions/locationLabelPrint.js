import { executeQuery, sql } from '../../config/db.js';
import net from 'net';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function isPrinterReachable(ip, port) {
  return new Promise(resolve => {
    const socket = new net.Socket();
    socket.setTimeout(3000);

    const printerPort = parseInt(port) || 9100;

    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect({
      host: ip,
      port: printerPort,
    });
  });
}

async function printToTscPrinter(prnFilePath, printerIP, printerPort) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    client.setTimeout(30000);

    client.connect(
      {
        host: printerIP,
        port: parseInt(printerPort) || 9100,
      },
      () => {
        const prnContent = fs.readFileSync(prnFilePath);
        client.write(prnContent, err => {
          if (err) {
            console.error('Error in printing:', err);
            reject(err);
          } else {
            client.end();
            resolve();
          }
        });
      }
    );

    client.on('error', err => {
      console.error('Printer connection error:', err);
      client.destroy();
      reject(new Error('Printer connection failed'));
    });

    client.on('timeout', () => {
      console.error('Printer connection timeout');
      client.destroy();
      reject(new Error('Printer connection timeout'));
    });
  });
}

async function batchPrintToTscPrinter(printJobs, printerIP, printerPort) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    client.setTimeout(30000); // Increased timeout for batch printing

    client.connect(
      {
        host: printerIP,
        port: parseInt(printerPort) || 9100,
      },
      async () => {
        try {
          // Concatenate all PRN files into a single buffer
          let combinedContent = Buffer.concat(printJobs.map(job => fs.readFileSync(job.prnFilePath)));

          client.write(combinedContent, err => {
            if (err) {
              console.error('Error in batch printing:', err);
              reject(err);
            } else {
              // Clean up temp files
              printJobs.forEach(job => {
                try {
                  if (fs.existsSync(job.prnFilePath)) {
                    fs.unlinkSync(job.prnFilePath);
                  }
                } catch (cleanupError) {
                  console.error('Error cleaning up temp file:', cleanupError);
                }
              });
              client.end();
              resolve();
            }
          });
        } catch (error) {
          client.destroy();
          reject(error);
        }
      }
    );

    client.on('error', err => {
      console.error('Printer connection error:', err);
      client.destroy();
      reject(new Error('Printer connection failed'));
    });

    client.on('timeout', () => {
      console.error('Printer connection timeout');
      client.destroy();
      reject(new Error('Printer connection timeout'));
    });
  });
}

function preparePrnFile(data) {
  const templatePath = path.join(__dirname, '..', '..', 'prn-printer', 'StorageType5050.prn');
  const tempPrnPath = path.join(__dirname, `temp_${Date.now()}.prn`);

  try {
    let template = fs.readFileSync(templatePath, 'utf-8');

    Object.keys(data).forEach(key => {
      template = template.replace(new RegExp(key, 'g'), data[key]);
    });

    fs.writeFileSync(tempPrnPath, template);
    return tempPrnPath;
  } catch (error) {
    console.error('Error preparing PRN file:', error);
    if (fs.existsSync(tempPrnPath)) {
      fs.unlinkSync(tempPrnPath);
    }
    return null;
  }
}

export const updatePrintLocation = async (req, res) => {
  const { Bin, Warehouse, PrintBy, IP, NoOfLabels } = req.body;
  const [printerIP, printerPort] = IP.split(':');
  const portNumber = parseInt(printerPort) || 9100;

  try {
    const printerInRange = await isPrinterReachable(printerIP, portNumber);
    if (!printerInRange) {
      return res.status(400).json({ error: 'Printer out of range' });
    }

    const bins = Bin.split('$');
    const warehouses = Warehouse.split('$');

    const printJobs = [];

    for (let i = 0; i < bins.length; i++) {
      await executeQuery(
        `EXEC [dbo].[Sp_WH_UpdatePrintLocation] 
                @Bin, @Warehouse, @PrintBy`,
        [
          { name: 'Bin', type: sql.NVarChar(20), value: bins[i] },
          { name: 'Warehouse', type: sql.NVarChar(50), value: warehouses[i] },
          { name: 'PrintBy', type: sql.NVarChar(50), value: PrintBy },
        ]
      );

      const printData = {
        VBarcode: bins[i],
        VStorageType: warehouses[i],
        VStorageTypeSap: '',
      };

      for (let j = 0; j < NoOfLabels; j++) {
        const prnFilePath = preparePrnFile(printData);
        if (prnFilePath) {
          printJobs.push({ prnFilePath });
        }
      }
    }

    if (printJobs.length > 0) {
      await batchPrintToTscPrinter(printJobs, printerIP, portNumber);
    }

    res.json({
      success: true,
      message: 'All locations updated and printed successfully',
    });
  } catch (error) {
    console.error('Error updating print location:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const getLocationPrintingData = async (req, res) => {
  const { Warehouse, Printed } = req.body;

  try {
    const result = await executeQuery(
      `EXEC [dbo].[Sp_WH_LocationPrintingData] 
            @Warehouse, @Printed`,
      [
        { name: 'Warehouse', type: sql.NVarChar(50), value: Warehouse },
        { name: 'Printed', type: sql.NVarChar(10), value: Printed },
      ]
    );
    res.json(result);
  } catch (error) {
    console.error('Error fetching location printing data:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};
