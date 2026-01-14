import { Timestamp } from 'firebase-admin/firestore';

export enum FairyTaleStatus {
  DRAFT = 'DRAFT',
  GENERATING = 'GENERATING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED'
}

export enum EntityType {
  KNIGHT = 'knight',
  WIZARD = 'wizard',
  PRINCESS = 'princess',
  FAIRY = 'fairy',
  DRAGON = 'dragon',
  WITCH = 'witch',
}

export interface Hero {
  name: string;
  type: EntityType;
}

export interface Friend {
  name: string;
  type: EntityType;
}

export interface Equipment {
  name: string;
  description?: string;
}

export interface Villain {
  name: string;
  type: EntityType;
}

export interface Place {
  name: string;
  kind: string;
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
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CreateTaleRequest {
  title: string;
  components: FairyTaleComponents;
  taleStyle: {
    style: string;
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
