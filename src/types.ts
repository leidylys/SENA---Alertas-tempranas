export interface FichaInfo {
  regional: string;
  centroFormacion: string;
  programaFormacion: string;
  nivel: 'Técnico' | 'Tecnólogo';
  numeroFicha: string;
  instructor: string;
  ultimoSeguimiento?: string; // Track last seguimiento check-in
  fechaInicio?: string;
  fechaFin?: string;
}

export interface Intervencion {
  id: string;
  fecha: string;
  instructor: string;
  estadoIntervencion: 'Sin intervención' | 'En seguimiento' | 'Intervenido';
  estrategias?: string[];
  causas?: string[];
  estrategiaPersonalizada?: string;
  observaciones?: string;
  detalle?: string;
  previo?: string;
  nuevo?: string;
  tipoSeguimiento?: string | null;
  evidenciasPendientes?: number | null;
  diasSinAcceso?: number | null;
  numeroLlamado?: number | null;
}

export interface Aprendiz {
  id: string; // usually same as documento
  nombre: string;
  documento: string;
  correo: string;
  telefono?: string | null;
  evidencias: Record<string, string>; // e.g. "Evidencia 1": "A" | "D" | "*"
  ultimoAcceso: string | null;     // Date string or text
  diasSinAcceso: number | null;    // calculated days since last access
  puntajeRiesgo: number;
  nivelRiesgo: 'Bajo' | 'Medio' | 'Alto';
  estadoIntervencion: 'Sin intervención' | 'En seguimiento' | 'Intervenido';
  historialIntervenciones: Intervencion[];
  resumenFases?: Record<string, any>;
  estadoAprendiz?: 'Activo' | 'Inactivo';
  observacionEstado?: string | null;
  fechaUltimoReporte?: string | null;
  dbId?: number;
}

export interface Evidencia {
  nombre: string;
  selected: boolean;
  ponderacion?: number;
}

export interface Fase {
  id: string;
  nombre: string;
  evidencias: Evidencia[];
  selected: boolean;
}

export interface AlertasEstado {
  fichaInfo: FichaInfo | null;
  aprendices: Aprendiz[];
  fases: Fase[];
  hasPendingChanges: boolean;
  selectedAprendicesIds: string[];
  filterSearch: string;
  filterRiesgo: 'Todos' | 'Bajo' | 'Medio' | 'Alto';
  filterEstado: 'Todos' | 'Sin intervención' | 'En seguimiento' | 'Intervenido';
  sortColumn: keyof Aprendiz | 'no_entregadas' | 'evidencias_d' | '';
  sortDirection: 'asc' | 'desc';
}
