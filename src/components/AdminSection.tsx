import React, { useState, useRef, useEffect } from 'react';
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
  ChevronRight
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
  parseReporteAprendicesExcel
} from '../utils/excelParser';
import { uploadProgrammingGrid, syncLearnersToDb, resetSystemDatabase } from '../lib/api';
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
  activeTab?: 'programacion' | 'aprendices_masivo';
  onChangeTab?: (tab: 'programacion' | 'aprendices_masivo') => void;
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
  const [internalActiveTab, setInternalActiveTab] = useState<'programacion' | 'aprendices_masivo'>('programacion');

  const activeTab = externalActiveTab !== undefined ? externalActiveTab : internalActiveTab;
  const setActiveTab = externalOnChangeTab !== undefined ? externalOnChangeTab : setInternalActiveTab;

  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [parsedRows, setParsedRows] = useState<ProgramacionItem[]>([]);
  const [syncStatus, setSyncStatus] = useState<{
    successCount: number;
    errorCount: number;
    details: any[];
    summary?: {
      instructoresCreados: number;
      fichasCreadas: number;
      asignacionesNuevas: number;
      asignacionesConservadas: number;
      conflictos: any[];
      registrosNoModificados: number;
      errores?: string[];
    };
  } | null>(null);
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
      const res = await fetch(`/api/administrativo/instructores/${ins.id}/prepare-delete`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
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
      const res = await fetch('/api/administrativo/instructores/delete-or-inactivate', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
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
      const res = await resetSystemDatabase(authToken);
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
      const res = await fetch('/api/administrativo/instructor-password', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
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
      const res = await uploadProgrammingGrid(authToken, parsedRows);
      if (res && res.success) {
        let successCount = 0;
        let errorCount = 0;
        if (Array.isArray(res.details)) {
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
          summary
        });

        setParsedRows([]);
        setFile(null);
        loadInstructors(); // Refresh the credential directory list too!
        onSuccessSync(); // Reload core App's ficha listings!
      }
    } catch (err: any) {
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
          errorMsg: 'Fallo al procesar reporte de aprendices Excel: ' + (err.message || 'Estructura inválida o vacía')
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
        const syncResponse = await syncLearnersToDb(
          authToken,
          item.fichaCodigo,
          item.programaFormacion,
          item.nivel,
          item.fechaInicio,
          item.fechaFin,
          result.aprendices
        );

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
          status: 'success'
        });
      } catch (err: any) {
        console.error(err);
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
    onSuccessSync(); // Refresh lists!
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

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {/* 1. Instructores Nuevos */}
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg">
              <span className="block text-[9px] text-slate-400 uppercase font-extrabold tracking-wider">Instructores Creados</span>
              <strong className="text-base text-slate-700 font-extrabold block mt-0.5">
                {syncStatus.summary?.instructoresCreados ?? 0}
              </strong>
            </div>

            {/* 2. Fichas Nuevas */}
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg">
              <span className="block text-[9px] text-slate-400 uppercase font-extrabold tracking-wider">Fichas Creadas</span>
              <strong className="text-base text-slate-700 font-extrabold block mt-0.5">
                {syncStatus.summary?.fichasCreadas ?? 0}
              </strong>
            </div>

            {/* 3. Asignaciones Nuevas */}
            <div className="p-3 bg-emerald-50/50 border border-emerald-100 rounded-lg">
              <span className="block text-[9px] text-emerald-650 uppercase font-extrabold tracking-wider">Asignaciones Nuevas</span>
              <strong className="text-base text-[#39A900] font-extrabold block mt-0.5">
                {syncStatus.summary?.asignacionesNuevas ?? syncStatus.successCount}
              </strong>
            </div>

            {/* 4. Asignaciones Conservadas */}
            <div className="p-3 bg-blue-50/35 border border-blue-100 rounded-lg">
              <span className="block text-[9px] text-blue-600 uppercase font-extrabold tracking-wider">Asignaciones Conservadas</span>
              <strong className="text-base text-blue-700 font-extrabold block mt-0.5">
                {syncStatus.summary?.asignacionesConservadas ?? 0}
              </strong>
            </div>

            {/* 5. Conflictos Detectados */}
            <div className={`p-3 border rounded-lg ${
              (syncStatus.summary?.conflictos?.length ?? 0) > 0 
                ? 'bg-rose-50 border-rose-100' 
                : 'bg-slate-50 border-slate-100'
            }`}>
              <span className={`block text-[9px] uppercase font-extrabold tracking-wider ${
                (syncStatus.summary?.conflictos?.length ?? 0) > 0 ? 'text-rose-600' : 'text-slate-400'
              }`}>Conflictos Detectados</span>
              <strong className={`text-base font-extrabold block mt-0.5 ${
                (syncStatus.summary?.conflictos?.length ?? 0) > 0 ? 'text-rose-600' : 'text-slate-700'
              }`}>
                {syncStatus.summary?.conflictos?.length ?? 0}
              </strong>
            </div>

            {/* 6. Registros No Modificados */}
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg">
              <span className="block text-[9px] text-slate-400 uppercase font-extrabold tracking-wider">Registros No Modificados</span>
              <strong className="text-base text-slate-700 font-extrabold block mt-0.5">
                {syncStatus.summary?.registrosNoModificados ?? syncStatus.errorCount}
              </strong>
            </div>
          </div>

          {/* List of Conflicts Ledger */}
          {syncStatus.summary?.conflictos && syncStatus.summary.conflictos.length > 0 && (
            <div className="border border-rose-150 rounded-lg bg-rose-50/20 overflow-hidden">
              <div className="bg-rose-50/70 px-3 py-2 border-b border-rose-150 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-rose-800 text-[10px] font-extrabold">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                  <span>DETALLE DE CONFLICTOS Y REGISTROS SALVAGUARDADOS</span>
                </div>
                <span className="text-[9px] text-rose-500 font-bold bg-rose-100/60 px-1.5 py-0.5 rounded">
                  No Sobrescritos
                </span>
              </div>
              
              <div className="divide-y divide-rose-100/50 max-h-56 overflow-y-auto">
                {syncStatus.summary.conflictos.map((conf: any, idx: number) => (
                  <div key={idx} className="p-3 text-[10px] space-y-1 bg-white">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded text-[9px]">
                        Ficha {conf.codigoFicha}
                      </span>
                      <span className="text-rose-600 font-extrabold text-[9px] uppercase tracking-wide bg-rose-50 px-1.5 py-0.5 rounded">
                        {conf.tipoConflicto}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-slate-600 mt-1">
                      <div>
                        <span className="text-[9px] text-slate-400 block font-medium">Instructor en sistema</span>
                        <span className="font-bold text-slate-700">{conf.instructorExistente}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 block font-medium">Instructor omitido del zip/reporte</span>
                        <span className="font-bold text-rose-600">{conf.instructorNuevo}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 block font-medium">Rol del reporte</span>
                        <span className="font-semibold text-slate-700">{conf.rol}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 block font-medium">Área</span>
                        <span className="font-semibold text-slate-700">{conf.area || 'General'}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'programacion' ? (
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
      ) : (
        /* APRENDICES MASIVO TAB VIEW */
        <div className="space-y-5 animate-fade-in" id="aprendices-masivo-panel-section">
          <div className="bg-emerald-50 border border-emerald-250 p-4 rounded-xl flex items-start gap-3 text-xs text-emerald-950 shadow-4xs">
            <GraduationCap className="w-5 h-5 text-[#39A900] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-extrabold font-sans">Cargar Reportes de Aprendices por Ficha en Lote:</span>
              <p className="text-slate-655 font-normal leading-relaxed">
                Suba uno o varios reportes de calificaciones exportados en formato Excel desde el LMS de cada ficha. El sistema de asignación automática de aprendices por lote detectará automáticamente los códigos de ficha y los registrará de forma secuencial sin que deba hacerlo de forma manual.
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
                  Cola de Procesamiento de Reportes ({batchFiles.length})
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
                          <span className="text-[10px] uppercase font-black tracking-wider text-slate-400">Reporte Procesado</span>
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

                          {/* WARNING IF DETECTED VERY FEW ALUMNI */}
                          {hasFewLearners && (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2 text-[10px] text-amber-900 mt-2">
                              <AlertTriangle className="w-4 h-4 text-amber-750 shrink-0 mt-0.5" />
                              <div className="space-y-0.5">
                                <span className="font-extrabold">⚠️ Alerta de Baja Detección de Aprendices:</span>
                                <p className="text-slate-655 leading-relaxed font-normal">
                                  Se han detectado únicamente {sum.validCount} aprendices de {sum.totalRows} filas totales en el archivo. Por favor, verifique si este archivo es efectivamente el reporte de aprendices (Matrícula / Calificaciones) o si ha seleccionado una pestaña o un reporte alternativo. El parser requiere columnas claras del listado (como Documento y Nombre).
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
                                  <span className="font-mono text-[11px] font-black bg-slate-100 px-2 py-0.5 rounded text-slate-600 border border-slate-150">
                                    {ins.contrasena || 'sena123'}
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

    </div>
  );
}
