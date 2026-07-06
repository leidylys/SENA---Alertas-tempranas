import React, { useState, useRef, useEffect } from 'react';
import { auth } from '../lib/firebase.ts';
import { 
  FileSpreadsheet, 
  UploadCloud, 
  Plus, 
  Trash2, 
  CheckCircle, 
  Download, 
  Loader2, 
  UserPlus, 
  AlertTriangle, 
  BookOpen, 
  Calendar, 
  Mail,
  ShieldAlert,
  Sparkles,
  RefreshCw,
  FolderUp,
  FileCheck,
  Check,
  Building,
  GraduationCap,
  ChevronDown,
  ChevronUp,
  Search,
  Users,
  ChevronLeft,
  ChevronRight,
  X
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { 
  leerArchivoExcel, 
  leerArchivoExcel2D, 
  parseFichaExcel, 
  ProgramacionItem,
  detectarFases,
  normalizarAprendices,
  combinarDatos,
  parseReporteAprendicesExcel,
  detectExcelReportType
} from '../utils/excelParser';
import { uploadProgrammingGrid, syncLearnersToDb, resetSystemDatabase, fetchRemisionesBienestar, saveBienestarIntervencion } from '../lib/api';
import { procesarTodosLosAprendices } from '../utils/riskCalculator';

export function formatInstructorNombre(nombre: string, correo?: string): string {
  if (!nombre) return 'Instructor';
  
  const cleanEmail = (correo || '').trim().toLowerCase();
  const lowerNombre = nombre.trim().toLowerCase();
  
  // If the name is exactly an email, or contains @, or is identical to the cleaned email:
  if (nombre.includes('@') || lowerNombre === cleanEmail) {
    const prefix = nombre.split('@')[0];
    const cleanPrefix = prefix.replace(/[0-9_.-]/g, ' ').trim();
    if (!cleanPrefix) return 'Instructor';
    return cleanPrefix
      .split(/\s+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
  
  // If it's a simple flat lowercased word without spaces, let's also capitalize it
  if (nombre === nombre.toLowerCase() && !nombre.includes(' ')) {
    const cleanWord = nombre.replace(/[0-9_.-]/g, ' ').trim();
    if (!cleanWord) return nombre;
    return cleanWord
      .split(/\s+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
  
  return nombre;
}

interface BatchFileItem {
  id: string;
  fileName: string;
  file: File;
  fichaCodigo: string;
  detectedLearnersCount: number;
  status: 'pendiente' | 'procesando' | 'sincronizado' | 'error';
  errorMsg?: string;
  programaFormacion: string;
  nivel: 'Técnico' | 'Tecnólogo';
  fechaInicio: string;
  fechaFin: string;
}

interface AdminSectionProps {
  authToken: string;
  onSuccessSync: () => void;
  activeTab?: 'programacion' | 'aprendices_masivo' | 'alertas_criticas';
  onChangeTab?: (tab: 'programacion' | 'aprendices_masivo' | 'alertas_criticas') => void;
  savedFichas?: any[];
  onSelectFicha?: (codigoFicha: string) => void;
}

export default function AdminSection({ 
  authToken, 
  onSuccessSync,
  activeTab: externalActiveTab,
  onChangeTab: externalOnChangeTab,
  savedFichas = [],
  onSelectFicha
}: AdminSectionProps) {

  const getFreshToken = async (): Promise<string> => {
    try {
      if (auth && auth.currentUser) {
        const fresh = await auth.currentUser.getIdToken();
        if (fresh) return fresh;
      }
    } catch (e) {
      console.warn('Could not refresh Firebase token directly in AdminSection:', e);
    }
    return authToken;
  };

  const [internalActiveTab, setInternalActiveTab] = useState<'programacion' | 'aprendices_masivo' | 'alertas_criticas'>('programacion');

  const activeTab = externalActiveTab !== undefined ? externalActiveTab : internalActiveTab;
  const setActiveTab = externalOnChangeTab !== undefined ? externalOnChangeTab : setInternalActiveTab;

  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [parsedRows, setParsedRows] = useState<ProgramacionItem[]>([]);
  const [syncStatus, setSyncStatus] = useState<{
    successCount: number;
    errorCount: number;
    details: any;
    persistedIn?: string;
    postgresVerification?: any;
    summary?: {
      instructoresCreados: number;
      fichasCreadas: number;
      asignacionesNuevas: number;
      asignacionesConservadas: number;
      reemplazosRealizados?: number;
      conflictosDetectados?: number;
      conflictos: any[];
      registrosNoModificados: number;
      errores?: string[];
    };
  } | null>(null);
  const [activeLoadReportCategory, setActiveLoadReportCategory] = useState<string>('todos');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Student roster batch states
  const [batchFiles, setBatchFiles] = useState<BatchFileItem[]>([]);
  const [dragBatchActive, setDragBatchActive] = useState(false);
  const batchInputRef = useRef<HTMLInputElement>(null);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const [batchSyncStatus, setBatchSyncStatus] = useState<string | null>(null);
  const [batchSyncSummary, setBatchSyncSummary] = useState<any[] | null>(null);

  const [instructorsList, setInstructorsList] = useState<any[]>([]);
   const [editingPassRow, setEditingPassRow] = useState<number | null>(null);
  const [newPassInput, setNewPassInput] = useState('');
  const [newNameInput, setNewNameInput] = useState('');
  const [newRolInput, setNewRolInput] = useState('');
  const [isSavingPass, setIsSavingPass] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Instructor deletion and soft-deletion/reallocation states
  const [deleteTargetInstructor, setDeleteTargetInstructor] = useState<any | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletePrepData, setDeletePrepData] = useState<any | null>(null);
  const [deleteReassignments, setDeleteReassignments] = useState<{ [key: string]: number | null }>({});
  const [isDeletingInProgress, setIsDeletingInProgress] = useState(false);
  const [isPreppingDelete, setIsPreppingDelete] = useState(false);

  const handleRequestDeleteInstructor = async (ins: any) => {
    if (isPreppingDelete) return;
    setIsPreppingDelete(true);
    setDeleteTargetInstructor(ins);
    try {
      const activeToken = await getFreshToken();
      const res = await fetch(`/api/administrativo/instructores/${ins.id}/prepare-delete`, {
        headers: {
          'Authorization': `Bearer ${activeToken}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setDeletePrepData(data);
        
        // Initialize reassignments dictionary
        const initialReass: { [key: string]: number | null } = {};
        if (data.assignments && Array.isArray(data.assignments)) {
          data.assignments.forEach((link: any) => {
            const key = `${link.fichaId}_${link.rolEnFicha}_${link.area || 'General'}`;
            initialReass[key] = null;
          });
        }
        setDeleteReassignments(initialReass);
        setIsDeleteModalOpen(true);
      } else {
        const err = await res.json();
        alert('Error al evaluar eliminación: ' + (err.error || 'El servidor declinó la solicitud'));
      }
    } catch (err: any) {
      alert('Error de red al evaluar eliminación: ' + err.message);
    } finally {
      setIsPreppingDelete(false);
    }
  };

  const handleConfirmDeleteInstructor = async () => {
    if (!deleteTargetInstructor || !deletePrepData) return;

    // Check if any "Instructor Líder" assignment is missing reassignment
    let hasValidationError = false;
    let validationMsg = '';
    const payloadReassignments = [];

    for (const link of deletePrepData.assignments) {
      const key = `${link.fichaId}_${link.rolEnFicha}_${link.area || 'General'}`;
      const chosenId = deleteReassignments[key];

      if (link.rolEnFicha === 'Instructor Líder' && !chosenId) {
        hasValidationError = true;
        validationMsg = `Debes reasignar obligatoriamente un nuevo Instructor Líder para la Ficha ${link.codigoFicha}. Una Ficha no puede quedar sin responsable principal.`;
        break;
      }

      payloadReassignments.push({
        fichaId: link.fichaId,
        rolEnFicha: link.rolEnFicha,
        area: link.area,
        newInstructorId: chosenId
      });
    }

    if (hasValidationError) {
      alert(validationMsg);
      return;
    }

    setIsDeletingInProgress(true);
    try {
      const activeToken = await getFreshToken();
      const res = await fetch('/api/administrativo/instructores/delete-or-inactivate', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${activeToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          instructorId: deleteTargetInstructor.id,
          reassignments: payloadReassignments
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          const s = data.summary;
          let methodLabel = s.method === 'deleted' ? 'eliminado físicamente' : 'desactivado (Inactivo)';
          alert(`✅ Operación Completada Exitosamente:\n\n- El instructor "${s.nombre}" fue ${methodLabel}.\n- Fichas reasignadas: ${s.reassignedCount}\n- Asignaciones de transversales retiradas: ${s.deletedCount}`);
          
          setIsDeleteModalOpen(false);
          setDeleteTargetInstructor(null);
          setDeletePrepData(null);
          loadInstructors();
          onSuccessSync();
        } else {
          alert('Error de procesamiento: ' + (data.error || 'No se pudo retirar el instructor'));
        }
      } else {
        const err = await res.json();
        alert('Error al realizar la operación: ' + (err.error || 'Error respuesta del servidor'));
      }
    } catch (err: any) {
      alert('Error de red al intentar retirar instructor: ' + err.message);
    } finally {
      setIsDeletingInProgress(false);
    }
  };

  const handleResetSystem = async () => {
    const confirmMessage = '🚨 ATENCIÓN 🚨\n\n¿Está absolutamente seguro de que desea eliminar todas las fichas cargadas, programas, aprendices, calificaciones e intervenciones del sistema?\n\nEsto borrará todos los datos de ejemplo del sistema de manera irreversible. Los usuarios administradores conservarán sus accesos.';
    if (!window.confirm(confirmMessage)) return;

    setIsResetting(true);
    try {
      const activeToken = await getFreshToken();
      const res = await resetSystemDatabase(activeToken);
      alert(res.message || 'El sistema ha sido limpiado correctamente.');
      onSuccessSync(); // Reload the fichas list!
    } catch (err: any) {
      console.error(err);
      alert('Error al limpiar los datos de ejemplo: ' + err.message);
    } finally {
      setIsResetting(false);
    }
  };

  // New state variables for expand/collapse, searching and paginating the directory
  const [isInstructorsExpanded, setIsInstructorsExpanded] = useState(true); // default to expanded
  const [instructorSearchQuery, setInstructorSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10); // can be 10 or 20

  const loadInstructors = () => {
    fetch('/api/public/demo-instructors')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setInstructorsList(data);
        }
      })
      .catch(err => console.error('Error fetching instructors for admin:', err));
  };

  useEffect(() => {
    loadInstructors();
  }, []);

  const handleSavePassword = async (email: string) => {
    if (!newPassInput.trim()) {
      alert('La contraseña no puede estar vacía');
      return;
    }
    setIsSavingPass(true);
    try {
      const activeToken = await getFreshToken();
      const res = await fetch('/api/administrativo/instructor-password', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${activeToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          email, 
          password: newPassInput.trim(),
          nombre: newNameInput.trim() || undefined,
          rol: newRolInput.trim() || undefined
        })
      });
      if (res.ok) {
        setEditingPassRow(null);
        setNewPassInput('');
        setNewNameInput('');
        setNewRolInput('');
        loadInstructors();
      } else {
        const err = await res.json();
        alert('Error: ' + (err.error || 'No se pudo actualizar'));
      }
    } catch (err: any) {
      alert('Error de red al actualizar: ' + err.message);
    } finally {
      setIsSavingPass(false);
    }
  };

  // Manual line additions state
  const [manualRows, setManualRows] = useState<ProgramacionItem[]>([
    {
      codigoFicha: '',
      correoInstructor: '',
      nombreInstructor: '',
      nombrePrograma: '',
      nivel: 'Tecnólogo',
      fechaInicio: '',
      fechaFin: '',
      rolInstructor: 'Instructor Técnico',
      area: 'General'
    }
  ]);

  const handleSpreadsheetFile = async (selectedFile: File) => {
    setFile(selectedFile);
    setLoading(true);
    try {
      // Load raw 2D structure to support multiple formats
      const rows2D = await leerArchivoExcel2D(selectedFile);
      const mapped = parseFichaExcel(rows2D);

      if (mapped.length === 0) {
        alert('No se detectaron filas válidas. Asegúrate de cargar un formato de programación o un Reporte de Instructores por Ficha como el provisto por la coordinación.');
      } else {
        setParsedRows(mapped);
      }
    } catch (err: any) {
      console.error(err);
      alert('Error leyendo el archivo Excel: ' + (err.message || 'Valida la estructura e intenta nuevamente.'));
    } finally {
      setLoading(false);
    }
  };

  // Drag and Drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleSpreadsheetFile(e.dataTransfer.files[0]);
    }
  };

  const handleDragBatch = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragBatchActive(true);
    } else if (e.type === "dragleave") {
      setDragBatchActive(false);
    }
  };

  const handleDropBatch = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragBatchActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleLearnersBatchFiles(e.dataTransfer.files);
    }
  };

  // Sample Excel creator
  const downloadSampleTemplate = () => {
    const dump = [
      {
        'Codigo Ficha': '2281902',
        'Programa Formacion': 'Análisis y Desarrollo de Software',
        'Nivel': 'Tecnólogo',
        'Fecha Inicio': '2026-01-15',
        'Fecha Fin': '2027-12-15',
        'Correo Instructor': 'pedro.perez@sena.edu.co',
        'Nombre Instructor': 'Pedro Pérez',
        'Rol Instructor': 'Instructor Técnico',
        'Área': 'General'
      },
      {
        'Codigo Ficha': '2321456',
        'Programa Formacion': 'Gestión de Talento Humano',
        'Nivel': 'Tecnólogo',
        'Fecha Inicio': '2026-03-10',
        'Fecha Fin': '2027-11-20',
        'Correo Instructor': 'martha.gomez@sena.edu.co',
        'Nombre Instructor': 'Martha Gómez',
        'Rol Instructor': 'Instructor Transversal',
        'Área': 'Inglés'
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(dump);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Programación Fichas');
    
    // Write out download
    XLSX.writeFile(workbook, 'Sena_Plantilla_Programacion_Fichas.xlsx');
  };

  // Blank Excel template creator
  const downloadBlankTemplate = () => {
    const dump = [
      {
        'Codigo Ficha': '',
        'Programa Formacion': '',
        'Nivel': '',
        'Fecha Inicio': '',
        'Fecha Fin': '',
        'Correo Instructor': '',
        'Nombre Instructor': '',
        'Rol Instructor': '',
        'Área': ''
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(dump);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Plantilla Vacía');
    
    XLSX.writeFile(workbook, 'Sena_Plantilla_Vacia.xlsx');
  };

  // Manual row management
  const handleManualRowChange = (index: number, field: keyof ProgramacionItem, val: string) => {
    const updated = [...manualRows];
    updated[index][field] = val;
    setManualRows(updated);
  };

  const addManualRow = () => {
    setManualRows([
      ...manualRows,
      {
        codigoFicha: '',
        correoInstructor: '',
        nombreInstructor: '',
        nombrePrograma: '',
        nivel: 'Tecnólogo',
        fechaInicio: '',
        fechaFin: '',
        rolInstructor: 'Instructor Técnico',
        area: 'General'
      }
    ]);
  };

  const removeManualRow = (index: number) => {
    const updated = manualRows.filter((_, idx) => idx !== index);
    setManualRows(updated.length > 0 ? updated : [
      {
        codigoFicha: '',
        correoInstructor: '',
        nombreInstructor: '',
        nombrePrograma: '',
        nivel: 'Tecnólogo',
        fechaInicio: '',
        fechaFin: '',
        rolInstructor: 'Instructor Técnico',
        area: 'General'
      }
    ]);
  };

  const useManualRowsForSync = () => {
    const valid = manualRows.filter(r => r.codigoFicha.trim() && r.correoInstructor.trim());
    if (valid.length === 0) {
      alert('Ingresa por lo menos una fila con código de Ficha y Correo de Instructor válidos.');
      return;
    }
    setParsedRows(valid);
  };

  // Handler to edit the parsed rows inline prior to DB synchronization
  const handleParsedRowChange = (index: number, field: keyof ProgramacionItem, val: string) => {
    const updated = [...parsedRows];
    updated[index] = {
      ...updated[index],
      [field]: val
    };
    setParsedRows(updated);
  };

  // Send to Postgres SQL Database
  const triggerDatabaseSincronizacion = async () => {
    if (parsedRows.length === 0) return;

    // Validate rules: Si el rol es Instructor Transversal, el área debe ser obligatoria.
    const missingAreaItem = parsedRows.find(
      r => (r.rolInstructor || '').toLowerCase().includes('transversal') && !r.area?.trim()
    );
    if (missingAreaItem) {
      alert(`El campo Área es obligatorio cuando el rol es 'Instructor Transversal' (Ficha: ${missingAreaItem.codigoFicha || 'N/A'}, Instructor: ${missingAreaItem.nombreInstructor || missingAreaItem.correoInstructor}). Por favor asigne un área (ej: Inglés, Ética) antes de sincronizar.`);
      return;
    }

    setLoading(true);
    setSyncStatus(null);
    try {
      const activeToken = await getFreshToken();
      console.log('[PERSISTENCE_DEBUG] AdminSection.triggerDatabaseSincronizacion.datos_formulario', {
        totalRegistros: parsedRows.length,
        programacion: parsedRows
      });
      const res = await uploadProgrammingGrid(activeToken, parsedRows);
      console.log('[PERSISTENCE_DEBUG] AdminSection.triggerDatabaseSincronizacion.respuesta_backend', res);
      if (res && res.success) {
        let successCount = 0;
        let errorCount = 0;
        if (res.summary) {
          successCount =
            (res.summary.instructoresCreados || 0) +
            (res.summary.fichasCreadas || 0) +
            (res.summary.asignacionesNuevas || 0) +
            (res.summary.asignacionesConservadas || 0);
          errorCount =
            (res.summary.conflictosDetectados || res.summary.conflictos?.length || 0) +
            (res.summary.registrosNoModificados || 0);
        } else if (Array.isArray(res.details)) {
          res.details.forEach((d: any) => {
            if (d.status === 'Sincronizado') successCount++;
            else errorCount++;
          });
        } else {
          successCount = res.processed || parsedRows.length;
        }

        const summary = res.summary || {
          instructoresCreados: 0,
          fichasCreadas: 0,
          asignacionesNuevas: successCount,
          asignacionesConservadas: 0,
          reemplazosRealizados: 0,
          conflictos: [],
          registrosNoModificados: errorCount
        };

        if (summary.conflictos && summary.conflictos.length > 0) {
          let alertMsg = '🚨 CONFLICTO DETECTADO AL CARGAR LA PROGRAMACIÓN 🚨\n\n';
          summary.conflictos.forEach((conf: any, index: number) => {
            alertMsg += `Conflicto #${index + 1}:\n`;
            alertMsg += `- Código de Ficha: ${conf.codigoFicha}\n`;
            alertMsg += `- Instructor Existente: ${conf.instructorExistente}\n`;
            alertMsg += `- Instructor Nuevo: ${conf.instructorNuevo}\n`;
            alertMsg += `- Rol: ${conf.rol}\n`;
            alertMsg += `- Área: ${conf.area}\n`;
            alertMsg += `- Tipo de Conflicto: ${conf.tipoConflicto}\n\n`;
          });
          alertMsg += 'Por seguridad del sistema, no se sobrescribió automáticamente la información existente.';
          alert(alertMsg);
        }

        setSyncStatus({
          successCount,
          errorCount,
          details: res.details || [],
          persistedIn: res.persistedIn,
          postgresVerification: res.postgresVerification,
          summary
        });
        setActiveLoadReportCategory('todos');

        setParsedRows([]);
        setFile(null);
        loadInstructors(); // Refresh the credential directory list too!
        console.log('[PERSISTENCE_DEBUG] AdminSection.triggerDatabaseSincronizacion.refetch_fichas_desde_db');
        onSuccessSync(); // Reload core App's ficha listings!
      }
    } catch (err: any) {
      console.error('[PERSISTENCE_DEBUG] AdminSection.triggerDatabaseSincronizacion.error_escritura', err);
      alert('Fallo al cargar la programación en el servidor: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handler for student list batch file uploads
  const handleLearnersBatchFiles = async (filesList: FileList) => {
    setBatchSyncStatus(null);
    const items: BatchFileItem[] = [];
    
    for (let i = 0; i < filesList.length; i++) {
      const file = filesList[i];
      // Regex detects any 6 to 9 digit number as Ficha Code
      const match = file.name.match(/(\d{6,9})/);
      const fichaCodigo = match ? match[1] : '';
      
      items.push({
        id: Math.random().toString(36).substring(7),
        fileName: file.name,
        file,
        fichaCodigo: fichaCodigo || '',
        detectedLearnersCount: 0,
        status: 'pendiente',
        programaFormacion: 'Detectando...',
        nivel: 'Tecnólogo',
        fechaInicio: '2026-01-15',
        fechaFin: '2027-12-15'
      });
    }

    // Append to state
    setBatchFiles(prev => [...prev, ...items]);

    // Parse each file
    for (const item of items) {
      try {
        const rows2D = await leerArchivoExcel2D(item.file);
        
        // Validate that this is indeed an apprentice listing and not a qualifications report
        const reportType = detectExcelReportType(rows2D);
        if (reportType === 'calificaciones') {
          throw new Error('El archivo cargado no corresponde a un reporte de aprendices por ficha.');
        }

        const result = parseReporteAprendicesExcel(rows2D);
        
        let detectedFicha = result.fichaCodigo || item.fichaCodigo;
        let programa = result.programaFormacion;
        let nivel = result.nivel;

        // Update parsed item values
        setBatchFiles(prev => prev.map(f => f.id === item.id ? {
          ...f,
          fichaCodigo: detectedFicha || f.fichaCodigo || '',
          detectedLearnersCount: result.aprendices.length,
          programaFormacion: programa,
          nivel,
          status: 'pendiente'
        } : f));

      } catch (err: any) {
        setBatchFiles(prev => prev.map(f => f.id === item.id ? {
          ...f,
          status: 'error',
          errorMsg: err.message || 'Estructura inválida o vacía'
        } : f));
      }
    }
  };

  const handleBatchItemChange = (id: string, field: keyof BatchFileItem, val: any) => {
    setBatchFiles(prev => prev.map(f => f.id === id ? { ...f, [field]: val } : f));
  };

  const removeBatchFile = (id: string) => {
    setBatchFiles(prev => prev.filter(f => f.id !== id));
  };

  const startBatchSincronizacion = async () => {
    const pending = batchFiles.filter(f => f.status === 'pendiente' || f.status === 'error');
    if (pending.length === 0) {
      alert('No hay reportes de aprendices cargados o pendientes por sincronizar.');
      return;
    }

    setIsProcessingBatch(true);
    setBatchSyncSummary(null); // Clear previous summaries
    let successfullySynced = 0;
    let failedSynced = 0;
    const summaries: any[] = [];

    for (const item of pending) {
      if (!item.fichaCodigo.trim()) {
        setBatchFiles(prev => prev.map(f => f.id === item.id ? {
          ...f,
          status: 'error',
          errorMsg: 'Código de Ficha requerido'
        } : f));
        failedSynced++;
        summaries.push({
          fileName: item.fileName,
          fichaCodigo: item.fichaCodigo || 'Desconocido',
          totalRows: 0,
          validCount: 0,
          nuevos: 0,
          actualizados: 0,
          conservados: 0,
          inactivados: 0,
          reactivados: 0,
          status: 'error',
          errorMsg: 'Código de Ficha requerido'
        });
        continue;
      }

      setBatchFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: 'procesando' } : f));

      try {
        const rows2D = await leerArchivoExcel2D(item.file);
        const result = parseReporteAprendicesExcel(rows2D);

        // Sync to Cloud SQL via API Route
        const activeToken = await getFreshToken();
        console.log('[PERSISTENCE_DEBUG] AdminSection.startBatchSincronizacion.datos_formulario', {
          archivo: item.fileName,
          ficha: item.fichaCodigo,
          totalAprendices: result.aprendices.length,
          aprendices: result.aprendices
        });
        const syncResponse = await syncLearnersToDb(
          activeToken,
          item.fichaCodigo,
          item.programaFormacion,
          item.nivel,
          item.fechaInicio,
          item.fechaFin,
          result.aprendices
        );
        console.log('[PERSISTENCE_DEBUG] AdminSection.startBatchSincronizacion.respuesta_backend', {
          archivo: item.fileName,
          ficha: item.fichaCodigo,
          response: syncResponse
        });

        setBatchFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: 'sincronizado', errorMsg: undefined } : f));
        successfullySynced++;

        // Save detailed results for the ledger report card
        summaries.push({
          fileName: item.fileName,
          fichaCodigo: item.fichaCodigo,
          totalRows: result.totalRows || 0,
          validCount: result.aprendices.length || 0,
          nuevos: syncResponse.summary?.nuevos ?? 0,
          actualizados: syncResponse.summary?.actualizados ?? 0,
          conservados: syncResponse.summary?.conservados ?? 0,
          inactivados: syncResponse.summary?.inactivados ?? 0,
          reactivados: syncResponse.summary?.reactivados ?? 0,
          persistedIn: syncResponse.persistedIn,
          postgresVerification: syncResponse.postgresVerification,
          status: 'success'
        });
      } catch (err: any) {
        console.error('[PERSISTENCE_DEBUG] AdminSection.startBatchSincronizacion.error_escritura', err);
        setBatchFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: 'error', errorMsg: err.message || 'Error de conexión' } : f));
        failedSynced++;
        summaries.push({
          fileName: item.fileName,
          fichaCodigo: item.fichaCodigo,
          totalRows: 0,
          validCount: 0,
          nuevos: 0,
          actualizados: 0,
          conservados: 0,
          inactivados: 0,
          reactivados: 0,
          status: 'error',
          errorMsg: err.message || 'Error general en el proceso'
        });
      }
    }

    setIsProcessingBatch(false);
    setBatchSyncSummary(summaries);
    setBatchSyncStatus(`Proceso de sincronización completado. Se procesaron ${pending.length} archivo(s): ${successfullySynced} cargados con éxito, ${failedSynced} fallidos.`);
    console.log('[PERSISTENCE_DEBUG] AdminSection.startBatchSincronizacion.refetch_fichas_desde_db', {
      successfullySynced,
      failedSynced
    });
    onSuccessSync(); // Refresh lists!
  };

  const getLoadReportDetails = () => {
    const rawDetails = syncStatus?.details;
    if (rawDetails && !Array.isArray(rawDetails)) {
      return {
        instructoresCreados: rawDetails.instructoresCreados || [],
        fichasCreadas: rawDetails.fichasCreadas || [],
        asignacionesNuevas: rawDetails.asignacionesNuevas || [],
        asignacionesConservadas: rawDetails.asignacionesConservadas || [],
        reemplazosRealizados: rawDetails.reemplazosRealizados || [],
        conflictosDetectados: rawDetails.conflictosDetectados || [],
        registrosNoModificados: rawDetails.registrosNoModificados || []
      };
    }

    return {
      instructoresCreados: [],
      fichasCreadas: [],
      asignacionesNuevas: [],
      asignacionesConservadas: [],
      reemplazosRealizados: [],
      conflictosDetectados: syncStatus?.summary?.conflictos || [],
      registrosNoModificados: []
    };
  };

  const getLoadReportCategories = () => {
    const details = getLoadReportDetails();
    return [
      {
        key: 'instructoresCreados',
        label: 'Instructores Creados',
        count: syncStatus?.summary?.instructoresCreados ?? details.instructoresCreados.length,
        tone: 'slate',
        description: 'acciones aplicadas'
      },
      {
        key: 'fichasCreadas',
        label: 'Fichas Creadas',
        count: syncStatus?.summary?.fichasCreadas ?? details.fichasCreadas.length,
        tone: 'slate',
        description: 'acciones aplicadas'
      },
      {
        key: 'asignacionesNuevas',
        label: 'Asignaciones Nuevas',
        count: syncStatus?.summary?.asignacionesNuevas ?? details.asignacionesNuevas.length,
        tone: 'emerald',
        description: 'acciones aplicadas'
      },
      {
        key: 'asignacionesConservadas',
        label: 'Asignaciones Conservadas',
        count: syncStatus?.summary?.asignacionesConservadas ?? details.asignacionesConservadas.length,
        tone: 'blue',
        description: 'acciones conservadas'
      },
      {
        key: 'reemplazosRealizados',
        label: 'Reemplazos Realizados',
        count: syncStatus?.summary?.reemplazosRealizados ?? details.reemplazosRealizados.length,
        tone: 'amber',
        description: 'acciones aplicadas'
      },
      {
        key: 'conflictosDetectados',
        label: 'Conflictos Detectados',
        count: syncStatus?.summary?.conflictosDetectados ?? syncStatus?.summary?.conflictos?.length ?? details.conflictosDetectados.length,
        tone: 'rose',
        description: 'acciones rechazadas'
      },
      {
        key: 'registrosNoModificados',
        label: 'Registros No Modificados',
        count: syncStatus?.summary?.registrosNoModificados ?? details.registrosNoModificados.length,
        tone: 'slate',
        description: 'sin modificación'
      }
    ];
  };

  const getSelectedLoadReportRows = () => {
    const details = getLoadReportDetails();
    if (activeLoadReportCategory === 'todos') {
      return Object.entries(details).flatMap(([category, rows]) =>
        (rows as any[]).map(row => ({ ...row, category }))
      );
    }
    return ((details as any)[activeLoadReportCategory] || []).map((row: any) => ({
      ...row,
      category: activeLoadReportCategory
    }));
  };

  const getCategoryLabel = (category: string) => {
    if (category === 'todos') return 'Todos los resultados';
    return getLoadReportCategories().find(item => item.key === category)?.label || category;
  };

  const shouldShowReplacementColumns = () =>
    activeLoadReportCategory === 'reemplazosRealizados' ||
    getSelectedLoadReportRows().some((row: any) =>
      row.category === 'reemplazosRealizados' ||
      row.instructorAnteriorNombre ||
      row.instructorNuevoNombre
    );

  const exportLoadReport = () => {
    const rows = getSelectedLoadReportRows();
    if (rows.length === 0) {
      alert('No hay registros para exportar en esta categoría.');
      return;
    }

    const exportRows = rows.map((row: any) => ({
      Categoria: getCategoryLabel(row.category),
      Fila: row.rowNumber || '',
      Ficha: row.fichaCodigo || row.codigoFicha || '',
      Programa: row.programa || '',
      Instructor: row.instructorNombre || row.instructorNuevo || '',
      Correo: row.instructorCorreo || row.correoInstructor || '',
      Rol: row.rolEnFicha || row.rol || '',
      Area: row.area || 'General',
      InstructorAnterior: row.instructorAnteriorNombre || '',
      CorreoAnterior: row.instructorAnteriorCorreo || '',
      InstructorNuevo: row.instructorNuevoNombre || '',
      CorreoNuevo: row.instructorNuevoCorreo || '',
      Estado: row.status || '',
      Motivo: row.reason || row.motivoDetallado || row.tipoConflicto || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Informe de carga');
    XLSX.writeFile(workbook, `informe-carga-programacion-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-150 p-6 sm:p-8 space-y-8 shadow-[0_4px_25px_rgba(0,0,0,0.015)]" id="admin-centre-panel">
      
      {/* Title & badge */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase text-[#39A900] bg-emerald-50 border border-emerald-100 px-3 py-1 rounded-lg">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Coordinación Académica • Servicio Administrativo</span>
          </div>
          <h2 className="text-xl md:text-2xl font-heading font-extrabold text-slate-900 tracking-tight">
            Panel de Administración y Control
          </h2>
          <p className="text-xs text-slate-505 leading-relaxed max-w-2xl font-medium">
            Sincronice asignaciones oficiales de fichas e instructores o cargue listados de aprendices en lote de forma centralizada.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleResetSystem}
            disabled={isResetting}
            className="px-4 py-2.5 hover:bg-rose-50 border border-slate-200 hover:border-rose-250 text-slate-600 hover:text-rose-650 font-black text-xs rounded-xl transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer shadow-4xs select-none disabled:opacity-50"
            id="admin-reset-system-database-btn"
          >
            {isResetting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Limpiando...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                <span>Borrar datos de ejemplo</span>
              </>
            )}
          </button>
          <button
            onClick={useManualRowsForSync}
            className="hidden"
          />
        </div>
      </div>

      {/* Tabs navigation selector */}
      <div className="flex gap-1.5 border border-slate-100 p-1 bg-slate-50/70 rounded-xl self-start inline-flex">
        <button
          onClick={() => setActiveTab('programacion')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all duration-300 cursor-pointer ${
            activeTab === 'programacion'
              ? 'bg-[#39A900] text-white shadow-xs'
              : 'text-slate-500 hover:text-slate-800'
          }`}
          id="admin-tab-programacion-btn"
        >
          <Calendar className="w-4 h-4" />
          <span>Asignación de Fichas (Reporte)</span>
        </button>
        <button
          onClick={() => setActiveTab('aprendices_masivo')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all duration-300 cursor-pointer ${
            activeTab === 'aprendices_masivo'
              ? 'bg-[#39A900] text-white shadow-xs'
              : 'text-slate-500 hover:text-slate-800'
          }`}
          id="admin-tab-aprendices-btn"
        >
          <GraduationCap className="w-4 h-4" />
          <span>Reporte de Aprendices (Varios Archivos)</span>
        </button>
        <button
          onClick={() => setActiveTab('alertas_criticas')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all duration-300 cursor-pointer ${
            activeTab === 'alertas_criticas'
              ? 'bg-[#39A900] text-white shadow-xs'
              : 'text-slate-500 hover:text-slate-800'
          }`}
          id="admin-tab-alertas-criticas-btn"
        >
          <ShieldAlert className="w-4 h-4" />
          <span>Alertas Críticas y Remisiones</span>
        </button>
      </div>

      {syncStatus && (
        <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-emerald-50 rounded-lg text-[#39A900]">
                <CheckCircle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-800">Resultado de Carga de Programación</h4>
                <p className="text-[10px] text-slate-500">Filas procesadas: {syncStatus.successCount + syncStatus.errorCount}</p>
              </div>
            </div>
            
            <button 
              onClick={() => setSyncStatus(null)}
              className="text-[10px] text-slate-400 hover:text-slate-600 font-bold hover:underline"
            >
              Cerrar Resumen
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              onClick={() => setActiveLoadReportCategory('todos')}
              className={`px-3 py-1.5 rounded-lg border text-[10px] font-extrabold transition-all ${
                activeLoadReportCategory === 'todos'
                  ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              Ver todos los resultados
            </button>

            <button
              onClick={exportLoadReport}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-emerald-50 border border-emerald-150 text-[10px] font-extrabold text-emerald-800 rounded-lg transition-colors shadow-4xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar informe de carga</span>
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {getLoadReportCategories().map(category => {
              const isActive = activeLoadReportCategory === category.key;
              const toneClass =
                category.tone === 'emerald'
                  ? 'bg-emerald-50/50 border-emerald-100 text-[#39A900]'
                  : category.tone === 'blue'
                    ? 'bg-blue-50/35 border-blue-100 text-blue-700'
                    : category.tone === 'amber'
                      ? 'bg-amber-50 border-amber-100 text-amber-700'
                      : category.tone === 'rose' && category.count > 0
                        ? 'bg-rose-50 border-rose-100 text-rose-600'
                        : 'bg-slate-50 border-slate-100 text-slate-700';

              return (
                <button
                  key={category.key}
                  onClick={() => setActiveLoadReportCategory(category.key)}
                  className={`text-left p-3 border rounded-lg transition-all cursor-pointer ${toneClass} ${
                    isActive ? 'ring-2 ring-slate-900/10 shadow-sm scale-[1.01]' : 'hover:shadow-xs'
                  }`}
                >
                  <span className="block text-[9px] uppercase font-extrabold tracking-wider opacity-75">
                    {category.label}
                  </span>
                  <strong className="text-base font-extrabold block mt-0.5">
                    {category.count}
                  </strong>
                  <span className="block text-[9px] font-bold mt-1 opacity-80">
                    {isActive ? 'Detalle activo' : 'Ver detalle'} · {category.description}
                  </span>
                </button>
              );
            })}
          </div>

          {syncStatus.postgresVerification && (
            <div className="bg-emerald-50 border border-emerald-150 rounded-lg p-3 text-[10px] text-emerald-900 font-semibold">
              Persistencia verificada en {syncStatus.persistedIn || 'PostgreSQL/Neon'}:
              {' '}fichas <strong>{syncStatus.postgresVerification.fichas}</strong>,
              {' '}instructores <strong>{syncStatus.postgresVerification.instructores}</strong>,
              {' '}relaciones <strong>{syncStatus.postgresVerification.instructor_ficha}</strong>,
              {' '}aprendices <strong>{syncStatus.postgresVerification.aprendices_fichas}</strong>.
            </div>
          )}

          <div className="border border-slate-200 rounded-lg bg-white overflow-hidden">
            <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-slate-800 text-[10px] font-extrabold">
                <FileCheck className="w-3.5 h-3.5 text-[#39A900]" />
                <span>DETALLE DEL INFORME · {getCategoryLabel(activeLoadReportCategory).toUpperCase()}</span>
              </div>
              <span className="text-[9px] text-slate-500 font-bold bg-white border border-slate-200 px-1.5 py-0.5 rounded">
                {getSelectedLoadReportRows().length} registro(s)
              </span>
            </div>

            <div className="overflow-x-auto max-h-72">
              <table className="min-w-full text-[10px]">
                <thead className="bg-white sticky top-0 z-10 border-b border-slate-100">
                  <tr className="text-left text-slate-400 uppercase tracking-wide">
                    <th className="px-3 py-2 font-extrabold">Fila</th>
                    <th className="px-3 py-2 font-extrabold">Ficha</th>
                    <th className="px-3 py-2 font-extrabold">Programa</th>
                    <th className="px-3 py-2 font-extrabold">Instructor</th>
                    <th className="px-3 py-2 font-extrabold">Correo</th>
                    <th className="px-3 py-2 font-extrabold">Rol</th>
                    <th className="px-3 py-2 font-extrabold">Área</th>
                    {shouldShowReplacementColumns() && (
                      <>
                        <th className="px-3 py-2 font-extrabold">Instructor anterior</th>
                        <th className="px-3 py-2 font-extrabold">Correo anterior</th>
                        <th className="px-3 py-2 font-extrabold">Instructor nuevo</th>
                        <th className="px-3 py-2 font-extrabold">Correo nuevo</th>
                      </>
                    )}
                    <th className="px-3 py-2 font-extrabold">Estado</th>
                    <th className="px-3 py-2 font-extrabold">Motivo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {getSelectedLoadReportRows().length === 0 ? (
                    <tr>
                      <td colSpan={shouldShowReplacementColumns() ? 13 : 9} className="px-3 py-6 text-center text-slate-400 font-bold">
                        No hay registros en esta categoría.
                      </td>
                    </tr>
                  ) : (
                    getSelectedLoadReportRows().map((row: any, idx: number) => (
                      <tr key={`${row.category}-${row.rowNumber || idx}-${idx}`} className="hover:bg-slate-50/80">
                        <td className="px-3 py-2 font-bold text-slate-500">{row.rowNumber || '-'}</td>
                        <td className="px-3 py-2 font-extrabold text-slate-700">{row.fichaCodigo || row.codigoFicha || '-'}</td>
                        <td className="px-3 py-2 text-slate-600 max-w-[180px] truncate">{row.programa || '-'}</td>
                        <td className="px-3 py-2 text-slate-700 font-semibold">{row.instructorNombre || row.instructorNuevo || '-'}</td>
                        <td className="px-3 py-2 text-slate-500">{row.instructorCorreo || row.correoInstructor || '-'}</td>
                        <td className="px-3 py-2 text-slate-600">{row.rolEnFicha || row.rol || '-'}</td>
                        <td className="px-3 py-2 text-slate-600">{row.area || 'General'}</td>
                        {shouldShowReplacementColumns() && (
                          <>
                            <td className="px-3 py-2 text-slate-700 font-semibold">{row.instructorAnteriorNombre || '-'}</td>
                            <td className="px-3 py-2 text-slate-500">{row.instructorAnteriorCorreo || '-'}</td>
                            <td className="px-3 py-2 text-slate-700 font-semibold">{row.instructorNuevoNombre || row.instructorNombre || '-'}</td>
                            <td className="px-3 py-2 text-slate-500">{row.instructorNuevoCorreo || row.instructorCorreo || '-'}</td>
                          </>
                        )}
                        <td className="px-3 py-2">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                            row.status === 'conflict'
                              ? 'bg-rose-50 text-rose-700'
                              : row.status === 'created'
                                ? 'bg-emerald-50 text-emerald-700'
                                : row.status === 'updated'
                                  ? 'bg-amber-50 text-amber-700'
                                : row.status === 'conserved'
                                  ? 'bg-blue-50 text-blue-700'
                                  : 'bg-slate-100 text-slate-600'
                          }`}>
                            {row.status || 'registrado'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-600 min-w-[220px]">
                          {row.reason || row.motivoDetallado || row.tipoConflicto || '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'programacion' && (
        <div className="space-y-4">
          {parsedRows.length === 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Option A: Excel drag drop */}
            <div className="lg:col-span-12 space-y-4">
              
              {/* Sistema de Alertas / Recursos de Plantillas */}
              <div className="bg-slate-50 border border-slate-250 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 bg-[#39A900]/10 rounded-xl text-[#39A900] border border-[#39A900]/20 shrink-0">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      Sistema de Plantillas Oficiales de Coordinación
                    </h4>
                    <p className="text-[11px] text-slate-500 leading-normal max-w-xl">
                      Para que su carga de programación sea exitosa, tenga presente qué columnas usar descargando la <strong>Plantilla Vacía (Lista para copiar)</strong> o la <strong>Plantilla de Referencia con Ejemplos</strong>.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={downloadBlankTemplate}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-250 text-[11px] font-extrabold text-slate-700 rounded-lg transition-colors shadow-4xs cursor-pointer"
                    id="btn-download-blank"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-500" />
                    <span>Descargar Plantilla Vacía</span>
                  </button>
                  <button
                    onClick={downloadSampleTemplate}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-[11px] font-extrabold text-[#39A900] rounded-lg transition-colors shadow-4xs cursor-pointer"
                    id="btn-download-sample"
                  >
                    <Download className="w-3.5 h-3.5 text-[#39A900]" />
                    <span>Plantilla con Ejemplos</span>
                  </button>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pt-1">
                <h3 className="text-xs font-extrabold text-slate-550 uppercase tracking-wide">
                  Carga por Archivo Excel (.xlsx) / Reporte de Coordinación
                </h3>
                <p className="text-[11px] text-slate-400">
                  Soporta formato directo o "Reporte de Instructores por Ficha" de Excel.
                </p>
              </div>

              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                  dragActive 
                    ? 'border-[#39A900] bg-[#39A900]/5 scale-[1.01]' 
                    : 'border-slate-200 hover:border-slate-350 bg-slate-50/50'
                }`}
              >
                <input 
                  ref={fileInputRef} 
                  type="file" 
                  onChange={e => e.target.files?.[0] && handleSpreadsheetFile(e.target.files[0])} 
                  accept=".xlsx,.xls" 
                  className="hidden" 
                />
                <div className="max-w-md mx-auto space-y-3 flex flex-col items-center">
                  <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center text-[#39A900] shadow-2xs">
                    <UploadCloud className="w-6 h-6 animate-pulse" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-700">Arrastra tu Reporte Excel aquí o busca en tu equipo</p>
                    <p className="text-[10px] text-slate-400">Soporta "Reporte de Instructores por Ficha" y saca los Códigos y Nombres al vuelo de forma inteligente.</p>
                  </div>
                </div>
              </div>
            </div>

          </div>
        ) : (
          
          // Show Parsed items verification grid with full interactive inputs
          <div className="space-y-4 animate-fade-in">
            <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
              <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-extrabold font-sans">Verificación Interactiva de Datos (Edite directamente si lo requiere):</span>
                <p className="text-slate-655 font-normal leading-relaxed">
                  Hemos extraído <strong className="text-amber-950 font-black">{parsedRows.length} fila(s) de asignación</strong>. Para garantizar la máxima precisión y corregir cualquier email ausente, puede hacer clic y corregir cualquier campo en la grilla antes de sincronizar con la base de datos Cloud SQL.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl custom-scrollbar max-h-96">
              <table className="w-full text-xs text-left text-slate-600 bg-white">
                <thead className="text-[10px] uppercase font-black tracking-wider text-slate-400 bg-slate-50 border-b border-slate-150 sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-3 w-[15%]">Código Ficha</th>
                    <th className="px-3 py-3 w-[25%]">Programa de Formación</th>
                    <th className="px-3 py-3 w-[25%]">Correo Instructor (Sena)</th>
                    <th className="px-3 py-3 w-[20%]">Nombre Completo Instructor</th>
                    <th className="px-3 py-3 w-[15%]">Rol del Instructor</th>
                    <th className="px-3 py-3 w-[12%]">Área</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {parsedRows.map((item, index) => (
                    <tr key={index} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-2 py-1.5 align-middle">
                        <input 
                          type="text" 
                          value={item.codigoFicha || ''} 
                          onChange={e => handleParsedRowChange(index, 'codigoFicha', e.target.value)}
                          className="w-full px-2 py-1 text-xs font-mono font-bold text-slate-800 bg-slate-50/75 border border-slate-200 rounded-lg focus:bg-white focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 focus:outline-none"
                        />
                      </td>
                      <td className="px-2 py-1.5 align-middle">
                        <input 
                          type="text" 
                          value={item.nombrePrograma || ''} 
                          onChange={e => handleParsedRowChange(index, 'nombrePrograma', e.target.value)}
                          className="w-full px-2 py-1 text-xs text-slate-800 bg-slate-50/75 border border-slate-200 rounded-lg focus:bg-white focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 focus:outline-none"
                        />
                      </td>
                      <td className="px-2 py-1.5 align-middle">
                        <input 
                          type="email" 
                          value={item.correoInstructor || ''} 
                          onChange={e => handleParsedRowChange(index, 'correoInstructor', e.target.value)}
                          className="w-full px-2 py-1 text-xs font-mono text-emerald-800 bg-emerald-50/20 border border-emerald-200 rounded-lg focus:bg-white focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 focus:outline-none placeholder:italic placeholder:text-slate-300"
                          placeholder="generado@sena.edu.co"
                        />
                      </td>
                      <td className="px-2 py-1.5 align-middle">
                        <input 
                          type="text" 
                          value={item.nombreInstructor || ''} 
                          onChange={e => handleParsedRowChange(index, 'nombreInstructor', e.target.value)}
                          className="w-full px-2 py-1 text-xs font-semibold text-slate-800 bg-slate-50/75 border border-slate-200 rounded-lg focus:bg-white focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 focus:outline-none"
                        />
                      </td>
                      <td className="px-2 py-1.5 align-middle">
                        <select
                          value={item.rolInstructor || 'Instructor Técnico'}
                          onChange={e => {
                            const newRol = e.target.value;
                            handleParsedRowChange(index, 'rolInstructor', newRol);
                            if (newRol === 'Instructor Líder') {
                              handleParsedRowChange(index, 'area', item.area || 'General');
                            } else if (newRol === 'Instructor Transversal') {
                              if (!item.area || item.area === 'General') {
                                handleParsedRowChange(index, 'area', '');
                              }
                            }
                          }}
                          className="w-full px-2 py-1 text-xs text-slate-700 bg-slate-50/75 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                        >
                          <option value="Coordinación">Coordinación</option>
                          <option value="Administrativo">Administrativo</option>
                          <option value="Instructor Líder">Instructor Líder</option>
                          <option value="Instructor Transversal">Instructor Transversal</option>
                          <option value="Instructor Técnico">Instructor Técnico</option>
                          <option value="Vocero de Ficha">Vocero de Ficha</option>
                        </select>
                      </td>
                      <td className="px-2 py-1.5 align-middle">
                        <input 
                          type="text" 
                          placeholder={item.rolInstructor === 'Instructor Transversal' ? 'Área requerida (Inglés, etc)' : 'General'}
                          value={item.area || ''} 
                          onChange={e => handleParsedRowChange(index, 'area', e.target.value)}
                          className={`w-full px-2 py-1 text-xs text-slate-800 bg-slate-50/75 border rounded-lg focus:bg-white focus:ring-1 focus:outline-none ${
                            item.rolInstructor === 'Instructor Transversal' && !item.area 
                              ? 'border-red-300 ring-1 ring-red-100 focus:ring-red-500 focus:border-red-500' 
                              : 'border-slate-200 focus:ring-emerald-500 focus:border-emerald-500'
                          }`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center gap-3 justify-end pt-2">
              <button
                onClick={() => setParsedRows([])}
                className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold px-4 py-2.5 rounded-lg text-xs cursor-pointer transition-colors"
              >
                Cancelar carga
              </button>
              <button
                onClick={triggerDatabaseSincronizacion}
                disabled={loading}
                className="bg-[#39A900] hover:bg-[#2e8a00] text-white font-extrabold px-6 py-2.5 rounded-lg text-xs flex items-center justify-center gap-2 shadow-sm cursor-pointer transition-colors"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Sincronizando con Cloud SQL...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    <span>Sincronizar {parsedRows.length} Ficha(s) en Base de Datos</span>
                  </>
                )}
              </button>
            </div>

          </div>
          )}
        </div>
      )}

      {activeTab === 'aprendices_masivo' && (
        /* APRENDICES MASIVO TAB VIEW */
        <div className="space-y-5 animate-fade-in" id="aprendices-masivo-panel-section">
          <div className="bg-emerald-50 border border-emerald-250 p-4 rounded-xl flex items-start gap-3 text-xs text-emerald-950 shadow-4xs">
            <GraduationCap className="w-5 h-5 text-[#39A900] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-extrabold font-sans">Cargar Reporte de Aprendices por Ficha en Lote:</span>
              <p className="text-slate-655 font-normal leading-relaxed">
                Suba uno o varios reportes de aprendices o listados oficiales de aprendices inscritos en formato Excel para cada ficha del sistema. El sistema de asignación y sincronización por lote detectará automáticamente los códigos de ficha y los registrará de forma secuencial sin modificaciones manuales.
              </p>
            </div>
          </div>

          <div
            onDragEnter={handleDragBatch}
            onDragOver={handleDragBatch}
            onDragLeave={handleDragBatch}
            onDrop={handleDropBatch}
            onClick={() => batchInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
              dragBatchActive 
                ? 'border-[#39A900] bg-[#39A900]/5 scale-[1.01]' 
                : 'border-slate-200 hover:border-slate-350 bg-slate-50/50'
            }`}
          >
            <input 
              ref={batchInputRef} 
              type="file" 
              multiple
              onChange={e => e.target.files && handleLearnersBatchFiles(e.target.files)} 
              accept=".xlsx,.xls" 
              className="hidden" 
            />
            <div className="max-w-md mx-auto space-y-3 flex flex-col items-center">
              <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center text-[#39A900] shadow-2xs">
                <UploadCloud className="w-6 h-6 animate-pulse" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-700">Arrastra tus reportes de aprendices aquí o haz clic para buscar</p>
                <p className="text-[10px] text-slate-400">Puedes seleccionar múltiples archivos Excel para procesar en lote.</p>
              </div>
            </div>
          </div>

          {batchSyncStatus && (
            <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl text-xs text-sky-850 font-semibold animate-fade-in" id="batch-sync-status-banner">
              ℹ️ {batchSyncStatus}
            </div>
          )}

          {batchFiles.length > 0 && (
            <div className="space-y-3.5 animate-fade-in" id="batch-files-list">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h4 className="text-xs font-extrabold text-slate-550 uppercase tracking-wide">
                  Cola de Procesamiento de Reportes de Aprendices ({batchFiles.length})
                </h4>
                <button
                  type="button"
                  onClick={() => { setBatchFiles([]); setBatchSyncStatus(null); }}
                  className="text-[10px] text-red-500 hover:underline font-extrabold cursor-pointer"
                >
                  Limpiar lista
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 max-h-[400px] overflow-y-auto p-1 custom-scrollbar">
                {batchFiles.map(bf => (
                  <div 
                    key={bf.id} 
                    className={`bg-white rounded-xl border p-4 space-y-3 shadow-3xs relative transition-all ${
                      bf.status === 'sincronizado' ? 'border-emerald-250 bg-emerald-50/5' :
                      bf.status === 'procesando' ? 'border-amber-250 bg-amber-50/10 animated-pulse' :
                      bf.status === 'error' ? 'border-red-250 bg-red-50/10' : 'border-slate-205'
                    }`}
                  >
                    {/* Delete item button */}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeBatchFile(bf.id); }}
                      className="absolute top-3 right-3 text-slate-400 hover:text-red-550 transition-colors"
                      title="Remover de la cola"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>

                    <div className="space-y-1 pr-6">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[14px] select-none">📊</span>
                        <p className="text-xs font-extrabold text-slate-750 truncate max-w-[170px]" title={bf.fileName}>
                          {bf.fileName}
                        </p>
                      </div>

                      {bf.detectedLearnersCount > 0 && (
                        <div className="flex items-center gap-1 text-[10px] text-emerald-800 font-extrabold bg-emerald-50 w-fit px-2 py-0.5 rounded border border-emerald-110">
                          <Check className="w-3 h-3 text-[#39A900] font-black" />
                          <span>{bf.detectedLearnersCount} aprendices detectados</span>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[10.5px] border-t border-slate-100 pt-3">
                      {/* Ficha code field */}
                      <div>
                        <label className="block text-slate-450 font-bold mb-0.5 uppercase tracking-wide text-[9px]">
                          Código de Ficha:
                        </label>
                        <input 
                          type="text" 
                          value={bf.fichaCodigo} 
                          onChange={e => handleBatchItemChange(bf.id, 'fichaCodigo', e.target.value)}
                          className="w-full text-xs font-mono font-extrabold px-2 py-1 bg-slate-50 border border-slate-200 rounded focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-800"
                          placeholder="Ficha..."
                        />
                      </div>

                      {/* Nivel field */}
                      <div>
                        <label className="block text-slate-450 font-bold mb-0.5 uppercase tracking-wide text-[9px]">
                          Nivel Académico:
                        </label>
                        <select
                          value={bf.nivel}
                          onChange={e => handleBatchItemChange(bf.id, 'nivel', e.target.value as any)}
                          className="w-full text-xs px-1.5 py-1 bg-slate-50 border border-slate-200 rounded focus:bg-white focus:outline-none text-slate-700"
                        >
                          <option value="Tecnólogo">Tecnólogo</option>
                          <option value="Técnico">Técnico</option>
                        </select>
                      </div>

                      {/* Programa name field */}
                      <div className="col-span-2">
                        <label className="block text-slate-450 font-bold mb-0.5 uppercase tracking-wide text-[9px]">
                          Programa de Formación:
                        </label>
                        <input 
                          type="text" 
                          value={bf.programaFormacion} 
                          onChange={e => handleBatchItemChange(bf.id, 'programaFormacion', e.target.value)}
                          className="w-full text-xs px-2 py-1 bg-slate-50 border border-slate-200 rounded focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-850"
                          placeholder="Programa de Formación..."
                        />
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div className="flex items-center justify-between pt-1 text-[10.5px]">
                      <div className="flex items-center gap-1.5">
                        {bf.status === 'pendiente' && (
                          <span className="flex items-center gap-1 text-slate-550 font-bold bg-slate-100 px-2 py-0.5 rounded border border-slate-200 shadow-4xs">
                            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full"></span>
                            Pendiente
                          </span>
                        )}
                        {bf.status === 'procesando' && (
                          <span className="flex items-center gap-1 text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-150 shadow-4xs">
                            <Loader2 className="w-3 h-3 text-amber-550 animate-spin" />
                            Procesando...
                          </span>
                        )}
                        {bf.status === 'sincronizado' && (
                          <span className="flex items-center gap-1 text-emerald-800 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 shadow-4xs">
                            <Check className="w-3.5 h-3.5 text-[#39A900] font-black" />
                            Guardado
                          </span>
                        )}
                        {bf.status === 'error' && (
                          <span 
                            className="flex items-center gap-1 text-red-650 font-bold bg-red-50 px-2 py-0.5 rounded border border-red-150 shadow-4xs cursor-help"
                            title={bf.errorMsg}
                          >
                            ⚠️ Error
                          </span>
                        )}
                      </div>

                      {bf.errorMsg && (
                        <p className="text-red-500 text-[9.5px] truncate max-w-[110px] font-semibold" title={bf.errorMsg}>
                          {bf.errorMsg}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => startBatchSincronizacion()}
                  disabled={isProcessingBatch}
                  className="bg-[#39A900] hover:bg-[#2e8a00] text-white font-extrabold text-xs px-6 py-3 rounded-lg flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
                >
                  {isProcessingBatch ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Sincronizando {batchFiles.filter(f => f.status === 'pendiente' || f.status === 'error' || f.status === 'procesando').length} reportes...</span>
                    </>
                  ) : (
                    <>
                      <FolderUp className="w-4 h-4 text-white" />
                      <span>Iniciar Sincronización Masiva ({batchFiles.filter(f => f.status === 'pendiente' || f.status === 'error').length} Pendientes)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* DETAILED RESULTS SUMMARY LEDGER FOR APPRENTICES LOAD */}
          {batchSyncSummary && batchSyncSummary.length > 0 && (
            <div className="border border-slate-200 rounded-xl p-5 bg-slate-50/50 space-y-4 animate-fade-in" id="batch-learners-summary-ledger">
              <div className="flex items-center justify-between border-b border-slate-150 pb-2">
                <div className="flex items-center gap-2">
                  <span className="p-1 bg-[#39A900]/10 text-[#39A900] rounded-lg">
                    <FileCheck className="w-4 h-4" />
                  </span>
                  <div>
                    <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wide">
                      Resumen Analítico de la Carga de Aprendices
                    </h4>
                    <p className="text-[10px] text-slate-500">Métricas acumuladas del lote de archivos procesados incrementalmente</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setBatchSyncSummary(null)}
                  className="text-[10px] font-bold text-slate-400 hover:text-slate-600 hover:underline"
                >
                  Limpiar Resumen
                </button>
              </div>

              <div className="space-y-4">
                {batchSyncSummary.map((sum, index) => {
                  const hasFewLearners = sum.status === 'success' && sum.validCount <= 3 && sum.totalRows > 10;
                  const totalSync = sum.nuevos + sum.actualizados + sum.conservados + sum.reactivados;
                  const ignoredRows = Math.max(0, sum.totalRows - sum.validCount);

                  return (
                    <div 
                      key={index}
                      className={`bg-white rounded-xl border p-4 space-y-3.5 shadow-3xs hover:shadow-2xs transition-all ${
                        sum.status === 'success' ? 'border-slate-200' : 'border-rose-200 bg-rose-50/10'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="space-y-0.5">
                          <span className="text-[10px] uppercase font-black tracking-wider text-slate-400">Reporte de Aprendices Procesado</span>
                          <h5 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 flex-wrap">
                            <span className="truncate max-w-xs">{sum.fileName}</span>
                            <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[10px] font-mono font-bold border border-slate-200">
                              Ficha {sum.fichaCodigo}
                            </span>
                          </h5>
                        </div>

                        {sum.status === 'success' ? (
                          <span className="sm:self-center inline-flex items-center gap-1 text-[10px] font-extrabold bg-emerald-50 text-emerald-800 border border-emerald-150 px-2 py-0.5 rounded-lg">
                            Sincronización Exitosa
                          </span>
                        ) : (
                          <span className="sm:self-center inline-flex items-center gap-1 text-[10px] font-extrabold bg-rose-50 text-rose-800 border border-rose-150 px-2 py-0.5 rounded-lg">
                            Error en Archivo
                          </span>
                        )}
                      </div>

                      {sum.status === 'success' ? (
                        <>
                          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                            <div className="p-2.5 bg-slate-50 border border-slate-150 rounded-lg text-center">
                              <span className="block text-[9px] text-slate-400 font-extrabold uppercase">Filas Leídas</span>
                              <strong className="text-sm text-slate-700 font-extrabold">{sum.totalRows}</strong>
                            </div>

                            <div className="p-2.5 bg-emerald-50/30 border border-emerald-100 rounded-lg text-center">
                              <span className="block text-[9px] text-emerald-700 font-extrabold uppercase" title="Aprendices válidos extraídos">Válidos</span>
                              <strong className="text-sm text-emerald-800 font-extrabold">{sum.validCount}</strong>
                            </div>

                            <div className="p-2.5 bg-blue-50/40 border border-blue-100 rounded-lg text-center">
                              <span className="block text-[9px] text-blue-700 font-extrabold uppercase" title="Nuevos alumnos creados en Postgres">Nuevos</span>
                              <strong className="text-sm text-blue-800 font-extrabold">{sum.nuevos}</strong>
                            </div>

                            <div className="p-2.5 bg-amber-50/40 border border-amber-100 rounded-lg text-center">
                              <span className="block text-[9px] text-amber-700 font-extrabold uppercase" title="Datos básicos actualizados">Actualizados</span>
                              <strong className="text-sm text-amber-800 font-extrabold">{sum.actualizados}</strong>
                            </div>

                            <div className="p-2.5 bg-purple-50/40 border border-purple-100 rounded-lg text-center">
                              <span className="block text-[9px] text-purple-700 font-extrabold uppercase" title="Alumnos reactivados tras inactividad">Reactivados</span>
                              <strong className="text-sm text-purple-800 font-extrabold">{sum.reactivados}</strong>
                            </div>

                            <div className="p-2.5 bg-rose-50/30 border border-rose-100 rounded-lg text-center">
                              <span className="block text-[9px] text-rose-705 font-extrabold uppercase" title="Marcados como inactivos (No presentes hoy)">Inactivados</span>
                              <strong className="text-sm text-rose-800 font-extrabold">{sum.inactivados}</strong>
                            </div>

                            <div className="p-2.5 bg-slate-50 border border-slate-155 rounded-lg text-center">
                              <span className="block text-[9px] text-slate-400 font-extrabold uppercase" title="Filas de logo, títulos o en blanco">Filas Ignoradas</span>
                              <strong className="text-sm text-slate-600 font-extrabold">{ignoredRows}</strong>
                            </div>
                          </div>

                          <div className="text-[10px] text-slate-500 flex items-center justify-between border-t border-slate-100 pt-2 font-medium">
                            <span>Sincronizados en base de datos: <strong>{totalSync}</strong> aprendices</span>
                            <span>Filas sin aprendices válidos: <strong>{ignoredRows}</strong> ignoradas de forma controlada</span>
                          </div>

                          {sum.postgresVerification && (
                            <div className="bg-emerald-50 border border-emerald-150 rounded-lg p-2 text-[10px] text-emerald-900 font-semibold">
                              Persistencia verificada en {sum.persistedIn || 'PostgreSQL/Neon'}:
                              {' '}fichas <strong>{sum.postgresVerification.fichas}</strong>,
                              {' '}aprendices <strong>{sum.postgresVerification.aprendices_fichas}</strong>,
                              {' '}seguimientos <strong>{sum.postgresVerification.seguimientos_historico}</strong>.
                            </div>
                          )}

                          {/* WARNING IF DETECTED VERY FEW ALUMNI */}
                          {hasFewLearners && (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2 text-[10px] text-amber-900 mt-2">
                              <AlertTriangle className="w-4 h-4 text-amber-750 shrink-0 mt-0.5" />
                              <div className="space-y-0.5">
                                <span className="font-extrabold">⚠️ Alerta de Baja Detección de Aprendices:</span>
                                <p className="text-slate-655 leading-relaxed font-normal">
                                  Se han detectado únicamente {sum.validCount} aprendices de {sum.totalRows} filas totales en el archivo. Por favor, verifique si este archivo es efectivamente el reporte de aprendices por ficha o si ha seleccionado una pestaña o un reporte alternativo. El parser requiere columnas claras del listado (como Documento y Nombre).
                                </p>
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 flex items-start gap-2 text-[11px] text-rose-900">
                          <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
                          <div className="space-y-0.5">
                            <span className="font-extrabold">Fallo en Procesamiento:</span>
                            <p className="text-slate-655 font-normal leading-relaxed">
                              {sum.errorMsg || 'La estructura de cabeceras de este archivo no contiene las columnas necesarias para asociar aprendices a la ficha.'}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* SECCIÓN COMPLEMENTARIA: Directorio de Instructores y Credenciales de Acceso */}
      <div className="border-t border-slate-100 pt-6 mt-6 space-y-4">
        {/* Toggleable Header Container */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-3xs hover:shadow-2xs transition-all">
          <div 
            className="space-y-0.5 cursor-pointer select-none flex-1" 
            onClick={() => setIsInstructorsExpanded(!isInstructorsExpanded)}
          >
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-[#39A900]" />
                Directorio de Instructores y Credenciales de Acceso
              </h3>
              <span className="bg-slate-105 text-slate-600 text-[10px] font-black px-2 py-0.5 rounded-full border border-slate-200">
                {instructorsList.length} Registrados
              </span>
            </div>
            <p className="text-[10.5px] text-slate-500 leading-relaxed">
              Supervise las contraseñas cargadas en PostgreSQL desde la coordinación académica, filtre asignaciones y asigne claves personalizadas.
            </p>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={loadInstructors}
              title="Sincronizar base de datos"
              className="text-[10.5px] font-extrabold border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 px-3 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer flex-1 sm:flex-none shadow-4xs"
            >
              <RefreshCw className="w-3.5 h-3.5 text-[#39A900]" />
              <span>Actualizar</span>
            </button>
            <button
              onClick={() => setIsInstructorsExpanded(!isInstructorsExpanded)}
              className="text-[10.5px] font-bold border border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-705 px-3 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer flex-1 sm:flex-none shadow-4xs"
            >
              {isInstructorsExpanded ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5 text-slate-505" />
                  <span>Contraer</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-505" />
                  <span>Ver listado</span>
                </>
              )}
            </button>
          </div>
        </div>

        {isInstructorsExpanded && (
          <div className="space-y-4 animate-fade-in">
            {/* Search, Filter & Page size selector controls */}
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white p-3 rounded-lg border border-slate-200 shadow-5xs">
              {/* Search Box */}
              <div className="relative flex-1">
                <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                  <Search className="w-3.5 h-3.5 text-slate-400" />
                </span>
                <input
                  type="text"
                  placeholder="Buscar por nombre de instructor, correo sena o rol..."
                  value={instructorSearchQuery}
                  onChange={e => {
                    setInstructorSearchQuery(e.target.value);
                    setCurrentPage(1); // Reset pagination on search trigger
                  }}
                  className="w-full text-xs font-semibold pl-9 pr-6 py-2 border border-slate-200 rounded-lg focus:border-emerald-500 focus:outline-none bg-slate-50/50 hover:bg-white text-slate-800 transition-all placeholder:text-slate-400"
                />
                {instructorSearchQuery && (
                  <button
                    onClick={() => {
                      setInstructorSearchQuery('');
                      setCurrentPage(1);
                    }}
                    className="absolute right-2 px-1.5 py-1 text-[9.5px] bg-slate-100 font-bold hover:bg-slate-200 text-slate-500 rounded cursor-pointer top-1/2 -translate-y-1/2"
                  >
                    Limpiar
                  </button>
                )}
              </div>

              {/* Group selection: 10 or 20 items per page */}
              <div className="flex items-center gap-2 justify-end text-xs font-bold text-slate-600">
                <span className="text-[10.5px] text-slate-500 font-medium">Ver en grupos de:</span>
                <select
                  value={pageSize}
                  onChange={e => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-white border border-slate-200 text-slate-700 px-2.5 py-1.5 rounded-lg focus:border-[#39A900] font-black text-xs cursor-pointer focus:outline-none"
                >
                  <option value={10}>10 Instructores</option>
                  <option value={20}>20 Instructores</option>
                </select>
              </div>
            </div>

            {/* Helper evaluation for Filter & Pagination */}
            {(() => {
              // Cross reference function
              const getAssignedFichasForInstructor = (email: string, name: string) => {
                if (!savedFichas || !Array.isArray(savedFichas)) return [];
                const searchEmail = (email || '').trim().toLowerCase();
                const searchName = (name || '').trim().toLowerCase();

                return savedFichas.filter(ficha => {
                  // Direct check in assignments list
                  if (ficha.assignments && Array.isArray(ficha.assignments)) {
                    return ficha.assignments.some((a: any) => 
                      (a.correo || '').trim().toLowerCase() === searchEmail
                    );
                  }
                  // Textual fallback matching
                  if (ficha.instructor) {
                    const instStr = ficha.instructor.toLowerCase();
                    return instStr.includes(searchEmail) || instStr.includes(searchName);
                  }
                  return false;
                });
              };

              const filtered = instructorsList.filter(ins => {
                const q = instructorSearchQuery.toLowerCase().trim();
                if (!q) return true;
                return (
                  (ins.nombre || '').toLowerCase().includes(q) ||
                  (ins.correo || '').toLowerCase().includes(q) ||
                  (ins.rol || '').toLowerCase().includes(q)
                );
              });

              if (filtered.length === 0) {
                return (
                  <div className="p-8 text-center border border-dashed border-slate-200 rounded-xl bg-white space-y-2">
                    <p className="text-xs text-slate-400 italic">No se encontraron instructores que coincidan con la búsqueda.</p>
                  </div>
                );
              }

              const totalCount = filtered.length;
              const totalPages = Math.ceil(totalCount / pageSize) || 1;
              const displayPage = Math.min(currentPage, totalPages);
              const startIndex = (displayPage - 1) * pageSize;
              const paginatedList = filtered.slice(startIndex, startIndex + pageSize);

              return (
                <div className="space-y-4">
                  {/* Table Element */}
                  <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-6xs">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-black text-[9.5px] uppercase tracking-wider">
                          <th className="px-4 py-3">Nombre / Rol</th>
                          <th className="px-4 py-3">Correo Institucional</th>
                          <th className="px-4 py-3 min-w-[240px]">Fichas de Formación Asignadas</th>
                          <th className="px-4 py-3">Contraseña DB</th>
                          <th className="px-4 py-3 text-center">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-[11px]">
                        {paginatedList.map(ins => {
                          const isEditing = editingPassRow === ins.id;
                          const assignedFichas = getAssignedFichasForInstructor(ins.correo, ins.nombre);

                          return (
                            <tr key={ins.id} className="hover:bg-slate-50/50 transition-colors">
                              {/* Name & Role */}
                              <td className="px-4 py-3">
                                {isEditing ? (
                                  <div className="space-y-1.5 max-w-[220px]">
                                    <input
                                      type="text"
                                      required
                                      placeholder="Nombre completo"
                                      value={newNameInput}
                                      onChange={e => setNewNameInput(e.target.value)}
                                      className="w-full text-[11px] font-extrabold px-2 py-1 border border-slate-300 rounded focus:border-emerald-500 focus:outline-none bg-white text-slate-800 shadow-4xs font-sans"
                                    />
                                    <select
                                      value={newRolInput}
                                      onChange={e => setNewRolInput(e.target.value)}
                                      className="w-full text-[10px] font-bold px-1.5 py-1 border border-slate-300 rounded focus:border-emerald-500 focus:outline-none bg-white text-slate-800 shadow-4xs font-sans"
                                    >
                                      <option value="Coordinación">Coordinación</option>
                                      <option value="Administrativo">Administrativo</option>
                                      <option value="Instructor Líder">Instructor Líder</option>
                                      <option value="Instructor Transversal">Instructor Transversal</option>
                                    </select>
                                  </div>
                                ) : (
                                  <>
                                    <div className="font-extrabold text-slate-800 text-[11.5px]" title={ins.nombre}>
                                      {formatInstructorNombre(ins.nombre, ins.correo)}
                                    </div>
                                    <div className="text-[9px] text-slate-450 font-bold uppercase mt-0.5 inline-block bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-sm">
                                      {ins.rol}
                                    </div>
                                  </>
                                )}
                              </td>

                              {/* Email Address */}
                              <td className="px-4 py-3 text-slate-605 font-mono text-xs">
                                {ins.correo}
                              </td>

                              {/* Assigned Fichas with clean link-button layouts */}
                              <td className="px-4 py-3">
                                {assignedFichas.length === 0 ? (
                                  <div className="text-[10px] text-slate-400 italic font-medium flex items-center gap-1">
                                    <span>⚠️</span>
                                    <span>Sin fichas vinculadas</span>
                                  </div>
                                ) : (
                                  <div className="flex flex-col gap-1 md:gap-1.5 max-w-[450px]">
                                    {assignedFichas.map(f => (
                                      <button 
                                        key={f.id} 
                                        type="button"
                                        onClick={() => onSelectFicha && onSelectFicha(f.codigoFicha)}
                                        className="text-left font-bold text-[#007832] hover:text-[#39A900] hover:underline flex items-center gap-1.5 group cursor-pointer transition-colors focus:no-underline focus:outline-none"
                                        title={`Ver detalles de Ficha ${f.codigoFicha} - ${f.programaFormacion}`}
                                      >
                                        <span className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-mono text-[9.5px] font-black px-1.5 py-0.5 rounded border border-emerald-200 transition-colors shrink-0">
                                          {f.codigoFicha}
                                        </span>
                                        <span className="text-[10.5px] truncate text-slate-600 group-hover:text-emerald-800 font-semibold underline-offset-2">
                                          {f.programaFormacion} <span className="text-[9px] text-slate-405 font-bold uppercase">({f.nivel})</span>
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </td>

                              {/* DB Passwords */}
                              <td className="px-4 py-3">
                                {isEditing ? (
                                  <div className="relative max-w-[140px]">
                                    <input
                                      type="text"
                                      required
                                      value={newPassInput}
                                      onChange={e => setNewPassInput(e.target.value)}
                                      placeholder="Contraseña..."
                                      className="w-full text-[11px] font-extrabold px-2 py-1 pr-6 border border-slate-300 rounded focus:border-emerald-500 focus:outline-none bg-white text-slate-800 shadow-4xs"
                                    />
                                    <span className="absolute right-1.5 top-1.5 text-[9.5px] text-slate-400 select-none">🔑</span>
                                  </div>
                                ) : (
                                  <span className="font-mono text-[11px] font-bold bg-slate-100 px-2 py-0.5 rounded text-slate-500 border border-slate-150">
                                    ••••••••
                                  </span>
                                )}
                              </td>

                              {/* Coordination Actions */}
                              <td className="px-4 py-3 text-center align-middle">
                                {isEditing ? (
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      onClick={() => handleSavePassword(ins.correo)}
                                      disabled={isSavingPass}
                                      className="bg-[#39A900] hover:bg-[#2d8300] text-white text-[9.5px] font-bold px-2 py-1 rounded transition-colors cursor-pointer shadow-4xs select-none"
                                    >
                                      Guardar
                                    </button>
                                    <button
                                      onClick={() => { setEditingPassRow(null); setNewPassInput(''); }}
                                      className="bg-slate-150 hover:bg-slate-205 text-slate-650 text-[9.5px] font-bold px-2 py-1 rounded transition-colors cursor-pointer select-none"
                                    >
                                      Omitir
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex flex-col gap-1.5 items-center justify-center mx-auto max-w-[125px]">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingPassRow(ins.id);
                                        setNewPassInput(ins.contrasena || 'sena123');
                                        setNewNameInput(formatInstructorNombre(ins.nombre, ins.correo));
                                        setNewRolInput(ins.rol || 'Instructor Transversal');
                                      }}
                                      className="w-full bg-white hover:bg-slate-50 border border-slate-200 text-slate-650 hover:text-slate-850 text-[10px] font-semibold px-2 py-1 rounded-md transition-all cursor-pointer flex items-center justify-center gap-1 shadow-4xs"
                                    >
                                      <span>✏️ Editar Perfil</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleRequestDeleteInstructor(ins)}
                                      className="w-full bg-white hover:bg-rose-50 border border-rose-250 hover:border-rose-300 text-rose-650 hover:text-rose-755 text-[10px] font-semibold px-2 py-1 rounded-md transition-all cursor-pointer flex items-center justify-center gap-1 shadow-4xs"
                                    >
                                      <Trash2 className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                                      <span>Eliminar</span>
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination Actions Bar */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200 font-semibold text-[11px] text-slate-550">
                    <div>
                      Mostrando <span className="text-slate-800 font-extrabold">{Math.min(startIndex + 1, totalCount)}</span> a <span className="text-slate-800 font-extrabold">{Math.min(startIndex + pageSize, totalCount)}</span> de <span className="text-slate-800 font-extrabold">{totalCount}</span> instructores
                      {instructorSearchQuery && <span className="text-[#39A900] ml-1">(filtrado de {instructorsList.length})</span>}
                    </div>
                    
                    <div className="flex items-center gap-1.5 select-none">
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={displayPage === 1}
                        className={`p-1 px-2.5 rounded border border-slate-200 font-bold bg-white text-slate-600 transition-colors flex items-center gap-1 ${displayPage === 1 ? 'opacity-40 cursor-not-allowed bg-slate-100' : 'hover:bg-slate-50 cursor-pointer'}`}
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        <span>Previo</span>
                      </button>

                      <div className="px-3 py-1 bg-white border border-slate-200 rounded text-slate-800 font-extrabold">
                        Pág. {displayPage} de {totalPages}
                      </div>

                      <button
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                        disabled={displayPage === totalPages}
                        className={`p-1 px-2.5 rounded border border-slate-200 font-bold bg-white text-slate-600 transition-colors flex items-center gap-1 ${displayPage === totalPages ? 'opacity-40 cursor-not-allowed bg-slate-100' : 'hover:bg-slate-50 cursor-pointer'}`}
                      >
                        <span>Siguiente</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Dynamic Deletion & Reassignment Modal Dialog */}
      {isDeleteModalOpen && deletePrepData && deleteTargetInstructor && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="bg-rose-50 border-b border-rose-100 p-5 flex items-start justify-between shrink-0">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-rose-100 rounded-xl text-rose-700 mt-0.5">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-extrabold text-slate-900">Retirar o Desvincular Instructor del Directorio</h4>
                  <p className="text-[11px] text-slate-550 mt-1">
                    Instructor: <strong className="text-rose-900">{formatInstructorNombre(deleteTargetInstructor.nombre, deleteTargetInstructor.correo)}</strong> • ({deleteTargetInstructor.correo})
                  </p>
                </div>
              </div>
              <button 
                onClick={() => { setIsDeleteModalOpen(false); }}
                className="text-slate-400 hover:text-slate-650 font-bold text-xs select-none cursor-pointer"
              >
                ✕ Cerrar
              </button>
            </div>

            {/* Content Body */}
            <div className="p-6 space-y-5 overflow-y-auto max-h-[60vh] custom-scrollbar">
              
              {/* Context Summary / Inactivation status explanation */}
              {deletePrepData.countSeguimientos > 0 ? (
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl space-y-2 text-amber-905 text-xs leading-normal">
                  <div className="flex items-center gap-1.5 font-bold">
                    <span className="text-sm font-emoji">📌</span>
                    <span>Trazabilidad Histórica Conservada (Soft-Delete)</span>
                  </div>
                  <p className="text-slate-655">
                    Se dectectaron <strong className="text-amber-950">{deletePrepData.countSeguimientos} registros de seguimiento</strong> vinculados a este instructor. Por normas institucionales y para conservar la trazabilidad histórica de firmas, <strong>no se borrará físicamente el instructor</strong>. En su lugar, al confirmar, se cambiará su estado a <span className="bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded font-bold uppercase text-amber-800 text-[10px]">Inactivo</span>. Esto de manera inmediata impedirá que inicie sesión o que reciba nuevas cargas o asignaciones.
                  </p>
                </div>
              ) : (
                <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl space-y-2 text-emerald-950 text-xs leading-normal">
                  <div className="flex items-center gap-1.5 font-bold">
                    <span className="text-sm font-emoji">✅</span>
                    <span>Eliminación Física Permisible</span>
                  </div>
                  <p className="text-slate-655">
                    Este instructor no cuenta con historial de seguimientos académicos en el sistema sena. Se procederá a realizar una <strong>eliminación total y física</strong> de su registro una vez reasignadas o canceladas sus fichas vigentes.
                  </p>
                </div>
              )}

              {/* Assignments / Fichas Associated */}
              {deletePrepData.hasAssignments ? (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <span className="text-xs font-black text-slate-800 uppercase tracking-wide">Fichas Activas Vinculadas ({deletePrepData.assignments.length})</span>
                    <p className="text-[10.5px] text-slate-450 leading-relaxed">
                      El instructor posee fichas asignadas. Antes de proceder, debe reasignar la titularidad para evitar dejar fichas huérfanas:
                    </p>
                  </div>

                  <div className="space-y-3.5 border border-slate-150 rounded-xl p-4 bg-slate-50/70">
                    {deletePrepData.assignments.map((link: any) => {
                      const key = `${link.fichaId}_${link.rolEnFicha}_${link.area || 'General'}`;
                      const chosenVal = deleteReassignments[key] || '';
                      const isLider = link.rolEnFicha === 'Instructor Líder';

                      return (
                        <div key={key} className="bg-white border border-slate-200 rounded-lg p-3.5 space-y-3 flex flex-col md:flex-row md:items-center md:justify-between md:gap-4 shadow-5xs text-xs">
                          {/* Ficha info */}
                          <div className="space-y-1 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-[10px] font-black bg-slate-100 rounded border border-slate-200 px-1.5 py-0.5 text-slate-600">
                                COD: {link.codigoFicha}
                              </span>
                              <span className={`text-[9.5px] font-black uppercase rounded-sm px-1.5 py-0.5 border ${
                                isLider ? 'bg-amber-50 border border-amber-200 text-amber-800' : 'bg-blue-50 border border-blue-200 text-blue-800'
                              }`}>
                                {link.rolEnFicha} {link.rolEnFicha === 'Instructor Transversal' ? ` • ${link.area || 'General'}` : ''}
                              </span>
                            </div>
                            <h5 className="text-[11px] font-extrabold text-slate-700 line-clamp-1">{link.programaFormacion}</h5>
                          </div>

                          {/* Reassignment Dropdown selector */}
                          <div className="max-w-xs w-full space-y-1">
                            <span className="block text-[9px] text-slate-400 font-bold uppercase tracking-wider">{isLider ? 'Nuevo Instructor Líder (Obligatorio)' : 'Acción / Reasignación Transversal'}</span>
                            <select
                              value={chosenVal || ''}
                              required={isLider}
                              onChange={e => {
                                const val = e.target.value ? parseInt(e.target.value) : null;
                                setDeleteReassignments(prev => ({ ...prev, [key]: val }));
                              }}
                              className={`w-full font-semibold text-xs border rounded-lg px-2.5 py-1.5 focus:outline-none bg-white ${
                                isLider && !chosenVal
                                  ? 'border-red-300 bg-red-50/20 text-red-750 focus:ring-1 focus:ring-red-400'
                                  : 'border-slate-250 text-slate-755 focus:ring-1 focus:ring-emerald-500'
                              }`}
                            >
                              {/* Option for leader */}
                              {isLider ? (
                                <option value="">-- Seleccionar Nuevo Líder --</option>
                              ) : (
                                <option value="">Desvincular (Ficha queda con alerta o sin transversal en área)</option>
                              )}
                              
                              {/* Filter candidates to exclude deleted instructor */}
                              {deletePrepData.candidates && deletePrepData.candidates.map((c: any) => (
                                <option key={c.id} value={c.id}>
                                  {c.nombre} ({c.rol})
                                </option>
                              ))}
                            </select>
                            
                            {isLider && !chosenVal && (
                              <span className="text-[9px] text-red-550 font-bold block mt-0.5">⚠️ Reasignación de Líder requerida</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 p-4 bg-slate-50 border border-slate-150 rounded-xl text-xs text-slate-500 font-medium leading-normal">
                  <span className="text-sm font-emoji">🎉</span>
                  <span>Este instructor no tiene ninguna ficha de formación asignada actualmente. La operación se procesará de forma directa sin requerir reasociar cargos.</span>
                </div>
              )}

              {/* Note about unassigned transversals */}
              {deletePrepData.hasAssignments && deletePrepData.assignments.some((l: any) => l.rolEnFicha !== 'Instructor Líder') && (
                <div className="text-[10.5px] text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-150 leading-relaxed">
                  💡 <strong>Nota sobre Transversales:</strong> Si decide desvincular un área transversal sin reasignar la ficha a otro docente activo, el catálogo de control académico guardará una observación del área para alertar que falta su asignación.
                </div>
              )}

            </div>

            {/* Footer buttons */}
            <div className="bg-slate-50 border-t border-slate-150 p-5 flex items-center justify-end gap-3 shrink-0">
              <button
                onClick={() => { setIsDeleteModalOpen(false); }}
                disabled={isDeletingInProgress}
                className="bg-white hover:bg-slate-105 border border-slate-200 text-slate-600 font-black text-xs px-4 py-2.5 rounded-xl cursor-pointer transition-colors"
                type="button"
              >
                Regresar
              </button>
              <button
                onClick={handleConfirmDeleteInstructor}
                disabled={isDeletingInProgress || (deletePrepData.hasAssignments && deletePrepData.assignments.some((link: any) => link.rolEnFicha === 'Instructor Líder' && !deleteReassignments[`${link.fichaId}_${link.rolEnFicha}_${link.area || 'General'}`]))}
                className="bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-extrabold text-xs px-6 py-2.5 rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                type="button"
              >
                {isDeletingInProgress ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Procesando...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5 text-white" />
                    <span>Confirmar Retiro</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'alertas_criticas' && (
        <AlertasCriticasSection authToken={authToken} />
      )}

    </div>
  );
}

function AlertasCriticasSection({ authToken }: { authToken: string }) {
  const [alertas, setAlertas] = useState<any[]>([]);
  const [remisiones, setRemisiones] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');

  // Management modal state
  const [selectedAlerta, setSelectedAlerta] = useState<any | null>(null);
  const [nuevoEstado, setNuevoEstado] = useState<string>('');
  const [observacion, setObservacion] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [selectedRemision, setSelectedRemision] = useState<any | null>(null);
  const [bienestarEstado, setBienestarEstado] = useState('En seguimiento por Bienestar');
  const [bienestarMedio, setBienestarMedio] = useState('Llamada al aprendiz');
  const [bienestarObservacion, setBienestarObservacion] = useState('');
  const [savingBienestar, setSavingBienestar] = useState(false);

  const getRemisionStatus = (remision: any): string => {
    const raw = String(remision?.estadoRemision || '').trim();
    const lower = raw.toLowerCase();
    if (!raw || lower.includes('pendiente') || lower.includes('sin intervención') || lower.includes('sin intervencion') || lower.includes('no atend')) {
      return 'Pendiente de atención por Bienestar';
    }
    if (lower.includes('atendido') || lower.includes('cerrado') || lower.includes('finalizado')) {
      return 'Atendido por Bienestar';
    }
    if (lower.includes('fallido')) {
      return 'Contacto fallido';
    }
    return 'En seguimiento por Bienestar';
  };

  const getRemisionPriority = (status: string): number => {
    const lower = status.toLowerCase();
    if (lower.includes('pendiente') || lower.includes('sin intervención') || lower.includes('sin intervencion') || lower.includes('no atend')) return 0;
    if (lower.includes('seguimiento') || lower.includes('proceso') || lower.includes('intervención') || lower.includes('intervencion')) return 1;
    return 2;
  };

  const getRemisionTime = (remision: any): number => {
    const value = remision?.fechaRemision || remision?.fechaRegistro || remision?.fecha || remision?.createdAt;
    const time = value ? new Date(value).getTime() : 0;
    return Number.isFinite(time) ? time : 0;
  };

  const getAreaResponsable = (item: any): string => {
    const text = [
      item?.areaResponsable,
      item?.origenRegistro,
      item?.creadoPorRol,
      item?.usuarioResponsableRol,
      item?.tipoSeguimiento,
      item?.medioComunicacion
    ].join(' ').toLowerCase();
    if (text.includes('bienestar') || text.includes('administrativo') || text.includes('admin')) return 'Bienestar/Admin';
    if (text.includes('remisión a bienestar') || text.includes('remision a bienestar')) return 'Instructor que remite';
    if (text.includes('instructor') || text.includes('llamado') || text.includes('correo de llamado')) return 'Instructor';
    return 'Usuario del sistema';
  };

  const getStatusBadgeClass = (status: string): string => {
    const lower = status.toLowerCase();
    if (lower.includes('pendiente') || lower.includes('sin intervención') || lower.includes('sin intervencion')) {
      return 'bg-rose-50 text-rose-800 border-rose-200';
    }
    if (lower.includes('atendido') || lower.includes('cerrado') || lower.includes('finalizado')) {
      return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    }
    if (lower.includes('fallido')) {
      return 'bg-amber-50 text-amber-800 border-amber-200';
    }
    return 'bg-purple-50 text-purple-800 border-purple-200';
  };

  const getFreshToken = async (): Promise<string> => {
    try {
      if (auth && auth.currentUser) {
        const fresh = await auth.currentUser.getIdToken();
        if (fresh) return fresh;
      }
    } catch (e) {
      console.warn('Could not refresh Firebase token directly in AlertasCriticasSection:', e);
    }
    return authToken;
  };

  const fetchAlertas = async () => {
    setLoading(true);
    setError(null);
    try {
      const activeToken = await getFreshToken();
      const res = await fetch('/api/administrativo/alertas-criticas', {
        headers: {
          'Authorization': `Bearer ${activeToken}`
        }
      });
      if (!res.ok) {
        throw new Error('No se pudieron obtener las alertas críticas.');
      }
      const data = await res.json();
      const rawAlertas = Array.isArray(data) ? data : (data.alertas || []);
      setAlertas(rawAlertas.map((item: any) => ({
        ...item,
        nombre: item.nombre || item.aprendizNombre || 'Aprendiz',
        documento: item.documento || item.aprendizDocumento || '',
        correo: item.correo || item.aprendizCorreo || '',
        fichaId: item.fichaId || item.fichaCodigo || '',
        programaFormacion: item.programaFormacion || item.programaNombre || '',
        estadoAlerta: item.estadoAlerta || item.estado || 'Requiere intervención administrativa'
      })));

      const remisionesData = await fetchRemisionesBienestar(activeToken);
      setRemisiones(remisionesData.remisiones || []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error de conexión.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlertas();
  }, [authToken]);

  const handleOpenGestion = (al: any) => {
    setSelectedAlerta(al);
    setNuevoEstado(al.estadoAlerta || 'Requiere intervención administrativa');
    setObservacion(al.observacionAdministrativa || '');
  };

  const handleOpenRemision = (remision: any) => {
    setSelectedRemision(remision);
    setBienestarEstado(remision.estadoRemision === 'Atendido por Bienestar' ? 'Atendido por Bienestar' : 'En seguimiento por Bienestar');
    setBienestarMedio('Llamada al aprendiz');
    setBienestarObservacion('');
  };

  const handleGuardarIntervencionBienestar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRemision) return;
    if (savingBienestar) return;
    if (!bienestarObservacion.trim()) {
      alert('La observación de Bienestar es obligatoria.');
      return;
    }
    setSavingBienestar(true);

    try {
      const activeToken = await getFreshToken();
      await saveBienestarIntervencion(
        activeToken,
        Number(selectedRemision.aprendizFichaId),
        {
          medioComunicacion: bienestarMedio,
          asunto: `Intervención Bienestar - ${selectedRemision.aprendizNombre}`,
          observacion: bienestarObservacion.trim(),
          respuestaAprendiz: bienestarObservacion.trim(),
          acuerdosEstablecidos: bienestarEstado,
          estadoIntervencion: bienestarEstado,
          diasSinAcceso: selectedRemision.diasSinAcceso || 0,
          evidenciasPendientes: selectedRemision.evidenciasPendientes || 0,
          totalEvidencias: selectedRemision.totalEvidencias || 0,
          evidenciasAprobadas: selectedRemision.evidenciasAprobadas || 0,
          evidenciasDesaprobadas: selectedRemision.evidenciasDesaprobadas || 0,
          fechaUltimoIngreso: selectedRemision.fechaUltimoIngreso || null
        }
      );

      setSelectedRemision(null);
      setBienestarObservacion('');
      await fetchAlertas();
      alert('Intervención de Bienestar registrada correctamente.');
    } catch (err: any) {
      alert(err.message || 'No fue posible registrar la intervención de Bienestar.');
    } finally {
      setSavingBienestar(false);
    }
  };

  const handleGuardarGestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAlerta) return;
    setSaving(true);
    try {
      const activeToken = await getFreshToken();
      const res = await fetch(`/api/administrativo/alertas-criticas/${selectedAlerta.id}/estado`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${activeToken}`
        },
        body: JSON.stringify({
          estadoAlerta: nuevoEstado,
          observacion: observacion
        })
      });
      if (!res.ok) {
        throw new Error('Fallo al actualizar el estado de la alerta.');
      }
      const updated = await res.json();
      
      // Update local state
      setAlertas(prev => prev.map(a => a.id === selectedAlerta.id ? { 
        ...a, 
        estadoAlerta: updated.alerta.estadoAlerta, 
        observacionAdministrativa: updated.alerta.observacionAdministrativa,
        updatedAt: updated.alerta.updatedAt
      } : a));

      setSelectedAlerta(null);
      alert('¡Estado de la alerta crítica actualizado con éxito!');
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Error al guardar gestión.');
    } finally {
      setSaving(false);
    }
  };

  const filteredAlertas = alertas.filter(a => {
    const matchesSearch = 
      a.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.documento.includes(searchTerm) ||
      a.fichaId.includes(searchTerm) ||
      a.programaFormacion.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'todos' || a.estadoAlerta === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const filteredRemisiones = remisiones.filter((r) => {
    const derivedStatus = getRemisionStatus(r);
    const text = [
      r.aprendizNombre,
      r.aprendizDocumento,
      r.fichaCodigo,
      r.programaNombre,
      r.instructorNombre,
      derivedStatus
    ].join(' ').toLowerCase();
    const matchesSearch = text.includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'todos' || derivedStatus === statusFilter;
    return matchesSearch && matchesStatus;
  }).sort((a, b) => {
    const statusA = getRemisionStatus(a);
    const statusB = getRemisionStatus(b);
    const priorityDiff = getRemisionPriority(statusA) - getRemisionPriority(statusB);
    if (priorityDiff !== 0) return priorityDiff;
    return getRemisionTime(b) - getRemisionTime(a);
  });

  const remisionSummary = remisiones.reduce((acc, item) => {
    const status = getRemisionStatus(item);
    if (getRemisionPriority(status) === 0) acc.pendientes++;
    else if (getRemisionPriority(status) === 1) acc.enSeguimiento++;
    else acc.atendidas++;
    return acc;
  }, { pendientes: 0, enSeguimiento: 0, atendidas: 0 });

  return (
    <div className="space-y-6 animate-fade-in text-left">
      {/* Overview Card */}
      <div className="bg-red-50 border border-red-200 p-4 rounded-xl flex items-start gap-3 text-xs text-red-950 shadow-4xs">
        <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-extrabold font-sans">Panel de Alertas Críticas y Remisiones a Bienestar:</span>
          <p className="text-slate-655 font-normal leading-relaxed">
            Aquí se concentran los casos críticos y las remisiones enviadas por instructores a Bienestar. El área responsable puede revisar la bitácora compartida y registrar sus propias actuaciones sin modificar los registros del instructor.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-rose-200 rounded-xl p-4 shadow-3xs">
          <span className="text-[10px] font-black text-rose-700 uppercase">Pendientes / no atendidas</span>
          <strong className="block text-2xl text-rose-950 mt-1">{remisionSummary.pendientes}</strong>
        </div>
        <div className="bg-white border border-purple-200 rounded-xl p-4 shadow-3xs">
          <span className="text-[10px] font-black text-purple-700 uppercase">En seguimiento</span>
          <strong className="block text-2xl text-purple-950 mt-1">{remisionSummary.enSeguimiento}</strong>
        </div>
        <div className="bg-white border border-emerald-200 rounded-xl p-4 shadow-3xs">
          <span className="text-[10px] font-black text-emerald-700 uppercase">Atendidas / cerradas</span>
          <strong className="block text-2xl text-emerald-950 mt-1">{remisionSummary.atendidas}</strong>
        </div>
      </div>

      {/* Filters and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-3xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por aprendiz, documento, ficha o programa..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-250 rounded-lg text-xs font-medium focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none"
          />
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-500">Filtrar Estado:</span>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="border border-slate-250 bg-white rounded-lg px-3 py-1.5 text-xs font-bold text-slate-700 outline-none focus:ring-1 focus:ring-red-500"
          >
            <option value="todos">Todos los Estados</option>
            <option value="Pendiente de atención por Bienestar">Pendiente de atención por Bienestar</option>
            <option value="En seguimiento por Bienestar">En seguimiento por Bienestar</option>
            <option value="Atendido por Bienestar">Atendido por Bienestar</option>
            <option value="Contacto fallido">Contacto fallido</option>
            <option value="Requiere intervención administrativa">Requiere intervención administrativa</option>
            <option value="En trámite">En trámite</option>
            <option value="Cerrado">Cerrado</option>
            <option value="Cerrado por mejora">Cerrado por mejora</option>
          </select>
          
          <button 
            onClick={fetchAlertas}
            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors border border-slate-200 cursor-pointer"
            title="Refrescar Alertas"
            type="button"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!loading && !error && (
        <div className="bg-white border border-rose-200 rounded-xl shadow-3xs overflow-hidden">
          <div className="px-4 py-3 bg-rose-50 border-b border-rose-100 flex items-center justify-between">
            <div>
              <h4 className="text-xs font-black text-rose-950 uppercase">Remisiones a Bienestar</h4>
              <p className="text-[10px] text-rose-800 font-semibold">
                Casos remitidos por instructores y actuaciones registradas por Bienestar.
              </p>
            </div>
            <span className="bg-white border border-rose-200 text-rose-700 text-[10px] font-black px-2 py-1 rounded">
              {filteredRemisiones.length} casos
            </span>
          </div>

          {filteredRemisiones.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 font-semibold">
              No hay remisiones a Bienestar con los filtros actuales.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-150 text-[10px] font-black uppercase tracking-wider text-slate-500">
                    <th className="py-3 px-4">Aprendiz</th>
                    <th className="py-3 px-4">Ficha / Programa</th>
                    <th className="py-3 px-4">Instructor</th>
                    <th className="py-3 px-4 text-center">Riesgo</th>
                    <th className="py-3 px-4 text-center">Pendientes</th>
                    <th className="py-3 px-4">Estado</th>
                    <th className="py-3 px-4">Última actuación</th>
                    <th className="py-3 px-4 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredRemisiones.map((remision) => {
                    const estadoRemision = getRemisionStatus(remision);
                    return (
                    <tr key={remision.id} className="hover:bg-rose-50/30 transition-colors">
                      <td className="py-3.5 px-4">
                        <span className="font-bold text-slate-800">{remision.aprendizNombre}</span>
                        <span className="block text-[10px] text-slate-500 font-mono">
                          {remision.aprendizDocumento} · {remision.aprendizCorreo || 'sin correo'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="bg-slate-100 text-slate-700 border border-slate-200 font-mono font-black text-[10px] px-1.5 py-0.5 rounded">
                          Ficha {remision.fichaCodigo || 'N/D'}
                        </span>
                        <span className="block text-[10px] text-slate-500 mt-1 max-w-[220px] truncate" title={remision.programaNombre}>
                          {remision.programaNombre || 'Programa no registrado'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-bold text-slate-700">{remision.instructorNombre || remision.usuarioResponsableNombre || 'Instructor'}</span>
                        <span className="block text-[10px] text-slate-400">{remision.instructorCorreo || remision.instructorRol || ''}</span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-flex px-2 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-black text-[10px]">
                          {remision.nivelRiesgo || 'Sin dato'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center font-black text-slate-700">
                        {remision.evidenciasPendientes ?? 0}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${getStatusBadgeClass(estadoRemision)}`}>
                          {estadoRemision}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-[10px] text-slate-600 max-w-[220px]">
                        {remision.ultimaActuacion || 'Pendiente de atención por Bienestar'}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleOpenRemision(remision)}
                          className="bg-purple-700 hover:bg-purple-800 text-white font-extrabold text-[10.5px] px-3 py-1.5 rounded-lg shadow-sm transition-all cursor-pointer"
                        >
                          Ver / atender
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Data Section */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-red-600" />
          <p className="text-xs font-bold text-slate-500">Cargando alertas críticas del sistema...</p>
        </div>
      ) : error ? (
        <div className="p-8 bg-red-50/50 rounded-xl border border-red-150 text-center space-y-2">
          <AlertTriangle className="w-10 h-10 text-red-600 mx-auto" />
          <p className="text-sm font-bold text-slate-700">Error al cargar datos</p>
          <p className="text-xs text-slate-500">{error}</p>
          <button 
            onClick={fetchAlertas}
            className="mt-2 bg-red-600 text-white text-xs font-bold py-1.5 px-4 rounded-lg hover:bg-red-700"
            type="button"
          >
            Reintentar
          </button>
        </div>
      ) : filteredAlertas.length === 0 ? (
        <div className="py-16 text-center border border-slate-150 border-dashed rounded-xl bg-slate-50/40 space-y-3">
          <CheckCircle className="w-12 h-12 text-[#39A900] mx-auto animate-pulse" />
          <div className="space-y-1">
            <h4 className="text-sm font-extrabold text-slate-800">¡No hay Alertas Críticas Vigentes!</h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Todos los aprendices se encuentran en un margen de llamados saludable (menos de 4 llamados) o sus alertas administrativas han sido cerradas con éxito.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl shadow-3xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-150 text-[10px] font-black uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Aprendiz</th>
                  <th className="py-3 px-4">Ficha / Programa</th>
                  <th className="py-3 px-4 text-center">Llamados</th>
                  <th className="py-3 px-4 text-center">Inasistencia</th>
                  <th className="py-3 px-4">Historial de Llamados</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredAlertas.map((al) => {
                  let badgeBg = 'bg-red-50 text-red-800 border-red-200';
                  if (al.estadoAlerta === 'En trámite') {
                    badgeBg = 'bg-amber-50 text-amber-800 border-amber-200';
                  } else if (al.estadoAlerta === 'Cerrado') {
                    badgeBg = 'bg-slate-100 text-slate-700 border-slate-300';
                  } else if (al.estadoAlerta === 'Cerrado por mejora') {
                    badgeBg = 'bg-emerald-50 text-emerald-800 border-emerald-200';
                  }

                  return (
                    <tr key={al.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="space-y-0.5">
                          <span className="font-bold text-slate-800 text-xs">{al.nombre}</span>
                          <span className="block text-[10px] text-slate-500 font-mono">CC {al.documento} • {al.correo}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="space-y-0.5 max-w-[200px]">
                          <span className="bg-slate-100 text-slate-700 border border-slate-200 font-mono font-black text-[10px] px-1.5 py-0.5 rounded">
                            Ficha {al.fichaId}
                          </span>
                          <span className="block text-[10px] text-slate-500 font-medium truncate mt-0.5" title={al.programaFormacion}>
                            {al.programaFormacion}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-flex items-center justify-center bg-red-100 text-red-800 font-black px-2.5 py-1 rounded-full text-xs">
                          {al.totalLlamados}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="font-bold text-slate-700">
                          {al.diasSinAcceso} días
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="max-w-[260px] space-y-1 text-[10.5px]">
                          {al.historialLlamados && al.historialLlamados.length > 0 ? (
                            al.historialLlamados.map((ll: any, idx: number) => (
                              <div key={idx} className="bg-slate-50 border border-slate-100 px-2 py-1 rounded text-slate-600 font-mono leading-tight">
                                <strong className="text-red-700"># {ll.numeroLlamado || idx + 1}:</strong> {ll.fecha} • {ll.instructor || 'Inst.'}
                                <span className="block text-[9px] text-slate-400">Evidencias: {ll.evidenciasPendientes} • Inasistencia: {ll.diasSinAcceso}d</span>
                              </div>
                            ))
                          ) : (
                            <span className="text-slate-400 italic">No hay registros de llamados.</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${badgeBg}`}>
                            {al.estadoAlerta}
                          </span>
                          {al.observacionAdministrativa && (
                            <p className="text-[10px] text-slate-550 italic max-w-[150px] line-clamp-2" title={al.observacionAdministrativa}>
                              "{al.observacionAdministrativa}"
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() => handleOpenGestion(al)}
                          className="bg-slate-800 hover:bg-slate-900 text-white font-extrabold text-[10.5px] px-3 py-1.5 rounded-lg shadow-sm transition-all cursor-pointer inline-flex items-center gap-1"
                          type="button"
                        >
                          Gestionar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedRemision && (
        <div className="fixed inset-0 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto animate-fade-in" id="modal-atender-remision-bienestar">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-scale-up text-left">
            <div className="bg-purple-800 py-4 px-6 text-white flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-sm tracking-wide uppercase text-white">Atender Remisión a Bienestar</h3>
                <p className="text-[10px] text-purple-100 font-semibold mt-0.5">
                  Caso compartido con instructoría · Registro independiente de Bienestar
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRemision(null)}
                className="p-1 hover:bg-white/10 rounded-full transition-colors text-white"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            <div className="overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-1 bg-slate-50 rounded-xl p-4 border border-slate-200 text-xs space-y-2">
                  <div>
                    <span className="block text-[9px] font-black text-slate-400 uppercase">Aprendiz</span>
                    <span className="font-black text-slate-800 text-sm">{selectedRemision.aprendizNombre}</span>
                    <span className="block text-[10px] text-slate-500 font-mono">{selectedRemision.aprendizDocumento}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200">
                    <div>
                      <span className="block text-[9px] font-black text-slate-400 uppercase">Ficha</span>
                    <span className="font-bold text-slate-700">{selectedRemision.fichaCodigo || 'No disponible'}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] font-black text-slate-400 uppercase">Riesgo</span>
                      <span className="font-bold text-amber-700">{selectedRemision.nivelRiesgo || 'Sin dato'}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] font-black text-slate-400 uppercase">Días sin acceso</span>
                      <span className="font-bold text-slate-700">{selectedRemision.diasSinAcceso || 0}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] font-black text-slate-400 uppercase">Pendientes</span>
                      <span className="font-bold text-slate-700">{selectedRemision.evidenciasPendientes || 0}</span>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-slate-200">
                    <span className="block text-[9px] font-black text-slate-400 uppercase">Programa</span>
                    <span className="font-bold text-slate-700">{selectedRemision.programaNombre || 'No disponible'}</span>
                  </div>
                  <div className="pt-2 border-t border-slate-200">
                    <span className="block text-[9px] font-black text-slate-400 uppercase">Instructor que remite</span>
                    <span className="font-bold text-slate-700">{selectedRemision.instructorNombre || selectedRemision.usuarioResponsableNombre || 'Instructor'}</span>
                    <span className="block text-[10px] text-slate-500">{selectedRemision.instructorCorreo || selectedRemision.instructorRol || 'No disponible'}</span>
                  </div>
                  <div className="pt-2 border-t border-slate-200">
                    <span className="block text-[9px] font-black text-slate-400 uppercase">Fecha de remisión</span>
                    <span className="font-bold text-slate-700">{selectedRemision.fechaRemision || 'No disponible'}</span>
                  </div>
                </div>

                <div className="lg:col-span-2 bg-rose-50 rounded-xl p-4 border border-rose-100 text-xs space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-black text-rose-950 uppercase text-[11px]">Remisión registrada por instructor</h4>
                    <span className="bg-white border border-rose-200 text-rose-700 rounded px-2 py-0.5 text-[10px] font-bold">
                      {getRemisionStatus(selectedRemision)}
                    </span>
                  </div>
                  <p className="text-slate-700 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto bg-white border border-rose-100 rounded-lg p-3">
                    {selectedRemision.observacion || selectedRemision.cuerpoMensaje || selectedRemision.detalles || 'Sin observación registrada.'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
                    <h4 className="text-[11px] font-black text-slate-700 uppercase">Historial compartido</h4>
                  </div>
                  <div className="p-3 space-y-2 max-h-64 overflow-y-auto">
                    {((selectedRemision.historialCompartido || selectedRemision.historial || []) as any[]).length === 0 ? (
                      <p className="text-xs text-slate-400 font-semibold">No hay historial asociado.</p>
                    ) : (
                      (selectedRemision.historialCompartido || selectedRemision.historial || []).map((item: any) => {
                        const area = getAreaResponsable(item);
                        const readOnlyLabel = area === 'Instructor' || area === 'Instructor que remite'
                          ? 'Solo lectura: registro realizado por Instructor'
                          : 'Actuación de Bienestar/Admin';
                        return (
                        <div key={item.id} className="bg-white border border-slate-100 rounded-lg p-2 text-[10.5px]">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-black text-slate-700">{item.tipoSeguimiento || 'Seguimiento'}</span>
                            <span className={`border rounded-full px-2 py-0.5 text-[9px] font-black ${
                              area === 'Bienestar/Admin'
                                ? 'bg-purple-50 text-purple-800 border-purple-200'
                                : 'bg-slate-50 text-slate-600 border-slate-200'
                            }`}>
                              {area}
                            </span>
                          </div>
                          <div className="text-slate-400 mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
                            <span>{item.fecha || item.fechaRegistro || 'Sin fecha'}</span>
                            <span>{item.medioComunicacion || 'Medio no disponible'}</span>
                            <span>{item.creadoPorNombre || item.usuarioResponsableNombre || 'Responsable no disponible'}</span>
                          </div>
                          <p className="text-slate-600 mt-1 whitespace-pre-wrap">{item.observacion || item.detalles || item.detalle || 'Sin detalle'}</p>
                          <span className="inline-flex mt-2 text-[9px] font-bold bg-slate-50 text-slate-500 border border-slate-200 rounded px-1.5 py-0.5">
                            {readOnlyLabel}
                          </span>
                        </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <form onSubmit={handleGuardarIntervencionBienestar} className="border border-purple-200 rounded-xl overflow-hidden">
                  <div className="bg-purple-50 px-4 py-2 border-b border-purple-100">
                    <h4 className="text-[11px] font-black text-purple-900 uppercase">Registrar actuación de Bienestar</h4>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-black text-slate-600 uppercase mb-1">Medio / actuación</label>
                        <select
                          value={bienestarMedio}
                          onChange={e => setBienestarMedio(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-200 bg-white rounded-lg text-xs font-bold text-slate-800 outline-none focus:ring-1 focus:ring-purple-600"
                        >
                          <option value="Llamada al aprendiz">Llamada al aprendiz</option>
                          <option value="Correo al aprendiz">Correo al aprendiz</option>
                          <option value="Mensaje por WhatsApp">Mensaje por WhatsApp</option>
                          <option value="Orientación o acompañamiento">Orientación o acompañamiento</option>
                          <option value="Contacto fallido">Contacto fallido</option>
                          <option value="Seguimiento del caso">Seguimiento del caso</option>
                          <option value="Cierre o atención del caso">Cierre o atención del caso</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-slate-600 uppercase mb-1">Estado</label>
                        <select
                          value={bienestarEstado}
                          onChange={e => setBienestarEstado(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-200 bg-white rounded-lg text-xs font-bold text-slate-800 outline-none focus:ring-1 focus:ring-purple-600"
                        >
                          <option value="En seguimiento por Bienestar">En seguimiento por Bienestar</option>
                          <option value="Atendido por Bienestar">Atendido por Bienestar</option>
                          <option value="Contacto fallido">Contacto fallido</option>
                          <option value="Cerrado">Cerrado</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-600 uppercase mb-1">Observación de Bienestar</label>
                      <textarea
                        required
                        rows={5}
                        value={bienestarObservacion}
                        onChange={e => setBienestarObservacion(e.target.value)}
                        placeholder="Registre la actuación realizada, resultado del contacto, acuerdos o motivo de contacto fallido."
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium focus:border-purple-600 focus:ring-1 focus:ring-purple-600 outline-none leading-relaxed"
                      />
                    </div>
                    <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setSelectedRemision(null)}
                        className="bg-white hover:bg-slate-50 text-slate-600 text-xs font-bold py-2 px-4 rounded-lg border border-slate-200 transition-all cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={savingBienestar}
                        className="bg-purple-700 hover:bg-purple-800 disabled:bg-purple-300 text-white text-xs font-black py-2 px-5 rounded-lg shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        {savingBienestar ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Guardando...
                          </>
                        ) : (
                          <>
                            <Check className="w-3.5 h-3.5 text-white" />
                            Registrar intervención
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Gestionar Alerta Modal Slideover/Popup */}
      {selectedAlerta && (
        <div className="fixed inset-0 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto animate-fade-in" id="modal-gestionar-alerta-critica">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 max-w-lg w-full flex flex-col overflow-hidden animate-scale-up text-left">
            {/* Header */}
            <div className="bg-slate-900 py-4 px-6 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-amber-500 animate-pulse" />
                <h3 className="font-extrabold text-sm tracking-wide uppercase text-white">Gestionar Alerta Administrativa</h3>
              </div>
              <button 
                type="button" 
                onClick={() => setSelectedAlerta(null)}
                className="p-1 hover:bg-white/10 rounded-full transition-colors text-white"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            <form onSubmit={handleGuardarGestion} className="p-6 space-y-4">
              
              {/* Context Stats */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-xs space-y-1.5">
                <div>
                  <span className="text-slate-400 font-bold uppercase text-[9px] tracking-wider block">Aprendiz</span>
                  <span className="font-black text-slate-800 text-sm">{selectedAlerta.nombre}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                  <div>
                    <span className="text-slate-400 font-bold uppercase text-[9px] block">Ficha</span>
                    <span className="font-bold text-slate-700">{selectedAlerta.fichaId}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold uppercase text-[9px] block">Llamados Recibidos</span>
                    <span className="font-bold text-red-600">{selectedAlerta.totalLlamados} llamados</span>
                  </div>
                </div>
              </div>

              {/* Status input dropdown */}
              <div className="space-y-1">
                <label className="block text-xs font-black text-slate-700 uppercase">Estado del Trámite:</label>
                <select
                  value={nuevoEstado}
                  onChange={e => setNuevoEstado(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 bg-white rounded-lg text-xs font-bold text-slate-800 outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500"
                >
                  <option value="Requiere intervención administrativa">Requiere intervención administrativa (Pendiente)</option>
                  <option value="En trámite">En trámite (Comité en curso, etc.)</option>
                  <option value="Cerrado">Cerrado (Desvinculado, Sancionado, etc.)</option>
                  <option value="Cerrado por mejora">Cerrado por mejora (Aprendiz se puso al día)</option>
                </select>
              </div>

              {/* Observation textarea */}
              <div className="space-y-1">
                <label className="block text-xs font-black text-slate-700 uppercase">Observación o Detalle del Trámite Realizado:</label>
                <textarea
                  required
                  rows={5}
                  value={observacion}
                  onChange={e => setObservacion(e.target.value)}
                  placeholder="Ej: Se citó a Comité de Evaluación y Seguimiento de Ficha. El aprendiz firmó un plan de mejora académica para ponerse al día con plazo al 20 de junio..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none leading-relaxed"
                ></textarea>
              </div>

              {/* Footer action buttons */}
              <div className="pt-3 flex justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedAlerta(null)}
                  className="bg-white hover:bg-slate-50 text-slate-600 text-xs font-bold py-2 px-4 rounded-lg border border-slate-200 transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-slate-900 hover:bg-black text-white text-xs font-black py-2 px-5 rounded-lg shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5 text-white" />
                      <span>Registrar Gestión</span>
                    </>
                  )}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
