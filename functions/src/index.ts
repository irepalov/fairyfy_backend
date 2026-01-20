import * as admin from 'firebase-admin';

// Initialize Firebase Admin
admin.initializeApp();

// Export all Cloud Functions
export {
  createFairyTale,
  generateTaleContent,
  getUserTales,
  updateFairyTale,
  deleteFairyTale,
} from './api/fairyTaleAPI';

export {
  getUserProfile,
  updateUserPreferences,
} from './api/userAPI';

export {
  getAvailableObjects,
} from './api/objectsAPI';

export {
  onUserCreated,
} from './triggers/authTriggers';
