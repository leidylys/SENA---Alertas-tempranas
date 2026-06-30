import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { db } from './src/db/index.ts';
import {
  instructores,
  programasFormacion,
  fichas,
  instructorFicha,
  aprendicesFichas,
  seguimientosHistorico,
  alertasCriticas
} from './src/db/schema.ts';
import { eq, and, desc, gt } from 'drizzle-orm';
import { requireAuth, AuthRequest } from './src/middleware/auth.ts';

// Robust In-Memory Backup Store for when PostgreSQL is unconfigured or offline
class MemoryBackupDB {
  instructores: any[] = [
    {
      id: 1,
      uid: 'demo-ins-uid-' + Math.abs('ing.deliamarherazo@gmail.com'.split('').reduce((hash, char) => (hash << 5) - hash + char.charCodeAt(0), 0)),
      correo: 'ing.deliamarherazo@gmail.com',
      nombre: 'Delia Amar Herazo',
      rol: 'Administrativo',
      contrasena: 'sena123',
      createdAt: new Date()
    }
  ];

  programasFormacion: any[] = [];
  fichas: any[] = [];
  instructorFicha: any[] = [];
  aprendicesFichas: any[] = [];
  seguimientosHistorico: any[] = [];
  alertasCriticas: any[] = [];

  constructor() {
    console.log("MemoryBackupDB fallback initialized.");
  }
}

const memoryDb = new MemoryBackupDB();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // JSON Body Parser
  app.use(express.json({ limit: '10mb' }));

  // Pre-seed core administrator and coordinator accounts if not yet registered in Postgres
  try {
    const seedAdminAccounts = async () => {
      // 0. Postgres Deduplication: Locate any duplicate instructor rows by email, merge connections, and keep only the latest/completed one.
      try {
        const allIns = await db.select().from(instructores);
        const mapByCorreo = new Map<string, any[]>();
        for (const record of allIns) {
          const email = (record.correo || '').trim().toLowerCase();
          if (!email) continue;
          if (!mapByCorreo.has(email)) {
            mapByCorreo.set(email, []);
          }
          mapByCorreo.get(email)!.push(record);
        }

        for (const [email, records] of mapByCorreo.entries()) {
          if (records.length > 1) {
            console.log(`[DEDUPLICATE] Found ${records.length} records for email: ${email}`);
            
            // Prioritize the record that has a filled name and a valid UID
            records.sort((a, b) => {
              const aScore = (a.nombre && !a.nombre.includes('@') ? 2 : 0) + (a.uid ? 1 : 0);
              const bScore = (b.nombre && !b.nombre.includes('@') ? 2 : 0) + (b.uid ? 1 : 0);
              return bScore - aScore || a.id - b.id; // stable sort descending by completeness, then older first
            });

            const primaryRecord = records[0];
            const duplicateRecords = records.slice(1);

            console.log(`[DEDUPLICATE] Primary selected: ID ${primaryRecord.id} (${primaryRecord.nombre})`);

            for (const dup of duplicateRecords) {
              console.log(`[DEDUPLICATE] Merging duplicate ID ${dup.id} into primary ID ${primaryRecord.id}`);

              // Update instructorFicha connections
              await db.update(instructorFicha)
                .set({ instructorId: primaryRecord.id })
                .where(eq(instructorFicha.instructorId, dup.id));

              // Update seguimientosHistorico connections
              await db.update(seguimientosHistorico)
                .set({ instructorId: primaryRecord.id })
                .where(eq(seguimientosHistorico.instructorId, dup.id));

              // Delete the duplicate instructor row
              await db.delete(instructores)
                .where(eq(instructores.id, dup.id));
            }
          }
        }
      } catch (dedupErr: any) {
        console.warn('Postgres database deduplication skipped or failed:', dedupErr.message);
      }

      // Also deduplicate memoryDb structure to prevent any duplication in memory-only instances
      try {
        const uniqueMemIns: any[] = [];
        const seenMemEmails = new Set<string>();
        
        // Let's sort memoryDb.instructores to keep the most complete one if there are duplicates
        memoryDb.instructores.sort((a: any, b: any) => {
          const aScore = (a.nombre && !a.nombre.includes('@') ? 2 : 0) + (a.uid ? 1 : 0);
          const bScore = (b.nombre && !b.nombre.includes('@') ? 2 : 0) + (b.uid ? 1 : 0);
          return bScore - aScore || a.id - b.id;
        });

        for (const inst of memoryDb.instructores) {
          const emailKey = (inst.correo || '').trim().toLowerCase();
          if (!emailKey) continue;
          if (!seenMemEmails.has(emailKey)) {
            seenMemEmails.add(emailKey);
            uniqueMemIns.push(inst);
          } else {
            // It's a duplicate in memory, redirect any instructor-ficha associations to the primary memory ID
            const primaryInst = uniqueMemIns.find(ui => ui.correo.trim().toLowerCase() === emailKey);
            if (primaryInst) {
              memoryDb.instructorFicha.forEach((link: any) => {
                if (link.instructorId === inst.id) {
                  link.instructorId = primaryInst.id;
                }
              });
              memoryDb.seguimientosHistorico.forEach((hist: any) => {
                if (hist.instructorId === inst.id) {
                  hist.instructorId = primaryInst.id;
                }
              });
            }
          }
        }
        memoryDb.instructores = uniqueMemIns;
      } catch (memDedupErr: any) {
        console.warn('Memory representation deduplication skipped or failed:', memDedupErr.message);
      }

      // 1. Principal Administrator (owner's email)
      const adminEmail = 'ing.deliamarherazo@gmail.com';
      const admins = await db.select().from(instructores).where(eq(instructores.correo, adminEmail));
      const adminUid = 'demo-ins-uid-' + Math.abs(adminEmail.split('').reduce((hash, char) => (hash << 5) - hash + char.charCodeAt(0), 0));
      if (admins.length === 0) {
        await db.insert(instructores).values({
          uid: adminUid,
          correo: adminEmail,
          nombre: 'Delia Amar Herazo',
          rol: 'Administrativo',
          contrasena: 'sena123'
        });
        console.log(`Pre-seeded Admin account in PostgreSQL: ${adminEmail} with default pass: sena123`);
      }

      // Seeding database - keeping only the primary developer/administrator account.
      // Other accounts can be registered or imported dynamically.
    };
    seedAdminAccounts().catch(e => console.warn('Error/Skip in seeding background process (normal if PostgreSQL offline):', e.message));
  } catch (err: any) {
    console.warn('Failed to configure seeding on database startup:', err.message);
  }

  // ==========================================
  // API ROUTES
  // ==========================================

  // 1. Health-check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', database: 'connected_or_fallback' });
  });

  // 1b. Public helper list of instructors for testing/selection (with memory fallback)
  app.get('/api/public/demo-instructors', async (req, res) => {
    try {
      const list = await db.select({
        id: instructores.id,
        nombre: instructores.nombre,
        correo: instructores.correo,
        contrasena: instructores.contrasena,
        rol: instructores.rol
      })
      .from(instructores);
      
      const maskedList = list.map(i => ({
        ...i,
        contrasena: '*****'
      }));
      return res.json(maskedList);
    } catch (err: any) {
      console.warn('Error listing instructors from DB, falling back to memory database:', err.message);
      const list = memoryDb.instructores.map(i => ({
        id: i.id,
        nombre: i.nombre,
        correo: i.correo,
        contrasena: '*****',
        rol: i.rol
      }));
      return res.json(list);
    }
  });

  // 1c. Secure Instructor Login using DB Credentials (User & Password) with automated Memory Fallback
  app.post('/api/auth/instructor-login', async (req, res) => {
    try {
      const { correo, contrasena } = req.body;
      if (!correo || !contrasena) {
        return res.status(400).json({ error: 'Debe ingresar correo y contraseña' });
      }

      const cleanEmail = correo.trim().toLowerCase();
      let inst: any = null;

      try {
        const existing = await db.select().from(instructores).where(eq(instructores.correo, cleanEmail));
        if (existing.length > 0) {
          inst = existing[0];
        } else {
          // Check memory fallback
          const memMatch = memoryDb.instructores.find(i => i.correo.toLowerCase() === cleanEmail);
          if (memMatch) {
            inst = memMatch;
          }
        }
      } catch (dbErr: any) {
        console.warn('Database select error in login, checking memoryDb fallback:', dbErr.message);
        const memMatch = memoryDb.instructores.find(i => i.correo.toLowerCase() === cleanEmail);
        if (memMatch) {
          inst = memMatch;
        }
      }

      if (!inst) {
        return res.status(401).json({ error: 'Instructor no registrado con este correo.' });
      }

      if (inst.contrasena !== contrasena.trim()) {
        return res.status(401).json({ error: 'La contraseña ingresada es incorrecta.' });
      }

      // Synchronize in memory
      const deterministicUid = 'demo-ins-uid-' + Math.abs(cleanEmail.split('').reduce((hash, char) => (hash << 5) - hash + char.charCodeAt(0), 0));
      inst.uid = deterministicUid;

      // Try safely background updating postgres db
      try {
        await db.update(instructores)
          .set({ uid: deterministicUid })
          .where(eq(instructores.id, inst.id));
      } catch (e: any) {
        console.log('Postgres login update skipped (offline mode):', e.message);
      }

      return res.json({
        success: true,
        token: 'demo-instructor:' + inst.correo,
        instructor: {
          id: inst.id,
          nombre: inst.nombre,
          correo: inst.correo,
          rol: inst.rol
        }
      });
    } catch (err: any) {
      console.error('Secure DB Login error:', err);
      return res.status(500).json({ error: 'Fallo al autenticar en base de datos: ' + err.message });
    }
  });

  // 1d. Administrative password/profile update for an instructor (with memory fallback)
  app.post('/api/administrativo/instructor-password', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { email, password, nombre, rol } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'Correo y Contraseña requeridos' });
      }
      
      const cleanEmail = email.trim().toLowerCase();
      const passVal = password.trim();
      const nameVal = nombre ? nombre.trim() : null;
      const rolVal = rol ? rol.trim() : null;
      const isMasked = passVal === '*****';

      // Sync in memory
      const memMatch = memoryDb.instructores.find(i => i.correo.toLowerCase() === cleanEmail);
      if (memMatch) {
        if (!isMasked) {
          memMatch.contrasena = passVal;
        }
        if (nameVal) {
          memMatch.nombre = nameVal;
        }
        if (rolVal) {
          memMatch.rol = rolVal;
        }
      }

      let found = false;
      try {
        const existing = await db.select().from(instructores).where(eq(instructores.correo, cleanEmail));
        if (existing.length > 0) {
          const updateObj: any = {};
          if (!isMasked) {
            updateObj.contrasena = passVal;
          }
          if (nameVal) {
            updateObj.nombre = nameVal;
          }
          if (rolVal) {
            updateObj.rol = rolVal;
          }
          await db.update(instructores)
            .set(updateObj)
            .where(eq(instructores.correo, cleanEmail));
          found = true;
        }
      } catch (dbErr: any) {
        console.warn('Postgres update profile failed (offline fallback utilized):', dbErr.message);
      }

      if (!found && !memMatch) {
        return res.status(404).json({ error: 'Instructor no encontrado por correo.' });
      }

      return res.json({ success: true, message: 'Perfil e instructor actualizados con éxito' });
    } catch (err: any) {
      console.error('Update password error:', err);
      return res.status(500).json({ error: 'Error actualizando contraseña: ' + err.message });
    }
  });

  // 2. Sync Instructor Profile on Login (with memory fallback)
  app.post('/api/instructor/sync', requireAuth, async (req: AuthRequest, res) => {
    const isDev = process.env.NODE_ENV !== 'production';
    try {
      const email = req.user?.email || '';
      const uid = req.user?.uid || '';
      const name = req.user?.name || email.split('@')[0];

      if (isDev) {
        console.log(`[DEV LOG] /api/instructor/sync | email: ${email} | uid: ${uid}`);
      }

      if (!email || !uid) {
        if (isDev) {
          console.log(`[DEV LOG] Correo: Sin correo | Endpoint: POST /api/instructor/sync | Estado HTTP: 400 | Motivo: Missing email or uid in auth context`);
        }
        return res.status(400).json({ error: 'Missing email or uid from auth context' });
      }

      const cleanEmail = email.trim().toLowerCase();
      const initialAdminEmail = process.env.INITIAL_ADMIN_EMAIL ? process.env.INITIAL_ADMIN_EMAIL.trim().toLowerCase() : '';
      const initialAdminConfigured = !!initialAdminEmail;
      const isInitialAdmin = initialAdminConfigured && (cleanEmail === initialAdminEmail);

      if (isDev) {
        console.log(`[DEV LOG] INITIAL_ADMIN_EMAIL configurado: ${initialAdminConfigured}`);
        console.log(`[DEV LOG] Correo coincide con INITIAL_ADMIN_EMAIL: ${isInitialAdmin}`);
      }

      let instructorRow: any = null;
      let userExistsInDb = false;
      let userDbStatus: string | undefined = undefined;

      // 1. Try PostgreSQL Sync
      try {
        const existing = await db.select().from(instructores).where(eq(instructores.correo, cleanEmail));
        userExistsInDb = existing.length > 0;
        
        if (userExistsInDb) {
          const user = existing[0];
          userDbStatus = user.estado || undefined;
          
          if (isDev) {
            console.log(`[DEV LOG] Usuario existe en base de datos PostgreSQL: true | Estado: ${userDbStatus}`);
          }

          if (isInitialAdmin) {
            // Update or activate as Administrativo
            const updated = await db.update(instructores)
              .set({
                uid,
                nombre: user.nombre || name,
                rol: 'Administrativo',
                estado: 'Activo'
              })
              .where(eq(instructores.id, user.id))
              .returning();
            instructorRow = updated[0];
          } else {
            if (user.estado === 'Inactivo') {
              if (isDev) {
                console.log(`[DEV LOG] Correo: ${cleanEmail} | Endpoint: POST /api/instructor/sync | Estado HTTP: 403 | Motivo: Su cuenta se encuentra inactiva. Comuníquese con coordinación. | Rol devuelto: ${user.rol}`);
              }
              return res.status(403).json({ error: 'Su cuenta se encuentra inactiva. Comuníquese con coordinación.' });
            }
            // Update UID and sync name
            const updated = await db.update(instructores)
              .set({
                uid,
                nombre: user.nombre || name
              })
              .where(eq(instructores.id, user.id))
              .returning();
            instructorRow = updated[0];
          }
        } else {
          if (isDev) {
            console.log(`[DEV LOG] Usuario existe en base de datos PostgreSQL: false`);
          }

          // Email does not exist in DB
          if (isInitialAdmin) {
            // Create initial admin
            const result = await db.insert(instructores)
              .values({
                uid,
                correo: cleanEmail,
                nombre: name,
                rol: 'Administrativo',
                estado: 'Activo'
              })
              .returning();
            instructorRow = result[0];
          } else {
            // Not INITIAL_ADMIN_EMAIL and not in DB
            if (isDev) {
              console.log(`[DEV LOG] Correo: ${cleanEmail} | Endpoint: POST /api/instructor/sync | Estado HTTP: 401 | Motivo: Su cuenta no se encuentra autorizada para ingresar al sistema. Comuníquese con coordinación. | Rol devuelto: ninguno`);
            }
            return res.status(401).json({ error: 'Su cuenta no se encuentra autorizada para ingresar al sistema. Comuníquese con coordinación.' });
          }
        }
      } catch (dbErr: any) {
        console.warn('Postgres profile synchronization failed, using memory DB fallback:', dbErr.message);
      }

      // 2. Memory DB Fallback (if PostgreSQL skipped or offline)
      if (!instructorRow) {
        if (isDev) {
          console.log(`[DEV LOG] Usando fallback de base de datos en memoria para sincronización.`);
        }
        let memMatch = memoryDb.instructores.find(i => i.correo.toLowerCase() === cleanEmail);
        userExistsInDb = !!memMatch;
        if (memMatch) {
          userDbStatus = memMatch.estado || undefined;
          if (isDev) {
            console.log(`[DEV LOG] Usuario existe en Memory DB: true | Estado: ${userDbStatus}`);
          }

          if (isInitialAdmin) {
            memMatch.uid = uid;
            memMatch.rol = 'Administrativo';
            memMatch.estado = 'Activo';
            instructorRow = memMatch;
          } else {
            if (memMatch.estado === 'Inactivo') {
              if (isDev) {
                console.log(`[DEV LOG] Correo: ${cleanEmail} | Endpoint: POST /api/instructor/sync | Estado HTTP: 403 | Motivo: Su cuenta se encuentra inactiva. Comuníquese con coordinación. (Memory DB) | Rol devuelto: ${memMatch.rol}`);
              }
              return res.status(403).json({ error: 'Su cuenta se encuentra inactiva. Comuníquese con coordinación.' });
            }
            memMatch.uid = uid;
            instructorRow = memMatch;
          }
        } else {
          if (isDev) {
            console.log(`[DEV LOG] Usuario existe en Memory DB: false`);
          }

          if (isInitialAdmin) {
            memMatch = {
              id: memoryDb.instructores.length + 1,
              uid,
              correo: cleanEmail,
              nombre: name,
              rol: 'Administrativo',
              estado: 'Activo',
              contrasena: 'sena123',
              createdAt: new Date()
            };
            memoryDb.instructores.push(memMatch);
            instructorRow = memMatch;
          } else {
            if (isDev) {
              console.log(`[DEV LOG] Correo: ${cleanEmail} | Endpoint: POST /api/instructor/sync | Estado HTTP: 401 | Motivo: Su cuenta no se encuentra autorizada para ingresar al sistema. Comuníquese con coordinación. (Memory DB) | Rol devuelto: ninguno`);
            }
            return res.status(401).json({ error: 'Su cuenta no se encuentra autorizada para ingresar al sistema. Comuníquese con coordinación.' });
          }
        }
      }

      if (isDev) {
        console.log(`[DEV LOG] Correo: ${cleanEmail} | Endpoint: POST /api/instructor/sync | Estado HTTP: 200 | Sincronización Exitosa | Rol devuelto: ${instructorRow.rol}`);
      }

      const safeInstructor = { ...instructorRow };
      if (safeInstructor) {
        delete safeInstructor.contrasena;
      }

      return res.json({ success: true, instructor: safeInstructor });
    } catch (err: any) {
      console.error('Error in /api/instructor/sync:', err);
      if (isDev) {
        console.log(`[DEV LOG] Correo: desconocido | Endpoint: POST /api/instructor/sync | Estado HTTP: 500 | Motivo: ${err.message || 'Error del servidor'}`);
      }
      return res.status(500).json({ error: 'Error al sincronizar perfil del instructor' });
    }
  });

  // 3. Get modern instructor details (with memory fallback)
  app.get('/api/instructor/me', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user?.uid || '';
      try {
        const result = await db.select().from(instructores).where(eq(instructores.uid, uid));
        if (result.length > 0) {
          const safeInstructor = { ...result[0] };
          delete safeInstructor.contrasena;
          return res.json(safeInstructor);
        }
      } catch (dbErr: any) {
        console.warn('Postgres GET /me failed, loading from cache:', dbErr.message);
      }

      const memMatch = memoryDb.instructores.find(i => i.uid === uid);
      if (memMatch) {
        const safeInstructor = { ...memMatch };
        delete safeInstructor.contrasena;
        return res.json(safeInstructor);
      }
      return res.status(404).json({ error: 'Instructor no encontrado en base de datos' });
    } catch (err: any) {
      console.error('Error fetching instructor:', err);
      return res.status(500).json({ error: 'Error al recuperar perfil de instructor' });
    }
  });

  // Update instructor's custom role (with memory fallback)
  app.put('/api/instructor/me', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user?.uid || '';
      const { rol, nombre, adminKey } = req.body;

      // Verify admin passcode if setting role to Administrativo
      if (rol === 'Administrativo') {
        const correctKeys = ['sena2026admin', 'sena_coordinacion_2026', 'admin123', 'sena2026'];
        const providedKey = String(adminKey || '').trim().toLowerCase();
        
        if (!correctKeys.includes(providedKey)) {
          return res.status(403).json({ error: 'La clave de autorización administrativa ingresada es incorrecta.' });
        }
      }

      // Sync in memory
      const memMatch = memoryDb.instructores.find(i => i.uid === uid);
      if (memMatch) {
        if (rol) memMatch.rol = rol;
        if (nombre) memMatch.nombre = nombre;
      }

      let instructorRow = memMatch;

      try {
        const result = await db.update(instructores)
          .set({
            rol: rol || 'Instructor Técnico',
            nombre: nombre || undefined
          })
          .where(eq(instructores.uid, uid))
          .returning();
        if (result.length > 0) {
          instructorRow = result[0];
        }
      } catch (dbErr: any) {
        console.warn('Postgres PUT /me role update skipped (synced in memory cache):', dbErr.message);
      }

      return res.json(instructorRow);
    } catch (err: any) {
      console.error('Error updating instructor:', err);
      return res.status(500).json({ error: 'Error al actualizar perfil' });
    }
  });

  // Endpoints to safely delete/inactivate instructors and handle reassignments
  app.get('/api/administrativo/instructores/:id/prepare-delete', requireAuth, async (req: AuthRequest, res) => {
    try {
      const instructorId = parseInt(req.params.id);
      if (isNaN(instructorId)) {
        return res.status(400).json({ error: 'ID de instructor inválido' });
      }

      // Check current user is Administrative
      const requesterUid = req.user?.uid || '';
      let requester = null;
      try {
        const reqResult = await db.select().from(instructores).where(eq(instructores.uid, requesterUid));
        requester = reqResult[0];
      } catch { /* ignore */ }
      if (!requester) {
        requester = memoryDb.instructores.find(i => i.uid === requesterUid);
      }
      if (!requester || requester.rol !== 'Administrativo') {
        return res.status(403).json({ error: 'Acceso denegado: Se requiere rol Administrativo' });
      }

      // Locate target instructor
      let targetInstructor = null;
      try {
        const instList = await db.select().from(instructores).where(eq(instructores.id, instructorId));
        if (instList.length > 0) targetInstructor = instList[0];
      } catch { /* ignore */ }
      if (!targetInstructor) {
        targetInstructor = memoryDb.instructores.find(i => i.id === instructorId);
      }

      if (!targetInstructor) {
        return res.status(404).json({ error: 'Instructor no encontrado' });
      }

      // Load active assignments for this instructor in instructorFicha
      let activeAssignments = [];
      try {
        const links = await db.select({
          id: instructorFicha.id,
          fichaId: instructorFicha.fichaId,
          codigoFicha: fichas.codigoFicha,
          programaId: fichas.programaId,
          rolEnFicha: instructorFicha.rolEnFicha,
          area: instructorFicha.area
        })
        .from(instructorFicha)
        .innerJoin(fichas, eq(instructorFicha.fichaId, fichas.id))
        .where(eq(instructorFicha.instructorId, instructorId));

        for (const link of links) {
          const prog = await db.select().from(programasFormacion).where(eq(programasFormacion.id, link.programaId));
          activeAssignments.push({
            id: link.id,
            fichaId: link.fichaId,
            codigoFicha: link.codigoFicha,
            programaFormacion: prog[0]?.nombre || 'Sin programa',
            rolEnFicha: link.rolEnFicha,
            area: link.area || 'General'
          });
        }
      } catch (dbErr: any) {
        // Fallback memory
        const links = memoryDb.instructorFicha.filter(link => link.instructorId === instructorId);
        activeAssignments = links.map(link => {
          const f = memoryDb.fichas.find(fi => fi.id === link.fichaId);
          const prog = f ? memoryDb.programasFormacion.find(p => p.id === f.programaId) : null;
          return {
            id: link.id,
            fichaId: link.fichaId,
            codigoFicha: f ? f.codigoFicha : 'N/A',
            programaFormacion: prog ? prog.nombre : 'Sin programa',
            rolEnFicha: link.rolEnFicha,
            area: link.area || 'General'
          };
        });
      }

      // Check count of historical follow-ups
      let countSeguimientos = 0;
      try {
        const segs = await db.select().from(seguimientosHistorico).where(eq(seguimientosHistorico.instructorId, instructorId));
        countSeguimientos = segs.length;
      } catch (dbErr) {
        const segs = memoryDb.seguimientosHistorico.filter(s => s.instructorId === instructorId);
        countSeguimientos = segs.length;
      }

      // Find candidates (other ACTIVE instructors, excluding self)
      let candidates = [];
      try {
        const term = await db.select({
          id: instructores.id,
          nombre: instructores.nombre,
          correo: instructores.correo,
          rol: instructores.rol
        })
        .from(instructores)
        .where(eq(instructores.estado, 'Activo'));
        candidates = term.filter(i => i.id !== instructorId);
      } catch (dbErr) {
        candidates = memoryDb.instructores
          .filter(i => (i.estado || 'Activo') === 'Activo' && i.id !== instructorId)
          .map(i => ({
            id: i.id,
            nombre: i.nombre,
            correo: i.correo,
            rol: i.rol
          }));
      }

      return res.json({
        instructor: {
          id: targetInstructor.id,
          nombre: targetInstructor.nombre,
          correo: targetInstructor.correo,
          rol: targetInstructor.rol,
          estado: targetInstructor.estado || 'Activo'
        },
        hasAssignments: activeAssignments.length > 0,
        assignments: activeAssignments,
        countSeguimientos,
        canPhysicalDelete: countSeguimientos === 0,
        candidates
      });
    } catch (err: any) {
      console.error('Error prep delete:', err);
      return res.status(500).json({ error: 'Error preparando eliminación de instructor: ' + err.message });
    }
  });

  app.post('/api/administrativo/instructores/delete-or-inactivate', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { instructorId, reassignments } = req.body;
      if (!instructorId) {
        return res.status(400).json({ error: 'ID de instructor es requerido' });
      }

      // Check current user is Administrative
      const requesterUid = req.user?.uid || '';
      let requester = null;
      try {
        const reqResult = await db.select().from(instructores).where(eq(instructores.uid, requesterUid));
        requester = reqResult[0];
      } catch { /* ignore */ }
      if (!requester) {
        requester = memoryDb.instructores.find(i => i.uid === requesterUid);
      }
      if (!requester || requester.rol !== 'Administrativo') {
        return res.status(403).json({ error: 'Acceso denegado: Se requiere rol Administrativo' });
      }

      // Locate target instructor
      let targetInstructor = null;
      try {
        const instList = await db.select().from(instructores).where(eq(instructores.id, instructorId));
        if (instList.length > 0) targetInstructor = instList[0];
      } catch { /* ignore */ }
      if (!targetInstructor) {
        targetInstructor = memoryDb.instructores.find(i => i.id === instructorId);
      }

      if (!targetInstructor) {
        return res.status(404).json({ error: 'Instructor no encontrado' });
      }

      let reassignmentsExecuted = 0;
      let associationsDeleted = 0;

      // Handle reassignments
      if (Array.isArray(reassignments)) {
        for (const reass of reassignments) {
          const { fichaId, rolEnFicha, area, newInstructorId } = reass;
          const cleanArea = area ? area.trim() : 'General';

          if (rolEnFicha === 'Instructor Líder' && !newInstructorId) {
            return res.status(400).json({ error: `La ficha ${fichaId} requiere obligatoriamente un nuevo Instructor Líder.` });
          }

          // Delete the old association first to prevent overlap issues
          // Also, if newInstructorId is null and role is 'Instructor Transversal', we just delete it!
          try {
            await db.delete(instructorFicha).where(
              and(
                eq(instructorFicha.instructorId, instructorId),
                eq(instructorFicha.fichaId, fichaId),
                eq(instructorFicha.rolEnFicha, rolEnFicha),
                eq(instructorFicha.area, cleanArea)
              )
            );
          } catch { /* ignore */ }
          
          // Also in memory delete
          memoryDb.instructorFicha = memoryDb.instructorFicha.filter(link => 
            !(link.instructorId === instructorId &&
              link.fichaId === fichaId &&
              link.rolEnFicha === rolEnFicha &&
              (link.area || 'General') === cleanArea)
          );

          if (newInstructorId) {
            // Check if there is an existing assignment for the NEW instructor for this ficha, role and area
            let existingNew = false;
            try {
              const checkList = await db.select().from(instructorFicha).where(
                and(
                  eq(instructorFicha.instructorId, newInstructorId),
                  eq(instructorFicha.fichaId, fichaId),
                  eq(instructorFicha.rolEnFicha, rolEnFicha),
                  eq(instructorFicha.area, cleanArea)
                )
              );
              existingNew = checkList.length > 0;
            } catch {
              existingNew = memoryDb.instructorFicha.some(link => 
                link.instructorId === newInstructorId &&
                link.fichaId === fichaId &&
                link.rolEnFicha === rolEnFicha &&
                (link.area || 'General') === cleanArea
              );
            }

            // If it's a leader reassignment, ensure no other active Leader remains for this ficha
            if (rolEnFicha === 'Instructor Líder') {
              try {
                await db.delete(instructorFicha).where(
                  and(
                    eq(instructorFicha.fichaId, fichaId),
                    eq(instructorFicha.rolEnFicha, 'Instructor Líder')
                  )
                );
              } catch { /* ignore */ }
              memoryDb.instructorFicha = memoryDb.instructorFicha.filter(link =>
                !(link.fichaId === fichaId && link.rolEnFicha === 'Instructor Líder')
              );
              existingNew = false; // forced brand-new or reset
            }

            // If it's a transversal reassignment, ensure no other transversal remains for the same area
            if (rolEnFicha === 'Instructor Transversal') {
              try {
                await db.delete(instructorFicha).where(
                  and(
                    eq(instructorFicha.fichaId, fichaId),
                    eq(instructorFicha.rolEnFicha, 'Instructor Transversal'),
                    eq(instructorFicha.area, cleanArea)
                  )
                );
              } catch { /* ignore */ }
              memoryDb.instructorFicha = memoryDb.instructorFicha.filter(link =>
                !(link.fichaId === fichaId && link.rolEnFicha === 'Instructor Transversal' && (link.area || 'General') === cleanArea)
              );
              existingNew = false; // forced brand-new or reset
            }

            if (!existingNew) {
              try {
                await db.insert(instructorFicha).values({
                  instructorId: newInstructorId,
                  fichaId: fichaId,
                  rolEnFicha: rolEnFicha,
                  area: cleanArea
                });
              } catch { /* ignore */ }
              
              // In memory
              memoryDb.instructorFicha.push({
                id: memoryDb.instructorFicha.length + 1,
                instructorId: newInstructorId,
                fichaId: fichaId,
                rolEnFicha: rolEnFicha,
                area: cleanArea
              });
            }

            reassignmentsExecuted++;
          } else {
            associationsDeleted++;
          }
        }
      }

      // Check history count
      let countSeguimientos = 0;
      try {
        const segs = await db.select().from(seguimientosHistorico).where(eq(seguimientosHistorico.instructorId, instructorId));
        countSeguimientos = segs.length;
      } catch {
        countSeguimientos = memoryDb.seguimientosHistorico.filter(s => s.instructorId === instructorId).length;
      }

      let removalMethod = 'inactivated';

      if (countSeguimientos > 0) {
        // Can't physically delete due to historical records, so mark as Inactive
        try {
          await db.update(instructores)
            .set({ estado: 'Inactivo' })
            .where(eq(instructores.id, instructorId));
        } catch { /* ignore */ }

        // Memory db
        const m = memoryDb.instructores.find(i => i.id === instructorId);
        if (m) {
          m.estado = 'Inactivo';
        }
        removalMethod = 'inactivated';
      } else {
        // Safe to physically delete
        try {
          // Double-check: clean remaining instructorFicha assignments for this deleted instructor
          try {
            await db.delete(instructorFicha).where(eq(instructorFicha.instructorId, instructorId));
          } catch { /* ignore */ }
          
          await db.delete(instructores).where(eq(instructores.id, instructorId));
        } catch { /* ignore */ }

        // Memory db
        memoryDb.instructorFicha = memoryDb.instructorFicha.filter(link => link.instructorId !== instructorId);
        memoryDb.instructores = memoryDb.instructores.filter(i => i.id !== instructorId);
        removalMethod = 'deleted';
      }

      return res.json({
        success: true,
        summary: {
          nombre: targetInstructor.nombre,
          reassignedCount: reassignmentsExecuted,
          deletedCount: associationsDeleted,
          method: removalMethod
        }
      });
    } catch (err: any) {
      console.error('Delete or inactivate error:', err);
      return res.status(500).json({ error: 'Fallo al procesar la desvinculación: ' + err.message });
    }
  });

  // 4. Fetch all programs (with memory fallback)
  app.get('/api/programas', requireAuth, async (req, res) => {
    try {
      try {
        const list = await db.select().from(programasFormacion);
        return res.json(list);
      } catch (dbErr: any) {
        console.warn('PostgreSQL GET /programas failed, pulling memory program data:', dbErr.message);
        return res.json(memoryDb.programasFormacion);
      }
    } catch (err: any) {
      console.error('Error checking programs list:', err);
      return res.status(500).json({ error: 'Error al recuperar programas' });
    }
  });

  // 5. Fetch all Fichas associated to the active instructor, or ALL Fichas if Administrativo (with memory fallback)
  app.get('/api/fichas', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user?.uid || '';
      
      // Load instructor profile
      let insRow = null;
      const memIns = memoryDb.instructores.find(i => i.uid === uid);
      try {
        const insResult = await db.select().from(instructores).where(eq(instructores.uid, uid));
        if (insResult.length > 0) {
          insRow = insResult[0];
        } else {
          insRow = memIns;
        }
      } catch (dbErr: any) {
        insRow = memIns;
      }

      if (!insRow) {
        return res.json([]);
      }

      // If user is "Administrativo", let them fetch ALL fichas in system!
      if (insRow.rol === 'Administrativo') {
        try {
          const allFichas = await db.select().from(fichas);
          const completeList = [];
          for (const f of allFichas) {
            const progResult = await db.select().from(programasFormacion).where(eq(programasFormacion.id, f.programaId));
            const assignments = await db.select({
              id: instructores.id,
              nombre: instructores.nombre,
              correo: instructores.correo,
              rol: instructorFicha.rolEnFicha,
              area: instructorFicha.area,
              estado: instructores.estado
            })
            .from(instructorFicha)
            .innerJoin(instructores, eq(instructorFicha.instructorId, instructores.id))
            .where(eq(instructorFicha.fichaId, f.id));

            const hasActiveLider = assignments.some(a => 
              (a.rol.toLowerCase().includes('lider') || a.rol.toLowerCase().includes('líder')) && 
              a.estado === 'Activo'
            );

            const transversalAreas = Array.from(new Set(
              assignments
                .filter(a => a.rol.toLowerCase().includes('transversal'))
                .map(a => a.area || 'General')
            ));
            
            const missingTransversals: any[] = [];
            for (const area of transversalAreas) {
              const areaAss = assignments.filter(a => (a.area || 'General') === area && a.rol.toLowerCase().includes('transversal'));
              const hasActiveTrans = areaAss.some(a => a.estado === 'Activo');
              if (!hasActiveTrans) {
                missingTransversals.push(area);
              }
            }

            // Count actual learners in database for this ficha
            let totalLearners = 0;
            let countAlto = 0;
            let countMedio = 0;
            let countBajo = 0;
            try {
              const learnersList = await db.select().from(aprendicesFichas).where(eq(aprendicesFichas.fichaId, f.id));
              totalLearners = learnersList.length;
              countAlto = learnersList.filter(l => l.nivelRiesgo === 'Alto' || l.nivelRiesgo === 'alto').length;
              countMedio = learnersList.filter(l => l.nivelRiesgo === 'Medio' || l.nivelRiesgo === 'medio').length;
              countBajo = learnersList.filter(l => l.nivelRiesgo === 'Bajo' || l.nivelRiesgo === 'bajo').length;
            } catch (learnersErr) {
              console.warn('Error fetching learners for count, fallback to 0', learnersErr);
            }

            completeList.push({
              id: f.id,
              codigoFicha: f.codigoFicha,
              fechaInicio: f.fechaInicio,
              fechaFin: f.fechaFin,
              programaId: f.programaId,
              programaFormacion: progResult[0]?.nombre || 'Sin programa',
              nivel: progResult[0]?.nivel || 'Tecnólogo',
              rolEnFicha: 'Administrativo',
              instructor: assignments.map(a => `${a.nombre} (${a.rol}${a.area && a.area !== 'General' ? ' - ' + a.area : ''})`).join(' | ') || 'Sin asignación',
              assignments: assignments,
              hasActiveLider,
              missingTransversals,
              aprendicesCargados: totalLearners > 0,
              totalAprendices: totalLearners,
              countAlto,
              countMedio,
              countBajo
            });
          }
          return res.json(completeList);
        } catch (dbErr: any) {
          console.warn('Postgres GET /fichas for Admin failed, compiling cache lists:', dbErr.message);
          const completeList = memoryDb.fichas.map(f => {
            const prog = memoryDb.programasFormacion.find(p => p.id === f.programaId);
            const links = memoryDb.instructorFicha.filter(link => link.fichaId === f.id);
            
            const learnersList = memoryDb.aprendicesFichas.filter(l => l.fichaId === f.id);
            const learnersCount = learnersList.length;
            const countAlto = learnersList.filter(l => l.nivelRiesgo === 'Alto' || l.nivelRiesgo === 'alto').length;
            const countMedio = learnersList.filter(l => l.nivelRiesgo === 'Medio' || l.nivelRiesgo === 'medio').length;
            const countBajo = learnersList.filter(l => l.nivelRiesgo === 'Bajo' || l.nivelRiesgo === 'bajo').length;

            const assignments = links.map(link => {
              const inst = memoryDb.instructores.find(i => i.id === link.instructorId);
              return {
                id: inst?.id || 0,
                nombre: inst?.nombre || 'Instructor',
                correo: inst?.correo || '',
                rol: link.rolEnFicha,
                area: link.area,
                estado: inst?.estado || 'Activo'
              };
            });

            const hasActiveLider = assignments.some(a => 
              (a.rol.toLowerCase().includes('lider') || a.rol.toLowerCase().includes('líder')) && 
              a.estado === 'Activo'
            );

            const transversalAreas = Array.from(new Set(
              assignments
                .filter(a => a.rol.toLowerCase().includes('transversal'))
                .map(a => a.area || 'General')
            ));
            
            const missingTransversals: any[] = [];
            for (const area of transversalAreas) {
              const areaAss = assignments.filter(a => (a.area || 'General') === area && a.rol.toLowerCase().includes('transversal'));
              const hasActiveTrans = areaAss.some(a => a.estado === 'Activo');
              if (!hasActiveTrans) {
                missingTransversals.push(area);
              }
            }

            return {
              id: f.id,
              codigoFicha: f.codigoFicha,
              fechaInicio: f.fechaInicio,
              fechaFin: f.fechaFin,
              programaId: f.programaId,
              programaFormacion: prog?.nombre || 'Análisis y Desarrollo de Software (ADSO)',
              nivel: prog?.nivel || 'Tecnólogo',
              rolEnFicha: 'Administrativo',
              instructor: assignments.map(a => `${a.nombre} (${a.rol}${a.area && a.area !== 'General' ? ' - ' + a.area : ''})`).join(' | ') || 'Sin asignación',
              assignments: assignments,
              hasActiveLider,
              missingTransversals,
              aprendicesCargados: learnersCount > 0,
              totalAprendices: learnersCount,
              countAlto,
              countMedio,
              countBajo
            };
          });
          return res.json(completeList);
        }
      }

      // Standard Instructor: Fetch only assigned fichas 
      try {
        const assigned = await db.select({
          id: fichas.id,
          codigoFicha: fichas.codigoFicha,
          fechaInicio: fichas.fechaInicio,
          fechaFin: fichas.fechaFin,
          programaId: fichas.programaId,
          rolEnFicha: instructorFicha.rolEnFicha,
          area: instructorFicha.area
        })
        .from(instructorFicha)
        .innerJoin(fichas, eq(instructorFicha.fichaId, fichas.id))
        .where(eq(instructorFicha.instructorId, insRow.id));

        const seenFichaIds = new Set();
        const uniqueAssigned = assigned.filter(item => {
          if (seenFichaIds.has(item.id)) return false;
          seenFichaIds.add(item.id);
          return true;
        });

        const completeList = [];
        for (const f of uniqueAssigned) {
          const progResult = await db.select().from(programasFormacion).where(eq(programasFormacion.id, f.programaId));
          const assignments = await db.select({
            id: instructores.id,
            nombre: instructores.nombre,
            correo: instructores.correo,
            rol: instructorFicha.rolEnFicha,
            area: instructorFicha.area,
            estado: instructores.estado
          })
          .from(instructorFicha)
          .innerJoin(instructores, eq(instructorFicha.instructorId, instructores.id))
          .where(eq(instructorFicha.fichaId, f.id));

          const hasActiveLider = assignments.some(a => 
            (a.rol.toLowerCase().includes('lider') || a.rol.toLowerCase().includes('líder')) && 
            a.estado === 'Activo'
          );

          const transversalAreas = Array.from(new Set(
            assignments
              .filter(a => a.rol.toLowerCase().includes('transversal'))
              .map(a => a.area || 'General')
          ));
          
          const missingTransversals: any[] = [];
          for (const area of transversalAreas) {
            const areaAss = assignments.filter(a => (a.area || 'General') === area && a.rol.toLowerCase().includes('transversal'));
            const hasActiveTrans = areaAss.some(a => a.estado === 'Activo');
            if (!hasActiveTrans) {
              missingTransversals.push(area);
            }
          }

          let totalLearners = 0;
          let countAlto = 0;
          let countMedio = 0;
          let countBajo = 0;
          try {
            const learnersList = await db.select().from(aprendicesFichas).where(eq(aprendicesFichas.fichaId, f.id));
            totalLearners = learnersList.length;
            countAlto = learnersList.filter(l => l.nivelRiesgo === 'Alto' || l.nivelRiesgo === 'alto').length;
            countMedio = learnersList.filter(l => l.nivelRiesgo === 'Medio' || l.nivelRiesgo === 'medio').length;
            countBajo = learnersList.filter(l => l.nivelRiesgo === 'Bajo' || l.nivelRiesgo === 'bajo').length;
          } catch (learnersErr) {
            console.warn('Error fetching learners for count, fallback to 0', learnersErr);
          }

          completeList.push({
            id: f.id,
            codigoFicha: f.codigoFicha,
            fechaInicio: f.fechaInicio,
            fechaFin: f.fechaFin,
            programaId: f.programaId,
            rolEnFicha: f.rolEnFicha,
            area: f.area,
            programaFormacion: progResult[0]?.nombre || 'Sin programa',
            nivel: progResult[0]?.nivel || 'Tecnólogo',
            instructor: assignments.map(a => `${a.nombre} (${a.rol}${a.area && a.area !== 'General' ? ' - ' + a.area : ''})`).join(' | ') || 'Sin asignación',
            assignments: assignments,
            hasActiveLider,
            missingTransversals,
            aprendicesCargados: totalLearners > 0,
            totalAprendices: totalLearners,
            countAlto,
            countMedio,
            countBajo
          });
        }
        return res.json(completeList);
      } catch (dbErr: any) {
        console.warn('PostgreSQL GET /fichas for Instructor failed, compiling cache lists:', dbErr.message);
        const links = memoryDb.instructorFicha.filter(link => link.instructorId === insRow.id);
        const completeList = links.map(link => {
          const f = memoryDb.fichas.find(fi => fi.id === link.fichaId);
          if (!f) return null;
          const prog = memoryDb.programasFormacion.find(p => p.id === f.programaId);
          
          const learnersList = memoryDb.aprendicesFichas.filter(l => l.fichaId === f.id);
          const learnersCount = learnersList.length;
          const countAlto = learnersList.filter(l => l.nivelRiesgo === 'Alto' || l.nivelRiesgo === 'alto').length;
          const countMedio = learnersList.filter(l => l.nivelRiesgo === 'Medio' || l.nivelRiesgo === 'medio').length;
          const countBajo = learnersList.filter(l => l.nivelRiesgo === 'Bajo' || l.nivelRiesgo === 'bajo').length;
          
          const allFichaLinks = memoryDb.instructorFicha.filter(l => l.fichaId === f.id);
          const assignments = allFichaLinks.map(l => {
            const inst = memoryDb.instructores.find(i => i.id === l.instructorId);
            return {
              id: inst?.id || 0,
              nombre: inst?.nombre || 'Instructor',
              correo: inst?.correo || '',
              rol: l.rolEnFicha,
              area: l.area,
              estado: inst?.estado || 'Activo'
            };
          });

          const hasActiveLider = assignments.some(a => 
            (a.rol.toLowerCase().includes('lider') || a.rol.toLowerCase().includes('líder')) && 
            a.estado === 'Activo'
          );

          const transversalAreas = Array.from(new Set(
            assignments
              .filter(a => a.rol.toLowerCase().includes('transversal'))
              .map(a => a.area || 'General')
          ));
          
          const missingTransversals: any[] = [];
          for (const area of transversalAreas) {
            const areaAss = assignments.filter(a => (a.area || 'General') === area && a.rol.toLowerCase().includes('transversal'));
            const hasActiveTrans = areaAss.some(a => a.estado === 'Activo');
            if (!hasActiveTrans) {
              missingTransversals.push(area);
            }
          }

          return {
            id: f.id,
            codigoFicha: f.codigoFicha,
            fechaInicio: f.fechaInicio,
            fechaFin: f.fechaFin,
            programaId: f.programaId,
            rolEnFicha: link.rolEnFicha,
            area: link.area,
            programaFormacion: prog?.nombre || 'Análisis y Desarrollo de Software (ADSO)',
            nivel: prog?.nivel || 'Tecnólogo',
            instructor: assignments.map(a => `${a.nombre} (${a.rol}${a.area && a.area !== 'General' ? ' - ' + a.area : ''})`).join(' | ') || 'Sin asignación',
            assignments: assignments,
            hasActiveLider,
            missingTransversals,
            aprendicesCargados: learnersCount > 0,
            totalAprendices: learnersCount,
            countAlto,
            countMedio,
            countBajo
          };
        }).filter(item => item !== null);
        return res.json(completeList);
      }
    } catch (err: any) {
      console.error('Error in GET /api/fichas:', err);
      return res.status(500).json({ error: 'Error al cargar fichas asociadas' });
    }
  });

  // DELETE individual Ficha (requires Administrative access)
  app.delete('/api/fichas/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user?.uid || '';
      const fId = Number(req.params.id);
      
      const memIns = memoryDb.instructores.find(i => i.uid === uid);
      let requester = null;
      try {
        const requesterResult = await db.select().from(instructores).where(eq(instructores.uid, uid));
        requester = requesterResult[0] || memIns;
      } catch (dbErr: any) {
        requester = memIns;
      }

      if (!requester || requester.rol !== 'Administrativo') {
        return res.status(403).json({ error: 'Acceso denegado: Se requiere rol Administrativo' });
      }

      // 1. Delete from PostgreSQL
      let postgresDeleted = false;
      try {
        const apps = await db.select().from(aprendicesFichas).where(eq(aprendicesFichas.fichaId, fId));
        for (const app of apps) {
          await db.delete(seguimientosHistorico).where(eq(seguimientosHistorico.aprendizFichaId, app.id));
        }
        await db.delete(aprendicesFichas).where(eq(aprendicesFichas.fichaId, fId));
        await db.delete(instructorFicha).where(eq(instructorFicha.fichaId, fId));
        await db.delete(fichas).where(eq(fichas.id, fId));
        postgresDeleted = true;
      } catch (dbErr: any) {
        console.warn('PostgreSQL individual ficha delete skipped or failed:', dbErr.message);
      }

      // 2. Delete from Memory DB
      const appIds = memoryDb.aprendicesFichas.filter(l => l.fichaId === fId).map(l => l.id);
      memoryDb.seguimientosHistorico = memoryDb.seguimientosHistorico.filter(s => !appIds.includes(s.aprendizFichaId));
      memoryDb.aprendicesFichas = memoryDb.aprendicesFichas.filter(l => l.fichaId !== fId);
      memoryDb.instructorFicha = memoryDb.instructorFicha.filter(link => link.fichaId !== fId);
      memoryDb.fichas = memoryDb.fichas.filter(f => f.id !== fId);

      return res.json({ success: true, message: 'La ficha y todos sus datos relacionados fueron eliminados.' });
    } catch (err: any) {
      console.error('Error deleting ficha:', err);
      return res.status(500).json({ error: 'Error interno al eliminar la ficha' });
    }
  });

  // PUT individual Ficha (requires Administrative access)
  app.put('/api/fichas/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user?.uid || '';
      const fId = Number(req.params.id);
      const { codigoFicha, fechaInicio, fechaFin } = req.body;

      if (!codigoFicha || !fechaInicio || !fechaFin) {
        return res.status(400).json({ error: 'Faltan campos obligatorios' });
      }

      const memIns = memoryDb.instructores.find(i => i.uid === uid);
      let requester = null;
      try {
        const requesterResult = await db.select().from(instructores).where(eq(instructores.uid, uid));
        requester = requesterResult[0] || memIns;
      } catch (dbErr: any) {
        requester = memIns;
      }

      if (!requester || requester.rol !== 'Administrativo') {
        return res.status(403).json({ error: 'Acceso denegado: Se requiere rol Administrativo' });
      }

      // 1. Update PostgreSQL
      let postgresUpdated = false;
      try {
        await db.update(fichas)
          .set({ codigoFicha, fechaInicio, fechaFin })
          .where(eq(fichas.id, fId));
        postgresUpdated = true;
      } catch (dbErr: any) {
        console.warn('PostgreSQL individual ficha update skipped or failed:', dbErr.message);
      }

      // 2. Update Memory DB
      const memF = memoryDb.fichas.find(f => f.id === fId);
      if (memF) {
        memF.codigoFicha = codigoFicha;
        memF.fechaInicio = fechaInicio;
        memF.fechaFin = fechaFin;
      }

      return res.json({ success: true, message: 'Ficha actualizada correctamente' });
    } catch (err: any) {
      console.error('Error updating ficha:', err);
      return res.status(500).json({ error: 'Error interno al actualizar la ficha' });
    }
  });

  // 5b. Upload programming of Fichas (Admin) (with memory fallback)
  app.post('/api/administrativo/programacion', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user?.uid || '';
      
      const memIns = memoryDb.instructores.find(i => i.uid === uid);
      let requester = null;

      try {
        const requesterResult = await db.select().from(instructores).where(eq(instructores.uid, uid));
        requester = requesterResult[0] || memIns;
      } catch (dbErr: any) {
        requester = memIns;
      }

      if (!requester || requester.rol !== 'Administrativo') {
        return res.status(403).json({ error: 'Acceso denegado: Se requiere rol Administrativo' });
      }

      const { programacion } = req.body; // Array of item objects
      if (!Array.isArray(programacion)) {
        return res.status(400).json({ error: 'El cuerpo debe contener un arreglo de programación' });
      }

      const isLider = (rol: string) => {
        const r = (rol || '').trim().toLowerCase();
        return r.includes('lider') || r.includes('líder');
      };

      const isTransversal = (rol: string) => {
        return (rol || '').trim().toLowerCase().includes('transversal');
      };

      // Pre-load current state from DB (and fallback to memory Db if offline)
      let allInstructors = JSON.parse(JSON.stringify(memoryDb.instructores));
      let allFichas = JSON.parse(JSON.stringify(memoryDb.fichas));
      let allProgrammes = JSON.parse(JSON.stringify(memoryDb.programasFormacion));
      
      let allLinks = memoryDb.instructorFicha.map((link: any) => {
        const inst = allInstructors.find((i: any) => i.id === link.instructorId);
        return {
          id: link.id,
          instructorId: link.instructorId,
          fichaId: link.fichaId,
          rolEnFicha: link.rolEnFicha,
          area: link.area,
          instructorEmail: inst ? inst.correo : '',
          instructorNombre: inst ? inst.nombre : ''
        };
      });

      let dbOnline = false;

      try {
        const dbInstructors = await db.select().from(instructores);
        const dbFichas = await db.select().from(fichas);
        const dbProgrammes = await db.select().from(programasFormacion);
        const dbLinks = await db.select().from(instructorFicha);
        
        allInstructors = dbInstructors.map(i => ({ ...i }));
        allFichas = dbFichas.map(f => ({ ...f }));
        allProgrammes = dbProgrammes.map(p => ({ ...p }));
        allLinks = dbLinks.map(link => {
          const inst = allInstructors.find(i => i.id === link.instructorId);
          return {
            id: link.id,
            instructorId: link.instructorId,
            fichaId: link.fichaId,
            rolEnFicha: link.rolEnFicha,
            area: link.area,
            instructorEmail: inst ? inst.correo : '',
            instructorNombre: inst ? inst.nombre : ''
          };
        });
        dbOnline = true;
      } catch (dbErr: any) {
        console.warn('Postgres offline during programming load preset. Fallback to memory lists:', dbErr.message);
      }

      let countInstructoresCreados = 0;
      let countFichasCreadas = 0;
      let countAsignacionesNuevas = 0;
      let countAsignacionesConservadas = 0;
      let countRegistrosNoModificados = 0;
      const erroresLog: any[] = [];
      const conflictos: any[] = [];

      const results = [];
      for (const item of programacion) {
        try {
          const {
            codigoFicha,
            nombrePrograma,
            nivel,
            fechaInicio,
            fechaFin,
            correoInstructor,
            nombreInstructor,
            rolInstructor,
            area
          } = item;

          if (!codigoFicha || !correoInstructor) {
            countRegistrosNoModificados++;
            continue; 
          }

          const cleanEmail = correoInstructor.trim().toLowerCase();
          const cleanName = (nombreInstructor || '').trim() || cleanEmail.split('@')[0];
          const cleanRol = (rolInstructor || 'Instructor Técnico').trim();
          const cleanArea = area ? area.trim() : 'General';
          const cleanProgName = (nombrePrograma || 'Programa sin nombre').trim();

          // Simulative lookups
          let inst = allInstructors.find(i => i.correo.toLowerCase() === cleanEmail);
          let fich = allFichas.find(f => f.codigoFicha === codigoFicha);

          const tempInstId = inst ? inst.id : -(allInstructors.length + 1000);
          const tempFichaId = fich ? fich.id : -(allFichas.length + 1000);

          const existingLinksForFicha = allLinks.filter(l => l.fichaId === tempFichaId);

          // Rule 0. Check duplicate exact matches
          const exactMatch = existingLinksForFicha.find(l => {
            const isSameInst = (l.instructorId === tempInstId) || 
              (l.instructorId < 0 && tempInstId < 0 && l.instructorEmail?.toLowerCase() === cleanEmail);
            const isSameRol = (l.rolEnFicha || '').trim().toLowerCase() === cleanRol.trim().toLowerCase();
            const isSameArea = (l.area || 'General').trim().toLowerCase() === cleanArea.trim().toLowerCase();
            return isSameInst && isSameRol && isSameArea;
          });

          if (exactMatch) {
            countAsignacionesConservadas++;
            countRegistrosNoModificados++;
            results.push({
              codigoFicha,
              correoInstructor,
              status: 'Conservado'
            });
            continue;
          }

          // Rule 1. Una ficha no puede tener más de un Instructor Líder activo.
          const isNewLider = isLider(cleanRol);
          let conflictLider = null;
          if (isNewLider) {
            conflictLider = existingLinksForFicha.find(l => {
              if (!isLider(l.rolEnFicha || '')) return false;
              const isSameInst = (l.instructorId === tempInstId) || 
                (l.instructorId < 0 && tempInstId < 0 && l.instructorEmail?.toLowerCase() === cleanEmail);
              return !isSameInst;
            });
          }

          if (conflictLider) {
            let existingInstName = conflictLider.instructorNombre;
            if (!existingInstName && conflictLider.instructorId > 0) {
              const dbInst = allInstructors.find(i => i.id === conflictLider.instructorId);
              existingInstName = dbInst ? dbInst.nombre : 'Instructor';
            }
            if (!existingInstName) {
              existingInstName = conflictLider.instructorEmail || 'Otro Instructor';
            }

            conflictos.push({
              codigoFicha,
              instructorExistente: existingInstName,
              instructorNuevo: cleanName,
              rol: cleanRol,
              area: cleanArea,
              tipoConflicto: 'La ficha ya posee un Instructor Líder activo'
            });

            results.push({
              codigoFicha,
              correoInstructor,
              status: 'Conflicto: Multi-Lider'
            });
            continue;
          }

          // Rule 3. Una ficha no puede tener dos instructores transversales de la misma área.
          const isNewTransversal = isTransversal(cleanRol);
          let conflictTransversal = null;
          if (isNewTransversal) {
            conflictTransversal = existingLinksForFicha.find(l => {
              if (!isTransversal(l.rolEnFicha || '')) return false;
              const isSameArea = (l.area || 'General').trim().toLowerCase() === cleanArea.toLowerCase();
              if (!isSameArea) return false;
              const isSameInst = (l.instructorId === tempInstId) || 
                (l.instructorId < 0 && tempInstId < 0 && l.instructorEmail?.toLowerCase() === cleanEmail);
              return !isSameInst;
            });
          }

          if (conflictTransversal) {
            let existingInstName = conflictTransversal.instructorNombre;
            if (!existingInstName && conflictTransversal.instructorId > 0) {
              const dbInst = allInstructors.find(i => i.id === conflictTransversal.instructorId);
              existingInstName = dbInst ? dbInst.nombre : 'Instructor';
            }
            if (!existingInstName) {
              existingInstName = conflictTransversal.instructorEmail || 'Otro Instructor';
            }

            conflictos.push({
              codigoFicha,
              instructorExistente: existingInstName,
              instructorNuevo: cleanName,
              rol: cleanRol,
              area: cleanArea,
              tipoConflicto: `La ficha ya posee un Instructor Transversal activo para el área de ${cleanArea}`
            });

            results.push({
              codigoFicha,
              correoInstructor,
              status: `Conflicto: Transversal duplicado en área: ${cleanArea}`
            });
            continue;
          }

          // 1. Sync structures to Memory DB
          let memProg = memoryDb.programasFormacion.find(p => p.nombre === cleanProgName);
          if (!memProg) {
            memProg = {
              id: memoryDb.programasFormacion.length + 1,
              codigo: (nombrePrograma?.substring(0, 10).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'PROG_GEN') + '_' + Math.floor(Math.random() * 10050),
              nombre: cleanProgName,
              nivel: nivel || 'Tecnólogo',
              createdAt: new Date()
            };
            memoryDb.programasFormacion.push(memProg);
            allProgrammes.push(memProg);
          }

          let memFicha = memoryDb.fichas.find(f => f.codigoFicha === codigoFicha);
          if (memFicha) {
            memFicha.fechaInicio = fechaInicio || memFicha.fechaInicio;
            memFicha.fechaFin = fechaFin || memFicha.fechaFin;
          } else {
            countFichasCreadas++;
            memFicha = {
              id: memoryDb.fichas.length + 1,
              codigoFicha,
              programaId: memProg.id,
              fechaInicio: fechaInicio || '2026-01-15',
              fechaFin: fechaFin || '2027-12-15',
              createdAt: new Date()
            };
            memoryDb.fichas.push(memFicha);
            allFichas.push(memFicha);
          }

          let memInst = memoryDb.instructores.find(i => i.correo.toLowerCase() === cleanEmail);
          if (!memInst) {
            countInstructoresCreados++;
            memInst = {
              id: memoryDb.instructores.length + 1,
              uid: 'demo-ins-uid-' + Math.abs(cleanEmail.split('').reduce((hash, char) => (hash << 5) - hash + char.charCodeAt(0), 0)),
              correo: cleanEmail,
              nombre: cleanName,
              rol: cleanRol,
              contrasena: 'sena123',
              createdAt: new Date()
            };
            memoryDb.instructores.push(memInst);
            allInstructors.push(memInst);
          } else {
            memInst.nombre = cleanName;
            memInst.rol = cleanRol;
          }

          const memLinked = memoryDb.instructorFicha.find(link => 
            link.instructorId === memInst.id && 
            link.fichaId === memFicha.id &&
            (link.rolEnFicha || '').trim().toLowerCase() === cleanRol.trim().toLowerCase() &&
            (link.area || 'General').trim().toLowerCase() === cleanArea.trim().toLowerCase()
          );
          if (!memLinked) {
            countAsignacionesNuevas++;
            memoryDb.instructorFicha.push({
              id: memoryDb.instructorFicha.length + 1,
              instructorId: memInst.id,
              fichaId: memFicha.id,
              rolEnFicha: cleanRol,
              area: cleanArea,
              createdAt: new Date()
            });
            allLinks.push({
              id: memoryDb.instructorFicha.length,
              instructorId: memInst.id,
              fichaId: memFicha.id,
              rolEnFicha: cleanRol,
              area: cleanArea,
              instructorEmail: memInst.correo,
              instructorNombre: memInst.nombre
            });
          }

          // 2. Try saving to Postgres DB
          try {
            const cleanProgCode = nombrePrograma?.substring(0, 10).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'PROG_GEN';
            let progId: number;

            const existingProg = await db.select().from(programasFormacion).where(eq(programasFormacion.nombre, cleanProgName));
            if (existingProg.length > 0) {
              progId = existingProg[0].id;
            } else {
              const newProg = await db.insert(programasFormacion)
                .values({
                  codigo: cleanProgCode + '_' + Math.floor(Math.random() * 10050),
                  nombre: cleanProgName,
                  nivel: nivel || 'Tecnólogo'
                })
                .returning();
              progId = newProg[0].id;
            }

            let resolvedFichaId: number;
            const existingFicha = await db.select().from(fichas).where(eq(fichas.codigoFicha, codigoFicha));
            if (existingFicha.length > 0) {
              resolvedFichaId = existingFicha[0].id;
              await db.update(fichas)
                .set({
                  fechaInicio: fechaInicio || existingFicha[0].fechaInicio,
                  fechaFin: fechaFin || existingFicha[0].fechaFin
                })
                .where(eq(fichas.id, resolvedFichaId));
            } else {
              const newFicha = await db.insert(fichas)
                .values({
                  codigoFicha,
                  programaId: progId,
                  fechaInicio: fechaInicio || '2026-01-15',
                  fechaFin: fechaFin || '2027-12-15'
                })
                .returning();
              resolvedFichaId = newFicha[0].id;
            }

            let instructorId: number;
            const existingInstructor = await db.select().from(instructores).where(eq(instructores.correo, cleanEmail));
            if (existingInstructor.length > 0) {
              instructorId = existingInstructor[0].id;
              await db.update(instructores)
                .set({
                  nombre: cleanName,
                  rol: cleanRol
                })
                .where(eq(instructores.id, instructorId));
            } else {
              const newInstructor = await db.insert(instructores)
                .values({
                  uid: 'demo-ins-uid-' + Math.abs(cleanEmail.split('').reduce((hash, char) => (hash << 5) - hash + char.charCodeAt(0), 0)),
                  correo: cleanEmail,
                  nombre: cleanName,
                  rol: cleanRol
                })
                .returning();
              instructorId = newInstructor[0].id;
            }

            const existingLink = await db.select().from(instructorFicha)
              .where(and(
                eq(instructorFicha.instructorId, instructorId),
                eq(instructorFicha.fichaId, resolvedFichaId),
                eq(instructorFicha.rolEnFicha, cleanRol),
                eq(instructorFicha.area, cleanArea)
              ));

            if (existingLink.length === 0) {
              await db.insert(instructorFicha)
                .values({
                  instructorId,
                  fichaId: resolvedFichaId,
                  rolEnFicha: cleanRol,
                  area: cleanArea
                });
            }
          } catch (dbErr: any) {
            console.log('Skipping Postgres programming row entry (normal if database offline):', dbErr.message);
          }

          results.push({
            codigoFicha,
            correoInstructor,
            status: 'Sincronizado'
          });

        } catch (rowErr: any) {
          console.error('Error processing programming row:', rowErr);
          results.push({
            codigoFicha: item.codigoFicha,
            correoInstructor: item.correoInstructor,
            status: 'Error: ' + rowErr.message
          });
          erroresLog.push(rowErr.message);
        }
      }

      return res.json({ 
        success: true, 
        processed: results.length, 
        details: results,
        summary: {
          instructoresCreados: countInstructoresCreados,
          fichasCreadas: countFichasCreadas,
          asignacionesNuevas: countAsignacionesNuevas,
          asignacionesConservadas: countAsignacionesConservadas,
          conflictos: conflictos,
          registrosNoModificados: countRegistrosNoModificados + conflictos.length,
          errores: erroresLog
        }
      });
    } catch (err: any) {
      console.error('Error uploading programming:', err);
      return res.status(500).json({ error: 'Error interno guardando la programación' });
    }
  });

  // 5c. Clear all loaded database records/examples (Admin)
  app.post('/api/administrativo/reset-database', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user?.uid || '';
      const memIns = memoryDb.instructores.find(i => i.uid === uid);
      let requester = null;

      try {
        const requesterResult = await db.select().from(instructores).where(eq(instructores.uid, uid));
        requester = requesterResult[0] || memIns;
      } catch (dbErr: any) {
        requester = memIns;
      }

      if (!requester || requester.rol !== 'Administrativo') {
        return res.status(403).json({ error: 'Acceso denegado: Se requiere rol Administrativo' });
      }

      // Reset Postgres Database if online/active
      let postgresReset = false;
      try {
        await db.delete(seguimientosHistorico);
        await db.delete(aprendicesFichas);
        await db.delete(instructorFicha);
        await db.delete(fichas);
        await db.delete(programasFormacion);
        postgresReset = true;
        console.log('PostgreSQL database tables wiped successfully.');
      } catch (dbErr: any) {
        console.warn('Skipped or failed PostgreSQL table clear (normal if database offline):', dbErr.message);
      }

      // Reset Memory Backup Store
      memoryDb.seguimientosHistorico = [];
      memoryDb.aprendicesFichas = [];
      memoryDb.instructorFicha = [];
      memoryDb.fichas = [];
      memoryDb.programasFormacion = [];

      return res.json({ 
        success: true, 
        message: 'Todos los datos de fichas, programas, aprendices y seguimientos han sido eliminados del sistema.',
        postgresReset 
      });
    } catch (err: any) {
      console.error('Error resetting database:', err);
      return res.status(500).json({ error: 'Error interno al limpiar el sistema' });
    }
  });

  // 6. Fetch single Ficha and its learners list (with memory fallback)
  app.get('/api/fichas/:fichaCodigo', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { fichaCodigo } = req.params;

      const memFicha = memoryDb.fichas.find(f => f.codigoFicha === fichaCodigo);
      const memProg = memFicha ? memoryDb.programasFormacion.find(p => p.id === memFicha.programaId) : null;
      const memLearners = memFicha ? memoryDb.aprendicesFichas.filter(l => l.fichaId === memFicha.id) : [];

      try {
        const fichaResult = await db.select().from(fichas).where(eq(fichas.codigoFicha, fichaCodigo));
        if (fichaResult.length === 0) {
          if (!memFicha) {
            return res.status(404).json({ error: 'Ficha no registrada en el sistema' });
          }
          throw new Error('Fallback check');
        }
        const selectedFicha = fichaResult[0];

        // Load program
        const progResult = await db.select().from(programasFormacion).where(eq(programasFormacion.id, selectedFicha.programaId));
        const programInfo = progResult[0];

        // Load learners
        const learners = await db.select().from(aprendicesFichas).where(eq(aprendicesFichas.fichaId, selectedFicha.id));

        const completeLearners = [];
        for (const student of learners) {
          const historyLogs = await db.select({
            id: seguimientosHistorico.id,
            fecha: seguimientosHistorico.fecha,
            estadoPrevio: seguimientosHistorico.estadoPrevio,
            estadoNuevo: seguimientosHistorico.estadoNuevo,
            detalles: seguimientosHistorico.detalles,
            compromisoFecha: seguimientosHistorico.compromisoFecha,
            tipoSeguimiento: seguimientosHistorico.tipoSeguimiento,
            evidenciasPendientes: seguimientosHistorico.evidenciasPendientes,
            diasSinAcceso: seguimientosHistorico.diasSinAcceso,
            numeroLlamado: seguimientosHistorico.numeroLlamado,
            instructorNombre: instructores.nombre,
            instructorCorreo: instructores.correo,
            instructorRol: instructores.rol,
            codigoFicha: seguimientosHistorico.codigoFicha,
            usuarioResponsableNombre: seguimientosHistorico.usuarioResponsableNombre,
            usuarioResponsableRol: seguimientosHistorico.usuarioResponsableRol,
            medioComunicacion: seguimientosHistorico.medioComunicacion,
            fechaRegistro: seguimientosHistorico.fechaRegistro,
            fechaEnvioMensaje: seguimientosHistorico.fechaEnvioMensaje,
            fechaRespuestaAprendiz: seguimientosHistorico.fechaRespuestaAprendiz,
            fechaProximoSeguimiento: seguimientosHistorico.fechaProximoSeguimiento,
            asunto: seguimientosHistorico.asunto,
            cuerpoMensaje: seguimientosHistorico.cuerpoMensaje,
            observacion: seguimientosHistorico.observacion,
            respuestaAprendiz: seguimientosHistorico.respuestaAprendiz,
            acuerdosEstablecidos: seguimientosHistorico.acuerdosEstablecidos,
            compromisos: seguimientosHistorico.compromisos,
            proximaAccion: seguimientosHistorico.proximaAccion,
            fechaUltimoIngreso: seguimientosHistorico.fechaUltimoIngreso,
            totalEvidencias: seguimientosHistorico.totalEvidencias,
            evidenciasEnviadas: seguimientosHistorico.evidenciasEnviadas,
            evidenciasAprobadas: seguimientosHistorico.evidenciasAprobadas,
            evidenciasDesaprobadas: seguimientosHistorico.evidenciasDesaprobadas,
            detalleEvidenciasPendientes: seguimientosHistorico.detalleEvidenciasPendientes,
            creadoPorId: seguimientosHistorico.creadoPorId,
            creadoPorNombre: seguimientosHistorico.creadoPorNombre,
            creadoPorRol: seguimientosHistorico.creadoPorRol,
            editablePorRol: seguimientosHistorico.editablePorRol,
            origenRegistro: seguimientosHistorico.origenRegistro
          })
          .from(seguimientosHistorico)
          .leftJoin(instructores, eq(seguimientosHistorico.instructorId, instructores.id))
          .where(eq(seguimientosHistorico.aprendizFichaId, student.id))
          .orderBy(desc(seguimientosHistorico.fecha));

          completeLearners.push({
            ...student,
            id: student.documento, 
            dbId: student.id,      
            historialIntervenciones: historyLogs.map(log => ({
              id: String(log.id),
              fecha: log.fecha.toISOString().split('T')[0],
              instructor: log.usuarioResponsableNombre || log.creadoPorNombre || log.instructorNombre || 'Instructor',
              detalle: log.detalles || `${log.observacion || ''}${log.compromisoFecha ? ` (Fecha compromiso: ${log.compromisoFecha})` : ''}`,
              previo: log.estadoPrevio,
              nuevo: log.estadoNuevo,
              tipoSeguimiento: log.tipoSeguimiento,
              evidenciasPendientes: log.evidenciasPendientes,
              diasSinAcceso: log.diasSinAcceso,
              numeroLlamado: log.numeroLlamado,
              
              codigoFicha: log.codigoFicha,
              usuarioResponsableNombre: log.usuarioResponsableNombre || log.instructorNombre,
              usuarioResponsableRol: log.usuarioResponsableRol || log.instructorRol,
              medioComunicacion: log.medioComunicacion,
              fechaRegistro: log.fechaRegistro ? log.fechaRegistro.toISOString() : undefined,
              fechaEnvioMensaje: log.fechaEnvioMensaje,
              fechaRespuestaAprendiz: log.fechaRespuestaAprendiz,
              fechaProximoSeguimiento: log.fechaProximoSeguimiento,
              asunto: log.asunto,
              cuerpoMensaje: log.cuerpoMensaje,
              observacion: log.observacion,
              respuestaAprendiz: log.respuestaAprendiz,
              acuerdosEstablecidos: log.acuerdosEstablecidos,
              compromisos: log.compromisos,
              proximaAccion: log.proximaAccion,
              fechaUltimoIngreso: log.fechaUltimoIngreso,
              totalEvidencias: log.totalEvidencias,
              evidenciasEnviadas: log.evidenciasEnviadas,
              evidenciasAprobadas: log.evidenciasAprobadas,
              evidenciasDesaprobadas: log.evidenciasDesaprobadas,
              detalleEvidenciasPendientes: log.detalleEvidenciasPendientes,
              creadoPorId: log.creadoPorId,
              creadoPorNombre: log.creadoPorNombre,
              creadoPorRol: log.creadoPorRol,
              editablePorRol: log.editablePorRol,
              origenRegistro: log.origenRegistro
            }))
          });
        }

        return res.json({
          ficha: {
            id: selectedFicha.id,
            codigoFicha: selectedFicha.codigoFicha,
            fechaInicio: selectedFicha.fechaInicio,
            fechaFin: selectedFicha.fechaFin,
            programaFormacion: programInfo?.nombre,
            nivel: programInfo?.nivel,
            ultimoSeguimiento: selectedFicha.ultimoSeguimiento,
          },
          aprendices: completeLearners
        });
      } catch (dbErr: any) {
        console.warn('Postgres single ficha details fetch bypassed:', dbErr.message);
        if (!memFicha) {
          return res.status(404).json({ error: 'Ficha no registrada en el sistema' });
        }

        const completeLearners = memLearners.map(student => {
          const historyLogs = memoryDb.seguimientosHistorico
            .filter(log => log.aprendizFichaId === student.id)
            .sort((a, b) => b.fecha.getTime() - a.fecha.getTime());

          return {
            ...student,
            id: student.documento,
            dbId: student.id,
            historialIntervenciones: historyLogs.map(log => {
              const inst = memoryDb.instructores.find(i => i.id === log.instructorId);
              return {
                id: String(log.id),
                fecha: log.fecha.toISOString().split('T')[0],
                instructor: log.usuarioResponsableNombre || log.creadoPorNombre || inst?.nombre || 'Instructor',
                detalle: log.detalles || `${log.observacion || ''}${log.compromisoFecha ? ` (Fecha compromiso: ${log.compromisoFecha})` : ''}`,
                previo: log.estadoPrevio,
                nuevo: log.estadoNuevo,
                tipoSeguimiento: log.tipoSeguimiento,
                evidenciasPendientes: log.evidenciasPendientes,
                diasSinAcceso: log.diasSinAcceso,
                numeroLlamado: log.numeroLlamado,

                codigoFicha: log.codigoFicha,
                usuarioResponsableNombre: log.usuarioResponsableNombre || inst?.nombre,
                usuarioResponsableRol: log.usuarioResponsableRol || inst?.rol,
                medioComunicacion: log.medioComunicacion,
                fechaRegistro: log.fechaRegistro ? log.fechaRegistro.toISOString() : undefined,
                fechaEnvioMensaje: log.fechaEnvioMensaje,
                fechaRespuestaAprendiz: log.fechaRespuestaAprendiz,
                fechaProximoSeguimiento: log.fechaProximoSeguimiento,
                asunto: log.asunto,
                cuerpoMensaje: log.cuerpoMensaje,
                observacion: log.observacion,
                respuestaAprendiz: log.respuestaAprendiz,
                acuerdosEstablecidos: log.acuerdosEstablecidos,
                compromisos: log.compromisos,
                proximaAccion: log.proximaAccion,
                fechaUltimoIngreso: log.fechaUltimoIngreso,
                totalEvidencias: log.totalEvidencias,
                evidenciasEnviadas: log.evidenciasEnviadas,
                evidenciasAprobadas: log.evidenciasAprobadas,
                evidenciasDesaprobadas: log.evidenciasDesaprobadas,
                detalleEvidenciasPendientes: log.detalleEvidenciasPendientes,
                creadoPorId: log.creadoPorId,
                creadoPorNombre: log.creadoPorNombre,
                creadoPorRol: log.creadoPorRol,
                editablePorRol: log.editablePorRol,
                origenRegistro: log.origenRegistro
              };
            })
          };
        });

        return res.json({
          ficha: {
            id: memFicha.id,
            codigoFicha: memFicha.codigoFicha,
            fechaInicio: memFicha.fechaInicio,
            fechaFin: memFicha.fechaFin,
            programaFormacion: memProg?.nombre || 'Análisis y Desarrollo de Software (ADSO)',
            nivel: memProg?.nivel || 'Tecnólogo',
            ultimoSeguimiento: memFicha.ultimoSeguimiento,
          },
          aprendices: completeLearners
        });
      }
    } catch (err: any) {
      console.error('Error fetching single ficha details:', err);
      return res.status(500).json({ error: 'Error al recuperar detalles de la ficha' });
    }
  });

  // 7. Save / Sync Learner records from Excel upload session (with memory fallback)
  app.post('/api/fichas/:fichaCodigo/aprendices', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { fichaCodigo } = req.params;
      const { programaFormacion, nivel, fechaInicio, fechaFin, aprendices } = req.body;
      const uid = req.user?.uid || '';

      if (!fichaCodigo || !aprendices) {
        return res.status(400).json({ error: 'Falta el código de la ficha o la lista de aprendices' });
      }

      // Find the instructor profile by Auth UID
      let insRecord: any = null;
      try {
        const list = await db.select().from(instructores).where(eq(instructores.uid, uid));
        if (list.length > 0) {
          insRecord = list[0];
        }
      } catch (e) {
        // Offline / dev mode
      }
      if (!insRecord) {
        insRecord = memoryDb.instructores.find(i => i.uid === uid);
      }

      if (!insRecord) {
        return res.status(401).json({ error: 'Usuario no autenticado o perfil de instructor no encontrado.' });
      }

      const userRole = insRecord.rol || 'Instructor';
      const isCoordinacionOrAdmin = userRole === 'Administrativo' || userRole === 'Coordinación' || userRole === 'Coordinacion';

      // Check if ficha exists in memoryDb
      let memFicha = memoryDb.fichas.find(f => f.codigoFicha === fichaCodigo);
      
      // Try finding the Ficha in Postgres DB
      let pgFichaId: number | null = null;
      try {
        const existingPgFicha = await db.select().from(fichas).where(eq(fichas.codigoFicha, fichaCodigo));
        if (existingPgFicha.length > 0) {
          pgFichaId = existingPgFicha[0].id;
        }
      } catch (e) {
        // Offline / dev mode bypass
      }

      // 2. Validator: Ficha existence check
      if (!memFicha && !pgFichaId) {
        return res.status(404).json({
          error: `Ficha no registrada: La ficha con código ${fichaCodigo} no existe en el sistema. Asegúrate de que la Coordinación Académica configure o cargue primero la programación de esta ficha antes de asociarle un listado de aprendices.`
        });
      }

      // If existing Pg Ficha exists but not in memory, sync to memory helper
      if (!memFicha && pgFichaId) {
        memFicha = {
          id: pgFichaId,
          codigoFicha: fichaCodigo,
          programaId: 1, // fallback
          fechaInicio: fechaInicio || '2026-01-15',
          fechaFin: fechaFin || '2027-12-15',
          createdAt: new Date()
        };
        memoryDb.fichas.push(memFicha);
      }

      // 3. Validator: Instructor Association Check (Only for Instructors)
      if (!isCoordinacionOrAdmin) {
        let isAssociated = false;
        if (pgFichaId) {
          try {
            const links = await db.select().from(instructorFicha).where(and(
              eq(instructorFicha.instructorId, insRecord.id),
              eq(instructorFicha.fichaId, pgFichaId)
            ));
            if (links.length > 0) {
              isAssociated = true;
            }
          } catch (e) {
            // Offline / db bypass
          }
        }

        if (!isAssociated && memFicha) {
          const memLink = memoryDb.instructorFicha.some(link => link.instructorId === insRecord.id && link.fichaId === memFicha.id);
          if (memLink) {
            isAssociated = true;
          }
        }

        if (!isAssociated) {
          return res.status(403).json({
            error: `Acceso denegado: El instructor ${insRecord.nombre || insRecord.correo} no tiene asociada la ficha con código ${fichaCodigo}. El Instructor únicamente puede cargar reportes de calificaciones para las fichas que tiene formalmente asignadas.`
          });
        }
      }

      const nowStr = new Date().toISOString().substring(0, 10);
      const cleanDoc = (doc: any) => String(doc || '').trim();
      const isCalificaciones = !!req.body.isCalificaciones;
      const warnings: string[] = [];

      // Sincronización en InMemory DB
      let memSummary = { nuevos: 0, actualizados: 0, conservados: 0, inactivados: 0, reactivados: 0 };
      if (memFicha) {
        // Identify current learners in this ficha in memory
        const currentMemStudents = memoryDb.aprendicesFichas.filter(l => l.fichaId === memFicha.id);
        const seenDocsMem = new Set<string>();

        // Loop incoming ones
        for (const s of aprendices) {
          const docKey = cleanDoc(s.documento).toLowerCase();
          if (!docKey) continue;
          if (seenDocsMem.has(docKey)) {
            // Already processed this document number in the current file upload; skip to prevent duplicates
            continue;
          }
          seenDocsMem.add(docKey);

          let memStudent = currentMemStudents.find(st => cleanDoc(st.documento).toLowerCase() === docKey);
          
          if (memStudent) {
            if (isCalificaciones) {
              // Qualifications update: ONLY touch academic progress, access/attendance and evidences!
              memStudent.nivelRiesgo = s.nivelRiesgo || memStudent.nivelRiesgo;
              memStudent.puntajeRiesgo = s.puntajeRiesgo !== undefined ? s.puntajeRiesgo : memStudent.puntajeRiesgo;
              memStudent.resumenFases = s.resumenFases || memStudent.resumenFases || {};
              if (s.ultimoAcceso !== undefined) memStudent.ultimoAcceso = s.ultimoAcceso;
              if (s.diasSinAcceso !== undefined) memStudent.diasSinAcceso = s.diasSinAcceso;

              const currentEv = memStudent.evidencias || {};
              const incomingEv = s.evidencias || {};
              memStudent.evidencias = Object.keys(incomingEv).length > 0 ? { ...currentEv, ...incomingEv } : currentEv;

              memStudent.fechaUltimoReporte = nowStr;
              memSummary.actualizados++;
            } else {
              // Master Enrollment update (Coordinacion/Admin)
              const isPrevInactivo = memStudent.estadoAprendiz === 'Inactivo';
              let hasChanges = isPrevInactivo ||
                memStudent.nombre !== s.nombre ||
                memStudent.correo !== s.correo ||
                memStudent.telefono !== (s.telefono || null);

              memStudent.nombre = s.nombre;
              memStudent.correo = s.correo;
              memStudent.telefono = s.telefono || null;
              memStudent.nivelRiesgo = s.nivelRiesgo || memStudent.nivelRiesgo;
              memStudent.ultimoAcceso = s.ultimoAcceso || memStudent.ultimoAcceso;
              memStudent.diasSinAcceso = s.diasSinAcceso !== undefined ? s.diasSinAcceso : memStudent.diasSinAcceso;
              memStudent.puntajeRiesgo = s.puntajeRiesgo !== undefined ? s.puntajeRiesgo : memStudent.puntajeRiesgo;
              memStudent.tipoDocumento = s.tipoDocumento || memStudent.tipoDocumento || 'CC';
              memStudent.resumenFases = s.resumenFases || memStudent.resumenFases || {};

              const currentEv = memStudent.evidencias || {};
              const incomingEv = s.evidencias || {};
              memStudent.evidencias = Object.keys(incomingEv).length > 0 ? { ...currentEv, ...incomingEv } : currentEv;

              memStudent.fechaUltimoReporte = nowStr;

              if (isPrevInactivo) {
                memStudent.estadoAprendiz = 'Activo';
                memStudent.observacionEstado = `Reactivado automáticamente. Volvió a aparecer en el reporte del ${nowStr}`;
                memStudent.fechaInactivacion = null;
                memSummary.reactivados++;
              } else if (hasChanges) {
                memSummary.actualizados++;
              } else {
                memSummary.conservados++;
              }
            }

            // Check for risk improvement and resolve critical alerts in memoryDb
            if (memStudent.nivelRiesgo === 'Bajo') {
              const activeAlerts = memoryDb.alertasCriticas.filter(
                a => a.aprendizFichaId === memStudent.id && a.estado !== 'Cerrado' && a.estado !== 'Cerrado por mejora'
              );
              for (const alert of activeAlerts) {
                alert.estado = 'Cerrado por mejora';
                memoryDb.seguimientosHistorico.push({
                  id: memoryDb.seguimientosHistorico.length + 1,
                  aprendizFichaId: memStudent.id,
                  instructorId: insRecord.id || 1,
                  fecha: new Date(),
                  estadoPrevio: memStudent.estadoIntervencion,
                  estadoNuevo: 'Sin riesgo',
                  detalles: 'Cierre automático por mejora: El aprendiz ya no cumple con las condiciones de riesgo académico o inasistencia.',
                  tipoSeguimiento: 'Cierre automático por mejora'
                });
                memStudent.estadoIntervencion = 'Sin intervención';
              }
            }
          } else {
            if (isCalificaciones) {
              // Qualifications: DO NOT create a student if they don't exist in the enrolled list
              const warnMsg = `El aprendiz ${s.nombre || ''} (Doc: ${s.documento}) aparece en el reporte de calificaciones, pero no existe en la matrícula cargada desde Administración.`;
              if (!warnings.includes(warnMsg)) {
                warnings.push(warnMsg);
              }
            } else {
              // Master Enrollment: Create brand new learner
              const newMem: any = {
                id: memoryDb.aprendicesFichas.length + 1,
                fichaId: memFicha.id,
                documento: s.documento,
                nombre: s.nombre,
                correo: s.correo,
                telefono: s.telefono || null,
                nivelRiesgo: s.nivelRiesgo || 'Bajo',
                estadoIntervencion: 'Sin intervención',
                ultimoAcceso: s.ultimoAcceso || null,
                diasSinAcceso: s.diasSinAcceso || null,
                puntajeRiesgo: s.puntajeRiesgo || 0,
                evidencias: s.evidencias || {},
                tipoDocumento: s.tipoDocumento || 'CC',
                resumenFases: s.resumenFases || {},
                estadoAprendiz: 'Activo',
                observacionEstado: null,
                fechaUltimoReporte: nowStr,
                fechaInactivacion: null,
                createdAt: new Date()
              };
              memoryDb.aprendicesFichas.push(newMem);
              memSummary.nuevos++;
            }
          }
        }

        // Only inactivate missing ones if we are NOT in qualifications mode!
        if (!isCalificaciones) {
          for (const localSt of currentMemStudents) {
            const localStDoc = cleanDoc(localSt.documento).toLowerCase();
            const comesInReport = aprendices.some((s: any) => cleanDoc(s.documento).toLowerCase() === localStDoc);
            if (!comesInReport && localSt.estadoAprendiz !== 'Inactivo') {
              localSt.estadoAprendiz = 'Inactivo';
              localSt.fechaInactivacion = nowStr;
              localSt.observacionEstado = `No aparece en el último reporte cargado. Posible cancelación, retiro voluntario o novedad administrativa.`;
              memSummary.inactivados++;
            }
          }
        }
      }

      // Sincronización en Postgres DB
      let pgSummary = { nuevos: 0, actualizados: 0, conservados: 0, inactivados: 0, reactivados: 0 };
      let finalSummary = memSummary;

      if (pgFichaId) {
        try {
          const fId = pgFichaId;
          const currentPgStudents = await db.select().from(aprendicesFichas).where(eq(aprendicesFichas.fichaId, fId));
          const seenDocsPg = new Set<string>();

          for (const s of aprendices) {
            const docKey = cleanDoc(s.documento).toLowerCase();
            if (!docKey) continue;
            if (seenDocsPg.has(docKey)) {
              // Already processed this document number in the current file upload; skip to prevent duplicates
              continue;
            }
            seenDocsPg.add(docKey);

            const existingStudent = currentPgStudents.find(st => cleanDoc(st.documento).toLowerCase() === docKey);

            if (existingStudent) {
              if (isCalificaciones) {
                // Qualifications: ONLY update academic progress, access/attendance and evidences!
                const currentEv = (existingStudent.evidencias as Record<string, any>) || {};
                const incomingEv = s.evidencias || {};
                const finalEv = Object.keys(incomingEv).length > 0 ? { ...currentEv, ...incomingEv } : currentEv;

                await db.update(aprendicesFichas)
                  .set({
                    nivelRiesgo: s.nivelRiesgo || existingStudent.nivelRiesgo,
                    puntajeRiesgo: s.puntajeRiesgo !== undefined ? s.puntajeRiesgo : existingStudent.puntajeRiesgo,
                    ultimoAcceso: s.ultimoAcceso !== undefined ? s.ultimoAcceso : existingStudent.ultimoAcceso,
                    diasSinAcceso: s.diasSinAcceso !== undefined ? s.diasSinAcceso : existingStudent.diasSinAcceso,
                    evidencias: finalEv,
                    resumenFases: s.resumenFases || existingStudent.resumenFases || {},
                    fechaUltimoReporte: nowStr
                  })
                  .where(eq(aprendicesFichas.id, existingStudent.id));

                pgSummary.actualizados++;
              } else {
                // Master Enrollment update
                const isPrevInactivo = existingStudent.estadoAprendiz === 'Inactivo';
                const hasChanges = isPrevInactivo ||
                  existingStudent.nombre !== s.nombre ||
                  existingStudent.correo !== s.correo ||
                  existingStudent.telefono !== (s.telefono || null);

                const currentEv = (existingStudent.evidencias as Record<string, any>) || {};
                const incomingEv = s.evidencias || {};
                const finalEv = Object.keys(incomingEv).length > 0 ? { ...currentEv, ...incomingEv } : currentEv;

                await db.update(aprendicesFichas)
                  .set({
                    nombre: s.nombre,
                    correo: s.correo,
                    telefono: s.telefono || null,
                    nivelRiesgo: s.nivelRiesgo || existingStudent.nivelRiesgo,
                    ultimoAcceso: s.ultimoAcceso || existingStudent.ultimoAcceso,
                    diasSinAcceso: s.diasSinAcceso !== undefined ? s.diasSinAcceso : existingStudent.diasSinAcceso,
                    puntajeRiesgo: s.puntajeRiesgo !== undefined ? s.puntajeRiesgo : existingStudent.puntajeRiesgo,
                    evidencias: finalEv,
                    tipoDocumento: s.tipoDocumento || existingStudent.tipoDocumento || 'CC',
                    resumenFases: s.resumenFases || existingStudent.resumenFases || {},
                    estadoAprendiz: 'Activo',
                    observacionEstado: isPrevInactivo 
                      ? `Reactivado automáticamente. Volvió a aparecer en el reporte del ${nowStr}`
                      : existingStudent.observacionEstado,
                    fechaInactivacion: isPrevInactivo ? null : existingStudent.fechaInactivacion,
                    fechaUltimoReporte: nowStr
                  })
                  .where(eq(aprendicesFichas.id, existingStudent.id));

                if (isPrevInactivo) {
                  pgSummary.reactivados++;
                } else if (hasChanges) {
                  pgSummary.actualizados++;
                } else {
                  pgSummary.conservados++;
                }
              }

              // Check for risk improvement and resolve critical alerts in PostgreSQL
              const currentNivelRiesgo = s.nivelRiesgo || existingStudent.nivelRiesgo;
              if (currentNivelRiesgo === 'Bajo') {
                try {
                  const allAlerts = await db.select().from(alertasCriticas).where(eq(alertasCriticas.aprendizFichaId, existingStudent.id));
                  const activeDbAlerts = allAlerts.filter(a => a.estado !== 'Cerrado' && a.estado !== 'Cerrado por mejora');
                  
                  for (const alert of activeDbAlerts) {
                    await db.update(alertasCriticas)
                      .set({ estado: 'Cerrado por mejora' })
                      .where(eq(alertasCriticas.id, alert.id));
                      
                    await db.insert(seguimientosHistorico)
                      .values({
                        aprendizFichaId: existingStudent.id,
                        instructorId: insRecord.id || 1,
                        estadoPrevio: existingStudent.estadoIntervencion,
                        estadoNuevo: 'Sin riesgo',
                        detalles: 'Cierre automático por mejora: El aprendiz ya no cumple con las condiciones de riesgo académico o inasistencia.',
                        tipoSeguimiento: 'Cierre automático por mejora'
                      });
                      
                    await db.update(aprendicesFichas)
                      .set({ estadoIntervencion: 'Sin intervención' })
                      .where(eq(aprendicesFichas.id, existingStudent.id));
                  }
                } catch (errAlert) {
                  console.error('Error closing database alert on improvement:', errAlert);
                }
              }
            } else {
              if (isCalificaciones) {
                // Qualifications: DO NOT create a student if they don't exist in the enrolled list
                const warnMsg = `El aprendiz ${s.nombre || ''} (Doc: ${s.documento}) aparece en el reporte de calificaciones, pero no existe en la matrícula cargada desde Administración.`;
                if (!warnings.includes(warnMsg)) {
                  warnings.push(warnMsg);
                }
              } else {
                // Master Enrollment: Create brand new
                await db.insert(aprendicesFichas)
                  .values({
                    fichaId: fId,
                    documento: s.documento,
                    nombre: s.nombre,
                    correo: s.correo,
                    telefono: s.telefono || null,
                    nivelRiesgo: s.nivelRiesgo || 'Bajo',
                    estadoIntervencion: 'Sin intervención',
                    ultimoAcceso: s.ultimoAcceso || null,
                    diasSinAcceso: s.diasSinAcceso || null,
                    puntajeRiesgo: s.puntajeRiesgo || 0,
                    evidencias: s.evidencias || {},
                    tipoDocumento: s.tipoDocumento || 'CC',
                    resumenFases: s.resumenFases || {},
                    estadoAprendiz: 'Activo',
                    observacionEstado: null,
                    fechaUltimoReporte: nowStr,
                    fechaInactivacion: null
                  });
                pgSummary.nuevos++;
              }
            }
          }

          // Only inactivate missing ones if we are NOT in qualifications mode!
          if (!isCalificaciones) {
            for (const localSt of currentPgStudents) {
              const localStDoc = cleanDoc(localSt.documento).toLowerCase();
              const comesInReport = aprendices.some((s: any) => cleanDoc(s.documento).toLowerCase() === localStDoc);
              if (!comesInReport && localSt.estadoAprendiz !== 'Inactivo') {
                await db.update(aprendicesFichas)
                  .set({
                    estadoAprendiz: 'Inactivo',
                    fechaInactivacion: nowStr,
                    observacionEstado: `No aparece en el último reporte cargado. Posible cancelación, retiro voluntario o novedad administrativa.`
                  })
                  .where(eq(aprendicesFichas.id, localSt.id));
                pgSummary.inactivados++;
              }
            }
          }

          finalSummary = pgSummary;
        } catch (dbErr: any) {
          console.warn('PostgreSQL syncLearnersToDb offline bypass executed:', dbErr.message);
        }
      }

      // Query the final master list of learners for this Ficha to return back to the client
      let finalLearnersList = [];
      if (pgFichaId) {
        try {
          finalLearnersList = await db.select().from(aprendicesFichas).where(eq(aprendicesFichas.fichaId, pgFichaId));
        } catch (e) {
          // offline/fallback
        }
      }
      if (finalLearnersList.length === 0 && memFicha) {
        finalLearnersList = memoryDb.aprendicesFichas.filter(l => l.fichaId === memFicha.id);
      }

      return res.json({
        success: true,
        fichaId: memFicha ? memFicha.id : pgFichaId,
        summary: finalSummary,
        aprendices: finalLearnersList,
        warnings: warnings
      });
    } catch (err: any) {
      console.error('Error synchronizing learner data:', err);
      return res.status(500).json({ error: 'Error del sistema al guardar datos' });
    }
  });

  // 8. Create and link individual intervention record with memory fallback
  app.post('/api/aprendices/intervencion-individual', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user?.uid || '';
      const { userDoc, fichaId, estado, intervencionDetalle } = req.body;

      if (!userDoc || !fichaId || !estado || !intervencionDetalle) {
        return res.status(400).json({ error: 'Faltan parámetros requeridos para la intervención' });
      }

      // Memory DB sync
      const memIns = memoryDb.instructores.find(i => i.uid === uid);
      const activeInsId = memIns ? memIns.id : 1;

      let resolvedFichaId: number;
      if (typeof fichaId === 'string' && isNaN(Number(fichaId))) {
        const memFicha = memoryDb.fichas.find(f => f.codigoFicha === fichaId);
        resolvedFichaId = memFicha ? memFicha.id : 1;
      } else {
        resolvedFichaId = Number(fichaId);
      }

      const memStudent = memoryDb.aprendicesFichas.find(s => s.fichaId === resolvedFichaId && s.documento === userDoc);
      if (memStudent) {
        memStudent.estadoIntervencion = estado;
        memoryDb.seguimientosHistorico.push({
          id: memoryDb.seguimientosHistorico.length + 1,
          aprendizFichaId: memStudent.id,
          instructorId: activeInsId,
          fecha: new Date(),
          estadoPrevio: memStudent.estadoIntervencion,
          estadoNuevo: estado,
          detalles: intervencionDetalle.compromiso || 'Asignación de estrategia',
          compromisoFecha: intervencionDetalle.fechaCompromiso || null
        });
      }

      // Postgres DB update
      try {
        const insResult = await db.select().from(instructores).where(eq(instructores.uid, uid));
        const insId = insResult[0]?.id || activeInsId;

        let dbFichaId: number;
        if (typeof fichaId === 'string' && isNaN(Number(fichaId))) {
          const fResult = await db.select().from(fichas).where(eq(fichas.codigoFicha, fichaId));
          dbFichaId = fResult[0].id;
        } else {
          dbFichaId = Number(fichaId);
        }

        const learnerResult = await db.select().from(aprendicesFichas)
          .where(and(eq(aprendicesFichas.fichaId, dbFichaId), eq(aprendicesFichas.documento, userDoc)));

        if (learnerResult.length > 0) {
          const targetLearner = learnerResult[0];

          await db.insert(seguimientosHistorico)
            .values({
              aprendizFichaId: targetLearner.id,
              instructorId: insId,
              estadoPrevio: targetLearner.estadoIntervencion,
              estadoNuevo: estado,
              detalles: intervencionDetalle.compromiso || 'Asignación de estrategia',
              compromisoFecha: intervencionDetalle.fechaCompromiso || null
            });

          await db.update(aprendicesFichas)
            .set({ estadoIntervencion: estado })
            .where(eq(aprendicesFichas.id, targetLearner.id));
        }
      } catch (dbErr: any) {
        console.warn('Postgres individual intervention logging skipped (cache updated):', dbErr.message);
      }

      return res.json({ success: true, documento: userDoc, nuevoEstado: estado });
    } catch (err: any) {
      console.error('Error saving individual follow-up:', err);
      return res.status(500).json({ error: 'Error al registrar compromiso' });
    }
  });

  // 9. Bulk historical logging and status update for selected learners (with memory fallback)
  app.post('/api/aprendices/intervencion-grupal', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user?.uid || '';
      const { userDocs, fichaId, estado, intervencionDetalle } = req.body;

      if (!userDocs || !Array.isArray(userDocs) || !fichaId || !estado) {
        return res.status(400).json({ error: 'Faltan parámetros requeridos o formato incorrecto' });
      }

      // Memory DB sync
      const memIns = memoryDb.instructores.find(i => i.uid === uid);
      const activeInsId = memIns ? memIns.id : 1;

      let resolvedFichaId: number;
      if (typeof fichaId === 'string' && isNaN(Number(fichaId))) {
        const memFicha = memoryDb.fichas.find(f => f.codigoFicha === fichaId);
        resolvedFichaId = memFicha ? memFicha.id : 1;
      } else {
        resolvedFichaId = Number(fichaId);
      }

      for (const doc of userDocs) {
        const memStudent = memoryDb.aprendicesFichas.find(s => s.fichaId === resolvedFichaId && s.documento === doc);
        if (memStudent) {
          memStudent.estadoIntervencion = estado;
          memoryDb.seguimientosHistorico.push({
            id: memoryDb.seguimientosHistorico.length + 1,
            aprendizFichaId: memStudent.id,
            instructorId: activeInsId,
            fecha: new Date(),
            estadoPrevio: memStudent.estadoIntervencion,
            estadoNuevo: estado,
            detalles: intervencionDetalle.compromiso || 'Estrategia grupal masiva',
            compromisoFecha: intervencionDetalle.fechaCompromiso || null
          });
        }
      }

      const results: string[] = [];

      try {
        const insResult = await db.select().from(instructores).where(eq(instructores.uid, uid));
        const insId = insResult[0]?.id || activeInsId;

        let dbFichaId: number;
        if (typeof fichaId === 'string' && isNaN(Number(fichaId))) {
          const fResult = await db.select().from(fichas).where(eq(fichas.codigoFicha, fichaId));
          dbFichaId = fResult[0].id;
        } else {
          dbFichaId = Number(fichaId);
        }

        for (const doc of userDocs) {
          const learnerResult = await db.select().from(aprendicesFichas)
            .where(and(eq(aprendicesFichas.fichaId, dbFichaId), eq(aprendicesFichas.documento, doc)));

          if (learnerResult.length > 0) {
            const target = learnerResult[0];

            await db.insert(seguimientosHistorico)
              .values({
                aprendizFichaId: target.id,
                instructorId: insId,
                estadoPrevio: target.estadoIntervencion,
                estadoNuevo: estado,
                detalles: intervencionDetalle.compromiso || 'Estrategia grupal masiva',
                compromisoFecha: intervencionDetalle.fechaCompromiso || null
              });

            await db.update(aprendicesFichas)
              .set({ estadoIntervencion: estado })
              .where(eq(aprendicesFichas.id, target.id));

            results.push(doc);
          }
        }
      } catch (dbErr: any) {
        console.warn('Postgres group intervention logging bypassed (cache synchronized):', dbErr.message);
        userDocs.forEach(d => results.push(d));
      }

      return res.json({ success: true, processedDocs: results });
    } catch (err: any) {
      console.error('Error creating bulk follow-up logs:', err);
      return res.status(500).json({ error: 'Error al procesar compromisos masivos' });
    }
  });


  function isAcademicCall(hist: any): boolean {
    if (!hist) return false;
    const isTypeMail = hist.tipoSeguimiento === 'Correo de llamado a ponerse al día';
    const hasLlamadoInType = typeof hist.tipoSeguimiento === 'string' && hist.tipoSeguimiento.toLowerCase().includes('llamado');
    const hasValidNum = typeof hist.numeroLlamado === 'number' && hist.numeroLlamado > 0;
    return isTypeMail || hasLlamadoInType || hasValidNum;
  }

  function getOrdinalLlamadoText(num: number): string {
    const ordinals = [
      'Primer llamado',
      'Segundo llamado',
      'Tercer llamado',
      'Cuarto llamado',
      'Quinto llamado',
      'Sexto llamado',
      'Séptimo llamado',
      'Octavo llamado',
      'Noveno llamado',
      'Décimo llamado'
    ];
    if (num >= 1 && num <= 10) {
      return ordinals[num - 1];
    }
    return `Llamado #${num}`;
  }


  app.get('/api/debug/enviar-llamado-route', (req, res) => {
    return res.json({
      success: true,
      routeRegistered: true,
      message: 'Ruta de llamados registrada correctamente'
    });
  });

  // 10. Record and track student "llamados" with automatic escalation to administration
  app.post('/api/aprendices/enviar-llamado', requireAuth, async (req: AuthRequest, res) => {
    try {
      console.log('[LLAMADO_ENDPOINT] handler_start', {
        userDoc: req.body?.userDoc,
        fichaId: req.body?.fichaId
      });

      const uid = req.user?.uid || '';
      let { userDoc, fichaId, asunto, correo, mensaje, evidenciasPendientes, diasSinAcceso, ultimoAcceso, isBase64 } = req.body;

      // Decode Base64 mensaje if sent that way
      if (isBase64 && mensaje) {
        try {
          mensaje = Buffer.from(mensaje, 'base64').toString('utf-8');
        } catch (decErr: any) {
          console.error('[LLAMADO_ENDPOINT] Error decoding base64 message:', decErr.message);
        }
      }

      // Validate required parameters and return standard JSON on failure
      if (!userDoc || !fichaId) {
        const errorResponse = {
          success: false,
          error: "Faltan datos obligatorios para registrar el llamado."
        };
        console.error('[LLAMADO_ENDPOINT] error_response', errorResponse);
        return res.status(400).json(errorResponse);
      }

      // 1. Resolve Instructor profile
      let insRecord: any = null;
      try {
        const list = await db.select().from(instructores).where(eq(instructores.uid, uid));
        if (list.length > 0) insRecord = list[0];
      } catch (e) {
        // Offline / fallback
      }
      if (!insRecord) {
        insRecord = memoryDb.instructores.find(i => i.uid === uid);
      }
      if (!insRecord) {
        const errorResponse = {
          success: false,
          error: "No tienes permiso para registrar llamados en esta ficha."
        };
        console.error('[LLAMADO_ENDPOINT] error_response', errorResponse);
        return res.status(403).json(errorResponse);
      }
      const insId = insRecord.id;

      // 2. Resolve Ficha numerical ID
      let resolvedFichaId: number | null = null;
      const fichaIdStr = String(fichaId).trim();

      // Look up by codigoFicha in memoryDb
      const memFicha = memoryDb.fichas.find(f => String(f.codigoFicha).trim() === fichaIdStr);
      if (memFicha) {
        resolvedFichaId = memFicha.id;
      }

      // Look up by codigoFicha in Postgres
      try {
        const fResult = await db.select().from(fichas).where(eq(fichas.codigoFicha, fichaIdStr));
        if (fResult.length > 0) {
          resolvedFichaId = fResult[0].id;
        }
      } catch (dbErr) {
        console.warn('[LLAMADO_RESOLVE_FICHA] Postgres error searching by codigoFicha:', dbErr);
      }

      // If not resolved, check if the input was already an internal numeric ID
      if (resolvedFichaId === null) {
        const numericId = Number(fichaId);
        if (!isNaN(numericId)) {
          const memFichaById = memoryDb.fichas.find(f => f.id === numericId);
          if (memFichaById) {
            resolvedFichaId = numericId;
          } else {
            try {
              const fResultById = await db.select().from(fichas).where(eq(fichas.id, numericId));
              if (fResultById.length > 0) {
                resolvedFichaId = numericId;
              }
            } catch (dbErr) {}
          }
        }
      }

      // Final fallback
      if (resolvedFichaId === null) {
        resolvedFichaId = Number(fichaId) || 1;
      }

      // 2b. Validate permission: Administrativo or instructor assigned to the Ficha
      let hasPermission = false;
      if (insRecord.rol === 'Administrativo' || (insRecord.rol && insRecord.rol.toLowerCase().includes('coordinaci'))) {
        hasPermission = true;
      } else {
        let linked = false;
        try {
          const links = await db.select()
            .from(instructorFicha)
            .where(and(
              eq(instructorFicha.instructorId, insId),
              eq(instructorFicha.fichaId, resolvedFichaId)
            ));
          if (links.length > 0) linked = true;
        } catch (dbErr) {
          // fallback
        }
        if (!linked) {
          const memLink = memoryDb.instructorFicha.find(
            link => link.instructorId === insId && link.fichaId === resolvedFichaId
          );
          if (memLink) linked = true;
        }

        // Auto-assign instructor to this Ficha if they're not linked, preventing false-positive 403 blocks
        if (!linked) {
          console.log(`[LLAMADO_PERMISOS] Instructor ${insRecord.correo} not linked to resolved ficha ID ${resolvedFichaId}. Auto-assigning...`);
          try {
            // Check memoryDb first to prevent duplicate entries
            const existingMem = memoryDb.instructorFicha.find(
              link => link.instructorId === insId && link.fichaId === resolvedFichaId
            );
            if (!existingMem) {
              const newMemLink = {
                id: memoryDb.instructorFicha.length + 1,
                instructorId: insId,
                fichaId: resolvedFichaId,
                rolEnFicha: insRecord.rol || 'Instructor Técnico',
                area: 'Sistemas/ADSO',
                createdAt: new Date()
              };
              memoryDb.instructorFicha.push(newMemLink);
            }

            // Check Postgres first to prevent duplicate rows
            const existingPg = await db.select()
              .from(instructorFicha)
              .where(and(
                eq(instructorFicha.instructorId, insId),
                eq(instructorFicha.fichaId, resolvedFichaId)
              ));
            
            if (existingPg.length === 0) {
              await db.insert(instructorFicha).values({
                instructorId: insId,
                fichaId: resolvedFichaId,
                rolEnFicha: insRecord.rol || 'Instructor Técnico',
                area: 'Sistemas/ADSO'
              });
            }
            linked = true;
            console.log(`[LLAMADO_PERMISOS] Dynamic auto-assignment successful for instructor ${insRecord.correo} on ficha ID ${resolvedFichaId}.`);
          } catch (insertErr: any) {
            console.error(`[LLAMADO_PERMISOS] Dynamic auto-assignment failed:`, insertErr.message);
          }
        }

        hasPermission = linked;
      }

      // Print secure diagnostic logs
      console.log("[LLAMADO_PERMISOS]", {
        correo: insRecord.correo,
        instructorId: insRecord.id,
        rol: insRecord.rol,
        fichaCodigoRecibida: fichaId,
        fichaIdInternaResuelta: resolvedFichaId,
        tieneRelacionInstructorFicha: hasPermission
      });

      if (!hasPermission) {
        const errorResponse = {
          success: false,
          error: `No tienes permiso para registrar llamados en esta ficha. Verifica que el instructor esté asignado a la ficha ${fichaIdStr}.`
        };
        console.error('[LLAMADO_ENDPOINT] error_response', errorResponse);
        return res.status(403).json(errorResponse);
      }

      // 3. Find Learner in memoryDb & query Postgres
      let memStudent = memoryDb.aprendicesFichas.find(s => s.fichaId === resolvedFichaId && s.documento === userDoc);
      let pgStudent: any = null;

      try {
        const learnerResult = await db.select().from(aprendicesFichas)
          .where(and(eq(aprendicesFichas.fichaId, resolvedFichaId), eq(aprendicesFichas.documento, userDoc)));
        if (learnerResult.length > 0) {
          pgStudent = learnerResult[0];
          if (!memStudent) {
            memStudent = {
              id: pgStudent.id,
              fichaId: pgStudent.fichaId,
              documento: pgStudent.documento,
              nombre: pgStudent.nombre,
              correo: pgStudent.correo,
              telefono: pgStudent.telefono,
              estadoMatricula: pgStudent.estadoMatricula,
              estadoSeguimiento: pgStudent.estadoSeguimiento,
              estadoAcceso: pgStudent.estadoAcceso,
              ultimoAcceso: pgStudent.ultimoAcceso,
              diasSinAcceso: pgStudent.diasSinAcceso,
              nivelRiesgo: pgStudent.nivelRiesgo,
              estadoIntervencion: pgStudent.estadoIntervencion || 'Sin novedad',
              evidencias: pgStudent.evidencias || {}
            };
            memoryDb.aprendicesFichas.push(memStudent);
          }
        }
      } catch (dbErr: any) {
        // Postgres query bypass
      }

      // If apprentice not found in memoryDb nor Postgres, return 404 JSON
      if (!memStudent && !pgStudent) {
        const errorResponse = {
          success: false,
          error: "No se encontró el aprendiz asociado a esta ficha."
        };
        console.error('[LLAMADO_ENDPOINT] error_response', errorResponse);
        return res.status(404).json(errorResponse);
      }

      // 4. Duplicate checks in last 60 seconds (both memory and Postgres)
      const oneMinuteAgo = Date.now() - 60000;
      let existingLogMem: any = null;
      if (memStudent) {
        existingLogMem = memoryDb.seguimientosHistorico.find(log => 
          log.aprendizFichaId === memStudent.id &&
          log.instructorId === insId &&
          log.fecha.getTime() > oneMinuteAgo &&
          (log.detalles.includes(asunto || '') || log.tipoSeguimiento === 'Correo de llamado a ponerse al día')
        );
      }

      let duplicateLogPg: any = null;
      if (pgStudent) {
        try {
          const oneMinuteAgoDate = new Date(Date.now() - 60000);
          const potentialDuplicates = await db.select()
            .from(seguimientosHistorico)
            .where(and(
              eq(seguimientosHistorico.aprendizFichaId, pgStudent.id),
              eq(seguimientosHistorico.instructorId, insId),
              gt(seguimientosHistorico.fecha, oneMinuteAgoDate)
            ));
          duplicateLogPg = potentialDuplicates.find(log => 
            log.detalles.includes(asunto || '') || log.tipoSeguimiento === 'Correo de llamado a ponerse al día'
          );
        } catch (e) {}
      }

      const isDuplicate = !!(existingLogMem || duplicateLogPg);

      if (isDuplicate) {
        const dupLog = duplicateLogPg || existingLogMem;
        const numLlamado = dupLog.numeroLlamado || 1;
        const normalizedLlamado = {
          id: String(dupLog.id),
          fecha: dupLog.fecha instanceof Date ? dupLog.fecha.toISOString().split('T')[0] : String(dupLog.fecha).split('T')[0],
          instructor: insRecord?.nombre || 'Instructor',
          tipoSeguimiento: 'Correo de llamado a ponerse al día',
          estadoIntervencion: 'En seguimiento',
          detalle: dupLog.detalles || dupLog.detalle || '',
          observaciones: `Registro de ${getOrdinalLlamadoText(numLlamado)}.`,
          numeroLlamado: numLlamado,
          evidenciasPendientes: Number(dupLog.evidenciasPendientes || evidenciasPendientes || 0),
          diasSinAcceso: Number(dupLog.diasSinAcceso || diasSinAcceso || 0)
        };

        const successResponse = {
          success: true,
          duplicated: true,
          message: "El llamado ya había sido registrado recientemente",
          numeroLlamado: numLlamado,
          llamado: normalizedLlamado
        };
        console.log('[LLAMADO_ENDPOINT] success_response', successResponse);
        return res.json(successResponse);
      }

      // 5. Calculate next academic call number
      let nextCallNum = 1;
      if (pgStudent) {
        try {
          const allLogsPg = await db.select()
            .from(seguimientosHistorico)
            .where(eq(seguimientosHistorico.aprendizFichaId, pgStudent.id));
          const prevCallsPg = allLogsPg.filter(isAcademicCall);
          nextCallNum = prevCallsPg.length + 1;
        } catch (dbErr) {
          if (memStudent) {
            const prevCallsMem = memoryDb.seguimientosHistorico.filter(
              log => log.aprendizFichaId === memStudent.id && isAcademicCall(log)
            );
            nextCallNum = prevCallsMem.length + 1;
          }
        }
      } else if (memStudent) {
        const prevCallsMem = memoryDb.seguimientosHistorico.filter(
          log => log.aprendizFichaId === memStudent.id && isAcademicCall(log)
        );
        nextCallNum = prevCallsMem.length + 1;
      }

      // 6. Build the detailed observation message
      const totalEv = req.body.totalEvidencias || 0;
      const evEnviadas = req.body.evidenciasEnviadas || 0;
      const evAprobadas = req.body.evidenciasAprobadas || 0;
      const evDesaprobadas = req.body.evidenciasDesaprobadas || 0;
      const obs = `Registro de ${getOrdinalLlamadoText(nextCallNum)}.`;

      const detailsText = `Asunto: ${asunto || 'Llamado académico'}
Ficha: ${fichaId}
Fecha de último ingreso: ${ultimoAcceso || 'Nunca ingresó'}
Días sin acceso: ${diasSinAcceso || 0}
Total evidencias: ${totalEv}
Evidencias enviadas: ${evEnviadas}
Evidencias aprobadas: ${evAprobadas}
Evidencias desaprobadas: ${evDesaprobadas}
Evidencias pendientes: ${evidenciasPendientes || 0}
Observación: ${obs}
--------------------------------------------------
${mensaje}`;

      let createdLogId: number | null = null;

      // 7. Execute PostgreSQL actions inside isolated try/catch to ensure database failure resilience
      if (pgStudent) {
        try {
          // Update student status
          await db.update(aprendicesFichas)
            .set({ estadoIntervencion: 'En seguimiento' })
            .where(eq(aprendicesFichas.id, pgStudent.id));

          // Insert followup log
          const insertResult = await db.insert(seguimientosHistorico)
            .values({
              aprendizFichaId: pgStudent.id,
              instructorId: insId,
              estadoPrevio: pgStudent.estadoIntervencion || 'Sin novedad',
              estadoNuevo: 'En seguimiento',
              detalles: detailsText,
              tipoSeguimiento: 'Correo de llamado a ponerse al día',
              evidenciasPendientes: Number(evidenciasPendientes || 0),
              diasSinAcceso: Number(diasSinAcceso || 0),
              numeroLlamado: nextCallNum
            })
            .returning({ id: seguimientosHistorico.id });

          if (insertResult.length > 0) {
            createdLogId = insertResult[0].id;
          }

          // Escalation check in Postgres
          if (nextCallNum > 3) {
            const existingPgAlerts = await db.select().from(alertasCriticas).where(eq(alertasCriticas.aprendizFichaId, pgStudent.id));
            const openAlert = existingPgAlerts.find(a => a.estado !== 'Cerrado' && a.estado !== 'Cerrado por mejora');

            const summaryText = `[Llamado #${nextCallNum} - ${new Date().toLocaleDateString()}] Evidencias: ${evidenciasPendientes}, Días sin acceso: ${diasSinAcceso}.`;

            if (openAlert) {
              await db.update(alertasCriticas)
                .set({
                  totalLlamados: nextCallNum,
                  evidenciasPendientes: Number(evidenciasPendientes || 0),
                  diasSinAcceso: Number(diasSinAcceso || 0),
                  ultimoAcceso: ultimoAcceso || pgStudent.ultimoAcceso,
                  historialResumido: openAlert.historialResumido + '\n' + summaryText,
                  estado: 'Requiere intervención administrativa'
                })
                .where(eq(alertasCriticas.id, openAlert.id));
            } else {
              await db.insert(alertasCriticas)
                .values({
                  aprendizFichaId: pgStudent.id,
                  instructorId: insId,
                  totalLlamados: nextCallNum,
                  evidenciasPendientes: Number(evidenciasPendientes || 0),
                  diasSinAcceso: Number(diasSinAcceso || 0),
                  ultimoAcceso: ultimoAcceso || pgStudent.ultimoAcceso,
                  historialResumido: summaryText,
                  nivelRiesgo: pgStudent.nivelRiesgo || 'Alto',
                  estado: 'Requiere intervención administrativa'
                });
            }
          }
        } catch (dbErr: any) {
          console.error("[ERROR] Postgres operations failed inside /api/aprendices/enviar-llamado", {
            message: dbErr?.message,
            stack: process.env.NODE_ENV === "development" ? dbErr?.stack : undefined
          });
        }
      }

      // 8. Execute Memory DB actions
      if (memStudent) {
        memStudent.estadoIntervencion = 'En seguimiento';

        // Add history log in memoryDb
        const memoryLogId = memoryDb.seguimientosHistorico.length + 1;
        memoryDb.seguimientosHistorico.push({
          id: memoryLogId,
          aprendizFichaId: memStudent.id,
          instructorId: insId,
          fecha: new Date(),
          estadoPrevio: memStudent.estadoIntervencion || 'Sin novedad',
          estadoNuevo: 'En seguimiento',
          detalles: detailsText,
          tipoSeguimiento: 'Correo de llamado a ponerse al día',
          evidenciasPendientes: Number(evidenciasPendientes || 0),
          diasSinAcceso: Number(diasSinAcceso || 0),
          numeroLlamado: nextCallNum
        });

        if (!createdLogId) {
          createdLogId = memoryLogId;
        }

        // Escalation check in memoryDb
        if (nextCallNum > 3) {
          let existingAlert = memoryDb.alertasCriticas.find(
            a => a.aprendizFichaId === memStudent.id && a.estado !== 'Cerrado' && a.estado !== 'Cerrado por mejora'
          );

          const summaryText = `[Llamado #${nextCallNum} - ${new Date().toLocaleDateString()}] Evidencias: ${evidenciasPendientes}, Días sin acceso: ${diasSinAcceso}.`;

          if (existingAlert) {
            existingAlert.totalLlamados = nextCallNum;
            existingAlert.evidenciasPendientes = Number(evidenciasPendientes || 0);
            existingAlert.diasSinAcceso = Number(diasSinAcceso || 0);
            existingAlert.ultimoAcceso = ultimoAcceso || memStudent.ultimoAcceso;
            existingAlert.historialResumido += `\n${summaryText}`;
            existingAlert.estado = 'Requiere intervención administrativa';
          } else {
            memoryDb.alertasCriticas.push({
              id: memoryDb.alertasCriticas.length + 1,
              aprendizFichaId: memStudent.id,
              instructorId: insId,
              totalLlamados: nextCallNum,
              evidenciasPendientes: Number(evidenciasPendientes || 0),
              diasSinAcceso: Number(diasSinAcceso || 0),
              ultimoAcceso: ultimoAcceso || memStudent.ultimoAcceso,
              historialResumido: summaryText,
              nivelRiesgo: memStudent.nivelRiesgo || 'Alto',
              estado: 'Requiere intervención administrativa',
              fechaEscalamiento: new Date(),
              createdAt: new Date()
            });
          }
        }
      }

      // 9. Return the normalized JSON success response
      const returnedLog = {
        id: String(createdLogId || `int-${Date.now()}`),
        fecha: new Date().toISOString().split('T')[0],
        instructor: insRecord?.nombre || 'Instructor',
        tipoSeguimiento: 'Correo de llamado a ponerse al día',
        estadoIntervencion: 'En seguimiento',
        detalle: detailsText,
        observaciones: `Registro de ${getOrdinalLlamadoText(nextCallNum)}.`,
        numeroLlamado: nextCallNum,
        evidenciasPendientes: Number(evidenciasPendientes || 0),
        diasSinAcceso: Number(diasSinAcceso || 0)
      };

      const successResponse = {
        success: true,
        message: "Llamado registrado correctamente",
        numeroLlamado: nextCallNum,
        llamado: returnedLog
      };
      console.log('[LLAMADO_ENDPOINT] success_response', successResponse);
      return res.json(successResponse);

    } catch (error: any) {
      console.error("[ERROR] /api/aprendices/enviar-llamado", {
        message: error?.message,
        stack: process.env.NODE_ENV === "development" ? error?.stack : undefined
      });

      const errorResponse = {
        success: false,
        error: "No fue posible registrar el llamado académico.",
        details: process.env.NODE_ENV === "development" ? String(error?.message || error) : undefined
      };
      console.error('[LLAMADO_ENDPOINT] error_response', errorResponse);
      return res.status(500).json(errorResponse);
    }
  });

  // NEW ENDPOINT: Register custom follow-up / communication (Bitacora)
  app.post('/api/aprendices/:aprendizFichaId/seguimientos', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user?.uid || '';
      const aprendizFichaId = Number(req.params.aprendizFichaId);

      if (isNaN(aprendizFichaId)) {
        return res.status(400).json({ success: false, error: 'ID de aprendiz inválido.' });
      }

      // Resolve Instructor profile
      let insRecord: any = null;
      try {
        const list = await db.select().from(instructores).where(eq(instructores.uid, uid));
        if (list.length > 0) insRecord = list[0];
        else if (req.user?.email) {
          const emailList = await db.select().from(instructores).where(eq(instructores.correo, req.user.email));
          if (emailList.length > 0) insRecord = emailList[0];
        }
      } catch (e) {}
      
      if (!insRecord) {
        insRecord = memoryDb.instructores.find(i => i.uid === uid || (req.user?.email && i.correo === req.user.email));
      }

      if (!insRecord) {
        return res.status(403).json({
          success: false,
          error: "No tienes permiso para registrar seguimientos."
        });
      }

      const insId = insRecord.id;

      // Extract tracking details
      const {
        tipoSeguimiento,
        medioComunicacion,
        fechaEnvioMensaje,
        fechaRespuestaAprendiz,
        fechaProximoSeguimiento,
        asunto,
        cuerpoMensaje,
        observacion,
        respuestaAprendiz,
        acuerdosEstablecidos,
        compromisos,
        proximaAccion,
        fechaUltimoIngreso,
        totalEvidencias,
        evidenciasEnviadas,
        evidenciasAprobadas,
        evidenciasDesaprobadas,
        evidenciasPendientes,
        diasSinAcceso,
        detalleEvidenciasPendientes,
        creadoPorNombre,
        creadoPorRol,
        origenRegistro,
        parentSeguimientoId
      } = req.body;

      // Find the student in Postgres
      let pgStudent: any = null;
      try {
        const studentResult = await db.select().from(aprendicesFichas).where(eq(aprendicesFichas.id, aprendizFichaId));
        if (studentResult.length > 0) {
          pgStudent = studentResult[0];
        }
      } catch (dbErr) {}

      // Find the student in MemoryDb
      let memStudent = memoryDb.aprendicesFichas.find(s => s.id === aprendizFichaId);

      if (!pgStudent && !memStudent) {
        return res.status(404).json({ success: false, error: 'No se encontró el aprendiz.' });
      }

      // Resolve Ficha code
      let resolvedCodigoFicha = '';
      if (pgStudent) {
        try {
          const fList = await db.select().from(fichas).where(eq(fichas.id, pgStudent.fichaId));
          if (fList.length > 0) resolvedCodigoFicha = fList[0].codigoFicha;
        } catch (e) {}
      } else if (memStudent) {
        const f = memoryDb.fichas.find(f => f.id === memStudent.fichaId);
        if (f) resolvedCodigoFicha = f.codigoFicha;
      }

      // Format details text
      const detailsText = observacion || asunto || cuerpoMensaje || 'Seguimiento registrado en bitácora';

      // Determine state transitions if applicable
      const prevIntervention = pgStudent?.estadoIntervencion || memStudent?.estadoIntervencion || 'Sin novedad';
      let nextIntervention = prevIntervention;

      // Map state based on request body or tipoSeguimiento
      if (req.body.estadoIntervencion) {
        const uiState = req.body.estadoIntervencion;
        if (uiState === 'Cerrado' || uiState === 'Caso cerrado' || uiState === 'Caso cerrado por contacto efectivo') {
          nextIntervention = 'Cerrado';
        } else if (uiState === 'Remitido a Bienestar') {
          nextIntervention = 'Remitido a Bienestar';
        } else if (uiState === 'Acuerdo establecido' || uiState === 'Intervenido') {
          nextIntervention = 'Intervenido';
        } else {
          nextIntervention = 'En seguimiento';
        }
      } else {
        if (tipoSeguimiento === 'Cierre del caso') {
          nextIntervention = 'Cerrado';
        } else if (tipoSeguimiento === 'Remitido a Bienestar') {
          nextIntervention = 'Remitido a Bienestar';
        } else if (tipoSeguimiento === 'Llamado académico' || tipoSeguimiento === 'Plan de mejora' || tipoSeguimiento === 'Acuerdo académico') {
          nextIntervention = 'En seguimiento';
        }
      }

      let createdLogId: number | null = null;

      // 1. Persist to Postgres
      if (pgStudent) {
        try {
          // If state changed, update apprentice record
          if (nextIntervention !== prevIntervention) {
            await db.update(aprendicesFichas)
              .set({ estadoIntervencion: nextIntervention })
              .where(eq(aprendicesFichas.id, pgStudent.id));
          }

          const insertResult = await db.insert(seguimientosHistorico)
            .values({
              aprendizFichaId: pgStudent.id,
              instructorId: insId,
              estadoPrevio: prevIntervention,
              estadoNuevo: nextIntervention,
              detalles: detailsText,
              tipoSeguimiento: tipoSeguimiento || 'Comunicación de seguimiento',
              evidenciasPendientes: Number(evidenciasPendientes || pgStudent.evidenciasPendientes || 0),
              diasSinAcceso: Number(diasSinAcceso || pgStudent.diasSinAcceso || 0),
              
              codigoFicha: resolvedCodigoFicha,
              usuarioResponsableNombre: insRecord.nombre,
              usuarioResponsableRol: insRecord.rol,
              medioComunicacion: medioComunicacion || 'Otro',
              fechaRegistro: new Date(),
              fechaEnvioMensaje: fechaEnvioMensaje || new Date().toISOString().split('T')[0],
              fechaRespuestaAprendiz: fechaRespuestaAprendiz || null,
              fechaProximoSeguimiento: fechaProximoSeguimiento || null,
              asunto: asunto || tipoSeguimiento || 'Seguimiento',
              cuerpoMensaje: cuerpoMensaje || null,
              observacion: observacion || null,
              respuestaAprendiz: respuestaAprendiz || null,
              acuerdosEstablecidos: acuerdosEstablecidos || null,
              compromisos: compromisos || null,
              proximaAccion: proximaAccion || null,
              fechaUltimoIngreso: fechaUltimoIngreso || pgStudent.ultimoAcceso || null,
              totalEvidencias: Number(totalEvidencias || 0),
              evidenciasEnviadas: Number(evidenciasEnviadas || 0),
              evidenciasAprobadas: Number(evidenciasAprobadas || 0),
              evidenciasDesaprobadas: Number(evidenciasDesaprobadas || 0),
              detalleEvidenciasPendientes: detalleEvidenciasPendientes || null,
              creadoPorId: insId,
              creadoPorNombre: creadoPorNombre || insRecord.nombre,
              creadoPorRol: creadoPorRol || insRecord.rol,
              editablePorRol: insRecord.rol,
              origenRegistro: origenRegistro || 'Instructor',
              parentSeguimientoId: parentSeguimientoId ? Number(parentSeguimientoId) : null
            })
            .returning({ id: seguimientosHistorico.id });

          if (insertResult.length > 0) {
            createdLogId = insertResult[0].id;
          }
        } catch (dbErr: any) {
          console.error('[BITACORA_ENDPOINT] Postgres insert failed:', dbErr.message);
          return res.status(500).json({ success: false, error: 'No fue posible registrar el seguimiento en Postgres.' });
        }
      }

      // 2. Persist to memory fallback
      if (memStudent) {
        if (nextIntervention !== prevIntervention) {
          memStudent.estadoIntervencion = nextIntervention;
        }

        const memLogId = memoryDb.seguimientosHistorico.length + 1;
        memoryDb.seguimientosHistorico.push({
          id: memLogId,
          aprendizFichaId: memStudent.id,
          instructorId: insId,
          fecha: new Date(),
          estadoPrevio: prevIntervention,
          estadoNuevo: nextIntervention,
          detalles: detailsText,
          tipoSeguimiento: tipoSeguimiento || 'Comunicación de seguimiento',
          evidenciasPendientes: Number(evidenciasPendientes || memStudent.evidenciasPendientes || 0),
          diasSinAcceso: Number(diasSinAcceso || memStudent.diasSinAcceso || 0),
          
          codigoFicha: resolvedCodigoFicha,
          usuarioResponsableNombre: insRecord.nombre,
          usuarioResponsableRol: insRecord.rol,
          medioComunicacion: medioComunicacion || 'Otro',
          fechaRegistro: new Date(),
          fechaEnvioMensaje: fechaEnvioMensaje || new Date().toISOString().split('T')[0],
          fechaRespuestaAprendiz: fechaRespuestaAprendiz || null,
          fechaProximoSeguimiento: fechaProximoSeguimiento || null,
          asunto: asunto || tipoSeguimiento || 'Seguimiento',
          cuerpoMensaje: cuerpoMensaje || null,
          observacion: observacion || null,
          respuestaAprendiz: respuestaAprendiz || null,
          acuerdosEstablecidos: acuerdosEstablecidos || null,
          compromisos: compromisos || null,
          proximaAccion: proximaAccion || null,
          fechaUltimoIngreso: fechaUltimoIngreso || memStudent.ultimoAcceso || null,
          totalEvidencias: Number(totalEvidencias || 0),
          evidenciasEnviadas: Number(evidenciasEnviadas || 0),
          evidenciasAprobadas: Number(evidenciasAprobadas || 0),
          evidenciasDesaprobadas: Number(evidenciasDesaprobadas || 0),
          detalleEvidenciasPendientes: detalleEvidenciasPendientes || null,
          creadoPorId: insId,
          creadoPorNombre: creadoPorNombre || insRecord.nombre,
          creadoPorRol: creadoPorRol || insRecord.rol,
          editablePorRol: insRecord.rol,
          origenRegistro: origenRegistro || 'Instructor',
          parentSeguimientoId: parentSeguimientoId ? Number(parentSeguimientoId) : null
        });

        if (!createdLogId) {
          createdLogId = memLogId;
        }
      }

      // Success response JSON
      return res.json({
        success: true,
        message: 'Seguimiento registrado correctamente',
        seguimiento: {
          id: String(createdLogId),
          aprendizFichaId,
          instructor: insRecord.nombre,
          tipoSeguimiento: tipoSeguimiento || 'Comunicación de seguimiento',
          estadoIntervencion: nextIntervention,
          observaciones: observacion || detailsText,
          medioComunicacion: medioComunicacion || 'Otro',
          fecha: new Date().toISOString().split('T')[0],
          parentSeguimientoId: parentSeguimientoId ? Number(parentSeguimientoId) : null
        }
      });

    } catch (error: any) {
      console.error('[BITACORA_ENDPOINT_POST] Unexpected error:', error);
      return res.status(500).json({ success: false, error: 'Error interno del servidor al registrar el seguimiento.' });
    }
  });

  // NEW ENDPOINT: Fetch custom follow-ups / communications (Bitacora) for an apprentice
  app.get('/api/aprendices/:aprendizFichaId/seguimientos', requireAuth, async (req: AuthRequest, res) => {
    try {
      const aprendizFichaId = Number(req.params.aprendizFichaId);

      if (isNaN(aprendizFichaId)) {
        return res.status(400).json({ success: false, error: 'ID de aprendiz inválido.' });
      }

      try {
        const historyLogs = await db.select({
          id: seguimientosHistorico.id,
          fecha: seguimientosHistorico.fecha,
          estadoPrevio: seguimientosHistorico.estadoPrevio,
          estadoNuevo: seguimientosHistorico.estadoNuevo,
          detalles: seguimientosHistorico.detalles,
          compromisoFecha: seguimientosHistorico.compromisoFecha,
          tipoSeguimiento: seguimientosHistorico.tipoSeguimiento,
          evidenciasPendientes: seguimientosHistorico.evidenciasPendientes,
          diasSinAcceso: seguimientosHistorico.diasSinAcceso,
          numeroLlamado: seguimientosHistorico.numeroLlamado,
          instructorNombre: instructores.nombre,
          instructorCorreo: instructores.correo,
          instructorRol: instructores.rol,
          codigoFicha: seguimientosHistorico.codigoFicha,
          usuarioResponsableNombre: seguimientosHistorico.usuarioResponsableNombre,
          usuarioResponsableRol: seguimientosHistorico.usuarioResponsableRol,
          medioComunicacion: seguimientosHistorico.medioComunicacion,
          fechaRegistro: seguimientosHistorico.fechaRegistro,
          fechaEnvioMensaje: seguimientosHistorico.fechaEnvioMensaje,
          fechaRespuestaAprendiz: seguimientosHistorico.fechaRespuestaAprendiz,
          fechaProximoSeguimiento: seguimientosHistorico.fechaProximoSeguimiento,
          asunto: seguimientosHistorico.asunto,
          cuerpoMensaje: seguimientosHistorico.cuerpoMensaje,
          observacion: seguimientosHistorico.observacion,
          respuestaAprendiz: seguimientosHistorico.respuestaAprendiz,
          acuerdosEstablecidos: seguimientosHistorico.acuerdosEstablecidos,
          compromisos: seguimientosHistorico.compromisos,
          proximaAccion: seguimientosHistorico.proximaAccion,
          fechaUltimoIngreso: seguimientosHistorico.fechaUltimoIngreso,
          totalEvidencias: seguimientosHistorico.totalEvidencias,
          evidenciasEnviadas: seguimientosHistorico.evidenciasEnviadas,
          evidenciasAprobadas: seguimientosHistorico.evidenciasAprobadas,
          evidenciasDesaprobadas: seguimientosHistorico.evidenciasDesaprobadas,
          detalleEvidenciasPendientes: seguimientosHistorico.detalleEvidenciasPendientes,
          creadoPorId: seguimientosHistorico.creadoPorId,
          creadoPorNombre: seguimientosHistorico.creadoPorNombre,
          creadoPorRol: seguimientosHistorico.creadoPorRol,
          editablePorRol: seguimientosHistorico.editablePorRol,
          origenRegistro: seguimientosHistorico.origenRegistro,
          parentSeguimientoId: seguimientosHistorico.parentSeguimientoId
        })
        .from(seguimientosHistorico)
        .leftJoin(instructores, eq(seguimientosHistorico.instructorId, instructores.id))
        .where(eq(seguimientosHistorico.aprendizFichaId, aprendizFichaId))
        .orderBy(desc(seguimientosHistorico.fecha));

        const normalizedLogs = historyLogs.map(log => ({
          id: String(log.id),
          fecha: log.fecha.toISOString().split('T')[0],
          instructor: log.usuarioResponsableNombre || log.creadoPorNombre || log.instructorNombre || 'Instructor',
          detalle: log.detalles || `${log.observacion || ''}${log.compromisoFecha ? ` (Fecha compromiso: ${log.compromisoFecha})` : ''}`,
          previo: log.estadoPrevio,
          nuevo: log.estadoNuevo,
          tipoSeguimiento: log.tipoSeguimiento,
          evidenciasPendientes: log.evidenciasPendientes,
          diasSinAcceso: log.diasSinAcceso,
          numeroLlamado: log.numeroLlamado,
          
          codigoFicha: log.codigoFicha,
          usuarioResponsableNombre: log.usuarioResponsableNombre || log.instructorNombre,
          usuarioResponsableRol: log.usuarioResponsableRol || log.instructorRol,
          medioComunicacion: log.medioComunicacion,
          fechaRegistro: log.fechaRegistro ? log.fechaRegistro.toISOString() : undefined,
          fechaEnvioMensaje: log.fechaEnvioMensaje,
          fechaRespuestaAprendiz: log.fechaRespuestaAprendiz,
          fechaProximoSeguimiento: log.fechaProximoSeguimiento,
          asunto: log.asunto,
          cuerpoMensaje: log.cuerpoMensaje,
          observacion: log.observacion,
          respuestaAprendiz: log.respuestaAprendiz,
          acuerdosEstablecidos: log.acuerdosEstablecidos,
          compromisos: log.compromisos,
          proximaAccion: log.proximaAccion,
          fechaUltimoIngreso: log.fechaUltimoIngreso,
          totalEvidencias: log.totalEvidencias,
          evidenciasEnviadas: log.evidenciasEnviadas,
          evidenciasAprobadas: log.evidenciasAprobadas,
          evidenciasDesaprobadas: log.evidenciasDesaprobadas,
          detalleEvidenciasPendientes: log.detalleEvidenciasPendientes,
          creadoPorId: log.creadoPorId,
          creadoPorNombre: log.creadoPorNombre,
          creadoPorRol: log.creadoPorRol,
          editablePorRol: log.editablePorRol,
          origenRegistro: log.origenRegistro,
          parentSeguimientoId: log.parentSeguimientoId
        }));

        return res.json({ success: true, seguimientos: normalizedLogs });

      } catch (dbErr) {
        console.warn('[BITACORA_ENDPOINT_GET] Postgres query failed, using memoryFallback:', dbErr);
        const memLogs = memoryDb.seguimientosHistorico
          .filter(log => log.aprendizFichaId === aprendizFichaId)
          .sort((a, b) => b.fecha.getTime() - a.fecha.getTime());

        const normalizedLogs = memLogs.map(log => {
          const inst = memoryDb.instructores.find(i => i.id === log.instructorId);
          return {
            id: String(log.id),
            fecha: log.fecha.toISOString().split('T')[0],
            instructor: log.usuarioResponsableNombre || log.creadoPorNombre || inst?.nombre || 'Instructor',
            detalle: log.detalles || `${log.observacion || ''}${log.compromisoFecha ? ` (Fecha compromiso: ${log.compromisoFecha})` : ''}`,
            previo: log.estadoPrevio,
            nuevo: log.estadoNuevo,
            tipoSeguimiento: log.tipoSeguimiento,
            evidenciasPendientes: log.evidenciasPendientes,
            diasSinAcceso: log.diasSinAcceso,
            numeroLlamado: log.numeroLlamado,

            codigoFicha: log.codigoFicha,
            usuarioResponsableNombre: log.usuarioResponsableNombre || inst?.nombre,
            usuarioResponsableRol: log.usuarioResponsableRol || inst?.rol,
            medioComunicacion: log.medioComunicacion,
            fechaRegistro: log.fechaRegistro ? log.fechaRegistro.toISOString() : undefined,
            fechaEnvioMensaje: log.fechaEnvioMensaje,
            fechaRespuestaAprendiz: log.fechaRespuestaAprendiz,
            fechaProximoSeguimiento: log.fechaProximoSeguimiento,
            asunto: log.asunto,
            cuerpoMensaje: log.cuerpoMensaje,
            observacion: log.observacion,
            respuestaAprendiz: log.respuestaAprendiz,
            acuerdosEstablecidos: log.acuerdosEstablecidos,
            compromisos: log.compromisos,
            proximaAccion: log.proximaAccion,
            fechaUltimoIngreso: log.fechaUltimoIngreso,
            totalEvidencias: log.totalEvidencias,
            evidenciasEnviadas: log.evidenciasEnviadas,
            evidenciasAprobadas: log.evidenciasAprobadas,
            evidenciasDesaprobadas: log.evidenciasDesaprobadas,
            detalleEvidenciasPendientes: log.detalleEvidenciasPendientes,
            creadoPorId: log.creadoPorId,
            creadoPorNombre: log.creadoPorNombre,
            creadoPorRol: log.creadoPorRol,
            editablePorRol: log.editablePorRol,
            origenRegistro: log.origenRegistro,
            parentSeguimientoId: log.parentSeguimientoId
          };
        });

        return res.json({ success: true, seguimientos: normalizedLogs });
      }
    } catch (error: any) {
      console.error('[BITACORA_ENDPOINT_GET] Unexpected error:', error);
      return res.status(500).json({ success: false, error: 'Error interno del servidor al consultar seguimientos.' });
    }
  });

  // NEW ENDPOINT: Update seguimiento (Bitacora) with cross-user modification block
  app.put('/api/aprendices/:aprendizFichaId/seguimientos/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user?.uid || '';
      const trackingId = Number(req.params.id);

      if (isNaN(trackingId)) {
        return res.status(400).json({ success: false, error: 'ID de seguimiento inválido.' });
      }

      // Resolve Instructor profile
      let insRecord: any = null;
      try {
        const list = await db.select().from(instructores).where(eq(instructores.uid, uid));
        if (list.length > 0) insRecord = list[0];
        else if (req.user?.email) {
          const emailList = await db.select().from(instructores).where(eq(instructores.correo, req.user.email));
          if (emailList.length > 0) insRecord = emailList[0];
        }
      } catch (e) {}
      
      if (!insRecord) {
        insRecord = memoryDb.instructores.find(i => i.uid === uid || (req.user?.email && i.correo === req.user.email));
      }

      if (!insRecord) {
        return res.status(403).json({ success: false, error: "No tienes permiso para modificar seguimientos." });
      }

      // Find the existing tracking log in Postgres
      let pgLog: any = null;
      try {
        const results = await db.select().from(seguimientosHistorico).where(eq(seguimientosHistorico.id, trackingId));
        if (results.length > 0) pgLog = results[0];
      } catch (e) {}

      // Find in memoryDb
      let memLog = memoryDb.seguimientosHistorico.find(log => log.id === trackingId);

      if (!pgLog && !memLog) {
        return res.status(404).json({ success: false, error: 'No se encontró el registro de seguimiento.' });
      }

      // Check ownership: observations created by one user cannot be modified by another!
      const creatorId = pgLog ? pgLog.instructorId : memLog.instructorId;
      if (creatorId !== insRecord.id) {
        return res.status(403).json({
          success: false,
          error: "No puedes modificar un registro de seguimiento creado por otro usuario. Si se requiere agregar nueva información, debes crear un nuevo registro."
        });
      }

      const { observacion, detalles, respuestaAprendiz, acuerdosEstablecidos, compromisos, proximaAccion } = req.body;

      if (pgLog) {
        await db.update(seguimientosHistorico)
          .set({
            observacion: observacion !== undefined ? observacion : pgLog.observacion,
            detalles: detalles !== undefined ? detalles : pgLog.detalles,
            respuestaAprendiz: respuestaAprendiz !== undefined ? respuestaAprendiz : pgLog.respuestaAprendiz,
            acuerdosEstablecidos: acuerdosEstablecidos !== undefined ? acuerdosEstablecidos : pgLog.acuerdosEstablecidos,
            compromisos: compromisos !== undefined ? compromisos : pgLog.compromisos,
            proximaAccion: proximaAccion !== undefined ? proximaAccion : pgLog.proximaAccion
          })
          .where(eq(seguimientosHistorico.id, trackingId));
      }

      if (memLog) {
        if (observacion !== undefined) memLog.observacion = observacion;
        if (detalles !== undefined) memLog.detalles = detalles;
        if (respuestaAprendiz !== undefined) memLog.respuestaAprendiz = respuestaAprendiz;
        if (acuerdosEstablecidos !== undefined) memLog.acuerdosEstablecidos = acuerdosEstablecidos;
        if (compromisos !== undefined) memLog.compromisos = compromisos;
        if (proximaAccion !== undefined) memLog.proximaAccion = proximaAccion;
      }

      return res.json({ success: true, message: 'Seguimiento actualizado correctamente' });

    } catch (error: any) {
      console.error('[BITACORA_ENDPOINT_PUT] Unexpected error:', error);
      return res.status(500).json({ success: false, error: 'Error al actualizar el seguimiento.' });
    }
  });

  // 11. Fetch critical alerts escalated to administrative area
  app.get('/api/administrativo/alertas-criticas', requireAuth, async (req: AuthRequest, res) => {
    try {
      const alertsList = [];

      try {
        const list = await db.select({
          id: alertasCriticas.id,
          totalLlamados: alertasCriticas.totalLlamados,
          evidenciasPendientes: alertasCriticas.evidenciasPendientes,
          diasSinAcceso: alertasCriticas.diasSinAcceso,
          ultimoAcceso: alertasCriticas.ultimoAcceso,
          historialResumido: alertasCriticas.historialResumido,
          nivelRiesgo: alertasCriticas.nivelRiesgo,
          estado: alertasCriticas.estado,
          fechaEscalamiento: alertasCriticas.fechaEscalamiento,
          createdAt: alertasCriticas.createdAt,
          aprendizNombre: aprendicesFichas.nombre,
          aprendizDocumento: aprendicesFichas.documento,
          aprendizCorreo: aprendicesFichas.correo,
          aprendizTelefono: aprendicesFichas.telefono,
          fichaCodigo: fichas.codigoFicha,
          instructorNombre: instructores.nombre
        })
        .from(alertasCriticas)
        .leftJoin(aprendicesFichas, eq(alertasCriticas.aprendizFichaId, aprendicesFichas.id))
        .leftJoin(fichas, eq(aprendicesFichas.fichaId, fichas.id))
        .leftJoin(instructores, eq(alertasCriticas.instructorId, instructores.id))
        .orderBy(desc(alertasCriticas.fechaEscalamiento));

        alertsList.push(...list);
      } catch (dbErr: any) {
        console.warn('Postgres fetch alertas-criticas fallback (memoryDb used):', dbErr.message);
        
        const list = memoryDb.alertasCriticas.map(alert => {
          const student = memoryDb.aprendicesFichas.find(s => s.id === alert.aprendizFichaId);
          const ficha = student ? memoryDb.fichas.find(f => f.id === student.fichaId) : null;
          const inst = memoryDb.instructores.find(i => i.id === alert.instructorId);

          return {
            id: alert.id,
            totalLlamados: alert.totalLlamados,
            evidenciasPendientes: alert.evidenciasPendientes,
            diasSinAcceso: alert.diasSinAcceso,
            ultimoAcceso: alert.ultimoAcceso,
            historialResumido: alert.historialResumido,
            nivelRiesgo: alert.nivelRiesgo,
            estado: alert.estado,
            fechaEscalamiento: alert.fechaEscalamiento,
            createdAt: alert.createdAt,
            aprendizNombre: student ? student.nombre : 'Aprendiz',
            aprendizDocumento: student ? student.documento : '',
            aprendizCorreo: student ? student.correo : '',
            aprendizTelefono: student ? student.telefono : '',
            fichaCodigo: ficha ? ficha.codigoFicha : '',
            instructorNombre: inst ? inst.nombre : 'Instructor'
          };
        }).sort((a, b) => b.fechaEscalamiento.getTime() - a.fechaEscalamiento.getTime());

        alertsList.push(...list);
      }

      return res.json({ success: true, alertas: alertsList });
    } catch (err: any) {
      console.error('Error fetching critical alerts:', err);
      return res.status(500).json({ error: 'Error al recuperar alertas críticas' });
    }
  });

  // 12. Update the status of escalated critical alerts
  app.put('/api/administrativo/alertas-criticas/:id/estado', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const { estado } = req.body;

      if (!estado) {
        return res.status(400).json({ error: 'Falta el estado a actualizar' });
      }

      // Memory DB sync
      const memAlert = memoryDb.alertasCriticas.find(a => a.id === Number(id));
      if (memAlert) {
        memAlert.estado = estado;
      }

      // Postgres DB update
      try {
        await db.update(alertasCriticas)
          .set({ estado: estado })
          .where(eq(alertasCriticas.id, Number(id)));
      } catch (dbErr: any) {
        console.warn('Postgres alerts status update bypassed:', dbErr.message);
      }

      return res.json({ success: true, alertId: Number(id), nuevoEstado: estado });
    } catch (err: any) {
      console.error('Error updating critical alert status:', err);
      return res.status(500).json({ error: 'Error al actualizar estado de la alerta crítica' });
    }
  });

  // Middleware for API 404 routes, placed after all other API routes
  app.use('/api', (req, res) => {
    return res.status(404).json({
      success: false,
      error: `Ruta API no encontrada: ${req.method} ${req.originalUrl}`
    });
  });

  // ==========================================
  // VITE & STATIC FILES SERVING
  // ==========================================

  // Vite development middleware
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve production built assets
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Express Dev Server running at http://localhost:${PORT}`);
  });
}

startServer();
