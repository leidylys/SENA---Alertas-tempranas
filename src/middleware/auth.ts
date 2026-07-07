import { Request, Response, NextFunction } from 'express';
import { adminAuth, resolveFirebaseAdminProjectId } from '../lib/firebase-admin.ts';
import { DecodedIdToken } from 'firebase-admin/auth';
import { getApps } from 'firebase-admin/app';

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
}

const buildInternalUserId = (correo: string): string => {
  const cleanEmail = correo.trim().toLowerCase();
  const hash = cleanEmail.split('').reduce((acc, char) => ((acc << 5) - acc) + char.charCodeAt(0), 0);
  return `demo-ins-uid-${Math.abs(hash)}`;
};

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const isDev = process.env.NODE_ENV !== 'production';
  if (isDev) {
    console.log(`[DEV LOG] AUTH_STEP: request_received | Path: ${req.path}`);
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    if (isDev) {
      console.log(`[DEV LOG] AUTH_STEP: token_present false | Motivo: Token ausente`);
    }
    return res.status(401).json({ error: 'Unauthorized: Token ausente' });
  }

  if (!authHeader.startsWith('Bearer ')) {
    if (isDev) {
      console.log(`[DEV LOG] AUTH_STEP: token_present false | Motivo: Header Authorization mal formado`);
    }
    return res.status(401).json({ error: 'Unauthorized: Header Authorization mal formado' });
  }

  const tokenParts = authHeader.split('Bearer ');
  const rawToken = tokenParts[1];
  const token = rawToken ? rawToken.trim() : '';

  if (!token) {
    if (isDev) {
      console.log(`[DEV LOG] AUTH_STEP: token_present false | Motivo: Token vacío`);
    }
    return res.status(401).json({ error: 'Unauthorized: Token vacío' });
  }

  if (token.startsWith('demo-instructor:')) {
    const correo = token.replace('demo-instructor:', '').trim().toLowerCase();
    if (!correo || !correo.includes('@')) {
      if (isDev) {
        console.log(`[DEV LOG] AUTH_STEP: internal_token_invalid | Motivo: correo inválido`);
      }
      return res.status(401).json({ error: 'Unauthorized: Token interno inválido' });
    }

    const uid = buildInternalUserId(correo);
    req.user = {
      uid,
      email: correo,
      email_verified: true,
      aud: 'sena-alertas-internal',
      auth_time: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8,
      firebase: { sign_in_provider: 'password' },
      iat: Math.floor(Date.now() / 1000),
      iss: 'sena-alertas-internal',
      sub: uid,
    } as DecodedIdToken;

    if (isDev) {
      console.log(`[DEV LOG] AUTH_STEP: internal_token_success | email: ${correo}`);
    }
    next();
    return;
  }

  const tokenLength = token.length;
  const startsWithEy = token.startsWith('eyJ');

  if (isDev) {
    console.log(`[DEV LOG] AUTH_STEP: token_present true | token_length: ${tokenLength} | token_starts_with_eyJ: ${startsWithEy}`);
    console.log(`[DEV LOG] AUTH_STEP: firebase_admin_verify_start`);
  }

  let firebaseAdminProjectId = '';
  try {
    firebaseAdminProjectId = resolveFirebaseAdminProjectId();
  } catch (error: any) {
    if (isDev) {
      console.log(`[DEV LOG] AUTH_STEP: firebase_admin_verify_error | ${error.message}`);
    }
    return res.status(500).json({ error: `Unauthorized: ${error.message}` });
  }

  // Check if Firebase Admin is properly initialized
  if (!getApps().length) {
    if (isDev) {
      console.log(`[DEV LOG] AUTH_STEP: firebase_admin_verify_error | Firebase Admin mal inicializado`);
    }
    return res.status(500).json({ error: 'Unauthorized: Firebase Admin mal inicializado' });
  }

  if (!firebaseAdminProjectId) {
    if (isDev) {
      console.log(`[DEV LOG] AUTH_STEP: firebase_admin_verify_error | Firebase Admin sin projectId`);
    }
    return res.status(500).json({ error: 'Unauthorized: Firebase Admin sin projectId' });
  }

  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = decodedToken;
    if (isDev) {
      console.log(`[DEV LOG] AUTH_STEP: firebase_admin_verify_success | email del token: ${decodedToken.email || 'no-email'}`);
    }
    next();
  } catch (error: any) {
    const errorCode = error.code || 'unknown';
    const errorMessage = error.message || '';
    
    if (isDev) {
      console.log(`[DEV LOG] AUTH_STEP: firebase_admin_verify_error:
        - error.code: ${errorCode}
        - error.message resumido: ${errorMessage.substring(0, 150)}
        - firebase_admin_project_id: ${firebaseAdminProjectId}
        - token_length: ${tokenLength}
        - token_starts_with_eyJ: ${startsWithEy}`);
    }
    console.error('Error verifying Firebase ID token:', error);
    return res.status(401).json({ 
      error: `Unauthorized: Token no verificable por Firebase Admin (code: ${errorCode}, msg: ${errorMessage.substring(0, 80)})` 
    });
  }
};

