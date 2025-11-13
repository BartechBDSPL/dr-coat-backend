import express from 'express';
import * as fgReports from '../controllers/reports/fg-reports.js';
import auth from '../middleware/auth.js';

const router = express.Router();

// FG Reports
router.post('/fg-put-away', auth, fgReports.putAwayReport);
router.post('/fg-label-printing', auth, fgReports.fgLabelPrintingReport);
router.post('/fg-internal-movement', auth, fgReports.internalMovementReport);
router.post('/fg-reprint-label-report', auth, fgReports.reprintFgLabelReport);
router.post('/fg-stock-transfer-picking', auth, fgReports.stockTransferPickingReport);
router.post('/fg-material-receipt', auth, fgReports.materialReceiptReport);

// FG Reports
router.post('/fg-shipment-picking', auth, fgReports.shipmentPickingReport);
router.post('/fg-material-return', auth, fgReports.materialReturnReport);

// RM Reports

export default router;
