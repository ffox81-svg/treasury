export type Audience = 'children' | 'adults';

export interface GameExample {
  title: string;
  prompt: string;
}

export interface Game {
  id: string;
  title: string;
  description: string;
  prompt: string;
  audience: Audience;
  createdAt: string; // ISO String
  gameType: string;
  code?: string;
  storageLocation?: 'local' | 'firebase';
  syncedToFirebase?: boolean;
  firebaseId?: string;
  originalLocalId?: string;
}

export interface GeminiMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}
