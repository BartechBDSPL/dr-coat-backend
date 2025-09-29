```js
import { executeQuery,sql } from "../../config/db.js";
import axios from "axios";
import { SAP_CONNECTOR_MIDDLEWARE_URL,SAP_SERVER } from "../../utils/constants.js";

const validateOrderNumber = (orderNumber) => {
    if (!orderNumber || (orderNumber.length !== 9 && orderNumber.length !== 12)) {
        return { Status: 'F', Message: "Invalid order number length.", status: 200 };
    }
    const expectedLength = orderNumber.startsWith('000') ? 12 : 9;
    if (orderNumber.length !== expectedLength) {
        return { Status: 'F', Message: `Order number must be ${expectedLength} digits`, status: 200 };
    }
    return { value: orderNumber.startsWith('000') ? orderNumber : `000${orderNumber}` };
};

const validateUnits = (unitsOfMeasure) => {
    const requiredUnits = ['PAL', 'ST', 'ZPE'];
    const unitCounts = unitsOfMeasure.reduce((acc, { ALT_UNIT }) => ({
        ...acc, [ALT_UNIT]: (acc[ALT_UNIT] || 0) + 1
    }), {});

    if (Object.keys(unitCounts).length !== 3 || 
        Object.values(unitCounts).some(count => count !== 1) ||
        !requiredUnits.every(unit => unitCounts[unit])) {
        return { error: "Units PAL, ST, and ZPE must all be present exactly once.", status: 400 };
    }
    return { value: true };
};

const formatResponse = (orderDetails) => {
    return {
        Status:'T',
        Message:"Order Number Found",
        RESORTING_ORDERNO: orderDetails.RESORTING_ORDERNO?.replace(/^0+/, '') || '',
        MATERIAL: orderDetails.MATERIAL?.replace(/^0+/, '') || '',
        MATERIAL_TEXT: orderDetails.MATERIAL_TEXT || '',
        BATCH_TO_PICK: orderDetails.BATCH_TO_PICK || '',
        REQ_QUAN: orderDetails.REQ_QUAN || '',
        PICKED_QTY: orderDetails.PICKED_QTY || null,
        REMAINING_TO_PICK: parseFloat(parseFloat(orderDetails.REQ_QUAN) - parseFloat(orderDetails.PICKED_QTY)) || null,
    };
};

export const getResOrderNo = async (req, res) => {
    try {
        const { ORDER_NUMBER, USER } = req.body;
        const orderValidation = validateOrderNumber(ORDER_NUMBER);
        if (orderValidation.error) {
            return res.status(orderValidation.status).json({ error: orderValidation.error });
        }
        const NUMBER = orderValidation.value;
        const materialResultExist = await executeQuery(
            'EXEC Sp_SubMaterialMaster_GetAllby_OrderNo @OrderNumber',
            [{ name: 'OrderNumber', type: sql.NVarChar, value: NUMBER }]
        )
        const orderExist = await executeQuery(
            'EXEC Sp_ResortingOrder_Check @OrderNumber',
            [{ name: 'OrderNumber', type: sql.NVarChar, value: NUMBER }]
        );

        if (orderExist[0].Status === 'T') {
            if (parseFloat(orderExist[0].PICKED_QTY) - parseFloat(orderExist[0].REQ_QUAN) === 0) {
                return res.status(200).json({
                    OrderDetails: {
                        Status: 'T',
                        Message: '✅ Picking Done for the Order Number: ' + NUMBER.replace(/^0+/, '')
                    }
                });
            } else {
                return res.status(200).json(formatResponse(orderExist[0]));
            }
        }

        const { data: orderData } = await axios.post(`${SAP_CONNECTOR_MIDDLEWARE_URL}/api/order/details`, {
            ConnectionParams: SAP_SERVER,
            NUMBER
        });

        if (orderData.Return.MESSAGE?.includes("does not exist")) {
            
            return res.status(400).json({ Status: 'F', Message: orderData.Return.MESSAGE });
        }

        const [posData] = orderData.PositionTable;
        const [compontData] = orderData.ComponentTable;
        const [headerData] = orderData.HeaderTable;
        const operationData = orderData.OperationTable.find(op => op.OPERATION_NUMBER === '0020');

        const { data: materialData } = await axios.post(`${SAP_CONNECTOR_MIDDLEWARE_URL}/api/material/getall`, {
            ConnectionParams: SAP_SERVER,
            Material: posData.MATERIAL,
            Plant: posData.PROD_PLANT
        });

        const unitsValidation = validateUnits(materialData.UnitsOfMeasure);
        if (unitsValidation.error) {
            return res.status(unitsValidation.status).json({ error: unitsValidation.error });
        }


        // Insert material data
        for (const uom of materialData.UnitsOfMeasure) {

            const materialResult = await executeQuery(
                'EXEC Sp_SubMaterialMaster_Insert @Material, @LanguISO, @MatlDesc, @AltUnit, @AltUnitISO, @Numerator, @Denominator, @OrderNumber, @CreatedBy',
                [
                    { name: 'Material', type: sql.NVarChar, value: materialData.ClientData.MATERIAL },
                    { name: 'LanguISO', type: sql.NVarChar, value: materialData.MaterialDescription[1].LANGU_ISO },
                    { name: 'MatlDesc', type: sql.NVarChar, value: materialData.MaterialDescription[1].MATL_DESC },
                    { name: 'AltUnit', type: sql.NVarChar, value: uom.ALT_UNIT },
                    { name: 'AltUnitISO', type: sql.NVarChar, value: uom.ALT_UNIT_ISO },
                    { name: 'Numerator', type: sql.Int, value: parseInt(uom.NUMERATOR) },
                    { name: 'Denominator', type: sql.Int, value: parseInt(uom.DENOMINATR) },
                    { name: 'OrderNumber', type: sql.NVarChar, value: posData.ORDER_NUMBER },
                    { name: 'CreatedBy', type: sql.NVarChar, value: USER }  
                ]
            );

            const materialMasterResult = await executeQuery(
                'EXEC Sp_MaterialMaster_Insert @Material, @LanguISO, @MatlDesc, @AltUnit, @AltUnitISO, @Numerator, @Denominator, @GrossWt, @NetWeight, @UnitOfWt, @UnitOfWtISO, @Base_UOM, @Base_UOM_ISO, @Matl_Type, @Size_Dim, @Length, @Width, @Height, @Volume, @VolumeUnit, @VolumeUnitISO, @CreatedBy',
                [
                    { name: 'Material', type: sql.NVarChar, value: materialData.ClientData.MATERIAL },
                    { name: 'LanguISO', type: sql.NVarChar, value: materialData.MaterialDescription[1].LANGU_ISO },
                    { name: 'MatlDesc', type: sql.NVarChar, value: materialData.MaterialDescription[1].MATL_DESC },
                    { name: 'AltUnit', type: sql.NVarChar, value: uom.ALT_UNIT },  
                    { name: 'AltUnitISO', type: sql.NVarChar, value: uom.ALT_UNIT_ISO },
                    { name: 'Numerator', type: sql.Int, value: parseInt(uom.NUMERATOR) },
                    { name: 'Denominator', type: sql.Int, value: parseInt(uom.DENOMINATR) },
                    { name: 'GrossWt', type: sql.Float, value: parseFloat(uom.GROSS_WT || 0) },
                    { name: 'NetWeight', type: sql.Float, value: parseFloat(uom.NET_WEIGHT || 0) },
                    { name: 'UnitOfWt', type: sql.NVarChar, value: materialData.ClientData.UNIT_OF_WT || '' },
                    { name: 'UnitOfWtISO', type: sql.NVarChar, value: materialData.ClientData.UNIT_OF_WT_ISO || '' },
                    { name: 'Base_UOM', type: sql.NVarChar, value: materialData.ClientData.BASE_UOM || '' },
                    { name: 'Base_UOM_ISO', type: sql.NVarChar, value: materialData.ClientData.BASE_UOM_ISO || '' },
                    { name: 'Matl_Type', type: sql.NVarChar, value: materialData.ClientData.MATL_TYPE || '' },
                    { name: 'Size_Dim', type: sql.NVarChar, value: materialData.ClientData.SIZE_DIM || '' },
                    { name: 'Length', type: sql.Float, value: parseFloat(uom.LENGTH || 0) },
                    { name: 'Width', type: sql.Float, value: parseFloat(uom.WIDTH || 0) },
                    { name: 'Height', type: sql.Float, value: parseFloat(uom.HEIGHT || 0) },
                    { name: 'Volume', type: sql.Float, value: parseFloat(uom.VOLUME || 0) },
                    { name: 'VolumeUnit', type: sql.NVarChar, value: uom.VOLUMEUNIT || '' },
                    { name: 'VolumeUnitISO', type: sql.NVarChar, value: uom.VOLUMEUNIT_ISO || '' },
                    { name: 'CreatedBy', type: sql.NVarChar, value: USER }
                ]
            );
            
            if (materialResult[0].Message === 'Error occurred while inserting data into Sub_Material_Master.') {
                return res.status(500).json(materialResult);
            }
        }
        // Insert production order
        const insertResult = await executeQuery(
            `EXEC Sp_ResortingOrder_Insert 
            @OrderNumber, @ReservationNumber, @ReservationItem, @Material, @MaterialText,
            @ProdPlant, @StorageLocation, @SupplyArea, @Batch, @ReqDate, @ReqQuan,
            @BaseUOM, @BaseUOMISO, @EntryQuantity, @MovementType, @OrderType,
            @Scrap, @ProductionStartDate, @ProductionFinishDate, @EnteredBy, @BatchToPick`,
            [
            { name: 'OrderNumber', type: sql.NVarChar, value: compontData.ORDER_NUMBER },
            { name: 'ReservationNumber', type: sql.NVarChar, value: compontData.RESERVATION_NUMBER },
            { name: 'ReservationItem', type: sql.NVarChar, value: compontData.RESERVATION_ITEM },
            { name: 'Material', type: sql.NVarChar, value: compontData.MATERIAL },
            { name: 'MaterialText', type: sql.NVarChar, value: compontData.MATERIAL_DESCRIPTION },
            { name: 'ProdPlant', type: sql.NVarChar, value: compontData.PROD_PLANT },
            { name: 'StorageLocation', type: sql.NVarChar, value: compontData.STORAGE_LOCATION },
            { name: 'SupplyArea', type: sql.NVarChar, value: compontData.SUPPLY_AREA },
            { name: 'Batch', type: sql.NVarChar, value: posData.BATCH},
            { name: 'ReqDate', type: sql.NVarChar, value: compontData.REQ_DATE },
            { name: 'ReqQuan', type: sql.NVarChar, value:compontData.REQ_QUAN.toString() || '' },
            { name: 'BaseUOM', type: sql.NVarChar, value: compontData.BASE_UOM },
            { name: 'BaseUOMISO', type: sql.NVarChar, value: compontData.BASE_UOM_ISO },
            { name: 'EntryQuantity', type: sql.NVarChar, value: compontData.ENTRY_QUANTITY },
            { name: 'MovementType', type: sql.NVarChar, value: compontData.MOVEMENT_TYPE},
            { name: 'OrderType', type: sql.NVarChar, value: posData.ORDER_TYPE },
            { name: 'Scrap', type: sql.NVarChar, value: headerData.SCRAP?.toString() || '' },
            { name: 'ProductionStartDate', type: sql.NVarChar, value: headerData.PRODUCTION_START_DATE },
            { name: 'ProductionFinishDate', type: sql.NVarChar, value: posData.PRODUCTION_FINISH_DATE },
            { name: 'EnteredBy', type: sql.NVarChar, value: headerData.ENTERED_BY },
            { name: 'BatchToPick', type: sql.NVarChar, value:  compontData.BATCH }
            ]
        );

        if(insertResult[0].Status === 'F') {
            return res.status(500).json(insertResult);
        }

        const finalResult = await executeQuery(
            'EXEC Sp_ResortingOrder_Check @OrderNumber',
            [{ name: 'OrderNumber', type: sql.NVarChar, value: NUMBER }]
        );
        const materialResult = await executeQuery(
            'EXEC Sp_SubMaterialMaster_GetAllby_OrderNo @OrderNumber',
            [{ name: 'OrderNumber', type: sql.NVarChar, value: NUMBER }]
        )
        return res.status(200).json( formatResponse(finalResult[0])
        );
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};

export const validateSerialNo = async (req, res) => {
    const { Barcode, Material, Batch, Qty } = req.body;
    // console.log(req.body)

    try {   
        const delimiterCount = (Barcode.match(/\|/g) || []).length;

        const params = [
            { name: 'Barcode', type: sql.VarChar(50), value: Barcode },
            { name: 'Material', type: sql.VarChar(50), value: Material.padStart(18, '0') },
            { name: 'Batch', type: sql.VarChar(50), value: Batch },
            { name: 'Qty', type: sql.Decimal, value: Qty }
        ];

        let result;
        if ( delimiterCount === 2) {
            result = await executeQuery('EXEC [dbo].[HHT_Resorting_PalletValidate] @Barcode, @Material, @Batch, @Qty', params);
        } else if (delimiterCount === 4) {
            result = await executeQuery('EXEC [dbo].[HHT_Resorting_SerialNoValidate] @Barcode, @Material, @Batch, @Qty', params);

        } else {
            return res.json({ Status: 'F', Message: 'Invalid Barcode scanned' });
        }
        // console.log(result)
        res.json(result[0]);
    } catch (error) {
        console.error('Error validating serial number/pallet:', error);
        res.status(500).json({ error: 'Failed to execute stored procedure' });
    }
};

```



