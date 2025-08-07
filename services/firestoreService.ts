import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';

import { firebaseConfig, APP_MODE } from '../firebaseConfig';
import type { Game } from '../types';

export const isFirebaseConfigPlaceholder =
  !firebaseConfig.apiKey ||
  firebaseConfig.apiKey.includes('your-api-key');

const determineStorageMode = () => {
  if (isFirebaseConfigPlaceholder) {
    console.warn('⚠️ Firebase config is a placeholder, falling back to local storage only.');
    return 'local';
  }
  return APP_MODE;
};

export const STORAGE_MODE = determineStorageMode();

export const isUsingLocalStorage = () => STORAGE_MODE === 'local' || STORAGE_MODE === 'hybrid';
export const isUsingFirebase = () => STORAGE_MODE === 'firebase' || STORAGE_MODE === 'hybrid';
export const isHybridMode = () => STORAGE_MODE === 'hybrid';

console.log('🔥 Storage Mode:', STORAGE_MODE);

// --- LocalStorage Implementation ---
const GAMES_STORAGE_KEY = 'createdGames';

const getStoredGames = (): Game[] => {
  if (typeof window === 'undefined') return [];
  try {
    const storedGames = localStorage.getItem(GAMES_STORAGE_KEY);
    return storedGames ? JSON.parse(storedGames) : [];
  } catch (error) {
    console.error("Error reading games from localStorage:", error);
    return [];
  }
};

const sanitizeGameForStorage = (g: any): Game => {
  const source = g || {};
  let createdAtString = new Date().toISOString();

  if (source.createdAt) {
    if (typeof source.createdAt.toDate === 'function') {
      createdAtString = source.createdAt.toDate().toISOString();
    } else if (source.createdAt instanceof Date) {
      createdAtString = source.createdAt.toISOString();
    } else if (typeof source.createdAt === 'string') {
      createdAtString = source.createdAt;
    }
  }

  return {
    id: String(source.id || `local-${Date.now()}`),
    title: String(source.title || 'Untitled Game'),
    description: String(source.description || ''),
    prompt: String(source.prompt || ''),
    audience: source.audience === 'children' || source.audience === 'adults' ? source.audience : 'adults',
    createdAt: createdAtString,
    gameType: String(source.gameType || 'אחר'),
    code: String(source.code || ''),
    storageLocation: source.storageLocation || 'local',
    syncedToFirebase: !!source.syncedToFirebase,
    firebaseId: source.firebaseId,
    originalLocalId: source.originalLocalId,
  };
};

const saveStoredGames = (games: Game[]) => {
  if (typeof window === 'undefined') return;
  try {
    const serializableGames = games.map(sanitizeGameForStorage);
    localStorage.setItem(GAMES_STORAGE_KEY, JSON.stringify(serializableGames));
  } catch (error) {
    console.error("Error saving games to localStorage:", error);
  }
};

const getGamesMock = async (): Promise<Game[]> => {
  await new Promise(resolve => setTimeout(resolve, 100));
  return getStoredGames().map(g => ({ ...g, storageLocation: 'local' }));
};

const addGameMock = async (gameData: Omit<Game, 'id' | 'createdAt'>): Promise<Game> => {
  const games = getStoredGames();
  const newGame: Game = {
    ...gameData,
    id: `local-${Date.now()}`,
    createdAt: new Date().toISOString(),
    storageLocation: 'local',
  };
  saveStoredGames([newGame, ...games]);
  return newGame;
};

const deleteGameMock = async (id: string) => {
  let games = getStoredGames();
  games = games.filter(game => game.id !== id && game.firebaseId !== id);
  saveStoredGames(games);
};

const updateGameMock = async (id: string, code: string) => {
  let games = getStoredGames();
  const gameIndex = games.findIndex(game => game.id === id);
  if (gameIndex !== -1) {
    games[gameIndex].code = code;
    saveStoredGames(games);
  }
};

// --- Firebase Implementation ---
let app: firebase.app.App | null = null;
let db: firebase.firestore.Firestore | null = null;
let gamesCollection: firebase.firestore.CollectionReference | null = null;
let firebaseInitialized = false;

const initializeFirebase = () => {
  if (firebaseInitialized || isFirebaseConfigPlaceholder) return;

  try {
    // Ensure Firebase is initialized only once
    if (!firebase.apps.length) {
      app = firebase.initializeApp(firebaseConfig);
    } else {
      app = firebase.app();
    }

    db = firebase.firestore(); // Corrected: use firebase.firestore()
    const auth = firebase.auth(); // Corrected: use firebase.auth()
    gamesCollection = db.collection("games");
    firebaseInitialized = true;

    auth.signInAnonymously().catch(error => console.error("Anonymous sign-in failed:", error));
    auth.onAuthStateChanged(user => user && console.log('✅ Firebase Auth connected:', user.uid));

  } catch (error) {
    console.error("Firebase initialization failed:", error);
    db = null;
    firebaseInitialized = false;
  }
};


if (isUsingFirebase()) {
  initializeFirebase();
}

const getGamesFirebase = async (): Promise<Game[]> => {
  if (!gamesCollection) throw new Error("Firestore is not initialized.");
  const q = gamesCollection.orderBy("createdAt", "desc");
  const querySnapshot = await q.get();
  return querySnapshot.docs.map(doc => sanitizeGameForStorage({ ...doc.data(), id: doc.id, storageLocation: 'firebase' }));
};

const addGameFirebase = async (gameData: Omit<Game, 'id' | 'createdAt'>): Promise<Game> => {
  if (!gamesCollection) throw new Error("Firebase is not configured or failed to initialize.");
  const docRef = await gamesCollection.add({
    ...gameData,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  return { ...gameData, id: docRef.id, createdAt: new Date().toISOString(), storageLocation: 'firebase' };
};

const deleteGameFirebase = async (id: string) => {
  if (!db) throw new Error("Firestore is not initialized.");
  await db.collection("games").doc(id).delete();
};

const updateGameFirebase = async (id: string, code: string) => {
  if (!db) throw new Error("Firestore is not initialized.");
  // In hybrid mode, the ID might be the local one. We need to find the firebaseId.
  if (isHybridMode()) {
    const localGames = getStoredGames();
    const syncedGame = localGames.find(g => g.id === id && g.syncedToFirebase && g.firebaseId);
    if (syncedGame && syncedGame.firebaseId) {
        await db.collection("games").doc(syncedGame.firebaseId).update({ code });
        return;
    }
  }
  // Fallback for firebase-native games or direct calls
  await db.collection("games").doc(id).update({ code });
};


// --- Main Exported Functions ---

export const getGames = async (): Promise<Game[]> => {
  const errors: string[] = [];

  if (isHybridMode()) {
    const allGames: Game[] = [];
    const localGames = await getGamesMock();
    allGames.push(...localGames);

    if (firebaseInitialized) {
      try {
        const firebaseGames = await getGamesFirebase();
        // Set of local games that are already synced to prevent duplication
        const syncedLocalGameIds = new Set(
            localGames.filter(g => g.syncedToFirebase).map(g => g.firebaseId)
        );

        firebaseGames.forEach(fbGame => {
          if (!syncedLocalGameIds.has(fbGame.id)) {
            allGames.push(fbGame);
          }
        });
      } catch (e) {
          console.error('Failed to load from Firebase:', e);
          errors.push('Firebase');
      }
    }

    if (errors.length > 0) {
      console.warn(`⚠️ Failed to load from: ${errors.join(', ')}`);
    }

    return allGames.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  } else if (STORAGE_MODE === 'firebase' && firebaseInitialized) {
    return getGamesFirebase();
  } else {
    return getGamesMock();
  }
};

export const addGame = async (gameData: Omit<Game, 'id' | 'createdAt'>): Promise<Game> => {
  if (STORAGE_MODE === 'firebase' && firebaseInitialized) {
    return addGameFirebase(gameData);
  }
  return addGameMock(gameData);
};

export const deleteGame = async (id: string) => {
  const promises: Promise<void>[] = [];

  const localGames = getStoredGames();
  const localGame = localGames.find(g => g.id === id);

  if (isHybridMode()) {
    // Always attempt to delete from local storage.
    promises.push(deleteGameMock(id).catch(() => {}));

    if (firebaseInitialized) {
      // If the game was synced from local, delete its Firebase copy.
      if (localGame?.syncedToFirebase && localGame.firebaseId) {
        promises.push(deleteGameFirebase(localGame.firebaseId).catch(err => {
          console.error('Failed to delete synced game from Firebase:', err);
        }));
      }
      // If the ID is not a local ID, it's a Firebase-native game.
      else if (!id.startsWith('local-')) {
        promises.push(deleteGameFirebase(id).catch(() => {}));
      }
    }
  } else if (STORAGE_MODE === 'firebase' && firebaseInitialized) {
    promises.push(deleteGameFirebase(id));
  } else { // local mode
    promises.push(deleteGameMock(id));
  }

  await Promise.all(promises);
};

export const updateGame = async (id: string, code: string) => {
    const promises: Promise<void>[] = [];
    if (isUsingLocalStorage()) {
        promises.push(updateGameMock(id, code));
    }
    if (isUsingFirebase() && firebaseInitialized) {
        promises.push(updateGameFirebase(id, code).catch(e => console.log("Update on firebase failed, might be local-only game.")));
    }
    await Promise.all(promises);
};

export const saveGameToFirebase = async (game: Game, userId: string): Promise<string> => {
  if (!isUsingFirebase()) {
    throw new Error("Firebase mode is not active.");
  }
  if (!firebaseInitialized) {
    initializeFirebase();
  }
  if (!db) {
    throw new Error("Firebase initialization failed. Could not save the game.");
  }
  if (isFirebaseConfigPlaceholder) {
    throw new Error("Firebase is not configured. Please update firebaseConfig.ts.");
  }

  const gameRef = db.collection("games").doc();
  const firebaseId = gameRef.id;

  const dataForFirestore = {
    title: game.title,
    description: game.description,
    prompt: game.prompt,
    audience: game.audience,
    gameType: game.gameType,
    code: game.code || '',
    createdAt: firebase.firestore.Timestamp.fromDate(new Date(game.createdAt)),
    userId: userId,
    storageLocation: 'firebase',
    originalLocalId: game.id.startsWith('local-') ? game.id : null,
  };

  await gameRef.set(dataForFirestore);

  if (isHybridMode() && game.id.startsWith('local-')) {
    const games = getStoredGames();
    const gameIndex = games.findIndex(g => g.id === game.id);
    if (gameIndex !== -1) {
      games[gameIndex] = {
        ...games[gameIndex],
        syncedToFirebase: true,
        firebaseId: firebaseId,
      };
      saveStoredGames(games);
    }
  }

  return firebaseId;
};
