import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { FIREBASE_REGION } from '../config';
import {
  FairyTaleObject,
  LocalizedObject,
  GetObjectsRequest,
  GetObjectsResponse,
  Translation
} from '../types/models';

const db = admin.firestore();

// Simple in-memory cache
interface CacheEntry {
  data: GetObjectsResponse;
  timestamp: number;
}

const cache: Map<string, CacheEntry> = new Map();
const CACHE_TTL = 5000; // 5 seconds in milliseconds

function getCachedData(language: string): GetObjectsResponse | null {
  const entry = cache.get(language);
  if (!entry) return null;
  
  const now = Date.now();
  if (now - entry.timestamp > CACHE_TTL) {
    cache.delete(language);
    return null;
  }
  
  return entry.data;
}

function setCachedData(language: string, data: GetObjectsResponse): void {
  cache.set(language, {
    data,
    timestamp: Date.now()
  });
}

function getTranslation(
  translations: any,
  requestedLanguage: string
): Translation {
  // Try requested language first
  if (translations[requestedLanguage]) {
    return translations[requestedLanguage];
  }
  
  // Fallback to English
  if (translations['en']) {
    return translations['en'];
  }
  
  // Last resort: return first available translation
  const firstLanguage = Object.keys(translations)[0];
  return translations[firstLanguage] || { title: 'Unknown', description: 'No description available' };
}

export const getAvailableObjects = functions.region(FIREBASE_REGION).https.onCall(
  async (data: GetObjectsRequest) => {
    const language = data.language || 'en';
    
    // Check cache first
    const cachedData = getCachedData(language);
    if (cachedData) {
      functions.logger.info(`Returning cached data for language: ${language}`);
      return cachedData;
    }
    
    functions.logger.info(`Fetching objects for language: ${language}`);
    
    try {
      // Query all active objects, ordered by sortOrder
      const snapshot = await db.collection('objects')
        .where('isActive', '==', true)
        .orderBy('sortOrder')
        .get();
      
      const result: GetObjectsResponse = {
        heroes: [],
        friends: [],
        villains: [],
        places: [],
        equipment: [],
        taleStyles: []
      };
      
      snapshot.forEach(doc => {
        const obj = doc.data() as FairyTaleObject;
        const translation = getTranslation(obj.translations, language);
        
        const localizedObject: LocalizedObject = {
          id: doc.id,
          category: obj.category,
          imageUrl: obj.imageUrl || '',
          sortOrder: obj.sortOrder,
          title: translation.title,
          description: translation.description
        };
        
        // Group by category
        switch (obj.category) {
          case 'hero':
            result.heroes.push(localizedObject);
            break;
          case 'friend':
            result.friends.push(localizedObject);
            break;
          case 'villain':
            result.villains.push(localizedObject);
            break;
          case 'place':
            result.places.push(localizedObject);
            break;
          case 'equipment':
            result.equipment.push(localizedObject);
            break;
          case 'style':
            result.taleStyles.push(localizedObject);
            break;
          default:
            functions.logger.warn(`Unknown category: ${obj.category} for object ${doc.id}`);
        }
      });
      
      // Cache the result
      setCachedData(language, result);
      
      functions.logger.info(`Fetched ${snapshot.size} objects for language: ${language}`);
      
      return result;
    } catch (error) {
      functions.logger.error('Error fetching objects:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to fetch available objects'
      );
    }
  }
);
