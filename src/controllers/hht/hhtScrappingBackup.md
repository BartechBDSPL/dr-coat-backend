```js
export const updateWHBlockReleaseScrappingStatus = async (req, res) => {
    const { V_ScanBarcodes, NewQCStatus, StorageLocation, UserId, UNIT, UNIT_ISO, COSTCENTER, Reason } = req.body;

    try {
        if (!V_ScanBarcodes) {
            return res.json({
                Status: 'F',
                Message: 'No scan barcodes provided'
            });    
        }    

        // Generate scrapping serial number once
        const scrappingSrNoResult = await executeQuery(
            `EXEC [dbo].[HHT_ScrapppingSrNo_Generate]`,
            []
        );

        if (!scrappingSrNoResult || scrappingSrNoResult.length === 0) {
            return res.json({
                Status: 'F',
                Message: 'Failed to generate scrapping serial number'
            });
        }

        const scrappingSrNo = scrappingSrNoResult[0].SrNo;

        let allPalletBarcodes = new Set();
        let palletQuantities = new Map();
        let goodsmvtItems = [];

        // Parse concatenated unit values
        const unitValues = UNIT ? UNIT.split('$') : [];
        const unitIsoValues = UNIT_ISO ? UNIT_ISO.split('$') : [];

        const palletGroups = V_ScanBarcodes.split('*').filter(group => group.trim());
        
        // Process each pallet group - Format: palletnumber1#pallet1Qty;PalletNumber1*palletnumber2#pallet2Qty;PalletNumber2
        for (let i = 0; i < palletGroups.length; i++) {
            const group = palletGroups[i];
            if (group.includes('#')) {
                const [palletBarcode, quantityWithExtra] = group.split('#');
                if (quantityWithExtra) {
                    const quantity = quantityWithExtra.split(';')[0];
                    const parsedQuantity = parseFloat(quantity || 0);
                    
                    if (palletBarcode && parsedQuantity > 0) {
                        palletQuantities.set(palletBarcode, parsedQuantity);
                        
                        try {
                            const palletDetails = await executeQuery(
                                `EXEC [dbo].[HHT_Pallet_DetailsforPrinting] @ScanBarcode`,
                                [
                                    { name: 'ScanBarcode', type: sql.NVarChar, value: palletBarcode }
                                ]
                            );

                            if (palletDetails && palletDetails.length > 0) {
                                const detail = palletDetails[0];                                
                                // Get units for this pallet
                                const currentUnit = unitValues[i] || detail.ALT_UNIT || 'ST';
                                const currentUnitIso = unitIsoValues[i] || 'PCE';

                                const formattedMaterialNo = detail.MATERIAL?.padStart(18, '0') || '';
                              
                                goodsmvtItems.push({
                                    MATERIAL: formattedMaterialNo,
                                    PLANT: "5100",
                                    STGE_LOC: StorageLocation || "5110",
                                    BATCH: detail.BATCH || '',
                                    MOVE_TYPE: "551",
                                    STCK_TYPE: NewQCStatus === 'Unrestricted' ? ' ' : 'S',
                                    ENTRY_QNT: parsedQuantity,
                                    ENTRY_UOM: currentUnit,
                                    ENTRY_UOM_ISO: currentUnitIso,
                                    ITEM_TEXT: palletBarcode,
                                    MVT_IND: "",
                                    COSTCENTER: COSTCENTER || "84500",
                                });    

                                allPalletBarcodes.add(palletBarcode);
                            } else {
                                console.warn(`No details found for pallet: ${palletBarcode}`);
                                allPalletBarcodes.add(palletBarcode);
                            }
                        } catch (error) {
                            console.error(`Error getting pallet details for ${palletBarcode}:`, error);
                            allPalletBarcodes.add(palletBarcode);
                        }
                    }
                }    
            }    
        }    

        const currentDate = format(new Date(), 'dd.MM.yyyy');
        const batchSize = 50;
        const materialDocuments = [];
        const errorMessages = [];
        
        for (let i = 0; i < goodsmvtItems.length; i += batchSize) {
            const itemsBatch = goodsmvtItems.slice(i, i + batchSize);
            
            const sapRequestBody = {
                ConnectionParams: SAP_SERVER,
                GOODSMVT_CODE: { GM_CODE: "03" },
                GOODSMVT_HEADER: {
                    PSTNG_DATE: currentDate,
                    DOC_DATE: currentDate,     
                    HEADER_TXT: `${NewQCStatus === 'Unrestricted' ? 'RELEASE' : 'BLOCK'} WH ${StorageLocation || ''}`,
                    PR_UNAME: UserId
                },    
                GOODSMVT_ITEM: itemsBatch,
                TESTRUN: false
            };    

            try {
                const response = await axios.post(
                    `${SAP_CONNECTOR_MIDDLEWARE_URL}/api/goods-movement/create`, 
                    sapRequestBody,
                    { 
                        headers: { 'Content-Type': 'application/json' },
                        timeout: 60000 
                    }    
                );    
                
                const sapResponse = response.data;
                const materialDocument = sapResponse.GoodsMovementHeadRet?.MAT_DOC;
                
                if (response.data.Return && response.data.Return.length > 0) {
                    const returnMessage = response.data.Return[0];
                    if (['E', 'I', 'A'].includes(returnMessage.TYPE)) {
                        // Log error for each item that failed
                        for (const item of itemsBatch) {
                            await executeQuery(
                                `EXEC [dbo].[Sp_SAP_SCRAPPING_ERROR_LOG_Insert] 
                                    @SerialNo, 
                                    @ORDER_NUMBER, 
                                    @MATERIAL, 
                                    @BATCH, 
                                    @QC_Status,
                                    @Qty,
                                    @PRODUCTION_PLANT,
                                    @STORAGE_LOCATION,
                                    @MOVE_TYPE,
                                    @STOCK_TYPE,
                                    @UOM,
                                    @UOM_ISO,
                                    @MOVEMENT_INDICATOR,
                                    @COST_CENTER,
                                    @Error_Message,
                                    @GM_CODE,
                                    @CreatedBy`,
                                [
                                    { name: 'SerialNo', type: sql.NVarChar(255), value: item.ITEM_TEXT },
                                    { name: 'ORDER_NUMBER', type: sql.NVarChar(50), value: item.ORDERID || "" },
                                    { name: 'MATERIAL', type: sql.NVarChar(50), value: item.MATERIAL },
                                    { name: 'BATCH', type: sql.NVarChar(50), value: item.BATCH },
                                    { name: 'QC_Status', type: sql.NVarChar(50), value: NewQCStatus },
                                    { name: 'Qty', type: sql.Decimal, precision: 18, scale: 3, value: item.ENTRY_QNT },
                                    { name: 'PRODUCTION_PLANT', type: sql.NVarChar(50), value: item.PLANT || "5100" },
                                    { name: 'STORAGE_LOCATION', type: sql.NVarChar(50), value: item.STGE_LOC || StorageLocation || "5110" },
                                    { name: 'MOVE_TYPE', type: sql.NVarChar(50), value: item.MOVE_TYPE || "551" },
                                    { name: 'STOCK_TYPE', type: sql.NVarChar(50), value: item.STCK_TYPE || (NewQCStatus === 'Unrestricted' ? ' ' : 'S') },
                                    { name: 'UOM', type: sql.NVarChar(50), value: item.ENTRY_UOM },
                                    { name: 'UOM_ISO', type: sql.NVarChar(50), value: item.ENTRY_UOM_ISO },
                                    { name: 'MOVEMENT_INDICATOR', type: sql.NVarChar(50), value: item.MVT_IND || "" },
                                    { name: 'COST_CENTER', type: sql.NVarChar(50), value: item.COSTCENTER || COSTCENTER || "" },
                                    { name: 'Error_Message', type: sql.NVarChar(500), value: returnMessage.MESSAGE },
                                    { name: 'GM_CODE', type: sql.NVarChar(50), value: "03" },
                                    { name: 'CreatedBy', type: sql.NVarChar(50), value: UserId }
                                ]    
                            );    
                        }    
                        errorMessages.push(returnMessage.MESSAGE);
                        
                        const relatedPallets = Array.from(allPalletBarcodes).filter(pallet => 
                            itemsBatch.some(item => item.ITEM_TEXT === pallet)
                        );    
                        
                        for (const pallet of relatedPallets) {
                            if (pallet.trim()) {
                                await executeQuery(
                                    `EXEC [dbo].[HHT_WarehouseScrapping_PalletInsert] @ScanBarcode, @Reason, @ScrappingSrNo, @TransBy`,
                                    [
                                        { name: 'ScanBarcode', type: sql.NVarChar(50), value: pallet.trim() },
                                        { name: 'Reason', type: sql.NVarChar(255), value: Reason || '' },
                                        { name: 'ScrappingSrNo', type: sql.Int, value: scrappingSrNo },
                                        { name: 'TransBy', type: sql.NVarChar(50), value: UserId }
                                    ]    
                                );    
                            }    
                        }    
                        continue; 
                    }    
                }    

                if (!materialDocument) {
                    const errorMessage = sapResponse.Return[0]?.MESSAGE || 'Failed to get material document number from SAP';
                    
                    for (const item of itemsBatch) {
                        await executeQuery(
                            `EXEC [dbo].[Sp_SAP_SCRAPPING_ERROR_LOG_Insert] 
                                @SerialNo, 
                                @ORDER_NUMBER, 
                                @MATERIAL, 
                                @BATCH, 
                                @QC_Status,
                                @Qty,
                                @PRODUCTION_PLANT,
                                @STORAGE_LOCATION,
                                @MOVE_TYPE,
                                @STOCK_TYPE,
                                @UOM,
                                @UOM_ISO,
                                @MOVEMENT_INDICATOR,
                                @COST_CENTER,
                                @Error_Message,
                                @GM_CODE,
                                @CreatedBy`,
                            [
                                { name: 'SerialNo', type: sql.NVarChar(255), value: item.ITEM_TEXT },
                                { name: 'ORDER_NUMBER', type: sql.NVarChar(50), value: item.ORDERID || "" },
                                { name: 'MATERIAL', type: sql.NVarChar(50), value: item.MATERIAL },
                                { name: 'BATCH', type: sql.NVarChar(50), value: item.BATCH },
                                { name: 'QC_Status', type: sql.NVarChar(50), value: NewQCStatus },
                                { name: 'Qty', type: sql.Decimal, precision: 18, scale: 3, value: item.ENTRY_QNT },
                                { name: 'PRODUCTION_PLANT', type: sql.NVarChar(50), value: item.PLANT || "5100" },
                                { name: 'STORAGE_LOCATION', type: sql.NVarChar(50), value: item.STGE_LOC || StorageLocation || "5110" },
                                { name: 'MOVE_TYPE', type: sql.NVarChar(50), value: item.MOVE_TYPE || "551" },
                                { name: 'STOCK_TYPE', type: sql.NVarChar(50), value: item.STCK_TYPE || (NewQCStatus === 'Unrestricted' ? ' ' : 'S') },
                                { name: 'UOM', type: sql.NVarChar(50), value: item.ENTRY_UOM },
                                { name: 'UOM_ISO', type: sql.NVarChar(50), value: item.ENTRY_UOM_ISO },
                                { name: 'MOVEMENT_INDICATOR', type: sql.NVarChar(50), value: item.MVT_IND || "" },
                                { name: 'COST_CENTER', type: sql.NVarChar(50), value: item.COSTCENTER || COSTCENTER || "" },
                                { name: 'Error_Message', type: sql.NVarChar(500), value: errorMessage },
                                { name: 'GM_CODE', type: sql.NVarChar(50), value: "03" },
                                { name: 'CreatedBy', type: sql.NVarChar(50), value: UserId }
                            ]    
                        );    
                    }    
                    errorMessages.push(errorMessage);
                    
                    const relatedPallets = Array.from(allPalletBarcodes).filter(pallet => 
                        itemsBatch.some(item => item.ITEM_TEXT === pallet)
                    );    
                    
                    for (const pallet of relatedPallets) {
                        if (pallet.trim()) {
                            await executeQuery(
                                `EXEC [dbo].[HHT_WarehouseScrapping_PalletInsert] @ScanBarcode, @Reason, @ScrappingSrNo, @TransBy`,
                                [
                                    { name: 'ScanBarcode', type: sql.NVarChar(50), value: pallet.trim() },
                                    { name: 'Reason', type: sql.NVarChar(255), value: Reason || '' },
                                    { name: 'ScrappingSrNo', type: sql.Int, value: scrappingSrNo },
                                    { name: 'TransBy', type: sql.NVarChar(50), value: UserId }
                                ]    
                            );    
                        }    
                    }    
                    continue; 
                }    
                
                materialDocuments.push(materialDocument);
                
            } catch (axiosError) {
                console.error(`[updateWHBlockReleaseScrappingStatus] SAP API Error Details for ${NewQCStatus} Batch ${Math.floor(i / batchSize) + 1}:`, {
                    response: axiosError.response?.data,
                    status: axiosError.response?.status,
                    headers: axiosError.response?.headers
                });    

                const errorMessage = axiosError.response?.data?.Message 
                    || axiosError.response?.data?.ModelState
                        ? JSON.stringify(axiosError.response.data.ModelState)
                        : axiosError.message;

                // Log error for each item in the failed batch        
                for (const item of itemsBatch) {
                    await executeQuery(
                        `EXEC [dbo].[Sp_SAP_SCRAPPING_ERROR_LOG_Insert] 
                            @SerialNo, 
                            @ORDER_NUMBER, 
                            @MATERIAL, 
                            @BATCH, 
                            @QC_Status,
                            @Qty,
                            @PRODUCTION_PLANT,
                            @STORAGE_LOCATION,
                            @MOVE_TYPE,
                            @STOCK_TYPE,
                            @UOM,
                            @UOM_ISO,
                            @MOVEMENT_INDICATOR,
                            @COST_CENTER,
                            @Error_Message,
                            @GM_CODE,
                            @CreatedBy`,
                        [
                            { name: 'SerialNo', type: sql.NVarChar(255), value: item.ITEM_TEXT },
                            { name: 'ORDER_NUMBER', type: sql.NVarChar(50), value: item.ORDERID || "" },
                            { name: 'MATERIAL', type: sql.NVarChar(50), value: item.MATERIAL },
                            { name: 'BATCH', type: sql.NVarChar(50), value: item.BATCH },
                            { name: 'QC_Status', type: sql.NVarChar(50), value: NewQCStatus },
                            { name: 'Qty', type: sql.Decimal, precision: 18, scale: 3, value: item.ENTRY_QNT },
                            { name: 'PRODUCTION_PLANT', type: sql.NVarChar(50), value: item.PLANT || "5100" },
                            { name: 'STORAGE_LOCATION', type: sql.NVarChar(50), value: item.STGE_LOC || StorageLocation || "5110" },
                            { name: 'MOVE_TYPE', type: sql.NVarChar(50), value: item.MOVE_TYPE || "551" },
                            { name: 'STOCK_TYPE', type: sql.NVarChar(50), value: item.STCK_TYPE || (NewQCStatus === 'Unrestricted' ? ' ' : 'S') },
                            { name: 'UOM', type: sql.NVarChar(50), value: item.ENTRY_UOM },
                            { name: 'UOM_ISO', type: sql.NVarChar(50), value: item.ENTRY_UOM_ISO },
                            { name: 'MOVEMENT_INDICATOR', type: sql.NVarChar(50), value: item.MVT_IND || "" },
                            { name: 'COST_CENTER', type: sql.NVarChar(50), value: item.COSTCENTER || COSTCENTER || "" },
                            { name: 'Error_Message', type: sql.NVarChar(500), value: `SAP API Error: ${errorMessage}` },
                            { name: 'GM_CODE', type: sql.NVarChar(50), value: "03" },
                            { name: 'CreatedBy', type: sql.NVarChar(50), value: UserId }
                        ]    
                    );    
                }    
                
                errorMessages.push(`SAP API Error: ${errorMessage}`);
                
                // Find and update all pallet barcodes related to this batch
                const relatedPallets = Array.from(allPalletBarcodes).filter(pallet => 
                    itemsBatch.some(item => item.ITEM_TEXT === pallet)
                );    
                
                // Update with empty material document to allow process to continue 
                for (const pallet of relatedPallets) {
                    if (pallet.trim()) {
                        await executeQuery(
                            `EXEC [dbo].[HHT_WarehouseScrapping_PalletInsert] @ScanBarcode, @Reason, @ScrappingSrNo, @TransBy`,
                            [
                                { name: 'ScanBarcode', type: sql.NVarChar(50), value: pallet.trim() },
                                { name: 'Reason', type: sql.NVarChar(255), value: Reason || '' },
                                { name: 'ScrappingSrNo', type: sql.Int, value: scrappingSrNo },
                                { name: 'TransBy', type: sql.NVarChar(50), value: UserId }
                            ]    
                        );    
                    }    
                }    
                continue; 
            }    
        }    


        if (materialDocuments.length === 0) {
            return res.status(200).json({ 
                Status: 'T',  
                Message: `Process continues with SAP errors: ${errorMessages.join('; ')}`,
                ProcessedCount: Array.from(allPalletBarcodes).length,
                TotalQuantity: Array.from(palletQuantities.values()).reduce((a, b) => a + b, 0),
                MaterialDocument: "",
                AllDocuments: [],
                PartialFailures: true,
                ErrorMessages: errorMessages,
                ScrappingSrNo: scrappingSrNo
            });    
        }    

        const primaryMaterialDocument = materialDocuments[0];
        
        let updatedCount = 0;
        const successPallets = Array.from(allPalletBarcodes).filter(pallet => 
            !errorMessages.some(err => err.includes(pallet))
        );    
        
        for (let i = 0; i < successPallets.length; i += batchSize) {
            const palletBatch = successPallets.slice(i, i + batchSize);
            
            await Promise.all(palletBatch.map(async (pallet) => {
                if (pallet.trim()) {
                    await executeQuery(
                        `EXEC [dbo].[HHT_WarehouseScrapping_PalletInsert] @ScanBarcode, @Reason, @ScrappingSrNo, @TransBy`,
                        [
                            { name: 'ScanBarcode', type: sql.NVarChar(50), value: pallet.trim() },
                            { name: 'Reason', type: sql.NVarChar(255), value: Reason || '' },
                            { name: 'ScrappingSrNo', type: sql.Int, value: scrappingSrNo },
                            { name: 'TransBy', type: sql.NVarChar(50), value: UserId }
                        ]    
                    );    
                    updatedCount++;
                }    
            }));    
        }    

        // Send email notification
        try {
            const currentDate = new Date().toLocaleDateString('en-GB');
            await sendScrappingApprovalEmail(scrappingSrNo, currentDate);
        } catch (emailError) {
            console.error('Failed to send scrapping approval email:', emailError);
            // Don't fail the entire process if email fails
        }

        const responseMessage = errorMessages.length > 0 
            ? `${NewQCStatus} status update done, Pending in SAP ⚠️. Warnings: ${errorMessages.join('; ')}`
            : `${NewQCStatus} status update completed successfully. Document number: ${primaryMaterialDocument}`;
                    
        res.json({ 
            Status: 'T',
            Message: responseMessage,
            ProcessedCount: updatedCount,
            TotalQuantity: Array.from(palletQuantities.values()).reduce((a, b) => a + b, 0),
            MaterialDocument: primaryMaterialDocument,
            AllDocuments: materialDocuments,
            PartialFailures: errorMessages.length > 0,
            ScrappingSrNo: scrappingSrNo
        });    

    } catch (error) {
        console.error('[updateWHBlockReleaseScrappingStatus] Uncaught error:', error);
        console.error('[updateWHBlockReleaseScrappingStatus] Error stack:', error.stack);
 
        res.status(200).json({ 
            Status: 'F', 
            Message: `Error processing request: ${error.message}`
        });    
    }    
};
```