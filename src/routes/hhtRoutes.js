import express from 'express';
import * as palletRoutes from '../controllers/hht/hhtPallet.js';
import * as qcRoutes from '../controllers/hht/hhtUpdatedQc.js';
import * as hhtGoodRecieptController from '../controllers/hht/hhtGoodReciept.js';
import * as hhtInwardRoutes from '../controllers/hht/hhtMaterialInward.js';
import * as hhtPutAwayROutes from '../controllers/hht/hhtPutAway.js';
import * as InternalMovementController from '../controllers/hht/hhtInternalMovement.js';
import * as PrinterController from '../controllers/hht/hhtPrinter.js';
import * as UpdateApplicationController from '../controllers/hht/hhtApplicationUpdates.js';
import * as materialPickingController from '../controllers/hht/hhtMaterialPicking.js';
import * as palletSplitProductionRoute from '../controllers/hht/hhtPalletSplitProduction.js';
import * as palletSplitRoute from '../controllers/hht/hhtSplitPallet.js';
import * as whBlockController from '../controllers/hht/hhtWhBlockRelease.js';
import * as scrappingController from '../controllers/hht/hhtScrapping.js';
import * as stockTakeController from '../controllers/hht/hhtStockTake.js';
import * as TruckLoadingController from '../controllers/hht/hhtTruckLoading.js';
import * as stockTransferPickingController from '../controllers/transactions/stock-transfer-picking.js';
import * as stockTransferValidateBarcode from '../controllers/hht/hhtValidateStockTransfer.js';
import * as palletMergeController from '../controllers/hht/hhtMergePallet.js';
import * as existingStockController from '../controllers/hht/hhtExisitingStock.js';
import * as palletSplitOnlyPalletController from '../controllers/hht/hhtPalletSplitOnlyPallet.js';
import * as hhtStockTransferController from '../controllers/hht/hhtStockTransfer.js';
import * as resortingReturnController from '../controllers/hht/hhtResortingReturn.js';
import * as hhtDeliveryOrderController from '../controllers/hht/hhtDeliveryOrder.js';

const router = express.Router();

// Qc
// router.post('/qc-fetch',auth,qcRoutes.validateMaterialMovement)
router.post('/qc-fetch-pallet', qcRoutes.validateMaterialMovement);
// router.post('/qc-update',qcRoutes.updateMovementType)
router.post('/qc-update-pallet', qcRoutes.updateMovementType);

// QC Status Checking
router.post('/qc-status-check', qcRoutes.qcStatusChecking);

// Pallet
router.post('/pallet-fetch', palletRoutes.fetchPalletBarcode);
router.post('/pallet-update', palletRoutes.updatePalletBarcode);
router.post('/validate-pallet', palletRoutes.checkPalletAndSerial);

// Box Merge and Removal
router.post('/box-merge-without-pallet-update', palletRoutes.updateBoxMergeWithoutPallet);
router.post('/box-removal-update', palletRoutes.updateBoxRemoval);
router.post('/box-removal-validation', palletRoutes.boxRemovalValidation);
router.post('/box-merge-with-pallet-serial-validation', palletRoutes.boxMergeWithPalletSerialValidation);
router.post('/box-merge-with-pallet-pallet-validation', palletRoutes.boxMergeWithPalletPalletValidation);
router.post('/box-merge-with-pallet-update', palletRoutes.updateBoxMergeWithPallet);

// Good receipt
router.post('/good-receipt-pallet-barcode-validation', hhtGoodRecieptController.inwardPalletBarcodeValidation);
router.post('/good-receipt-barcode-update', hhtGoodRecieptController.goodReceieptBarcodeUpdate);
router.post('/good-receipt-barcode-validation', hhtGoodRecieptController.inwardBarcodeValidation);

// Material Inward
router.post('/inward-pallet-barcode-validation', hhtInwardRoutes.inwardPalletBarcodeValidation);
router.post('/inward-barcode-update', hhtInwardRoutes.inwardBarcodeDataUpdate);
router.post('/inward-barcode-validation', hhtInwardRoutes.inwardBarcodeValidation);

// Put away
router.post('/put-barcode-validation', hhtPutAwayROutes.putBarcodeValidation);
router.post('/put-pallet-barcode-validation', hhtPutAwayROutes.putPalletBarcodeValidation);
router.post('/put-location-suggestion', hhtPutAwayROutes.putLocationSuggestion);
router.post('/put-check-valid-location', hhtPutAwayROutes.putCheckValidLocation);
router.post('/put-barcode-update', hhtPutAwayROutes.putBarcodeDataUpdate);
router.get('/get-wh-code-and-desc', hhtPutAwayROutes.getWarehouseCodeDescConcat);

// Internal Transfer
router.post('/int-mv-barcode-validation', InternalMovementController.internalBarcodeValidation);
router.post('/int-mv-pallet-barcode-validation', InternalMovementController.internalBarcodePalletValidation);
router.post('/int-barcode-update', InternalMovementController.IntBarcodeDataUpdate);
router.post('/int-transfer-check-valid-location', InternalMovementController.intCheckValidLocation);

// Printer Routes
router.get('/printer-data', PrinterController.getPrinterData);

// Application Updates
router.post('/insert-application-version', UpdateApplicationController.insertApplicationVersion);
router.post('/get-latest-application-version', UpdateApplicationController.fetchApplicationVersionByName);

// SAP Goods Movement
// router.post('/update-sap-goods-movement', updateSAPGoodsMovement);

// Material Picking
router.post('/fg-pick-unique-order-no', materialPickingController.getUnqiqueOrderNo);
router.post('/fg-pick-order-no-get-all-data', materialPickingController.orderNoGetAllData);
router.post('/fg-pick-order-no-get-data', materialPickingController.fgPickOrderNOGetData);
router.post('/fg-pick-pallet-update', materialPickingController.updatePalletBarcode);
router.post('/fg-pick-box-update', materialPickingController.updateBarcodeData);
router.post('/fg-pick-pallet-barcode-validation', materialPickingController.validatePalletBarcode);
router.post('/fg-pick-box-barcode-validation', materialPickingController.validateBoxBarcode);
router.post('/fg-pick-barcode-update-data', materialPickingController.updateBarcodeData);
router.post('/fg-pick-barcode-reversal', materialPickingController.fgPickBarcodeReversal);
router.post('/fg-pick-mat-details-data', materialPickingController.getMaterialDetailsData);
router.post('/check-material-pick-order', materialPickingController.checkMaterialPickOrder);
router.post('/get-pallet-location', materialPickingController.getPalletLocation);
router.post('/close-delivery-order-manually', materialPickingController.closeDeliveryOrderManually);

// pallet split production
router.post('/pallet-break-production-barcode-validation', palletSplitProductionRoute.validatePalletBarcodeBreak);
router.post('/pallet-break-production-update', palletSplitProductionRoute.updatePalletBreak);

//pallet split
router.post('/pallet-break-barcode-validation', palletSplitRoute.validatePalletBarcodeBreak);
router.post('/pallet-break-update', palletSplitRoute.updatePalletBreakNotProduction);
router.post('/pallet-details', palletSplitRoute.getPalletDetailsForPrinting);

//Pallet Merge

router.post('/pallet-merge-fetch', palletMergeController.fetchPalletBarcode);
router.post('/pallet-merge-update', palletMergeController.updatePalletBarcode);

// WH Block and Release
router.post('/wh-block-validate-barcode', whBlockController.validateSerialBarcodeWHBlock);
router.post('/wh-release-validate-barcode', whBlockController.validateSerialBarcodeWHRelease);
router.post('/wh-block-or-release-update', whBlockController.updateWHBlockReleaseStatus);

// Stock Transfer Picking
router.post('/stock-transfer-picking-barcode-validation', stockTransferPickingController.validatePalletBarcode);
router.post('/stock-transfer-picking-trip-details', hhtStockTransferController.pickingTripDetails);
router.post('/stock-transfer-remove-trip-details', hhtStockTransferController.removeTripDetails);
router.post('/stock-transfer-recent-transaction', hhtStockTransferController.recentTransactionTripDetails);

// Stock Transfer Validate
router.post('/stock-transfer-validate-tripno', stockTransferValidateBarcode.validateTripNo);
router.post('/stock-transfer-update-tripno', stockTransferValidateBarcode.updateTripNo);

// Truck Loading
router.post('/truck-loading-pallet-validation', TruckLoadingController.truckLoadingPalletValidation);
router.post('/truck-loading-insert', TruckLoadingController.truckLoadingInsert);
router.post('/truck-loading-order-data', TruckLoadingController.getOrderNoData);
router.get('/truck-loading-closed-orders', TruckLoadingController.getPickedClosedOrders);
router.post('/truck-loading-serial-validation', TruckLoadingController.validateSerialBarcode);

// Scrapping
router.post('/wh-scrapping-block-validate-barcode', scrappingController.validateSerialBarcodeWHBlockScrapping);
router.post('/wh-scrapping-release-validate-barcode', scrappingController.validateSerialBarcodeWHReleaseScrapping);
router.post('/scrapping-block-or-release-update', scrappingController.updateWHBlockReleaseScrappingStatus);
router.post('/pending-scrapping-approvals', scrappingController.getPendingScrappingApprovals);
router.post('/approve-scrapping', scrappingController.approveScrapping);

//Stock Take
router.post('/stock-take-pallet-validate', stockTakeController.validateStockTakePallet);
router.post('/stock-take-barcode-update', stockTakeController.updateStockTakeBarcode);
router.post('/get-stock-take-no', stockTakeController.getStockTakeNo);
router.post('/recent-stock-take', stockTakeController.getRecentStockTakeDetails);

//Exisiting Stock
router.post('/existing-stock-validate', existingStockController.validateBarcode);
router.post('/existing-stock-update', existingStockController.updateStockInfo);
router.post('/existing-stock-dispatch-validate', existingStockController.validateDispatchBarcode);
router.post('/existing-stock-dispatch-update', existingStockController.updateDispatchInfo);

// Export Pallet Split Validation
router.post('/export-pallet-split-validation', palletSplitOnlyPalletController.validateExportPalletSplit);
router.post('/export-pallet-split-update', palletSplitOnlyPalletController.exportPalletSplitUpdate);
router.post('/stock-transfer-order-close', hhtStockTransferController.closeOrderTripDetails);
router.get('/stock-transfer-get-closed-open-tripnos', hhtStockTransferController.getClosedOpenTripNos);
router.post('/stock-transfer-get-tripno-details', hhtStockTransferController.getTripNoDetails);
router.post('/stock-transfer-insert-challan-details', hhtStockTransferController.insertTripChallanDetails);
router.post('/update-transit-location', hhtStockTransferController.getTripPalletBarcode);

// Resorting Return
router.post('/resorting-return-validate-barcode', resortingReturnController.validateResortingReturnBarcode);
router.post('/resorting-return-update', resortingReturnController.updateResortingReturn);

// Delivery Order QR Scan
router.post('/scan-delivery-qr', hhtDeliveryOrderController.scanDeliveryQR);

export default router;
