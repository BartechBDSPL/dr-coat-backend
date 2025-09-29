import express from 'express';
import * as reprintFGLabelController from '../controllers/reprint/reprint-fg-label-printing.js';
import * as reprintPalletLabelController from '../controllers/reprint/reprint-pallet-label.js';
import * as reprintStockTransferNoteController from '../controllers/reprint/reprint-stock-transfer-note.js';
import auth from '../middleware/auth.js';

const router = express.Router();

// Reprint for  Label Printing
router.post('/fg-label-data', auth, reprintFGLabelController.getFGLabelPrintData);
router.post('/insert-fg-label', auth, reprintFGLabelController.insertFGLabelPrintingData);

// Reprint for  Pallet Label Printing
router.post('/insert-pallet-label', reprintPalletLabelController.insertPalletRePrintDetails);
router.post('/get-pallet-data', reprintPalletLabelController.getRePrintPalletData);

// Reprint for Stock Transfer Note
router.post('/get-stock-transfer-note-data', reprintStockTransferNoteController.getReprintStockTransferNoteDetails);
router.post(
  '/insert-stock-transfer-note-reprint',
  reprintStockTransferNoteController.insertReprintStockTransferNoteDetails
);

export default router;
