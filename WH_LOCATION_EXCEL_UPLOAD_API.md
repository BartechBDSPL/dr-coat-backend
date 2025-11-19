# Warehouse Location Master API Documentation

---

## 1. Get All Warehouse Locations

### Endpoint
`GET /api/masters/wh-location/get-all`

### Description
Retrieve all warehouse location master records.

### Request
No request body required.

### Response

#### Success Response (200 OK)
```json
[
  {
    "id": 1,
    "warehouse_code": "WH01",
    "rack": "R-A1",
    "bin": "B001",
    "location_status": "Active",
    "created_by": "admin",
    "created_at": "2025-01-15T10:30:00",
    "updated_by": "admin",
    "updated_at": "2025-01-15T10:30:00"
  }
]
```

#### Error Response (500)
```json
"Error message string"
```

---

## 2. Get All Warehouse Codes

### Endpoint
`GET /api/masters/wh-location/warehouse-codes`

### Description
Retrieve all warehouse codes for dropdown/selection purposes.

### Request
No request body required.

### Response

#### Success Response (200 OK)
```json
[
  {
    "warehouse_code": "WH01",
    "warehouse_name": "Main Warehouse"
  },
  {
    "warehouse_code": "WH02",
    "warehouse_name": "Secondary Warehouse"
  }
]
```

#### Error Response (500)
```json
"Error message string"
```

---

## 3. Insert Warehouse Location

### Endpoint
`POST /api/masters/wh-location/insert`

### Description
Create a new warehouse location record.

### Request

#### Headers
```
Content-Type: application/json
Authorization: Bearer <token>
```

#### Body
```json
{
  "warehouse_code": "WH01",
  "rack": "R-A1",
  "bin": "B001",
  "user": "admin",
  "location_status": "Active"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| warehouse_code | String | Yes | Warehouse code |
| rack | String | Yes | Rack/Storage type identifier |
| bin | String | Yes | Bin/Storage location identifier |
| user | String | Yes | Username creating the record |
| location_status | String | Yes | Status of the location (Active/Inactive) |

### Response

#### Success Response (200 OK)
```json
{
  "Status": "T",
  "Message": "Location inserted successfully"
}
```

#### Error Response (500)
```json
{
  "error": "Error message"
}
```

---

## 4. Update Warehouse Location

### Endpoint
`PUT /api/masters/wh-location/update`

### Description
Update an existing warehouse location record.

### Request

#### Headers
```
Content-Type: application/json
Authorization: Bearer <token>
```

#### Body
```json
{
  "id": 1,
  "warehouse_code": "WH01",
  "rack": "R-A1",
  "bin": "B001",
  "user": "admin",
  "location_status": "Inactive"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | Integer | Yes | ID of the location to update |
| warehouse_code | String | Yes | Warehouse code |
| rack | String | Yes | Rack/Storage type identifier |
| bin | String | Yes | Bin/Storage location identifier |
| user | String | Yes | Username updating the record |
| location_status | String | Yes | Status of the location (Active/Inactive) |

### Response

#### Success Response (200 OK)
```json
{
  "Status": "T",
  "Message": "Location updated successfully"
}
```

#### Error Response (500)
```json
{
  "error": "Error message"
}
```

---

## 5. Upload Excel File (Bulk Insert/Update)

## Endpoint
`POST /api/masters/wh-location/upload-excel`

## Description
Upload an Excel file to bulk insert/update warehouse location master data.

## Request

### Headers
```
Content-Type: multipart/form-data
Authorization: Bearer <token>
```

### Body (Form Data)
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| excelFile | File | Yes | Excel file (.xlsx or .xls) with warehouse location data |
| username | String | Optional | Username for audit trail (defaults to authenticated user) |

### Excel File Format

**Required Headers (Column Names):**
- `warehouse_code`
- `rack`
- `bin`
- `location_status`

**Example Excel Data:**

| warehouse_code | rack | bin | location_status |
|----------------|------|-----|-----------------|
| WH01 | R-A1 | B001 | Active |
| WH01 | R-A1 | B002 | Active |
| WH02 | R-B2 | B101 | Inactive |

**File Requirements:**
- Maximum file size: 10MB
- Supported formats: .xlsx, .xls
- File must not be empty

## Response

### Success Response (200 OK)
```json
{
  "Status": "T",
  "Message": "Excel file processed",
  "results": {
    "totalProcessed": 100,
    "successCount": 98,
    "failureCount": 2,
    "failures": [
      {
        "row": {
          "warehouse_code": "WH99",
          "rack": "R-Z9",
          "bin": "B999",
          "location_status": "Active"
        },
        "Message": "Warehouse code does not exist"
      }
    ]
  }
}
```

**Note:** If all records are processed successfully, the `failures` field will be `null`.

### Error Responses

#### 400 Bad Request - No File Uploaded
```json
{
  "Status": "F",
  "Message": "Please upload an Excel file"
}
```

#### 400 Bad Request - Empty File
```json
{
  "Status": "F",
  "Message": "Excel file is empty"
}
```

#### 400 Bad Request - Missing Headers
```json
{
  "Status": "F",
  "Message": "Missing required headers: warehouse_code, rack"
}
```

#### 400 Bad Request - Invalid File Type
```json
{
  "Status": "F",
  "Message": "Only Excel files are allowed!"
}
```

#### 500 Internal Server Error
```json
{
  "Status": "F",
  "Message": "Error processing Excel file",
  "error": "Detailed error message"
}
```

## Notes
- The API processes records in batches of 50 for optimal performance
- Records are upserted (inserted if new, updated if exists)
- Each row is validated independently
- Failed records don't stop the processing of other records
- The uploaded file is automatically deleted after processing
