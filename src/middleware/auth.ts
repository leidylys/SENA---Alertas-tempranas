import { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import { DecodedIdToken } from 'firebase-admin/auth';

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const token = authHeader.split('Bearer ')[1];

  // Bypass option for testing and preview environments
  if (token === 'demo-admin') {
    req.user = {
      uid: 'demo-admin-uid-123',
      email: 'ing.deliamarherazo@gmail.com',
      name: 'Delia Amar Herazo',
      picture: '',
      auth_time: Math.floor(Date.now() / 1000),
      iss: 'https://securetoken.google.com/demo',
      aud: 'demo',
      sub: 'demo-admin-uid-123',
      exp: Math.floor(Date.now() / 1000) + 3600,
      firebase: {
        identities: {},
        sign_in_provider: 'google.com'
      }
    } as any;
    return next();
  }

  if (token && token.startsWith('demo-instructor:')) {
    const email = token.substring('demo-instructor:'.length);
    const safeName = email.split('@')[0]
      .split('.')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
    
    req.user = {
      uid: 'demo-ins-uid-' + Math.abs(email.split('').reduce((hash, char) => (hash << 5) - hash + char.charCodeAt(0), 0)),
      email: email,
      name: safeName,
      picture: '',
      auth_time: Math.floor(Date.now() / 1000),
      iss: 'https://securetoken.google.com/demo',
      aud: 'demo',
      sub: 'demo-ins-uid-hash',
      exp: Math.floor(Date.now() / 1000) + 3600,
      firebase: {
        identities: {},
        sign_in_provider: 'google.com'
      }
    } as any;
    return next();
  }

  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};
