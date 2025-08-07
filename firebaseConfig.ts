export const firebaseConfig = {
  apiKey: "AIzaSyDJbFxeURuXpROczA53FoMO8TY9qQ7dL5g",
  authDomain: "game-creator-app.firebaseapp.com",
  projectId: "game-creator-app",
  storageBucket: "game-creator-app.appspot.com",
  messagingSenderId: "840331440186",
  appId: "1:840331440186:web:036e301cc196b4f62e4503",
  measurementId: "G-EPDQMLY9DM"
};

/**
 * Determines the application's data storage mode.
 * - 'local': Use only the browser's local storage.
 * - 'firebase': Use only Firestore.
 * - 'hybrid': Use BOTH local storage AND Firebase. Games are saved locally
 *             by default and can be manually synced to Firebase.
 */
export const APP_MODE: 'local' | 'firebase' | 'hybrid' = 'hybrid';
