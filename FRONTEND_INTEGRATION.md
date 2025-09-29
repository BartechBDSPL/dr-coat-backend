# Frontend Session Management Integration

## Overview
The backend returns **HTTP 440** (Login Time-out) when a user's session has expired due to inactivity. Use this status code in your axios interceptor to automatically logout users on the frontend.

## HTTP Status Codes

### Session Expired
- **Status Code**: `440`
- **Meaning**: Login Time-out / Session Expired
- **Action**: Automatically logout user and redirect to login page

### Other Auth Errors
- **Status Code**: `401`
- **Meaning**: Unauthorized (invalid token, missing token, etc.)
- **Action**: Redirect to login page

## Axios Interceptor Implementation

### Response Interceptor
```javascript
// Add this to your axios setup
axios.interceptors.response.use(
  (response) => {
    // Return successful responses as-is
    return response;
  },
  (error) => {
    // Handle session timeout
    if (error.response?.status === 440) {
      // Session expired - automatic logout
      console.log('Session expired:', error.response.data.Message);
      
      // Clear local storage/session storage
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      
      // Show session expired message
      showNotification({
        type: 'warning',
        title: 'Session Expired',
        message: error.response.data.Message || 'Your session has expired. Please login again.'
      });
      
      // Redirect to login page
      window.location.href = '/login';
      
      return Promise.reject(error);
    }
    
    // Handle other auth errors
    if (error.response?.status === 401) {
      // Invalid token or other auth issues
      console.log('Authentication failed');
      
      // Clear tokens and redirect
      localStorage.removeItem('token');
      window.location.href = '/login';
      
      return Promise.reject(error);
    }
    
    // Pass through other errors
    return Promise.reject(error);
  }
);
```

### Alternative with React Router
```javascript
import { useNavigate } from 'react-router-dom';

// In your axios setup
const navigate = useNavigate();

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 440) {
      // Session expired
      localStorage.clear();
      navigate('/login', { 
        state: { 
          message: 'Your session has expired. Please login again.',
          type: 'session_expired'
        }
      });
    } else if (error.response?.status === 401) {
      // Other auth errors
      localStorage.clear();
      navigate('/login');
    }
    
    return Promise.reject(error);
  }
);
```

## Response Format for Status 440

When session expires, you'll receive:

```json
{
  "Status": "F",
  "Message": "You were inactive for 2 hour(s) and 15 minute(s). Session expired. Please login again.",
  "Title": "Session Expired",
  "InactiveTime": "2 hour(s) and 15 minute(s)",
  "Code": "SESSION_EXPIRED"
}
```

## Session Configuration

### Current Settings
- **Default**: 21 hours (based on your session_master table)
- **Unit**: Can be HR (hours) or MIN (minutes)
- **Auto-refresh**: Backend updates session config every 2 hours

### Admin Can Update
```sql
-- Set to 30 minutes for testing
UPDATE session_master 
SET session_time = 30, unit = 'MIN' 
WHERE id = 2;

-- Set to 8 hours for production
UPDATE session_master 
SET session_time = 8, unit = 'HR' 
WHERE id = 2;
```

## Testing Session Timeout

### Quick Test (1 minute timeout)
1. Update database:
```sql
UPDATE session_master 
SET session_time = 1, unit = 'MIN' 
WHERE id = 2;
```

2. Login and get token
3. Wait 1+ minutes  
4. Make any API call with `authWithSession` middleware
5. Should receive HTTP 440 response

### Production Settings
- Recommended: 2-8 hours depending on security requirements
- High security: 30 minutes - 2 hours
- Normal use: 4-8 hours

## Implementation Checklist

- [ ] Add axios response interceptor
- [ ] Handle HTTP 440 status code
- [ ] Clear local storage on session timeout
- [ ] Show user-friendly session expired message
- [ ] Redirect to login page
- [ ] Test with short timeout period
- [ ] Configure production timeout values

## Benefits

✅ **Automatic Logout**: No manual logout needed on backend  
✅ **User Friendly**: Shows exact inactive time  
✅ **Secure**: Prevents use of expired sessions  
✅ **Flexible**: Admin can adjust timeout settings  
✅ **Efficient**: In-memory tracking with minimal overhead
