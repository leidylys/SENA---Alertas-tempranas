import { Aprendiz, Fase } from '../types';

/**
 * Returns the active selected evidence names across all selected phases.
 */
export function getEvidenciasSeleccionadas(fases: Fase[]): string[] {
  const selected: string[] = [];
  fases.forEach(fase => {
    fase.evidencias.forEach(ev => {
      if (ev.selected && fase.selected) {
        selected.push(ev.nombre);
      }
    });
  });
  return selected;
}

/**
 * Calculates risk score and classification for a single learner based on selected evidences.
 * 
 * Rules:
 * - "D" (Desaprobada) = +2 points
 * - "*" (No entregó) = +3 points
 * - Días sin ingresar >= 14 = +4 points (overrides 7 days)
 * - Días sin ingresar >= 7 = +2 points
 */
export function calcularRiesgoAprendiz(
  aprendiz: Aprendiz,
  evidenciasSeleccionadas: string[]
): { puntaje: number; nivel: 'Bajo' | 'Medio' | 'Alto' } {
  let puntaje = 0;

  // 1. Evidences calculation
  evidenciasSeleccionadas.forEach(evName => {
    const scoreVal = aprendiz.evidencias[evName];
    if (scoreVal === 'D') {
      puntaje += 2;
    } else if (scoreVal === '*') {
      puntaje += 3;
    }
  });

  // 2. Days without access calculation
  if (aprendiz.diasSinAcceso !== null) {
    if (aprendiz.diasSinAcceso >= 14) {
      puntaje += 4;
    } else if (aprendiz.diasSinAcceso >= 7) {
      puntaje += 2;
    }
  }

  // 3. Risk classification
  let nivel: 'Bajo' | 'Medio' | 'Alto' = 'Bajo';
  if (puntaje >= 6) {
    nivel = 'Alto';
  } else if (puntaje >= 3) {
    nivel = 'Medio';
  }

  return { puntaje, nivel };
}

/**
 * Recalculates metrics and risk for the entire learners list using current phase selections.
 */
export function procesarTodosLosAprendices(
  aprendices: Aprendiz[],
  fases: Fase[]
): Aprendiz[] {
  const evidenciasSeleccionadas = getEvidenciasSeleccionadas(fases);
  
  return aprendices.map(ap => {
    const { puntaje, nivel } = calcularRiesgoAprendiz(ap, evidenciasSeleccionadas);
    return {
      ...ap,
      puntajeRiesgo: puntaje,
      nivelRiesgo: nivel
    };
  });
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
