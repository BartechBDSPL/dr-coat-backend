import express from 'express';
import * as reportController from '../controllers/reports/rep-fg-label-printing.js';
import * as palletReportController from '../controllers/reports/rep-pallet.js';
import * as putAwayReports from '../controllers/reports/rep-put-away.js';
import * as inwardReportController from '../controllers/reports/rep-inward-details.js';
import * as fgLabelReprintingController from '../controllers/reports/rep-fg-label-reprint.js';
import * as palletSplitRemovedBoxesController from '../controllers/reports/rep-pallet-split-removed-boxes.js';
import * as materialWiseStockReport from '../controllers/reports/rep-material-wise-stock.js';
import * as locationWiseStockReport from '../controllers/reports/rep-location-wise-stock.js';
import * as batchWiseStockReport from '../controllers/reports/rep-batch-wise-stock.js';
import * as goodReceiptReport from '../controllers/reports/rep-good-receipt-details.js';
import * as qcDetailsReport from '../controllers/reports/rep-qc-details.js';
import * as locationqtydetails from '../controllers/reports/rep-location-qty-details.js';
import * as palletMergeReport from '../controllers/reports/rep-pallet-merge.js';
import * as internalMovementReport from '../controllers/reports/rep-internal-movement.js';
import * as materialPickingReport from '../controllers/reports/rep-material-picking.js';
import * as resortingPickingReport from '../controllers/reports/rep-resorting-picking.js';
import * as excessProductionOrderReport from '../controllers/reports/rep-excess-production-order.js';
import * as materialAgeingReport from '../controllers/reports/rep-material-ageing.js';
import * as exisitingStockReport from '../controllers/reports/rep-exisiting-stock.js';
import * as materialReceiptReport from '../controllers/reports/rep-material-receipt.js';
import * as stockTransferPickingReport from '../controllers/reports/rep-stock-transfer-picking.js';
import * as warehouseScrappingReport from '../controllers/reports/rep-warehouse-scrapping.js';
import * as resortingReturnReport from '../controllers/reports/rep-resorting-return.js';
import auth from '../middleware/auth.js';

const router = express.Router();

router.post('/fg-label-printing', auth, reportController.reportFGPrintingdata);
//Pallet Report
router.post('/pallet-serial-no', auth, palletReportController.getFGLabelSerialNoInfo);
//Inward Report
router.post('/rep-inward-details', auth, inwardReportController.getInwardDetails);
//Good Receipt Report
router.post('/rep-good-receipt-details', auth, goodReceiptReport.getGRDetails);
router.post('/rep-summary-till-qc', auth, goodReceiptReport.getSummaryReportTillQC);
//QC report
router.post('/rep-qc-details', auth, qcDetailsReport.getQCDetails);
//Put Away Report
router.post('/rep-put-away', auth, putAwayReports.putAwayDetails);
//Reprint reports
router.post('/rep-fg-label-reprint', auth, fgLabelReprintingController.getRePrintFGLabelDetails);
//Material Wise Stock Report
router.post('/rep-material-wise-stock', auth, materialWiseStockReport.getMaterialWiseStock);
//Location Wise Stock Report
router.post('/rep-location-wise-stock', auth, locationWiseStockReport.getLocationWiseStock);
//Batcg Wise Stock Report
router.post('/rep-batch-wise-stock', auth, batchWiseStockReport.getLocationMaterialBatchWiseStock);
// Location Quantity Details
router.post('/rep-location-qty-details', auth, locationqtydetails.getLocationQtyDetails);
// Pallet Split Removed Boxes
router.post('/rep-pallet-split-removed-boxes', auth, palletSplitRemovedBoxesController.getRemovedBoxes);
router.post('/rep-pallet-split-log', auth, palletSplitRemovedBoxesController.getPalletSplitLog);

// Pallet Merge Report
router.post('/rep-pallet-merge', auth, palletMergeReport.getPalletMergeReport);

// Internal Movement Report
router.post('/rep-internal-movement', auth, internalMovementReport.getInternalMovementDetails);

// Material Picking Report
router.post('/rep-material-picking', auth, materialPickingReport.getFGMaterialPickingDetails);

// Exisiting Stock IN report
router.post('/rep-existing-stock-in', auth, exisitingStockReport.getESUDetails);

// Exisiting Stock Dispatch report
router.post('/rep-existing-stock-dispatch', auth, exisitingStockReport.getESUDispatch);

// Resorting Picking Report
router.post('/rep-resorting-picking', auth, resortingPickingReport.getResortingPickingDetails);

// Excess Production Order Report
router.post('/rep-excess-production-order', auth, excessProductionOrderReport.getExcessProductionOrderDetails);

// Material Ageing Report
router.post('/rep-material-ageing', auth, materialAgeingReport.getMaterialAgeingReport);

// Material Receipt Report
router.post('/rep-material-receipt', auth, materialReceiptReport.getMaterialReceiptReport);

// Stock Transfer Picking Report
router.post('/rep-stock-transfer-picking', auth, stockTransferPickingReport.getStockTransferPicking);

// Warehouse Scrapping Report
router.post('/rep-warehouse-scrapping', auth, warehouseScrappingReport.getWarehouseScrapping);

// Resorting Return Report
router.post('/rep-resorting-return', auth, resortingReturnReport.getResortingReturn);

export default router;
