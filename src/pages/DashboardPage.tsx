import React, { useState, useRef, useEffect } from 'react';
import { 
  Home, RefreshCw, Download, FileText, AlertTriangle, LogOut,
  Building, User, Calendar, Sparkles, FolderSync, Info,
  Upload, Loader2, CheckCircle2, AlertCircle, CalendarClock, Trash2,
  FileSpreadsheet, ArrowLeft, ShieldCheck, X, Check, Mail, Send, Copy, ExternalLink
} from 'lucide-react';
import { Aprendiz, Fase, FichaInfo, Intervencion } from '../types';
import DashboardCards from '../components/DashboardCards';
import PhaseSelector from '../components/PhaseSelector';
import AlertTable from '../components/AlertTable';
import StrategyModal from '../components/StrategyModal';
import ReportModal from '../components/ReportModal';
import { useAlertasStore } from '../hooks/useAlertasStore';
import { auth } from '../lib/firebase.ts';
import { saveIndividualIntervention, saveBulkIntervention, syncLearnersToDb, saveBitacoraSeguimiento } from '../lib/api.ts';
import { leerArchivoExcel, leerArchivoExcel2D, detectarFases, normalizarAprendices, combinarDatos, detectExcelReportType, parseReporteAprendicesExcel } from '../utils/excelParser';
import { procesarTodosLosAprendices } from '../utils/riskCalculator';

interface DashboardPageProps {
  aprendices: Aprendiz[];
  fases: Fase[];
  fichaInfo: FichaInfo;
  store: ReturnType<typeof useAlertasStore>;
  onReiniciar: () => void;
  authToken: string;
  isAdmin?: boolean;
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

export default function DashboardPage({
  aprendices,
  fases,
  fichaInfo,
  store,
  onReiniciar,
  authToken,
  isAdmin = false
}: DashboardPageProps) {
  
  const getFreshToken = async (): Promise<string> => {
    try {
      if (auth && auth.currentUser) {
        const fresh = await auth.currentUser.getIdToken();
        if (fresh) return fresh;
      }
    } catch (e) {
      console.warn('Could not refresh Firebase token directly:', e);
    }
    return authToken;
  };

  // Modals state
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isStrategyOpen, setIsStrategyOpen] = useState(false);
  const [isSavingIntervention, setIsSavingIntervention] = useState(false);

  // Llamados and email notification states
  const [isLlamadoOpen, setIsLlamadoOpen] = useState(false);
  const [selectedAprendizLlamado, setSelectedAprendizLlamado] = useState<Aprendiz | null>(null);
  const [emailDestinatario, setEmailDestinatario] = useState('');
  const [emailAsunto, setEmailAsunto] = useState('');
  const [emailCuerpo, setEmailCuerpo] = useState('');
  const [isSendingLlamado, setIsSendingLlamado] = useState(false);
  const [llamadoSuccessMessage, setLlamadoSuccessMessage] = useState('');
  const [llamadoError, setLlamadoError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  
  // Strategy targets (either singular learner or mass block)
  const [strategySingleTarget, setStrategySingleTarget] = useState<Aprendiz | null>(null);
  const [strategyMassTarget, setStrategyMassTarget] = useState<Aprendiz[] | null>(null);

  // Excel tracking uploading states
  const [qualificationsFile, setQualificationsFile] = useState<File | null>(null);
  const [aprendicesFile, setAprendicesFile] = useState<File | null>(null);
  const [participantsFile, setParticipantsFile] = useState<File | null>(null);
  const [isUpdatingTracking, setIsUpdatingTracking] = useState(false);
  const [dragQuals, setDragQuals] = useState(false);
  const [dragAprendices, setDragAprendices] = useState(false);
  const [dragParts, setDragParts] = useState(false);
  
  const qualsInputRef = useRef<HTMLInputElement>(null);
  const aprendicesInputRef = useRef<HTMLInputElement>(null);
  const partsInputRef = useRef<HTMLInputElement>(null);

  const [activeUploadTab, setActiveUploadTab] = useState<'aprendices' | 'calificaciones'>(
    isAdmin ? 'aprendices' : 'calificaciones'
  );

  const [showTrackingPanel, setShowTrackingPanel] = useState(false);
  const [trackingSummary, setTrackingSummary] = useState<{
    totalCrossed: number;
    totalUpdatedAccess: number;
    totalNoAccessData: number;
    notInEnrollment: string[];
    updatedEvidencesCount: number;
    recalculatedRisksCount: number;
    errors: string[];
  } | null>(null);

  useEffect(() => {
    setActiveUploadTab(isAdmin ? 'aprendices' : 'calificaciones');
  }, [isAdmin]);

  // Trigger email called alert modal
  const triggerEnviarLlamadoModal = (ap: Aprendiz) => {
    setSelectedAprendizLlamado(ap);
    setEmailDestinatario(ap.correo || '');

    const getACountLocal = (learner: Aprendiz) => {
      if (!learner || !learner.evidencias) return 0;
      return Object.values(learner.evidencias).filter(v => {
        const valStr = v && typeof v === 'object' ? (v as any).estado : String(v);
        return valStr === 'A';
      }).length;
    };

    const getDCountLocal = (learner: Aprendiz) => {
      if (!learner || !learner.evidencias) return 0;
      return Object.values(learner.evidencias).filter(v => {
        const valStr = v && typeof v === 'object' ? (v as any).estado : String(v);
        return valStr === 'D';
      }).length;
    };

    const getTotalCountLocal = (learner: Aprendiz) => {
      if (!learner || !learner.evidencias) return 0;
      return Object.keys(learner.evidencias).length;
    };

    const totalEvidencias = getTotalCountLocal(ap);
    const totalAprobadas = getACountLocal(ap);
    const totalNoAprobadas = getDCountLocal(ap);
    const totalEnviadas = totalAprobadas + totalNoAprobadas;
    const totalPendientes = totalEvidencias - totalAprobadas;
    
    // Calculate pending evidence list organized by phase and activity
    const evs = ap.evidencias || {};
    const groupedPending: Record<string, Record<string, string[]>> = {};

    Object.entries(evs).forEach(([key, value]) => {
      let valStr = '';
      let detail: any = null;
      if (typeof value === 'object' && value !== null) {
        valStr = (value as any).estado;
        detail = value;
      } else {
        valStr = String(value);
      }

      if (valStr === 'D' || valStr === '-' || valStr === '' || !valStr) {
        let faseName = 'Fase de Formación';
        let actProyecto = 'Sin Actividad';

        if (detail) {
          if (detail.fase) faseName = detail.fase;
          if (detail.actividadProyecto) actProyecto = detail.actividadProyecto;
        } else {
          // Find in fases prop
          const phasesList = fases || [];
          for (const f of phasesList) {
            if (f.evidencias.some(e => e.nombre === key)) {
              faseName = f.nombre;
              break;
            }
          }
          
          // Deduce activity
          const codeMatch = key.match(/(GA\d+-[A-Za-z0-9_-]+)/i);
          if (codeMatch) {
            const code = codeMatch[1].toUpperCase();
            const actMatch = code.match(/^(GA\d+)/i);
            if (actMatch) {
              actProyecto = actMatch[1].toUpperCase();
            }
          } else {
            const gaMatch = key.match(/(GA\d+)/i);
            if (gaMatch) {
              actProyecto = gaMatch[1].toUpperCase();
            }
          }
        }

        // Standardize Activity label (e.g. GA1 -> AP1)
        if (/GA(\d+)/i.test(actProyecto)) {
          actProyecto = actProyecto.replace(/GA(\d+)/gi, 'AP$1');
        }

        if (!groupedPending[faseName]) {
          groupedPending[faseName] = {};
        }
        if (!groupedPending[faseName][actProyecto]) {
          groupedPending[faseName][actProyecto] = [];
        }
        groupedPending[faseName][actProyecto].push(key);
      }
    });

    let listaEvidenciasStr = '';
    if (totalPendientes > 0) {
      const parts: string[] = [];
      Object.entries(groupedPending).forEach(([fase, actividades]) => {
        parts.push(`${fase}`);
        Object.entries(actividades).forEach(([act, evsList]) => {
          let actLabel = act;
          if (/^AP(\d+)/i.test(act)) {
            const num = act.match(/^AP(\d+)/i)?.[1];
            actLabel = `Actividad de Proyecto ${num}`;
          } else if (/^GA(\d+)/i.test(act)) {
            const num = act.match(/^GA(\d+)/i)?.[1];
            actLabel = `Actividad de Proyecto ${num}`;
          }
          parts.push(`${actLabel}`);
          evsList.forEach(evName => {
            parts.push(`* ${evName}`);
          });
          parts.push(''); // spacing line
        });
      });
      listaEvidenciasStr = parts.join('\n').trim();
    } else {
      listaEvidenciasStr = 'No registra evidencias pendientes.';
    }

    let fraseTonoInteraccion = '';
    const isCritical = ap.estadoSeguimiento === 'Posible deserción' || ap.estadoAcceso === 'Acceso crítico';

    if (isCritical) {
      fraseTonoInteraccion = 'Dada la cantidad de días sin acceso y las evidencias pendientes registradas, es importante establecer contacto a la mayor brevedad para revisar tu continuidad y definir acciones de acompañamiento.';
    } else if (totalEnviadas > 0) {
      fraseTonoInteraccion = 'Se evidencia que has realizado algunas entregas; sin embargo, aún registras evidencias pendientes que requieren atención.';
    } else if (totalEnviadas === 0 && totalPendientes > 0) {
      fraseTonoInteraccion = 'En el reporte cargado no se evidencian entregas registradas, por lo cual es importante validar tu situación académica y de acceso.';
    }

    const isAsuntoCritico = ap.estadoSeguimiento === 'Posible deserción' || ap.estadoAcceso === 'Acceso crítico' || ap.estadoSeguimiento === 'Riesgo alto';
    const asunto = isAsuntoCritico
      ? `Llamado académico por inasistencia y evidencias pendientes – Ficha ${fichaInfo.numeroFicha}`
      : `Seguimiento académico y acceso a plataforma – Ficha ${fichaInfo.numeroFicha}`;
    
    const cuerpo = `Apreciado/a ${ap.nombre},

Desde el seguimiento académico realizado a la ficha ${fichaInfo.numeroFicha}, se identifican novedades relacionadas con tu acceso a la plataforma y el estado de tus evidencias.

${ap.ultimoAcceso ? `Se evidencia que desde la fecha ${ap.ultimoAcceso} presentas ${ap.diasSinAcceso || 0} días sin ingresar a la plataforma.` : `No se registra ingreso reciente a la plataforma en el reporte cargado, por lo cual se requiere validar tu situación académica y de acceso.`}

${fraseTonoInteraccion}

Resumen académico:
* Total de evidencias: ${totalEvidencias}
* Evidencias enviadas: ${totalEnviadas} (Aprobadas: ${totalAprobadas} · Desaprobadas: ${totalNoAprobadas})
* Evidencias aprobadas: ${totalAprobadas}
* Evidencias desaprobadas: ${totalNoAprobadas}
* Evidencias pendientes: ${totalPendientes}

Las evidencias enviadas corresponden a las evidencias aprobadas y desaprobadas, ya que ambas reflejan interacción académica con la plataforma.

Evidencias pendientes identificadas:
${listaEvidenciasStr}

Te invitamos cordialmente a ingresar a la plataforma LMS a la mayor brevedad posible para revisar detalladamente las evidencias pendientes mencionadas y ponerte al día con tus entregas. Si presentas inquietudes o requieres orientación pedagógica, responde a este correo o comunícate directamente con tu instructor responsable.

Este seguimiento tiene como propósito acompañar tu proceso formativo y promover tu permanencia en la formación.

Atentamente,
${fichaInfo.instructor || 'Instructor responsable'}
Instructor de Formación
Servicio Nacional de Aprendizaje (SENA)`;

    setEmailAsunto(asunto);
    setEmailCuerpo(cuerpo);
    setLlamadoSuccessMessage('');
    setLlamadoError(null);
    setIsLlamadoOpen(true);
  };

  const handleEnviarLlamadoConfirmado = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAprendizLlamado) return;
    if (isSendingLlamado) return;
    setIsSendingLlamado(true);
    setLlamadoError(null);

    const getACountLocal = (learner: Aprendiz) => {
      if (!learner || !learner.evidencias) return 0;
      return Object.values(learner.evidencias).filter(v => {
        const valStr = v && typeof v === 'object' ? (v as any).estado : String(v);
        return valStr === 'A';
      }).length;
    };

    const getDCountLocal = (learner: Aprendiz) => {
      if (!learner || !learner.evidencias) return 0;
      return Object.values(learner.evidencias).filter(v => {
        const valStr = v && typeof v === 'object' ? (v as any).estado : String(v);
        return valStr === 'D';
      }).length;
    };

    const getTotalCountLocal = (learner: Aprendiz) => {
      if (!learner || !learner.evidencias) return 0;
      return Object.keys(learner.evidencias).length;
    };

    const totalEv = getTotalCountLocal(selectedAprendizLlamado);
    const evAprobadas = getACountLocal(selectedAprendizLlamado);
    const evDesaprobadas = getDCountLocal(selectedAprendizLlamado);
    const evEnviadas = evAprobadas + evDesaprobadas;
    const pendingCount = totalEv - evAprobadas;
    const nextCallNum = (selectedAprendizLlamado.historialIntervenciones || []).filter(isAcademicCall).length + 1;

    const safeBase64Encode = (str: string) => {
      try {
        return btoa(unescape(encodeURIComponent(str)));
      } catch (e) {
        return btoa(str);
      }
    };

    try {
      const activeToken = await getFreshToken();
      const response = await fetch('/api/aprendices/enviar-llamado', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${activeToken}`
        },
        body: JSON.stringify({
          userDoc: selectedAprendizLlamado.documento,
          fichaId: fichaInfo.numeroFicha,
          asunto: emailAsunto,
          correo: emailDestinatario,
          mensaje: safeBase64Encode(emailCuerpo),
          isBase64: true,
          evidenciasPendientes: pendingCount,
          diasSinAcceso: selectedAprendizLlamado.diasSinAcceso || 0,
          ultimoAcceso: selectedAprendizLlamado.ultimoAcceso,
          
          totalEvidencias: totalEv,
          evidenciasEnviadas: evEnviadas,
          evidenciasAprobadas: evAprobadas,
          evidenciasDesaprobadas: evDesaprobadas,
          observacion: `Registro de ${getOrdinalLlamadoText(nextCallNum)}.`
        })
      });

      const contentType = response.headers.get("content-type") || "";
      const rawText = await response.text();

      console.log('[LLAMADO_DEBUG_FRONTEND]', {
        status: response.status,
        statusText: response.statusText,
        contentType,
        rawPreview: rawText.slice(0, 500)
      });

      let result: any;
      try {
        result = contentType.includes("application/json")
          ? JSON.parse(rawText)
          : { success: false, error: `Respuesta del servidor no válida. Status: ${response.status}. Tipo de respuesta: ${contentType}.` };
      } catch {
        result = { success: false, error: `Error de análisis JSON. Status: ${response.status}. Tipo de respuesta: ${contentType}.` };
      }

      if (response.status === 403) {
        setLlamadoError("No tienes permiso para registrar llamados en esta ficha. Verifica la asignación del instructor.");
        return;
      }

      if (!contentType.includes("application/json") && rawText.includes("<html")) {
        setLlamadoError(`Error al registrar llamado. Status: ${response.status}. Tipo de respuesta: ${contentType}. El servidor devolvió una respuesta HTML en lugar de JSON.`);
        return;
      }

      if (response.ok && result.success) {
        const actualCallNum = result.numeroLlamado || nextCallNum;
        const ordinalLabel = getOrdinalLlamadoText(actualCallNum);
        const obs = `Registro de ${ordinalLabel}.`;

        const detailsText = `Asunto: ${emailAsunto}
Ficha: ${fichaInfo.numeroFicha}
Fecha de último ingreso: ${selectedAprendizLlamado.ultimoAcceso || 'Nunca ingresó'}
Días sin acceso: ${selectedAprendizLlamado.diasSinAcceso || 0}
Total evidencias: ${totalEv}
Evidencias enviadas: ${evEnviadas}
Evidencias aprobadas: ${evAprobadas}
Evidencias desaprobadas: ${evDesaprobadas}
Evidencias pendientes: ${pendingCount}
Observación: ${obs}
--------------------------------------------------
${emailCuerpo}`;

        // Update local state in the store so the list is reactive and doesn't require a hard page reload!
        const returnedLlamado = result.llamado || {
          fecha: new Date().toLocaleDateString('es-CO'),
          instructor: fichaInfo.instructor,
          estadoIntervencion: 'En seguimiento',
          tipoSeguimiento: 'Correo de llamado a ponerse al día',
          evidenciasPendientes: pendingCount,
          diasSinAcceso: selectedAprendizLlamado.diasSinAcceso || 0,
          numeroLlamado: actualCallNum,
          detalle: detailsText,
          observaciones: `Registro de ${ordinalLabel}.`
        };

        store.aplicarIntervencionIndividual(
          selectedAprendizLlamado.documento,
          'En seguimiento',
          returnedLlamado
        );

        setLlamadoSuccessMessage(`¡${ordinalLabel} registrado con éxito! El estado del aprendiz se actualizó a "En seguimiento".`);
        setTimeout(() => {
          setIsLlamadoOpen(false);
          setSelectedAprendizLlamado(null);
        }, 2000);
      } else {
        setLlamadoError(result.error || 'Error al registrar el llamado de atención');
      }
    } catch (err: any) {
      console.error('Error sending llamado:', err);
      setLlamadoError(err.message || 'Hubo un error al comunicarse con el servidor.');
    } finally {
      setIsSendingLlamado(false);
    }
  };

  // Calculate days since last seguimiento (Colombia standard GMT-5 adjustment or simple date substraction)
  const lastSegDate = fichaInfo.ultimoSeguimiento ? new Date(fichaInfo.ultimoSeguimiento + 'T00:00:00') : null;
  const daysDiff = lastSegDate 
    ? Math.floor((new Date().setHours(0,0,0,0) - lastSegDate.setHours(0,0,0,0)) / (1000 * 3600 * 24)) 
    : null;

  const handleAprendicesUploadAndSync = async () => {
    if (!aprendicesFile) {
      alert('Por favor selecciona obligatoriamente un archivo Excel de Reporte de Aprendices Inscritos.');
      return;
    }
    setIsUpdatingTracking(true);
    try {
      // Validate that the uploaded file is indeed an apprentice report and NOT a qualifications report
      const rows2D = await leerArchivoExcel2D(aprendicesFile);
      const reportType = detectExcelReportType(rows2D);
      if (reportType === 'calificaciones') {
        alert("Este archivo corresponde a un reporte de calificaciones. Debe cargarse desde el panel del instructor.");
        setIsUpdatingTracking(false);
        return;
      }

      // 1. Process Aprendices Excel (obligatorio)
      const result = parseReporteAprendicesExcel(rows2D);
      let list = result.aprendices;

      // 2. Process Participants Excel (opcional)
      if (participantsFile) {
        const parsedParts = await leerArchivoExcel(participantsFile);
        list = combinarDatos(list, parsedParts.rows);
      }

      const todayISO = new Date().toISOString().split('T')[0];
      const activeToken = await getFreshToken();

      // Update DB and Memory fallback
      const response = await syncLearnersToDb(
        activeToken,
        fichaInfo.numeroFicha,
        fichaInfo.programaFormacion,
        fichaInfo.nivel,
        fichaInfo.fechaInicio || '2026-01-15',
        fichaInfo.fechaFin || '2027-12-15',
        list,
        todayISO
      );

      const finalLearners = response?.aprendices || list;

      // Re-populate our store while preserving existing phases
      store.setDatosCargados(finalLearners, store.fases || []);

      // Update current props memory directly
      fichaInfo.ultimoSeguimiento = todayISO;

      alert(`🎉 ¡Listado de aprendices e inscripción actualizado con éxito! Se sincronizaron ${finalLearners.length} aprendices en el sistema de retención.`);
      setAprendicesFile(null);
      setParticipantsFile(null);
    } catch (err: any) {
      console.error(err);
      alert('Error procesando el reporte de aprendices inscritos: ' + err.message);
    } finally {
      setIsUpdatingTracking(false);
    }
  };

  const handleTrackingUploadAndSync = async () => {
    if (!qualificationsFile && !participantsFile) {
      alert('⚠️ Por favor cargue al menos uno de los reportes (Calificaciones LMS o Participantes/Inasistencia) para generar el seguimiento.');
      return;
    }
    
    setIsUpdatingTracking(true);
    setTrackingSummary(null);
    
    try {
      const todayISO = new Date().toISOString().split('T')[0];
      
      // Get baseline learners (existing enrolled ones) from our store
      let listToSync = store.aprendices.map(ap => ({
        ...ap,
        evidencias: { ...(ap.evidencias || {}) },
        resumenFases: { ...(ap.resumenFases || {}) },
      }));
      
      let phasesToUse = [...(store.fases || [])];
      let totalCrossedQuals = 0;
      let totalUpdatedAccess = 0;
      let totalEvidenciasActualizadas = 0;
      let notInEnrollmentQuals: string[] = [];
      let notInEnrollmentParts: string[] = [];
      const errorsList: string[] = [];

      // Helper function to robustly search keys by normalized name
      const findKey = (row: any, searchTerms: string[]) => {
        const keys = Object.keys(row);
        return keys.find(k => {
          const norm = String(k || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
          return searchTerms.some(term => norm === term || norm.includes(term));
        });
      };

      // 1. Process Qualifications LMS Excel
      if (qualificationsFile) {
        // Validate that qualificationsFile is not an apprentice list
        const rows2D = await leerArchivoExcel2D(qualificationsFile);
        const reportType = detectExcelReportType(rows2D);
        if (reportType === 'aprendices') {
          alert("⚠️ El archivo de calificaciones cargado corresponde a un reporte de aprendices (matrícula) y no a un reporte de calificaciones.");
          setIsUpdatingTracking(false);
          return;
        }

        const parsedQuals = await leerArchivoExcel(qualificationsFile);
        const qualsRows = parsedQuals.rows || [];
        
        const hasDocumentColumn = parsedQuals.headers.some(header => {
          const norm = String(header || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
          return (
            norm.includes('nombre de usuario') ||
            norm.includes('usuario') ||
            norm.includes('username') ||
            norm.includes('documento') ||
            norm.includes('cedula') ||
            norm.includes('identificacion') ||
            norm.includes('cc') ||
            norm.includes('id de estudiante') ||
            norm.includes('cedula de ciudadania') ||
            norm.includes('registro')
          );
        });

        if (!hasDocumentColumn) {
          throw new Error("El reporte de calificaciones cargado no contiene ninguna columna de identificación de aprendices válida (como Documento, CC, Usuario, Username, Cédula o Registro). Por favor, descargue el reporte oficial del LMS.");
        }

        const phases = detectarFases(parsedQuals.headers);
        phasesToUse = phases; // update active phases as well
        const parsedQualsLearners = normalizarAprendices(qualsRows, phases);

        parsedQualsLearners.forEach(parsedL => {
          const docKey = String(parsedL.documento || '').trim().toLowerCase();
          if (!docKey) return;
          
          const student = listToSync.find(ap => String(ap.documento || '').trim().toLowerCase() === docKey);
          if (student) {
            totalCrossedQuals++;
            const oldEvs = student.evidencias || {};
            const newEvs = parsedL.evidencias || {};
            
            Object.keys(newEvs).forEach(evName => {
              const oldVal = typeof oldEvs[evName] === 'object' ? (oldEvs[evName] as any)?.estado : oldEvs[evName];
              const newVal = typeof newEvs[evName] === 'object' ? (newEvs[evName] as any)?.estado : newEvs[evName];
              if (!oldVal || oldVal !== newVal) {
                totalEvidenciasActualizadas++;
              }
            });
            
            student.evidencias = { ...oldEvs, ...newEvs };
            student.resumenFases = { ...(student.resumenFases || {}), ...(parsedL.resumenFases || {}) };
          } else {
            notInEnrollmentQuals.push(`${parsedL.nombre || 'Sin nombre'} (Doc: ${parsedL.documento || 'Sin doc'})`);
          }
        });
      }

      // 2. Process Participants/Attendance Excel
      if (participantsFile) {
        const parsedParts = await leerArchivoExcel(participantsFile);
        const partsRows = parsedParts.rows || [];
        
        if (partsRows.length > 0) {
          const firstRow = partsRows[0];
          const rolesKey = findKey(firstRow, ['roles', 'rol', 'perfil']);
          const usernameKey = findKey(firstRow, ['nombre de usuario', 'usuario', 'username']);
          const lastAccessKey = findKey(firstRow, ['ultimo acceso', 'ultimo ingreso', 'last access', 'acceso', 'ingreso']);
          
          if (!usernameKey) {
            throw new Error("El reporte de participantes no contiene una columna de 'Nombre de usuario' válida para identificar los aprendices.");
          }

          partsRows.forEach(row => {
            // Role filter: only process if Roles is 'Aprendiz'
            if (rolesKey) {
              const roleVal = String(row[rolesKey] || '').trim().toLowerCase();
              if (roleVal !== 'aprendiz') {
                return; // ignore row
              }
            }

            // Identify username
            const usernameVal = String(row[usernameKey] || '').trim();
            if (!usernameVal) return;

            // Extract document (numbers) and doc type (letters)
            const match = usernameVal.match(/^(\d+)([a-zA-Z]+)$/);
            let doc = '';
            if (match) {
              doc = match[1];
            } else {
              // Fallback
              doc = usernameVal.replace(/\D/g, '');
            }

            if (!doc) return;
            const docKey = doc.toLowerCase();

            // Find apprentice in listToSync
            const student = listToSync.find(ap => String(ap.documento || '').trim().toLowerCase() === docKey);

            if (student) {
              const lastAccessVal = lastAccessKey ? String(row[lastAccessKey] || '').trim() : '';
              if (lastAccessVal) {
                let dateObj: Date | null = null;
                if (!isNaN(Date.parse(lastAccessVal))) {
                  dateObj = new Date(lastAccessVal);
                } else {
                  // dd/mm/yyyy or yyyy-mm-dd
                  const parts = lastAccessVal.split(/[-/ :]/);
                  if (parts.length >= 3) {
                    if (parts[0].length === 4) {
                      dateObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                    } else {
                      dateObj = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
                    }
                  }
                }

                if (dateObj && !isNaN(dateObj.getTime())) {
                  const today = new Date();
                  const d1 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                  const d2 = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
                  const diffTime = d1.getTime() - d2.getTime();
                  let dias = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                  if (dias < 0) dias = 0;

                  student.ultimoAcceso = lastAccessVal;
                  student.diasSinAcceso = dias;
                  totalUpdatedAccess++;
                } else {
                  student.ultimoAcceso = lastAccessVal;
                  student.diasSinAcceso = null;
                  totalUpdatedAccess++;
                }
              }
            } else {
              // Extract names
              const nameKey = findKey(row, ['nombre', 'nombres']);
              const lastNameKey = findKey(row, ['apellido', 'apellidos']);
              const fullName = (String(row[nameKey || ''] || '') + ' ' + String(row[lastNameKey || ''] || '')).trim();
              notInEnrollmentParts.push(
                fullName 
                  ? `${fullName} (Doc: ${doc})` 
                  : `Documento: ${doc} (Usuario: ${usernameVal})`
              );
            }
          });
        }
      }

      // Add not in enrollment warnings to errors list
      notInEnrollmentQuals.forEach(studentStr => {
        errorsList.push(`El aprendiz ${studentStr} aparece en el reporte de calificaciones, pero no existe en la matrícula cargada desde Administración.`);
      });
      notInEnrollmentParts.forEach(studentStr => {
        errorsList.push(`El de participantes ${studentStr} aparece en el reporte de participantes, pero no existe en la matrícula cargada desde Administración.`);
      });

      // Capture old risks to check for risk changes
      const oldRisks = new Map<string, string>();
      store.aprendices.forEach(ap => {
        oldRisks.set(String(ap.documento || '').trim().toLowerCase(), ap.nivelRiesgo);
      });

      // Recalculate risks using updated baseline data
      const recalculatedLearners = procesarTodosLosAprendices(listToSync, phasesToUse);

      let recalculatedRisksCount = 0;
      recalculatedLearners.forEach(ap => {
        const docKey = String(ap.documento || '').trim().toLowerCase();
        const oldRisk = oldRisks.get(docKey);
        if (oldRisk && oldRisk !== ap.nivelRiesgo) {
          recalculatedRisksCount++;
        }
      });

      // Update database and memory
      const activeToken = await getFreshToken();
      const response = await syncLearnersToDb(
        activeToken,
        fichaInfo.numeroFicha,
        fichaInfo.programaFormacion,
        fichaInfo.nivel,
        fichaInfo.fechaInicio || '2026-01-15',
        fichaInfo.fechaFin || '2027-12-15',
        recalculatedLearners,
        todayISO,
        true // isCalificaciones mode
      );

      const finalLearners = response?.aprendices || recalculatedLearners;

      // Update Zustand state store
      store.setDatosCargados(finalLearners, phasesToUse);

      // Update local props memory directly
      fichaInfo.ultimoSeguimiento = todayISO;

      // Compute total in enrollment without access data
      const totalNoAccessData = finalLearners.filter(ap => ap.diasSinAcceso === null || ap.diasSinAcceso === undefined).length;

      // Set the detailed summary metrics state
      setTrackingSummary({
        totalCrossed: totalCrossedQuals,
        totalUpdatedAccess,
        totalNoAccessData,
        notInEnrollment: [...notInEnrollmentQuals, ...notInEnrollmentParts],
        updatedEvidencesCount: totalEvidenciasActualizadas,
        recalculatedRisksCount,
        errors: errorsList
      });

    } catch (err: any) {
      console.error(err);
      alert('❌ Error procesando los reportes de seguimiento: ' + err.message);
    } finally {
      setIsUpdatingTracking(false);
    }
  };

  // Computed live general stats
  const countUnIntervened = store.aprendices.filter(
    a => a.estadoIntervencion === 'Sin intervención'
  ).length;

  const countRemitidosBienestar = store.aprendices.filter(
    a => a.estadoIntervencion === 'Remitido a Bienestar'
  ).length;

  const countDesercion = store.aprendices.filter(a => a.estadoSeguimiento === 'Posible deserción').length;
  const countAlto = store.aprendices.filter(a => a.estadoSeguimiento === 'Riesgo alto').length;
  const countMedio = store.aprendices.filter(a => a.estadoSeguimiento === 'Riesgo medio').length;
  const countBajo = store.aprendices.filter(a => a.estadoSeguimiento === 'Riesgo bajo').length;
  const countSinDato = store.aprendices.filter(a => a.estadoSeguimiento === 'Sin dato suficiente').length;

  // Modals Triggers
  const triggerIndividualIntervention = (ap: Aprendiz) => {
    setStrategyMassTarget(null);
    setStrategySingleTarget(ap);
    setIsStrategyOpen(true);
  };

  const triggerBulkIntervention = (aps: Aprendiz[]) => {
    setStrategySingleTarget(null);
    setStrategyMassTarget(aps);
    setIsStrategyOpen(true);
  };

  const handleGuardarIntervencion = async (
    documentos: string[],
    estado: 'Sin intervención' | 'En seguimiento' | 'Intervenido',
    intervencionDetalle: any
  ) => {
    setIsSavingIntervention(true);
    try {
      // Pack full structured fields cleanly for PostgreSQL Detalles string
      const compromiseText = [
        intervencionDetalle.estrategias?.length > 0 ? `Estrategias: ${intervencionDetalle.estrategias.join(', ')}` : '',
        intervencionDetalle.causas?.length > 0 ? `Causas: ${intervencionDetalle.causas.join(', ')}` : '',
        intervencionDetalle.observaciones ? `Observaciones: ${intervencionDetalle.observaciones}` : ''
      ].filter(Boolean).join(' | ') || 'Asignación de estrategia pedagógica';

      const activeToken = await getFreshToken();

      if (strategyMassTarget) {
        // Bulk save
        await saveBulkIntervention(
          activeToken,
          documentos,
          fichaInfo.numeroFicha,
          estado,
          compromiseText,
          intervencionDetalle.fecha
        );
        store.aplicarIntervencionMasiva(documentos, estado, intervencionDetalle);
      } else {
        // Individual save
        await saveIndividualIntervention(
          activeToken,
          documentos[0],
          fichaInfo.numeroFicha,
          estado,
          compromiseText,
          intervencionDetalle.fecha
        );
        store.aplicarIntervencionIndividual(documentos[0], estado, intervencionDetalle);
      }
    } catch (err: any) {
      console.error(err);
      alert('Error guardando en base de datos: ' + err.message);
    } finally {
      setIsSavingIntervention(false);
    }
  };

  const handleSaveBitacoraSeguimiento = async (
    aprendizDbId: number,
    datosSeguimiento: any
  ) => {
    try {
      const activeToken = await getFreshToken();
      let result;

      if (datosSeguimiento.isLlamadoOficial) {
        const safeBase64Encode = (str: string) => {
          try {
            return btoa(unescape(encodeURIComponent(str)));
          } catch (e) {
            return btoa(str);
          }
        };

        const res = await fetch('/api/aprendices/enviar-llamado', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${activeToken}`
          },
          body: JSON.stringify({
            userDoc: datosSeguimiento.aprendizDocumento,
            fichaId: fichaInfo?.numeroFicha,
            asunto: datosSeguimiento.asunto || 'Llamado académico',
            correo: datosSeguimiento.aprendizCorreo || '',
            mensaje: safeBase64Encode(datosSeguimiento.observacion),
            isBase64: true,
            evidenciasPendientes: datosSeguimiento.evidenciasPendientes,
            diasSinAcceso: datosSeguimiento.diasSinAcceso || 0,
            ultimoAcceso: datosSeguimiento.fechaUltimoIngreso,
            totalEvidencias: datosSeguimiento.totalEvidencias,
            evidenciasEnviadas: datosSeguimiento.evidenciasEnviadas,
            evidenciasAprobadas: datosSeguimiento.evidenciasAprobadas,
            evidenciasDesaprobadas: datosSeguimiento.evidenciasDesaprobadas,
            observacion: `Registro de llamado.`
          })
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          throw new Error(errData?.error || 'Error al registrar el llamado académico oficial.');
        }

        const resJson = await res.json();
        
        result = {
          success: true,
          seguimiento: {
            id: String(resJson.llamado.id),
            fecha: resJson.llamado.fecha,
            instructor: resJson.llamado.instructor,
            estadoIntervencion: resJson.llamado.estadoIntervencion || 'En seguimiento',
            observaciones: resJson.llamado.observaciones || 'Registro de llamado.',
            tipoSeguimiento: resJson.llamado.tipoSeguimiento,
            numeroLlamado: resJson.llamado.numeroLlamado
          }
        };
      } else {
        result = await saveBitacoraSeguimiento(activeToken, aprendizDbId, datosSeguimiento);
      }
      
      const targetLearner = store.aprendices.find(ap => ap.dbId === aprendizDbId || Number(ap.id) === aprendizDbId);
      if (targetLearner) {
        const completeIntervencion: Intervencion = {
          id: String(result.seguimiento.id),
          fecha: result.seguimiento.fecha,
          instructor: result.seguimiento.instructor,
          estadoIntervencion: result.seguimiento.estadoIntervencion || 'En seguimiento',
          detalle: datosSeguimiento.observacion || result.seguimiento.observaciones || 'Seguimiento en bitácora',
          previo: targetLearner.estadoIntervencion,
          nuevo: result.seguimiento.estadoIntervencion,
          tipoSeguimiento: result.seguimiento.tipoSeguimiento || datosSeguimiento.tipoSeguimiento,
          evidenciasPendientes: datosSeguimiento.evidenciasPendientes,
          diasSinAcceso: datosSeguimiento.diasSinAcceso,
          medioComunicacion: datosSeguimiento.medioComunicacion,
          fechaRegistro: new Date().toISOString(),
          fechaEnvioMensaje: datosSeguimiento.fechaEnvioMensaje,
          fechaRespuestaAprendiz: datosSeguimiento.fechaRespuestaAprendiz,
          fechaProximoSeguimiento: datosSeguimiento.fechaProximoSeguimiento,
          asunto: datosSeguimiento.asunto,
          cuerpoMensaje: datosSeguimiento.isLlamadoOficial ? datosSeguimiento.observacion : datosSeguimiento.cuerpoMensaje,
          observacion: datosSeguimiento.observacion,
          respuestaAprendiz: datosSeguimiento.respuestaAprendiz,
          compromisos: datosSeguimiento.compromisos,
          proximaAccion: datosSeguimiento.proximaAccion,
          totalEvidencias: datosSeguimiento.totalEvidencias,
          evidenciasEnviadas: datosSeguimiento.evidenciasEnviadas,
          evidenciasAprobadas: datosSeguimiento.evidenciasAprobadas,
          evidenciasDesaprobadas: datosSeguimiento.evidenciasDesaprobadas,
          origenRegistro: datosSeguimiento.origenRegistro || 'Instructor',
          creadoPorNombre: result.seguimiento.instructor,
          usuarioResponsableNombre: result.seguimiento.instructor,
          numeroLlamado: result.seguimiento.numeroLlamado,
          parentSeguimientoId: datosSeguimiento.parentSeguimientoId
        };

        store.aplicarIntervencionIndividual(
          targetLearner.documento,
          result.seguimiento.estadoIntervencion,
          completeIntervencion
        );
      }
      return result;
    } catch (err: any) {
      console.error('[BITACORA_SAVE_ERROR]', err);
      throw err;
    }
  };

  return (
    <div className="space-y-6" id="dashboard-page-view">
      
      {/* Navbar Institucional Dark Green #007832 */}
      <header className="bg-[#007832] text-white rounded-xl shadow-lg p-4 px-6 flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* Left SENA Info / Logo */}
        <div className="flex items-center gap-4 w-full md:w-auto">
          {/* Logo container circle */}
          <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center p-1.5 border border-white/20 shadow-inner shrink-0">
            <span className="text-[#39A900] text-xl font-black">S</span>
          </div>
          <div className="border-l border-white/30 pl-4 text-left leading-tight">
            <h1 className="text-base font-bold leading-none uppercase tracking-wide">SENA Alertas Tempranas</h1>
            <p className="text-[10px] opacity-80 uppercase tracking-widest mt-1">
              Centro de Servicios y Gestión Empresarial
            </p>
          </div>
        </div>

        {/* Dynamic Ficha Badge from Sleek Interface theme */}
        <div className="flex items-center gap-4 font-semibold text-xs py-2">
          <div className="bg-[#39A900] px-3 py-1 rounded text-xs font-bold shrink-0 shadow-sm">
            FICHA: {fichaInfo.numeroFicha || 'No especificada'}
          </div>
          <span className="text-xs text-white/90 truncate max-w-[200px] hidden sm:inline" title={fichaInfo.programaFormacion}>
            {fichaInfo.programaFormacion}
          </span>
        </div>

        {/* Action button triggers Excel/PDF, and Back Home */}
        <div className="flex items-center gap-2.5 w-full md:w-auto justify-end shrink-0">
          
          {/* Open Export Modal */}
          <button
            type="button"
            onClick={() => setIsReportOpen(true)}
            className="flex-1 sm:flex-initial bg-white/10 hover:bg-white/20 text-white text-xs font-bold py-2.5 px-3 rounded transition-colors flex items-center justify-center gap-1.5 border border-white/20"
            id="open-report-options-btn"
          >
            <FileText className="w-4 h-4" />
            <span>Generar PDF</span>
          </button>

          {isAdmin ? (
            <button
              type="button"
              onClick={onReiniciar}
              className="flex-1 sm:flex-initial bg-white hover:bg-slate-50 text-slate-800 text-xs font-extrabold py-2.5 px-4 rounded transition-all flex items-center justify-center gap-2 border border-slate-350 shadow-sm"
              title="Volver al panel administrativo de coordinación SENA"
              id="back-to-admin-panel-btn"
            >
              <ArrowLeft className="w-4 h-4 text-[#39A900]" />
              <span>Volver a Panel Admin</span>
            </button>
          ) : (
            /* Return button */
            <button
              type="button"
              onClick={onReiniciar}
              className="flex-1 sm:flex-initial bg-red-650 hover:bg-red-700 text-white text-xs font-bold py-2.5 px-3.5 rounded transition-colors flex items-center justify-center gap-1.5"
              title="Sube una nueva ficha excel para re-analizar"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reiniciar</span>
            </button>
          )}

        </div>
      </header>

      {/* Dynamic tracking panel for instructors / admins */}
      {activeUploadTab === 'aprendices' ? (
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-3xs space-y-4" id="instructor-tracking-panel">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div className="flex items-start gap-3">
              <div className={`p-2.5 rounded-xl shrink-0 border ${
                daysDiff === null
                  ? 'bg-red-50 text-red-650 border-red-150 animate-pulse'
                  : daysDiff >= 8
                  ? 'bg-amber-50 text-amber-700 border-amber-150'
                  : 'bg-emerald-50 text-[#007832] border-emerald-150'
              }`}>
                <CalendarClock className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <span>Seguimiento de Ficha (Matrícula / Aprendices Inscritos)</span>
                  <span className={`text-[9.5px] font-black uppercase px-2 py-0.5 rounded-full ${
                    daysDiff === null
                      ? 'bg-red-100 text-red-800'
                      : daysDiff >= 8
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    {daysDiff === null
                      ? 'Pendiente Carga Inicial'
                      : daysDiff >= 8
                      ? 'Desactualizado'
                      : 'Al Día'}
                  </span>
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed max-w-2xl">
                  {daysDiff === null ? (
                    <span className="text-red-600 font-semibold">⚠️ Esta ficha no registra reporte inicial de aprendices. Suba el reporte de aprendices inscritos para iniciar el seguimiento.</span>
                  ) : daysDiff >= 8 ? (
                    <span className="text-amber-700 font-semibold">⚠️ El último reporte de aprendices inscritos se cargó hace <span className="font-extrabold underline">{daysDiff} días</span>. Es obligatorio actualizar los datos hoy para mantener al día el listado.</span>
                  ) : (
                    <span className="text-emerald-700">🟢 Reporte inicial de aprendices al día. Actualizado de forma exitosa hace <span className="font-bold">{daysDiff === 0 ? 'hoy (0 días)' : `${daysDiff} día(s)`}</span>.</span>
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Dual Input upload area Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Box 1: Aprendices Inscritos (OBLIGATORIO) */}
            <div className="space-y-1 text-left">
              <span className="block text-xs font-bold text-slate-700 flex items-center gap-1">
                1. Reporte de Aprendices Inscritos
                <span className="text-red-500 font-bold">*</span>
              </span>
              
              <div
                onDragOver={(e) => { e.preventDefault(); setDragAprendices(true); }}
                onDragLeave={() => setDragAprendices(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragAprendices(false);
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    setAprendicesFile(e.dataTransfer.files[0]);
                  }
                }}
                onClick={() => aprendicesInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[140px] hover:border-[#39A900] hover:bg-[#39A900]/5 ${
                  dragAprendices ? 'border-[#39A900] bg-emerald-50/10' : 'border-slate-200 bg-slate-50/30'
                }`}
                id="instructor-aprendices-dropzone"
              >
                <input
                  type="file"
                  ref={aprendicesInputRef}
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={e => {
                    if (e.target.files && e.target.files[0]) {
                      setAprendicesFile(e.target.files[0]);
                    }
                  }}
                />
                <FileSpreadsheet className={`w-8 h-8 mb-2 ${aprendicesFile ? 'text-[#39A900] animate-bounce' : 'text-slate-400'}`} />
                <span className="text-xs font-bold text-slate-700 break-all px-2 block">
                  {aprendicesFile ? aprendicesFile.name : 'Subir reporte de aprendices inscritos'}
                </span>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  {aprendicesFile ? 'Archivo seleccionado' : 'Arrastra y suelta aquí o interactúa'}
                </span>
              </div>
            </div>

            {/* Box 2: Participants list (OPCIONAL) */}
            <div className="space-y-1 text-left">
              <span className="block text-xs font-bold text-slate-600 flex items-center gap-1">
                2. Reporte de Participantes (Opcional)
              </span>
              
              <div
                onDragOver={(e) => { e.preventDefault(); setDragParts(true); }}
                onDragLeave={() => setDragParts(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragParts(false);
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    setParticipantsFile(e.dataTransfer.files[0]);
                  }
                }}
                onClick={() => partsInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[140px] hover:border-blue-450 hover:bg-blue-50/10 ${
                  dragParts ? 'border-blue-500 bg-blue-100/10' : 'border-slate-200 bg-slate-50/30'
                }`}
                id="instructor-parts-dropzone"
              >
                <input
                  type="file"
                  ref={partsInputRef}
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={e => {
                    if (e.target.files && e.target.files[0]) {
                      setParticipantsFile(e.target.files[0]);
                    }
                  }}
                />
                <Upload className={`w-8 h-8 mb-2 ${participantsFile ? 'text-blue-500 animate-bounce' : 'text-slate-400'}`} />
                <span className="text-xs font-bold text-slate-700 break-all px-2 block">
                  {participantsFile ? participantsFile.name : 'Subir excel Participantes'}
                </span>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  {participantsFile ? 'Archivo seleccionado' : 'Arrastra para registrar últimos accesos'}
                </span>
              </div>
            </div>

          </div>

          {/* Footer / Info / Action Trigger bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-1.5 p-2 rounded-lg bg-slate-50 border border-slate-150 text-[10.5px] text-slate-500 max-w-xl text-left">
              <Info className="w-4 h-4 text-sena-500 shrink-0" />
              <span>Este panel de Seguimiento de Ficha sirve únicamente para cargar y actualizar aprendices inscritos, no calificaciones. Las calificaciones se cargan en su pestaña correspondiente.</span>
            </div>

            <button
              type="button"
              onClick={handleAprendicesUploadAndSync}
              disabled={isUpdatingTracking || !aprendicesFile}
              className={`px-6 py-2.5 rounded-lg text-xs font-extrabold flex items-center justify-center gap-2 shadow-2xs transition-all ${
                !aprendicesFile 
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                  : 'bg-[#39A900] hover:bg-[#2f8800] text-white cursor-pointer active:scale-95'
              }`}
              id="instructor-sync-submit-btn"
            >
              {isUpdatingTracking ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Actualizando listado...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  <span>Actualizar listado de aprendices</span>
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* If tracking panel is closed and we are on calificaciones tab (Instructor), show the open toggle button */}
          {!showTrackingPanel && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-3xs flex flex-col sm:flex-row sm:items-center justify-between gap-4" id="instructor-tracking-collapsed-bar">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-50 text-[#007832] rounded-xl border border-emerald-150 shrink-0">
                  <FolderSync className="w-5 h-5 animate-pulse" />
                </div>
                <div className="text-left">
                  <h3 className="text-sm font-bold text-slate-800">Generar o Actualizar Seguimiento Ficha</h3>
                  <p className="text-xs text-slate-500">Cargue reportes LMS de calificaciones y de inasistencia para calcular las alertas académicas y actualizar el nivel de riesgo.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowTrackingPanel(true)}
                className="bg-[#007832] hover:bg-[#005c26] text-white text-xs font-black py-2.5 px-5 rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 shrink-0"
                id="instructor-open-tracking-btn"
              >
                <span>Generar Seguimiento / Actualizar</span>
              </button>
            </div>
          )}

          {showTrackingPanel && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-3xs space-y-4 animate-fade-in animate-duration-300" id="instructor-tracking-panel">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-xl shrink-0 border bg-emerald-50 text-[#007832] border-emerald-150">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div className="space-y-0.5 text-left">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <span>Panel del Instructor: Generar o Actualizar Seguimiento Ficha</span>
                      <span className="text-[9.5px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                        Exclusivo Instructor
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500">
                      Cargue ambos reportes o al menos uno para enriquecer el avance académico y asistencia de los aprendices.
                    </p>
                  </div>
                </div>
                {/* Close button */}
                <button
                  type="button"
                  onClick={() => {
                    setShowTrackingPanel(false);
                    setTrackingSummary(null);
                    setQualificationsFile(null);
                    setParticipantsFile(null);
                  }}
                  className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                  title="Cerrar espacio de carga"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* If there is a tracking summary, show the Polished Bento Metrics Report Summary! */}
              {trackingSummary ? (
                <div className="space-y-4 animate-fade-in" id="tracking-processing-summary-bento">
                  <div className="bg-emerald-50/50 border border-emerald-150 rounded-xl p-4 flex items-start gap-3 text-left">
                    <CheckCircle2 className="w-6 h-6 text-[#007832] shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-extrabold text-[#007832]">¡Seguimiento procesado exitosamente!</h4>
                      <p className="text-xs text-emerald-800 mt-1 leading-relaxed text-left">
                        Se han actualizado correctamente los datos académicos y de inasistencia en la base de datos de alertas tempranas de Google Cloud SQL. A continuación, se detalla el reporte consolidado de resultados:
                      </p>
                    </div>
                  </div>

                  {/* Grid of Metrics */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-left">
                    <div className="bg-slate-50 border border-slate-150 rounded-xl p-3 flex flex-col justify-between">
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Aprendices Cruzados</span>
                      <span className="text-2xl font-black text-slate-850 mt-1">{trackingSummary.totalCrossed}</span>
                      <span className="text-[10px] text-slate-400 mt-1">Con el reporte de calificaciones</span>
                    </div>
                    
                    <div className="bg-slate-50 border border-slate-150 rounded-xl p-3 flex flex-col justify-between">
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Acceso Actualizado</span>
                      <span className="text-2xl font-black text-slate-850 mt-1">{trackingSummary.totalUpdatedAccess}</span>
                      <span className="text-[10px] text-[#007832] font-semibold mt-1">✓ Reporte inasistencia</span>
                    </div>

                    <div className="bg-slate-50 border border-slate-150 rounded-xl p-3 flex flex-col justify-between">
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Evidencias Modificadas</span>
                      <span className="text-2xl font-black text-amber-700 mt-1">+{trackingSummary.updatedEvidencesCount}</span>
                      <span className="text-[10px] text-slate-400 mt-1">Calificaciones registradas</span>
                    </div>

                    <div className="bg-slate-50 border border-slate-150 rounded-xl p-3 flex flex-col justify-between">
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Riesgos Recalculados</span>
                      <span className="text-2xl font-black text-blue-700 mt-1">{trackingSummary.recalculatedRisksCount}</span>
                      <span className="text-[10px] text-slate-400 mt-1">Estados de alerta variaron</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-slate-50 border border-slate-150 rounded-xl p-3.5 space-y-2 text-left">
                      <h5 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <Info className="w-3.5 h-3.5 text-blue-650" />
                        <span>Datos de Inasistencia Ficha</span>
                      </h5>
                      <ul className="text-xs space-y-1 text-slate-600">
                        <li>• Aprendices activos con último acceso registrado: <strong>{trackingSummary.totalUpdatedAccess}</strong></li>
                        <li>• Aprendices inscritos en la matrícula sin datos de acceso: <strong className="text-slate-500">{trackingSummary.totalNoAccessData}</strong></li>
                      </ul>
                    </div>

                    <div className="bg-slate-50 border border-slate-150 rounded-xl p-3.5 space-y-2 text-left">
                      <h5 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                        <span>Aprendices No Matriculados en Administración ({trackingSummary.notInEnrollment.length})</span>
                      </h5>
                      {trackingSummary.notInEnrollment.length > 0 ? (
                        <div className="max-h-24 overflow-y-auto text-[11px] text-slate-500 space-y-1 bg-white p-2 rounded border border-slate-200">
                          {trackingSummary.notInEnrollment.map((studentStr, index) => (
                            <div key={index} className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                              <span>{studentStr}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-emerald-700">🟢 Todos los aprendices procesados de ambos reportes están correctamente matriculados en esta ficha.</p>
                      )}
                    </div>
                  </div>

                  {/* Warnings and errors section */}
                  {trackingSummary.errors.length > 0 && (
                    <div className="bg-amber-50/50 border border-amber-250 rounded-xl p-3.5 space-y-1.5 text-left">
                      <span className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
                        <AlertCircle className="w-4 h-4 text-amber-700" />
                        Detalle de Alertas y Observaciones durante el procesamiento:
                      </span>
                      <div className="max-h-32 overflow-y-auto space-y-1 text-[11px] text-amber-900 bg-white/70 p-2.5 rounded border border-amber-100">
                        {trackingSummary.errors.map((err, index) => (
                          <div key={index} className="flex items-start gap-1">
                            <span className="shrink-0 font-extrabold text-amber-700">•</span>
                            <span>{err}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Close / Aceptar Button */}
                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowTrackingPanel(false);
                        setTrackingSummary(null);
                        setQualificationsFile(null);
                        setParticipantsFile(null);
                      }}
                      className="bg-[#007832] hover:bg-[#005c26] text-white text-xs font-black py-2.5 px-6 rounded-lg shadow-sm transition-all cursor-pointer flex items-center gap-1.5 active:scale-95"
                    >
                      <Check className="w-4 h-4" />
                      <span>Aceptar y Cerrar Panel</span>
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Dual dropzones for qualifications and participants */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    
                    {/* Zone 1: Qualifications report */}
                    <div className="space-y-1.5 text-left">
                      <span className="block text-xs font-extrabold text-slate-700 flex items-center gap-1">
                        1. Reporte de Calificaciones LMS (Lms_Calificaciones_...)
                        <span className="text-red-500 font-bold">*</span>
                      </span>
                      
                      <div
                        onDragOver={(e) => { e.preventDefault(); setDragQuals(true); }}
                        onDragLeave={() => setDragQuals(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setDragQuals(false);
                          if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                            setQualificationsFile(e.dataTransfer.files[0]);
                          }
                        }}
                        onClick={() => qualsInputRef.current?.click()}
                        className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[140px] hover:border-[#39A900] hover:bg-[#39A900]/5 ${
                          dragQuals ? 'border-[#39A900] bg-emerald-50/10' : 'border-slate-200 bg-slate-50/30'
                        }`}
                        id="instructor-quals-dropzone"
                      >
                        <input
                          type="file"
                          ref={qualsInputRef}
                          accept=".xlsx,.xls"
                          className="hidden"
                          onChange={e => {
                            if (e.target.files && e.target.files[0]) {
                              setQualificationsFile(e.target.files[0]);
                            }
                          }}
                        />
                        <FileSpreadsheet className={`w-8 h-8 mb-2 ${qualificationsFile ? 'text-[#39A900] animate-bounce' : 'text-slate-400'}`} />
                        <span className="text-xs font-bold text-slate-700 break-all px-2 block">
                          {qualificationsFile ? qualificationsFile.name : 'Subir Excel de Calificaciones LMS'}
                        </span>
                        <span className="text-[10px] text-slate-400 mt-1 block">
                          {qualificationsFile ? 'Archivo seleccionado' : 'Arrastre y suelte el reporte de Calificaciones Territorium'}
                        </span>
                      </div>
                    </div>

                    {/* Zone 2: Participants / Inattendance report */}
                    <div className="space-y-1.5 text-left">
                      <span className="block text-xs font-extrabold text-slate-600 flex items-center gap-1">
                        2. Reporte de Participantes / Inasistencia (Opcional)
                      </span>
                      
                      <div
                        onDragOver={(e) => { e.preventDefault(); setDragParts(true); }}
                        onDragLeave={() => setDragParts(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setDragParts(false);
                          if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                            setParticipantsFile(e.dataTransfer.files[0]);
                          }
                        }}
                        onClick={() => partsInputRef.current?.click()}
                        className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[140px] hover:border-blue-450 hover:bg-blue-50/10 ${
                          dragParts ? 'border-blue-500 bg-blue-100/10' : 'border-slate-200 bg-slate-50/30'
                        }`}
                        id="instructor-parts-dropzone"
                      >
                        <input
                          type="file"
                          ref={partsInputRef}
                          accept=".xlsx,.xls"
                          className="hidden"
                          onChange={e => {
                            if (e.target.files && e.target.files[0]) {
                              setParticipantsFile(e.target.files[0]);
                            }
                          }}
                        />
                        <Upload className={`w-8 h-8 mb-2 ${participantsFile ? 'text-blue-500 animate-bounce' : 'text-slate-400'}`} />
                        <span className="text-xs font-bold text-slate-700 break-all px-2 block">
                          {participantsFile ? participantsFile.name : 'Subir Excel de Participantes / Inasistencia'}
                        </span>
                        <span className="text-[10px] text-slate-400 mt-1 block">
                          {participantsFile ? 'Archivo seleccionado' : 'Arrastre y suelte para registrar últimos accesos'}
                        </span>
                      </div>
                    </div>

                  </div>

                  {/* Action and helper bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-1.5 p-2 rounded-lg bg-slate-50 border border-slate-150 text-[10px] text-slate-500 max-w-xl text-left">
                      <Info className="w-4 h-4 text-sena-500 shrink-0" />
                      <span>Para actualizar las evidencias y las inasistencias en conjunto, arrastre ambos archivos y haga clic en Procesar Seguimiento.</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowTrackingPanel(false);
                          setQualificationsFile(null);
                          setParticipantsFile(null);
                        }}
                        className="px-4 py-2.5 rounded-lg text-xs font-bold border border-slate-300 hover:bg-slate-50 text-slate-700 transition-all cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={handleTrackingUploadAndSync}
                        disabled={isUpdatingTracking || (!qualificationsFile && !participantsFile)}
                        className={`px-6 py-2.5 rounded-lg text-xs font-extrabold flex items-center justify-center gap-2 shadow-2xs transition-all ${
                          (!qualificationsFile && !participantsFile)
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                            : 'bg-[#39A900] hover:bg-[#2f8800] text-white cursor-pointer active:scale-95'
                        }`}
                        id="instructor-sync-submit-btn-tracking"
                      >
                        {isUpdatingTracking ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Procesando Seguimiento...</span>
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-4 h-4" />
                            <span>Procesar y Generar Seguimiento</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}

      {/* Overview statistical count cards (Clicking applies risk filter) */}
      <DashboardCards
        total={store.aprendices.length}
        desercion={countDesercion}
        alto={countAlto}
        medio={countMedio}
        bajo={countBajo}
        sinDato={countSinDato}
        sinIntervencion={countUnIntervened}
        remitidosBienestar={countRemitidosBienestar}
        selectedFilter={store.filterRiesgo}
        onFilterSelect={(item) => store.setFilterRiesgo(item)}
      />

      {/* Main bento layout: Side selectors (3/12) + Main table (9/12) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Evidence check selectors & Legend */}
        <div className="lg:col-span-3 h-fit">
          <PhaseSelector
            fases={store.fases}
            hasPendingChanges={store.hasPendingChanges}
            onToggleFase={store.toggleFaseCheckbox}
            onToggleEvidencia={store.toggleEvidenciaCheckbox}
            onAplicarSeguimiento={store.aplicarSeguimiento}
          />
        </div>

        {/* Right Column: Complete Student Grid Table */}
        <div className="lg:col-span-9 h-full">
          <AlertTable
            aprendices={store.aprendices}
            fichaInfo={fichaInfo}
            selectedIds={store.selectedAprendicesIds}
            filterSearch={store.filterSearch}
            onFilterSearchChange={store.setFilterSearch}
            filterRiesgo={store.filterRiesgo}
            onFilterRiesgoChange={store.setFilterRiesgo}
            filterEstado={store.filterEstado}
            onFilterEstadoChange={store.setFilterEstado}
            sortColumn={store.sortColumn}
            onSortColumnChange={store.setSortColumn}
            sortDirection={store.sortDirection}
            onSortDirectionChange={store.setSortDirection}
            onToggleSelect={store.toggleSeleccionAprendiz}
            onToggleSelectAll={store.toggleSeleccionarTodos}
            onIntervenirIndividual={triggerIndividualIntervention}
            onIntervenirMasivo={triggerBulkIntervention}
            onEnviarLlamado={triggerEnviarLlamadoModal}
            onSaveBitacoraSeguimiento={handleSaveBitacoraSeguimiento}
          />
        </div>

      </div>

      {/* Modals Containers */}
      
      {/* 1. Strategy Assignment Modal */}
      <StrategyModal
        isOpen={isStrategyOpen}
        onClose={() => setIsStrategyOpen(false)}
        aprendiz={strategySingleTarget}
        aprendicesMasivos={strategyMassTarget}
        instructorNombreActual={fichaInfo.instructor}
        onGuardar={handleGuardarIntervencion}
      />

      {/* 2. Download formal PDF/Excel Options Modal */}
      <ReportModal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        aprendices={store.aprendices}
        fichaInfo={fichaInfo}
      />

      {/* 3. Enviar Llamado de Atención Modal */}
      {isLlamadoOpen && selectedAprendizLlamado && (
        <div className="fixed inset-0 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto animate-fade-in" id="modal-enviar-llamado-atencion">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-scale-up">
            {/* Header */}
            <div className="bg-gradient-to-r from-red-600 to-red-700 py-4 px-6 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="w-5 h-5 animate-pulse" />
                <h3 className="font-extrabold text-sm tracking-wide uppercase">Generar y Registrar Llamado de Atención</h3>
              </div>
              <button 
                type="button" 
                onClick={() => setIsLlamadoOpen(false)}
                className="p-1 hover:bg-white/10 rounded-full transition-colors text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Success Notification Alert */}
            {llamadoSuccessMessage ? (
              <div className="p-8 text-center flex flex-col items-center justify-center space-y-4">
                <CheckCircle2 className="w-16 h-16 text-emerald-600 animate-bounce" />
                <h4 className="text-xl font-bold text-slate-800">¡Llamado de Atención Guardado!</h4>
                <p className="text-sm text-slate-600 max-w-md mx-auto">{llamadoSuccessMessage}</p>
                <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                  <div className="bg-emerald-600 h-1 animate-shrink" style={{ animationDuration: '3s' }}></div>
                </div>
              </div>
            ) : (
              <form onSubmit={handleEnviarLlamadoConfirmado} className="flex-1 flex flex-col overflow-hidden">
                {/* Scrollable Form Body */}
                <div className="p-5 space-y-4 overflow-y-auto text-left">
                  {llamadoError && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-xs font-semibold flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">No se pudo registrar el llamado:</p>
                        <p className="mt-0.5 text-red-650">{llamadoError}</p>
                      </div>
                    </div>
                  )}
                  
                  {/* Detailed Student Bento Profile Card */}
                  {(() => {
                    const getACountLocal = (learner: Aprendiz) => {
                      if (!learner || !learner.evidencias) return 0;
                      return Object.values(learner.evidencias).filter(v => {
                        const valStr = v && typeof v === 'object' ? (v as any).estado : String(v);
                        return valStr === 'A';
                      }).length;
                    };

                    const getDCountLocal = (learner: Aprendiz) => {
                      if (!learner || !learner.evidencias) return 0;
                      return Object.values(learner.evidencias).filter(v => {
                        const valStr = v && typeof v === 'object' ? (v as any).estado : String(v);
                        return valStr === 'D';
                      }).length;
                    };

                    const getTotalCountLocal = (learner: Aprendiz) => {
                      if (!learner || !learner.evidencias) return 0;
                      return Object.keys(learner.evidencias).length;
                    };

                    const totalEv = getTotalCountLocal(selectedAprendizLlamado);
                    const evAprobadas = getACountLocal(selectedAprendizLlamado);
                    const evDesaprobadas = getDCountLocal(selectedAprendizLlamado);
                    const evEnviadas = evAprobadas + evDesaprobadas;
                    const pendingCount = totalEv - evAprobadas;

                    const priorCalls = (selectedAprendizLlamado.historialIntervenciones || []).filter(isAcademicCall);
                    const nextCallNum = priorCalls.length + 1;
                    const nextCallName = getOrdinalLlamadoText(nextCallNum);

                    return (
                      <div className="space-y-3">
                        {/* Compact Profile Card */}
                        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/60 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 pb-2.5">
                            <div>
                              <h4 className="text-sm font-black text-slate-900">{selectedAprendizLlamado.nombre}</h4>
                              <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                                CC: {selectedAprendizLlamado.documento} · {selectedAprendizLlamado.correo}
                              </p>
                            </div>
                            <span className="text-[10px] font-extrabold px-2.5 py-1 bg-slate-200 text-slate-800 rounded-md uppercase tracking-wide">
                              Ficha: {fichaInfo.numeroFicha}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                            {/* Column 1: Situación y Acceso */}
                            <div className="space-y-2">
                              <div>
                                <span className="text-slate-400 block font-medium text-[9px] uppercase">Situación Académica</span>
                                <span className={`inline-block font-extrabold text-[9px] px-1.5 py-0.5 rounded border mt-0.5 ${
                                  selectedAprendizLlamado.estadoSeguimiento === 'Posible deserción'
                                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                                    : selectedAprendizLlamado.estadoSeguimiento === 'Riesgo alto'
                                    ? 'bg-red-50 text-red-700 border-red-200'
                                    : 'bg-slate-100 text-slate-700 border-slate-200'
                                }`}>
                                  {selectedAprendizLlamado.estadoSeguimiento || 'Sin datos'}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-400 block font-medium text-[9px] uppercase">Estado de Acceso</span>
                                <span className="font-extrabold text-slate-800 block mt-0.5">{selectedAprendizLlamado.estadoAcceso || 'Nunca ingresó'}</span>
                              </div>
                            </div>

                            {/* Column 2: Inasistencia */}
                            <div className="space-y-2">
                              <div>
                                <span className="text-slate-400 block font-medium text-[9px] uppercase">Último Ingreso</span>
                                <span className="font-bold text-slate-800 block mt-0.5">{selectedAprendizLlamado.ultimoAcceso || 'Nunca'}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 block font-medium text-[9px] uppercase">Días sin acceso</span>
                                <span className="font-extrabold text-amber-700 block mt-0.5">{selectedAprendizLlamado.diasSinAcceso || 0} días</span>
                              </div>
                            </div>

                            {/* Column 3: Evidencias Breakdown */}
                            <div className="space-y-1 sm:col-span-1 col-span-2 bg-white rounded-lg p-2.5 border border-slate-200/50">
                              <span className="text-slate-400 block font-medium text-[9px] uppercase tracking-wider">Métricas de Evidencias</span>
                              <div className="space-y-0.5 font-mono text-[10px] text-slate-700">
                                <div className="flex justify-between">
                                  <span>Total:</span>
                                  <span className="font-bold">{totalEv}</span>
                                </div>
                                <div className="flex justify-between text-slate-900 font-bold border-t border-slate-100 pt-0.5">
                                  <span>Enviadas:</span>
                                  <span>{evEnviadas}</span>
                                </div>
                                <div className="flex justify-between text-emerald-700">
                                  <span>Aprobadas:</span>
                                  <span>{evAprobadas}</span>
                                </div>
                                <div className="flex justify-between text-rose-600">
                                  <span>Desaprobadas:</span>
                                  <span>{evDesaprobadas}</span>
                                </div>
                                <div className="flex justify-between text-amber-600 font-bold border-t border-slate-100 pt-0.5">
                                  <span>Pendientes:</span>
                                  <span>{pendingCount}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Next Call indicator & Prior Called Warning list */}
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center justify-between bg-amber-50/50 text-amber-900 border border-amber-200/65 rounded-xl p-3 text-xs font-semibold">
                            <span>Siguiente registro en bitácora:</span>
                            <span className="px-2 py-0.5 bg-amber-100 border border-amber-300 text-amber-950 rounded-md font-bold uppercase tracking-wider">
                              {nextCallName} (#{nextCallNum})
                            </span>
                          </div>

                          {priorCalls.length > 0 && (
                            <div className="bg-rose-50/60 border border-rose-200/60 rounded-xl p-3 text-xs space-y-1">
                              <span className="font-black text-rose-700 flex items-center gap-1">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                Historial de Llamados Académicos Registrados ({priorCalls.length}):
                              </span>
                              <ul className="list-disc pl-4 space-y-0.5 text-slate-600 text-[11px]">
                                {priorCalls.map((hist, idx) => (
                                  <li key={idx}>
                                    <span className="font-semibold">{hist.fecha}:</span> {getOrdinalLlamadoText(hist.numeroLlamado || (idx + 1))} ({hist.instructor || 'Instructor'}) - Pendientes: {hist.evidenciasPendientes || 0}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Mail fields */}
                  <div className="space-y-1">
                    <label className="block text-xs font-black text-slate-700 uppercase">Para (Correo Aprendiz):</label>
                    <input 
                      type="email" 
                      required
                      value={emailDestinatario}
                      onChange={e => setEmailDestinatario(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-black text-slate-700 uppercase">Asunto:</label>
                    <input 
                      type="text" 
                      required
                      value={emailAsunto}
                      onChange={e => setEmailAsunto(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-bold focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none"
                    />
                  </div>

                  <div className="space-y-1 flex-1 flex flex-col">
                    <label className="block text-xs font-black text-slate-700 uppercase">Cuerpo de la Notificación (Editable):</label>
                    <textarea 
                      required
                      rows={10}
                      value={emailCuerpo}
                      onChange={e => setEmailCuerpo(e.target.value)}
                      className="w-full flex-1 px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium font-mono focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none leading-relaxed resize-none bg-slate-50/50"
                    ></textarea>
                  </div>

                  <p className="text-[10px] text-slate-400 italic">
                    * Al guardar, el llamado se registrará formalmente en el expediente digital del aprendiz y cambiará su estado a "En seguimiento". Si acumula más de 3 llamados académicos, se levantará automáticamente una alerta administrativa crítica.
                  </p>

                </div>

                {/* Footer Buttons */}
                <div className="border-t border-slate-100 bg-slate-50 py-3 px-5 flex flex-wrap items-center justify-between gap-2 shrink-0">
                  <div className="flex gap-2">
                    {/* Copy to Clipboard Button */}
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(emailCuerpo);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      className="bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold py-1.5 px-3 rounded-lg border border-slate-200 transition-all flex items-center gap-1 cursor-pointer"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-700">Copiado</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-slate-500" />
                          <span>Copiar texto</span>
                        </>
                      )}
                    </button>

                    {/* Open in Mail Client Button */}
                    <button
                      type="button"
                      onClick={() => {
                        const mailtoUrl = `mailto:${encodeURIComponent(emailDestinatario)}?subject=${encodeURIComponent(emailAsunto)}&body=${encodeURIComponent(emailCuerpo)}`;
                        window.location.href = mailtoUrl;
                      }}
                      className="bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold py-1.5 px-3 rounded-lg border border-slate-200 transition-all flex items-center gap-1 cursor-pointer"
                      title="Abrir este correo en Outlook / Gmail"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                      <span>Abrir correo</span>
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setIsLlamadoOpen(false)}
                      className="bg-white hover:bg-slate-50 text-slate-600 text-xs font-bold py-1.5 px-4 rounded-lg border border-slate-200 transition-all cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isSendingLlamado}
                      className="bg-red-650 hover:bg-red-700 disabled:bg-red-400 text-white text-xs font-black py-1.5 px-4 rounded-lg shadow-sm transition-all cursor-pointer flex items-center gap-1.5 active:scale-95"
                    >
                      {isSendingLlamado ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Registrando...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" />
                          <span>Registrar llamado</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
