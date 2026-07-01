import * as XLSX from 'xlsx';
import { Aprendiz, Fase, Evidencia } from '../types';

/**
 * Normalizes text to easily find names or documents despite case/accents.
 */
function normalizeKey(key: any): string {
  if (!key) return '';
  return String(key)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .trim();
}

/**
 * Robustly tries to extract learner's name from a row object.
 */
export function getNombre(row: any): string {
  const keys = Object.keys(row);
  
  // 1. Direct matches for full name
  const fullNameKeys = [
    'nombre completo',
    'nombres y apellidos',
    'nombre(s)/apellido(s)',
    'nombre(s) y apellido(s)',
    'student name',
    'apellidos y nombres',
    'nombre y apellido'
  ];
  
  for (const k of fullNameKeys) {
    const foundKey = keys.find(key => normalizeKey(key) === k);
    if (foundKey && row[foundKey]) {
      return String(row[foundKey]).trim();
    }
  }

  // 2. Separate Nombre and Apellido columns
  const nameKey = keys.find(key => {
    const norm = normalizeKey(key);
    return norm === 'nombre' || norm === 'nombres' || norm === 'first name' || norm === 'nombre(s)';
  });
  
  const lastNameKey = keys.find(key => {
    const norm = normalizeKey(key);
    return norm === 'apellido' || norm === 'apellidos' || norm === 'last name' || norm === 'apellido(s)';
  });

  if (nameKey && lastNameKey && (row[nameKey] || row[lastNameKey])) {
    return `${String(row[nameKey] || '').trim()} ${String(row[lastNameKey] || '').trim()}`.trim();
  }

  if (nameKey && row[nameKey]) {
    return String(row[nameKey]).trim();
  }

  // 3. Fallback search by substrings
  const softNameKey = keys.find(key => normalizeKey(key).includes('nombre') && !normalizeKey(key).includes('usuario'));
  if (softNameKey && row[softNameKey]) {
    return String(row[softNameKey]).trim();
  }
  return 'Aprendiz sin nombre';
}

/**
 * Extracts and separates document and document type from "Nombre de usuario".
 */
export function parseNombreUsuario(usernameStr: string): { documento: string, tipoDoc: string } | null {
  if (!usernameStr) return null;
  const cleaned = usernameStr.trim().toLowerCase();
  // Match prefix of digits, followed by alphabetical document types (e.g., cc, ti, ce, pep, etc.)
  const match = cleaned.match(/^(\d+)([a-z]+)$/);
  if (match) {
    return {
      documento: match[1],
      tipoDoc: match[2].toUpperCase()
    };
  }
  if (/^\d+$/.test(cleaned)) {
    return {
      documento: cleaned,
      tipoDoc: 'CC'
    };
  }
  return null;
}

/**
 * Extracts the document type.
 */
export function getTipoDocumento(row: any): string {
  const keys = Object.keys(row);
  const usernameKey = keys.find(key => {
    const norm = normalizeKey(key);
    return norm === 'nombre de usuario' || norm === 'usuario' || norm === 'username' || norm === 'nombre_usuario';
  });
  if (usernameKey && row[usernameKey]) {
    const parsed = parseNombreUsuario(String(row[usernameKey]));
    if (parsed) {
      return parsed.tipoDoc;
    }
  }

  const tipoKey = keys.find(key => {
    const norm = normalizeKey(key);
    return norm.includes('tipo') && (norm.includes('doc') || norm.includes('identi') || norm.includes('clase') || norm.includes('type'));
  });
  if (tipoKey && row[tipoKey]) {
    return String(row[tipoKey]).trim().toUpperCase();
  }

  return 'CC';
}

/**
 * Robustly extracts the Document/Identification number.
 */
export function getDocumento(row: any): string {
  const keys = Object.keys(row);

  // Check Nombre de usuario first as it contains both document & type
  const usernameKey = keys.find(key => {
    const norm = normalizeKey(key);
    return norm === 'nombre de usuario' || norm === 'usuario' || norm === 'username' || norm === 'nombre_usuario';
  });
  if (usernameKey && row[usernameKey]) {
    const parsed = parseNombreUsuario(String(row[usernameKey]));
    if (parsed) {
      return parsed.documento;
    }
  }
  
  const docKeys = [
    'documento',
    'documento de identidad',
    'identificacion',
    'cedula',
    'cc',
    'ti',
    'document',
    'id de estudiante',
    'id estudiante',
    'numero de documento',
    'registro',
    'no documento',
    'no. documento',
    'nro documento',
    'nro. documento',
    'num documento',
    'num. documento',
    'numero de identificacion',
    'documento de identificacion'
  ];

  for (const k of docKeys) {
    const foundKey = keys.find(key => normalizeKey(key) === k);
    if (foundKey && row[foundKey]) {
      return String(row[foundKey]).trim();
    }
  }

  // Search by substring
  const softDocKey = keys.find(key => {
    const norm = normalizeKey(key);
    // CRITICAL: Avoid matching "tipo de documento" or similar metadata as the identification number
    if (norm.includes('tipo') || norm.includes('type') || norm.includes('clase')) return false;
    return norm.includes('doc') || norm.includes('identi') || norm.includes('cedula') || norm.includes('id');
  });
  if (softDocKey && row[softDocKey]) {
    return String(row[softDocKey]).trim();
  }

  return '';
}

/**
 * Breakdown an evidence column header into details.
 */
export function desglosarEvidencia(header: string, faseNombre: string) {
  if (!header) {
    return {
      nombre: '',
      codigo: '',
      actividadProyecto: 'Sin Actividad',
      fase: faseNombre || '',
      tipo: 'Evidencia',
    };
  }
  const norm = header.toLowerCase();
  let tipo = 'Evidencia';
  if (norm.includes('prueba de conocimiento') || norm.includes('evaluacion') || norm.includes('cuestionario') || norm.includes('prueba')) {
    tipo = 'Prueba de Conocimiento';
  } else if (norm.includes('foro')) {
    tipo = 'Foro';
  }

  // Extract code: finding pattern GA\d+-\d+-AA\d+-EV\d+ or similar
  const codeMatch = header.match(/(GA\d+-[A-Za-z0-9_-]+)/i);
  let codigo = '';
  let actividadProyecto = 'Sin Actividad';

  if (codeMatch) {
    codigo = codeMatch[1].toUpperCase();
    const actMatch = codigo.match(/^(GA\d+)/i);
    if (actMatch) {
      actividadProyecto = actMatch[1].toUpperCase();
    }
  } else {
    const gaMatch = header.match(/(GA\d+)/i);
    if (gaMatch) {
      actividadProyecto = gaMatch[1].toUpperCase();
      codigo = header;
    } else {
      codigo = header;
    }
  }

  return {
    nombre: header,
    codigo,
    actividadProyecto,
    fase: faseNombre,
    tipo,
  };
}

/**
 * Robustly extracts the Phone/Celular number.
 */
export function getTelefono(row: any): string {
  const keys = Object.keys(row);
  
  const phoneKeys = [
    'celular',
    'telefono',
    'celular/telefono',
    'telefono/celular',
    'phone',
    'mobile',
    'movil',
    'numero de celular',
    'numero de telefono',
    'nro de celular',
    'telefono de contacto'
  ];

  for (const k of phoneKeys) {
    const foundKey = keys.find(key => normalizeKey(key) === k);
    if (foundKey && row[foundKey]) {
      return String(row[foundKey]).trim();
    }
  }

  // Substring search
  const softPhoneKey = keys.find(key => {
    const norm = normalizeKey(key);
    return norm.includes('celular') || norm.includes('telefono') || norm.includes('phone') || norm.includes('movil');
  });
  if (softPhoneKey && row[softPhoneKey]) {
    return String(row[softPhoneKey]).trim();
  }

  return '';
}

/**
 * Robustly extracts the Email address.
 */
export function getCorreo(row: any): string {
  const keys = Object.keys(row);
  
  const emailKeys = [
    'correo',
    'correo electronico',
    'email',
    'correo electronico institucional',
    'mail'
  ];

  for (const k of emailKeys) {
    const foundKey = keys.find(key => normalizeKey(key) === k);
    if (foundKey && row[foundKey]) {
      return String(row[foundKey]).trim();
    }
  }

  // Try finding values with '@' or keys containing 'correo'/'email'
  const softEmailKey = keys.find(key => {
    const norm = normalizeKey(key);
    return norm.includes('correo') || norm.includes('email') || norm.includes('mail');
  });
  if (softEmailKey && row[softEmailKey]) {
    return String(row[softEmailKey]).trim();
  }

  // Value scan fallback (finding column whose values contain @)
  for (const k of keys) {
    if (String(row[k]).includes('@')) {
      return String(row[k]).trim();
    }
  }

  return 'correo@sena.edu.co';
}

/**
 * Read Excel file returning both headers and mapped rows.
 */
export async function leerArchivoExcel(file: File): Promise<{ headers: string[]; rows: any[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary', cellDates: true });
        
        // Find sheet that contains "calificacion" or "calificaciones", mapping to the sena instructions
        const sheetName = workbook.SheetNames.find(name => 
          name.toLowerCase().includes('calificacion') || 
          name.toLowerCase().includes('calificaciones')
        ) || workbook.SheetNames[0];

        const sheet = workbook.Sheets[sheetName];
        
        const sheetRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        
        // Get headers in order
        const rawHeaders = XLSX.utils.sheet_to_json(sheet, { header: 1 })[0] as string[];
        const cleanHeaders = (rawHeaders || []).map(h => String(h || '').trim()).filter(Boolean);
        
        resolve({ headers: cleanHeaders, rows: sheetRows });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsBinaryString(file);
  });
}

/**
 * Parses headers automatically grouping columns into Phases as per rules.
 */
export function detectarFases(headers: string[]): Fase[] {
  const phases: Fase[] = [];
  let currentEvidences: Evidencia[] = [];
  
  const isMetaHeader = (header: string): boolean => {
    const norm = normalizeKey(header);
    return (
      norm.includes('nombre') ||
      norm.includes('apellido') ||
      norm.includes('correo') ||
      norm.includes('email') ||
      norm.includes('documento') ||
      norm.includes('cedula') ||
      norm.includes('identi') ||
      norm.includes('cc') ||
      norm.includes('identificacion') ||
      norm.includes('usuario') ||
      norm.includes('grupo') ||
      norm.includes('id de estudiante') ||
      norm.includes('total del curso') ||
      norm.includes('total curso') ||
      norm.includes('total acumulado') ||
      norm.includes('estado') ||
      norm.includes('celular') ||
      norm.includes('telefono') ||
      norm.includes('phone') ||
      norm.includes('mobile') ||
      norm.includes('movil') ||
      norm.includes('institucion') ||
      norm.includes('departamento')
    );
  };

  const isPhaseMarker = (header: string): boolean => {
    const norm = normalizeKey(header);
    return norm.includes('total fase') || norm.includes('total de la fase') || norm.includes('total de fase');
  };

  for (const header of headers) {
    if (isMetaHeader(header)) {
      continue;
    }
    
    if (isPhaseMarker(header)) {
      // Close current phase
      // Clean up the name for header selection: e.g. "Total Fase 1: Inducción" -> "Fase 1: Inducción"
      const cleanedName = header.replace(/^total\s+/i, '').trim();
      const phaseId = header; // keep original header as key ID for total col, or just header
      
      phases.push({
        id: phaseId,
        nombre: cleanedName || `Fase ${phases.length + 1}`,
        evidencias: [...currentEvidences],
        selected: true
      });
      currentEvidences = [];
    } else {
      // Regular evidence
      currentEvidences.push({
        nombre: header,
        selected: true
      });
    }
  }
  
  // Leftover evidences go to a final phase
  if (currentEvidences.length > 0) {
    phases.push({
      id: 'Fase de Evidencias Adicionales',
      nombre: 'Fase de Seguimiento / Adicional',
      evidencias: currentEvidences,
      selected: true
    });
  }
  
  return phases;
}

/**
 * Normalizes lists of Row objects into standard Aprendices.
 */
export function normalizarAprendices(
  rows: any[],
  phases: Fase[]
): Aprendiz[] {
  return rows
    .map((row, index) => {
      const documento = getDocumento(row);
      const nombre = getNombre(row);
      const correo = getCorreo(row);
      const telefono = getTelefono(row);
      const tipoDocumento = getTipoDocumento(row);
      
      if (!documento && !nombre) return null; // skip completely empty rows
      
      const evidencias: Record<string, any> = {};
      
      // Extract grades and metadata for each evidence
      phases.forEach(phase => {
        phase.evidencias.forEach(ev => {
          const value = row[ev.nombre];
          let val = '-';
          if (value !== undefined) {
            // standardize: A (Aprobado), D (Desaprobado), - (No entregado)
            let rawVal = String(value).trim().toUpperCase();
            if (rawVal === 'A' || rawVal === 'APROBADO' || rawVal === 'APROBADA') {
              val = 'A';
            } else if (rawVal === 'D' || rawVal === 'DESAPROBADO' || rawVal === 'DESAPROBADA' || rawVal === 'REPROBADO' || rawVal === 'REPROBADA') {
              val = 'D';
            } else {
              val = '-';
            }
          }
          
          const info = desglosarEvidencia(ev.nombre, phase.nombre);
          evidencias[ev.nombre] = {
            nombre: info.nombre,
            codigo: info.codigo,
            actividadProyecto: info.actividadProyecto,
            fase: info.fase,
            tipo: info.tipo,
            estado: val
          };
        });
      });

      // Extract phase summary
      const resumenFases: Record<string, string> = {};
      const keys = Object.keys(row);
      keys.forEach(k => {
        const norm = normalizeKey(k);
        if (norm.includes('total fase') || norm.includes('total de la fase') || norm.includes('total de fase') || norm.includes('total del curso') || norm.includes('total curso')) {
          let val = '-';
          const rVal = String(row[k]).trim().toUpperCase();
          if (rVal === 'A' || rVal === 'APROBADO' || rVal === 'APROBADA') {
            val = 'A';
          } else if (rVal === 'D' || rVal === 'DESAPROBADO' || rVal === 'DESAPROBADA' || rVal === 'REPROBADO' || rVal === 'REPROBADA') {
            val = 'D';
          }
          resumenFases[k] = val;
        }
      });
      
      return {
        id: documento || `temp-${index}`,
        nombre,
        documento,
        tipoDocumento,
        correo,
        telefono,
        evidencias,
        resumenFases,
        ultimoAcceso: null,
        diasSinAcceso: null,
        puntajeRiesgo: 0,
        nivelRiesgo: 'Bajo' as const,
        estadoIntervencion: 'Sin intervención' as const,
        historialIntervenciones: []
      } as unknown as Aprendiz;
    })
    .filter((a): a is Aprendiz => a !== null);
}

/**
 * Merges qualifications and participant last access reports to enrich dataset.
 */
export function combinarDatos(
  aprendices: Aprendiz[],
  participanteRows: any[]
): Aprendiz[] {
  if (!participanteRows || participanteRows.length === 0) return aprendices;

  // Build index for easy login lookup
  const accessMap: Record<string, string> = {};
  
  // Try to find columns for ID and login date in participantRows
  participanteRows.forEach(row => {
    const doc = getDocumento(row);
    if (!doc) return;
    
    // Find last access date column
    const keys = Object.keys(row);
    const accessKey = keys.find(key => {
      const norm = normalizeKey(key);
      return norm.includes('acceso') || norm.includes('ingreso') || norm.includes('last access') || norm.includes('fecha');
    });

    if (accessKey && row[accessKey]) {
      accessMap[doc] = String(row[accessKey]).trim();
    }
  });

  return aprendices.map(ap => {
    const accessDateStr = accessMap[ap.documento];
    if (accessDateStr) {
      // Calculate days without access if parseable
      let diasSinAcceso: number | null = null;
      let dateObj: Date | null = null;

      // Handle common Date formats
      // 1. Excel Serial date directly inside js cell (typeof Date)
      if (accessDateStr && !isNaN(Date.parse(accessDateStr))) {
        dateObj = new Date(accessDateStr);
      } else {
        // Try to parse format dd/mm/yyyy or yyyy-mm-dd
        const parts = accessDateStr.split(/[-/]/);
        if (parts.length === 3) {
          // If first part is 4 digits, assume yyyy-mm-dd
          if (parts[0].length === 4) {
            dateObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
          } else {
            // Assume dd/mm/yyyy
            dateObj = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
          }
        }
      }

      if (dateObj && !isNaN(dateObj.getTime())) {
        const today = new Date();
        const diffTime = today.getTime() - dateObj.getTime();
        diasSinAcceso = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        if (diasSinAcceso < 0) diasSinAcceso = 0; // prevent negative days if system clocks diverge
      }

      return {
        ...ap,
        ultimoAcceso: accessDateStr,
        diasSinAcceso
      };
    }
    return ap;
  });
}

export interface ProgramacionItem {
  codigoFicha: string;
  correoInstructor: string;
  nombreInstructor: string;
  nombrePrograma: string;
  nivel: string;
  fechaInicio: string;
  fechaFin: string;
  rolInstructor: string;
  area?: string;
}

/**
 * Reads an Excel file and returns its rows as a primitive raw 2D array of cells.
 */
export async function leerArchivoExcel2D(file: File): Promise<any[][]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        
        const rows2D = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][];
        resolve(rows2D);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsBinaryString(file);
  });
}

/**
 * Detects whether the parsed 2D rows correspond to 'calificaciones' (grading report)
 * or 'aprendices' (apprentice list/enrolment).
 */
export function detectExcelReportType(rows2D: any[][]): 'aprendices' | 'calificaciones' | 'unknown' {
  if (!Array.isArray(rows2D) || rows2D.length === 0) return 'unknown';

  let hasQualificationsIndicators = false;
  let hasLearnersIndicators = false;

  // Scan cells in the first 50 rows to detect typical indicators for both reports
  for (let r = 0; r < Math.min(50, rows2D.length); r++) {
    const row = rows2D[r] || [];
    for (let c = 0; c < row.length; c++) {
      const val = String(row[c] || '').trim();
      const valLower = val.toLowerCase();
      const valClean = valLower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

      // Calificaciones indicators
      if (
        valLower.includes('evidencia:') ||
        valLower.includes('foro:') ||
        valLower.includes('prueba de conocimiento:') ||
        valClean.includes('total de la fase') ||
        valLower.includes('total fase') ||
        valLower.includes('total del curso') ||
        valClean.includes('nombre de usuario')
      ) {
        hasQualificationsIndicators = true;
      }

      // Aprendices indicators
      if (
        valClean === 'tipo de documento' ||
        valClean === 'numero de documento' ||
        valClean === 'correo electronico' ||
        valLower === 'celular' ||
        valLower === 'estado'
      ) {
        hasLearnersIndicators = true;
      }
    }
  }

  if (hasQualificationsIndicators && !hasLearnersIndicators) {
    return 'calificaciones';
  }
  if (hasLearnersIndicators && !hasQualificationsIndicators) {
    return 'aprendices';
  }

  // Fallback checks
  if (hasQualificationsIndicators) {
    return 'calificaciones';
  }
  if (hasLearnersIndicators) {
    return 'aprendices';
  }

  return 'unknown';
}

/**
 * Normalizes keys to easily compare cell headers case-insensitive and accentless
 */
function cleanKey(val: any): string {
  if (val === undefined || val === null) return '';
  return String(val)
    .toLowerCase()
    .normalize('NFD') // decomposes accents
    .replace(/[\u0300-\u036f]/g, '') // removes combined accents
    .replace(/[^a-z0-9]/g, '') // alphanumeric only
    .trim();
}

/**
 * Robustly parses a 2D grid from excel sheet, supporting dual formats:
 * 1. Standard Tabular/Plantilla format: Each row contains full data.
 * 2. Reporte de Instructores por Ficha format: Key metadata sections on top, followed by a list of instructors.
 */
export function parseFichaExcel(rows2D: any[][]): ProgramacionItem[] {
  let isStyle2 = false;
  let style2HeaderRowIdx = -1;
  
  // Try to find the header row of Style 2 (contains both "nombre instructor" and "apellido instructor" or "competencia")
  for (let r = 0; r < rows2D.length; r++) {
    const row = rows2D[r] || [];
    const normalizedCells = row.map(cell => cleanKey(cell));
    
    const hasNombre = normalizedCells.some(c => c === 'nombreinstructor');
    const hasApellido = normalizedCells.some(c => c === 'apellidoinstructor' || c === 'apellidosinstructor');
    const hasCompetencia = normalizedCells.some(c => c === 'competencia');
    
    if (hasNombre && (hasApellido || hasCompetencia)) {
      isStyle2 = true;
      style2HeaderRowIdx = r;
      break;
    }
  }
  
  if (isStyle2 && style2HeaderRowIdx !== -1) {
    console.log("Analyzing as Style 2 (Reporte de Instructores por Ficha)...");
    
    // Scan metadata preceding the table Header
    let codigoFicha = '';
    let nombrePrograma = '';
    let fechaInicio = '';
    let fechaFin = '';
    let nivel = 'Tecnólogo';
    
    for (let r = 0; r < style2HeaderRowIdx; r++) {
      const row = rows2D[r] || [];
      for (let c = 0; c < row.length; c++) {
        const cellText = cleanKey(row[c]);
        const nextVal = row[c + 1] ? String(row[c + 1]).trim() : '';
        
        if (cellText === 'codigoficha' || cellText === 'ficha' || cellText === 'codficha' || cellText.includes('codigoficha')) {
          if (nextVal) codigoFicha = nextVal;
        } else if (cellText === 'nombreprograma' || cellText === 'programa' || cellText === 'programaformacion' || cellText.includes('nombreprograma')) {
          if (nextVal) nombrePrograma = nextVal;
        } else if (cellText === 'fechainicioficha' || cellText === 'fechainicio' || cellText === 'inicioficha' || cellText.includes('fechainicio')) {
          if (nextVal) fechaInicio = nextVal;
        } else if (cellText === 'fechafinficha' || cellText === 'fechafin' || cellText === 'finficha' || cellText.includes('fechafin')) {
          if (nextVal) fechaFin = nextVal;
        } else if (cellText === 'nivel' || cellText === 'nivelformacion') {
          if (nextVal) nivel = nextVal;
        }
      }
    }
    
    // Normalise date values if they're formatted like dd/mm/yyyy or Excel date values
    const formatDateStr = (dateStr: string): string => {
      if (!dateStr) return '';
      // If it contains slashes, let's convert dd/mm/yyyy to yyyy-mm-dd
      const parts = dateStr.split(/[-/]/);
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
        } else {
          return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
      }
      return dateStr;
    };
    
    const startValue = formatDateStr(fechaInicio) || '2026-01-15';
    const endValue = formatDateStr(fechaFin) || '2027-12-15';
    
    const headerRow = rows2D[style2HeaderRowIdx];
    const colIndices = {
      nombre: headerRow.findIndex(c => cleanKey(c) === 'nombreinstructor'),
      apellido: headerRow.findIndex(c => cleanKey(c) === 'apellidoinstructor' || cleanKey(c) === 'apellidosinstructor'),
      estado: headerRow.findIndex(c => cleanKey(c) === 'estadoinstructor'),
      competencia: headerRow.findIndex(c => cleanKey(c) === 'competencia'),
      fechaInicioProg: headerRow.findIndex(c => cleanKey(c) === 'fechainicioprogramacion'),
      fechaFinProg: headerRow.findIndex(c => cleanKey(c) === 'fechafinprogramacion'),
      horas: headerRow.findIndex(c => cleanKey(c) === 'horasprogramadas')
    };
    
    const items: ProgramacionItem[] = [];
    
    for (let r = style2HeaderRowIdx + 1; r < rows2D.length; r++) {
      const row = rows2D[r] || [];
      if (row.length === 0) continue;
      
      const getCellByColIdx = (idx: number): string => {
        if (idx === -1 || idx >= row.length) return '';
        const val = row[idx];
        if (val instanceof Date) {
          return val.toISOString().split('T')[0];
        }
        return val !== undefined && val !== null ? String(val).trim() : '';
      };
      
      const firstName = getCellByColIdx(colIndices.nombre);
      const lastName = getCellByColIdx(colIndices.apellido);
      
      if (!firstName && !lastName) continue;
      
      const nombreInstructor = `${firstName} ${lastName}`.trim().replace(/\s+/g, ' ');
      
      // Auto-generate official sena email address using dot-structure: nombre.apellido@sena.edu.co
      const firstWordOfName = firstName.split(' ')[0].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
      const firstWordOfSurname = lastName.split(' ')[0].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
      
      let correoInstructor = '';
      if (firstWordOfName && firstWordOfSurname) {
        correoInstructor = `${firstWordOfName}.${firstWordOfSurname}@sena.edu.co`;
      } else {
        correoInstructor = `${(firstWordOfName || firstWordOfSurname || 'instructor')}@sena.edu.co`;
      }
      
      items.push({
        codigoFicha: codigoFicha || '3186593',
        correoInstructor,
        nombreInstructor,
        nombrePrograma: nombrePrograma || 'Programa de Formación',
        nivel: nivel || 'Tecnólogo',
        fechaInicio: startValue,
        fechaFin: endValue,
        rolInstructor: 'Instructor Técnico',
        area: 'General'
      });
    }
    
    // De-duplicate items by barcode/combination
    const uniqueMap = new Map<string, ProgramacionItem>();
    items.forEach(item => {
      const uniqueKey = `${item.codigoFicha}_${item.correoInstructor.toLowerCase().trim()}`;
      if (!uniqueMap.has(uniqueKey)) {
        uniqueMap.set(uniqueKey, item);
      }
    });
    
    return Array.from(uniqueMap.values());
  } else {
    // Style 1: Standard tabular design / template format
    console.log("Analyzing as Style 1 (Standard Tabular / Plantilla)...");
    
    let headerRowIdx = 0;
    for (let r = 0; r < Math.min(10, rows2D.length); r++) {
      const row = rows2D[r] || [];
      const normalizedCells = row.map(cell => cleanKey(cell));
      if (normalizedCells.some(c => c === 'codigoficha' || c === 'ficha' || c === 'correoinstructor' || c === 'correo')) {
        headerRowIdx = r;
        break;
      }
    }
    
    const headerRow = rows2D[headerRowIdx] || [];
    const normalizedHeaders = headerRow.map(h => cleanKey(h));
    
    const getColIndex = (aliases: string[]): number => {
      // 1. Prioritize exact match
      const exactIdx = normalizedHeaders.findIndex(header => {
        return aliases.some(alias => header === alias);
      });
      if (exactIdx !== -1) return exactIdx;

      // 2. Fallback check with smart exclusion of 'correo' column for name-related aliases
      return normalizedHeaders.findIndex(header => {
        return aliases.some(alias => {
          if ((alias === 'instructor' || alias === 'nombre' || alias === 'nombreinstructor' || alias === 'instructornombre' || alias === 'nombre_instructor' || alias === 'responsable') && header.includes('correo')) {
            return false;
          }
          return header.includes(alias);
        });
      });
    };
    
    const colIndices = {
      codigoFicha: getColIndex(['codigoficha', 'ficha', 'codficha', 'nroficha', 'codigo']),
      correoInstructor: getColIndex(['correo', 'email', 'correoinstructor', 'instructorcorreo', 'correo_instructor']),
      nombreInstructor: getColIndex(['nombre', 'instructor', 'nombreinstructor', 'instructornombre', 'nombre_instructor', 'responsable']),
      nombrePrograma: getColIndex(['programa', 'programaformacion', 'programa_formacion', 'nombreprograma', 'curso']),
      nivel: getColIndex(['nivel', 'nivelformacion', 'nivel_formacion', 'tipo']),
      fechaInicio: getColIndex(['fechainicio', 'inicio', 'fecha_inicio', 'startdate']),
      fechaFin: getColIndex(['fechafin', 'fin', 'fecha_fin', 'enddate']),
      rolInstructor: getColIndex(['rol', 'rolinstructor', 'rol_instructor', 'papel']),
      area: getColIndex(['area', 'materia', 'especialidad', 'asignatura'])
    };
    
    const items: ProgramacionItem[] = [];
    
    for (let r = headerRowIdx + 1; r < rows2D.length; r++) {
      const row = rows2D[r] || [];
      if (row.length === 0) continue;
      
      const getVal = (idx: number): string => {
        if (idx === -1 || idx >= row.length) return '';
        const val = row[idx];
        if (val instanceof Date) {
          return val.toISOString().split('T')[0];
        }
        return val !== undefined && val !== null ? String(val).trim() : '';
      };
      
      const codigoFicha = getVal(colIndices.codigoFicha);
      const correoInstructor = getVal(colIndices.correoInstructor);
      
      if (!codigoFicha) continue;
      
      const detectedNombre = getVal(colIndices.nombreInstructor) || 'Instructor Técnico';
      let detectedCorreo = correoInstructor;
      
      if (!detectedCorreo) {
        const cleanName = detectedNombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, '');
        const nameParts = cleanName.split(' ').filter(Boolean);
        if (nameParts.length >= 2) {
          detectedCorreo = `${nameParts[0]}.${nameParts[1]}@sena.edu.co`;
        } else if (nameParts.length === 1) {
          detectedCorreo = `${nameParts[0]}@sena.edu.co`;
        } else {
          detectedCorreo = 'instructor@sena.edu.co';
        }
      }
      
      const rolInstructor = getVal(colIndices.rolInstructor) || 'Instructor Técnico';
      let areaVal = getVal(colIndices.area).trim();

      // Reglas para el campo area:
      // 1. Si el rol es Instructor Líder, el área puede registrarse como General.
      // 2. Si el rol es Instructor Transversal, el área debe ser obligatoria.
      const isLider = rolInstructor.toLowerCase().includes('lider');
      const isTransversal = rolInstructor.toLowerCase().includes('transversal');
      
      if (isLider) {
        if (!areaVal) {
          areaVal = 'General';
        }
      } else if (isTransversal) {
        if (!areaVal) {
          areaVal = 'General'; // Obligatoria fallback if empty in Excel row.
        }
      } else {
        // Default area for other roles
        if (!areaVal) {
          areaVal = 'General';
        }
      }
      
      items.push({
        codigoFicha,
        correoInstructor: detectedCorreo,
        nombreInstructor: detectedNombre,
        nombrePrograma: getVal(colIndices.nombrePrograma) || 'Programa de Formación',
        nivel: getVal(colIndices.nivel) || 'Tecnólogo',
        fechaInicio: getVal(colIndices.fechaInicio) || '2026-01-15',
        fechaFin: getVal(colIndices.fechaFin) || '2027-12-15',
        rolInstructor,
        area: areaVal
      });
    }
    
    return items;
  }
}

export interface ReporteAprendicesResult {
  fichaCodigo: string;
  programaFormacion: string;
  nivel: 'Técnico' | 'Tecnólogo';
  aprendices: Aprendiz[];
  totalRows?: number;
}

/**
 * Parses enrollment report of registered students (Reporte de Aprendices format from the ADMIN console image)
 */
export function parseReporteAprendicesExcel(rows2D: any[][]): ReporteAprendicesResult {
  let fichaCodigo = '';
  let programaFormacion = 'Análisis y Desarrollo de Software';
  let nivel: 'Técnico' | 'Tecnólogo' = 'Tecnólogo';
  
  // 1. Scan the top of the spreadsheet (first 15 rows) for Ficha de Caracterización metadata label.
  for (let r = 0; r < Math.min(15, rows2D.length); r++) {
    const row = rows2D[r] || [];
    for (let c = 0; c < row.length; c++) {
      const valStr = String(row[c] || '').trim();
      const valCleaned = cleanKey(valStr);
      
      if (valCleaned.includes('fichadecaracterizacion') || valCleaned === 'ficha' || valCleaned.includes('ficha')) {
        let textToParse = '';
        const nextVal = row[c + 1] ? String(row[c + 1]).trim() : '';
        if (nextVal) {
          textToParse = nextVal;
        } else {
          textToParse = valStr;
        }

        if (textToParse) {
          const numMatch = textToParse.match(/(\d{6,9})/);
          if (numMatch) {
            fichaCodigo = numMatch[1];
            let prog = textToParse.replace(fichaCodigo, '').trim();
            prog = prog.replace(/^[-\s:()]+/, '').replace(/[-\s()]+$/, '').trim();
            prog = prog.replace(/^(ficha de caracterizacion|ficha):?/i, '').trim();
            if (prog && prog.length > 3) {
              programaFormacion = prog;
            }
          } else if (textToParse !== valStr) {
            fichaCodigo = textToParse;
          }
        }
      }
    }
  }

  // Fallback Ficha code if we can't find label but can find any 6-9 digit number in top cells
  if (!fichaCodigo) {
    for (let r = 0; r < Math.min(15, rows2D.length); r++) {
      const row = rows2D[r] || [];
      for (let c = 0; c < row.length; c++) {
        const txt = String(row[c] || '').trim();
        const match = txt.match(/(\d{6,9})/);
        if (match) {
          fichaCodigo = match[1];
          let prog = txt.replace(fichaCodigo, '').trim();
          prog = prog.replace(/^[-\s:()]+/, '').replace(/[-\s()]+$/, '').trim();
          if (prog && prog.length > 3) {
            programaFormacion = prog;
          }
          break;
        }
      }
      if (fichaCodigo) break;
    }
  }

  // Sanitize the level "Técnico" or "Tecnólogo" based on the program text
  const progLower = programaFormacion.toLowerCase();
  if (progLower.includes('tecnico') || progLower.includes('téc')) {
    nivel = 'Técnico';
  } else {
    nivel = 'Tecnólogo';
  }

  // 2. Find the table header using a robust scoring system to avoid top-banner false positives
  let headerRowIdx = -1;
  let maxScore = -1;

  for (let r = 0; r < Math.min(50, rows2D.length); r++) {
    const row = rows2D[r] || [];
    const normalized = row.map(cell => cleanKey(cell));
    
    let score = 0;
    const hasDoc = normalized.some(c => 
      ((c === 'numerodedocumento' || 
        c === 'documentodeidentidad' || 
        c === 'documento' || 
        c === 'identificacion' || 
        c.includes('numerodedocumento') || 
        c.includes('documento') || 
        c.includes('identificacion') || 
        c.includes('numdoc') || 
        c.includes('nrodoc') || 
        c.includes('nodoc') ||
        c === 'cc' ||
        c === 'id' ||
        c === 'doc' ||
        c.includes('doc') ||
        c.includes('cedula')) &&
       !c.includes('tipo') &&
       !c.includes('clase'))
    );
    if (hasDoc) score += 3.5;

    const hasName = normalized.some(c => 
      ((c === 'nombre' || 
        c === 'nombres' || 
        c.includes('nombre') || 
        c.includes('apellido') || 
        c.includes('completo') || 
        c.includes('estudiante') || 
        c.includes('aprendiz')) &&
       !c.includes('programa') &&
       !c.includes('instructor'))
    );
    if (hasName) score += 2;

    const hasCorreo = normalized.some(c => c.includes('correo') || c.includes('email') || c.includes('mail'));
    if (hasCorreo) score += 1.5;

    const hasTipoDoc = normalized.some(c => c.includes('tipodedocumento') || c.includes('tipodoc') || c === 'td' || c.includes('tipodedoc') || c.includes('tipo'));
    if (hasTipoDoc) score += 1;

    const hasCelular = normalized.some(c => c.includes('celular') || c.includes('telefono') || c.includes('movil') || c === 'tel' || c === 'telf');
    if (hasCelular) score += 1;

    const hasEstado = normalized.some(c => c === 'estado' || c === 'status' || c === 'situacion' || c.includes('estado'));
    if (hasEstado) score += 1;

    // Must match at least document and name or document and email (score >= 4.5) to be considered a true tabular header
    if (row.length >= 3 && score > maxScore && score >= 4.5) {
      maxScore = score;
      headerRowIdx = r;
    }
  }

  const aprendices: Aprendiz[] = [];

  if (headerRowIdx !== -1) {
    const headerRow = rows2D[headerRowIdx];
    const cleanHeaders = headerRow.map(h => cleanKey(h));

    const colIndices = {
      tipoDoc: cleanHeaders.findIndex(h => h.includes('tipodedocumento') || h.includes('tipodoc') || h === 'td' || h.includes('tipodedoc') || h.includes('tipo')),
      documento: cleanHeaders.findIndex(h => 
        (h.includes('documento') || 
         h.includes('identificacion') || 
         h.includes('cedula') || 
         h === 'cc' || 
         h === 'id' || 
         h.includes('numdoc') || 
         h.includes('nrodoc') || 
         h.includes('nodoc') || 
         h.includes('nrodedocumento') || 
         h.includes('numerodedoc') ||
         h.includes('documentodeidentidad') ||
         h.includes('num_doc') ||
         h.includes('doc') ||
         h.includes('identifica')) &&
        !h.includes('tipo') &&
        !h.includes('clase')
      ),
      nombre: cleanHeaders.findIndex(h => 
        (h === 'nombre' || 
         h === 'nombres' || 
         h.includes('primernombre') || 
         h.includes('nombrecompleto') || 
         h.includes('nombresyapellidos') || 
         h.includes('estudiante') ||
         h.includes('nombre') ||
         h.includes('aprendiz')) &&
        !h.includes('programa') &&
        !h.includes('instructor')
      ),
      apellidos: cleanHeaders.findIndex(h => 
        (h === 'apellidos' || 
         h === 'apellido' || 
         h.includes('primerapellido') || 
         h.includes('segundoapellido') ||
         h.includes('apellido')) &&
        !h.includes('programa') &&
        !h.includes('instructor')
      ),
      celular: cleanHeaders.findIndex(h => 
        h.includes('celular') || 
        h.includes('telefono') || 
        h.includes('movil') || 
        h === 'tel' || 
        h === 'telf'
      ),
      correo: cleanHeaders.findIndex(h => 
        h.includes('correo') || 
        h.includes('email') || 
        h.includes('mail')
      ),
      estado: cleanHeaders.findIndex(h => 
        h === 'estado' || 
        h === 'status' || 
        h === 'situacion' || 
        h.includes('estado')
      )
    };

    for (let r = headerRowIdx + 1; r < rows2D.length; r++) {
      const row = rows2D[r] || [];
      if (row.length === 0) continue;

      const getVal = (idx: number): string => {
        if (idx === -1 || idx >= row.length) return '';
        const val = row[idx];
        return val !== undefined && val !== null ? String(val).trim() : '';
      };

      const docVal = getVal(colIndices.documento);
      let firstNames = getVal(colIndices.nombre);
      const lastNames = getVal(colIndices.apellidos);

      // Verify that this row contains a valid document number to avoid parsing blank filler rows at bottom of sheet
      if (!docVal || !/^\d{4,15}$/.test(docVal.replace(/[^0-9]/g, ''))) {
        continue;
      }

      if (!firstNames && !lastNames) {
        firstNames = `Aprendiz ${docVal}`;
      }

      const nombreCompleto = `${firstNames} ${lastNames}`.trim().replace(/\s+/g, ' ');
      const correoVal = getVal(colIndices.correo) || `${docVal}@sena.edu.co`;
      const telVal = getVal(colIndices.celular);

      aprendices.push({
        id: docVal,
        documento: docVal,
        nombre: nombreCompleto,
        correo: correoVal,
        telefono: telVal,
        evidencias: {},
        ultimoAcceso: null,
        diasSinAcceso: null,
        puntajeRiesgo: 0,
        nivelRiesgo: 'Bajo',
        estadoIntervencion: 'Sin intervención',
        historialIntervenciones: []
      });
    }
  }

  return {
    fichaCodigo: fichaCodigo || '',
    programaFormacion,
    nivel,
    aprendices,
    totalRows: rows2D.length
  };
}

/**
 * Robustly finds a value in a row by matching candidates to headers.
 */
function findValueByHeader(row: any, candidates: string[]): string {
  const keys = Object.keys(row);
  for (const candidate of candidates) {
    const normalizedCandidate = candidate.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const foundKey = keys.find(k => k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim() === normalizedCandidate);
    if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null) {
      return String(row[foundKey]).trim();
    }
  }
  // Substring fallback
  for (const candidate of candidates) {
    const normalizedCandidate = candidate.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const foundKey = keys.find(k => k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().includes(normalizedCandidate));
    if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null) {
      return String(row[foundKey]).trim();
    }
  }
  return '';
}

/**
 * Normalizes the program name to be readable (Title Case and no underscores).
 */
export function normalizePrograma(name: string): string {
  if (!name) return 'Programa de Formación';
  let cleaned = name.trim();
  cleaned = cleaned.replace(/_VIRTUAL$/i, '');
  cleaned = cleaned.replace(/_/g, ' ');
  cleaned = cleaned
    .toLowerCase()
    .split(' ')
    .map(word => {
      const lowercaseWords = ['y', 'de', 'del', 'en', 'para', 'con', 'por', 'o', 'a', 'la', 'el', 'los', 'las', 'un', 'una'];
      if (lowercaseWords.includes(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
  cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return cleaned;
}

/**
 * Normalizes NCL column into code and name.
 */
export function parseNcl(ncl: string) {
  if (!ncl) return { codigo: '', nombre: '' };
  const str = String(ncl).trim();
  const match = str.match(/^(\d+)\s*-\s*(.+)$/);
  if (match) {
    return { codigo: match[1].trim(), nombre: match[2].trim() };
  }
  return { codigo: '', nombre: str };
}

/**
 * Normalizes RAP column into code and description.
 */
export function parseRap(rap: string) {
  if (!rap) return { codigo: '', descripcion: '' };
  const str = String(rap).trim();
  const match = str.match(/^(\d+)\s*-\s*(.+)$/);
  if (match) {
    return { codigo: match[1].trim(), descripcion: match[2].trim() };
  }
  return { codigo: '', descripcion: str };
}

/**
 * Infers the instructor's role and area based on competency and fk_keyword.
 */
export function inferRoleAndArea(competency: string, fkKeyword: string): { rol: string; area: string } {
  const compUpper = (competency || '').toUpperCase();
  const keyUpper = (fkKeyword || '').toUpperCase();
  const textToSearch = `${compUpper} ${keyUpper}`;

  if (textToSearch.includes('INGLÉS') || textToSearch.includes('INGLES')) {
    return { rol: 'Instructor Transversal', area: 'Inglés' };
  }
  if (textToSearch.includes('ÉTICA') || textToSearch.includes('ETICA')) {
    return { rol: 'Instructor Transversal', area: 'Ética' };
  }
  if (textToSearch.includes('FÍSICA') || textToSearch.includes('FISICA') && !textToSearch.includes('CULTURA FÍSICA') && !textToSearch.includes('CULTURA FISICA') && !textToSearch.includes('ACTIVIDAD FÍSICA') && !textToSearch.includes('ACTIVIDAD FISICA')) {
    return { rol: 'Instructor Transversal', area: 'Física' };
  }
  if (textToSearch.includes('CULTURA_EMPRENDEDORA') || textToSearch.includes('EMPRENDIMIENTO')) {
    return { rol: 'Instructor Transversal', area: 'Emprendimiento' };
  }
  if (textToSearch.includes('ACTIVIDAD_FÍSICA') || textToSearch.includes('ACTIVIDAD FISICA') || textToSearch.includes('CULTURA FÍSICA') || textToSearch.includes('CULTURA FISICA')) {
    return { rol: 'Instructor Transversal', area: 'Cultura Física' };
  }
  if (textToSearch.includes('COMUNICACIÓN') || textToSearch.includes('COMUNICACION')) {
    return { rol: 'Instructor Transversal', area: 'Comunicación' };
  }
  if (textToSearch.includes('MATEMÁTICAS') || textToSearch.includes('MATEMATICAS')) {
    return { rol: 'Instructor Transversal', area: 'Matemáticas' };
  }
  if (textToSearch.includes('PROTECCIÓN_AMBIENTAL') || textToSearch.includes('PROTECCION AMBIENTAL') || textToSearch.includes('SST') || textToSearch.includes('AMBIENTAL')) {
    return { rol: 'Instructor Transversal', area: 'SST / Ambiental' };
  }

  const techKeywords = [
    'REQUISITOS',
    'IDENTIFICACIÓN',
    'IDENTIFICACION',
    'PROPUESTA_TÉCNICA',
    'PROPUESTA TECNICA',
    'METODOLOGÍA_SOFTWARE',
    'METODOLOGIA SOFTWARE',
    'DESARROLLO_SOFTWARE',
    'DESARROLLO SOFTWARE',
    'IMPLANTACIÓN_SOFTWARE',
    'IMPLANTACION SOFTWARE',
    'CALIDAD_SOFTWARE',
    'CALIDAD SOFTWARE',
    'BASES DE DATOS',
    'CONSTRUCCIÓN DEL SOFTWARE',
    'CONSTRUCCION DEL SOFTWARE'
  ];

  for (const kw of techKeywords) {
    if (textToSearch.includes(kw)) {
      return { rol: 'Instructor Técnico', area: 'Técnica' };
    }
  }

  return { rol: 'Instructor Técnico', area: 'Técnica' };
}

export function parseExcelDate(value: any): string {
  if (value === undefined || value === null || value === '') return '';
  if (value instanceof Date) {
    if (!isNaN(value.getTime())) {
      return value.toISOString().split('T')[0];
    }
  }
  const cleanStr = String(value).trim();
  if (/^\d+$/.test(cleanStr)) {
    const num = Number(cleanStr);
    // Convert Excel serial date
    // Excel base date is Dec 30, 1899 (due to leap year bug in 1900)
    const date = new Date((num - 25569) * 86400 * 1000);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  }
  return formatToISO(cleanStr);
}

export function parseFechaIntervencion(val: any): { inicio: string; fin: string } {
  if (!val) return { inicio: '', fin: '' };
  const str = String(val).trim();
  // Check for range with "-" or "to" or "a"
  const parts = str.split(/\s+-\s+|\s+to\s+|\s+a\s+/i);
  if (parts.length >= 2) {
    const inicio = parseExcelDate(parts[0].trim());
    const fin = parseExcelDate(parts[1].trim());
    return { inicio, fin };
  } else if (parts.length === 1 && parts[0]) {
    const parsedDate = parseExcelDate(parts[0].trim());
    return { inicio: parsedDate, fin: parsedDate };
  }
  return { inicio: '', fin: '' };
}

/**
 * Formats a Spanish/SENA date string (like DD/MM/YYYY) into YYYY-MM-DD.
 */
export function formatToISO(dateStr: string): string {
  if (!dateStr) return '';
  const clean = String(dateStr).trim();
  
  // Try Excel numeric date parsing first if needed, but XLSX cellDates handles it
  // Match standard DD/MM/YYYY or D/M/YYYY
  const slashMatch = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slashMatch) {
    const day = slashMatch[1].padStart(2, '0');
    const month = slashMatch[2].padStart(2, '0');
    const year = slashMatch[3];
    return `${year}-${month}-${day}`;
  }

  // Match YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(clean)) {
    return clean.substring(0, 10);
  }

  // If it is a JS date representation:
  const parsed = Date.parse(clean);
  if (!isNaN(parsed)) {
    const d = new Date(parsed);
    return d.toISOString().split('T')[0];
  }

  return clean;
}

/**
 * Parses an itinerary sheet into robust structured objects.
 */
export async function parseItinerarioExcel(file: File): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const sheetRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        const mapped = sheetRows.map((row: any) => {
          const ficha = findValueByHeader(row, ['ficha', 'codigo_ficha', 'codigo de ficha', 'nro_ficha']);
          const fkItinerary = findValueByHeader(row, ['fk_itinerary', 'itinerary', 'programa', 'programa de formacion', 'fk_itinerary_name', 'nombre_programa']);
          const fechaInicio = findValueByHeader(row, ['fecha de incio', 'fecha de inicio', 'fecha inicio', 'fecha_inicio', 'start date', 'inicio']);
          const fechaFin = findValueByHeader(row, ['fecha fin', 'fecha de finalizacion', 'fecha_fin', 'end date', 'fin']);
          const fkKeyword = findValueByHeader(row, ['fk_keyword', 'keyword', 'palabra clave', 'fk_keyword_name']);
          const ncl = findValueByHeader(row, ['ncl', 'norma', 'codigo competencia', 'codigo_competencia', 'competencia_ncl']);
          const competency = findValueByHeader(row, ['competency', 'competencia', 'nombre competencia', 'competencia_nombre']);
          const rap = findValueByHeader(row, ['rap', 'resultado de aprendizaje', 'resultado', 'rap_descripcion']);
          const quarter = findValueByHeader(row, ['quarter', 'trimestre_ingles', 'trimestre original']);
          const trimestre = findValueByHeader(row, ['trimestre', 'quarter_es', 'trimestre_es', 'trimestre de formacion']);
          const fechaIntervencion = findValueByHeader(row, ['fecha de intervencion', 'fecha de intervención', 'fecha intervencion', 'fecha_intervencion', 'fecha_intervencion_inicio']);
          const hora = findValueByHeader(row, ['hora', 'time', 'hora_intervencion']);
          const instructor = findValueByHeader(row, ['instructor', 'nombre instructor', 'docente', 'instructor_nombre']);

          const inferred = inferRoleAndArea(competency, fkKeyword);
          const intervencionDates = parseFechaIntervencion(fechaIntervencion);

          return {
            ficha,
            fkItinerary,
            fechaInicioOriginal: fechaInicio,
            fechaFinOriginal: fechaFin,
            fechaInicioISO: parseExcelDate(fechaInicio),
            fechaFinISO: parseExcelDate(fechaFin),
            fkKeyword,
            ncl,
            competency,
            rap,
            quarter,
            trimestre,
            fechaIntervencion,
            fechaIntervencionInicio: intervencionDates.inicio,
            fechaIntervencionFin: intervencionDates.fin,
            hora,
            instructor,
            inferredRol: inferred.rol,
            inferredArea: inferred.area,
          };
        });

        resolve(mapped);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsBinaryString(file);
  });
}
