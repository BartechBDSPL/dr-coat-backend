# Testing Session Management

## Quick Test Guide

### 1. Login to Get Token
```bash
POST http://localhost:4000/api/auth/check-credentials
Content-Type: application/json

{
  "User_ID": "admin",
  "User_Password": "your_password",
  "DeviceSN": "TEST123",
  "ApplicationType": "WEB"
}
```

### 2. Test Session Status
```bash
GET http://localhost:4000/api/admin/test-session
Authorization: Bearer YOUR_JWT_TOKEN
```

### 3. Check Session Details
```bash
GET http://localhost:4000/api/admin/session-status
Authorization: Bearer YOUR_JWT_TOKEN
```

### 4. View Active Sessions (Admin)
```bash
GET http://localhost:4000/api/admin/active-sessions
Authorization: Bearer YOUR_JWT_TOKEN
```

### 5. Test Session Timeout
1. Change session timeout to 1 minute for testing:
```sql
UPDATE session_master 
SET session_time = 1, unit = 'MIN'
WHERE id = 2;
```

2. Make an API call to start session
3. Wait 1+ minutes
4. Make another API call - should get session expired message

### 6. Logout
```bash
POST http://localhost:4000/api/admin/logout
Authorization: Bearer YOUR_JWT_TOKEN
```

## Expected Responses

### Session Active Response (HTTP 200)
```json
{
  "Status": "S",
  "Message": "Test endpoint with session management - if you see this, session is valid!",
  "UserId": "admin",
  "SessionValid": true,
  "SessionMessage": "Session is active",
  "Timestamp": "2025-09-10T15:30:00.000Z"
}
```

### Session Expired Response (HTTP 440)
```json
{
  "Status": "F",
  "Message": "You were inactive for 1 hour(s) and 5 minute(s). Session expired. Please login again.",
  "Title": "Session Expired",
  "InactiveTime": "1 hour(s) and 5 minute(s)",
  "Code": "SESSION_EXPIRED"
}
```

**Important**: The HTTP status code will be **440** (Login Time-out) for session expiry, which your frontend axios interceptor should detect for automatic logout.

## Configuration

Current session master table value:
- `session_time`: 30
- `unit`: HR (hours)
- This means sessions expire after 30 hours of inactivity

For testing, you can temporarily set:
- `session_time`: 1
- `unit`: MIN (minutes)
- Sessions will expire after 1 minute of inactivity
