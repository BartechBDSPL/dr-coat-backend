import { executeQuery, sql } from '../../config/db.js';
import { SAP_CONNECTOR_MIDDLEWARE_URL, SAP_SERVER } from '../../utils/constants.js';
import axios from 'axios';
import { format, parse } from 'date-fns';

export const getDeliveryOrder = async (req, res) => {
  try {
    const { fromDate, toDate, salesOrg, user, assignStatus } = req.body;
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
          SALESORG_LOW: salesOrg,
          SALESORG_HIGH: salesOrg,
        },
      ],
      IT_VBELN: [
        {
          SIGN: 'I',
          OPTION: 'EQ',
          DELIV_NUMB: fromDate,
          GI_DATE_HIGH: toDate,
        },
      ],
    };

    // console.log('SAP Request Payload:', JSON.stringify(payload, null, 2));

    const response = await axios.post(`${SAP_CONNECTOR_MIDDLEWARE_URL}/api/picklist/details`, payload);
    // console.log('SAP Response:', JSON.stringify(response.data, null, 2));
    // return;
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

    // Process delivery items here ffor adding in material req
    const deliveryItems = response.data.DeliveryItems || [];
    const deliveryPartner = response.data.DeliveryPartners || [];
    const returnTable = response.data.DeliveryPartners || [];

    const results = [];

    for (const item of deliveryItems) {
      const spParams = [
        { name: 'DELIVERY_NO', type: sql.NVarChar, value: item.VBELN },
        { name: 'MATERIAL', type: sql.NVarChar, value: item.MATNR },
        { name: 'MATERIAL_TEXT', type: sql.NVarChar, value: item.ARKTX },
        { name: 'Plant', type: sql.NVarChar, value: item.WERKS },
        { name: 'STORAGE_LOCATION', type: sql.NVarChar, value: item.LGORT },
        { name: 'DELIVERY_QUANTITY', type: sql.Decimal, value: item.LFIMG },
        { name: 'BASE_UOM', type: sql.NVarChar, value: item.MEINS },
        { name: 'NET_WEIGHT', type: sql.Decimal, value: item.NTGEW },
        { name: 'WEIGHT_UNIT', type: sql.NVarChar, value: item.GEWEI },
        {
          name: 'MATERIAL_AVAILABILITY_DATE',
          type: sql.Date,
          value: item.MBDAT,
        },
        { name: 'Put_Qty', type: sql.Decimal, value: item.LGMNG },
        { name: 'Request_Quantity', type: sql.Decimal, value: item.LFIMG },
        { name: 'InsertedBy', type: sql.NVarChar, value: item.ERNAM },
      ];

      try {
        const result = await executeQuery(
          `EXEC [dbo].[Sp_MaterialRequest_Insert] 
                    @DELIVERY_NO, @MATERIAL, @MATERIAL_TEXT, @Plant, @STORAGE_LOCATION,
                    @DELIVERY_QUANTITY, @BASE_UOM, @NET_WEIGHT, @WEIGHT_UNIT,
                    @MATERIAL_AVAILABILITY_DATE, @Put_Qty, @Request_Quantity, @InsertedBy`,
          spParams
        );
        // console.log("spResult", result)
        results.push({ deliveryNo: item.VBELN, result });
      } catch (dbError) {
        console.error(`Error inserting delivery ${item.VBELN}:`, dbError);
        results.push({ deliveryNo: item.VBELN, error: dbError.message });
      }
    }

    for (const item of deliveryPartner) {
      const spParams = [
        { name: 'Order_Number', type: sql.NVarChar, value: item.VBELN },
        { name: 'Vendor_Name', type: sql.NVarChar, value: '' },
        { name: 'Vendor_No', type: sql.NVarChar, value: item.LIFNR },
        { name: 'Partner_Function', type: sql.NVarChar, value: item.PARVW },
        { name: 'Address_No', type: sql.NVarChar, value: item.ADRNR },
        { name: 'Country', type: sql.NVarChar, value: item.LAND1 },
        { name: 'Customer_No', type: sql.NVarChar, value: item.KUNNR },
        { name: 'InsertedBy', type: sql.NVarChar, value: user },
      ];

      try {
        const result = await executeQuery(
          `EXEC [dbo].[Sp_Delivery_Partner_Insert] 
                @Order_Number, @Vendor_Name, @Vendor_No, @Partner_Function, @Address_No,
                @Country, @Customer_No,@InsertedBy`,
          spParams
        );
        // console.log("spResult partner", result);
        if (result) {
          results.push({
            deliveryNo: item.VBELN,
            partnerFunction: item.PARVW,
            status: result[0],
          });
        }
      } catch (dbError) {
        console.error(`Error inserting partner ${item.VBELN} with partner function ${item.PARVW}:`, dbError);
        results.push({
          deliveryNo: item.VBELN,
          partnerFunction: item.PARVW,
          error: dbError.message,
        });
      }
    }

    // After processing deliveryItems and deliveryPartner, add the search call
    // Parse and format the dates from DD/MM/YYYY to YYYY-MM-DD
    const parsedFromDate = parse(fromDate, 'ddMMyyyy', new Date());
    const parsedToDate = parse(toDate, 'ddMMyyyy', new Date());

    const searchParams = [
      { name: 'User', type: sql.NVarChar, value: user },
      {
        name: 'FromDate',
        type: sql.NVarChar,
        value: format(parsedFromDate, 'yyyy-MM-dd'),
      },
      {
        name: 'ToDate',
        type: sql.NVarChar,
        value: format(parsedToDate, 'yyyy-MM-dd'),
      },
      { name: 'AssignStatus', type: sql.NVarChar, value: assignStatus },
    ];

    const searchResults = await executeQuery(
      'EXEC [dbo].[Sp_MaterialRequest_SearchOrderNo] @User, @FromDate, @ToDate, @AssignStatus',
      searchParams
    );

    return res.status(200).json({
      materialRequests: searchResults,
    });
  } catch (error) {
    console.error('Error in getDeliveryOrder:', error);
    return res.status(500).json({ error: error.message });
  }
};

export const getRecentMaterialTransactions = async (req, res) => {
  try {
    const result = await executeQuery(`EXEC [dbo].[Sp_MaterialRequest_RecentTransaction]`);

    res.json(result);
  } catch (error) {
    console.error('Error fetching recent material transactions:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const getUserIDs = async (req, res) => {
  try {
    const result = await executeQuery(`EXEC [dbo].[Sp_UserMaster_GetUserID]`);

    res.json(result);
  } catch (error) {
    console.error('Error fetching user IDs:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const assignDeliveryOrder = async (req, res) => {
  const { Delivery_No, MATERIAL, AssignUser, AssignedBy } = req.body;

  try {
    const result = await executeQuery(
      `EXEC [dbo].[Sp_MaterialRequest_Update] @Delivery_No, @MATERIAL, @AssignUser, @AssignedBy`,
      [
        { name: 'Delivery_No', type: sql.NVarChar(50), value: Delivery_No },
        { name: 'MATERIAL', type: sql.NVarChar(50), value: MATERIAL },
        { name: 'AssignUser', type: sql.NVarChar(50), value: AssignUser },
        { name: 'AssignedBy', type: sql.NVarChar(50), value: AssignedBy },
      ]
    );

    res.json(result[0]);
  } catch (error) {
    console.error('Error updating material request:', error);
    res.status(500).json({ error: 'Failed to execute stored procedure' });
  }
};

export const scanDeliveryQR = async (req, res) => {
  try {
    const { ScannedBarcode } = req.body;

    // Validate QR code format: DeliveryNo; CustomerNo; Consignee; PinCode; VehicleNo; LoadingPoint
    if (!ScannedBarcode || typeof ScannedBarcode !== 'string') {
      return res.status(200).json({
        Status: 'F',
        Message: 'Invalid QR code format',
      });
    }

    const qrParts = ScannedBarcode.split(';').map(part => part.trim());

    if (qrParts.length !== 6) {
      return res.status(200).json({
        Status: 'F',
        Message:
          'Invalid QR code format. Expected format: DeliveryNo; CustomerNo; Consignee; PinCode; VehicleNo; LoadingPoint',
      });
    }

    const [DeliveryNo, CustomerNo, Consignee, PinCode, VehicleNo, LoadingPoint] = qrParts;

    // Step 1: Check if delivery order exists
    const checkParams = [{ name: 'DeliveryNo', type: sql.NVarChar, value: DeliveryNo }];

    const checkResult = await executeQuery('EXEC [dbo].[Sp_Check_Delivery_OrderNo] @DeliveryNo', checkParams);

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
          SALESORG_LOW: '1000', // Default sales org, adjust as needed
          SALESORG_HIGH: '1000',
        },
      ],
      IT_VBELN: [
        {
          SIGN: 'I',
          OPTION: 'EQ',
          DELIV_NUMB: DeliveryNo,
          GI_DATE_HIGH: '',
        },
      ],
    };

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
                    @DELIVERY_NO, @MATERIAL, @MATERIAL_TEXT, @Plant, @STORAGE_LOCATION,
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
