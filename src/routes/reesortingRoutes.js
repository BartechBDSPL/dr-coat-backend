import express from 'express';
import * as resortingOrderController from '../controllers/hht/hhtResortingOrderNo.js';
import * as resortingOrderPickingController from '../controllers/hht/hhtResortingPicking.js';
import * as resortingScrappingController from '../controllers/hht/hhtResortingScrapping.js';

const router = express.Router();

router.post('/get-order-no', resortingOrderController.getResOrderNo);
router.post('/get-order-no-for-printing', resortingOrderController.getResortingOrderForPrinting);
router.post('/update-serial-no', resortingOrderController.updateResortingLabelPrinting);
router.post('/validate-serial-no', resortingOrderController.validateSerialNo);
router.post('/update-resorting-order-type', resortingOrderController.updateResortingOrderType);

router.post('/assign-resorting-order', resortingOrderController.updateResortingOrderRequest);
router.get('/recent-delivery-assign', resortingOrderController.getRecentResortingTransactions);
router.post('/pick-unique-order-no', resortingOrderController.getUnqiqueOrderNo);
router.post('/pick-order-no-get-data', resortingOrderController.fgPickOrderNOGetData);
router.post('/pick-order-no-get-all-data', resortingOrderController.orderNoGetAllData);
router.get('/get-closed-orders', resortingOrderController.getClosedResortingOrders);

//Resorting Order NUmber

router.post('/pick-pallet-barcode-validation', resortingOrderPickingController.validatePalletBarcodeResorting);
router.post('/pick-pallet-barcode-insert', resortingOrderPickingController.insertPalletBarcodeResorting);
router.post('/pick-mat-details-data', resortingOrderPickingController.getOrderPickingDetailsData);
router.post('/resorting-order-no-details-web', resortingOrderController.getResortingOrderNumberForWebPrinting);
router.post('/resorting-check-material-pick-order', resortingOrderController.checkResortingMaterialPickOrder);
router.post('/close-order-manually', resortingOrderController.closeResortingOrderManually);

router.post('/update-scrap-quantity', resortingScrappingController.insertResortingScrapDetails);

export default router;
