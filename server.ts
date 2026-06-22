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
  seguimientosHistorico
} from './src/db/schema.ts';
import { eq, and, desc } from 'drizzle-orm';
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
      return res.json(list);
    } catch (err: any) {
      console.warn('Error listing instructors from DB, falling back to memory database:', err.message);
      const list = memoryDb.instructores.map(i => ({
        id: i.id,
        nombre: i.nombre,
        correo: i.correo,
        contrasena: i.contrasena,
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

      // Sync in memory
      const memMatch = memoryDb.instructores.find(i => i.correo.toLowerCase() === cleanEmail);
      if (memMatch) {
        memMatch.contrasena = passVal;
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
          const updateObj: any = { contrasena: passVal };
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
    try {
      const email = req.user?.email || '';
      const uid = req.user?.uid || '';
      const name = req.user?.name || email.split('@')[0];

      if (!email || !uid) {
        return res.status(400).json({ error: 'Missing email or uid from auth context' });
      }

      const cleanEmail = email.trim().toLowerCase();
      const isInitialAdmin = cleanEmail === 'ing.deliamarherazo@gmail.com' || cleanEmail.includes('admin') || cleanEmail.includes('coordinador');
      const standardRol = isInitialAdmin ? 'Administrativo' : 'Instructor Técnico';

      // Load/save to memory DB first
      let memMatch = memoryDb.instructores.find(i => i.correo.toLowerCase() === cleanEmail);
      if (!memMatch) {
        memMatch = memoryDb.instructores.find(i => i.uid === uid);
      }

      if (memMatch) {
        memMatch.correo = cleanEmail;
        memMatch.uid = uid;
        if (name && name !== cleanEmail.split('@')[0]) {
          memMatch.nombre = name;
        }
      } else {
        memMatch = {
          id: memoryDb.instructores.length + 1,
          uid,
          correo: cleanEmail,
          nombre: name,
          rol: standardRol,
          contrasena: 'sena123',
          createdAt: new Date()
        };
        memoryDb.instructores.push(memMatch);
      }

      let instructorRow = memMatch;

      // Try Postgres sync
      try {
        let existingByEmail = await db.select().from(instructores).where(eq(instructores.correo, cleanEmail));
        if (existingByEmail.length > 0) {
          const updated = await db.update(instructores)
            .set({
              uid,
              nombre: existingByEmail[0].nombre || name
            })
            .where(eq(instructores.id, existingByEmail[0].id))
            .returning();
          instructorRow = updated[0];
        } else {
          const existingByUid = await db.select().from(instructores).where(eq(instructores.uid, uid));
          if (existingByUid.length > 0) {
            const updated = await db.update(instructores)
              .set({
                correo: cleanEmail,
                nombre: name
              })
              .where(eq(instructores.id, existingByUid[0].id))
              .returning();
            instructorRow = updated[0];
          } else {
            const result = await db.insert(instructores)
              .values({
                uid,
                correo: cleanEmail,
                nombre: name,
                rol: standardRol
              })
              .returning();
            instructorRow = result[0];
          }
        }
      } catch (dbErr: any) {
        console.warn('Postgres profile synchronization skipped (running in local fallback cache):', dbErr.message);
      }

      return res.json({ success: true, instructor: instructorRow });
    } catch (err: any) {
      console.error('Error in /api/instructor/sync:', err);
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
          return res.json(result[0]);
        }
      } catch (dbErr: any) {
        console.warn('Postgres GET /me failed, loading from cache:', dbErr.message);
      }

      const memMatch = memoryDb.instructores.find(i => i.uid === uid);
      if (memMatch) {
        return res.json(memMatch);
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

        const completeList = [];
        for (const f of assigned) {
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
            instructorNombre: instructores.nombre
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
              fecha: log.fecha.toISOString().split('T')[0],
              instructor: log.instructorNombre || 'Instructor',
              detalle: `${log.detalles}${log.compromisoFecha ? ` (Fecha compromiso: ${log.compromisoFecha})` : ''}`,
              previo: log.estadoPrevio,
              nuevo: log.estadoNuevo
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
                fecha: log.fecha.toISOString().split('T')[0],
                instructor: inst?.nombre || 'Instructor',
                detalle: `${log.detalles}${log.compromisoFecha ? ` (Fecha compromiso: ${log.compromisoFecha})` : ''}`,
                previo: log.estadoPrevio,
                nuevo: log.estadoNuevo
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

      if (!fichaCodigo || !programaFormacion || !aprendices) {
        return res.status(400).json({ error: 'Missing required sync parameters' });
      }

      // Sync Memory DB FIRST
      const cleanProgName = programaFormacion || 'Programa sin nombre';
      let memProg = memoryDb.programasFormacion.find(p => p.nombre === cleanProgName);
      if (!memProg) {
        memProg = {
          id: memoryDb.programasFormacion.length + 1,
          codigo: programaFormacion.substring(0, 30).toUpperCase().replace(/\s/g, ''),
          nombre: cleanProgName,
          nivel: nivel || 'Tecnólogo',
          createdAt: new Date()
        };
        memoryDb.programasFormacion.push(memProg);
      }

      let memFicha = memoryDb.fichas.find(f => f.codigoFicha === fichaCodigo);
      if (memFicha) {
        memFicha.fechaInicio = fechaInicio || memFicha.fechaInicio;
        memFicha.fechaFin = fechaFin || memFicha.fechaFin;
        memFicha.ultimoSeguimiento = req.body.ultimoSeguimiento || memFicha.ultimoSeguimiento;
      } else {
        memFicha = {
          id: memoryDb.fichas.length + 1,
          codigoFicha: fichaCodigo,
          programaId: memProg.id,
          fechaInicio: fechaInicio || '2026-01-15',
          fechaFin: fechaFin || '2027-12-15',
          ultimoSeguimiento: req.body.ultimoSeguimiento || undefined,
          createdAt: new Date()
        };
        memoryDb.fichas.push(memFicha);
      }

      const memIns = memoryDb.instructores.find(i => i.uid === uid);
      if (memIns) {
        const memLinked = memoryDb.instructorFicha.find(link => link.instructorId === memIns.id && link.fichaId === memFicha.id);
        if (!memLinked) {
          memoryDb.instructorFicha.push({
            id: memoryDb.instructorFicha.length + 1,
            instructorId: memIns.id,
            fichaId: memFicha.id,
            rolEnFicha: memIns.rol || 'Instructor Técnico',
            createdAt: new Date()
          });
        }
      }

      for (const s of aprendices) {
        let memStudent = memoryDb.aprendicesFichas.find(st => st.fichaId === memFicha.id && st.documento === s.documento);
        if (memStudent) {
          memStudent.nombre = s.nombre;
          memStudent.correo = s.correo;
          memStudent.telefono = s.telefono || null;
          memStudent.nivelRiesgo = s.nivelRiesgo;
          memStudent.ultimoAcceso = s.ultimoAcceso;
          memStudent.diasSinAcceso = s.diasSinAcceso;
          memStudent.puntajeRiesgo = s.puntajeRiesgo;
          memStudent.evidencias = s.evidencias || {};
        } else {
          memStudent = {
            id: memoryDb.aprendicesFichas.length + 1,
            fichaId: memFicha.id,
            documento: s.documento,
            nombre: s.nombre,
            correo: s.correo,
            telefono: s.telefono || null,
            nivelRiesgo: s.nivelRiesgo,
            estadoIntervencion: 'Sin intervención',
            ultimoAcceso: s.ultimoAcceso,
            diasSinAcceso: s.diasSinAcceso,
            puntajeRiesgo: s.puntajeRiesgo,
            evidencias: s.evidencias || {},
            createdAt: new Date()
          };
          memoryDb.aprendicesFichas.push(memStudent);
        }
      }

      // Try Postgres Sync
      try {
        const progCode = programaFormacion.substring(0, 30).toUpperCase().replace(/\s/g, '');
        const existingProg = await db.select().from(programasFormacion).where(eq(programasFormacion.codigo, progCode));
        let pgId: number;

        if (existingProg.length > 0) {
          pgId = existingProg[0].id;
        } else {
          const insProg = await db.insert(programasFormacion)
            .values({
              codigo: progCode,
              nombre: programaFormacion,
              nivel: nivel || 'Tecnólogo',
            })
            .returning();
          pgId = insProg[0].id;
        }

        const existingFicha = await db.select().from(fichas).where(eq(fichas.codigoFicha, fichaCodigo));
        let fId: number;

        if (existingFicha.length > 0) {
          fId = existingFicha[0].id;
          await db.update(fichas)
            .set({
              fechaInicio: fechaInicio || existingFicha[0].fechaInicio,
              fechaFin: fechaFin || existingFicha[0].fechaFin,
              ultimoSeguimiento: req.body.ultimoSeguimiento || existingFicha[0].ultimoSeguimiento,
            })
            .where(eq(fichas.id, fId));
        } else {
          const insFicha = await db.insert(fichas)
            .values({
              codigoFicha: fichaCodigo,
              programaId: pgId,
              fechaInicio: fechaInicio || '2026-01-15',
              fechaFin: fechaFin || '2027-12-15',
              ultimoSeguimiento: req.body.ultimoSeguimiento || undefined,
            })
            .returning();
          fId = insFicha[0].id;
        }

        const insResult = await db.select().from(instructores).where(eq(instructores.uid, uid));
        if (insResult.length > 0) {
          const instructorId = insResult[0].id;
          const linked = await db.select().from(instructorFicha)
            .where(and(eq(instructorFicha.instructorId, instructorId), eq(instructorFicha.fichaId, fId)));

          if (linked.length === 0) {
            await db.insert(instructorFicha).values({
              instructorId,
              fichaId: fId,
              rolEnFicha: insResult[0].rol || 'Instructor Técnico'
            });
          }
        }

        for (const s of aprendices) {
          const existingStudent = await db.select().from(aprendicesFichas)
            .where(and(eq(aprendicesFichas.fichaId, fId), eq(aprendicesFichas.documento, s.documento)));

          if (existingStudent.length > 0) {
            await db.update(aprendicesFichas)
              .set({
                nombre: s.nombre,
                correo: s.correo,
                telefono: s.telefono || null,
                nivelRiesgo: s.nivelRiesgo,
                ultimoAcceso: s.ultimoAcceso,
                diasSinAcceso: s.diasSinAcceso,
                puntajeRiesgo: s.puntajeRiesgo,
                evidencias: s.evidencias || {}
              })
              .where(eq(aprendicesFichas.id, existingStudent[0].id));
          } else {
            await db.insert(aprendicesFichas)
              .values({
                fichaId: fId,
                documento: s.documento,
                nombre: s.nombre,
                correo: s.correo,
                telefono: s.telefono || null,
                nivelRiesgo: s.nivelRiesgo,
                estadoIntervencion: 'Sin intervención',
                ultimoAcceso: s.ultimoAcceso,
                diasSinAcceso: s.diasSinAcceso,
                puntajeRiesgo: s.puntajeRiesgo,
                evidencias: s.evidencias || {}
              });
          }
        }
      } catch (dbErr: any) {
        console.warn('PostgreSQL syncLearnersToDb offline bypass executed:', dbErr.message);
      }

      return res.json({
        success: true,
        fichaId: memFicha.id,
        count: aprendices.length
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
