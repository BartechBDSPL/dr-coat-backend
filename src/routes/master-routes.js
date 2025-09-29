import express from 'express';
import * as companyMasterController from '../controllers/masters/company-master.js';
import * as plantMasterController from '../controllers/masters/plant-master.js';
import * as whMaster from '../controllers/masters/warehouseMaster.js';
import * as whCategoryMaster from '../controllers/masters/whCategoryMaster.js';
import * as lineMaster from '../controllers/masters/lineMaster.js';
import * as UOMMaster from '../controllers/masters/uomMaster.js';
import * as WhLocationMaster from '../controllers/masters/whLocationMaster.js';
import * as PalletMasterController from '../controllers/masters/palletMaster.js';
import * as ShiftMasterController from '../controllers/masters/shiftMaster.js';
import * as PrinterMasterController from '../controllers/masters/printerMaster.js';
import * as ExistingStockUpload from '../controllers/masters/exisiting-stock-upload.js';
import * as TransporterMasterController from '../controllers/masters/transporterMaster.js';
import { authWithSession } from '../middleware/authWithSession.js';
const router = express.Router();

// Company Master
router.get('/company/all-details', authWithSession, companyMasterController.getAllCompanyDetails);
router.patch('/company/update-details', authWithSession, companyMasterController.updateCompanyDetails);
router.post('/company/insert-details', authWithSession, companyMasterController.insertCompanyDetails);

// Plant Master
router.get('/company/names', authWithSession, plantMasterController.getAllCompanyName);
router.post('/plant/insert-details', authWithSession, plantMasterController.insertAllDetails);
router.get('/plant/all-details', authWithSession, plantMasterController.getAllDetailsPlantMaster);
router.patch('/plant/update-details', authWithSession, plantMasterController.updateDetails);
router.get('/plant/codes', authWithSession, plantMasterController.getAllPlantCodes);

//UOM Master
router.get('/all-uom-details', authWithSession, UOMMaster.getAllUom);
router.get('/all-uom-unit', authWithSession, UOMMaster.getAllUomUnits);
router.post('/insert-uom-details', authWithSession, UOMMaster.insertUom);
router.patch('/update-uom-details', authWithSession, UOMMaster.updateUom);

//Warehouse Category Master
router.post('/insert-warehouse-category', authWithSession, whCategoryMaster.insertWhCategory);
router.get('/get-all-warehouse-category', authWithSession, whCategoryMaster.getAllWarehouseCategory);
router.patch('/update-warehouse-category', authWithSession, whCategoryMaster.updateWarehouseCategory);

//Warehouse Master
router.get('/get-all-plant-code', authWithSession, whMaster.getAllPlantCode);
router.get('/get-all-warehouse-category-code', authWithSession, whMaster.getCategoryCode);
router.post('/wh-insert-details', authWithSession, whMaster.insertDetails);
router.patch('/wh-update-details', authWithSession, whMaster.updateDetails);
router.get('/wh-all-details', authWithSession, whMaster.getAllDetails);
//Warehouse Location Master
router.get('/get-all-wh-code', authWithSession, WhLocationMaster.getAllWhCode);
router.get('/get-all-wh-location', authWithSession, WhLocationMaster.getAllDetails);
router.post('/insert-wh-location', authWithSession, WhLocationMaster.insertDetails);
router.patch('/update-wh-location', authWithSession, WhLocationMaster.updateDetails);
router.post('/upload-wh-location-excel', authWithSession, WhLocationMaster.uploadWhLocationExcel);

//Material Master
router.get('/get-all-material-details', auth, MaterialMaster.getAllMaterialDetails);
router.post('/insert-material-details', auth, MaterialMaster.insertMaterialDetails);
router.patch('/update-material-details', auth, MaterialMaster.updateMaterialDetails);
router.get('/get-all-plant-code', auth, MaterialMaster.getAllPlantCodes);


// Existing Stock Upload
router.post('/upload-existing-stock', authWithSession, ExistingStockUpload.uploadStock);
router.get('/get-all-existing-stock', authWithSession, ExistingStockUpload.getAllStockUploaded);

//Line Master
router.get('/get-all-line', authWithSession, lineMaster.getAllLineMaster);
router.post('/insert-line', authWithSession, lineMaster.insertLineMaster);
router.patch('/update-line', authWithSession, lineMaster.updateLineMaster);
router.get('/get-all-plant-name', authWithSession, lineMaster.getPlantName);
//TO get all plant code use -> get-all-plant-code

//Pallet Master
router.post('/insert-pallet-master', authWithSession, PalletMasterController.insertPalletMaster);
router.post('/update-pallet-master', authWithSession, PalletMasterController.updatePalletMaster);
router.post('/pallet-barcode-exist', authWithSession, PalletMasterController.checkPalletBarcode);
router.get('/pallet-all-details', authWithSession, PalletMasterController.getAllPalletMasterDetails);

// Printer Master
router.post('/insert-printer', authWithSession, PrinterMasterController.insertPrinter);
router.post('/update-printer', authWithSession, PrinterMasterController.updatePrinter);
router.get('/get-all-printer', authWithSession, PrinterMasterController.getAllPrinters);
router.get('/ping-printer', authWithSession, PrinterMasterController.pingPrinter);

// Shift Master
router.post('/insert-shift', authWithSession, ShiftMasterController.insertShift);
router.post('/update-shift', authWithSession, ShiftMasterController.updateShift);
router.get('/get-all-shift', authWithSession, ShiftMasterController.getAllShift);

// Transporter Master
router.post('/insert-transporter', authWithSession, TransporterMasterController.insertTransporter);
router.post('/update-transporter', authWithSession, TransporterMasterController.updateTransporter);
router.get('/get-all-transporter', authWithSession, TransporterMasterController.getAllTransporters);

export default router;
