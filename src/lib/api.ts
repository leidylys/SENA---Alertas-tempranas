import { FichaInfo, Aprendiz } from '../types';

export async function fetchInstructor(token: string) {
  const res = await fetch('/api/instructor/me', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) throw new Error('No se pudo recuperar el perfil del instructor');
  return res.json();
}

export async function syncInstructor(token: string) {
  const res = await fetch('/api/instructor/sync', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) throw new Error('No se pudo sincronizar el perfil del instructor');
  return res.json();
}

export async function updateInstructorRole(token: string, rol: string, nombre?: string, adminKey?: string) {
  const res = await fetch('/api/instructor/me', {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ rol, nombre, adminKey })
  });
  if (!res.ok) {
    const text = await res.text();
    let errJson;
    try { errJson = JSON.parse(text); } catch { /* ignore */ }
    throw new Error(errJson?.error || 'No se pudo actualizar el rol');
  }
  return res.json();
}

export async function fetchFichas(token: string) {
  const res = await fetch('/api/fichas', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) throw new Error('No se pudieron recuperar las fichas');
  return res.json();
}

export async function fetchFichaDetails(token: string, fichaCodigo: string) {
  const res = await fetch(`/api/fichas/${fichaCodigo}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) throw new Error('No se pudo cargar la ficha desde base de datos');
  return res.json();
}

export async function syncLearnersToDb(
  token: string,
  fichaCodigo: string,
  programaFormacion: string,
  nivel: string,
  fechaInicio: string,
  fechaFin: string,
  aprendices: any[],
  ultimoSeguimiento?: string
) {
  const res = await fetch(`/api/fichas/${fichaCodigo}/aprendices`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      programaFormacion,
      nivel,
      fechaInicio,
      fechaFin,
      aprendices,
      ultimoSeguimiento
    })
  });
  if (!res.ok) throw new Error('Error al sincronizar datos con base de datos');
  return res.json();
}

export async function saveIndividualIntervention(
  token: string,
  userDoc: string,
  fichaId: string | number,
  estado: string,
  compromiso: string,
  fechaCompromiso?: string
) {
  const res = await fetch('/api/aprendices/intervencion-individual', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      userDoc,
      fichaId,
      estado,
      intervencionDetalle: {
        compromiso,
        fechaCompromiso
      }
    })
  });
  if (!res.ok) throw new Error('Error al registrar compromiso en base de datos');
  return res.json();
}

export async function saveBulkIntervention(
  token: string,
  userDocs: string[],
  fichaId: string | number,
  estado: string,
  compromiso: string,
  fechaCompromiso?: string
) {
  const res = await fetch('/api/aprendices/intervencion-grupal', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      userDocs,
      fichaId,
      estado,
      intervencionDetalle: {
        compromiso,
        fechaCompromiso
      }
    })
  });
  if (!res.ok) throw new Error('Error al registrar compromisos masivos');
  return res.json();
}

export async function uploadProgrammingGrid(token: string, programacion: any[]) {
  const res = await fetch('/api/administrativo/programacion', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ programacion })
  });
  if (!res.ok) {
    const errText = await res.text();
    let errJson;
    try { errJson = JSON.parse(errText); } catch { /* ignore */ }
    throw new Error(errJson?.error || 'Error al cargar programación de fichas');
  }
  return res.json();
}

export async function loginAsInstructorWithDb(correo: string, contrasena: string) {
  const res = await fetch('/api/auth/instructor-login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ correo, contrasena })
  });
  if (!res.ok) {
    const errText = await res.text();
    let errJson;
    try { errJson = JSON.parse(errText); } catch { /* ignore */ }
    throw new Error(errJson?.error || 'Credenciales de instructor incorrectas o no registradas');
  }
  return res.json();
}

export async function updateInstructorPassword(token: string, email: string, password: string) {
  const res = await fetch('/api/administrativo/instructor-password', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) {
    const errText = await res.text();
    let errJson;
    try { errJson = JSON.parse(errText); } catch { /* ignore */ }
    throw new Error(errJson?.error || 'No se pudo actualizar la contraseña del instructor');
  }
  return res.json();
}

export async function resetSystemDatabase(token: string) {
  const res = await fetch('/api/administrativo/reset-database', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  if (!res.ok) {
    const errText = await res.text();
    let errJson;
    try { errJson = JSON.parse(errText); } catch { /* ignore */ }
    throw new Error(errJson?.error || 'No se pudo restablecer la base de datos');
  }
  return res.json();
}
