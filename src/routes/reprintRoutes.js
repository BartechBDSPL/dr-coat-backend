import express from 'express';
import * as reprintFGLabelController from '../controllers/reprint/reprint-fg-label-printing.js';
import * as reprintPalletLabelController from '../controllers/reprint/reprint-pallet-label.js';
import * as reprintStockTransferNoteController from '../controllers/reprint/reprint-stock-transfer-note.js';
import auth from '../middleware/auth.js';

const router = express.Router();

router.post('/fg-reprint-label-details', auth, reprintFGLabelController.getReprintFgLabelDetails);
router.post('/fg-reprint-label-insert', auth, reprintFGLabelController.insertReprintFgLabel);

export default router;
