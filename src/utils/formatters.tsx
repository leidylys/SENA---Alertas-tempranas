import React from 'react';

/**
 * Returns Tailwind css and visual badge elements for Risk Levels.
 */
export function badgeNivel(nivel: 'Bajo' | 'Medio' | 'Alto'): React.JSX.Element {
  switch (nivel) {
    case 'Alto':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-red-50 text-red-700 border border-red-200">
          <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse"></span>
          Riesgo Alto
        </span>
      );
    case 'Medio':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-50 text-amber-700 border border-amber-200">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
          Riesgo Medio
        </span>
      );
    case 'Bajo':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
            Riesgo Bajo
          </span>
        );
  }
}

/**
 * Returns Tailwind css and visual badge elements for Intervention Statuses.
 */
export function badgeEstado(estado: 'Sin intervención' | 'En seguimiento' | 'Intervenido'): React.JSX.Element {
  switch (estado) {
    case 'Intervenido':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md bg-sena-50 text-sena-800 border border-sena-100">
          Intervenido
        </span>
      );
    case 'En seguimiento':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md bg-blue-50 text-blue-800 border border-blue-100">
          En seguimiento
        </span>
      );
    case 'Sin intervención':
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md bg-slate-50 text-slate-600 border border-slate-100">
          Sin intervención
        </span>
      );
  }
}

/**
 * Returns left-border coloring indicating severity for rows in AlertTable.
 */
export function rowColorNivel(nivel: 'Bajo' | 'Medio' | 'Alto'): string {
  switch (nivel) {
    case 'Alto':
      return 'border-l-4 border-l-red-600 hover:bg-red-50/20';
    case 'Medio':
      return 'border-l-4 border-l-amber-500 hover:bg-amber-50/20';
    case 'Bajo':
    default:
      return 'border-l-4 border-l-emerald-600 hover:bg-emerald-50/20';
  }
}
