```js
import { executeQuery, sql } from "../../config/db.js";
import { SAP_CONNECTOR_MIDDLEWARE_URL } from "../../utils/constants.js";
import { SAP_SERVER } from "../../utils/constants.js";

export const validateMaterialMovement = async (req, res) => {
    const { SerialNo, MovementType } = req.body;
    try {
        const result = await executeQuery(
            `EXEC [dbo].[Sp_HHT_FetchQC] 
                @PalletBarcode, 
                @MovementType`,
            [
                { name: 'PalletBarcode', type: sql.NVarChar, value: SerialNo },
                { name: 'MovementType', type: sql.NVarChar, value: MovementType }
            ]
        );
        res.json(result[0]);

    } catch (error) {
        console.error('Error validating material movement:', error);
        res.status(500).json({ error: 'Failed to validate material movement' });
    }
};

async function logSAPQCError(palletBarcode, orderNumber, material, batch, plant, requestedStatus, currentStatus, 
                           qty, errorMessage, moveType, stockType, storageLocation, mvtInd, unit, unitIso, 
                           gmCode, moveBatch, moveStorageLocation, user) {
    try {
        const result = await executeQuery(
            `EXEC [dbo].[Sp_SAP_QC_ERROR_LOG_Insert] 
                @PalletBarcode,
                @ORDER_NUMBER,
                @MATERIAL,
                @BATCH,
                @PRODUCTION_PLANT,
                @Requested_Status,
                @Current_Status,
                @Qty,
                @Error_Message,
                @MOVEMENT_TYPE,
                @STOCK_TYPE,
                @STORAGE_LOCATION,
                @MOVEMENT_INDICATOR,
                @UNIT,
                @UNIT_ISO,
                @GM_CODE,
                @MOVE_BATCH,
                @MOVE_STORAGELOCATION,
                @CreatedBy`,
            [
                { name: 'PalletBarcode', type: sql.NVarChar, value: palletBarcode },
                { name: 'ORDER_NUMBER', type: sql.NVarChar, value: orderNumber || '' },
                { name: 'MATERIAL', type: sql.NVarChar, value: material || '' },
                { name: 'BATCH', type: sql.NVarChar, value: batch || '' },
                { name: 'PRODUCTION_PLANT', type: sql.NVarChar, value: plant || '' },
                { name: 'Requested_Status', type: sql.NVarChar, value: requestedStatus || '' },
                { name: 'Current_Status', type: sql.NVarChar, value: currentStatus || '' },
                { name: 'Qty', type: sql.Decimal, value: qty || 0 },
                { name: 'Error_Message', type: sql.NVarChar, value: errorMessage || '' },
                { name: 'MOVEMENT_TYPE', type: sql.NVarChar, value: moveType || '' },
                { name: 'STOCK_TYPE', type: sql.NVarChar, value: stockType || '' },
                { name: 'STORAGE_LOCATION', type: sql.NVarChar, value: storageLocation || '' },
                { name: 'MOVEMENT_INDICATOR', type: sql.NVarChar, value: mvtInd || '' },
                { name: 'UNIT', type: sql.NVarChar, value: unit || '' },
                { name: 'UNIT_ISO', type: sql.NVarChar, value: unitIso || '' },
                { name: 'GM_CODE', type: sql.NVarChar, value: gmCode || '04' },
                { name: 'MOVE_BATCH', type: sql.NVarChar, value: moveBatch || '' },
                { name: 'MOVE_STORAGELOCATION', type: sql.NVarChar, value: moveStorageLocation || '' },
                { name: 'CreatedBy', type: sql.NVarChar, value: user || '' }
            ]
        );
        
        return result;
    } catch (error) {
        console.error('Error logging SAP QC error:', error);
        return { Status: 'F', Message: 'Failed to log SAP QC error' };
    }
}

export const updateMovementType = async (req, res) => {
    const { PalletBarcodes, NewStatus, Remark, Updateby, PRODUCTION_PLANT, Qtys, UNIT, UNIT_ISO } = req.body;
    const palletBarcodeArray = PalletBarcodes.split('*');
    const qtyArray = Qtys.split('$');
    const unitArray = UNIT.split('$');
    const unit_isoArray = UNIT_ISO.split('$');
        
    if (palletBarcodeArray.length !== qtyArray.length) {
        return res.status(400).json({ error: 'PalletBarcodes and Qtys length mismatch' });
    }

    try {
        let sapSuccess = true;
        let sapMessage = '';
        const currentDate = new Date().toISOString().split('T')[0];
        let materialDocument = null;
        let documentYear = null;

        if (Remark === 'Unrestricted') {
            const goodsmvtItems = [];
            const transfer5190Items = [];
            const move5110Items = [];
            const needsTransfer = [];
            
            for (let i = 0; i < palletBarcodeArray.length; i++) {
                const palletBarcode = palletBarcodeArray[i];
                const qty = qtyArray[i];
                const unit = unitArray[i];
                const unit_iso = unit_isoArray[i];
                
                const pallet = palletBarcode.split('#')[0];
                
                const palletDetails = await getPalletSAPDetails(pallet);
                
                const materialCode = palletDetails.material || pallet.split('|')[0];
                const orderNumber = palletDetails.orderNumber || '';
                const batch = palletDetails.batch || '';
                
                const paddedMaterial = materialCode.padStart(18, '0');
                const paddedOrderNumber = orderNumber ? orderNumber.padStart(12, '0') : '';

                // Check if pallet is in 5190 and qcStatus is null (needs two-step transfer)
                if (palletDetails.storageLocation === "5190" && palletDetails.qcStatus === null) {
                    needsTransfer.push({
                        index: i,
                        pallet,
                        paddedMaterial,
                        paddedOrderNumber,
                        batch,
                        qty: parseInt(qty),
                        unit,
                        unit_iso
                    });
                    
                    // First step: transfer to 5190 unrestricted (321)
                    transfer5190Items.push({
                        MATERIAL: paddedMaterial,
                        PLANT: PRODUCTION_PLANT,
                        STGE_LOC: "5190",
                        BATCH: batch,
                        MOVE_TYPE: "321",
                        STCK_TYPE: " ",
                        ITEM_TEXT: pallet,
                        ENTRY_QNT: parseInt(qty),
                        ENTRY_UOM: unit,
                        ENTRY_UOM_ISO: unit_iso,
                        PO_PR_QNT: parseInt(qty),
                        ORDERID: paddedOrderNumber,
                        MVT_IND: ""
                    });
                    
                    // Second step: move from 5190 to 5110 (311)
                    move5110Items.push({
                        MATERIAL: paddedMaterial,
                        PLANT: PRODUCTION_PLANT,
                        STGE_LOC: "5190",
                        BATCH: batch,
                        MOVE_TYPE: "311",
                        STCK_TYPE: " ",
                        MOVE_STLOC: "5110",
                        ITEM_TEXT: pallet,
                        ENTRY_QNT: parseInt(qty),
                        ENTRY_UOM: unit,
                        ENTRY_UOM_ISO: unit_iso,
                        PO_PR_QNT: parseInt(qty),
                        ORDERID: paddedOrderNumber,
                        MVT_IND: ""
                    });
                } else {
                    // Standard case: directly to unrestricted (321)
                    goodsmvtItems.push({
                        MATERIAL: paddedMaterial,
                        PLANT: PRODUCTION_PLANT,
                        STGE_LOC: "5110",
                        BATCH: batch,
                        MOVE_TYPE: "321",
                        STCK_TYPE: " ",
                        ITEM_TEXT: pallet,
                        ENTRY_QNT: parseInt(qty),
                        ENTRY_UOM: unit,
                        ENTRY_UOM_ISO: unit_iso,
                        PO_PR_QNT: parseInt(qty),
                        ORDERID: paddedOrderNumber,
                        MVT_IND: ""
                    });
                }
            }
            
            if (transfer5190Items.length > 0) {
                const sapData1 = {
                    ConnectionParams: SAP_SERVER,
                    GOODSMVT_CODE: {
                        GM_CODE: "04"
                    },
                    GOODSMVT_HEADER: {
                        PSTNG_DATE: currentDate,
                        DOC_DATE: currentDate,
                        HEADER_TXT: "QC Unrestricted",
                        PR_UNAME: Updateby
                    },
                    GOODSMVT_ITEM: transfer5190Items,
                    TESTRUN: false
                };
                
                const sapResponse1 = await sendToSAP(sapData1);
                let firstTxSuccess = sapResponse1.Status === 'T';
                
                if (!firstTxSuccess) {
                    sapSuccess = false;
                    sapMessage = sapResponse1.Message || 'Failed to transfer to unrestricted in 5190';
                    
                    // Log errors for first step
                    for (const item of needsTransfer) {
                        await logSAPQCError(
                            item.pallet, 
                            item.paddedOrderNumber, 
                            item.paddedMaterial, 
                            item.batch, 
                            PRODUCTION_PLANT,
                            NewStatus,
                            'Quality Inspection',
                            item.qty, 
                            sapMessage, 
                            "321", 
                            " ", 
                            "5190", 
                            "", 
                            item.unit, 
                            item.unit_iso, 
                            "04",
                            item.batch,
                            "",
                            Updateby
                        );
                    }
                } else {
                    // Step 2: Move from 5190 to 5110
                    const sapData2 = {
                        ConnectionParams: SAP_SERVER,
                        GOODSMVT_CODE: {
                            GM_CODE: "04"
                        },
                        GOODSMVT_HEADER: {
                            PSTNG_DATE: currentDate,
                            DOC_DATE: currentDate,
                            HEADER_TXT: "QC Unrestricted Step 2",
                            PR_UNAME: Updateby
                        },
                        GOODSMVT_ITEM: move5110Items,
                        TESTRUN: false
                    };
                    
                    const sapResponse2 = await sendToSAP(sapData2);
                    let secondTxSuccess = sapResponse2.Status === 'T';
                    
                    if (!secondTxSuccess) {
                        sapSuccess = false;
                        sapMessage = sapResponse2.Message || 'Failed to move from 5190 to 5110';
                        
                        // Log errors for second step
                        for (const item of needsTransfer) {
                            await logSAPQCError(
                                item.pallet, 
                                item.paddedOrderNumber, 
                                item.paddedMaterial, 
                                item.batch, 
                                PRODUCTION_PLANT,
                                NewStatus,
                                'Unrestricted', 
                                item.qty, 
                                sapMessage, 
                                "311", 
                                " ", 
                                "5190", 
                                "", 
                                item.unit, 
                                item.unit_iso, 
                                "04",
                                item.batch,
                                "5110",
                                Updateby
                            );
                        }
                    } else {
                        materialDocument = sapResponse2.materialDocument;
                        documentYear = sapResponse2.documentYear;
                    }
                }
            }
            
            if (goodsmvtItems.length > 0) {
                const sapData = {
                    ConnectionParams: SAP_SERVER,
                    GOODSMVT_CODE: {
                        GM_CODE: "04"
                    },
                    GOODSMVT_HEADER: {
                        PSTNG_DATE: currentDate,
                        DOC_DATE: currentDate,
                        HEADER_TXT: "QC Unrestricted",
                        PR_UNAME: Updateby
                    },
                    GOODSMVT_ITEM: goodsmvtItems,
                    TESTRUN: false
                };
                
                const sapResponse = await sendToSAP(sapData);
                
                if (sapResponse.Status === 'F') {
                    sapSuccess = false;
                    sapMessage = sapResponse.Message || 'Failed to post to SAP';
                    
                    // Only log errors for standard items here
                    for (let i = 0; i < palletBarcodeArray.length; i++) {
                        // Skip items that were in the special transfer process
                        if (needsTransfer.some(item => item.index === i)) continue;
                        
                        const palletBarcode = palletBarcodeArray[i];
                        const pallet = palletBarcode.split('#')[0];
                        const qty = qtyArray[i];
                        const unit = unitArray[i];
                        const unit_iso = unit_isoArray[i];
                        
                        const palletDetails = await getPalletSAPDetails(pallet);
                        const materialCode = palletDetails.material || pallet.split('|')[0];
                        const orderNumber = palletDetails.orderNumber || '';
                        const batch = palletDetails.batch || '';
                        
                        await logSAPQCError(
                            pallet, 
                            orderNumber, 
                            materialCode, 
                            batch, 
                            PRODUCTION_PLANT,
                            NewStatus,
                            'Quality Inspection',
                            qty, 
                            sapMessage, 
                            "321", 
                            " ", 
                            "5110", 
                            "", 
                            unit, 
                            unit_iso, 
                            "04",
                            batch,
                            "",
                            Updateby
                        );
                    }
                } else {
                    materialDocument = sapResponse.materialDocument;
                    documentYear = sapResponse.documentYear;
                }
            }
        } else if (Remark === 'Blocked') {
            const qcStatusItems = [];
            const stockTransferItems = [];
            
            for (let i = 0; i < palletBarcodeArray.length; i++) {
                const palletBarcode = palletBarcodeArray[i];
                const qty = qtyArray[i];
                const unit = unitArray[i];
                const unit_iso = unit_isoArray[i];
                
                const pallet = palletBarcode.split('#')[0];
                
                const palletDetails = await getPalletSAPDetails(pallet);
                
                const materialCode = palletDetails.material || pallet.split('|')[0];
                const orderNumber = palletDetails.orderNumber || '';
                const batch = palletDetails.batch || '';
                
                const paddedMaterial = materialCode.padStart(18, '0');
                const paddedOrderNumber = orderNumber ? orderNumber.padStart(12, '0') : '';
                
                qcStatusItems.push({
                    MATERIAL: paddedMaterial,
                    PLANT: PRODUCTION_PLANT,
                    STGE_LOC: "5110",
                    BATCH: batch,
                    MOVE_TYPE: "350",
                    STCK_TYPE: "S",
                    ITEM_TEXT: pallet,
                    ENTRY_QNT: parseInt(qty),
                    ENTRY_UOM: unit,
                    ENTRY_UOM_ISO: unit_iso,
                    PO_PR_QNT: parseInt(qty),
                    ORDERID: paddedOrderNumber,
                    MVT_IND: ""
                });
                
                stockTransferItems.push({
                    MATERIAL: paddedMaterial,
                    PLANT: PRODUCTION_PLANT,
                    STGE_LOC: "5110",
                    BATCH: batch,
                    MOVE_TYPE: "325",
                    STCK_TYPE: "S",
                    MOVE_STLOC: "5190",
                    ITEM_TEXT: pallet,
                    ENTRY_QNT: parseInt(qty),
                    ENTRY_UOM: unit,
                    ENTRY_UOM_ISO: unit_iso,
                    PO_PR_QNT: parseInt(qty),
                    ORDERID: paddedOrderNumber,
                    MVT_IND: ""
                });
            }
            
            const sapData1 = {
                ConnectionParams: SAP_SERVER,
                GOODSMVT_CODE: {
                    GM_CODE: "04"
                },
                GOODSMVT_HEADER: {
                    PSTNG_DATE: currentDate,
                    DOC_DATE: currentDate,
                    HEADER_TXT: "QC Blocked",
                    PR_UNAME: Updateby
                },
                GOODSMVT_ITEM: qcStatusItems,
                TESTRUN: false
            };
            
            let sapResponse1 = await sendToSAP(sapData1);
            let firstTxSuccess = sapResponse1.Status === 'T';
            
            const sapData2 = {
                ConnectionParams: SAP_SERVER,
                GOODSMVT_CODE: {
                    GM_CODE: "04"
                },
                GOODSMVT_HEADER: {
                    PSTNG_DATE: currentDate,
                    DOC_DATE: currentDate,
                    HEADER_TXT: "QC",
                    PR_UNAME: Updateby
                },
                GOODSMVT_ITEM: stockTransferItems,
                TESTRUN: false
            };
            
            let sapResponse2 = await sendToSAP(sapData2);
            let secondTxSuccess = sapResponse2.Status === 'T';
            
            if (!firstTxSuccess || !secondTxSuccess) {
                sapSuccess = false;
                
                for (let i = 0; i < palletBarcodeArray.length; i++) {
                    const palletBarcode = palletBarcodeArray[i];
                    const pallet = palletBarcode.split('#')[0];
                    const qty = qtyArray[i];
                    const unit = unitArray[i];
                    const unit_iso = unit_isoArray[i];
                    
                    const palletDetails = await getPalletSAPDetails(pallet);
                    const materialCode = palletDetails.material || pallet.split('|')[0];
                    const orderNumber = palletDetails.orderNumber || '';
                    const batch = palletDetails.batch || '';
                    
                    if (!firstTxSuccess) {
                        await logSAPQCError(
                            pallet, 
                            orderNumber, 
                            materialCode, 
                            batch, 
                            PRODUCTION_PLANT,
                            NewStatus,
                            'Quality Inspection',
                            qty, 
                            sapResponse1.Message || 'Failed to post QC status change to SAP', 
                            "350", 
                            "S", 
                            "5110", 
                            "", 
                            unit, 
                            unit_iso, 
                            "04",
                            batch,
                            "",
                            Updateby
                        );
                    }
                    
                    if (!secondTxSuccess) {
                        await logSAPQCError(
                            pallet, 
                            orderNumber, 
                            materialCode, 
                            batch, 
                            PRODUCTION_PLANT,
                            NewStatus,
                            'Quality Inspection',
                            qty, 
                            sapResponse2.Message || 'Failed to post stock transfer to SAP', 
                            "325", 
                            "S", 
                            "5110", 
                            "", 
                            unit, 
                            unit_iso, 
                            "04",
                            batch,
                            "5190",
                            Updateby
                        );
                    }
                }
                
                if (!firstTxSuccess && !secondTxSuccess) {
                    sapMessage = 'Both SAP transactions failed';
                } else if (!firstTxSuccess) {
                    sapMessage = 'First SAP transaction (350) failed: ' + sapResponse1.Message;
                } else {
                    sapMessage = 'Second SAP transaction (325) failed: ' + sapResponse2.Message;
                }
                
                materialDocument = secondTxSuccess ? sapResponse2.materialDocument : (firstTxSuccess ? sapResponse1.materialDocument : null);
                documentYear = secondTxSuccess ? sapResponse2.documentYear : (firstTxSuccess ? sapResponse1.documentYear : null);
            } else {
                materialDocument = sapResponse2.materialDocument;
                documentYear = sapResponse2.documentYear;
            }
            
        } else if (Remark === 'Unrestricted To Blocked') {
            const qcStatusItems = [];
            const stockTransferItems = [];
            
            for (let i = 0; i < palletBarcodeArray.length; i++) {
                const palletBarcode = palletBarcodeArray[i];
                const qty = qtyArray[i];
                const unit = unitArray[i];
                const unit_iso = unit_isoArray[i];
                
                const pallet = palletBarcode.split('#')[0];
                
                const palletDetails = await getPalletSAPDetails(pallet);
                
                const materialCode = palletDetails.material || pallet.split('|')[0];
                const orderNumber = palletDetails.orderNumber || '';
                const batch = palletDetails.batch || '';
                
                const paddedMaterial = materialCode.padStart(18, '0');
                const paddedOrderNumber = orderNumber ? orderNumber.padStart(12, '0') : '';
                
                qcStatusItems.push({
                    MATERIAL: paddedMaterial,
                    PLANT: PRODUCTION_PLANT,
                    STGE_LOC: "5110",
                    BATCH: batch,
                    MOVE_TYPE: "344",
                    STCK_TYPE: "S",
                    ITEM_TEXT: pallet,
                    ENTRY_QNT: parseInt(qty),
                    ENTRY_UOM: unit,
                    ENTRY_UOM_ISO: unit_iso,
                    PO_PR_QNT: parseInt(qty),
                    ORDERID: paddedOrderNumber,
                    MVT_IND: ""
                });
                
                stockTransferItems.push({
                    MATERIAL: paddedMaterial,
                    PLANT: PRODUCTION_PLANT,
                    STGE_LOC: "5110",
                    BATCH: batch,
                    MOVE_TYPE: "325",
                    STCK_TYPE: "S",
                    MOVE_STLOC: "5190",
                    ITEM_TEXT: pallet,
                    ENTRY_QNT: parseInt(qty),
                    ENTRY_UOM: unit,
                    ENTRY_UOM_ISO: unit_iso,
                    PO_PR_QNT: parseInt(qty),
                    ORDERID: paddedOrderNumber,
                    MVT_IND: ""
                });
            }
            
            const sapData1 = {
                ConnectionParams: SAP_SERVER,
                GOODSMVT_CODE: {
                    GM_CODE: "04"
                },
                GOODSMVT_HEADER: {
                    PSTNG_DATE: currentDate,
                    DOC_DATE: currentDate,
                    HEADER_TXT: "QC",
                    PR_UNAME: Updateby
                },
                GOODSMVT_ITEM: qcStatusItems,
                TESTRUN: false
            };
            
            let sapResponse1 = await sendToSAP(sapData1);
            let firstTxSuccess = sapResponse1.Status === 'T';
            
            const sapData2 = {
                ConnectionParams: SAP_SERVER,
                GOODSMVT_CODE: {
                    GM_CODE: "04"
                },
                GOODSMVT_HEADER: {
                    PSTNG_DATE: currentDate,
                    DOC_DATE: currentDate,
                    HEADER_TXT: "QC",
                    PR_UNAME: Updateby
                },
                GOODSMVT_ITEM: stockTransferItems,
                TESTRUN: false
            };
            
            let sapResponse2 = await sendToSAP(sapData2);
            let secondTxSuccess = sapResponse2.Status === 'T';
            
            if (!firstTxSuccess || !secondTxSuccess) {
                sapSuccess = false;
                
                for (let i = 0; i < palletBarcodeArray.length; i++) {
                    const palletBarcode = palletBarcodeArray[i];
                    const pallet = palletBarcode.split('#')[0];
                    const qty = qtyArray[i];
                    const unit = unitArray[i];
                    const unit_iso = unit_isoArray[i];
                    
                    const palletDetails = await getPalletSAPDetails(pallet);
                    const materialCode = palletDetails.material || pallet.split('|')[0];
                    const orderNumber = palletDetails.orderNumber || '';
                    const batch = palletDetails.batch || '';
                    
                    if (!firstTxSuccess) {
                        await logSAPQCError(
                            pallet, 
                            orderNumber, 
                            materialCode, 
                            batch, 
                            PRODUCTION_PLANT,
                            NewStatus,
                            'Unrestricted',
                            qty, 
                            sapResponse1.Message || 'Failed to post QC status change to SAP', 
                            "344", 
                            "S", 
                            "5110", 
                            "", 
                            unit, 
                            unit_iso, 
                            "04",
                            batch,
                            "",
                            Updateby
                        );
                    }
                    
                    if (!secondTxSuccess) {
                        await logSAPQCError(
                            pallet, 
                            orderNumber, 
                            materialCode, 
                            batch, 
                            PRODUCTION_PLANT,
                            NewStatus,
                            'Quality Inspection',
                            qty, 
                            sapResponse2.Message || 'Failed to post stock transfer to SAP', 
                            "325", 
                            "S", 
                            "5110", 
                            "", 
                            unit, 
                            unit_iso, 
                            "04",
                            batch,
                            "5190",
                            Updateby
                        );
                    }
                }
                
                if (!firstTxSuccess && !secondTxSuccess) {
                    sapMessage = 'Both SAP transactions failed';
                } else if (!firstTxSuccess) {
                    sapMessage = 'First SAP transaction (344) failed: ' + sapResponse1.Message;
                } else {
                    sapMessage = 'Second SAP transaction (325) failed: ' + sapResponse2.Message;
                }
                
                materialDocument = secondTxSuccess ? sapResponse2.materialDocument : (firstTxSuccess ? sapResponse1.materialDocument : null);
                documentYear = secondTxSuccess ? sapResponse2.documentYear : (firstTxSuccess ? sapResponse1.documentYear : null);
            } else {
                materialDocument = sapResponse2.materialDocument;
                documentYear = sapResponse2.documentYear;
            }
            
        } else if (Remark === 'Blocked To Unrestricted') {
            const stockTransferItems = [];
            const qcStatusItems = [];
            
            for (let i = 0; i < palletBarcodeArray.length; i++) {
                const palletBarcode = palletBarcodeArray[i];
                const qty = qtyArray[i];
                const unit = unitArray[i];
                const unit_iso = unit_isoArray[i];
                
                const pallet = palletBarcode.split('#')[0];
                
                const palletDetails = await getPalletSAPDetails(pallet);
                
                const materialCode = palletDetails.material || pallet.split('|')[0];
                const orderNumber = palletDetails.orderNumber || '';
                const batch = palletDetails.batch || '';
                
                const paddedMaterial = materialCode.padStart(18, '0');
                const paddedOrderNumber = orderNumber ? orderNumber.padStart(12, '0') : '';
                
                stockTransferItems.push({
                    MATERIAL: paddedMaterial,
                    PLANT: PRODUCTION_PLANT,
                    STGE_LOC: "5190",
                    BATCH: batch,
                    MOVE_TYPE: "325",
                    STCK_TYPE: "S",
                    MOVE_STLOC: "5110",
                    ITEM_TEXT: pallet,
                    ENTRY_QNT: parseInt(qty),
                    ENTRY_UOM: unit,
                    ENTRY_UOM_ISO: unit_iso,
                    PO_PR_QNT: parseInt(qty),
                    ORDERID: paddedOrderNumber,
                    MVT_IND: ""
                });
                
                qcStatusItems.push({
                    MATERIAL: paddedMaterial,
                    PLANT: PRODUCTION_PLANT,
                    STGE_LOC: "5110",
                    BATCH: batch,
                    MOVE_TYPE: "343",
                    STCK_TYPE: " ",
                    ITEM_TEXT: pallet,
                    ENTRY_QNT: parseInt(qty),
                    ENTRY_UOM: unit,
                    ENTRY_UOM_ISO: unit_iso,
                    PO_PR_QNT: parseInt(qty),
                    ORDERID: paddedOrderNumber,
                    MVT_IND: ""
                });
            }
            
            const sapData1 = {
                ConnectionParams: SAP_SERVER,
                GOODSMVT_CODE: {
                    GM_CODE: "04"
                },
                GOODSMVT_HEADER: {
                    PSTNG_DATE: currentDate,
                    DOC_DATE: currentDate,
                    HEADER_TXT: "QC",
                    PR_UNAME: Updateby
                },
                GOODSMVT_ITEM: stockTransferItems,
                TESTRUN: false
            };
            
            let sapResponse1 = await sendToSAP(sapData1);
            let firstTxSuccess = sapResponse1.Status === 'T';
            
            const sapData2 = {
                ConnectionParams: SAP_SERVER,
                GOODSMVT_CODE: {
                    GM_CODE: "04"
                },
                GOODSMVT_HEADER: {
                    PSTNG_DATE: currentDate,
                    DOC_DATE: currentDate,
                    HEADER_TXT: "QC",
                    PR_UNAME: Updateby
                },
                GOODSMVT_ITEM: qcStatusItems,
                TESTRUN: false
            };
            
            let sapResponse2 = await sendToSAP(sapData2);
            let secondTxSuccess = sapResponse2.Status === 'T';
            
            if (!firstTxSuccess || !secondTxSuccess) {
                sapSuccess = false;
                
                for (let i = 0; i < palletBarcodeArray.length; i++) {
                    const palletBarcode = palletBarcodeArray[i];
                    const pallet = palletBarcode.split('#')[0];
                    const qty = qtyArray[i];
                    const unit = unitArray[i];
                    const unit_iso = unit_isoArray[i];
                    
                    const palletDetails = await getPalletSAPDetails(pallet);
                    const materialCode = palletDetails.material || pallet.split('|')[0];
                    const orderNumber = palletDetails.orderNumber || '';
                    const batch = palletDetails.batch || '';
                    
                    if (!firstTxSuccess) {
                        await logSAPQCError(
                            pallet, 
                            orderNumber, 
                            materialCode, 
                            batch, 
                            PRODUCTION_PLANT,
                            NewStatus,
                            'Blocked',
                            qty, 
                            sapResponse1.Message || 'Failed to post stock transfer to SAP', 
                            "325", 
                            "S", 
                            "5190", 
                            "", 
                            unit, 
                            unit_iso, 
                            "04",
                            batch,
                            "5110",
                            Updateby
                        );
                    }
                    
                    if (!secondTxSuccess) {
                        await logSAPQCError(
                            pallet, 
                            orderNumber, 
                            materialCode, 
                            batch, 
                            PRODUCTION_PLANT,
                            NewStatus,
                            'Quality Inspection',
                            qty, 
                            sapResponse2.Message || 'Failed to post QC status change to SAP', 
                            "343", 
                            " ", 
                            "5110", 
                            "", 
                            unit, 
                            unit_iso, 
                            "04",
                            batch,
                            "",
                            Updateby
                        );
                    }
                }
                
                if (!firstTxSuccess && !secondTxSuccess) {
                    sapMessage = 'Both SAP transactions failed';
                } else if (!firstTxSuccess) {
                    sapMessage = 'First SAP transaction (325) failed: ' + sapResponse1.Message;
                } else {
                    sapMessage = 'Second SAP transaction (343) failed: ' + sapResponse2.Message;
                }
                
                materialDocument = secondTxSuccess ? sapResponse2.materialDocument : (firstTxSuccess ? sapResponse1.materialDocument : null);
                documentYear = secondTxSuccess ? sapResponse2.documentYear : (firstTxSuccess ? sapResponse1.documentYear : null);
            } else {
                materialDocument = sapResponse2.materialDocument;
                documentYear = sapResponse2.documentYear;
            }
        }

        let allPalletsUpdated = true;
        let dbResults = [];

        for (let i = 0; i < palletBarcodeArray.length; i++) {
            const palletBarcode = palletBarcodeArray[i].split('#')[0];
            const qty = qtyArray[i];
            const unit = unitArray[i];
            const unit_iso = unit_isoArray[i];
            
            let moveType = "";
            let stockType = "";
            let storageLocation = "5110";
            
            if (Remark === "Unrestricted") {
                moveType = "321";
                stockType = " ";
            } else if (Remark === "Blocked") {
                moveType = "350";
                stockType = "S";
                storageLocation = "5190";
            } else if (Remark === "Unrestricted To Blocked") {
                moveType = "344";
                stockType = "S";
                storageLocation = "5190";
            } else if (Remark === "Blocked To Unrestricted") {
                moveType = "343";
                stockType = " ";
                storageLocation = "5110";
            }
            
            const result = await executeQuery(
                `EXEC [dbo].[Sp_HHT_Update_MovementType] 
                    @PalletBarcode, 
                    @NewStatus, 
                    @Storage_Location, 
                    @Updateby,
                    @PRODUCTION_PLANT,
                    @PostedOnSAP,
                    @ErrorMessage,
                    @Qty,
                    @MOVE_TYPE,
                    @STOCK_TYPE,
                    @UOM,
                    @UOM_ISO,
                    @Remark`,
                [
                    { name: 'PalletBarcode', type: sql.NVarChar, value: palletBarcode },
                    { name: 'NewStatus', type: sql.NVarChar, value: NewStatus },
                    { name: 'Storage_Location', type: sql.NVarChar, value: NewStatus === 'Blocked' ? '5190' : '5110' },
                    { name: 'Updateby', type: sql.NVarChar, value: Updateby },
                    { name: 'PRODUCTION_PLANT', type: sql.NVarChar, value: PRODUCTION_PLANT },
                    { name: 'PostedOnSAP', type: sql.Bit, value: sapSuccess ? 1 : 0 },
                    { name: 'ErrorMessage', type: sql.NVarChar, value: sapSuccess ? "" : sapMessage },
                    { name: 'Qty', type: sql.Decimal, value: qty },
                    { name: 'MOVE_TYPE', type: sql.NVarChar, value: moveType },
                    { name: 'STOCK_TYPE', type: sql.NVarChar, value: stockType },
                    { name: 'UOM', type: sql.NVarChar, value: unit },
                    { name: 'UOM_ISO', type: sql.NVarChar, value: unit_iso },
                    { name: 'Remark', type: sql.NVarChar, value: Remark }
                ]
            );

            dbResults.push(result);
            
            if (result.length === 0 || result[0].Status === 'F') {
                allPalletsUpdated = false;
            }
        }

        if (!allPalletsUpdated) {
            return res.status(400).json({ 
                Status: 'F', 
                Message: 'Failed to update some pallets in database' 
            });
        }

        if (sapSuccess) {
            res.json({ 
                Status: 'T', 
                Message: `QC done for ${palletBarcodeArray.length} pallet(s) with status as ${NewStatus}`,
                materialDocument: materialDocument,
                documentYear: documentYear
            });
        } else {
            res.json({ 
                Status: 'T', 
                Message: `QC done for ${palletBarcodeArray.length} pallet(s) with status as ${NewStatus}, but SAP posting pending: ${sapMessage}` 
            });
        }
    } catch (error) {
        res.status(500).json({ Status: 'F', Message: 'Internal server error while updating movement type' });
    }
};

async function sendToSAP(requestBody) {
    try {
        const response = await fetch(`${SAP_CONNECTOR_MIDDLEWARE_URL}/api/goods-movement/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (!data) {
            return {
                Status: 'F',
                Message: 'No response received from SAP'
            };
        }

        if (data.Return && data.Return.length > 0) {
            const returnMessage = data.Return[0];
            if (['E', 'I', 'A'].includes(returnMessage.TYPE)) {
                return {
                    Status: 'F',
                    type: returnMessage.TYPE,
                    Message: returnMessage.MESSAGE
                };
            }
        }

        const materialDocument = data.MaterialDocument || (data.GoodsMovementHeadRet?.MAT_DOC || null);
        return {
            Status: 'T',
            materialDocument: materialDocument,
            documentYear: data.MatDocumentYear || data.GoodsMovementHeadRet?.MATDOCUMENTYEAR
        };
    } catch (error) {
        console.error('Error in SAP goods movement:', error);
        return {
            Status: 'F',
            Message: 'Error communicating with SAP: ' + error.message
        };
    }
}

export const getPendingSAPTransaction = async (req, res) => {
    const { FromDate, ToDate , OrderNumber, Batch, Material } = req.body;
    try {
        const result = await executeQuery(
            `EXEC [dbo].[Sp_SAP_QCHistory_Pending] @FromDate, @ToDate, @OrderNumber, @Batch, @Material`,
            [
                { name: 'FromDate', type: sql.NVarChar, value: FromDate },
                { name: 'ToDate', type: sql.NVarChar, value: ToDate },
                { name: 'OrderNumber', type: sql.NVarChar, value: OrderNumber },
                { name: 'Batch', type: sql.NVarChar, value: Batch },
                { name: 'Material', type: sql.NVarChar, value: Material }
            ]
        );
        res.json(result);
        
    } catch (error) {
        console.error('Error fetching pending QC history:', error);
        res.status(500).json({ error: 'Internal server error while fetching pending QC history.' });
    }
};

export const qcStatusChecking = async (req, res) => {
    const { SerialNo } = req.body;

    try {
        const delimeterCount = (SerialNo.match(/\|/g) || []).length;
        
        if (delimeterCount === 2) {
            try {
                const result = await executeQuery(
                    `EXEC [dbo].[HHT_QcStatus_PalletBarcode] @PalletBarcode`,
                    [
                        { name: 'PalletBarcode', type: sql.NVarChar, value: SerialNo }
                    ]
                );
                return res.json(result[0]);
            } catch (error) {
                console.error('Error fetching QC status for pallet:', error);
                return res.status(500).json({ error: 'Failed to execute stored procedure for pallet' });
            }
        } else if (delimeterCount === 4) {
            try {
                const result = await executeQuery(
                    `EXEC [dbo].[HHT_QcStatus_SerialNo] @SerialNo`,
                    [
                        { name: 'SerialNo', type: sql.NVarChar, value: SerialNo }
                    ]
                );
                return res.json(result[0]);
            } catch (error) {
                console.error('Error fetching QC status for serial:', error);
                return res.status(500).json({ error: 'Failed to execute stored procedure for serial' });
            }
        } else {
            return res.status(400).json({ Status: 'F', Message: 'Invalid barcode format' });
        }
    } catch (error) {
        console.error('Error in QC status checking:', error);
        return res.status(500).json({ Status: 'F', Message: 'Internal server error' });
    }
};

async function getPalletSAPDetails(palletBarcode) {
    try {
        const palletDetails = await executeQuery(
            `EXEC [dbo].[HHT_PalletSAPDetails] @ScanBarcode`,
            [
                { name: 'ScanBarcode', type: sql.NVarChar, value: palletBarcode }
            ]
        );
        
        if (palletDetails && palletDetails.length > 0) {
            return {
                orderNumber: palletDetails[0].ORDER_NUMBER || '',
                material: palletDetails[0].MATERIAL || '',
                batch: palletDetails[0].BATCH || '',
                storageLocation: palletDetails[0].STORAGE_LOCATION || '',
                qcStatus: palletDetails[0].QC_Status || '',
                success: true
            };
        } else {
            return {
                orderNumber: '',
                material: '',
                batch: '',
                success: false
            };
        }
    } catch (error) {
        console.error(`Error retrieving pallet details for ${palletBarcode}:`, error);
        return {
            orderNumber: '',
            material: '',
            batch: '',
            success: false
        };
    }
}
```