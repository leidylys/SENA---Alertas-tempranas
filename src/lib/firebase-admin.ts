import 'dotenv/config';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

export function resolveFirebaseAdminProjectId(): string {
  const projectId = (
    process.env.FIREBASE_PROJECT_ID ||
    process.env.VITE_FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    ''
  ).trim();

  if (!projectId) {
    throw new Error(
      'Firebase Admin projectId is not configured. Set FIREBASE_PROJECT_ID, VITE_FIREBASE_PROJECT_ID, or GOOGLE_CLOUD_PROJECT.'
    );
  }

  return projectId;
}

if (!getApps().length) {
  const projectId = resolveFirebaseAdminProjectId();

  initializeApp({
    projectId,
  });
}

export const adminAuth = getAuth();
