import React, { useState, useRef, useEffect } from 'react';
import { 
  Home, RefreshCw, Download, FileText, AlertTriangle, LogOut,
  Building, User, Calendar, Sparkles, FolderSync, Info,
  Upload, Loader2, CheckCircle2, AlertCircle, CalendarClock, Trash2,
  FileSpreadsheet, ArrowLeft, ShieldCheck, X, Check, Mail, Send
} from 'lucide-react';
import { Aprendiz, Fase, FichaInfo } from '../types';
import DashboardCards from '../components/DashboardCards';
import PhaseSelector from '../components/PhaseSelector';
import AlertTable from '../components/AlertTable';
import StrategyModal from '../components/StrategyModal';
import ReportModal from '../components/ReportModal';
import { useAlertasStore } from '../hooks/useAlertasStore';
import { saveIndividualIntervention, saveBulkIntervention, syncLearnersToDb } from '../lib/api.ts';
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

export default function DashboardPage({
  aprendices,
  fases,
  fichaInfo,
  store,
  onReiniciar,
  authToken,
  isAdmin = false
}: DashboardPageProps) {
  
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
    
    // Calculate pending evidence list
    const evs = ap.evidencias || {};
    const pendingList: string[] = [];
    Object.entries(evs).forEach(([key, value]) => {
      let valStr = '';
      if (typeof value === 'object' && value !== null) {
        valStr = (value as any).estado;
      } else {
        valStr = String(value);
      }
      if (valStr === 'D' || valStr === '-' || valStr === '' || !valStr) {
        pendingList.push(key);
      }
    });

    const totalPendientes = pendingList.length;
    const listaEvidenciasStr = totalPendientes > 0 
      ? pendingList.map(ev => `  • ${ev} (No presentada o D)`).join('\n')
      : '  • Ninguna evidencia calificada con D.';

    const asunto = `Llamado de atención académico y de inasistencia - Ficha ${fichaInfo.numeroFicha}`;
    
    const cuerpo = `Estimado(a) ${ap.nombre},

Espero que se encuentre muy bien.

A través de la presente comunicación formal, nos dirigimos a usted en calidad de Instructor responsable para informarle sobre el estado de su proceso formativo en el programa de formación "${fichaInfo.programaFormacion}" correspondiente a la ficha de caracterización ${fichaInfo.numeroFicha}.

Como parte del proceso de seguimiento pedagógico continuo de la plataforma SENA, hemos detectado que actualmente presenta situaciones académicas especiales que ponen en riesgo su continuidad y permanencia en la formación:

1. Evidencias Pendientes (D / No Presentadas):
Presenta un total de ${totalPendientes} evidencias pendientes de entrega o con calificación no aprobatoria (D), detalladas a continuación:
${listaEvidenciasStr}

2. Inasistencia y Acceso a la Plataforma LMS:
Registra un total de ${ap.diasSinAcceso || 0} días consecutivos sin ingresar a la plataforma virtual de aprendizaje. Su último ingreso registrado fue el ${ap.ultimoAcceso || 'No registra accesos recientes'}.

Consideraciones Pedagógicas:
El SENA se caracteriza por brindar una formación profesional integral de alta calidad, que requiere constancia, disciplina y compromiso constante. Le instamos cordialmente a retomar su ritmo de estudio y ponerse al día con sus compromisos formativos pendientes a la mayor brevedad. 

Recuerde que el equipo de instructores está a su entera disposición para brindarle el apoyo académico necesario, aclarar sus dudas o concertar tutorías personalizadas que faciliten su aprendizaje y superación de dificultades.

Por favor, responda a este correo o póngase en contacto directo con su instructor responsable para coordinar un plan de mejora académica y evitar que su caso sea escalado formalmente ante el Comité de Evaluación y Seguimiento de la Ficha.

¡Confiamos plenamente en su potencial y capacidad para culminar este proceso formativo con éxito!

Atentamente,

${fichaInfo.instructor || 'Instructor Responsable'}
Instructor Responsable
Servicio Nacional de Aprendizaje (SENA)
`;

    setEmailAsunto(asunto);
    setEmailCuerpo(cuerpo);
    setLlamadoSuccessMessage('');
    setIsLlamadoOpen(true);
  };

  const handleEnviarLlamadoConfirmado = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAprendizLlamado) return;
    setIsSendingLlamado(true);
    
    // Count pending evidences
    const evs = selectedAprendizLlamado.evidencias || {};
    let pendingCount = 0;
    Object.entries(evs).forEach(([_, value]) => {
      const valStr = typeof value === 'object' && value !== null ? (value as any).estado : String(value);
      if (valStr === 'D' || valStr === '-' || valStr === '' || !valStr) {
        pendingCount++;
      }
    });

    try {
      const response = await fetch('/api/aprendices/enviar-llamado', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          userDoc: selectedAprendizLlamado.documento,
          fichaId: fichaInfo.numeroFicha,
          asunto: emailAsunto,
          correo: emailDestinatario,
          mensaje: emailCuerpo,
          evidenciasPendientes: pendingCount,
          diasSinAcceso: selectedAprendizLlamado.diasSinAcceso || 0,
          ultimoAcceso: selectedAprendizLlamado.ultimoAcceso
        })
      });

      const result = await response.json();
      if (response.ok && result.success) {
        // Update local state in the store so the list is reactive and doesn't require a hard page reload!
        store.aplicarIntervencionIndividual(
          selectedAprendizLlamado.documento,
          'En seguimiento',
          {
            fecha: new Date().toLocaleDateString('es-CO'),
            instructor: fichaInfo.instructor,
            estadoIntervencion: 'En seguimiento',
            tipoSeguimiento: 'Correo de llamado a ponerse al día',
            evidenciasPendientes: pendingCount,
            diasSinAcceso: selectedAprendizLlamado.diasSinAcceso || 0,
            numeroLlamado: result.numeroLlamado || 1,
            detalle: emailCuerpo,
            observaciones: `Llamado de atención #${result.numeroLlamado || 1} enviado por correo.`
          }
        );

        setLlamadoSuccessMessage(`¡Llamado #${result.numeroLlamado} enviado con éxito! El estado del aprendiz se actualizó a "En seguimiento".`);
        setTimeout(() => {
          setIsLlamadoOpen(false);
          setSelectedAprendizLlamado(null);
        }, 3000);
      } else {
        alert(result.error || 'Error al enviar el llamado de atención');
      }
    } catch (err) {
      console.error('Error sending llamado:', err);
      alert('Hubo un error al comunicarse con el servidor.');
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

      // Update DB and Memory fallback
      const response = await syncLearnersToDb(
        authToken,
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
      const response = await syncLearnersToDb(
        authToken,
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

  const countAlto = store.aprendices.filter(a => a.nivelRiesgo === 'Alto').length;
  const countMedio = store.aprendices.filter(a => a.nivelRiesgo === 'Medio').length;
  const countBajo = store.aprendices.filter(a => a.nivelRiesgo === 'Bajo').length;

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

      if (strategyMassTarget) {
        // Bulk save
        await saveBulkIntervention(
          authToken,
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
          authToken,
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
        alto={countAlto}
        medio={countMedio}
        bajo={countBajo}
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
                <h3 className="font-extrabold text-sm tracking-wide uppercase">Generar y Enviar Llamado de Atención Formal</h3>
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
                <h4 className="text-xl font-bold text-slate-800">¡Notificación Enviada!</h4>
                <p className="text-sm text-slate-600 max-w-md mx-auto">{llamadoSuccessMessage}</p>
                <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                  <div className="bg-emerald-600 h-1 animate-shrink" style={{ animationDuration: '3s' }}></div>
                </div>
              </div>
            ) : (
              <form onSubmit={handleEnviarLlamadoConfirmado} className="flex-1 flex flex-col overflow-hidden">
                {/* Scrollable Form Body */}
                <div className="p-6 space-y-4 overflow-y-auto text-left">
                  
                  {/* Student Quick Stats Card */}
                  <div className="bg-red-50/50 rounded-xl p-4 border border-red-100/60 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="space-y-0.5">
                      <span className="text-slate-400 font-medium">Aprendiz</span>
                      <p className="font-black text-slate-800 truncate" title={selectedAprendizLlamado.nombre}>{selectedAprendizLlamado.nombre}</p>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-slate-400 font-medium">Documento</span>
                      <p className="font-bold text-slate-700">{selectedAprendizLlamado.documento}</p>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-slate-400 font-medium">Evidencias Pendientes</span>
                      <p className="font-extrabold text-red-600">
                        {(() => {
                          const evs = selectedAprendizLlamado.evidencias || {};
                          let count = 0;
                          Object.entries(evs).forEach(([_, val]) => {
                            const valStr = typeof val === 'object' && val !== null ? (val as any).estado : String(val);
                            if (valStr === 'D' || valStr === '-' || valStr === '' || !valStr) count++;
                          });
                          return count;
                        })()} Evidencias
                      </p>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-slate-400 font-medium">Inasistencia</span>
                      <p className="font-bold text-amber-700">{selectedAprendizLlamado.diasSinAcceso || 0} días sin acceso</p>
                    </div>
                  </div>

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
                      rows={12}
                      value={emailCuerpo}
                      onChange={e => setEmailCuerpo(e.target.value)}
                      className="w-full flex-1 px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium font-mono focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none leading-relaxed resize-none"
                    ></textarea>
                  </div>

                  <p className="text-[10px] text-slate-400 italic">
                    * Al hacer clic en enviar, el sistema registrará de forma permanente el correo en la bitácora individual de seguimiento del aprendiz y sumará un llamado de atención. Si el aprendiz acumula más de 3 llamados, se escalará automáticamente una Alerta Crítica Administrativa.
                  </p>

                </div>

                {/* Footer Buttons */}
                <div className="border-t border-slate-100 bg-slate-50 py-3.5 px-6 flex justify-end gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsLlamadoOpen(false)}
                    className="bg-white hover:bg-slate-50 text-slate-600 text-xs font-bold py-2 px-4 rounded-lg border border-slate-200 transition-all cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSendingLlamado}
                    className="bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white text-xs font-black py-2 px-5 rounded-lg shadow-md transition-all cursor-pointer flex items-center gap-1.5 active:scale-95"
                  >
                    {isSendingLlamado ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Enviando Correo...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>Enviar Notificación y Registrar</span>
                      </>
                    )}
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
