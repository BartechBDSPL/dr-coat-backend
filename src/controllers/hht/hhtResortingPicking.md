## Backup - when shivam was on leave performing resorting 

import { executeQuery,sql } from "../../config/db.js";
import { SAP_CONNECTOR_MIDDLEWARE_URL, SAP_SERVER } from "../../utils/constants.js";
import axios from "axios";
import { format } from 'date-fns';

export const validatePalletBarcodeResorting = async (req, res) => {
    const { OrderNo, Material, Barcode, PickOrderFlag, UserId, PendingPick, ReqQty, TotalPicked , BATCH } = req.body;
    console.log(req.body)
    
    try {
        const palletLocationResult = await executeQuery(
            `EXEC [dbo].[HHT_FGPick_PalletLocation_Resorting] @PalletBarcode`,
            [{ name: 'PalletBarcode', type: sql.NVarChar(50), value: Barcode }]
        );

        const palletLocationData = palletLocationResult[0];
        const qcStatusOfPallet = palletLocationData.QCStatus;
        if (palletLocationData.Status == 'F') {
            return res.json({ Status: 'F', Message: palletLocationData.Message }).status(200);
        }
        if(palletLocationData.StorageLocation!=='5190'){
            return res.json({ Status: 'F', Message: `Pallet is not in resorting area (5190)` }).status(200);
        }

        if(palletLocationData.Batch!==BATCH){
            return res.json({ Status: 'F', Message: `BATCH number mismatch scanned BATCH - ${palletLocationData.Batch} picked BATCH - ${BATCH}` }).status(200);
        }

        if(palletLocationData.Qty > PendingPick) {
            return res.json({ Status: 'F', Message: `Pallet Total Aval Qty is ${palletLocationData.Qty} which exceeds Pending Pick Qty ${PendingPick}` }).status(200);
        }
        const currentDate = format(new Date(), 'dd.MM.yyyy');
        const sapRequestBody = {
            ConnectionParams: SAP_SERVER,
            GOODSMVT_CODE: { GM_CODE: "03" },
            GOODSMVT_HEADER: {
            PSTNG_DATE: currentDate,
            DOC_DATE: currentDate,
            HEADER_TXT: "Good Issue"
            },
            GOODSMVT_ITEM: [
            {
                MATERIAL: Material.padStart(18, '0'),
                PLANT: "5100",
                STGE_LOC: palletLocationData.StorageLocation,
                BATCH: palletLocationData.Batch,
                MOVE_TYPE: "261",
                STCK_TYPE: "S",
                ITEM_TEXT: Barcode,
                SPEC_STOCK: "",
                ENTRY_QNT: palletLocationData.Qty, 
                ENTRY_UOM: palletLocationData.Unit,
                ENTRY_UOM_ISO: palletLocationData.UnitISO,
                ORDERID: OrderNo.padStart(12, '0'),
                MVT_IND: ""
            }
            ],
            TESTRUN: false
        };

        console.log("Request URL:", `${SAP_CONNECTOR_MIDDLEWARE_URL}/api/goods-movement/create`);
        console.log("Request body:", JSON.stringify(sapRequestBody, null, 2));

        let materialDocument = "";
        let sapError = false;
        let errorMessage = "";

        try {
            const response = await axios.post(
                `${SAP_CONNECTOR_MIDDLEWARE_URL}/api/goods-movement/create`,
                sapRequestBody,
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 300000
                }
            );
            
            const sapResponse = response.data;
            console.log("SAP response data:", JSON.stringify(sapResponse, null, 2));

            materialDocument = sapResponse.GoodsMovementHeadRet?.MAT_DOC;
            if (!materialDocument) {
                sapError = true;
                errorMessage = sapResponse.Return[0]?.MESSAGE || 'Failed to get material document number from SAP';
                
                // Log the error in the database
                await executeQuery(
                    `EXEC [dbo].[Sp_SAP_RESORTING_ERROR_LOG_Insert] 
                        @PalletBarcode, 
                        @ORDER_NUMBER, 
                        @MATERIAL, 
                        @BATCH, 
                        @PRODUCTION_PLANT,
                        @STORAGE_LOCATION,
                        @MOVE_TYPE,
                        @STOCK_TYPE,
                        @MOVE_BATCH,
                        @MOVE_STORAGELOCATION,
                        @SPEC_STOCK,
                        @MOVEMENT_INDICATOR,
                        @UOM,
                        @UOM_ISO,
                        @Qty,
                        @Error_Message,
                        @CreatedBy`,
                    [
                        { name: 'PalletBarcode', type: sql.NVarChar(255), value: Barcode },
                        { name: 'ORDER_NUMBER', type: sql.NVarChar(50), value: OrderNo.padStart(12,'0') },
                        { name: 'MATERIAL', type: sql.NVarChar(50), value: Material.padStart(18, '0') },
                        { name: 'BATCH', type: sql.NVarChar(50), value: palletLocationData.Batch },
                        { name: 'PRODUCTION_PLANT', type: sql.NVarChar(50), value: "5100" },
                        { name: 'STORAGE_LOCATION', type: sql.NVarChar(50), value: palletLocationData.StorageLocation },
                        { name: 'MOVE_TYPE', type: sql.NVarChar(50), value: "261" },
                        { name: 'STOCK_TYPE', type: sql.NVarChar(50), value: "S" },
                        { name: 'MOVE_BATCH', type: sql.NVarChar(50), value: "" },
                        { name: 'MOVE_STORAGELOCATION', type: sql.NVarChar(50), value: "" },
                        { name: 'SPEC_STOCK', type: sql.NVarChar(50), value: "" },
                        { name: 'MOVEMENT_INDICATOR', type: sql.NVarChar(50), value: "" },
                        { name: 'UOM', type: sql.NVarChar(50), value: palletLocationData.Unit },
                        { name: 'UOM_ISO', type: sql.NVarChar(50), value: palletLocationData.UnitISO },
                        { name: 'Qty', type: sql.Decimal(18, 3), value: palletLocationData.Qty },
                        { name: 'Error_Message', type: sql.NVarChar(500), value: errorMessage },
                        { name: 'CreatedBy', type: sql.NVarChar(50), value: UserId }
                    ]
                );
            }
        } catch (axiosError) {
            sapError = true;
            errorMessage = axiosError.response?.data?.Return?.[0]?.MESSAGE || 
                          axiosError.response?.data?.Message || 
                          (axiosError.response?.data?.ModelState ? JSON.stringify(axiosError.response.data.ModelState) : axiosError.message);
            
            // Log the error in the database
            await executeQuery(
                `EXEC [dbo].[Sp_SAP_RESORTING_ERROR_LOG_Insert] 
                    @PalletBarcode, 
                    @ORDER_NUMBER, 
                    @MATERIAL, 
                    @BATCH, 
                    @PRODUCTION_PLANT,
                    @STORAGE_LOCATION,
                    @MOVE_TYPE,
                    @STOCK_TYPE,
                    @MOVE_BATCH,
                    @MOVE_STORAGELOCATION,
                    @SPEC_STOCK,
                    @MOVEMENT_INDICATOR,
                    @UOM,
                    @UOM_ISO,
                    @Qty,
                    @Error_Message,
                    @CreatedBy`,
                [
                    { name: 'PalletBarcode', type: sql.NVarChar(255), value: Barcode },
                    { name: 'ORDER_NUMBER', type: sql.NVarChar(50), value: OrderNo.padStart(12,'0') },
                    { name: 'MATERIAL', type: sql.NVarChar(50), value: Material.padStart(18, '0') },
                    { name: 'BATCH', type: sql.NVarChar(50), value: palletLocationData.Batch },
                    { name: 'PRODUCTION_PLANT', type: sql.NVarChar(50), value: "5100" },
                    { name: 'STORAGE_LOCATION', type: sql.NVarChar(50), value: palletLocationData.StorageLocation },
                    { name: 'MOVE_TYPE', type: sql.NVarChar(50), value: "261" },
                    { name: 'STOCK_TYPE', type: sql.NVarChar(50), value: "S" },
                    { name: 'MOVE_BATCH', type: sql.NVarChar(50), value: "" },
                    { name: 'MOVE_STORAGELOCATION', type: sql.NVarChar(50), value: "" },
                    { name: 'SPEC_STOCK', type: sql.NVarChar(50), value: "" },
                    { name: 'MOVEMENT_INDICATOR', type: sql.NVarChar(50), value: "" },
                    { name: 'UOM', type: sql.NVarChar(50), value: palletLocationData.Unit },
                    { name: 'UOM_ISO', type: sql.NVarChar(50), value: palletLocationData.UnitISO },
                    { name: 'Qty', type: sql.Decimal(18, 3), value: palletLocationData.Qty },
                    { name: 'Error_Message', type: sql.NVarChar(500), value: `SAP API Error: ${errorMessage}` },
                    { name: 'CreatedBy', type: sql.NVarChar(50), value: UserId }
                ]
            );
        }
            
        // Always execute the stored procedure regardless of SAP success or failure
        const params = [
            { name: 'DeliveryNo', type: sql.NVarChar(50), value: OrderNo.padStart(12,'0') },
            { name: 'Material', type: sql.NVarChar(50), value: Material.padStart(18, '0') },
            { name: 'Barcode', type: sql.NVarChar(50), value: Barcode },
            { name: 'PickOrderFlag', type: sql.NVarChar(50), value: PickOrderFlag || "" },
            { name: 'Batch', type: sql.NVarChar(50), value: BATCH },
            { name: 'UserId', type: sql.NVarChar(50), value: UserId },
            { name: 'PendingPick', type: sql.Decimal(18, 3), value: parseFloat(PendingPick) || 0 },
            { name: 'ReqQty', type: sql.Decimal(18, 3), value: parseFloat(ReqQty) || 0 },
            { name: 'TotalPicked', type: sql.Decimal(18, 3), value: parseFloat(TotalPicked) || 0 }
        ];
        
        const result = await executeQuery(
            `EXEC [dbo].[HHT_FGPick_Resorting_PalletValidation] 
                @DeliveryNo, @Material, @Barcode, @PickOrderFlag, @Batch, @UserId, @PendingPick, @ReqQty, @TotalPicked`,
            params
        );
        
        if (sapError) {
            return res.json({
                ...(result[0]),
                SapMessage: `Process done but SAP pending⚠️ - Error: ${errorMessage}`,
                ErrorInSAP: true,
                Status: result[0]?.Status || 'T'
            });
        } else {
            return res.json({
                ...(result[0]),
                SapMessage: `SAP process completed successfully. Material Document: ${materialDocument}`,
                MaterialDocument: materialDocument,
                Status: result[0]?.Status || 'T'
            });
        }

    } catch (error) {
        console.error("General error:", error);
        res.status(500).json({ 
            Status: 'F',
            error: 'Failed to execute stored procedure', 
            details: error.message 
        });
    }
};

export const getOrderPickingDetailsData = async (req, res) => {
    const { UserName, OrderNo, MatCode } = req.body;    

    try {
        const result = await executeQuery(
            `EXEC [dbo].[HHT_FGPickResorting_MaterialDetailsData] @UserName, @OrderNo, @MatCode`,
            [
                { name: 'UserName', type: sql.NVarChar(50), value: UserName },
                { name: 'OrderNo', type: sql.NVarChar(50), value: OrderNo.padStart(12,'0') },
                { name: 'MatCode', type: sql.NVarChar(50), value: MatCode.padStart(18, '0') }
            ]
        );
        res.json(result);
    } catch (error) {
        console.error('Error fetching material details data:', error);
        res.status(500).json({ error: 'Failed to execute stored procedure' });
    }
};