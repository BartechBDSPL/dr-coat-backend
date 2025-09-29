import { executeQuery, sql } from '../../config/db.js';
import { SAP_CONNECTOR_MIDDLEWARE_URL, SAP_SERVER } from '../../utils/constants.js';
import axios from 'axios';

export const scanDeliveryQR = async (req, res) => {
  try {
    const { ScannedBarcode } = req.body;

    // Validate QR code format: DeliveryNo; CustomerNo; Consignee; PinCode; VehicleNo; LoadingPoint
    if (!ScannedBarcode || typeof ScannedBarcode !== 'string') {
      return res.status(200).json([
        {
          Status: 'F',
          Message: 'Invalid QR code format',
        },
      ]);
    }

    const qrParts = ScannedBarcode.split(';').map(part => part.trim());

    if (qrParts.length !== 6) {
      return res.status(200).json([
        {
          Status: 'F',
          Message:
            'Invalid QR code format. Expected format: DeliveryNo; CustomerNo; Consignee; PinCode; VehicleNo; LoadingPoint',
        },
      ]);
    }

    const [DeliveryNo, CustomerNo, Consignee, PinCode, VehicleNo, LoadingPoint] = qrParts;

    // Step 1: Check if delivery order exists
    const checkParams = [{ name: 'DeliveryNo', type: sql.NVarChar, value: DeliveryNo }];

    const checkResult = await executeQuery('EXEC [dbo].[Sp_Check_Delivery_OrderNo] @DeliveryNo', checkParams);

    if (checkResult[0].Status === 'F') {
      return res.status(200).json([
        {
          Status: 'F',
          Message: checkResult[0].Message,
        },
      ]);
    }

    // If delivery order exists and has data, return it
    if (checkResult && checkResult.length > 0 && checkResult[0].Status === 'T') {
      return res.status(200).json(checkResult);
    }

    // If delivery order doesn't exist or is empty, call SAP
    const payload = {
      ConnectionParams: SAP_SERVER,
      IS_DLV_DATA_CONTROL: {
        BYPASSING_BUFFER: 'X',
        HEAD_STATUS: 'X',
        HEAD_PARTNER: 'X',
        ITEM: 'X',
        ITEM_STATUS: 'X',
        DOC_FLOW: 'X',
        FT_DATA: 'X',
        HU_DATA: 'X',
        SERNO: 'X',
      },
      IT_VKORG: [
        {
          SIGN: 'I',
          OPTION: 'EQ',
          SALESORG_LOW: '5100', // Default sales org, adjust as needed
          SALESORG_HIGH: '5100',
        },
      ],
      IT_VBELN: [
        {
          SIGN: 'I',
          OPTION: 'EQ',
          DELIV_NUMB_LOW: DeliveryNo,
          DELIV_NUMB_HIGH: '',
        },
      ],
    };
    console.log('SAP Request Payload:', JSON.stringify(payload, null, 2));
    const response = await axios.post(`${SAP_CONNECTOR_MIDDLEWARE_URL}/api/picklist/details`, payload);

    // Check Return table for error messages
    if (response.data.Return && response.data.Return.length > 0) {
      const returnMessage = response.data.Return[0];
      if (['E', 'I', 'A'].includes(returnMessage.TYPE)) {
        return res.status(200).json({
          Status: 'F',
          Message: returnMessage.MESSAGE || 'Error in SAP response',
        });
      }
    }

    const deliveryItems = response.data.DeliveryItems || [];

    if (deliveryItems.length === 0) {
      return res.status(200).json({
        Status: 'F',
        Message: 'No delivery items found in SAP',
      });
    }

    // Insert delivery items using updated SP
    for (const item of deliveryItems) {
      const spParams = [
        { name: 'DELIVERY_NO', type: sql.NVarChar, value: item.VBELN },
        { name: 'POSNR', type: sql.NVarChar, value: item.POSNR },
        { name: 'MEINS', type: sql.NVarChar, value: item.MEINS },
        { name: 'MATERIAL', type: sql.NVarChar, value: item.MATNR },
        { name: 'MATERIAL_TEXT', type: sql.NVarChar, value: item.ARKTX },
        { name: 'Plant', type: sql.NVarChar, value: item.WERKS },
        { name: 'STORAGE_LOCATION', type: sql.NVarChar, value: item.LGORT },
        { name: 'DELIVERY_QUANTITY', type: sql.Decimal, value: item.LFIMG },
        { name: 'BASE_UOM', type: sql.NVarChar, value: item.MEINS },
        { name: 'NET_WEIGHT', type: sql.NVarChar, value: item.NTGEW },
        { name: 'WEIGHT_UNIT', type: sql.NVarChar, value: item.GEWEI },
        {
          name: 'MATERIAL_AVAILABILITY_DATE',
          type: sql.NVarChar,
          value: item.MBDAT,
        },
        { name: 'Put_Qty', type: sql.Decimal, value: item.LGMNG },
        { name: 'Request_Quantity', type: sql.Decimal, value: item.LFIMG },
        { name: 'CustomerNo', type: sql.NVarChar, value: CustomerNo },
        { name: 'Consignee', type: sql.NVarChar, value: Consignee },
        { name: 'PinCode', type: sql.NVarChar, value: PinCode },
        { name: 'VehicleNo', type: sql.NVarChar, value: VehicleNo },
        { name: 'LoadingPoint', type: sql.NVarChar, value: LoadingPoint },
        { name: 'InsertedBy', type: sql.NVarChar, value: item.ERNAM },
      ];

      try {
        await executeQuery(
          `EXEC [dbo].[Sp_MaterialRequest_Insert]     
                    @DELIVERY_NO, @POSNR, @MEINS, @MATERIAL, @MATERIAL_TEXT, @Plant, @STORAGE_LOCATION,
                    @DELIVERY_QUANTITY, @BASE_UOM, @NET_WEIGHT, @WEIGHT_UNIT,
                    @MATERIAL_AVAILABILITY_DATE, @Put_Qty, @Request_Quantity, 
                    @CustomerNo, @Consignee, @PinCode, @VehicleNo, @LoadingPoint, @InsertedBy`,
          spParams
        );
      } catch (dbError) {
        console.error(`Error inserting delivery ${item.VBELN}:`, dbError);
        return res.status(200).json({
          Status: 'F',
          Message: dbError.message,
        });
      }
    }

    // After successful insert, call Sp_Check_Delivery_OrderNo again to get the data
    const finalResult = await executeQuery('EXEC [dbo].[Sp_Check_Delivery_OrderNo] @DeliveryNo', checkParams);

    if (finalResult && finalResult.length > 0) {
      return res.status(200).json(finalResult);
    } else {
      return res.status(200).json({
        Status: 'F',
        Message: 'Error retrieving delivery details after insert',
      });
    }
  } catch (error) {
    console.error('Error in scanDeliveryQR:', error);
    return res.status(200).json({
      Status: 'F',
      Message: error.message,
    });
  }
};
