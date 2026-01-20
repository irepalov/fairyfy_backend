import { Timestamp } from 'firebase-admin/firestore';

export enum FairyTaleStatus {
  DRAFT = 'DRAFT',
  GENERATING = 'GENERATING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED'
}

export interface Hero {
  title: string;
  description: string;
}

export interface Friend {
  title: string;
  description: string;
}

export interface Equipment {
  title: string;
  description: string;
}

export interface Villain {
  title: string;
  description: string;
}

export interface Place {
  title: string;
  description: string;
}

export interface FairyTaleComponents {
  hero: Hero;
  friends: Friend[];
  equipment: Equipment[];
  villains: Villain[];
  places: Place[];
}

export interface AppUser {
  id: string;
  userName: string;
  language: string;
  timezone: string;
  allowNotifications: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface FairyTale {
  id: string;
  userId: string;
  userName: string;
  title: string;
  taleText: string;
  completionStatus: FairyTaleStatus;
  components: FairyTaleComponents;
  taleStyle: {
    style: string;
    description?: string;
  };
  language: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CreateTaleRequest {
  title: string;
  components: FairyTaleComponents;
  taleStyle: {
    style: string;
    description?: string;
  };
}

export interface GenerateTaleRequest {
  taleId: string;
}

export interface UpdateTaleRequest {
  taleId: string;
  title?: string;
  components?: Partial<FairyTaleComponents>;
  taleStyle?: {
    style: string;
  };
  taleText?: string;
}

export interface UpdateUserPreferencesRequest {
  language?: string;
  timezone?: string;
  allowNotifications?: boolean;
}

// ============================================
// OBJECTS CATALOG
// ============================================

export interface Translation {
  title: string;
  description: string;
}

export interface ObjectTranslations {
  en: Translation;
  ru: Translation;
  de: Translation;
  [key: string]: Translation; // Allow other languages
}

export type ObjectCategory = 'hero' | 'friend' | 'villain' | 'place' | 'equipment' | 'style';

export interface FairyTaleObject {
  id: string;
  category: ObjectCategory;
  imageUrl: string;
  sortOrder: number;
  isActive: boolean;
  translations: ObjectTranslations;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface LocalizedObject {
  id: string;
  category: ObjectCategory;
  imageUrl: string;
  sortOrder: number;
  title: string;
  description: string;
}

export interface GetObjectsRequest {
  language: string;
}

export interface GetObjectsResponse {
  heroes: LocalizedObject[];
  friends: LocalizedObject[];
  villains: LocalizedObject[];
  places: LocalizedObject[];
  equipment: LocalizedObject[];
  taleStyles: LocalizedObject[];
}
