import sessionManager from '../../utils/sessionManager.js';

// Initialize user session after successful login
export const initializeUserSession = async (req, res, next) => {
  try {
    // This should be called after successful authentication
    const userId = req.user?.user?.user_id;
    if (userId) {
      await sessionManager.updateUserActivity(userId);
      console.log(`✅ Session initialized for user: ${userId}`);
    }
    next();
  } catch (error) {
    console.error('❌ Error initializing session:', error);
    next(); // Continue even if session init fails
  }
};

// Handle user logout
export const handleLogout = async (req, res) => {
  try {
    const userId = req.user?.user?.user_id;

    if (userId) {
      sessionManager.removeUserSession(userId);
    }

    res.json({ Status: 'T', Message: 'Logged out successfully' });
  } catch (error) {
    console.error('❌ Logout error:', error);
    res.status(500).json({
      Status: 'F',
      Message: 'Error during logout',
    });
  }
};

// Get session status
export const getSessionStatus = async (req, res) => {
  try {
    const userId = req.user?.user?.user_id;

    if (!userId) {
      return res.status(401).json({
        Status: 'F',
        Message: 'User ID not found in token',
      });
    }

    const sessionCheck = sessionManager.isSessionValid(userId);

    res.json({
      Status: sessionCheck.valid ? 'S' : 'F',
      Message: sessionCheck.message,
      Valid: sessionCheck.valid,
      UserId: userId,
      InactiveTime: sessionCheck.inactiveTime,
    });
  } catch (error) {
    console.error('❌ Error checking session status:', error);
    res.status(500).json({
      Status: 'F',
      Message: 'Error checking session status',
    });
  }
};

// Admin endpoint to view all active sessions
export const getActiveSessions = async (req, res) => {
  try {
    const sessions = sessionManager.getActiveSessions();
    res.json({
      Status: 'S',
      Data: sessions,
      Count: Object.keys(sessions).length,
    });
  } catch (error) {
    console.error('Error getting active sessions:', error);
    res.status(500).json({
      Status: 'F',
      Message: 'Error retrieving active sessions',
    });
  }
};

// Cleanup expired sessions manually
export const cleanupSessions = async (req, res) => {
  try {
    const cleanedCount = sessionManager.cleanupExpiredSessions();
    res.json({
      Status: 'S',
      Message: `Cleaned up ${cleanedCount} expired sessions`,
      CleanedCount: cleanedCount,
    });
  } catch (error) {
    console.error('❌ Error cleaning up sessions:', error);
    res.status(500).json({
      Status: 'F',
      Message: 'Error cleaning up sessions',
    });
  }
};

// Get current session configuration
export const getSessionConfig = async (req, res) => {
  try {
    const config = sessionManager.getSessionConfig();
    res.json({
      Status: 'S',
      Message: 'Session configuration retrieved',
      Config: config,
    });
  } catch (error) {
    console.error('❌ Error getting session config:', error);
    res.status(500).json({
      Status: 'F',
      Message: 'Error retrieving session configuration',
    });
  }
};

// Manually refresh session configuration from database
export const refreshSessionConfig = async (req, res) => {
  try {
    await sessionManager.getSessionTimeout();
    const config = sessionManager.getSessionConfig();
    res.json({
      Status: 'S',
      Message: 'Session configuration refreshed from database',
      Config: config,
    });
  } catch (error) {
    console.error('❌ Error refreshing session config:', error);
    res.status(500).json({
      Status: 'F',
      Message: 'Error refreshing session configuration',
    });
  }
};
