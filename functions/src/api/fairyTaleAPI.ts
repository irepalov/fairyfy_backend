import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { FIREBASE_REGION } from '../config';
import { 
  FairyTale, 
  FairyTaleStatus, 
  CreateTaleRequest,
  GenerateTaleRequest,
  UpdateTaleRequest,
  FairyTaleComponents
} from '../types/models';

const db = admin.firestore();

export const createFairyTale = functions.region(FIREBASE_REGION).https.onCall(
  async (data: CreateTaleRequest, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;

    if (!data.title || data.title.trim().length === 0) {
      throw new functions.https.HttpsError('invalid-argument', 'Title is required');
    }

    if (!data.components || !data.components.hero) {
      throw new functions.https.HttpsError('invalid-argument', 'Hero is required');
    }

    if (!data.taleStyle || !data.taleStyle.style || data.taleStyle.style.trim().length === 0) {
      throw new functions.https.HttpsError('invalid-argument', 'Tale style is required');
    }

    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'User profile not found');
    }
    const userData = userDoc.data();
    const userName = userData?.userName || 'Anonymous';
    const userLanguage = userData?.language || 'en';

    const taleRef = db.collection('fairyTales').doc();
    const newTale = {
      userId,
      userName,
      title: data.title.trim(),
      taleText: '',
      completionStatus: FairyTaleStatus.DRAFT,
      components: {
        hero: data.components.hero,
        friends: data.components.friends || [],
        equipment: data.components.equipment || [],
        villains: data.components.villains || [],
        places: data.components.places || [],
      },
      taleStyle: {
        style: data.taleStyle.style.trim(),
        description: data.taleStyle.description || '',
      },
      language: userLanguage,
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
    };

    await taleRef.set(newTale);

    return { 
      success: true, 
      taleId: taleRef.id,
      message: 'Tale created successfully' 
    };
  }
);

export const generateTaleContent = functions
  .region(FIREBASE_REGION)
  .runWith({ timeoutSeconds: 540 })
  .https.onCall(
    async (data: GenerateTaleRequest, context) => {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
      }

      const { taleId } = data;
      const userId = context.auth.uid;

      const taleRef = db.collection('fairyTales').doc(taleId);
      const taleDoc = await taleRef.get();

      if (!taleDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Tale not found');
      }

      const tale = taleDoc.data() as FairyTale;

      if (tale.userId !== userId) {
        throw new functions.https.HttpsError('permission-denied', 'Not authorized');
      }

      // Validate required fields
      if (!tale.components.hero || !tale.components.hero.name) {
        throw new functions.https.HttpsError('failed-precondition', 'Hero is required for generation');
      }

      if (!tale.taleStyle || !tale.taleStyle.style) {
        throw new functions.https.HttpsError('failed-precondition', 'Tale style is required for generation');
      }

      // Update status to GENERATING
      await taleRef.update({
        completionStatus: FairyTaleStatus.GENERATING,
        updatedAt: admin.firestore.Timestamp.now(),
      });

      // Start background generation (no await!)
      generateAndSave(taleId, tale).catch(error => {
        functions.logger.error('Background generation error:', error);
      });

      // Return immediately
      return { 
        success: true, 
        status: FairyTaleStatus.GENERATING,
        message: 'Tale generation started' 
      };
    }
  );

export const getUserTales = functions.region(FIREBASE_REGION).https.onCall(
  async (data: { limit?: number, startAfter?: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const limit = Math.min(data.limit || 20, 50);

    let query = db.collection('fairyTales')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(limit);

    if (data.startAfter) {
      const lastDoc = await db.collection('fairyTales').doc(data.startAfter).get();
      if (lastDoc.exists) {
        query = query.startAfter(lastDoc);
      }
    }

    const snapshot = await query.get();
    const tales = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    return {
      tales,
      hasMore: snapshot.size === limit,
      lastId: snapshot.docs[snapshot.size - 1]?.id || null,
    };
  }
);

export const updateFairyTale = functions.region(FIREBASE_REGION).https.onCall(
  async (data: UpdateTaleRequest, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { taleId, ...updateFields } = data;
    const userId = context.auth.uid;

    if (!taleId) {
      throw new functions.https.HttpsError('invalid-argument', 'taleId is required');
    }

    const taleRef = db.collection('fairyTales').doc(taleId);
    const taleDoc = await taleRef.get();

    if (!taleDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Tale not found');
    }

    const tale = taleDoc.data() as FairyTale;

    if (tale.userId !== userId) {
      throw new functions.https.HttpsError('permission-denied', 'Not authorized');
    }

    const updates: any = {
      updatedAt: admin.firestore.Timestamp.now(),
    };

    if (updateFields.title !== undefined) {
      if (updateFields.title.trim().length === 0) {
        throw new functions.https.HttpsError('invalid-argument', 'Title cannot be empty');
      }
      updates.title = updateFields.title.trim();
    }

    if (updateFields.taleText !== undefined) {
      updates.taleText = updateFields.taleText;
    }

    if (updateFields.taleStyle !== undefined) {
      if (!updateFields.taleStyle.style || updateFields.taleStyle.style.trim().length === 0) {
        throw new functions.https.HttpsError('invalid-argument', 'Tale style cannot be empty');
      }
      updates.taleStyle = {
        style: updateFields.taleStyle.style.trim(),
      };
    }

    if (updateFields.components !== undefined) {
      updates.components = {
        hero: updateFields.components.hero || tale.components.hero,
        friends: updateFields.components.friends !== undefined ? updateFields.components.friends : tale.components.friends,
        equipment: updateFields.components.equipment !== undefined ? updateFields.components.equipment : tale.components.equipment,
        villains: updateFields.components.villains !== undefined ? updateFields.components.villains : tale.components.villains,
        places: updateFields.components.places !== undefined ? updateFields.components.places : tale.components.places,
      };
    }

    await taleRef.update(updates);

    return { success: true, message: 'Tale updated successfully' };
  }
);

export const deleteFairyTale = functions.region(FIREBASE_REGION).https.onCall(
  async (data: { taleId: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { taleId } = data;
    const userId = context.auth.uid;

    const taleRef = db.collection('fairyTales').doc(taleId);
    const taleDoc = await taleRef.get();

    if (!taleDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Tale not found');
    }

    const tale = taleDoc.data() as FairyTale;

    if (tale.userId !== userId) {
      throw new functions.https.HttpsError('permission-denied', 'Not authorized');
    }

    await taleRef.delete();

    return { success: true, message: 'Tale deleted successfully' };
  }
);

async function generateAndSave(taleId: string, tale: FairyTale): Promise<void> {
  const taleRef = db.collection('fairyTales').doc(taleId);
  
  try {
    functions.logger.info(`Starting generation for tale ${taleId}`);
    
    const generatedText = await generateStoryWithAI(tale.components, tale.taleStyle);
    
    await taleRef.update({
      taleText: generatedText,
      completionStatus: FairyTaleStatus.COMPLETED,
      updatedAt: admin.firestore.Timestamp.now(),
    });
    
    functions.logger.info(`Tale ${taleId} generated successfully`);
  } catch (error) {
    functions.logger.error(`Tale ${taleId} generation failed:`, error);
    
    await taleRef.update({
      completionStatus: FairyTaleStatus.FAILED,
      updatedAt: admin.firestore.Timestamp.now(),
    });
  }
}

async function generateStoryWithAI(
  components: FairyTaleComponents, 
  taleStyle: { style: string; description?: string }
): Promise<string> {
  const webhookUrl = 'https://n8n.fairyfy.xyz/webhook/ac502c37-56b8-4241-ba8a-7e82ee932cfb';
  
  functions.logger.info('Sending request to n8n:', { components, taleStyle });
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 480000); // 8 minutes timeout
  
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        models: components,
        taleStyle: taleStyle
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      functions.logger.error('n8n request failed:', { status: response.status, error: errorText });
      throw new Error(`n8n webhook failed with status ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    functions.logger.info('n8n response received:', result);
    functions.logger.info('Response type check:', {
      isArray: Array.isArray(result),
      length: Array.isArray(result) ? result.length : 'N/A',
      firstItem: Array.isArray(result) && result.length > 0 ? result[0] : 'N/A'
    });
    
    // Extract tale text from response - n8n returns an array
    let taleText: string | undefined;
    
    if (Array.isArray(result) && result.length > 0) {
      // Handle array response: [{"taleText": "..."}]
      taleText = result[0].taleText || result[0].story || result[0].text || result[0].output;
      functions.logger.info('Extracted from array:', {
        hasTaleText: !!result[0].taleText,
        hasStory: !!result[0].story,
        hasText: !!result[0].text,
        hasOutput: !!result[0].output,
        extracted: taleText ? taleText.substring(0, 100) : 'undefined'
      });
    } else {
      // Handle object response
      taleText = result.taleText || result.story || result.text || result.output;
      functions.logger.info('Extracted from object:', {
        hasTaleText: !!result.taleText,
        hasStory: !!result.story,
        hasText: !!result.text,
        hasOutput: !!result.output,
        extracted: taleText ? taleText.substring(0, 100) : 'undefined'
      });
    }
    
    functions.logger.info('Final taleText check:', {
      exists: !!taleText,
      type: typeof taleText,
      length: taleText ? taleText.length : 0
    });
    
    if (!taleText || typeof taleText !== 'string') {
      functions.logger.error('Invalid response from n8n:', result);
      throw new Error('n8n did not return valid tale text');
    }
    
    return taleText;
  } catch (error: any) {
    clearTimeout(timeout);
    
    if (error.name === 'AbortError') {
      throw new Error('n8n request timed out after 8 minutes');
    }
    
    throw error;
  }
}
