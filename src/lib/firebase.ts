import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, Auth } from 'firebase/auth';

const env = (import.meta as any).env || {};
const apiKey = (env.VITE_FIREBASE_API_KEY || '').trim();
const authDomain = (env.VITE_FIREBASE_AUTH_DOMAIN || '').trim();
const projectId = (env.VITE_FIREBASE_PROJECT_ID || '').trim();
const storageBucket = (env.VITE_FIREBASE_STORAGE_BUCKET || '').trim();
const messagingSenderId = (env.VITE_FIREBASE_MESSAGING_SENDER_ID || '').trim();
const appId = (env.VITE_FIREBASE_APP_ID || '').trim();

const startsWithAIza = apiKey.startsWith('AIza');
const keyLength = apiKey.length;
const lastFour = apiKey.length >= 4 ? apiKey.substring(apiKey.length - 4) : '';

const isConfigValid = !!(
  apiKey &&
  startsWithAIza &&
  keyLength >= 20 &&
  projectId
);

// Controlled logging for development diagnostics
if (env.DEV) {
  if (!isConfigValid) {
    console.warn(
      `[Firebase SDK Validation]: Configuración incompleta o inválida. ` +
      `Starts with AIza: ${startsWithAIza} | Length: ${keyLength} | Project ID: ${projectId || 'Missing'}`
    );
  } else {
    console.log(
      `[Firebase SDK Validation]: Inicializando con configuración válida. ` +
      `Project ID: ${projectId} | Starts with AIza: ${startsWithAIza} | Length: ${keyLength} | Last 4: ...${lastFour}`
    );
  }
}

export const isFirebaseConfigured = isConfigValid;

let appInstance: any = null;
let authInstance: Auth = {} as Auth;
let providerInstance: GoogleAuthProvider = {} as GoogleAuthProvider;

if (isConfigValid) {
  try {
    appInstance = initializeApp({
      apiKey,
      authDomain,
      projectId,
      storageBucket,
      messagingSenderId,
      appId
    });
    authInstance = getAuth(appInstance);
    providerInstance = new GoogleAuthProvider();
  } catch (error) {
    console.error('Error al inicializar Firebase SDK:', error);
  }
}

export const auth = authInstance;
export const googleAuthProvider = providerInstance;


