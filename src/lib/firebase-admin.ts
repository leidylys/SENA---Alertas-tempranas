import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import firebaseConfig from '../../firebase-applet-config.json';

if (!getApps().length) {
  let projectId = (process.env.FIREBASE_PROJECT_ID || '').trim();
  if (!projectId) {
    projectId = (process.env.GOOGLE_CLOUD_PROJECT || '').trim();
  }

  const configProjectId = firebaseConfig?.projectId;
  const isConfigValid = configProjectId && !configProjectId.startsWith('remixed-');

  if (!projectId && isConfigValid) {
    projectId = configProjectId.trim();
  }

  // If still empty or default/remixed, force fallback to the user's explicit project ID
  if (!projectId || projectId.startsWith('remixed-')) {
    projectId = 'fast-hawk-0dzmz';
  }

  initializeApp({
    projectId: projectId,
  });
}

export const adminAuth = getAuth();

