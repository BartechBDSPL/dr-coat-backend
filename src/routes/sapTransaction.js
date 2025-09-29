import express from 'express';
import {
  getSapTransactionModuleName,
  getPedndingSapTransaction,
  updateSapTransactionDetails,
} from '../controllers/sap-transaction/sap-transaction.js';
import { manuallyTriggerSapProcessing } from '../cron-jobs/index.js';
import auth from '../middleware/auth.js';

const router = express.Router();

// Get all SAP transaction module names
router.get('/modules', auth, getSapTransactionModuleName);

// Get pending SAP transactions by module name
router.post('/pending', auth, getPedndingSapTransaction);

// Update SAP transaction details
router.post('/update', auth, updateSapTransactionDetails);

// Manually trigger the SAP transaction processing cron job
router.post('/process-all', auth, async (req, res) => {
  try {
    const result = await manuallyTriggerSapProcessing();

    if (result.success) {
      res.status(200).json({
        Status: 'T',
        Message: result.message,
      });
    } else {
      res.status(500).json({
        Status: 'F',
        Message: result.message,
      });
    }
  } catch (error) {
    console.error('Error triggering SAP transaction processing:', error);
    res.status(500).json({
      Status: 'F',
      Message: `Error triggering SAP transaction processing: ${error.message}`,
    });
  }
});

export default router;
