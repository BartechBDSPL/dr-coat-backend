import express from 'express';
import * as hhtPutAwayROutes from '../controllers/hht/hhtPutAway.js';
import * as InternalMovementController from '../controllers/hht/hhtInternalMovement.js';
import * as hhtStockTransferOrderController from '../controllers/hht/hhtStockTransferOrder.js';
import * as hhtStockTransferMaterialReceiptController from '../controllers/hht/hhtStockTransferMaterialReceipt.js';
import * as hhtShipmentOrderController from '../controllers/hht/hhtShipmentOrder.js';
import * as hhtPrinterController from '../controllers/hht/hhtPrinter.js';
import * as hhtMaterialReturnController from '../controllers/hht/hhtMaterialReturn.js';

const router = express.Router();

// FG Operations
// FG Put Away
router.post('/fg-put-away-barcode-validation', hhtPutAwayROutes.putAwayValidation);
router.post('/fg-put-away-update', hhtPutAwayROutes.putAwayUpdate);
router.post('/fg-put-away-location-suggestion', hhtPutAwayROutes.putAwayLocationSuggestion);
router.post('/fg-put-away-check-location', hhtPutAwayROutes.checkLocationExists);
router.get('/warehouse-codes', hhtPutAwayROutes.getAllWarehouseCodes);


// FG Internal Movement
router.post('/fg-int-mv-barcode-validation', InternalMovementController.internalBarcodeValidation);
router.post('/fg-int-barcode-update', InternalMovementController.IntBarcodeDataUpdate);

// HHT Stock Transfer Order
router.post('/stock-transfer-pending-orders', hhtStockTransferOrderController.getPendingStockTransferOrders);
router.post('/stock-transfer-order-details', hhtStockTransferOrderController.getStockTransferOrderDetails);
router.post('/stock-transfer-validation', hhtStockTransferOrderController.validateStockTransfer);
router.post('/stock-transfer-update', hhtStockTransferOrderController.updateStockTransfer);
router.post('/stock-transfer-reversal', hhtStockTransferOrderController.reverseStockTransfer);
router.post('/stock-transfer-serial-no-suggestion', hhtStockTransferOrderController.getSerialNoSuggestions);
router.post('/stock-transfer-manual-close', hhtStockTransferOrderController.manualCloseStockTransferOrder);
router.post('/stock-transfer-recent-picked-details', hhtStockTransferOrderController.getRecentPickedDetails);

// HHT Stock Transfer Material Receipt
router.post('/stock-transfer-material-receipt-numbers', hhtStockTransferMaterialReceiptController.getStockTransferNumbers);
router.post('/stock-transfer-material-receipt-serial-nos', hhtStockTransferMaterialReceiptController.getAllSerialNos);
router.post('/stock-transfer-material-receipt-update', hhtStockTransferMaterialReceiptController.updateMaterialReceipt);

// HHT Shipment Order
router.post('/shipment-order-pending-orders', hhtShipmentOrderController.getShipmentOrderPendingOrders);
router.post('/shipment-order-details', hhtShipmentOrderController.getShipmentOrderDetails);
router.post('/shipment-order-validation', hhtShipmentOrderController.validateShipmentOrderBarcode);
router.post('/shipment-order-update', hhtShipmentOrderController.updateShipmentOrderPicking);
router.post('/shipment-order-reversal', hhtShipmentOrderController.reverseShipmentOrderPicking);
router.post('/shipment-order-manual-close', hhtShipmentOrderController.manualCloseShipmentOrder);
router.post('/shipment-order-serial-no-suggestion', hhtShipmentOrderController.getShipmentOrderSerialNoSuggestions);
router.post('/shipment-order-recent-picked-details', hhtShipmentOrderController.getShipmentOrderRecentPickedDetails);

// HHT Printer
router.get('/printer-data', hhtPrinterController.getPrinterData);

// HHT Material Return
router.post('/material-return-details', hhtMaterialReturnController.getMaterialReturnDetails);
router.post('/material-return-update', hhtMaterialReturnController.updateMaterialReturn);

export default router;
