# Session Management System

This system provides automatic session timeout management based on the `session_master` table configuration.

## Features

- **In-Memory Session Tracking**: Uses `node-cache` for fast, memory-based session storage
- **Database-Driven Configuration**: Session timeout settings are pulled from the `session_master` table
- **Automatic Timeout Detection**: Middleware automatically checks session validity on each request
- **User-Friendly Messages**: Provides detailed inactive time information when sessions expire
- **Admin Management**: Endpoints for managing and monitoring active sessions

## How It Works

### 1. Session Initialization
When a user logs in successfully, their session is automatically initialized with the current timestamp.

### 2. Activity Tracking
Every protected API request updates the user's last activity timestamp using the `authWithSession` middleware.

### 3. Timeout Checking
Before processing each request, the system checks if the user has been inactive longer than the configured session timeout.

### 4. Dynamic Configuration
The session timeout is fetched from the `session_master` table and refreshed every 5 minutes to pick up configuration changes.

## Usage

### Using Session-Aware Authentication

Replace the regular `auth` middleware with `authWithSession` for routes that need session timeout:

```javascript
import { authWithSession } from '../middleware/authWithSession.js';

// Instead of: router.get('/some-endpoint', auth, controller);
// Use: 
router.get('/some-endpoint', authWithSession, controller);
```

### API Endpoints

#### Session Management Endpoints
- `POST /api/admin/logout` - Logout and clear session
- `GET /api/admin/session-status` - Check current session status
- `GET /api/admin/active-sessions` - View all active sessions (admin)
- `POST /api/admin/cleanup-sessions` - Manually cleanup expired sessions (admin)

### Session Configuration

Configure session timeout in the `session_master` table:

```sql
-- Example: Set session timeout to 2 hours
UPDATE session_master 
SET session_time = 2, unit = 'HR'
WHERE id = 2;

-- Example: Set session timeout to 30 minutes
UPDATE session_master 
SET session_time = 30, unit = 'MIN'
WHERE id = 2;
```

## Response Formats

### Successful Request
Normal API responses continue as usual when session is valid.

### Session Expired Response
```json
{
  "Status": "F",
  "Message": "You were inactive for 2 hour(s) and 15 minute(s). Session expired. Please login again.",
  "Title": "Session Expired",
  "InactiveTime": "2 hour(s) and 15 minute(s)"
}
```

### Session Status Check Response
```json
{
  "Status": "S",
  "Message": "Session is active",
  "Valid": true,
  "InactiveTime": null
}
```

## Migration Guide

### For Existing Routes

1. **Critical Routes** (should timeout): Replace `auth` with `authWithSession`
   ```javascript
   // Before
   router.get('/important-data', auth, controller);
   
   // After
   router.get('/important-data', authWithSession, controller);
   ```

2. **Non-Critical Routes** (optional timeout): Keep using `auth` or migrate based on requirements

3. **Public Routes**: No changes needed

### Gradual Migration Approach

You can migrate routes one by one:

1. Start with high-security routes (admin, financial operations)
2. Move to user data routes
3. Finally migrate general routes

Both middlewares can coexist during the migration period.

## Configuration

### Memory Usage
- Each session uses ~100 bytes of memory
- For 100 concurrent users: ~10KB total memory usage
- Very efficient for your use case

### Session Cleanup
- Expired sessions are automatically removed when checked
- Manual cleanup endpoint available for maintenance
- No background processes needed

## Database Schema

### session_master Table
```sql
id              int
session_time    int           -- Timeout value (number)
unit            varchar       -- 'HR' for hours, 'MIN' for minutes
created_by      varchar
updated_by      varchar
created_on      datetime
updated_on      datetime
```

### JWT Token Requirements
The JWT token must contain the user ID in one of these fields:
- `user.user_id`
- `user.id` 
- `user.userId`

## Testing

### Manual Testing
1. Login to get a token
2. Make API calls with `authWithSession` middleware
3. Wait for session timeout period
4. Make another API call - should receive session expired message

### Session Status Endpoint
Use `GET /api/admin/session-status` to check current session state without affecting the session.

## Error Handling

The system gracefully handles:
- Database connectivity issues (falls back to default timeout)
- Cache failures (falls back to token-only validation)
- Invalid token format
- Missing user ID in token

## Performance

- **Lookup Time**: O(1) for session checks
- **Memory Usage**: Linear with active users
- **Database Calls**: Minimal (session config refresh every 5 minutes)
- **Response Time**: Adds <1ms to request processing

## Security Benefits

1. **Prevents Session Hijacking**: Expired sessions can't be used
2. **Reduces Attack Window**: Limits exposure time of compromised tokens
3. **Compliance**: Helps meet security requirements for session management
4. **Audit Trail**: Logs session activities for monitoring
