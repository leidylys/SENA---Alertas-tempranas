import { FichaInfo, Aprendiz } from '../types';

export async function fetchInstructor(token: string) {
  const res = await fetch('/api/instructor/me', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) throw new Error('No se pudo recuperar el perfil del instructor');
  return res.json();
}

export async function syncInstructor(token: string) {
  const isDev = (import.meta as any).env?.DEV || process.env.NODE_ENV !== 'production';
  if (isDev) {
    const tokenExists = !!token;
    const tokenLength = token ? token.length : 0;
    const startsWithEy = token ? token.startsWith('eyJ') : false;
    console.log(`[DEV LOG] syncInstructor request diagnostics:
      - token existe: ${tokenExists}
      - token length: ${tokenLength}
      - token empieza con eyJ: ${startsWithEy}
      - endpoint llamado: /api/instructor/sync`);
  }

  const res = await fetch('/api/instructor/sync', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) {
    const text = await res.text();
    let errJson;
    try { errJson = JSON.parse(text); } catch { /* ignore */ }
    const errorMsg = errJson?.error || 'No se pudo sincronizar el perfil del instructor';
    const err = new Error(errorMsg) as any;
    err.status = res.status;
    err.details = errorMsg;
    throw err;
  }
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
  ultimoSeguimiento?: string,
  isCalificaciones?: boolean
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
      ultimoSeguimiento,
      isCalificaciones
    })
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => null);
    throw new Error(errorData?.error || 'Error al sincronizar datos con base de datos');
  }
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

export async function fetchAprendizSeguimientos(token: string, aprendizFichaId: number) {
  const res = await fetch(`/api/aprendices/${aprendizFichaId}/seguimientos`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) throw new Error('No se pudo recuperar la bitácora del aprendiz');
  return res.json();
}

export async function saveBitacoraSeguimiento(
  token: string,
  aprendizFichaId: number,
  datosSeguimiento: any
) {
  const res = await fetch(`/api/aprendices/${aprendizFichaId}/seguimientos`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(datosSeguimiento)
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => null);
    throw new Error(errorData?.error || 'Error al registrar el seguimiento en la bitácora');
  }
  return res.json();
}

export async function uploadItinerary(
  token: string,
  codigoFicha: string,
  instructorLiderId: number | null,
  rows: any[]
) {
  const res = await fetch('/api/administrativo/itinerario', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      codigoFicha,
      instructorLiderId,
      rows
    })
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => null);
    throw new Error(errorData?.error || 'No se pudo guardar el itinerario en PostgreSQL. La información no fue persistida.');
  }
  return res.json();
}
