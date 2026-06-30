import React, { useState, useMemo } from 'react';
import { 
  Search, ArrowUpDown, ChevronDown, ChevronUp, Briefcase, 
  Sparkles, CheckSquare, Square, Filter, FileArchive, Download, Eye, Activity, Mail, Heart, FileText, AlertCircle, MoreVertical,
  Clock, User, Copy, ExternalLink, Check
} from 'lucide-react';
import { Aprendiz, FichaInfo } from '../types';
import { badgeNivel, badgeEstado, rowColorNivel, formatEvidenciaNombre } from '../utils/formatters';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { generarPdfIndividual, generarPdfBienestar, generarPdfPlanMejoramiento } from '../services/pdfGenerator';

interface AlertTableProps {
  aprendices: Aprendiz[];
  fichaInfo: FichaInfo;
  selectedIds: string[];
  filterSearch: string;
  onFilterSearchChange: (search: string) => void;
  filterRiesgo: 'Todos' | 'Posible deserción' | 'Riesgo alto' | 'Riesgo medio' | 'Riesgo bajo' | 'Sin dato suficiente';
  onFilterRiesgoChange: (riesgo: 'Todos' | 'Posible deserción' | 'Riesgo alto' | 'Riesgo medio' | 'Riesgo bajo' | 'Sin dato suficiente') => void;
  filterEstado: 'Todos' | 'Sin intervención' | 'En seguimiento' | 'Intervenido';
  onFilterEstadoChange: (estado: 'Todos' | 'Sin intervención' | 'En seguimiento' | 'Intervenido') => void;
  
  sortColumn: string;
  onSortColumnChange: (col: string) => void;
  sortDirection: 'asc' | 'desc';
  onSortDirectionChange: (dir: 'asc' | 'desc') => void;

  onToggleSelect: (id: string) => void;
  onToggleSelectAll: (filteredIds: string[]) => void;
  onIntervenirIndividual: (aprendiz: Aprendiz) => void;
  onIntervenirMasivo: (aprendices: Aprendiz[]) => void;
  onEnviarLlamado: (aprendiz: Aprendiz) => void;
}

function isAcademicCall(hist: { tipoSeguimiento?: string | null; numeroLlamado?: number | null }): boolean {
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

function parseSpanishDate(dStr: string | null | undefined): number {
  if (!dStr) return 0;
  const parts = dStr.split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    return new Date(year, month, day).getTime();
  }
  return new Date(dStr).getTime() || 0;
}

function parseLlamadoDetalle(detalleStr: string, fallback: Partial<any> = {}) {
  const result = {
    asunto: 'Llamado académico por inasistencia y evidencias pendientes',
    destinatario: fallback.destinatario || '',
    fechaHora: fallback.fecha || '',
    estado: fallback.estadoIntervencion || 'Registrado',
    observacion: fallback.observaciones || '',
    cuerpo: detalleStr || fallback.detalle || '',
    ultimoAcceso: fallback.ultimoAcceso || 'No registrado',
    diasSinAcceso: fallback.diasSinAcceso ?? 0,
    totalEvidencias: fallback.totalEvidencias ?? 0,
    evidenciasEnviadas: fallback.evidenciasEnviadas ?? 0,
    evidenciasAprobadas: fallback.evidenciasAprobadas ?? 0,
    evidenciasDesaprobadas: fallback.evidenciasDesaprobadas ?? 0,
    evidenciasPendientes: fallback.evidenciasPendientes ?? 0,
    ficha: fallback.ficha || '',
    instructor: fallback.instructor || ''
  };

  if (!detalleStr) return result;

  const lines = detalleStr.split('\n');
  let isMessageCuerpo = false;
  const cuerpoLines: string[] = [];

  for (const line of lines) {
    if (isMessageCuerpo) {
      cuerpoLines.push(line);
      continue;
    }

    if (line.trim().startsWith('--------------------------------------------------')) {
      isMessageCuerpo = true;
      continue;
    }

    const matchAsunto = line.match(/^Asunto:\s*(.+)$/i);
    if (matchAsunto) { result.asunto = matchAsunto[1].trim(); continue; }

    const matchFicha = line.match(/^Ficha:\s*(.+)$/i);
    if (matchFicha) { result.ficha = matchFicha[1].trim(); continue; }

    const matchAcceso = line.match(/^Fecha de último ingreso:\s*(.+)$/i);
    if (matchAcceso) { result.ultimoAcceso = matchAcceso[1].trim(); continue; }

    const matchDias = line.match(/^Días sin acceso:\s*(\d+)/i);
    if (matchDias) { result.diasSinAcceso = parseInt(matchDias[1], 10); continue; }

    const matchTotalEv = line.match(/^Total evidencias:\s*(\d+)/i);
    if (matchTotalEv) { result.totalEvidencias = parseInt(matchTotalEv[1], 10); continue; }

    const matchEnviadas = line.match(/^Evidencias enviadas:\s*(\d+)/i);
    if (matchEnviadas) { result.evidenciasEnviadas = parseInt(matchEnviadas[1], 10); continue; }

    const matchAprobadas = line.match(/^Evidencias aprobadas:\s*(\d+)/i);
    if (matchAprobadas) { result.evidenciasAprobadas = parseInt(matchAprobadas[1], 10); continue; }

    const matchDesaprobadas = line.match(/^Evidencias desaprobadas:\s*(\d+)/i);
    if (matchDesaprobadas) { result.evidenciasDesaprobadas = parseInt(matchDesaprobadas[1], 10); continue; }

    const matchPendientes = line.match(/^Evidencias pendientes:\s*(\d+)/i);
    if (matchPendientes) { result.evidenciasPendientes = parseInt(matchPendientes[1], 10); continue; }

    const matchObs = line.match(/^Observación:\s*(.+)$/i);
    if (matchObs) { result.observacion = matchObs[1].trim(); continue; }
  }

  if (isMessageCuerpo && cuerpoLines.length > 0) {
    result.cuerpo = cuerpoLines.join('\n').trim();
  }

  return result;
}

export default function AlertTable({
  aprendices,
  fichaInfo,
  selectedIds,
  filterSearch,
  onFilterSearchChange,
  filterRiesgo,
  onFilterRiesgoChange,
  filterEstado,
  onFilterEstadoChange,
  sortColumn,
  onSortColumnChange,
  sortDirection,
  onSortDirectionChange,
  onToggleSelect,
  onToggleSelectAll,
  onIntervenirIndividual,
  onIntervenirMasivo,
  onEnviarLlamado
}: AlertTableProps) {
  
  // Track which rows are expanded to see history
  const [expandedDocIds, setExpandedDocIds] = useState<string[]>([]);
  const [expandedLlamadoId, setExpandedLlamadoId] = useState<string | null>(null);
  const [copiedCallId, setCopiedCallId] = useState<string | null>(null);
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);
  const [zipExporting, setZipExporting] = useState(false);
  const [selectedLearnerForEvidences, setSelectedLearnerForEvidences] = useState<any>(null);
  const [modalStateFilter, setModalStateFilter] = useState<'Todas' | 'A' | 'D' | '-'>('Todas');

  // New local state and helpers for permanencia and access referrals/plans
  const [filterPermanencia, setFilterPermanencia] = useState<string>('Todos');
  const [bienestarReferralLearner, setBienestarReferralLearner] = useState<Aprendiz | null>(null);
  const [improvementPlanLearner, setImprovementPlanLearner] = useState<Aprendiz | null>(null);

  // Form states for Bienestar Referral Modal
  const [causeBienestar, setCauseBienestar] = useState('Inasistencia reiterada superior a 30 días sin justificar');
  const [descriptionBienestar, setDescriptionBienestar] = useState('');
  const [isReferralSent, setIsReferralSent] = useState(false);
  const [trackingIdBienestar, setTrackingIdBienestar] = useState('');

  // Form states for Plan de Mejoramiento Modal
  const [strategiesPlan, setStrategiesPlan] = useState('Sustentar de forma presencial u online las evidencias desaprobadas y pendientes mediante la entrega de talleres prácticos complementarios.');
  const [deadlinePlan, setDeadlinePlan] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 10);
    return d.toISOString().split('T')[0];
  });
  const [commitmentPlan, setCommitmentPlan] = useState('Me comprometo formalmente a asistir a las tutorías de acompañamiento docente y a realizar el cargue extemporáneo del portafolio en la plataforma LMS.');
  const [isPlanSaved, setIsPlanSaved] = useState(false);

  // Handler for Bienestar PDF generation
  const handleDownloadBienestarPdf = () => {
    if (!bienestarReferralLearner) return;
    const doc = generarPdfBienestar(
      bienestarReferralLearner,
      fichaInfo,
      causeBienestar,
      descriptionBienestar,
      new Date().toLocaleDateString()
    );
    doc.save(`Remision_Bienestar_${bienestarReferralLearner.documento}.pdf`);
  };

  // Handler for Bienestar formal submission
  const handleSendBienestarReferral = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bienestarReferralLearner) return;
    
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const trackingCode = `SENA-BIE-2026-${randomNum}`;
    setTrackingIdBienestar(trackingCode);
    setIsReferralSent(true);

    // Also inject into learner's temporary history so it shows up live in the table
    const newLog = {
      id: `bie-${Date.now()}`,
      fecha: new Date().toLocaleDateString(),
      instructor: fichaInfo.instructor,
      tipoSeguimiento: 'Remisión a Bienestar',
      estadoIntervencion: 'En seguimiento',
      detalle: `Remisión oficial enviada a Bienestar. Radicado: ${trackingCode}. Causa: ${causeBienestar}. Observaciones: ${descriptionBienestar || 'Ninguna'}`,
      estrategias: ['Orientación social', 'Seguimiento por Psicología'],
      causas: [causeBienestar]
    };
    if (!bienestarReferralLearner.historialIntervenciones) {
      bienestarReferralLearner.historialIntervenciones = [];
    }
    bienestarReferralLearner.historialIntervenciones.unshift(newLog);
    bienestarReferralLearner.estadoIntervencion = 'En seguimiento';
  };

  // Handler for Plan de Mejoramiento PDF generation
  const handleDownloadPlanPdf = () => {
    if (!improvementPlanLearner) return;
    const doc = generarPdfPlanMejoramiento(
      improvementPlanLearner,
      fichaInfo,
      strategiesPlan,
      deadlinePlan,
      commitmentPlan
    );
    doc.save(`Plan_Mejoramiento_${improvementPlanLearner.documento}.pdf`);
  };

  // Handler for Plan de Mejoramiento saving
  const handleSavePlan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!improvementPlanLearner) return;
    
    setIsPlanSaved(true);

    // Inject into learner's temporary history so it shows up live
    const newLog = {
      id: `plan-${Date.now()}`,
      fecha: new Date().toLocaleDateString(),
      instructor: fichaInfo.instructor,
      tipoSeguimiento: 'Plan de Mejoramiento',
      estadoIntervencion: 'Intervenido',
      detalle: `Plan de Mejoramiento Concertado con plazo hasta ${deadlinePlan}. Estrategias: ${strategiesPlan}. Compromiso: ${commitmentPlan}`,
      estrategias: [strategiesPlan],
      causas: ['Rendimiento académico']
    };
    if (!improvementPlanLearner.historialIntervenciones) {
      improvementPlanLearner.historialIntervenciones = [];
    }
    improvementPlanLearner.historialIntervenciones.unshift(newLog);
    improvementPlanLearner.estadoIntervencion = 'Intervenido';
  };

  const hasPlan = (ap: Aprendiz) => (ap.historialIntervenciones || []).some(h => h.tipoSeguimiento === 'Plan de Mejoramiento');
  const hasBienestar = (ap: Aprendiz) => (ap.historialIntervenciones || []).some(h => h.tipoSeguimiento === 'Remisión a Bienestar');

  const handleDownloadPlanPdfForLearner = (learner: Aprendiz) => {
    const planLog = (learner.historialIntervenciones || []).find(h => h.tipoSeguimiento === 'Plan de Mejoramiento');
    const strategies = planLog?.estrategias?.[0] || 'Sustentar de forma presencial u online las evidencias desaprobadas y pendientes mediante la entrega de talleres prácticos complementarios.';
    const deadline = planLog?.fechaLimite || planLog?.detalle?.match(/plazo hasta ([\d/]+)/)?.[1] || new Date().toLocaleDateString();
    const commitment = planLog?.compromiso || 'Me comprometo formalmente a asistir a las tutorías de acompañamiento docente y a realizar el cargue extemporáneo del portafolio en la plataforma LMS.';
    
    const doc = generarPdfPlanMejoramiento(
      learner,
      fichaInfo,
      strategies,
      deadline,
      commitment
    );
    doc.save(`Plan_Mejoramiento_${learner.documento}.pdf`);
  };

  const handleDownloadBienestarPdfForLearner = (learner: Aprendiz) => {
    const bienestarLog = (learner.historialIntervenciones || []).find(h => h.tipoSeguimiento === 'Remisión a Bienestar');
    const cause = bienestarLog?.causas?.[0] || 'Inasistencia reiterada superior a 30 días sin justificar';
    const detailText = bienestarLog?.detalle || '';
    const descriptionMatch = detailText.match(/Observaciones: (.*)$/);
    const description = descriptionMatch ? descriptionMatch[1] : '';
    const date = bienestarLog?.fecha || new Date().toLocaleDateString();
    
    const doc = generarPdfBienestar(
      learner,
      fichaInfo,
      cause,
      description,
      date
    );
    doc.save(`Remision_Bienestar_${learner.documento}.pdf`);
  };

  const getLmsAccessState = (ap: Aprendiz): string => {
    return ap.estadoAcceso || 'Sin dato reportado';
  };

  const getAlertaPermanencia = (ap: Aprendiz): string => {
    return ap.alertaPermanencia || 'Sin alerta';
  };

  const renderAlertaBadge = (ap: Aprendiz) => {
    let text = 'Sin dato suficiente';
    let style = 'bg-slate-100 text-slate-500 border-slate-200';
    
    if (ap.estadoSeguimiento === 'Posible deserción') {
      text = 'Posible deserción';
      style = 'bg-rose-50 text-rose-750 border-rose-200 font-extrabold';
    } else if (ap.estadoAcceso === 'Acceso crítico') {
      text = 'Acceso crítico';
      style = 'bg-rose-50 text-rose-750 border-rose-200 font-extrabold';
    } else if (ap.estadoSeguimiento === 'Riesgo alto') {
      text = 'Riesgo alto';
      style = 'bg-amber-50 text-amber-700 border-amber-200 font-bold';
    } else if (ap.estadoSeguimiento === 'Riesgo medio') {
      text = 'Riesgo medio';
      style = 'bg-amber-50/70 text-amber-600 border-amber-150 font-bold';
    } else if (ap.estadoSeguimiento === 'Riesgo bajo' || ap.estadoAcceso === 'Acceso reciente') {
      text = 'Riesgo bajo';
      style = 'bg-emerald-50 text-emerald-700 border-emerald-200 font-bold';
    }

    return (
      <span 
        className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] uppercase border tracking-wider select-none ${style}`}
        title={getAlertaPermanencia(ap)}
      >
        {text}
      </span>
    );
  };

  const getSituacionVisual = (ap: Aprendiz) => {
    if (!ap.ultimoAcceso || ap.estadoSeguimiento === 'Sin dato suficiente') {
      return 'Sin dato suficiente';
    }
    if (ap.estadoSeguimiento === 'Posible deserción') {
      return ap.diasSinAcceso && ap.diasSinAcceso > 30 
        ? 'Requiere validación por Bienestar' 
        : 'Requiere seguimiento inmediato';
    }
    if (ap.estadoSeguimiento === 'Riesgo alto') {
      return 'Requiere seguimiento';
    }
    if (ap.estadoSeguimiento === 'Riesgo medio') {
      return 'En seguimiento';
    }
    if (ap.estadoSeguimiento === 'Riesgo bajo') {
      return 'Situación estable';
    }
    return 'Situación estable';
  };

  const getObservacionCorta = (ap: Aprendiz) => {
    if (ap.historialIntervenciones && ap.historialIntervenciones.length > 0) {
      const latest = ap.historialIntervenciones[0];
      const text = latest.detalle || latest.observaciones || '';
      if (text) {
        return text.length > 65 ? `${text.substring(0, 62)}...` : text;
      }
    }
    if (ap.estadoSeguimiento === 'Posible deserción') {
      return 'Alerta activa: posible deserción por inasistencia y evidencias pendientes.';
    }
    if (ap.estadoSeguimiento === 'Riesgo alto') {
      return 'Requiere seguimiento prioritario por inasistencia y evidencias pendientes.';
    }
    if (ap.estadoSeguimiento === 'Riesgo medio') {
      return 'Requiere seguimiento académico.';
    }
    if (ap.estadoSeguimiento === 'Riesgo bajo') {
      return 'Sin alerta crítica de permanencia.';
    }
    return 'Validar reporte de acceso o matrícula.';
  };

  const getObservacionColor = (ap: Aprendiz, pendingCount: number) => {
    if (
      ap.estadoSeguimiento === 'Posible deserción' ||
      ap.estadoAcceso === 'Nunca ingresó' ||
      (ap.estadoAcceso === 'Acceso crítico' && pendingCount >= 10)
    ) {
      return 'bg-rose-50 border-rose-250 text-rose-800';
    }
    if (
      ap.estadoSeguimiento === 'Riesgo alto' ||
      ap.estadoSeguimiento === 'Riesgo medio' ||
      (ap.estadoAcceso === 'Acceso crítico' && pendingCount < 10)
    ) {
      return 'bg-amber-50 border-amber-250 text-amber-800';
    }
    if (
      ap.estadoSeguimiento === 'Riesgo bajo' ||
      ap.estadoAcceso === 'Acceso reciente' ||
      pendingCount === 0
    ) {
      return 'bg-emerald-50 border-emerald-250 text-emerald-800';
    }
    return 'bg-slate-50 border-slate-200 text-slate-700';
  };

  const getLearnerPendingEvidences = (ap: Aprendiz) => {
    if (!ap || !ap.evidencias) return [];
    const evs = ap.evidencias || {};
    return Object.entries(evs).map(([header, value]) => {
      let valStr = '';
      let detail: any = null;
      if (typeof value === 'object' && value !== null) {
        valStr = (value as any).estado;
        detail = value;
      } else {
        valStr = String(value);
      }
      
      if (valStr === '-') {
        if (detail) {
          return {
            nombre: detail.nombre || header,
            fase: detail.fase || 'Fase de Formación'
          };
        } else {
          return {
            nombre: header,
            fase: 'Fase de Formación'
          };
        }
      }
      return null;
    }).filter(Boolean) as { nombre: string; fase: string }[];
  };

  // Find all pending evidences for selected learner
  const pendingEvidencesList = useMemo(() => {
    if (!selectedLearnerForEvidences) return [];
    
    const evs = selectedLearnerForEvidences.evidencias || {};
    return Object.entries(evs).map(([header, value]) => {
      let valStr = '';
      let detail: any = null;
      if (typeof value === 'object' && value !== null) {
        valStr = (value as any).estado;
        detail = value;
      } else {
        valStr = String(value);
      }
      
      if (valStr === '-') {
        if (detail) {
          return {
            nombre: detail.nombre || header,
            codigo: detail.codigo || '',
            actividadProyecto: detail.actividadProyecto || 'Sin Actividad',
            fase: detail.fase || 'Fase de Formación',
            tipo: detail.tipo || 'Evidencia',
            estado: 'Pendiente'
          };
        } else {
          const norm = header.toLowerCase();
          let tipo = 'Evidencia';
          if (norm.includes('prueba') || norm.includes('evaluacion') || norm.includes('cuestionario')) {
            tipo = 'Prueba de Conocimiento';
          } else if (norm.includes('foro')) {
            tipo = 'Foro';
          }
          
          let codigo = header;
          let act = 'Sin Actividad';
          const matchCode = header.match(/(GA\d+-[A-Za-z0-9_-]+)/i);
          if (matchCode) {
            codigo = matchCode[1].toUpperCase();
            const actMatch = codigo.match(/^(GA\d+)/i);
            if (actMatch) {
              act = actMatch[1].toUpperCase();
            }
          } else {
            const gaMatch = header.match(/(GA\d+)/i);
            if (gaMatch) {
              act = gaMatch[1].toUpperCase();
            }
          }
          
          return {
            nombre: header,
            codigo,
            actividadProyecto: act,
            fase: 'Fase de Formación',
            tipo,
            estado: 'Pendiente'
          };
        }
      }
      return null;
    }).filter(Boolean);
  }, [selectedLearnerForEvidences]);

  // Group the pending list by Fase and Actividad de Proyecto
  const groupedPendingEvidences = useMemo(() => {
    const groups: Record<string, Record<string, any[]>> = {};
    
    pendingEvidencesList.forEach(ev => {
      if (!ev) return;
      const f = ev.fase || 'Fase de Formación';
      let act = ev.actividadProyecto || 'Sin Actividad';
      if (/GA(\d+)/i.test(act)) {
        act = act.replace(/GA(\d+)/gi, 'AP$1');
      }
      
      if (!groups[f]) {
        groups[f] = {};
      }
      if (!groups[f][act]) {
        groups[f][act] = [];
      }
      groups[f][act].push(ev);
    });
    
    return groups;
  }, [pendingEvidencesList]);

  const modalEvidencesList = useMemo(() => {
    if (!selectedLearnerForEvidences) return [];
    
    const evs = selectedLearnerForEvidences.evidencias || {};
    return Object.entries(evs).map(([header, value]) => {
      let valStr = '';
      let detail: any = null;
      if (typeof value === 'object' && value !== null) {
        valStr = (value as any).estado;
        detail = value;
      } else {
        valStr = String(value);
      }
      
      if (detail) {
        return {
          nombre: detail.nombre || header,
          codigo: detail.codigo || '',
          actividadProyecto: detail.actividadProyecto || 'Sin Actividad',
          fase: detail.fase || 'Fase de Formación',
          tipo: detail.tipo || 'Evidencia',
          estado: valStr
        };
      } else {
        const norm = header.toLowerCase();
        let tipo = 'Evidencia';
        if (norm.includes('prueba') || norm.includes('evaluacion') || norm.includes('cuestionario')) {
          tipo = 'Prueba de Conocimiento';
        } else if (norm.includes('foro')) {
          tipo = 'Foro';
        }
        
        let codigo = header;
        let act = 'Sin Actividad';
        const matchCode = header.match(/(GA\d+-[A-Za-z0-9_-]+)/i);
        if (matchCode) {
          codigo = matchCode[1].toUpperCase();
          const actMatch = codigo.match(/^(GA\d+)/i);
          if (actMatch) {
            act = actMatch[1].toUpperCase();
          }
        } else {
          const gaMatch = header.match(/(GA\d+)/i);
          if (gaMatch) {
            act = gaMatch[1].toUpperCase();
          }
        }
        
        return {
          nombre: header,
          codigo,
          actividadProyecto: act,
          fase: 'Fase de Formación',
          tipo,
          estado: valStr
        };
      }
    });
  }, [selectedLearnerForEvidences]);

  const filteredModalEvidencesList = useMemo(() => {
    if (modalStateFilter === 'Todas') {
      return modalEvidencesList;
    }
    return modalEvidencesList.filter(ev => ev.estado === modalStateFilter);
  }, [modalEvidencesList, modalStateFilter]);

  // Group the filtered list by Fase and Actividad de Proyecto (using AP nomenclature for grouping / visual)
  const groupedModalEvidences = useMemo(() => {
    const groups: Record<string, Record<string, any[]>> = {};
    
    filteredModalEvidencesList.forEach(ev => {
      if (!ev) return;
      const f = ev.fase || 'Fase de Formación';
      
      let actFormatted = ev.actividadProyecto || 'Sin Actividad';
      if (/GA(\d+)/i.test(actFormatted)) {
        actFormatted = actFormatted.replace(/GA(\d+)/gi, 'AP$1');
      }
      
      if (!groups[f]) {
        groups[f] = {};
      }
      if (!groups[f][actFormatted]) {
        groups[f][actFormatted] = [];
      }
      groups[f][actFormatted].push(ev);
    });
    
    return groups;
  }, [filteredModalEvidencesList]);

  const toggleRowExpand = (id: string) => {
    setExpandedDocIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Helper getters for metrics
  const getDCount = (ap: Aprendiz) => {
    if (!ap || !ap.evidencias) return 0;
    return Object.values(ap.evidencias).filter(v => {
      const valStr = v && typeof v === 'object' ? (v as any).estado : String(v);
      return valStr === 'D';
    }).length;
  };

  const getNoEntregasCount = (ap: Aprendiz) => {
    if (!ap || !ap.evidencias) return 0;
    return Object.values(ap.evidencias).filter(v => {
      const valStr = v && typeof v === 'object' ? (v as any).estado : String(v);
      return valStr === '-';
    }).length;
  };

  const getACount = (ap: Aprendiz) => {
    if (!ap || !ap.evidencias) return 0;
    return Object.values(ap.evidencias).filter(v => {
      const valStr = v && typeof v === 'object' ? (v as any).estado : String(v);
      return valStr === 'A';
    }).length;
  };

  const getTotalCount = (ap: Aprendiz) => {
    if (!ap || !ap.evidencias) return 0;
    return Object.keys(ap.evidencias).length;
  };

  // Filter and sort learners
  const processedAprendices = useMemo(() => {
    let list = [...aprendices].filter(Boolean);

    // 1. Search Query (name or document)
    if (filterSearch.trim()) {
      const q = filterSearch.toLowerCase().trim();
      list = list.filter(
        ap => (ap.nombre || '').toLowerCase().includes(q) || (ap.documento || '').includes(q)
      );
    }

    // 2. Risk Card Filter
    if (filterRiesgo !== 'Todos') {
      list = list.filter(ap => (ap.estadoSeguimiento || 'Riesgo bajo') === filterRiesgo);
    }

    // 3. Intervention State Dropdown Filter
    if (filterEstado !== 'Todos') {
      list = list.filter(ap => (ap.estadoIntervencion || 'Sin intervención') === filterEstado);
    }

    // 4. Permanencia Alert Filter
    if (filterPermanencia !== 'Todos') {
      list = list.filter(ap => {
        if (filterPermanencia === 'Posible deserción') {
          return getAlertaPermanencia(ap) === 'Posible deserción';
        } else if (filterPermanencia === 'Acceso crítico') {
          const access = getLmsAccessState(ap);
          return access.includes('días sin acceso') || access === 'Nunca ingresó';
        } else if (filterPermanencia === 'Sin alerta') {
          return getAlertaPermanencia(ap) === 'Sin alerta';
        }
        return true;
      });
    }

    // 4. Sorting logic
    if (sortColumn) {
      list.sort((a, b) => {
        let valA: any = a[sortColumn as keyof Aprendiz];
        let valB: any = b[sortColumn as keyof Aprendiz];

        // Custom metrics sorting overrides
        if (sortColumn === 'evidencias_d') {
          valA = getDCount(a);
          valB = getDCount(b);
        } else if (sortColumn === 'no_entregadas') {
          valA = getNoEntregasCount(a);
          valB = getNoEntregasCount(b);
        } else if (sortColumn === 'evidencias_a') {
          valA = getACount(a);
          valB = getACount(b);
        } else if (sortColumn === 'total_evidencias') {
          valA = getTotalCount(a);
          valB = getTotalCount(b);
        }

        // Handle string comparison with localeCompare
        if (typeof valA === 'string' && typeof valB === 'string') {
          return sortDirection === 'asc' 
            ? valA.localeCompare(valB) 
            : valB.localeCompare(valA);
        }

        // Handle numbers/nulls
        if (valA === null || valA === undefined) valA = -1;
        if (valB === null || valB === undefined) valB = -1;

        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return list;
  }, [aprendices, filterSearch, filterRiesgo, filterEstado, filterPermanencia, sortColumn, sortDirection]);

  // Total filtered learners IDs for toggle select all
  const filteredIds = useMemo(() => {
    return processedAprendices.map(a => a.documento);
  }, [processedAprendices]);

  const handleSort = (col: string) => {
    if (sortColumn === col) {
      onSortDirectionChange(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      onSortColumnChange(col);
      onSortDirectionChange('asc');
    }
  };

  // Generate individual files, put them into JSZip and trigger FileSaver
  const handleExportSelectedZip = async () => {
    const selectedLearners = aprendices.filter(ap => selectedIds.includes(ap.documento));
    if (selectedLearners.length === 0) return;

    setZipExporting(true);
    try {
      const zip = new JSZip();
      
      selectedLearners.forEach(ap => {
        const doc = generarPdfIndividual(ap, fichaInfo);
        const pdfBlob = doc.output('blob');
        const safeName = `${ap.documento}_${ap.nombre.trim().replace(/\s+/g, '_')}.pdf`;
        zip.file(safeName, pdfBlob);
      });

      const zipContent = await zip.generateAsync({ type: 'blob' });
      saveAs(zipContent, `Planes_Acompañamiento_Ficha_${fichaInfo.numeroFicha || 'Sena'}.zip`);
    } catch (e) {
      console.error(e);
      alert('Error al compilar el archivo ZIP de reportes.');
    } finally {
      setZipExporting(false);
    }
  };

  const selectedLearnersCount = selectedIds.length;
  const isAllSelected = filteredIds.length > 0 && filteredIds.every(id => selectedIds.includes(id));
  const isPartiallySelected = filteredIds.some(id => selectedIds.includes(id)) && !isAllSelected;

  const currentSelectedLearnerObjects = useMemo(() => {
    return aprendices.filter(ap => selectedIds.includes(ap.documento));
  }, [aprendices, selectedIds]);

  return (
    <div className="bg-white rounded-2xl border border-slate-150 shadow-[0_4px_25px_rgba(0,0,0,0.015)] overflow-hidden flex flex-col h-full" id="alert-table-module">
      
      {/* Search and Filters Strip */}
      <div className="p-5 bg-slate-50/50 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
        
        {/* Search input with premium styling */}
        <div className="relative w-full md:max-w-xs">
          <input
            type="text"
            placeholder="Buscar por aprendiz o documento..."
            value={filterSearch}
            onChange={e => onFilterSearchChange(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 bg-white font-medium shadow-4xs transition-all"
            id="learner-search-input"
          />
          <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
        </div>

        {/* Dropdowns and quick actions info */}
        <div className="flex flex-wrap items-center gap-3">
          
          {/* Risk Badge indicators filter status */}
          {filterRiesgo !== 'Todos' && (
            <span className="bg-[#39A900]/10 text-emerald-800 text-[10px] px-2.5 py-1.5 rounded-lg font-bold flex items-center gap-1.5 shrink-0 border border-[#39A900]/10">
              <Filter className="w-3.5 h-3.5 text-[#39A900]" />
              Seguimiento: {filterRiesgo}
              <button onClick={() => onFilterRiesgoChange('Todos')} className="text-[#39A900] hover:text-[#007832] px-1 font-black">×</button>
            </span>
          )}

          {/* Alerta Permanencia Dropdown Filter */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-slate-500 font-semibold uppercase tracking-wider text-[10px]">Alerta Permanencia:</span>
            <select
              value={filterPermanencia}
              onChange={e => setFilterPermanencia(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-xl focus:ring-1 focus:ring-emerald-500 bg-white font-bold text-slate-700 cursor-pointer shadow-4xs"
            >
              <option value="Todos">Mostrar Todas</option>
              <option value="Posible deserción">Posible deserción</option>
              <option value="Acceso crítico">Acceso crítico</option>
              <option value="Sin alerta">Sin alerta</option>
            </select>
          </div>

          {/* Intervention state selector premium styling */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-slate-500 font-semibold uppercase tracking-wider text-[10px]">Intervención:</span>
            <select
              value={filterEstado}
              onChange={e => onFilterEstadoChange(e.target.value as any)}
              className="px-3 py-2 border border-slate-200 rounded-xl focus:ring-1 focus:ring-emerald-500 bg-white font-bold text-slate-700 cursor-pointer shadow-4xs"
            >
              <option value="Todos">Mostrar Todos</option>
              <option value="Sin intervención">Sin intervención</option>
              <option value="En seguimiento">En seguimiento</option>
              <option value="Intervenido">Intervenido</option>
            </select>
          </div>

          {/* Clear filters quickly */}
          {(filterSearch || filterRiesgo !== 'Todos' || filterEstado !== 'Todos' || filterPermanencia !== 'Todos') && (
            <button
              onClick={() => {
                onFilterSearchChange('');
                onFilterRiesgoChange('Todos');
                onFilterEstadoChange('Todos');
                setFilterPermanencia('Todos');
              }}
              className="text-[#39A900] hover:text-[#007832] font-black cursor-pointer py-2 px-3 hover:bg-emerald-50 rounded-xl transition-colors border border-transparent hover:border-emerald-100"
            >
              Restablecer
            </button>
          )}

        </div>
      </div>

      {/* Main Table */}
      <div className="overflow-x-auto lg:overflow-x-visible flex-1">
        <table className="w-full text-left border-collapse min-w-[750px]" id="learners-alert-table">
          <thead>
            <tr className="bg-slate-50/70 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest select-none">
              <th className="py-4 px-4 w-12 text-center">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  ref={el => {
                    if (el) el.indeterminate = isPartiallySelected;
                  }}
                  onChange={() => onToggleSelectAll(filteredIds)}
                  className="rounded-md border-slate-300 text-[#39A900] focus:ring-emerald-500 cursor-pointer w-4 h-4 transition-all"
                  title="Seleccionar todos filtrados"
                />
              </th>
              <th onClick={() => handleSort('nombre')} className="py-4 px-4 cursor-pointer hover:bg-slate-100/50 transition-colors w-72">
                <div className="flex items-center gap-1.5">
                  <span>Aprendiz</span>
                  <ArrowUpDown className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                </div>
              </th>
              <th className="py-4 px-4 text-center w-56">
                <div>Evidencias</div>
                <div className="text-[9px] text-slate-400 font-medium normal-case tracking-normal mt-0.5">Enviadas | A | D | Pend | Total</div>
              </th>
              <th className="py-4 px-4 w-52">
                <span>Último acceso</span>
              </th>
              <th className="py-4 px-4 w-40 text-center">
                <span>Alerta</span>
              </th>
              <th className="py-4 px-4 w-44 text-center">
                <span>Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {processedAprendices.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-16 text-center text-slate-400 font-medium italic bg-white">
                  No se encontraron aprendices con los filtros seleccionados.
                </td>
              </tr>
            ) : (
              processedAprendices.map(ap => {
                const isExpanded = expandedDocIds.includes(ap.documento);
                const isChecked = selectedIds.includes(ap.documento);
                const showFicha = ap.numeroFicha || (fichaInfo && fichaInfo.numeroFicha);
                const pendingCount = getNoEntregasCount(ap);

                return (
                  <React.Fragment key={ap.documento}>
                    {/* Primary Row - compact, clean and professional (60px-72px height range) */}
                    <tr className={`transition-only-bg duration-150 text-slate-700 border-b border-slate-100 ${rowColorNivel(ap.nivelRiesgo)} ${isChecked ? 'bg-emerald-50/15' : 'hover:bg-slate-50/30'}`}>
                      {/* Column 1: Selección */}
                      <td className="py-2.5 px-4 text-center w-12">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => onToggleSelect(ap.documento)}
                          className="rounded-md border-slate-300 text-[#39A900] focus:ring-emerald-500 cursor-pointer w-4 h-4"
                        />
                      </td>
                      
                      {/* Column 2: Aprendiz (Compact, no repetitive labels) */}
                      <td className="py-2.5 px-4">
                        <div className="font-bold text-slate-900 text-[13.5px] leading-snug hover:text-[#39A900] transition-colors">{ap.nombre}</div>
                        <div className="text-[11px] text-slate-500 font-medium leading-none mt-1">
                          <span className="font-mono text-slate-650">{ap.documento}</span>
                          <span className="text-slate-300 mx-1.5">•</span>
                          <span className="font-mono text-slate-600" title={ap.correo}>{ap.correo}</span>
                        </div>
                      </td>

                      {/* Column 3: Evidencias (Compact numbers, Enviadas calculation and color-coded progress bar) */}
                      <td className="py-2.5 px-4 text-center">
                        {(() => {
                          const aprobadas = getACount(ap);
                          const desaprobadas = getDCount(ap);
                          const totalEnviadas = aprobadas + desaprobadas;
                          const total = getTotalCount(ap);
                          
                          return (
                            <>
                              <div className="text-xs font-bold text-slate-800">
                                Enviadas: <span className="text-[#39A900] font-extrabold">{totalEnviadas}</span>
                              </div>
                              <div className="text-[11px] text-slate-500 font-medium mt-0.5 whitespace-nowrap select-none">
                                <span className="text-emerald-600 font-bold" title="Aprobadas">A: {aprobadas}</span>
                                <span className="text-slate-300 mx-1">|</span>
                                <span className="text-rose-600 font-bold" title="Desaprobadas">D: {desaprobadas}</span>
                                <span className="text-slate-300 mx-1">|</span>
                                <span className="text-amber-600 font-bold" title="Pendientes">Pend: {pendingCount}</span>
                                <span className="text-slate-300 mx-1">|</span>
                                <span className="text-slate-700 font-bold" title="Total">Total: {total}</span>
                              </div>
                              {/* Compact horizontal progress bar */}
                              {total > 0 && (
                                <div className="flex h-1.5 w-full max-w-[130px] mx-auto rounded-full overflow-hidden bg-slate-100 mt-1.5 border border-slate-200/45">
                                  {aprobadas > 0 && (
                                    <div 
                                      className="bg-emerald-500 transition-all duration-300" 
                                      style={{ width: `${(aprobadas / total) * 100}%` }}
                                      title={`Aprobadas: ${aprobadas}`}
                                    />
                                  )}
                                  {desaprobadas > 0 && (
                                    <div 
                                      className="bg-rose-500 transition-all duration-300" 
                                      style={{ width: `${(desaprobadas / total) * 100}%` }}
                                      title={`Desaprobadas: ${desaprobadas}`}
                                    />
                                  )}
                                  {pendingCount > 0 && (
                                    <div 
                                      className="bg-amber-500 transition-all duration-300" 
                                      style={{ width: `${(pendingCount / total) * 100}%` }}
                                      title={`Pendientes: ${pendingCount}`}
                                    />
                                  )}
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </td>

                      {/* Column 4: Último acceso */}
                      <td className="py-2.5 px-4 text-left">
                        <div className="text-[12px] font-bold">
                          {ap.estadoAcceso === 'Nunca ingresó' ? (
                            <span className="text-rose-600">Nunca ingresó</span>
                          ) : ap.estadoAcceso === 'Sin dato reportado' || !ap.ultimoAcceso ? (
                            <span className="text-slate-500 font-medium">Sin dato reportado</span>
                          ) : ap.diasSinAcceso !== null && ap.diasSinAcceso !== undefined ? (
                            <span className="text-slate-800">{ap.diasSinAcceso} días sin acceso</span>
                          ) : (
                            <span className="text-emerald-700">Acceso reciente</span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1">
                          Último ingreso: <span className="font-mono text-slate-500">{ap.ultimoAcceso || 'Sin registro'}</span>
                        </div>
                      </td>

                      {/* Column 5: Alerta (Compact badge) */}
                      <td className="py-2.5 px-4 text-center">
                        {renderAlertaBadge(ap)}
                      </td>

                      {/* Column 6: Acciones (Compact Ver detalles & ... dropdown) */}
                      <td className="py-2.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Ver detalles button */}
                          <button
                            type="button"
                            onClick={() => toggleRowExpand(ap.documento)}
                            className="bg-slate-800 hover:bg-slate-900 text-white text-[11px] py-1.5 px-3 rounded-md font-extrabold transition-all cursor-pointer shadow-3xs flex items-center gap-1 shrink-0"
                          >
                            {isExpanded ? 'Cerrar' : 'Ver detalles'}
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>

                          {/* Secondary dropdown button */}
                          <div className="relative inline-block text-left">
                            <button
                              type="button"
                              onClick={() => setOpenActionMenuId(openActionMenuId === ap.documento ? null : ap.documento)}
                              className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] p-1.5 rounded-md font-bold transition-all cursor-pointer flex items-center justify-center border border-slate-200 shrink-0 h-[28px] w-[28px]"
                              title="Acciones adicionales"
                            >
                              <MoreVertical className="w-3.5 h-3.5 text-slate-600" />
                            </button>
                            {openActionMenuId === ap.documento && (
                              <>
                                <div 
                                  className="fixed inset-0 z-30" 
                                  onClick={() => setOpenActionMenuId(null)}
                                />
                                <div className="absolute right-0 mt-1.5 w-56 bg-white border border-slate-200 rounded-xl shadow-lg z-40 py-1.5 font-bold text-slate-700 text-[11px] animate-fade-in text-left">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onEnviarLlamado(ap);
                                      setOpenActionMenuId(null);
                                    }}
                                    className="w-full text-left px-4 py-2 hover:bg-slate-50 transition-colors flex items-center gap-2 cursor-pointer text-rose-700"
                                  >
                                    <Mail className="w-3.5 h-3.5 text-rose-500" />
                                    Enviar llamado
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setBienestarReferralLearner(ap);
                                      setIsReferralSent(false);
                                      setCauseBienestar(ap.diasSinAcceso && ap.diasSinAcceso > 30 
                                        ? 'Inasistencia reiterada superior a 30 días sin justificar'
                                        : 'Desmotivación académica / Cambio de programa de formación');
                                      setDescriptionBienestar('');
                                      setOpenActionMenuId(null);
                                    }}
                                    className="w-full text-left px-4 py-2 hover:bg-slate-50 transition-colors flex items-center gap-2 cursor-pointer text-red-700"
                                  >
                                    <Heart className="w-3.5 h-3.5 text-rose-500 fill-current" />
                                    Remitir a Bienestar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setImprovementPlanLearner(ap);
                                      setIsPlanSaved(false);
                                      setStrategiesPlan('Sustentar de forma presencial u online las evidencias desaprobadas y pendientes mediante la entrega de talleres prácticos complementarios.');
                                      setCommitmentPlan('Me comprometo formalmente a asistir a las tutorías de acompañamiento docente y a realizar el cargue extemporáneo del portafolio en la plataforma LMS.');
                                      setOpenActionMenuId(null);
                                    }}
                                    className="w-full text-left px-4 py-2 hover:bg-slate-50 transition-colors flex items-center gap-2 cursor-pointer text-emerald-700"
                                  >
                                    <FileText className="w-3.5 h-3.5 text-emerald-600" />
                                    Generar plan
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (!isExpanded) {
                                        toggleRowExpand(ap.documento);
                                      }
                                      setOpenActionMenuId(null);
                                      setTimeout(() => {
                                        const el = document.getElementById(`expanded-row-${ap.documento}`);
                                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                                      }, 150);
                                    }}
                                    className="w-full text-left px-4 py-2 hover:bg-slate-50 transition-colors flex items-center gap-2 cursor-pointer border-t border-slate-100 text-slate-700"
                                  >
                                    <Eye className="w-3.5 h-3.5 text-amber-500" />
                                    Ver historial de llamados
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (!isExpanded) {
                                        toggleRowExpand(ap.documento);
                                      }
                                      setOpenActionMenuId(null);
                                      setTimeout(() => {
                                        const el = document.getElementById(`expanded-row-${ap.documento}`);
                                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                                      }, 150);
                                    }}
                                    className="w-full text-left px-4 py-2 hover:bg-slate-50 transition-colors flex items-center gap-2 cursor-pointer text-slate-600"
                                  >
                                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                                    Ver historial de correos enviados
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>

                    {/* Expandable Subrow with premium bento-style analysis */}
                    {isExpanded && (
                      <tr className="bg-slate-50/70 border-b border-slate-200" id={`expanded-row-${ap.documento}`}>
                        <td colSpan={6} className="py-5 px-6 border-l-4 border-l-slate-400">
                          {/* Banner de Contacto y Datos Completos - ensures phone, mail, and other data are highly visible inside "Ver detalles" */}
                          <div className="bg-white p-3.5 rounded-xl border border-slate-150 shadow-3xs flex flex-wrap items-center justify-between gap-4 mb-4 select-none">
                            <div className="flex items-center gap-3">
                              <div className="bg-slate-800 text-white rounded-full w-9 h-9 flex items-center justify-center font-bold text-sm">
                                {ap.nombre.charAt(0)}
                              </div>
                              <div>
                                <div className="font-bold text-slate-900 text-sm">{ap.nombre}</div>
                                <div className="text-[11px] text-slate-500 mt-0.5">
                                  Documento: <span className="font-mono text-slate-800 font-bold bg-slate-100 px-1 py-0.2 rounded">{ap.documento}</span> • Correo: <span className="text-slate-700 font-mono">{ap.correo}</span>
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold text-slate-600">
                              {ap.telefono && (
                                <div className="bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-150/65 flex items-center gap-1">
                                  <span className="text-slate-400">Teléfono:</span> <span className="text-emerald-700 font-bold">📞 {ap.telefono}</span>
                                </div>
                              )}
                              {showFicha && (
                                <div className="bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-150/65 flex items-center gap-1">
                                  <span className="text-slate-400">Ficha:</span> <span className="text-slate-800 font-mono font-bold">{showFicha}</span>
                                </div>
                              )}
                              {ap.estadoIntervencion && (
                                <div className="bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-150/65 flex items-center gap-1">
                                  <span className="text-slate-400">Intervención:</span> {badgeEstado(ap.estadoIntervencion)}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-slate-700">
                            
                            {/* Panel A: Detalle Académico */}
                            <div className="bg-white p-4 rounded-xl border border-slate-150 shadow-2xs space-y-3 flex flex-col justify-between">
                              <div>
                                <h4 className="font-bold text-slate-800 border-b border-slate-100 pb-1.5 uppercase tracking-wide text-[10px] flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#39A900]"></span>
                                  A. Detalle Académico
                                </h4>
                                <div className="grid grid-cols-2 gap-2 text-[11px] mt-2">
                                  <div className="bg-slate-50 p-2 rounded border border-slate-100">
                                    <span className="text-slate-400 block font-medium">Evidencias Totales</span>
                                    <span className="font-black text-slate-850 text-xs">{getTotalCount(ap)}</span>
                                  </div>
                                  <div className="bg-emerald-50/30 p-2 rounded border border-emerald-100/50">
                                    <span className="text-emerald-700/75 block font-medium">Aprobadas</span>
                                    <span className="font-black text-emerald-800 text-xs">{getACount(ap)}</span>
                                  </div>
                                  <div className="bg-rose-50/30 p-2 rounded border border-rose-100/50">
                                    <span className="text-rose-700/75 block font-medium">Desaprobadas</span>
                                    <span className="font-black text-rose-800 text-xs">{getDCount(ap)}</span>
                                  </div>
                                  <div className="bg-amber-50/30 p-2 rounded border border-amber-100/50">
                                    <span className="text-amber-700/75 block font-medium">Pendientes</span>
                                    <span className="font-black text-amber-800 text-xs">{pendingCount}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Pending Evidences List */}
                              {pendingCount > 0 && (
                                <div className="mt-3 pt-3 border-t border-slate-100">
                                  <span className="font-black text-[9.5px] text-slate-500 uppercase block mb-1">Listado de pendientes:</span>
                                  <div className="max-h-32 overflow-y-auto space-y-1 font-mono text-[9.5px]">
                                    {getLearnerPendingEvidences(ap).map((ev, idx) => (
                                      <div key={idx} className="bg-slate-50 p-1 rounded border border-slate-150/60 flex items-start gap-1 text-slate-600">
                                        <span className="text-amber-600 font-bold">•</span>
                                        <span className="truncate" title={ev.nombre}>{ev.nombre}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Panel B & C: Acceso LMS & Permanencia */}
                            <div className="bg-white p-4 rounded-xl border border-slate-150 shadow-2xs space-y-3 flex flex-col justify-between">
                              <div className="space-y-3">
                                <h4 className="font-bold text-slate-800 border-b border-slate-100 pb-1.5 uppercase tracking-wide text-[10px] flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                                  B. Acceso LMS & C. Permanencia
                                </h4>
                                
                                <div className="space-y-2">
                                  <div>
                                    <span className="text-slate-400 block font-medium text-[10px]">Último acceso reportado</span>
                                    <span className="font-bold text-slate-800 text-[11px]">{ap.ultimoAcceso || 'No registra accesos recientes / Nunca ingresó'}</span>
                                  </div>
                                  
                                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                                    <div>
                                      <span className="text-slate-400 block font-medium text-[10px]">Inasistencia</span>
                                      <span className="font-extrabold text-slate-850 text-xs">
                                        {ap.diasSinAcceso !== null && ap.diasSinAcceso !== undefined ? `${ap.diasSinAcceso} días sin ingreso` : 'Sin datos'}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-slate-400 block font-medium text-[10px]">Estado de acceso</span>
                                      <span className={`inline-block font-extrabold text-[9px] uppercase px-1.5 py-0.2 rounded mt-0.5 border ${
                                        ap.estadoAcceso === 'Nunca ingresó'
                                          ? 'bg-rose-50 text-rose-700 border-rose-200 animate-pulse'
                                          : ap.estadoAcceso === 'Acceso crítico'
                                          ? 'bg-red-50 text-red-700 border-red-200'
                                          : ap.estadoAcceso === 'Sin dato reportado'
                                          ? 'bg-slate-50 text-slate-500 border-slate-200'
                                          : 'bg-emerald-50 text-emerald-750 border-emerald-200'
                                      }`}>
                                        {ap.estadoAcceso || 'Sin dato reportado'}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="pt-2 border-t border-slate-100">
                                    <span className="text-slate-400 block font-medium text-[10px]">Estado de Permanencia</span>
                                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-extrabold border mt-1 ${
                                      ap.estadoSeguimiento === 'Posible deserción'
                                        ? 'bg-rose-100 text-rose-800 border-rose-300'
                                        : ap.estadoSeguimiento === 'Riesgo alto'
                                        ? 'bg-red-50 text-red-700 border-red-200'
                                        : ap.estadoSeguimiento === 'Riesgo medio'
                                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                                        : ap.estadoSeguimiento === 'Sin dato suficiente'
                                        ? 'bg-slate-50 text-slate-500 border-slate-200'
                                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    }`}>
                                      {ap.estadoSeguimiento || 'Sin dato suficiente'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              
                              <div className="pt-2 border-t border-slate-100 space-y-1">
                                <div>
                                  <span className="text-slate-400 block font-medium text-[10px]">Alerta de permanencia</span>
                                  <span className="font-bold text-slate-700 text-[11px] block">{getAlertaPermanencia(ap)}</span>
                                </div>
                                <div>
                                  <span className="text-slate-400 block font-medium text-[10px]">Acción recomendada</span>
                                  <span className="font-black text-emerald-700 text-[11px] block">
                                    {ap.estadoSeguimiento === 'Posible deserción' ? 'Remitir a Bienestar al Aprendiz' : (ap.accionRecomendada || 'No requiere acción')}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Panel D & E: Historial de Seguimiento */}
                            <div className="bg-white p-4 rounded-xl border border-slate-150 shadow-2xs space-y-3">
                              <h4 className="font-bold text-slate-800 border-b border-slate-100 pb-1.5 uppercase tracking-wide text-[10px] flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                D. Historial de Llamados & E. Intervenciones
                              </h4>
                              <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
                                
                                {/* D. Historial de llamados */}
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                                    <span className="font-bold text-[9.5px] text-slate-500 uppercase block">D. Historial de llamados:</span>
                                    {(() => {
                                      const count = (ap.historialIntervenciones || []).filter(isAcademicCall).length;
                                      return (
                                        <span className="text-[10px] font-black bg-red-100 text-red-850 px-2.5 py-0.5 rounded-full">
                                          Llamados registrados: {count}
                                        </span>
                                      );
                                    })()}
                                  </div>
                                  
                                  {(() => {
                                    const allLlamadosChronological = (ap.historialIntervenciones || [])
                                      .filter(isAcademicCall)
                                      .sort((a, b) => {
                                        const dateA = parseSpanishDate(a.fecha);
                                        const dateB = parseSpanishDate(b.fecha);
                                        if (dateA !== dateB) {
                                          return dateA - dateB;
                                        }
                                        const indexA = ap.historialIntervenciones.indexOf(a);
                                        const indexB = ap.historialIntervenciones.indexOf(b);
                                        return indexB - indexA; // older (higher index) first
                                      });
                                    
                                    if (allLlamadosChronological.length === 0) {
                                      return <span className="text-slate-400 italic text-[11px] block pl-1">Sin llamados registrados en esta ficha</span>;
                                    }
                                    
                                    // Order newest first for visualization
                                    const listToShow = [...allLlamadosChronological].reverse();
                                    
                                    return (
                                      <div className="space-y-3">
                                        {listToShow.map((ll) => {
                                          const chronologicalIndex = allLlamadosChronological.indexOf(ll);
                                          const numCall = chronologicalIndex + 1;
                                          const label = getOrdinalLlamadoText(numCall);
                                          const uniqueId = ll.id || `${ap.documento}-${ll.fecha}-${numCall}`;
                                          const isExpanded = expandedLlamadoId === uniqueId;
                                          
                                          // Parse the detailed log string using our robust parser
                                          const parsed = parseLlamadoDetalle(ll.detalle || '', {
                                            fecha: ll.fecha,
                                            instructor: ll.instructor,
                                            tipoSeguimiento: ll.tipoSeguimiento,
                                            estadoIntervencion: ll.estadoIntervencion,
                                            observaciones: ll.observaciones || `Llamado de atención #${numCall} registrado.`
                                          });

                                          // Fallback to ap.correo if destinatario not in details
                                          const destinatarioFinal = parsed.destinatario || ap.correo || 'No registrado';
                                          
                                          return (
                                            <div 
                                              key={uniqueId} 
                                              className={`transition-all duration-200 rounded-xl border ${
                                                isExpanded 
                                                  ? 'bg-red-50/20 border-red-200 shadow-xs ring-1 ring-red-100' 
                                                  : 'bg-slate-50/65 hover:bg-slate-50 border-slate-200/70 hover:border-slate-300'
                                              } text-[11px] text-slate-700`}
                                            >
                                              {/* Compact Card Header / Header Trigger */}
                                              <button
                                                type="button"
                                                onClick={() => setExpandedLlamadoId(isExpanded ? null : uniqueId)}
                                                className="w-full text-left p-3 flex flex-col gap-1.5 focus:outline-none cursor-pointer"
                                              >
                                                <div className="flex items-center justify-between font-black text-red-800 text-xs w-full">
                                                  <span className="flex items-center gap-1.5 font-extrabold">
                                                    <span className={`w-1.5 h-1.5 rounded-full ${isExpanded ? 'bg-red-650 animate-pulse' : 'bg-red-400'}`}></span>
                                                    {label}
                                                  </span>
                                                  <div className="flex items-center gap-2">
                                                    <span className="text-slate-500 font-bold text-[10px]">{ll.fecha}</span>
                                                    {isExpanded ? (
                                                      <ChevronUp className="w-4 h-4 text-slate-400" />
                                                    ) : (
                                                      <ChevronDown className="w-4 h-4 text-slate-400" />
                                                    )}
                                                  </div>
                                                </div>
                                                
                                                <div className="space-y-0.5 text-[10.5px] text-slate-600 font-medium">
                                                  <div>
                                                    <span className="text-slate-400 font-bold">Medio:</span> {ll.tipoSeguimiento || 'Correo de llamado a ponerse al día'}
                                                  </div>
                                                  <div>
                                                    <span className="text-slate-400 font-bold">Registro:</span> {ll.instructor || 'Instructor responsable'}
                                                  </div>
                                                </div>
                                              </button>
                                              
                                              {/* Expanded Details Body */}
                                              {isExpanded && (
                                                <div className="px-3 pb-3 pt-1.5 border-t border-slate-100 space-y-3 animate-fade-in text-[10.5px]">
                                                  {/* Metadata Grid */}
                                                  <div className="grid grid-cols-2 gap-2 bg-white/85 p-2 rounded-lg border border-slate-200/60 shadow-5xs text-left">
                                                    <div>
                                                      <span className="text-slate-400 block text-[9px] uppercase font-bold">Destinatario</span>
                                                      <span className="font-semibold text-slate-800 truncate block">{destinatarioFinal}</span>
                                                    </div>
                                                    <div>
                                                      <span className="text-slate-400 block text-[9px] uppercase font-bold">Asunto</span>
                                                      <span className="font-semibold text-slate-800 truncate block" title={parsed.asunto}>{parsed.asunto}</span>
                                                    </div>
                                                    <div>
                                                      <span className="text-slate-400 block text-[9px] uppercase font-bold">Fecha / Hora exacta</span>
                                                      <span className="font-semibold text-slate-800 flex items-center gap-1">
                                                        <Clock className="w-3 h-3 text-slate-400" />
                                                        {parsed.fechaHora || ll.fecha}
                                                      </span>
                                                    </div>
                                                    <div>
                                                      <span className="text-slate-400 block text-[9px] uppercase font-bold">Estado del llamado</span>
                                                      <span className="inline-block bg-emerald-50 text-emerald-800 text-[9px] font-extrabold px-1.5 py-0.5 rounded border border-emerald-200">
                                                        {ll.estadoIntervencion || 'Enviado'}
                                                      </span>
                                                    </div>
                                                    <div className="col-span-2 pt-1 border-t border-slate-100">
                                                      <span className="text-slate-400 block text-[9px] uppercase font-bold">Observación</span>
                                                      <p className="font-semibold text-slate-700 italic">"{parsed.observacion || ll.observaciones || `Llamado de atención #${numCall} registrado.`}"</p>
                                                    </div>
                                                  </div>

                                                  {/* Academic Metric Summary Context */}
                                                  <div className="bg-slate-50/50 p-2.5 rounded-lg border border-slate-200/50 space-y-1.5 text-left">
                                                    <span className="text-slate-500 block text-[9px] uppercase font-bold tracking-wider">Métricas Académicas Registradas</span>
                                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
                                                      <div>
                                                        <span className="text-slate-400 block">Último Ingreso:</span>
                                                        <span className="font-bold text-slate-700">{parsed.ultimoAcceso || 'No registrado'}</span>
                                                      </div>
                                                      <div>
                                                        <span className="text-slate-400 block">Días sin Acceso:</span>
                                                        <span className="font-bold text-amber-700">{parsed.diasSinAcceso} días</span>
                                                      </div>
                                                      <div>
                                                        <span className="text-slate-400 block">Evidencias Totales:</span>
                                                        <span className="font-bold text-slate-700">{parsed.totalEvidencias}</span>
                                                      </div>
                                                      <div>
                                                        <span className="text-slate-400 block">Pendientes:</span>
                                                        <span className="font-extrabold text-red-650">{parsed.evidenciasPendientes}</span>
                                                      </div>
                                                    </div>
                                                    <div className="flex gap-4 text-[9px] text-slate-500 font-mono border-t border-slate-200/50 pt-1">
                                                      <span>Enviadas: <strong className="text-slate-700">{parsed.evidenciasEnviadas}</strong></span>
                                                      <span>Aprobadas: <strong className="text-emerald-700">{parsed.evidenciasAprobadas}</strong></span>
                                                      <span>Desaprobadas: <strong className="text-rose-600">{parsed.evidenciasDesaprobadas}</strong></span>
                                                    </div>
                                                  </div>

                                                  {/* Mail Body text box */}
                                                  <div className="space-y-1 text-left">
                                                    <div className="flex items-center justify-between">
                                                      <span className="text-slate-400 text-[9px] uppercase font-extrabold">Cuerpo del mensaje enviado:</span>
                                                      <button
                                                        type="button"
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          navigator.clipboard.writeText(parsed.cuerpo);
                                                          setCopiedCallId(uniqueId);
                                                          setTimeout(() => setCopiedCallId(null), 2000);
                                                        }}
                                                        className="text-[9px] text-red-600 hover:text-red-800 font-black flex items-center gap-1 cursor-pointer"
                                                      >
                                                        {copiedCallId === uniqueId ? (
                                                          <>
                                                            <Check className="w-3 h-3 text-emerald-600" />
                                                            <span className="text-emerald-700">¡Copiado!</span>
                                                          </>
                                                        ) : (
                                                          <>
                                                            <Copy className="w-3 h-3" />
                                                            <span>Copiar cuerpo</span>
                                                          </>
                                                        )}
                                                      </button>
                                                    </div>
                                                    <div className="bg-white p-2.5 rounded-lg border border-slate-200 font-mono text-[9.5px] text-slate-600 leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto shadow-inner text-left">
                                                      {parsed.cuerpo}
                                                    </div>
                                                  </div>
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    );
                                  })()}
                                </div>

                                {/* E. Intervenciones */}
                                <div className="space-y-2 pt-2 border-t border-slate-100">
                                  <span className="font-bold text-[9.5px] text-slate-500 uppercase block">E. Intervenciones:</span>
                                  {(() => {
                                    const intervenciones = (ap.historialIntervenciones || [])
                                      .filter(hist => !isAcademicCall(hist));
                                    
                                    if (intervenciones.length === 0) {
                                      return <span className="text-slate-400 italic text-[11px] block pl-1">Sin intervenciones académicas registradas</span>;
                                    }
                                    
                                    return (
                                      <div className="space-y-2.5">
                                        {intervenciones.map((int, idx) => (
                                          <div key={int.id || idx} className="p-2.5 bg-slate-50 border border-slate-150 rounded-lg text-[10.5px] text-slate-700 shadow-5xs">
                                            <div className="flex items-center justify-between font-bold text-slate-800 mb-1">
                                              <span>{int.tipoSeguimiento || 'Intervención de Apoyo'}</span>
                                              <span className="text-slate-400 font-medium text-[9px]">{int.fecha}</span>
                                            </div>
                                            <div className="space-y-0.5 text-slate-600">
                                              <div><strong>Obs:</strong> {int.observaciones || int.detalle}</div>
                                              <div><strong>Compromiso:</strong> {int.estrategias?.join(', ') || int.estrategiaPersonalizada || 'Ninguno'}</div>
                                              {int.fechaLimite && <div><strong>Límite:</strong> {int.fechaLimite}</div>}
                                              {int.estadoCompromiso && <div><strong>Estado del compromiso:</strong> {int.estadoCompromiso}</div>}
                                            </div>
                                            <div className="mt-1.5">
                                              <span className="text-[9px] font-bold bg-white px-1.5 py-0.5 rounded border border-slate-250 text-slate-700">
                                                Resultado: {int.estadoIntervencion}
                                              </span>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    );
                                  })()}
                                </div>

                              </div>
                            </div>

                          </div>

                          {/* F. Acciones disponibles */}
                          <div className="mt-5 pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                            <div className="flex flex-wrap items-center gap-2">
                              
                              <button
                                type="button"
                                onClick={() => onIntervenirIndividual(ap)}
                                className="bg-sena-50 hover:bg-sena-100 text-sena-800 text-xs py-1.5 px-3 rounded-md font-bold transition-all border border-sena-100 cursor-pointer"
                              >
                                Intervenir
                              </button>

                              <button
                                type="button"
                                onClick={() => onEnviarLlamado(ap)}
                                className="bg-red-50 hover:bg-red-100 text-red-700 hover:text-red-800 text-xs py-1.5 px-3 rounded-md font-bold transition-all border border-red-100 flex items-center gap-1 cursor-pointer"
                              >
                                <Mail className="w-3.5 h-3.5" />
                                Registrar llamado
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setBienestarReferralLearner(ap);
                                  setIsReferralSent(false);
                                  setCauseBienestar(ap.diasSinAcceso && ap.diasSinAcceso > 30 
                                    ? 'Inasistencia reiterada superior a 30 días sin justificar'
                                    : 'Desmotivación académica / Cambio de programa de formación');
                                  setDescriptionBienestar('');
                                }}
                                className="bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-800 text-xs py-1.5 px-3 rounded-md font-bold transition-all border border-rose-100 flex items-center gap-1 cursor-pointer"
                              >
                                <Heart className="w-3.5 h-3.5 fill-current text-rose-500" />
                                Remitir a Bienestar
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setImprovementPlanLearner(ap);
                                  setIsPlanSaved(false);
                                  setStrategiesPlan('Sustentar de forma presencial u online las evidencias desaprobadas y pendientes mediante la entrega de talleres prácticos complementarios.');
                                  setCommitmentPlan('Me comprometo formalmente a asistir a las tutorías de acompañamiento docente y a realizar el cargue extemporáneo del portafolio en la plataforma LMS.');
                                }}
                                className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 hover:text-emerald-900 text-xs py-1.5 px-3 rounded-md font-bold transition-all border border-emerald-100 flex items-center gap-1 cursor-pointer"
                              >
                                <FileText className="w-3.5 h-3.5 text-emerald-600" />
                                Generar plan de mejora
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setModalStateFilter('Todas');
                                  setSelectedLearnerForEvidences(ap);
                                }}
                                className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs py-1.5 px-3 rounded-md font-bold transition-all flex items-center gap-1 cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                Ver historial completo
                              </button>

                            </div>

                            {/* Download Action Links */}
                            <div className="flex items-center gap-2">
                              {hasPlan(ap) && (
                                <button
                                  type="button"
                                  onClick={() => handleDownloadPlanPdfForLearner(ap)}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs py-1.5 px-3.5 rounded-md font-extrabold transition-all flex items-center gap-1 cursor-pointer shadow-3xs"
                                  title="Descargar PDF de Plan de Mejoramiento"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  Descargar Plan
                                </button>
                              )}
                              {hasBienestar(ap) && (
                                <button
                                  type="button"
                                  onClick={() => handleDownloadBienestarPdfForLearner(ap)}
                                  className="bg-rose-600 hover:bg-rose-700 text-white text-xs py-1.5 px-3.5 rounded-md font-extrabold transition-all flex items-center gap-1 cursor-pointer shadow-3xs"
                                  title="Descargar PDF de Remisión a Bienestar"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  Descargar Remisión
                                </button>
                              )}
                            </div>
                          </div>

                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Floating Action Bar (bulk selection) */}
      {selectedLearnersCount > 0 && (
        <div 
          className="bg-amber-50 border-t-2 border-amber-500 py-3 px-6 flex flex-col sm:flex-row items-center justify-between gap-3 animate-slide-up"
          id="block-actions-floating-panel"
        >
          <div className="flex items-center gap-1.5 text-xs text-amber-900 font-semibold text-center sm:text-left">
            <CheckSquare className="w-4 h-4 text-amber-600" />
            <span>Tienes <strong>{selectedLearnersCount} aprendices</strong> seleccionados de la ficha.</span>
          </div>
          
          <div className="flex items-center gap-2">
            
            {/* Mass intervention */}
            <button
              type="button"
              onClick={() => onIntervenirMasivo(currentSelectedLearnerObjects)}
              className="bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs py-1.5 px-4 rounded-md shadow-xs transition-all flex items-center gap-1"
            >
              <Briefcase className="w-3.5 h-3.5" />
              Asignar Intervención Masiva
            </button>

            {/* Individual PDFs download inside ZIP */}
            <button
              type="button"
              onClick={handleExportSelectedZip}
              disabled={zipExporting}
              className="bg-white hover:bg-slate-100 text-amber-800 border border-amber-300 font-bold text-xs py-1.5 px-4 rounded-md shadow-xs transition-all flex items-center gap-1.5 disabled:opacity-50"
              title="Descarga todas las fichas individuales firmables condensadas en un ZIP"
            >
              {zipExporting ? (
                <>Generando ZIP...</>
              ) : (
                <>
                  <FileArchive className="w-3.5 h-3.5" />
                  Descargar ZIP de Fichas
                </>
              )}
            </button>

          </div>
        </div>
      )}

      {/* Modal de Evidencias Pendientes */}
      {selectedLearnerForEvidences && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-300 max-w-2xl w-full max-h-[85vh] flex flex-col text-left">
            {/* Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-[#39A900]/5 rounded-t-xl">
              <div className="space-y-1">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wide">
                  Análisis y Reporte de Evidencias
                </h3>
                <p className="text-xs text-slate-600 font-semibold">
                  {selectedLearnerForEvidences.nombre} ({selectedLearnerForEvidences.tipoDocumento || 'CC'}: {selectedLearnerForEvidences.documento})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLearnerForEvidences(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-100 rounded-lg transition-colors font-bold text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="p-5 overflow-y-auto space-y-6">
              {/* Resumen General Metrics Dashboard */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalStateFilter('Todas')}
                  className={`w-full text-center p-3 rounded-lg border transition-all duration-200 cursor-pointer focus:outline-none ${
                    modalStateFilter === 'Todas'
                      ? 'bg-slate-100 border-slate-400 text-slate-900 ring-2 ring-slate-450/20 scale-[1.03] shadow-md'
                      : 'bg-white border-slate-150 text-slate-750 hover:border-slate-350 hover:bg-slate-50/50 hover:scale-[1.01]'
                  }`}
                >
                  <div className={`text-[10px] uppercase font-black tracking-wider ${modalStateFilter === 'Todas' ? 'text-slate-800' : 'text-slate-500'}`}>Total Evidencias</div>
                  <div className="text-lg font-black tracking-tight mt-1">{getTotalCount(selectedLearnerForEvidences)}</div>
                </button>

                <button
                  type="button"
                  onClick={() => setModalStateFilter('A')}
                  className={`w-full text-center p-3 rounded-lg border transition-all duration-200 cursor-pointer focus:outline-none ${
                    modalStateFilter === 'A'
                      ? 'bg-emerald-50 border-emerald-500 text-[#007832] ring-2 ring-emerald-500/20 scale-[1.03] shadow-md'
                      : 'bg-white border-slate-150 text-slate-750 hover:border-emerald-300 hover:bg-emerald-50/10 hover:scale-[1.01]'
                  }`}
                >
                  <div className={`text-[10px] uppercase font-black tracking-wider ${modalStateFilter === 'A' ? 'text-[#007832]' : 'text-slate-500'}`}>Aprobadas (A)</div>
                  <div className="text-lg font-black tracking-tight mt-1">{getACount(selectedLearnerForEvidences)}</div>
                </button>

                <button
                  type="button"
                  onClick={() => setModalStateFilter('D')}
                  className={`w-full text-center p-3 rounded-lg border transition-all duration-200 cursor-pointer focus:outline-none ${
                    modalStateFilter === 'D'
                      ? 'bg-rose-50 border-rose-500 text-rose-800 ring-2 ring-rose-500/20 scale-[1.03] shadow-md'
                      : 'bg-white border-slate-150 text-slate-750 hover:border-rose-300 hover:bg-rose-50/10 hover:scale-[1.01]'
                  }`}
                >
                  <div className={`text-[10px] uppercase font-black tracking-wider ${modalStateFilter === 'D' ? 'text-rose-750' : 'text-slate-500'}`}>Desaprobadas (D)</div>
                  <div className="text-lg font-black tracking-tight mt-1">{getDCount(selectedLearnerForEvidences)}</div>
                </button>

                <button
                  type="button"
                  onClick={() => setModalStateFilter('-')}
                  className={`w-full text-center p-3 rounded-lg border transition-all duration-200 cursor-pointer focus:outline-none ${
                    modalStateFilter === '-'
                      ? 'bg-amber-50 border-amber-500 text-amber-800 ring-2 ring-amber-500/20 scale-[1.03] shadow-md'
                      : 'bg-white border-slate-150 text-slate-750 hover:border-amber-300 hover:bg-amber-50/10 hover:scale-[1.01]'
                  }`}
                >
                  <div className={`text-[10px] uppercase font-black tracking-wider ${modalStateFilter === '-' ? 'text-amber-800' : 'text-slate-500'}`}>Pendientes (-)</div>
                  <div className="text-lg font-black tracking-tight mt-1">{getNoEntregasCount(selectedLearnerForEvidences)}</div>
                </button>
              </div>

              {/* Filtros por Estado */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4" id="modal-filter-segment">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <span>Filtrar evidencias de este aprendiz:</span>
                  <span className={`px-2 py-0.5 rounded-full font-black text-[9.5px] tracking-wide ${
                    modalStateFilter === 'Todas' ? 'bg-slate-100 text-slate-700' :
                    modalStateFilter === 'A' ? 'bg-emerald-50 text-[#007832]' :
                    modalStateFilter === 'D' ? 'bg-rose-50 text-rose-700' :
                    'bg-amber-50 text-amber-700'
                  }`}>
                    {modalStateFilter === 'Todas' ? 'Todas las evidencias' :
                     modalStateFilter === 'A' ? 'Solo Aprobadas (A)' :
                     modalStateFilter === 'D' ? 'Solo Desaprobadas (D)' :
                     'Solo Pendientes (-)'}
                  </span>
                </div>
              </div>

              {filteredModalEvidencesList.length === 0 ? (
                <div className="py-12 text-center text-slate-400 font-medium italic">
                  No se encontraron evidencias de este aprendiz con el estado seleccionado.
                </div>
              ) : (
                Object.entries(groupedModalEvidences).map(([fase, actividades]) => {
                  // Phase Totalization based on the unfiltered raw set to be always mathematically correct
                  const allPhaseEvsOfLearner = modalEvidencesList.filter(ev => ev.fase === fase);
                  const totalEvFase = allPhaseEvsOfLearner.length;
                  const aprobadasFase = allPhaseEvsOfLearner.filter(ev => ev.estado === 'A').length;
                  const desaprobadasFase = allPhaseEvsOfLearner.filter(ev => ev.estado === 'D').length;
                  const pendientesFase = allPhaseEvsOfLearner.filter(ev => ev.estado === '-').length;

                  return (
                    <div key={fase} className="space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-100 pb-2">
                        <h4 className="text-xs font-black text-[#007832] flex items-center gap-1.5 uppercase tracking-wide">
                          <span className="w-1.5 h-3.5 bg-[#39A900] rounded-xs"></span>
                          {fase}
                        </h4>
                        <div className="flex flex-wrap gap-1.5 text-[9px] font-bold">
                          <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md border border-slate-200">
                            Evidencias: {totalEvFase}
                          </span>
                          <span className="bg-emerald-50 text-[#007832] px-2 py-0.5 rounded-md border border-emerald-200">
                            Aprobadas: {aprobadasFase}
                          </span>
                          <span className="bg-rose-50 text-rose-700 px-2 py-0.5 rounded-md border border-rose-200">
                            Desaprobadas: {desaprobadasFase}
                          </span>
                          <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-md border border-amber-200">
                            Pendientes: {pendientesFase}
                          </span>
                        </div>
                      </div>
                      
                      <div className="space-y-4 pl-3">
                        {Object.entries(actividades).map(([actividad, evidencias]) => (
                          <div key={actividad} className="space-y-2">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-100/70 py-1.5 px-3 rounded-lg border border-slate-200">
                              <h5 className="text-[10.5px] font-bold text-slate-700">
                                Actividad de Proyecto: {actividad}
                              </h5>
                              <span className="text-[9.5px] font-black uppercase text-slate-500 bg-white px-2 py-0.2 rounded border border-slate-200">
                                Mostrando: {evidencias.length}
                              </span>
                            </div>
                            
                            <div className="space-y-1.5">
                              {evidencias.map((ev: any, idx) => (
                                <div
                                  key={idx}
                                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 bg-slate-50 border border-slate-150 rounded-lg hover:border-slate-250 hover:bg-slate-100/50 transition-colors"
                                >
                                  <div className="space-y-0.5 max-w-md">
                                    <div className="text-xs font-semibold text-slate-800 leading-tight">
                                      {formatEvidenciaNombre(ev.nombre)}
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-mono">
                                      Código: {ev.codigo || 'S/C'}
                                    </div>
                                  </div>
                                  
                                  <div className="flex items-center gap-2 self-start sm:self-center">
                                    <span className="text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded bg-amber-100 text-amber-850 border border-amber-200">
                                      {ev.tipo}
                                    </span>
                                    {ev.estado === 'A' ? (
                                      <span className="text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-150">
                                        Aprobada (A)
                                      </span>
                                    ) : ev.estado === 'D' ? (
                                      <span className="text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-150">
                                        Desaprobada (D)
                                      </span>
                                    ) : (
                                      <span className="text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-150">
                                        Pendiente (-)
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end rounded-b-xl">
              <button
                type="button"
                onClick={() => setSelectedLearnerForEvidences(null)}
                className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold py-2 px-4 rounded-lg transition-colors border border-slate-900 cursor-pointer"
              >
                Cerrar Detalle
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 1: Remisión Oficial a Bienestar al Aprendiz */}
      {bienestarReferralLearner && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-rose-200 max-w-xl w-full flex flex-col text-left overflow-hidden">
            <div className="p-5 border-b border-rose-100 flex items-center justify-between bg-rose-50/50">
              <div className="flex items-center gap-2">
                <Heart className="w-5 h-5 text-rose-600 fill-current animate-pulse" />
                <h3 className="text-sm font-black text-rose-950 uppercase tracking-wide">
                  Remisión Oficial a Bienestar al Aprendiz
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setBienestarReferralLearner(null);
                  setIsReferralSent(false);
                  setDescriptionBienestar('');
                }}
                className="text-rose-400 hover:text-rose-600 p-1 rounded-lg transition-colors font-bold text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            {isReferralSent ? (
              // Success Screen
              <div className="p-6 text-center space-y-4">
                <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto shadow-xs">
                  <Heart className="w-8 h-8 fill-current" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-lg font-black text-rose-950">¡Remisión Registrada Exitosamente!</h4>
                  <p className="text-xs text-rose-750 font-bold">Código de Radicado: <span className="font-mono bg-rose-50 border border-rose-200 px-2 py-0.5 rounded select-all">{trackingIdBienestar}</span></p>
                </div>
                <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                  Se ha generado y registrado la remisión oficial para <strong>{bienestarReferralLearner.nombre}</strong>. El caso se ha actualizado a estado <strong>"En seguimiento"</strong> y ha sido asignado a la mesa de apoyo de Bienestar al Aprendiz del CSGE.
                </p>
                <div className="flex flex-col sm:flex-row gap-2.5 justify-center pt-2">
                  <button
                    type="button"
                    onClick={handleDownloadBienestarPdf}
                    className="bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs py-2 px-4 rounded-lg shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    Descargar Copia Firmable PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBienestarReferralLearner(null);
                      setIsReferralSent(false);
                      setDescriptionBienestar('');
                    }}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs py-2 px-4 rounded-lg transition-colors border border-slate-200 cursor-pointer"
                  >
                    Regresar a la Tabla
                  </button>
                </div>
              </div>
            ) : (
              // Form Screen
              <form onSubmit={handleSendBienestarReferral} className="p-5 space-y-4">
                {/* Meta block */}
                <div className="bg-rose-50/50 p-3 rounded-lg border border-rose-100/50 text-[11px] text-rose-900 font-medium grid grid-cols-2 gap-2">
                  <div>
                    <span className="font-bold text-rose-700">Aprendiz:</span> {bienestarReferralLearner.nombre}
                  </div>
                  <div>
                    <span className="font-bold text-rose-700">Documento:</span> CC {bienestarReferralLearner.documento}
                  </div>
                  <div>
                    <span className="font-bold text-rose-700">Ficha:</span> {fichaInfo.numeroFicha}
                  </div>
                  <div>
                    <span className="font-bold text-rose-700">Inasistencia:</span> {bienestarReferralLearner.diasSinAcceso || 0} días sin ingreso
                  </div>
                </div>

                <div className="space-y-1 text-xs">
                  <label className="block font-black text-slate-700 uppercase tracking-wide">Causa Principal de Deserción / Alerta</label>
                  <select
                    value={causeBienestar}
                    onChange={(e) => setCauseBienestar(e.target.value)}
                    className="w-full rounded-lg border-slate-300 text-xs focus:ring-rose-500 focus:border-rose-500 cursor-pointer"
                    required
                  >
                    <option value="Inasistencia reiterada superior a 30 días sin justificar">Inasistencia reiterada superior a 30 días sin justificar</option>
                    <option value="Falta de conectividad o herramientas tecnológicas para la formación">Falta de conectividad o herramientas tecnológicas para la formación</option>
                    <option value="Dificultades socio-familiares (cuidado de dependientes, trabajo informal)">Dificultades socio-familiares (cuidado de dependientes, trabajo informal)</option>
                    <option value="Afectaciones de salud física o mental reportadas">Afectaciones de salud física o mental reportadas</option>
                    <option value="Desmotivación académica / Cambio de programa de formación">Desmotivación académica / Cambio de programa de formación</option>
                  </select>
                </div>

                <div className="space-y-1 text-xs">
                  <label className="block font-black text-slate-700 uppercase tracking-wide">
                    Detalles, Evidencias Recabadas y Gestiones Previas
                  </label>
                  <textarea
                    rows={4}
                    value={descriptionBienestar}
                    onChange={(e) => setDescriptionBienestar(e.target.value)}
                    placeholder="Escriba los detalles del caso. Ejem: Se realizaron 3 llamadas telefónicas y se enviaron 2 correos sin recibir respuesta del aprendiz. Sus compañeros indican que tiene problemas laborales..."
                    className="w-full rounded-lg border-slate-300 text-xs focus:ring-rose-500 focus:border-rose-500"
                    required
                  />
                  <span className="text-[10px] text-slate-400 font-medium">Requerido para generar el formato oficial de remisión.</span>
                </div>

                <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 text-[10px] text-amber-850 leading-relaxed font-semibold">
                  ⚠️ Esta remisión actualizará el estado del aprendiz a <strong>"En seguimiento"</strong> de forma automática para reflejar la intervención en curso ante el equipo interdisciplinario.
                </div>

                <div className="flex gap-2.5 justify-end pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setBienestarReferralLearner(null);
                      setIsReferralSent(false);
                      setDescriptionBienestar('');
                    }}
                    className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold py-2 px-4 rounded-lg transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-black py-2 px-4 rounded-lg shadow-sm flex items-center gap-1.5 cursor-pointer"
                  >
                    <Heart className="w-3.5 h-3.5 fill-current" />
                    Enviar y Radicar Remisión
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal 2: Concertación de Plan de Mejoramiento */}
      {improvementPlanLearner && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-emerald-200 max-w-xl w-full flex flex-col text-left overflow-hidden">
            <div className="p-5 border-b border-emerald-100 flex items-center justify-between bg-emerald-50/50">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-700 fill-current animate-pulse" />
                <h3 className="text-sm font-black text-emerald-950 uppercase tracking-wide">
                  Diseño de Plan de Mejoramiento Académico
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setImprovementPlanLearner(null);
                  setIsPlanSaved(false);
                }}
                className="text-emerald-500 hover:text-emerald-700 p-1 rounded-lg transition-colors font-bold text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            {isPlanSaved ? (
              // Success Screen
              <div className="p-6 text-center space-y-4">
                <div className="w-16 h-16 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto shadow-xs animate-bounce">
                  <FileText className="w-8 h-8 fill-current" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-lg font-black text-emerald-950">¡Plan de Mejoramiento Guardado!</h4>
                  <p className="text-xs text-emerald-750 font-bold">Estado del Aprendiz: <span className="bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-[11px] uppercase tracking-wider">Intervenido</span></p>
                </div>
                <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                  El plan de mejoramiento para <strong>{improvementPlanLearner.nombre}</strong> ha sido concertado, guardado en el historial de intervenciones, y la fecha límite quedó registrada para el <strong>{deadlinePlan}</strong>.
                </p>
                <div className="flex flex-col sm:flex-row gap-2.5 justify-center pt-2">
                  <button
                    type="button"
                    onClick={handleDownloadPlanPdf}
                    className="bg-[#39A900] hover:bg-[#2f8800] text-white font-extrabold text-xs py-2 px-4 rounded-lg shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    Descargar Plan Firmable PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setImprovementPlanLearner(null);
                      setIsPlanSaved(false);
                    }}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs py-2 px-4 rounded-lg transition-colors border border-slate-200 cursor-pointer"
                  >
                    Cerrar y Volver
                  </button>
                </div>
              </div>
            ) : (
              // Form Screen
              <form onSubmit={handleSavePlan} className="p-5 space-y-4">
                {/* Meta info card */}
                <div className="bg-emerald-50/50 p-3 rounded-lg border border-emerald-100 text-[11px] text-emerald-900 font-medium grid grid-cols-2 gap-2">
                  <div>
                    <span className="font-bold text-emerald-700">Aprendiz:</span> {improvementPlanLearner.nombre}
                  </div>
                  <div>
                    <span className="font-bold text-emerald-700">Documento:</span> CC {improvementPlanLearner.documento}
                  </div>
                  <div>
                    <span className="font-bold text-emerald-700">Ficha:</span> {fichaInfo.numeroFicha}
                  </div>
                  <div>
                    <span className="font-bold text-emerald-700">Pendientes:</span> {getNoEntregasCount(improvementPlanLearner)} evidencias pendientes
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1 text-xs">
                    <label className="block font-black text-slate-700 uppercase tracking-wide">Plazo Límite de Entrega</label>
                    <input
                      type="date"
                      value={deadlinePlan}
                      onChange={(e) => setDeadlinePlan(e.target.value)}
                      className="w-full rounded-lg border-slate-300 text-xs focus:ring-emerald-500 focus:border-emerald-500"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1 text-xs">
                  <label className="block font-black text-slate-700 uppercase tracking-wide">Estrategias y Actividades Concertadas</label>
                  <textarea
                    rows={3}
                    value={strategiesPlan}
                    onChange={(e) => setStrategiesPlan(e.target.value)}
                    className="w-full rounded-lg border-slate-300 text-xs focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="Actividades de recuperación acordadas..."
                    required
                  />
                  <span className="text-[10px] text-slate-400 font-medium">Describa las acciones pedagógicas acordadas para ponerse al día.</span>
                </div>

                <div className="space-y-1 text-xs">
                  <label className="block font-black text-slate-700 uppercase tracking-wide">Compromisos Adicionales del Aprendiz</label>
                  <textarea
                    rows={3}
                    value={commitmentPlan}
                    onChange={(e) => setCommitmentPlan(e.target.value)}
                    className="w-full rounded-lg border-slate-300 text-xs focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="Compromisos del aprendiz..."
                    required
                  />
                </div>

                <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 text-[10px] text-amber-850 leading-relaxed font-semibold">
                  📜 Este plan se incorporará como un compromiso formal en el historial de acompañamiento del aprendiz, y generará un documento PDF listo para firma digital o física.
                </div>

                <div className="flex gap-2.5 justify-end pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setImprovementPlanLearner(null);
                      setIsPlanSaved(false);
                    }}
                    className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold py-2 px-4 rounded-lg transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="bg-[#39A900] hover:bg-[#2f8800] text-white text-xs font-black py-2 px-4 rounded-lg shadow-sm flex items-center gap-1.5 cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5 fill-current" />
                    Guardar y Registrar Plan
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
