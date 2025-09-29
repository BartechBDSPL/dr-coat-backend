import { executeQuery, sql } from '../../config/db.js';
import { SAP_CONNECTOR_MIDDLEWARE_URL } from '../../utils/constants.js';
import { SAP_SERVER } from '../../utils/constants.js';
import axios from 'axios';
import { format } from 'date-fns';
import chalk from 'chalk';

export const validateMaterialMovement = async (req, res) => {
  const { SerialNo, MovementType } = req.body;
  try {
    const result = await executeQuery(
      `EXEC [dbo].[Sp_HHT_FetchQC] 
                @PalletBarcode, 
                @MovementType`,
      [
        { name: 'PalletBarcode', type: sql.NVarChar, value: SerialNo },
        { name: 'MovementType', type: sql.NVarChar, value: MovementType },
      ]
    );
    console.log(result[0]);
    res.json(result[0]);
  } catch (error) {
    console.error('Error validating material movement:', error);
    res.status(500).json({ error: 'Failed to validate material movement' });
  }
};

async function logSAPQCError(
  palletBarcode,
  orderNumber,
  material,
  batch,
  plant,
  requestedStatus,
  currentStatus,
  qty,
  errorMessage,
  moveType,
  stockType,
  storageLocation,
  mvtInd,
  unit,
  unitIso,
  gmCode,
  moveBatch,
  moveStorageLocation,
  user,
  isGRError = false
) {
  try {
    // If this is a GR error, use the GR error logging stored procedure
    if (isGRError && gmCode === '02') {
      const result = await executeQuery(
        `EXEC [dbo].[Sp_SAP_GR_ERROR_LOG_Insert] 
                    @PalletBarcode, 
                    @ORDER_NUMBER, 
                    @MATERIAL, 
                    @BATCH, 
                    @PRODUCTION_PLANT,
                    @Qty,
                    @Error_Message,
                    @MOVEMENT_TYPE,
                    @STOCK_TYPE,
                    @STORAGE_LOCATION,
                    @MOVEMENT_INDICATOR,
                    @UNIT,
                    @UNIT_ISO,
                    @GM_CODE,
                    @CreatedBy`,
        [
          {
            name: 'PalletBarcode',
            type: sql.NVarChar(255),
            value: palletBarcode || '',
          },
          {
            name: 'ORDER_NUMBER',
            type: sql.NVarChar(50),
            value: orderNumber || '',
          },
          { name: 'MATERIAL', type: sql.NVarChar(50), value: material || '' },
          { name: 'BATCH', type: sql.NVarChar(50), value: batch || '' },
          {
            name: 'PRODUCTION_PLANT',
            type: sql.NVarChar(50),
            value: plant || '',
          },
          { name: 'Qty', type: sql.Decimal, value: qty || 0 },
          {
            name: 'Error_Message',
            type: sql.NVarChar(500),
            value: errorMessage || '',
          },
          {
            name: 'MOVEMENT_TYPE',
            type: sql.NVarChar(50),
            value: moveType || '',
          },
          {
            name: 'STOCK_TYPE',
            type: sql.NVarChar(50),
            value: stockType || '',
          },
          {
            name: 'STORAGE_LOCATION',
            type: sql.NVarChar(50),
            value: storageLocation || '',
          },
          {
            name: 'MOVEMENT_INDICATOR',
            type: sql.NVarChar(50),
            value: mvtInd || '',
          },
          { name: 'UNIT', type: sql.NVarChar(50), value: unit || '' },
          { name: 'UNIT_ISO', type: sql.NVarChar(50), value: unitIso || '' },
          { name: 'GM_CODE', type: sql.NVarChar(50), value: gmCode || '02' },
          { name: 'CreatedBy', type: sql.NVarChar(50), value: user || '' },
        ]
      );
      return result;
    } else {
      // Use the existing QC error logging stored procedure
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
          {
            name: 'ORDER_NUMBER',
            type: sql.NVarChar,
            value: orderNumber || '',
          },
          { name: 'MATERIAL', type: sql.NVarChar, value: material || '' },
          { name: 'BATCH', type: sql.NVarChar, value: batch || '' },
          { name: 'PRODUCTION_PLANT', type: sql.NVarChar, value: plant || '' },
          {
            name: 'Requested_Status',
            type: sql.NVarChar,
            value: requestedStatus || '',
          },
          {
            name: 'Current_Status',
            type: sql.NVarChar,
            value: currentStatus || '',
          },
          { name: 'Qty', type: sql.Decimal, value: qty || 0 },
          {
            name: 'Error_Message',
            type: sql.NVarChar,
            value: errorMessage || '',
          },
          { name: 'MOVEMENT_TYPE', type: sql.NVarChar, value: moveType || '' },
          { name: 'STOCK_TYPE', type: sql.NVarChar, value: stockType || '' },
          {
            name: 'STORAGE_LOCATION',
            type: sql.NVarChar,
            value: storageLocation || '',
          },
          {
            name: 'MOVEMENT_INDICATOR',
            type: sql.NVarChar,
            value: mvtInd || '',
          },
          { name: 'UNIT', type: sql.NVarChar, value: unit || '' },
          { name: 'UNIT_ISO', type: sql.NVarChar, value: unitIso || '' },
          { name: 'GM_CODE', type: sql.NVarChar, value: gmCode || '04' },
          { name: 'MOVE_BATCH', type: sql.NVarChar, value: moveBatch || '' },
          {
            name: 'MOVE_STORAGELOCATION',
            type: sql.NVarChar,
            value: moveStorageLocation || '',
          },
          { name: 'CreatedBy', type: sql.NVarChar, value: user || '' },
        ]
      );
      return result;
    }
  } catch (error) {
    console.error('Error logging SAP error:', error);
    return { Status: 'F', Message: 'Failed to log SAP error' };
  }
}

export const updateMovementType = async (req, res) => {
  const { PalletBarcodes, NewStatus, Remark, Updateby, PRODUCTION_PLANT, Qtys, UNIT, UNIT_ISO } = req.body;

  // console.log(chalk.blue.bold('\n🚀 === UPDATE MOVEMENT TYPE STARTED ==='));
  // console.log(chalk.cyan('📊 Request Parameters:'));
  // console.log(chalk.gray(`   - PalletBarcodes: ${PalletBarcodes}`));
  // console.log(chalk.gray(`   - NewStatus: ${NewStatus}`));
  // console.log(chalk.gray(`   - Remark: ${Remark}`));
  // console.log(chalk.gray(`   - UpdateBy: ${Updateby}`));
  // console.log(chalk.gray(`   - Production Plant: ${PRODUCTION_PLANT}`));
  // console.log(chalk.gray(`   - Qtys: ${Qtys}`));
  // console.log(chalk.gray(`   - Units: ${UNIT}`));
  // console.log(chalk.gray(`   - Unit ISOs: ${UNIT_ISO}`));

  const palletBarcodeArray = PalletBarcodes.split('*');
  const qtyArray = Qtys.split('$');
  const unitArray = UNIT.split('$');
  const unit_isoArray = UNIT_ISO.split('$');

  console.log(chalk.yellow(`📦 Processing ${palletBarcodeArray.length} pallet(s)`));

  if (palletBarcodeArray.length !== qtyArray.length) {
    console.log(chalk.red.bold('❌ ERROR: PalletBarcodes and Qtys length mismatch'));
    console.log(chalk.red(`   - Pallets count: ${palletBarcodeArray.length}`));
    console.log(chalk.red(`   - Quantities count: ${qtyArray.length}`));
    return res.status(400).json({ error: 'PalletBarcodes and Qtys length mismatch' });
  }

  try {
    console.log(chalk.blue('\n🔄 Starting SAP processing...'));
    let sapSuccess = true;
    let sapMessage = '';
    const currentDate = new Date().toISOString().split('T')[0];
    let materialDocument = null;
    let documentYear = null;

    console.log(chalk.gray(`📅 Current Date: ${currentDate}`));

    if (Remark === 'Unrestricted') {
      console.log(chalk.green.bold('\n✅ PROCESSING: Unrestricted Status'));

      // First, process Good Receipt (GR) for all pallets
      console.log(chalk.blue('📥 Step 1: Processing Good Receipt (GR)...'));
      const grResult = await processGoodReceipt(
        palletBarcodeArray,
        qtyArray,
        unitArray,
        unit_isoArray,
        Updateby,
        PRODUCTION_PLANT
      );

      if (!grResult.success) {
        // GR failed, but continue with QC processing and log the error
        console.log(chalk.red.bold('❌ GR Processing Failed:'));
        console.log(chalk.red(`   Error: ${grResult.message}`));
        console.log(chalk.yellow('⚠️  Continuing with QC processing...'));
        sapMessage += `GR Failed: ${grResult.message}; `;
        sapSuccess = false;
      } else {
        console.log(chalk.green('✅ GR Processing Successful'));
        console.log(chalk.green(`   Material Document: ${grResult.materialDocument || 'N/A'}`));
        console.log(chalk.green(`   Processed Count: ${grResult.processedCount || 0}`));
      }

      // Now continue with QC processing
      console.log(chalk.blue('\n🔬 Step 2: Processing QC Status Changes...'));
      const goodsmvtItems = [];
      const transfer5190Items = [];
      const move5110Items = [];
      const needsTransfer = [];

      console.log(chalk.cyan('🔍 Analyzing pallet details and determining transfer requirements...'));

      for (let i = 0; i < palletBarcodeArray.length; i++) {
        const palletBarcode = palletBarcodeArray[i];
        const qty = qtyArray[i];
        const unit = unitArray[i];
        const unit_iso = unit_isoArray[i];

        const pallet = palletBarcode.split('#')[0];
        console.log(chalk.gray(`\n   📦 Processing Pallet ${i + 1}/${palletBarcodeArray.length}: ${pallet}`));

        // Get updated pallet details after GR
        const palletDetails = await getPalletSAPDetails(pallet);
        console.log(chalk.gray(`   📊 Pallet Details Retrieved:`));
        console.log(chalk.gray(`      - Material: ${palletDetails.material || 'N/A'}`));
        console.log(chalk.gray(`      - Order: ${palletDetails.orderNumber || 'N/A'}`));
        console.log(chalk.gray(`      - Batch: ${palletDetails.batch || 'N/A'}`));
        console.log(chalk.gray(`      - Storage Location: ${palletDetails.storageLocation || 'N/A'}`));
        console.log(chalk.gray(`      - QC Status: ${palletDetails.qcStatus || 'N/A'}`));

        const materialCode = palletDetails.material || pallet.split('|')[0];
        const orderNumber = palletDetails.orderNumber || '';
        const batch = palletDetails.batch || '';

        const paddedMaterial = materialCode.padStart(18, '0');
        const paddedOrderNumber = orderNumber ? orderNumber.padStart(12, '0') : '';

        // Check if pallet is in 5190 and qcStatus is null (needs two-step transfer)
        if (
          palletDetails.storageLocation === '5190' &&
          (palletDetails.qcStatus === null || palletDetails.qcStatus === '')
        ) {
          console.log(chalk.yellow(`   ⚡ Two-step transfer required (5190 → Unrestricted → 5110)`));
          needsTransfer.push({
            index: i,
            pallet,
            paddedMaterial,
            paddedOrderNumber,
            batch,
            qty: parseInt(qty),
            unit,
            unit_iso,
          });

          // First step: transfer to 5190 unrestricted (321)
          console.log(chalk.magenta(`      Step 1: Adding 321 movement (5190 unrestricted)`));
          transfer5190Items.push({
            MATERIAL: paddedMaterial,
            PLANT: PRODUCTION_PLANT,
            STGE_LOC: '5190',
            BATCH: batch,
            MOVE_TYPE: '321',
            STCK_TYPE: ' ',
            ITEM_TEXT: pallet.length > 45 ? pallet.substring(0, 45) : pallet,
            ENTRY_QNT: parseInt(qty),
            ENTRY_UOM: unit,
            ENTRY_UOM_ISO: unit_iso,
            PO_PR_QNT: parseInt(qty),
            ORDERID: paddedOrderNumber,
            MVT_IND: '',
          });

          // Second step: move from 5190 to 5110 (311)
          console.log(chalk.magenta(`      Step 2: Adding 311 movement (5190 → 5110)`));
          move5110Items.push({
            MATERIAL: paddedMaterial,
            PLANT: PRODUCTION_PLANT,
            STGE_LOC: '5190',
            BATCH: batch,
            MOVE_TYPE: '311',
            STCK_TYPE: ' ',
            MOVE_STLOC: '5110',
            ITEM_TEXT: pallet.length > 45 ? pallet.substring(0, 45) : pallet,
            ENTRY_QNT: parseInt(qty),
            ENTRY_UOM: unit,
            ENTRY_UOM_ISO: unit_iso,
            PO_PR_QNT: parseInt(qty),
            ORDERID: paddedOrderNumber,
            MVT_IND: '',
          });
        } else {
          // Standard case: directly to unrestricted (321)
          console.log(chalk.green(`   ✅ Standard transfer (direct to 5110 unrestricted)`));
          goodsmvtItems.push({
            MATERIAL: paddedMaterial,
            PLANT: PRODUCTION_PLANT,
            STGE_LOC: '5110',
            BATCH: batch,
            MOVE_TYPE: '321',
            STCK_TYPE: ' ',
            ITEM_TEXT: pallet.length > 45 ? pallet.substring(0, 45) : pallet,
            ENTRY_QNT: parseInt(qty),
            ENTRY_UOM: unit,
            ENTRY_UOM_ISO: unit_iso,
            PO_PR_QNT: parseInt(qty),
            ORDERID: paddedOrderNumber,
            MVT_IND: '',
          });
        }
      }

      console.log(chalk.blue('\n📊 Summary of items to process:'));
      console.log(chalk.gray(`   - Two-step transfers needed: ${needsTransfer.length}`));
      console.log(chalk.gray(`   - Transfer to 5190 items: ${transfer5190Items.length}`));
      console.log(chalk.gray(`   - Move to 5110 items: ${move5110Items.length}`));
      console.log(chalk.gray(`   - Direct unrestricted items: ${goodsmvtItems.length}`));

      if (transfer5190Items.length > 0) {
        console.log(chalk.yellow('\n🔄 Processing Step 1: Transfer to 5190 Unrestricted (Movement 321)'));
        const sapData1 = {
          ConnectionParams: SAP_SERVER,
          GOODSMVT_CODE: {
            GM_CODE: '04',
          },
          GOODSMVT_HEADER: {
            PSTNG_DATE: currentDate,
            DOC_DATE: currentDate,
            HEADER_TXT: 'QC Unrestricted',
            PR_UNAME: Updateby,
          },
          GOODSMVT_ITEM: transfer5190Items,
          TESTRUN: false,
        };

        console.log(chalk.gray(`📤 Sending ${transfer5190Items.length} items to SAP...`));
        const sapResponse1 = await sendToSAP(sapData1);
        let firstTxSuccess = sapResponse1.Status === 'T';

        if (!firstTxSuccess) {
          console.log(chalk.red.bold('❌ Step 1 Failed: Transfer to 5190 Unrestricted'));
          console.log(chalk.red(`   Error: ${sapResponse1.Message || 'Unknown error'}`));
          sapSuccess = false;
          sapMessage += sapResponse1.Message || 'Failed to transfer to unrestricted in 5190';

          // Log errors for first step (321 movement)
          console.log(chalk.yellow('📝 Logging errors for failed first transaction (321)...'));
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
              sapResponse1.Message || 'Failed to transfer to unrestricted in 5190',
              '321',
              ' ',
              '5190',
              '',
              item.unit,
              item.unit_iso,
              '04',
              item.batch,
              '',
              Updateby
            );
          }

          console.log(
            chalk.yellow('📝 Logging errors for second transaction (311) due to first transaction failure...')
          );
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
              'Second transaction (311) not executed due to first transaction (321) failure',
              '311',
              ' ',
              '5190',
              '',
              item.unit,
              item.unit_iso,
              '04',
              item.batch,
              '5110',
              Updateby
            );
          }
        } else {
          console.log(chalk.green('✅ Step 1 Successful: Transfer to 5190 Unrestricted'));
          console.log(chalk.green(`   Material Document: ${sapResponse1.materialDocument || 'N/A'}`));

          // Step 2: Move from 5190 to 5110
          console.log(chalk.yellow('\n🔄 Processing Step 2: Move from 5190 to 5110 (Movement 311)'));
          const sapData2 = {
            ConnectionParams: SAP_SERVER,
            GOODSMVT_CODE: {
              GM_CODE: '04',
            },
            GOODSMVT_HEADER: {
              PSTNG_DATE: currentDate,
              DOC_DATE: currentDate,
              HEADER_TXT: 'QC Unrestricted Step 2',
              PR_UNAME: Updateby,
            },
            GOODSMVT_ITEM: move5110Items,
            TESTRUN: false,
          };

          console.log(chalk.gray(`📤 Sending ${move5110Items.length} items to SAP...`));
          const sapResponse2 = await sendToSAP(sapData2);
          let secondTxSuccess = sapResponse2.Status === 'T';

          if (!secondTxSuccess) {
            console.log(chalk.red.bold('❌ Step 2 Failed: Move from 5190 to 5110'));
            console.log(chalk.red(`   Error: ${sapResponse2.Message || 'Unknown error'}`));
            sapSuccess = false;
            sapMessage += sapResponse2.Message || 'Failed to move from 5190 to 5110';

            // Log errors for second step (311 movement)
            console.log(chalk.yellow('📝 Logging errors for failed second transaction (311)...'));
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
                sapResponse2.Message || 'Failed to move from 5190 to 5110',
                '311',
                ' ',
                '5190',
                '',
                item.unit,
                item.unit_iso,
                '04',
                item.batch,
                '5110',
                Updateby
              );
            }
          } else {
            console.log(chalk.green('✅ Step 2 Successful: Move from 5190 to 5110'));
            console.log(chalk.green(`   Material Document: ${sapResponse2.materialDocument || 'N/A'}`));
            console.log(chalk.green(`   Document Year: ${sapResponse2.documentYear || 'N/A'}`));
            materialDocument = sapResponse2.materialDocument;
            documentYear = sapResponse2.documentYear;
          }
        }
      }

      if (goodsmvtItems.length > 0) {
        console.log(chalk.blue('\n🔄 Processing Direct Unrestricted Items (Movement 321)'));
        const sapData = {
          ConnectionParams: SAP_SERVER,
          GOODSMVT_CODE: {
            GM_CODE: '04',
          },
          GOODSMVT_HEADER: {
            PSTNG_DATE: currentDate,
            DOC_DATE: currentDate,
            HEADER_TXT: 'QC Unrestricted',
            PR_UNAME: Updateby,
          },
          GOODSMVT_ITEM: goodsmvtItems,
          TESTRUN: false,
        };

        console.log(chalk.gray(`📤 Sending ${goodsmvtItems.length} direct items to SAP...`));
        const sapResponse = await sendToSAP(sapData);

        if (sapResponse.Status === 'F') {
          console.log(chalk.red.bold('❌ Direct Processing Failed: QC Unrestricted'));
          console.log(chalk.red(`   Error: ${sapResponse.Message || 'Unknown error'}`));
          sapSuccess = false;
          sapMessage += sapResponse.Message || 'Failed to post to SAP';

          // Only log errors for standard items here
          console.log(chalk.yellow('📝 Logging errors for failed direct transfers...'));
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
            const currentStorageLocation = palletDetails.storageLocation === '5190' ? '5190' : '5110';

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
              '321',
              ' ',
              currentStorageLocation, // Use actual storage location from pallet details
              '',
              unit,
              unit_iso,
              '04',
              batch,
              '',
              Updateby
            );
          }
        } else {
          console.log(chalk.green('✅ Direct Processing Successful: QC Unrestricted'));
          console.log(chalk.green(`   Material Document: ${sapResponse.materialDocument || 'N/A'}`));
          console.log(chalk.green(`   Document Year: ${sapResponse.documentYear || 'N/A'}`));
          materialDocument = sapResponse.materialDocument;
          documentYear = sapResponse.documentYear;
        }
      }
    } else if (Remark === 'Blocked') {
      console.log(chalk.red.bold('\n🚫 PROCESSING: Blocked Status'));

      // First, process Good Receipt (GR) for all pallets
      console.log(chalk.blue('📥 Step 1: Processing Good Receipt (GR)...'));
      const grResult = await processGoodReceipt(
        palletBarcodeArray,
        qtyArray,
        unitArray,
        unit_isoArray,
        Updateby,
        PRODUCTION_PLANT
      );

      if (!grResult.success) {
        // GR failed, but continue with QC processing and log the error
        console.log(chalk.red.bold('❌ GR Processing Failed:'));
        console.log(chalk.red(`   Error: ${grResult.message}`));
        console.log(chalk.yellow('⚠️  Continuing with QC processing...'));
        sapMessage += `GR Failed: ${grResult.message}; `;
        sapSuccess = false;
      } else {
        console.log(chalk.green('✅ GR Processing Successful'));
        console.log(chalk.green(`   Material Document: ${grResult.materialDocument || 'N/A'}`));
        console.log(chalk.green(`   Processed Count: ${grResult.processedCount || 0}`));
      }

      // Now continue with QC processing
      console.log(chalk.blue('\n🔬 Step 2: Processing QC Status Changes for Blocked...'));
      const qcStatusItems = [];
      const stockTransferItems = [];
      const simpleBlockItems = [];
      const specialCase5190 = [];

      console.log(chalk.cyan('🔍 Analyzing pallet details and determining blocking requirements...'));

      for (let i = 0; i < palletBarcodeArray.length; i++) {
        const palletBarcode = palletBarcodeArray[i];
        const qty = qtyArray[i];
        const unit = unitArray[i];
        const unit_iso = unit_isoArray[i];

        const pallet = palletBarcode.split('#')[0];
        console.log(chalk.gray(`\n   📦 Processing Pallet ${i + 1}/${palletBarcodeArray.length}: ${pallet}`));

        // Get updated pallet details after GR
        const palletDetails = await getPalletSAPDetails(pallet);
        console.log(chalk.gray(`   📊 Pallet Details Retrieved:`));
        console.log(chalk.gray(`      - Material: ${palletDetails.material || 'N/A'}`));
        console.log(chalk.gray(`      - Order: ${palletDetails.orderNumber || 'N/A'}`));
        console.log(chalk.gray(`      - Batch: ${palletDetails.batch || 'N/A'}`));
        console.log(chalk.gray(`      - Storage Location: ${palletDetails.storageLocation || 'N/A'}`));
        console.log(chalk.gray(`      - QC Status: ${palletDetails.qcStatus || 'N/A'}`));

        const materialCode = palletDetails.material || pallet.split('|')[0];
        const orderNumber = palletDetails.orderNumber || '';
        const batch = palletDetails.batch || '';

        const paddedMaterial = materialCode.padStart(18, '0');
        const paddedOrderNumber = orderNumber ? orderNumber.padStart(12, '0') : '';

        if (
          palletDetails.storageLocation === '5190' &&
          (palletDetails.qcStatus === null || palletDetails.qcStatus === '')
        ) {
          console.log(chalk.yellow(`   ⚠️  Special Case: Pallet in 5190 Q stock - only needs movement 350`));
          simpleBlockItems.push({
            MATERIAL: paddedMaterial,
            PLANT: PRODUCTION_PLANT,
            STGE_LOC: '5190',
            BATCH: batch,
            MOVE_TYPE: '350',
            STCK_TYPE: 'S',
            ITEM_TEXT: pallet.length > 45 ? pallet.substring(0, 45) : pallet,
            ENTRY_QNT: parseInt(qty),
            ENTRY_UOM: unit,
            ENTRY_UOM_ISO: unit_iso,
            PO_PR_QNT: parseInt(qty),
            ORDERID: paddedOrderNumber,
            MVT_IND: '',
          });

          specialCase5190.push({
            pallet: pallet,
            paddedMaterial: paddedMaterial,
            paddedOrderNumber: paddedOrderNumber,
            batch: batch,
            qty: qty,
            unit: unit,
            unit_iso: unit_iso,
            index: i,
          });
        } else {
          console.log(chalk.red(`   🚫 Standard Case: Adding blocked movement items (350 & 325)`));
          qcStatusItems.push({
            MATERIAL: paddedMaterial,
            PLANT: PRODUCTION_PLANT,
            STGE_LOC: '5110',
            BATCH: batch,
            MOVE_TYPE: '350',
            STCK_TYPE: 'S',
            ITEM_TEXT: pallet.length > 45 ? pallet.substring(0, 45) : pallet,
            ENTRY_QNT: parseInt(qty),
            ENTRY_UOM: unit,
            ENTRY_UOM_ISO: unit_iso,
            PO_PR_QNT: parseInt(qty),
            ORDERID: paddedOrderNumber,
            MVT_IND: '',
          });

          stockTransferItems.push({
            MATERIAL: paddedMaterial,
            PLANT: PRODUCTION_PLANT,
            STGE_LOC: '5110',
            BATCH: batch,
            MOVE_TYPE: '325',
            STCK_TYPE: 'S',
            MOVE_STLOC: '5190',
            ITEM_TEXT: pallet.length > 45 ? pallet.substring(0, 45) : pallet,
            ENTRY_QNT: parseInt(qty),
            ENTRY_UOM: unit,
            ENTRY_UOM_ISO: unit_iso,
            PO_PR_QNT: parseInt(qty),
            ORDERID: paddedOrderNumber,
            MVT_IND: '',
          });
        }
      }

      console.log(chalk.blue('\n📊 Summary of items to process:'));
      console.log(chalk.gray(`   - Simple block (5190 Q to S): ${simpleBlockItems.length}`));
      console.log(chalk.gray(`   - Standard QC status items: ${qcStatusItems.length}`));
      console.log(chalk.gray(`   - Standard transfer items: ${stockTransferItems.length}`));

      // Process simple block items (5190 Q to S) first
      if (simpleBlockItems.length > 0) {
        // console.log(chalk.yellow('\n🔄 Processing Simple Block: 5190 Q to S (Movement 350)'));
        const sapDataSimple = {
          ConnectionParams: SAP_SERVER,
          GOODSMVT_CODE: {
            GM_CODE: '04',
          },
          GOODSMVT_HEADER: {
            PSTNG_DATE: currentDate,
            DOC_DATE: currentDate,
            HEADER_TXT: 'QC Block 5190',
            PR_UNAME: Updateby,
          },
          GOODSMVT_ITEM: simpleBlockItems,
          TESTRUN: false,
        };

        // console.log(chalk.gray(`📤 Sending ${simpleBlockItems.length} simple block items to SAP...`));
        const sapResponseSimple = await sendToSAP(sapDataSimple);
        let simpleBlockSuccess = sapResponseSimple.Status === 'T';

        if (!simpleBlockSuccess) {
          // console.log(chalk.red.bold('❌ Simple Block Failed'));
          // console.log(chalk.red(`   Error: ${sapResponseSimple.Message || 'Unknown error'}`));
          sapSuccess = false;
          sapMessage += `Simple Block Failed: ${sapResponseSimple.Message || 'Unknown error'}; `;

          // Log errors for simple block failures
          // console.log(chalk.yellow('📝 Logging errors for failed simple blocks...'));
          for (const item of specialCase5190) {
            await logSAPQCError(
              item.pallet,
              item.paddedOrderNumber,
              item.paddedMaterial,
              item.batch,
              PRODUCTION_PLANT,
              NewStatus,
              'Quality Inspection',
              item.qty,
              sapResponseSimple.Message || 'Failed to post simple block to SAP',
              '350',
              'S',
              '5190', // This is correct - 5190 Q to S
              '',
              item.unit,
              item.unit_iso,
              '04',
              item.batch,
              '',
              Updateby
            );
          }
        } else {
          // console.log(chalk.green('✅ Simple Block Successful'));
          // console.log(chalk.green(`   Material Document: ${sapResponseSimple.materialDocument || 'N/A'}`));
          // console.log(chalk.green(`   Document Year: ${sapResponseSimple.documentYear || 'N/A'}`));
          materialDocument = sapResponseSimple.materialDocument;
          documentYear = sapResponseSimple.documentYear;
        }
      }

      // Process standard blocking items (for pallets not in 5190 Q stock)
      if (qcStatusItems.length > 0) {
        // console.log(chalk.yellow('\n🔄 Processing Standard Block Step 1: QC Status Change (Movement 350)'));
        const sapData1 = {
          ConnectionParams: SAP_SERVER,
          GOODSMVT_CODE: {
            GM_CODE: '04',
          },
          GOODSMVT_HEADER: {
            PSTNG_DATE: currentDate,
            DOC_DATE: currentDate,
            HEADER_TXT: 'QC Blocked',
            PR_UNAME: Updateby,
          },
          GOODSMVT_ITEM: qcStatusItems,
          TESTRUN: false,
        };

        // console.log(chalk.gray(`📤 Sending ${qcStatusItems.length} QC status items to SAP...`));
        let sapResponse1 = await sendToSAP(sapData1);
        let firstTxSuccess = sapResponse1.Status === 'T';

        if (!firstTxSuccess) {
          // console.log(chalk.red.bold('❌ Standard Block Step 1 Failed'));
          // console.log(chalk.red(`   Error: ${sapResponse1.Message || 'Unknown error'}`));
          sapSuccess = false;
          sapMessage += `Standard Block Step 1 Failed: ${sapResponse1.Message || 'Unknown error'}; `;

          // Log errors for standard block step 1 failures (350 movement)
          console.log(chalk.yellow('📝 Logging errors for failed standard block step 1...'));
          for (let i = 0; i < palletBarcodeArray.length; i++) {
            // Skip items that were in the special case (5190 Q to S)
            if (specialCase5190.some(item => item.index === i)) continue;

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
              sapResponse1.Message || 'Failed to post QC status change to SAP',
              '350',
              'S',
              '5110',
              '',
              unit,
              unit_iso,
              '04',
              batch,
              '',
              Updateby
            );
          }
        } else {
          // console.log(chalk.green('✅ Standard Block Step 1 Successful'));
          // console.log(chalk.green(`   Material Document: ${sapResponse1.materialDocument || 'N/A'}`));

          // Set material document if not already set by simple block
          if (!materialDocument) {
            materialDocument = sapResponse1.materialDocument;
            documentYear = sapResponse1.documentYear;
          }
        }

        // Process Step 2: Stock Transfer
        if (stockTransferItems.length > 0) {
          // console.log(chalk.yellow('\n🔄 Processing Standard Block Step 2: Stock Transfer (Movement 325)'));
          const sapData2 = {
            ConnectionParams: SAP_SERVER,
            GOODSMVT_CODE: {
              GM_CODE: '04',
            },
            GOODSMVT_HEADER: {
              PSTNG_DATE: currentDate,
              DOC_DATE: currentDate,
              HEADER_TXT: 'QC Transfer',
              PR_UNAME: Updateby,
            },
            GOODSMVT_ITEM: stockTransferItems,
            TESTRUN: false,
          };

          // console.log(chalk.gray(`📤 Sending ${stockTransferItems.length} stock transfer items to SAP...`));
          let sapResponse2 = await sendToSAP(sapData2);
          let secondTxSuccess = sapResponse2.Status === 'T';

          if (!secondTxSuccess) {
            // console.log(chalk.red.bold('❌ Standard Block Step 2 Failed'));
            // console.log(chalk.red(`   Error: ${sapResponse2.Message || 'Unknown error'}`));
            sapSuccess = false;
            sapMessage += `Standard Block Step 2 Failed: ${sapResponse2.Message || 'Unknown error'}; `;

            // Log errors for standard block step 2 failures (325 movement)
            console.log(chalk.yellow('📝 Logging errors for failed standard block step 2...'));
            for (let i = 0; i < palletBarcodeArray.length; i++) {
              // Skip items that were in the special case (5190 Q to S)
              if (specialCase5190.some(item => item.index === i)) continue;

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
                sapResponse2.Message || 'Failed to post stock transfer to SAP',
                '325',
                'S',
                '5110',
                '',
                unit,
                unit_iso,
                '04',
                batch,
                '5190',
                Updateby
              );
            }
          } else {
            // console.log(chalk.green('✅ Standard Block Step 2 Successful'));
            // console.log(chalk.green(`   Material Document: ${sapResponse2.materialDocument || 'N/A'}`));
            // console.log(chalk.green(`   Document Year: ${sapResponse2.documentYear || 'N/A'}`));
            materialDocument = sapResponse2.materialDocument;
            documentYear = sapResponse2.documentYear;
          }
        }
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
          STGE_LOC: '5110',
          BATCH: batch,
          MOVE_TYPE: '344',
          STCK_TYPE: 'S',
          ITEM_TEXT: pallet.length > 45 ? pallet.substring(0, 45) : pallet,
          ENTRY_QNT: parseInt(qty),
          ENTRY_UOM: unit,
          ENTRY_UOM_ISO: unit_iso,
          PO_PR_QNT: parseInt(qty),
          ORDERID: paddedOrderNumber,
          MVT_IND: '',
        });

        stockTransferItems.push({
          MATERIAL: paddedMaterial,
          PLANT: PRODUCTION_PLANT,
          STGE_LOC: '5110',
          BATCH: batch,
          MOVE_TYPE: '325',
          STCK_TYPE: 'S',
          MOVE_STLOC: '5190',
          ITEM_TEXT: pallet.length > 45 ? pallet.substring(0, 45) : pallet,
          ENTRY_QNT: parseInt(qty),
          ENTRY_UOM: unit,
          ENTRY_UOM_ISO: unit_iso,
          PO_PR_QNT: parseInt(qty),
          ORDERID: paddedOrderNumber,
          MVT_IND: '',
        });
      }

      const sapData1 = {
        ConnectionParams: SAP_SERVER,
        GOODSMVT_CODE: {
          GM_CODE: '04',
        },
        GOODSMVT_HEADER: {
          PSTNG_DATE: currentDate,
          DOC_DATE: currentDate,
          HEADER_TXT: 'QC',
          PR_UNAME: Updateby,
        },
        GOODSMVT_ITEM: qcStatusItems,
        TESTRUN: false,
      };

      let sapResponse1 = await sendToSAP(sapData1);
      let firstTxSuccess = sapResponse1.Status === 'T';

      const sapData2 = {
        ConnectionParams: SAP_SERVER,
        GOODSMVT_CODE: {
          GM_CODE: '04',
        },
        GOODSMVT_HEADER: {
          PSTNG_DATE: currentDate,
          DOC_DATE: currentDate,
          HEADER_TXT: 'QC',
          PR_UNAME: Updateby,
        },
        GOODSMVT_ITEM: stockTransferItems,
        TESTRUN: false,
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
              '344',
              'S',
              '5110',
              '',
              unit,
              unit_iso,
              '04',
              batch,
              '',
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
              '325',
              'S',
              '5110',
              '',
              unit,
              unit_iso,
              '04',
              batch,
              '5190',
              Updateby
            );
          }
        }

        if (!firstTxSuccess && !secondTxSuccess) {
          sapMessage += 'Both SAP transactions failed; ';
        } else if (!firstTxSuccess) {
          sapMessage += 'First SAP transaction (344) failed: ' + sapResponse1.Message + '; ';
        } else {
          sapMessage += 'Second SAP transaction (325) failed: ' + sapResponse2.Message + '; ';
        }

        materialDocument = secondTxSuccess
          ? sapResponse2.materialDocument
          : firstTxSuccess
            ? sapResponse1.materialDocument
            : null;
        documentYear = secondTxSuccess ? sapResponse2.documentYear : firstTxSuccess ? sapResponse1.documentYear : null;
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
          STGE_LOC: '5190',
          BATCH: batch,
          MOVE_TYPE: '325',
          STCK_TYPE: 'S',
          MOVE_STLOC: '5110',
          ITEM_TEXT: pallet.length > 45 ? pallet.substring(0, 45) : pallet,
          ENTRY_QNT: parseInt(qty),
          ENTRY_UOM: unit,
          ENTRY_UOM_ISO: unit_iso,
          PO_PR_QNT: parseInt(qty),
          ORDERID: paddedOrderNumber,
          MVT_IND: '',
        });

        qcStatusItems.push({
          MATERIAL: paddedMaterial,
          PLANT: PRODUCTION_PLANT,
          STGE_LOC: '5110',
          BATCH: batch,
          MOVE_TYPE: '343',
          STCK_TYPE: ' ',
          ITEM_TEXT: pallet.length > 45 ? pallet.substring(0, 45) : pallet,
          ENTRY_QNT: parseInt(qty),
          ENTRY_UOM: unit,
          ENTRY_UOM_ISO: unit_iso,
          PO_PR_QNT: parseInt(qty),
          ORDERID: paddedOrderNumber,
          MVT_IND: '',
        });
      }

      const sapData1 = {
        ConnectionParams: SAP_SERVER,
        GOODSMVT_CODE: {
          GM_CODE: '04',
        },
        GOODSMVT_HEADER: {
          PSTNG_DATE: currentDate,
          DOC_DATE: currentDate,
          HEADER_TXT: 'QC',
          PR_UNAME: Updateby,
        },
        GOODSMVT_ITEM: stockTransferItems,
        TESTRUN: false,
      };

      let sapResponse1 = await sendToSAP(sapData1);
      let firstTxSuccess = sapResponse1.Status === 'T';

      const sapData2 = {
        ConnectionParams: SAP_SERVER,
        GOODSMVT_CODE: {
          GM_CODE: '04',
        },
        GOODSMVT_HEADER: {
          PSTNG_DATE: currentDate,
          DOC_DATE: currentDate,
          HEADER_TXT: 'QC',
          PR_UNAME: Updateby,
        },
        GOODSMVT_ITEM: qcStatusItems,
        TESTRUN: false,
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
              '325',
              'S',
              '5190',
              '',
              unit,
              unit_iso,
              '04',
              batch,
              '5110',
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
              '343',
              ' ',
              '5110',
              '',
              unit,
              unit_iso,
              '04',
              batch,
              '',
              Updateby
            );
          }
        }

        if (!firstTxSuccess && !secondTxSuccess) {
          sapMessage += 'Both SAP transactions failed; ';
        } else if (!firstTxSuccess) {
          sapMessage += 'First SAP transaction (325) failed: ' + sapResponse1.Message + '; ';
        } else {
          sapMessage += 'Second SAP transaction (343) failed: ' + sapResponse2.Message + '; ';
        }

        materialDocument = secondTxSuccess
          ? sapResponse2.materialDocument
          : firstTxSuccess
            ? sapResponse1.materialDocument
            : null;
        documentYear = secondTxSuccess ? sapResponse2.documentYear : firstTxSuccess ? sapResponse1.documentYear : null;
      } else {
        materialDocument = sapResponse2.materialDocument;
        documentYear = sapResponse2.documentYear;
      }
    }

    // console.log(chalk.blue('\n💾 Updating Database Records...'));
    let allPalletsUpdated = true;
    let dbResults = [];

    for (let i = 0; i < palletBarcodeArray.length; i++) {
      const palletBarcode = palletBarcodeArray[i].split('#')[0];
      const qty = qtyArray[i];
      const unit = unitArray[i];
      const unit_iso = unit_isoArray[i];

      // console.log(chalk.gray(`   📝 Updating pallet ${i + 1}/${palletBarcodeArray.length}: ${palletBarcode}`));

      let moveType = '';
      let stockType = '';
      let storageLocation = '5110';

      if (Remark === 'Unrestricted') {
        moveType = '321';
        stockType = ' ';
      } else if (Remark === 'Blocked') {
        moveType = '350';
        stockType = 'S';
        storageLocation = '5190';
      } else if (Remark === 'Unrestricted To Blocked') {
        moveType = '344';
        stockType = 'S';
        storageLocation = '5190';
      } else if (Remark === 'Blocked To Unrestricted') {
        moveType = '343';
        stockType = ' ';
        storageLocation = '5110';
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
          {
            name: 'Storage_Location',
            type: sql.NVarChar,
            value: NewStatus === 'Blocked' ? '5190' : '5110',
          },
          { name: 'Updateby', type: sql.NVarChar, value: Updateby },
          {
            name: 'PRODUCTION_PLANT',
            type: sql.NVarChar,
            value: PRODUCTION_PLANT,
          },
          { name: 'PostedOnSAP', type: sql.Bit, value: sapSuccess ? 1 : 0 },
          {
            name: 'ErrorMessage',
            type: sql.NVarChar,
            value: sapSuccess ? '' : sapMessage,
          },
          { name: 'Qty', type: sql.Decimal, value: qty },
          { name: 'MOVE_TYPE', type: sql.NVarChar, value: moveType },
          { name: 'STOCK_TYPE', type: sql.NVarChar, value: stockType },
          { name: 'UOM', type: sql.NVarChar, value: unit },
          { name: 'UOM_ISO', type: sql.NVarChar, value: unit_iso },
          { name: 'Remark', type: sql.NVarChar, value: Remark },
        ]
      );

      dbResults.push(result);

      if (result.length === 0 || result[0].Status === 'F') {
        // console.log(chalk.red(`      ❌ Database update failed for pallet: ${palletBarcode}`));
        allPalletsUpdated = false;
      } else {
        // console.log(chalk.green(`      ✅ Database updated successfully`));
      }
    }

    // console.log(chalk.blue(`\n📊 Database Update Summary:`));
    // console.log(chalk.gray(`   - Total pallets processed: ${palletBarcodeArray.length}`));
    // console.log(chalk.gray(`   - Successfully updated: ${dbResults.filter(r => r.length > 0 && r[0].Status === 'T').length}`));
    // console.log(chalk.gray(`   - Failed updates: ${dbResults.filter(r => r.length === 0 || r[0].Status === 'F').length}`));

    if (!allPalletsUpdated) {
      console.log(chalk.red.bold('\n❌ Some database updates failed'));
      return res.status(400).json({
        Status: 'F',
        Message: 'Failed to update some pallets in database',
      });
    }

    console.log(chalk.blue.bold('\n🎉 === PROCESS COMPLETED ==='));

    if (sapSuccess) {
      console.log(chalk.green.bold('✅ All operations completed successfully'));
      console.log(chalk.green(`📄 Material Document: ${materialDocument || 'N/A'}`));
      console.log(chalk.green(`📅 Document Year: ${documentYear || 'N/A'}`));
      res.json({
        Status: 'T',
        Message: `Production Entry + QC completed for ${palletBarcodeArray.length} pallet(s) with status as ${NewStatus}`,
        materialDocument: materialDocument,
        documentYear: documentYear,
      });
    } else {
      console.log(chalk.yellow.bold('⚠️  Process completed with warnings'));
      console.log(chalk.yellow(`🚨 SAP Operations Pending: ${sapMessage}`));
      res.json({
        Status: 'T',
        Message: `Production Entry + QC processed for ${palletBarcodeArray.length} pallet(s) with status as ${NewStatus}, but some SAP operations pending: ${sapMessage}`,
      });
    }
  } catch (error) {
    console.log(chalk.red.bold('\n💥 === CRITICAL ERROR ==='));
    console.log(chalk.red(`🚨 Error: ${error.message}`));
    console.log(chalk.red(`📍 Stack: ${error.stack}`));
    res.status(500).json({
      Status: 'F',
      Message: 'Internal server error while updating movement type',
    });
  }
};

async function sendToSAP(requestBody) {
  try {
    console.log(chalk.blue('🌐 Connecting to SAP...'));
    console.log(chalk.gray(`   URL: ${SAP_CONNECTOR_MIDDLEWARE_URL}/api/goods-movement/create`));
    console.log(chalk.gray(`   GM_CODE: ${requestBody.GOODSMVT_CODE?.GM_CODE || 'N/A'}`));
    console.log(chalk.gray(`   Items Count: ${requestBody.GOODSMVT_ITEM?.length || 0}`));

    const response = await fetch(`${SAP_CONNECTOR_MIDDLEWARE_URL}/api/goods-movement/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    console.log(chalk.cyan('📡 SAP Response received'));

    if (!data) {
      console.log(chalk.red('❌ No response data from SAP'));
      return {
        Status: 'F',
        Message: 'No response received from SAP',
      };
    }

    if (data.Return && data.Return.length > 0) {
      const returnMessage = data.Return[0];
      console.log(chalk.yellow(`⚠️  SAP Return Message: ${returnMessage.TYPE} - ${returnMessage.MESSAGE}`));
      if (['E', 'I', 'A'].includes(returnMessage.TYPE)) {
        console.log(chalk.red(`❌ SAP Error: ${returnMessage.MESSAGE}`));
        return {
          Status: 'F',
          type: returnMessage.TYPE,
          Message: returnMessage.MESSAGE,
        };
      }
    }

    const materialDocument = data.MaterialDocument || data.GoodsMovementHeadRet?.MAT_DOC || null;
    console.log(chalk.green(`✅ SAP Success: Material Document ${materialDocument || 'N/A'}`));
    return {
      Status: 'T',
      materialDocument: materialDocument,
      documentYear: data.MatDocumentYear || data.GoodsMovementHeadRet?.MATDOCUMENTYEAR,
    };
  } catch (error) {
    console.log(chalk.red.bold('💥 SAP Communication Error:'));
    console.log(chalk.red(`   Error: ${error.message}`));
    console.log(chalk.red(`   Stack: ${error.stack}`));
    return {
      Status: 'F',
      Message: 'Error communicating with SAP: ' + error.message,
    };
  }
}

export const getPendingSAPTransaction = async (req, res) => {
  const { FromDate, ToDate, OrderNumber, Batch, Material } = req.body;

  console.log(chalk.blue.bold('\n📊 === GET PENDING SAP TRANSACTIONS ==='));
  console.log(chalk.cyan('🔍 Query Parameters:'));
  console.log(chalk.gray(`   - From Date: ${FromDate || 'N/A'}`));
  console.log(chalk.gray(`   - To Date: ${ToDate || 'N/A'}`));
  console.log(chalk.gray(`   - Order Number: ${OrderNumber || 'N/A'}`));
  console.log(chalk.gray(`   - Batch: ${Batch || 'N/A'}`));
  console.log(chalk.gray(`   - Material: ${Material || 'N/A'}`));

  try {
    console.log(chalk.blue('🔄 Executing database query...'));
    const result = await executeQuery(
      `EXEC [dbo].[Sp_SAP_QCHistory_Pending] @FromDate, @ToDate, @OrderNumber, @Batch, @Material`,
      [
        { name: 'FromDate', type: sql.NVarChar, value: FromDate },
        { name: 'ToDate', type: sql.NVarChar, value: ToDate },
        { name: 'OrderNumber', type: sql.NVarChar, value: OrderNumber },
        { name: 'Batch', type: sql.NVarChar, value: Batch },
        { name: 'Material', type: sql.NVarChar, value: Material },
      ]
    );

    console.log(chalk.green(`✅ Query successful - Found ${result.length} pending transactions`));
    res.json(result);
  } catch (error) {
    console.log(chalk.red.bold('❌ Database query failed:'));
    console.log(chalk.red(`   Error: ${error.message}`));
    res.status(500).json({
      error: 'Internal server error while fetching pending QC history.',
    });
  }
};

export const qcStatusChecking = async (req, res) => {
  const { SerialNo } = req.body;

  try {
    try {
      const result = await executeQuery(`EXEC [dbo].[HHT_QcStatus_PalletBarcode] @PalletBarcode`, [
        { name: 'PalletBarcode', type: sql.NVarChar, value: SerialNo },
      ]);

      return res.json(result[0]);
    } catch (error) {
      return res.status(500).json({ Status: 'F', Message: 'Internal server error' });
    }
  } catch (error) {
    console.log(chalk.red.bold('❌ Error checking QC status:'));
    console.log(chalk.red(`   Error: ${error.message}`));
    return res.status(500).json({ Status: 'F', Message: 'Failed to check QC status' });
  }
};

async function getPalletSAPDetails(palletBarcode) {
  try {
    console.log(chalk.cyan(`🔍 Fetching pallet details for: ${palletBarcode}`));
    const palletDetails = await executeQuery(`EXEC [dbo].[HHT_PalletSAPDetails] @ScanBarcode`, [
      { name: 'ScanBarcode', type: sql.NVarChar, value: palletBarcode },
    ]);

    if (palletDetails && palletDetails.length > 0) {
      const details = {
        orderNumber: palletDetails[0].ORDER_NUMBER || '',
        material: palletDetails[0].MATERIAL || '',
        batch: palletDetails[0].BATCH || '',
        storageLocation: palletDetails[0].STORAGE_LOCATION || '',
        qcStatus: palletDetails[0].QC_Status || '',
        success: true,
      };
      console.log(chalk.green(`✅ Pallet details found`));
      console.log(chalk.gray(`   📋 Details: ${JSON.stringify(details, null, 2)}`));
      return details;
    } else {
      console.log(chalk.yellow(`⚠️  No pallet details found for: ${palletBarcode}`));
      return {
        orderNumber: '',
        material: '',
        batch: '',
        success: false,
      };
    }
  } catch (error) {
    console.log(chalk.red.bold(`❌ Error retrieving pallet details for ${palletBarcode}:`));
    console.log(chalk.red(`   Error: ${error.message}`));
    return {
      orderNumber: '',
      material: '',
      batch: '',
      success: false,
    };
  }
}

async function processGoodReceipt(palletBarcodes, qtys, units, unitIsos, userId, productionPlant) {
  let allPalletData = [];
  let goodsmvtItems = [];

  try {
    const currentDate = format(new Date(), 'dd.MM.yyyy');
    console.log(palletBarcodes, qtys, units, unitIsos, userId, productionPlant, 'Inside the GR function');

    for (let i = 0; i < palletBarcodes.length; i++) {
      const palletBarcode = palletBarcodes[i];
      const qty = parseFloat(qtys[i] || 0);
      const unit = units[i] || 'ST';
      const unitIso = unitIsos[i] || 'PCE';

      console.log(chalk.cyan(`🔍 Processing pallet ${i + 1}/${palletBarcodes.length}: ${palletBarcode}`));

      // Extract pallet data from format: "PalletBarcode#Qty;OrderNumber"
      if (palletBarcode.includes('#') && palletBarcode.includes(';')) {
        const [pallet, rest] = palletBarcode.split('#');
        const [palletQty, orderNumber] = rest.split(';');

        console.log(chalk.gray(`   - Pallet: ${pallet}`));
        console.log(chalk.gray(`   - Pallet Qty: ${palletQty}`));
        console.log(chalk.gray(`   - Order Number: ${orderNumber}`));

        // Get pallet details from database to fetch material and batch info
        const palletDetails = await getPalletSAPDetails(pallet);

        if (palletDetails && palletDetails.success) {
          let OrderNo = orderNumber || palletDetails.orderNumber;
          let ItemCode = palletDetails.material;
          let Batch = palletDetails.batch;

          console.log(chalk.gray(`   - Material: ${ItemCode}`));
          console.log(chalk.gray(`   - Batch: ${Batch}`));

          const formattedOrderNo = OrderNo.padStart(12, '0');
          const formattedMaterialNo = ItemCode.padStart(18, '0');

          // Determine storage location based on batch (same logic as GR)
          const storageLocation = Batch.includes('RS') ? '5190' : '5110';

          console.log(chalk.gray(`   - Storage Location: ${storageLocation}`));

          goodsmvtItems.push({
            MATERIAL: formattedMaterialNo,
            PLANT: productionPlant,
            STGE_LOC: storageLocation,
            BATCH: Batch,
            MOVE_TYPE: '101',
            STCK_TYPE: 'Q',
            ITEM_TEXT: pallet.length > 45 ? pallet.substring(0, 45) : pallet,
            ENTRY_QNT: qty,
            ENTRY_UOM: unit,
            ENTRY_UOM_ISO: unitIso,
            PO_PR_QNT: qty,
            ORDERID: formattedOrderNo,
            MVT_IND: 'F',
          });

          // Store pallet data for later database update
          allPalletData.push({
            palletBarcode: pallet,
            quantity: qty,
            orderNo: formattedOrderNo,
            material: formattedMaterialNo,
            batch: Batch,
            unit: unit,
            unitIso: unitIso,
          });
        } else {
          console.log(chalk.red(`❌ Failed to get pallet details for: ${pallet}`));
        }
      } else {
        console.log(chalk.red(`❌ Invalid pallet barcode format: ${palletBarcode}`));
      }
    }

    if (goodsmvtItems.length === 0) {
      console.log(chalk.red('❌ No valid items found for GR processing'));
      return {
        success: false,
        message: 'No valid items found for GR processing',
        processedCount: 0,
      };
    }

    console.log(chalk.blue(`📤 Sending ${goodsmvtItems.length} items to SAP for GR processing...`));

    // Process GR with SAP
    const sapRequestBody = {
      ConnectionParams: SAP_SERVER,
      GOODSMVT_CODE: { GM_CODE: '02' },
      GOODSMVT_HEADER: {
        PSTNG_DATE: currentDate,
        DOC_DATE: currentDate,
        HEADER_TXT: `GR+QC SCAN`,
        PR_UNAME: userId,
      },
      GOODSMVT_ITEM: goodsmvtItems,
      TESTRUN: false,
    };

    const response = await axios.post(`${SAP_CONNECTOR_MIDDLEWARE_URL}/api/goods-movement/create`, sapRequestBody, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 60000,
    });

    const sapResponse = response.data;
    const materialDocument = sapResponse.GoodsMovementHeadRet?.MAT_DOC;

    console.log(chalk.cyan('📡 SAP Response received for GR'));

    // Check for SAP errors
    if (response.data.Return && response.data.Return.length > 0) {
      const returnMessage = response.data.Return[0];
      if (['E', 'I', 'A'].includes(returnMessage.TYPE)) {
        console.log(chalk.red('❌ SAP returned error for GR:'));
        console.log(chalk.red(`   Error: ${returnMessage.MESSAGE}`));

        // Log error for each item
        for (const item of goodsmvtItems) {
          await logSAPQCError(
            item.ITEM_TEXT,
            item.ORDERID,
            item.MATERIAL,
            item.BATCH,
            item.PLANT,
            '',
            '', // requestedStatus, currentStatus
            item.ENTRY_QNT,
            returnMessage.MESSAGE,
            item.MOVE_TYPE,
            item.STCK_TYPE,
            item.STGE_LOC, // Use the actual storage location from the item
            item.MVT_IND,
            item.ENTRY_UOM,
            item.ENTRY_UOM_ISO,
            '02',
            '',
            '', // moveBatch, moveStorageLocation
            userId,
            true // isGRError
          );
        }

        // Still update pallet records in database with empty material document
        console.log(chalk.yellow('📝 Updating database with empty material document due to SAP error...'));
        for (const palletData of allPalletData) {
          try {
            await executeQuery(`EXEC [dbo].[HHT_FG_GR_BarcodeUpdate_New] @PalletBarcode, @MaterialDocument, @UserId`, [
              {
                name: 'PalletBarcode',
                type: sql.NVarChar(50),
                value: palletData.palletBarcode,
              },
              { name: 'MaterialDocument', type: sql.NVarChar(50), value: '' },
              { name: 'UserId', type: sql.NVarChar(50), value: userId },
            ]);
            console.log(chalk.gray(`   ✅ Updated pallet: ${palletData.palletBarcode}`));
          } catch (updateError) {
            console.error(chalk.red(`   ❌ Error updating pallet ${palletData.palletBarcode}:`, updateError));
          }
        }

        return {
          success: false,
          message: returnMessage.MESSAGE,
          materialDocument: '',
          processedCount: allPalletData.length,
        };
      }
    }

    if (!materialDocument) {
      const errorMessage = sapResponse.Return[0]?.MESSAGE || 'Failed to get material document number from SAP';
      console.log(chalk.red('❌ No material document received from SAP'));
      console.log(chalk.red(`   Error: ${errorMessage}`));

      // Log error for each item
      for (const item of goodsmvtItems) {
        await logSAPQCError(
          item.ITEM_TEXT,
          item.ORDERID,
          item.MATERIAL,
          item.BATCH,
          item.PLANT,
          '',
          '', // requestedStatus, currentStatus
          item.ENTRY_QNT,
          errorMessage,
          item.MOVE_TYPE,
          item.STCK_TYPE,
          item.STGE_LOC, // Use the actual storage location from the item
          item.MVT_IND,
          item.ENTRY_UOM,
          item.ENTRY_UOM_ISO,
          '02',
          '',
          '', // moveBatch, moveStorageLocation
          userId,
          true // isGRError
        );
      }

      // Still update pallet records in database with empty material document
      console.log(chalk.yellow('📝 Updating database with empty material document due to no material document...'));
      for (const palletData of allPalletData) {
        try {
          await executeQuery(`EXEC [dbo].[HHT_FG_GR_BarcodeUpdate_New] @PalletBarcode, @MaterialDocument, @UserId`, [
            {
              name: 'PalletBarcode',
              type: sql.NVarChar(50),
              value: palletData.palletBarcode,
            },
            { name: 'MaterialDocument', type: sql.NVarChar(50), value: '' },
            { name: 'UserId', type: sql.NVarChar(50), value: userId },
          ]);
          console.log(chalk.gray(`   ✅ Updated pallet: ${palletData.palletBarcode}`));
        } catch (updateError) {
          console.error(chalk.red(`   ❌ Error updating pallet ${palletData.palletBarcode}:`, updateError));
        }
      }

      return {
        success: false,
        message: errorMessage,
        materialDocument: '',
        processedCount: allPalletData.length,
      };
    }

    console.log(chalk.green(`✅ SAP GR Success: Material Document ${materialDocument}`));

    // Update pallet records in database with successful material document
    console.log(chalk.blue('💾 Updating database with successful material document...'));
    for (const palletData of allPalletData) {
      try {
        await executeQuery(`EXEC [dbo].[HHT_FG_GR_BarcodeUpdate_New] @PalletBarcode, @MaterialDocument, @UserId`, [
          {
            name: 'PalletBarcode',
            type: sql.NVarChar(50),
            value: palletData.palletBarcode,
          },
          {
            name: 'MaterialDocument',
            type: sql.NVarChar(50),
            value: materialDocument,
          },
          { name: 'UserId', type: sql.NVarChar(50), value: userId },
        ]);
        console.log(chalk.gray(`   ✅ Updated pallet: ${palletData.palletBarcode}`));
      } catch (updateError) {
        console.error(chalk.red(`   ❌ Error updating pallet ${palletData.palletBarcode}:`, updateError));
      }
    }

    return {
      success: true,
      message: `GR completed successfully. Document: ${materialDocument}`,
      materialDocument: materialDocument,
      processedCount: allPalletData.length,
    };
  } catch (error) {
    console.error(chalk.red('💥 Error in processGoodReceipt:'), error);

    // Even if there's a network error, try to update database with empty material document
    if (allPalletData && allPalletData.length > 0) {
      console.log(chalk.yellow('📝 Updating database with empty material document due to network error...'));
      for (const palletData of allPalletData) {
        try {
          await executeQuery(`EXEC [dbo].[HHT_FG_GR_BarcodeUpdate_New] @PalletBarcode, @MaterialDocument, @UserId`, [
            {
              name: 'PalletBarcode',
              type: sql.NVarChar(50),
              value: palletData.palletBarcode,
            },
            { name: 'MaterialDocument', type: sql.NVarChar(50), value: '' },
            { name: 'UserId', type: sql.NVarChar(50), value: userId },
          ]);
          console.log(chalk.gray(`   ✅ Updated pallet: ${palletData.palletBarcode}`));
        } catch (updateError) {
          console.error(chalk.red(`   ❌ Error updating pallet ${palletData.palletBarcode}:`, updateError));
        }
      }
    } else {
      console.log(chalk.yellow('⚠️  No pallet data available to update in database due to early error'));
    }

    // Log the network error as GR error for each item
    if (goodsmvtItems && goodsmvtItems.length > 0) {
      console.log(chalk.yellow('📝 Logging network errors for constructed SAP items...'));
      for (const item of goodsmvtItems) {
        await logSAPQCError(
          item.ITEM_TEXT,
          item.ORDERID,
          item.MATERIAL,
          item.BATCH,
          item.PLANT,
          '',
          '', // requestedStatus, currentStatus
          item.ENTRY_QNT,
          `Network/Timeout Error: ${error.message}`,
          item.MOVE_TYPE,
          item.STCK_TYPE,
          item.STGE_LOC, // Use the actual storage location from the item
          item.MVT_IND,
          item.ENTRY_UOM,
          item.ENTRY_UOM_ISO,
          '02',
          '',
          '', // moveBatch, moveStorageLocation
          userId,
          true // isGRError
        );
      }
    } else if (allPalletData && allPalletData.length > 0) {
      // If we have pallet data but no SAP items, log errors for pallets directly
      console.log(chalk.yellow('📝 Logging network errors for processed pallets...'));
      for (const palletData of allPalletData) {
        // Determine storage location based on batch (same logic as GR)
        const storageLocation = palletData.batch && palletData.batch.includes('RS') ? '5190' : '5110';

        await logSAPQCError(
          palletData.palletBarcode,
          palletData.orderNo,
          palletData.material,
          palletData.batch,
          productionPlant,
          '',
          '', // requestedStatus, currentStatus
          palletData.quantity,
          `Network/Timeout Error: ${error.message}`,
          '101',
          'Q',
          storageLocation, // Use determined storage location
          'F',
          palletData.unit,
          palletData.unitIso,
          '02',
          '',
          '', // moveBatch, moveStorageLocation
          userId,
          true // isGRError
        );
      }
    } else {
      // If no data processed yet, try to extract pallet info from input
      console.log(chalk.yellow('📝 Logging network errors for input pallets...'));
      for (let i = 0; i < palletBarcodes.length; i++) {
        const palletBarcode = palletBarcodes[i];
        if (palletBarcode.includes('#') && palletBarcode.includes(';')) {
          const [pallet] = palletBarcode.split('#');
          // Default to 5110 since we don't have batch info in this fallback scenario
          await logSAPQCError(
            pallet,
            '', // orderNumber not available
            '', // material not available
            '', // batch not available
            productionPlant,
            '',
            '', // requestedStatus, currentStatus
            parseFloat(qtys[i] || 0),
            `Network/Timeout Error during GR processing: ${error.message}`,
            '101',
            'Q',
            '5110', // Default storage location when batch info not available
            'F',
            units[i] || 'ST',
            unitIsos[i] || 'PCE',
            '02',
            '',
            '', // moveBatch, moveStorageLocation
            userId,
            true // isGRError
          );
        }
      }
    }

    return {
      success: false,
      message: `GR processing failed: ${error.message}`,
      processedCount: allPalletData ? allPalletData.length : 0,
    };
  }
}
