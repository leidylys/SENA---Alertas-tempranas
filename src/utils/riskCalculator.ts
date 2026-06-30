import { Aprendiz, Fase } from '../types';

/**
 * Returns the active selected evidence names across all selected phases.
 */
export function getEvidenciasSeleccionadas(fases: Fase[]): string[] {
  const selected: string[] = [];
  if (!Array.isArray(fases)) return [];
  fases.forEach(fase => {
    if (fase && Array.isArray(fase.evidencias)) {
      fase.evidencias.forEach(ev => {
        if (ev && ev.selected && fase.selected) {
          selected.push(ev.nombre);
        }
      });
    }
  });
  return selected;
}

function getEstadoString(v: any): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'object') {
    return String(v.estado || '');
  }
  return String(v);
}

function esAprobada(stateStr: string): boolean {
  const norm = stateStr.trim().toLowerCase();
  return norm === 'a' || norm === 'aprobado' || norm === 'aprobada';
}

function esNoAprobada(stateStr: string): boolean {
  const norm = stateStr.trim().toLowerCase();
  return norm === 'd' || norm === 'desaprobado' || norm === 'desaprobada' || norm === 'reprobado' || norm === 'reprobada';
}

/**
 * Calculates risk score and classification for a single learner based on selected evidences.
 * 
 * Rules:
 * - Riesgo Alto: Si el aprendiz tiene 10 o más evidencias pendientes y más de 15 días sin ingreso (16 o más días).
 * - Riesgo Medio: Si el aprendiz tiene entre 5 y 9 evidencias pendientes y más de 15 días sin ingreso (16 o más días).
 * - Riesgo Bajo: Si no cumple las condiciones anteriores.
 */
export function calcularRiesgoAprendiz(
  aprendiz: Aprendiz,
  evidenciasSeleccionadas: string[]
): {
  puntaje: number;
  nivel: 'Bajo' | 'Medio' | 'Alto';
  totalEvidencias: number;
  totalAprobadas: number;
  totalPendientes: number;
  totalNoAprobadas: number;
  estadoAcceso?: string;
  estadoSeguimiento?: 'Posible deserción' | 'Riesgo alto' | 'Riesgo medio' | 'Riesgo bajo' | 'Sin dato suficiente';
  alertaPermanencia?: string;
  accionRecomendada?: string;
} {
  if (!aprendiz) {
    return {
      puntaje: 0,
      nivel: 'Bajo',
      totalEvidencias: 0,
      totalAprobadas: 0,
      totalPendientes: 0,
      totalNoAprobadas: 0,
      estadoAcceso: 'Sin dato reportado',
      estadoSeguimiento: 'Sin dato suficiente',
      alertaPermanencia: 'Sin alerta',
      accionRecomendada: 'Validar reporte de acceso'
    };
  }

  // 1. Evidences calculation
  const evidencias = aprendiz.evidencias || {};
  let totalAprobadas = 0;
  let totalNoAprobadas = 0;
  let totalPendientes = 0;

  evidenciasSeleccionadas.forEach(evName => {
    const rawVal = evidencias[evName];
    const stateStr = getEstadoString(rawVal);
    
    if (esAprobada(stateStr)) {
      totalAprobadas++;
    } else if (esNoAprobada(stateStr)) {
      totalNoAprobadas++;
    } else {
      totalPendientes++;
    }
  });

  const totalEvidencias = evidenciasSeleccionadas.length;
  const diasSinAcceso = aprendiz.diasSinAcceso;

  // 2. Define estadoAcceso
  let estadoAcceso = 'Sin dato reportado';
  const ultimoAccesoLower = aprendiz.ultimoAcceso ? String(aprendiz.ultimoAcceso).toLowerCase().trim() : '';

  // "Nunca ingresó" can be confirmed if:
  // - the text in ultimoAcceso explicitly is 'nunca', 'no registra', 'sin registro', 'sin ingreso', etc.
  // - OR under Rule 10 (totalEvidencias > 0, totalPendientes === totalEvidencias, totalAprobadas === 0, totalNoAprobadas === 0 and no access registered)
  const isExplicitNunca = ultimoAccesoLower === 'nunca' || 
                          ultimoAccesoLower === 'no registra' || 
                          ultimoAccesoLower === 'sin registro' ||
                          ultimoAccesoLower === 'sin ingreso' ||
                          ultimoAccesoLower === 'no registra accesos recientes';

  const hasNoAccessData = (diasSinAcceso === null || diasSinAcceso === undefined) && 
                          (aprendiz.ultimoAcceso === null || aprendiz.ultimoAcceso === undefined || aprendiz.ultimoAcceso === '');

  const isRule10Desercion = (totalEvidencias > 0 && totalPendientes === totalEvidencias && totalAprobadas === 0 && totalNoAprobadas === 0 && hasNoAccessData);

  if (isExplicitNunca || isRule10Desercion) {
    estadoAcceso = 'Nunca ingresó';
  } else if (diasSinAcceso !== null && diasSinAcceso !== undefined) {
    if (diasSinAcceso > 15) {
      estadoAcceso = 'Acceso crítico';
    } else {
      estadoAcceso = 'Acceso reciente';
    }
  } else {
    estadoAcceso = 'Sin dato reportado';
  }

  // 3. Define estadoSeguimiento & alertaPermanencia & accionRecomendada
  let estadoSeguimiento: 'Posible deserción' | 'Riesgo alto' | 'Riesgo medio' | 'Riesgo bajo' | 'Sin dato suficiente' = 'Riesgo bajo';
  let alertaPermanencia = 'Sin alerta';
  let accionRecomendada = 'Seguimiento de rutina';

  // Rule 9: If totalEvidencias = 0 and no access data, don't auto mark as Riesgo bajo
  const isSinDatoSuficienteTotalEvidenciasCero = (totalEvidencias === 0 && hasNoAccessData);

  // Evidencias enviadas = Aprobadas + Desaprobadas
  const totalEnviadas = totalAprobadas + totalNoAprobadas;

  // Check Rule 8.A: Posible deserción
  // Si totalEnviadas = 0, totalPendientes > 0 y hay acceso crítico o nunca ingresó, se refuerza la alerta de posible deserción.
  // Si totalEnviadas > 0, aunque existan evidencias pendientes, se debe interpretar que hay algún nivel de interacción académica.
  const isPosibleDesercionCondition = 
    (estadoAcceso === 'Nunca ingresó' || (diasSinAcceso !== null && diasSinAcceso > 15)) &&
    (totalEnviadas === 0 && totalPendientes > 0 && (totalPendientes === totalEvidencias || totalPendientes / totalEvidencias >= 0.9));

  if (isPosibleDesercionCondition || isRule10Desercion) {
    estadoSeguimiento = 'Posible deserción';
    alertaPermanencia = 'Posible deserción';
    accionRecomendada = 'Remitir a Bienestar';
  } else if (isSinDatoSuficienteTotalEvidenciasCero) {
    estadoSeguimiento = 'Sin dato suficiente';
    accionRecomendada = 'Validar reporte de acceso o matrícula';
  } else if (hasNoAccessData) {
    estadoSeguimiento = 'Sin dato suficiente';
    accionRecomendada = 'Validar reporte de acceso';
  } else {
    // Rule 8.B: Riesgo alto
    if (totalPendientes >= 10 && diasSinAcceso !== null && diasSinAcceso > 15) {
      estadoSeguimiento = 'Riesgo alto';
      accionRecomendada = 'Intervenir y valorar remisión';
    }
    // Rule 8.C: Riesgo medio
    else if (totalPendientes >= 5 && totalPendientes <= 9 && diasSinAcceso !== null && diasSinAcceso > 15) {
      estadoSeguimiento = 'Riesgo medio';
      accionRecomendada = 'Intervenir';
    }
    // Rule 8.D: Riesgo bajo
    else {
      estadoSeguimiento = 'Riesgo bajo';
      accionRecomendada = 'Seguimiento de rutina';
    }
  }

  // Preserve compatibility for level and puntaje
  let nivel: 'Bajo' | 'Medio' | 'Alto' = 'Bajo';
  if (estadoSeguimiento === 'Posible deserción' || estadoSeguimiento === 'Riesgo alto') {
    nivel = 'Alto';
  } else if (estadoSeguimiento === 'Riesgo medio') {
    nivel = 'Medio';
  } else {
    nivel = 'Bajo';
  }

  const puntaje = totalPendientes;

  return {
    puntaje,
    nivel,
    totalEvidencias,
    totalAprobadas,
    totalPendientes,
    totalNoAprobadas,
    estadoAcceso,
    estadoSeguimiento,
    alertaPermanencia,
    accionRecomendada
  };
}

/**
 * Recalculates metrics and risk for the entire learners list using current phase selections.
 */
export function procesarTodosLosAprendices(
  aprendices: Aprendiz[],
  fases: Fase[]
): Aprendiz[] {
  if (!Array.isArray(aprendices)) return [];
  const evidenciasSeleccionadas = getEvidenciasSeleccionadas(fases || []);
  
  return aprendices
    .map(ap => {
      if (!ap) return null;
      const res = calcularRiesgoAprendiz(ap, evidenciasSeleccionadas);
      return {
        ...ap,
        puntajeRiesgo: res.puntaje,
        nivelRiesgo: res.nivel,
        totalEvidencias: res.totalEvidencias,
        totalAprobadas: res.totalAprobadas,
        totalPendientes: res.totalPendientes,
        totalNoAprobadas: res.totalNoAprobadas,
        estadoAcceso: res.estadoAcceso,
        estadoSeguimiento: res.estadoSeguimiento,
        alertaPermanencia: res.alertaPermanencia,
        accionRecomendada: res.accionRecomendada
      } as Aprendiz;
    })
    .filter((a): a is Aprendiz => a !== null);
}

/**
 * Generates statistical metrics for the dashboard cards.
 */
export interface Estadisticas {
  total: number;
  alto: number;
  medio: number;
  bajo: number;
}

export function generarEstadisticas(aprendices: Aprendiz[]): Estadisticas {
  const stats: Estadisticas = { total: 0, alto: 0, medio: 0, bajo: 0 };
  stats.total = aprendices.length;
  
  aprendices.forEach(ap => {
    if (ap.nivelRiesgo === 'Alto') {
      stats.alto++;
    } else if (ap.nivelRiesgo === 'Medio') {
      stats.medio++;
    } else {
      stats.bajo++;
    }
  });
  
  return stats;
}
