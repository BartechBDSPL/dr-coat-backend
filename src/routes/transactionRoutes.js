import express from 'express';

import auth from '../middleware/auth.js';
// import { updateSAPGoodsMovement } from '../controllers/hht/hhtUpdatedQc.js';
import * as fgLabelPrintingController from '../controllers/transactions/fg-label-printing.js';
import * as rmLabelPrinting from '../controllers/transactions/rm-label-printing.js';
import * as stockTransferOrderController from '../controllers/transactions/stock-transfer-order.js';
import * as salesShipmentOrderController from '../controllers/transactions/sales-shipment-order.js';

const router = express.Router();

//RM Routes
// GRN Details
router.post('/grn/details', auth, rmLabelPrinting.getGRNDetails);

// FG Routes

// FG Label Printing
router.get('/sales-order-check-unique-no', rmLabelPrinting.checkSalesOrderUniqueNumber);
router.get('/sales-order-check-unique-line-no', rmLabelPrinting.checkSalesOrderLineUniqueNumber);

// Production Order
router.post('/production-order-upsert', fgLabelPrintingController.upsertProductionOrder);
router.post('/production-order-get-details', fgLabelPrintingController.getProductionOrderDetails);
router.post('/production-order-get-recent', fgLabelPrintingController.getRecentProductionOrders);
router.post('/production-order-find-sr-no', fgLabelPrintingController.findSrNo);
router.post('/production-order-update-label-count', fgLabelPrintingController.updateProductionOrderLabelCount);
router.post('/fg-label-printing-insert', fgLabelPrintingController.insertFgLabelPrinting);

// Stock Transfer Order
router.post('/stock-transfer-order-insert', auth, stockTransferOrderController.insertStockTransferOrder);
router.post('/stock-transfer-order-assign-user', auth, stockTransferOrderController.assignUserToStockTransferOrder);
router.post('/stock-transfer-order-get-details', auth, stockTransferOrderController.getStockTransferOrderDetails);
router.get('/stock-transfer-order-get-recent', auth, stockTransferOrderController.getRecentStockTransferOrders);
router.post(
  '/stock-transfer-order-by-date-range',
  auth,
  stockTransferOrderController.getStockTransferOrdersByDateRange
);

// Sales Shipment Order
router.post('/sales-shipment-order-insert', auth, salesShipmentOrderController.insertSalesShipmentOrder);
router.post('/sales-shipment-order-assign-user', auth, salesShipmentOrderController.assignUserToSalesShipmentOrder);
router.post('/sales-shipment-order-get-details', auth, salesShipmentOrderController.getSalesShipmentOrderDetails);
router.get('/sales-shipment-order-get-recent', auth, salesShipmentOrderController.getRecentSalesShipmentOrders);
router.post(
  '/sales-shipment-order-by-date-range',
  auth,
  salesShipmentOrderController.getSalesShipmentOrdersByDateRange
);

export default router;
