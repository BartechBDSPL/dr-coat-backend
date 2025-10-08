import express from 'express';
import * as UserMaster from '../controllers/admin/userMaster.js';
import * as ChangePassword from '../controllers/admin/changePassword.js';
import * as UserRoleMaster from '../controllers/admin/userRoleMaster.js';
import * as androidAccessController from '../controllers/admin/androidAccess.js';
import * as SessionMaster from '../controllers/admin/sessionMaster.js';
import * as SessionController from '../controllers/admin/sessionController.js';
import auth from '../middleware/auth.js';
import { authWithSession } from '../middleware/authWithSession.js';

const router = express.Router();

//User Master
router.get('/all-user-master', UserMaster.getAllUserDetails);
router.post('/insert-user-master', UserMaster.insertUserDetails);
router.patch('/edit-user-master', UserMaster.updateUserDetails);
router.get('/get-all-user-type', UserMaster.getAllUserTypeDD);

//Change Password
router.post('/change-password', auth, ChangePassword.changePassword);

//User Role Master
router.post('/insert-user-role', UserRoleMaster.insertUserRole);
router.patch('/update-user-role', UserRoleMaster.updateUserRoles);
router.get('/get-all-user-role', UserRoleMaster.getAllUserType);

//Android Access
router.patch('/edit-hht-user', authWithSession, androidAccessController.editHHTRegisterStatus);
router.post('/get-hht-user-specific', authWithSession, androidAccessController.getHHTRegisterSpecific);
router.post('/add-hht-req', androidAccessController.addHHTRegisterRequest); // No auth needed for registration
router.get('/get-all-hht-req', authWithSession, androidAccessController.getAllRegisterHHTDevice);
router.post('/update-android-access', authWithSession, androidAccessController.updateAndroidAccess);
router.get('/get-pending-approvals', authWithSession, androidAccessController.getPendingApprovals);

// //Register Routes
// router.post('/register-user',registerController.insertAndroidAccess);
// router.post('/update-user',registerController.updateAndroidAccessStatus);

//Session Master
router.get('/get-all-session-master', authWithSession, SessionMaster.getAllDetails);
router.patch('/update-session-master', authWithSession, SessionMaster.updateDetails);

//Session Management
router.post('/logout', SessionController.handleLogout);
router.get('/session-status', SessionController.getSessionStatus);
router.get('/active-sessions', SessionController.getActiveSessions);
router.post('/cleanup-sessions', SessionController.cleanupSessions);
router.get('/session-config', SessionController.getSessionConfig);
router.post('/refresh-session-config', SessionController.refreshSessionConfig);

export default router;
