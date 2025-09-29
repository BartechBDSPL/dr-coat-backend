import express from 'express';
import * as palletBarcodeRoutes from '../controllers/transactions/palletBarcodePrint.js';
import * as transactionRoutes from '../controllers/transactions/printingController.js';
import * as exportPrintingRoutes from '../controllers/transactions/exportPrintingController.js';
import * as pendingTransactionQC from '../controllers/hht/hhtUpdatedQc.js';
import * as deliveryOrder from '../controllers/transactions/delivery-order.js';
import * as locationLabelController from '../controllers/transactions/locationLabelPrint.js';
import * as excessLabelPrinting from '../controllers/transactions/excessLabelPrinting.js';
import * as excessLabelPrintingApproval from '../controllers/transactions/excessLabelPrintingApproval.js';
import * as stockTransferPickListController from '../controllers/transactions/stock-transfer-web.js';
import * as stockComparisonController from '../controllers/hht/stockComparison.js';
import * as existingStockPrinting from '../controllers/transactions/exisitingStockPrinting.js';
import auth from '../middleware/auth.js';
// import { updateSAPGoodsMovement } from '../controllers/hht/hhtUpdatedQc.js';
import * as sapTransactionController from '../controllers/sap-transaction/sap-transaction.js';

const router = express.Router();

// FG Label Printing (Primary Pack label printing)
router.post('/check-order-no', auth, transactionRoutes.getPrintData);
router.post('/get-serial-and-box-no', auth, transactionRoutes.getSeriialNumberAndBoxNumber);
router.post('/update-serial-no', auth, transactionRoutes.updateLabelPrinting);
router.get('/recent-fg-label-prints', auth, transactionRoutes.recentLabelPrinting);
router.get('/get-recently-added-production-order', auth, transactionRoutes.getRecentlyAddedProductionOrderNumber);

//Excess Label Printing
router.post('/excess-label-print-details', auth, excessLabelPrinting.getExcessProductionOrderDetails);
router.post('/excess-label-print-insert', auth, excessLabelPrinting.insertExcessProductionOrder);

// Excess production Label Printing Approval
router.post('/excess-label-approval', auth, excessLabelPrintingApproval.approveExcessProductionOrder);
router.get('/excess-label-approval-get-all', auth, excessLabelPrintingApproval.getPendingExcessApprovalOrders);
router.get('/excess-label-approval-recent', auth, excessLabelPrintingApproval.getRecentRequestedApprovalOrder);

//Pallet-barcode print
router.post('/pallet-barcode-print', auth, palletBarcodeRoutes.getFGLabelBarcodeInfo);

//Pending SAP transaction for QC
router.post('/pending-sap-qc', auth, pendingTransactionQC.getPendingSAPTransaction);

//Delivery Order and assign
router.post('/search-delivery-no', auth, deliveryOrder.getDeliveryOrder);
router.get('/recent-delivery-assign', auth, deliveryOrder.getRecentMaterialTransactions);
router.get('/get-user-id', auth, deliveryOrder.getUserIDs);
router.post('/assign-delivery-order', auth, deliveryOrder.assignDeliveryOrder);
router.post('/scan-delivery-qr', auth, deliveryOrder.scanDeliveryQR);

//Location Label Printing
router.post('/location-print-get-details', auth, locationLabelController.getLocationPrintingData);
router.post('/wh-location-print-update', auth, locationLabelController.updatePrintLocation);

//Internal Transfer Pick List
router.get('/get-warehouse-details', auth, stockTransferPickListController.getTripWarehouseDetails);
router.post('/get-trip-batches', auth, stockTransferPickListController.getTripBatches);
router.post('/get-trip-total-qty', auth, stockTransferPickListController.getTripTotalQty);
router.post('/get-trip-pal-zpe', auth, stockTransferPickListController.getTripPalZpe);
router.get('/get-transporter-details', auth, stockTransferPickListController.getTripTransporterDetails);
router.post('/get-trip-materials', auth, stockTransferPickListController.getTripMaterials);
router.post('/get-pallet-barcoe-details', auth, stockTransferPickListController.getPalletBarcodes);
router.post('/get-trip-order', auth, stockTransferPickListController.getTripNoData);
router.get('/get-pending-trip-order-details', auth, stockTransferPickListController.getPendingTripOrders);
router.post('/insert-trip-details', auth, stockTransferPickListController.insertTripDetails);
router.get('/generate-trip-srno', auth, stockTransferPickListController.generateTripSrNo);
router.get('/get-recents-trips', auth, stockTransferPickListController.getRecentTrips);
router.get('/get-trip-details', auth, stockTransferPickListController.getTripDetails);

//Stock Comparison
router.post('/stock-comparison', auth, stockComparisonController.getStockComparison);
router.post('/insert-stock-comparison', auth, stockComparisonController.insertStockComparison);

// Export Label Printing
router.post('/export-update-label-printing', auth, exportPrintingRoutes.updateLabelPrinting);
router.post('/get-pallet-srno', auth, exportPrintingRoutes.getPalletSrNo);

//Existing Stock Printing
router.get('/get-all-materials', auth, existingStockPrinting.getAllMaterials);
router.post('/get-material-batches', auth, existingStockPrinting.getMaterialBatches);
router.post('/get-material-details', auth, existingStockPrinting.getMaterialDetails);
router.post('/get-all-details-existing-stock', auth, existingStockPrinting.getMaterialBatchDetails);

// SAP Transaction
router.get('/get-sap-module-name', auth, sapTransactionController.getSapTransactionModuleName);
router.post('/get-pending-sap-transaction', auth, sapTransactionController.getPedndingSapTransaction);
router.post('/update-sap-transaction', auth, sapTransactionController.updateSapTransactionDetails);

export default router;
