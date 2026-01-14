import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { FIREBASE_REGION } from '../config';
import { UpdateUserPreferencesRequest } from '../types/models';

const db = admin.firestore();

export const getUserProfile = functions.region(FIREBASE_REGION).https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const userDoc = await db.collection('users').doc(userId).get();

    if (!userDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'User profile not found');
    }

    return { profile: userDoc.data() };
  }
);

export const updateUserPreferences = functions.region(FIREBASE_REGION).https.onCall(
  async (data: UpdateUserPreferencesRequest, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const updates: any = { updatedAt: admin.firestore.Timestamp.now() };

    if (data.language) updates.language = data.language;
    if (data.timezone) updates.timezone = data.timezone;
    if (data.allowNotifications !== undefined) {
      updates.allowNotifications = data.allowNotifications;
    }

    await db.collection('users').doc(userId).update(updates);

    return { success: true, message: 'Preferences updated' };
  }
);
