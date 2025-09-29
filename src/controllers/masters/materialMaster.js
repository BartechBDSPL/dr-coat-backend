import { executeQuery, sql } from "../../config/db.js";

// 1. Function to get all material details
export const getAllMaterialDetails = async (req, res) => {
  try {
    const result = await executeQuery("EXEC sp_material_master_get_all_details");
    res.status(200).json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      Status: "F",
      Message: error.message,
      data: null,
    });
  }
};

// 2. Function to update material details
export const updateMaterialDetails = async (req, res) => {
  const {
    id,
    plant_code,
    material_code,
    material_description,
    material_type,
    material_group,
    material_status,
    updated_by,
  } = req.body;

  try {
    const result = await executeQuery(
      `EXEC sp_material_master_update 
         @id, @plant_code, @material_code, 
         @material_description, @material_type, @material_group, 
         @material_status, @updated_by`,
      [
        { name: "id", type: sql.Int, value: id },
        { name: "plant_code", type: sql.NVarChar, value: plant_code },
        { name: "material_code", type: sql.NVarChar, value: material_code },
        { name: "material_description", type: sql.NVarChar, value: material_description },
        { name: "material_type", type: sql.NVarChar, value: material_type },
        { name: "material_group", type: sql.NVarChar, value: material_group },
        { name: "material_status", type: sql.NVarChar, value: material_status },
        { name: "updated_by", type: sql.NVarChar, value: updated_by },
      ]
    );

    res.status(200).json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ Status: "F", Message: error.message });
  }
};

// 3. Function to insert material details
export const insertMaterialDetails = async (req, res) => {
  const {
    plant_code,
    material_code,
    material_description,
    material_type,
    material_group,
    material_status,
    created_by,
  } = req.body;

  try {
    const result = await executeQuery(
      `EXEC sp_material_master_insert 
         @plant_code, @material_code, 
         @material_description, @material_type, @material_group,
         @material_status, @created_by`,
      [
        { name: "plant_code", type: sql.NVarChar, value: plant_code },
        { name: "material_code", type: sql.NVarChar, value: material_code },
        { name: "material_description", type: sql.NVarChar, value: material_description },
        { name: "material_type", type: sql.NVarChar, value: material_type },
        { name: "material_group", type: sql.NVarChar, value: material_group },
        { name: "material_status", type: sql.NVarChar, value: material_status },
        { name: "created_by", type: sql.NVarChar, value: created_by },
      ]
    );

    res.status(200).json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ Status: "F", Message: error.message });
  }
};

// 4. Function to get all plant codes
export const getAllPlantCodes = async (req, res) => {
  try {
    const result = await executeQuery("EXEC sp_plant_master_get_plant_codes");
    res.status(200).json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ Status: "F", Message: error.message });
  }
};
