import express from 'express';
import * as reprintFGLabelController from '../controllers/reprint/reprint-fg-label-printing.js';
import auth from '../middleware/auth.js';

const router = express.Router();

router.post('/fg-reprint-label-details', auth, reprintFGLabelController.getReprintFgLabelDetails);
router.post('/fg-reprint-label-insert', auth, reprintFGLabelController.insertReprintFgLabel);

export default router;
