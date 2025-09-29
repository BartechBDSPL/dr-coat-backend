import express from 'express';
import * as Location2DController from '../controllers/dashboard/location2DController.js';
import * as MaterialInStockController from '../controllers/dashboard/materialInStock.js';
import * as TotalPrintMonthWiseController from '../controllers/dashboard/totalPrintMonthWIse.js';
import * as DashBoardController from '../controllers/dashboard/dashboardDetails.js';
import * as LiveStockController from '../controllers/reports/rep-material-wise-stock.js';

import auth from '../middleware/auth.js';

const router = express.Router();

router.get('/loc-wise-item-qty', auth, Location2DController.getLocationWiseItemQty);

// material in stok
router.get('/material-in-stock', auth, MaterialInStockController.getMaterialInStock);

// monthly box and pallet count
router.get('/monthly-wise-print-count', auth, TotalPrintMonthWiseController.getBoxAndPalletCountByMonth);
router.post('/details', DashBoardController.dashboardDetails);
router.get('/put-pick-last-6-month', TotalPrintMonthWiseController.pickVsPutLastSixMonth);
router.get('/put-pick-last-7-day', TotalPrintMonthWiseController.Sp_PutVsPick_Last7Days);
router.get('/live-stock', LiveStockController.getLiveStock);

export default router;
