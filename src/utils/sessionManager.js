import NodeCache from 'node-cache';
import { executeQuery } from '../config/db.js';

class SessionManager {
  constructor() {
    this.cache = new NodeCache();
    this.sessionTimeoutHours = 2; // Default fallback (2 hours)
    this.lastSessionTimeUpdate = null;
    this.refreshInterval = null;

    this.startAutoRefresh();
  }

  async getSessionTimeout() {
    try {
      const result = await executeQuery('EXEC sp_session_master_get_all_details');
      if (result && result.length > 0) {
        const sessionData = result[0]; // Only one record expected

        // Convert to hours based on unit
        if (sessionData.unit === 'HR') {
          this.sessionTimeoutHours = sessionData.session_time;
        } else if (sessionData.unit === 'MIN') {
          this.sessionTimeoutHours = sessionData.session_time / 60;
        } else {
          console.warn(`Unknown unit: ${sessionData.unit}, defaulting to hours`);
          this.sessionTimeoutHours = sessionData.session_time;
        }

        this.lastSessionTimeUpdate = new Date();
        console.log(
          `✅ Session timeout updated: ${sessionData.session_time} ${sessionData.unit} (${this.sessionTimeoutHours} hours)`
        );
      } else {
        console.warn('No session master data found, using default timeout');
      }
    } catch (error) {
      console.error('❌ Error fetching session timeout:', error);
    }
  }

  startAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }

    this.refreshInterval = setInterval(
      async () => {
        console.log('🔄 Auto-refreshing session timeout configuration...');
        await this.getSessionTimeout();
      },
      2 * 60 * 60 * 1000
    ); // 2 hours
  }

  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  // Refresh session timeout from DB if it's been more than 2 hours since last check
  async refreshSessionTimeoutIfNeeded() {
    const now = new Date();
    if (!this.lastSessionTimeUpdate || now - this.lastSessionTimeUpdate > 2 * 60 * 60 * 1000) {
      // 2 hours
      console.log('🔄 Manual refresh triggered (2+ hours since last update)');
      await this.getSessionTimeout();
    }
  }

  async updateUserActivity(userId) {
    await this.refreshSessionTimeoutIfNeeded();

    const now = new Date();
    this.cache.set(userId, {
      lastActivity: now,
      timeoutHours: this.sessionTimeoutHours,
    });

    console.log(`Activity updated for user ${userId} at ${now.toISOString()}`);
  }

  isSessionValid(userId) {
    const userSession = this.cache.get(userId);

    if (!userSession) {
      return {
        valid: false,
        message: 'No active session found. Please login again.',
        inactiveTime: null,
      };
    }

    const now = new Date();
    const lastActivity = new Date(userSession.lastActivity);
    const timeDiffMs = now - lastActivity;
    const timeDiffHours = timeDiffMs / (1000 * 60 * 60);

    if (timeDiffHours > userSession.timeoutHours) {
      // Session expired
      this.cache.del(userId); // Remove expired session

      const inactiveHours = Math.floor(timeDiffHours);
      const inactiveMinutes = Math.floor((timeDiffHours - inactiveHours) * 60);

      let inactiveTimeMessage;
      if (inactiveHours > 0) {
        inactiveTimeMessage = `${inactiveHours} hour(s)`;
        if (inactiveMinutes > 0) {
          inactiveTimeMessage += ` and ${inactiveMinutes} minute(s)`;
        }
      } else {
        inactiveTimeMessage = `${inactiveMinutes} minute(s)`;
      }

      return {
        valid: false,
        message: `You were inactive for ${inactiveTimeMessage}. Session expired. Please login again.`,
        inactiveTime: inactiveTimeMessage,
      };
    }

    return {
      valid: true,
      message: 'Session is active',
      inactiveTime: null,
    };
  }

  removeUserSession(userId) {
    this.cache.del(userId);
    console.log(`Session removed for user ${userId}`);
  }

  // Get all active sessions (for debugging)
  getActiveSessions() {
    const keys = this.cache.keys();
    const sessions = {};
    keys.forEach(key => {
      const sessionData = this.cache.get(key);
      sessions[key] = {
        ...sessionData,
        lastActivity: sessionData.lastActivity,
        timeoutHours: sessionData.timeoutHours,
      };
    });
    return sessions;
  }

  cleanupExpiredSessions() {
    const keys = this.cache.keys();
    let cleanedCount = 0;

    keys.forEach(userId => {
      const sessionCheck = this.isSessionValid(userId);
      if (!sessionCheck.valid) {
        cleanedCount++;
      }
    });

    console.log(`🧹 Cleaned up ${cleanedCount} expired sessions`);
    return cleanedCount;
  }

  getSessionConfig() {
    return {
      timeoutHours: this.sessionTimeoutHours,
      lastUpdate: this.lastSessionTimeUpdate,
      autoRefreshActive: !!this.refreshInterval,
    };
  }

  shutdown() {
    this.stopAutoRefresh();
    this.cache.flushAll();
    console.log('🛑 Session manager shutdown complete');
  }
}

const sessionManager = new SessionManager();

// Don't initialize immediately - wait for database to be ready
// The session timeout will be fetched on first use or manually triggered

export default sessionManager;
