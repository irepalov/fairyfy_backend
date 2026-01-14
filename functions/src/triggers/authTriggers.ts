import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { FIREBASE_REGION } from '../config';

export const onUserCreated = functions.region(FIREBASE_REGION).auth.user().onCreate(
  async (user) => {
    const db = admin.firestore();
    
    const userProfile = {
      id: user.uid,
      userName: user.displayName || user.email?.split('@')[0] || 'Anonymous',
      language: 'en',
      timezone: 'UTC',
      allowNotifications: true,
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
    };

    try {
      await db.collection('users').doc(user.uid).set(userProfile);
      functions.logger.info(`User profile created for ${user.uid}`);
    } catch (error) {
      functions.logger.error('Error creating user profile:', error);
      throw new functions.https.HttpsError('internal', 'Failed to create user profile');
    }
  }
);
