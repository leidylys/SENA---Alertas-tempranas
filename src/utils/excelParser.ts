import * as XLSX from 'xlsx';
import { Aprendiz, Fase, Evidencia } from '../types';

/**
 * Normalizes text to easily find names or documents despite case/accents.
 */
function normalizeKey(key: string): string {
  return key
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
 * Robustly extracts the Document/Identification number.
 */
export function getDocumento(row: any): string {
  const keys = Object.keys(row);
  
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
        const sheetName = workbook.SheetNames[0];
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
      norm.includes('movil')
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
      
      if (!documento && !nombre) return null; // skip completely empty rows
      
      const evidencias: Record<string, string> = {};
      
      // Extract grades for each evidence
      phases.forEach(phase => {
        phase.evidencias.forEach(ev => {
          const value = row[ev.nombre];
          if (value !== undefined) {
            // standardize: A (Aprobado), D (Desaprobado), * (No entregado)
            let val = String(value).trim().toUpperCase();
            if (val === 'A' || val === 'APROBADO' || val === 'APROBADA') {
              val = 'A';
            } else if (val === 'D' || val === 'DESAPROBADO' || val === 'DESAPROBADA' || val === 'REPROBADO' || val === 'REPROBADA') {
              val = 'D';
            } else if (val === '*' || val === '' || val === 'NO ENTREGO' || val === 'FALTA' || val === 'NO ENTREGÓ') {
              val = '*';
            } else {
              // fallback, check if empty
              val = val === '' ? '*' : val;
            }
            evidencias[ev.nombre] = val;
          } else {
            evidencias[ev.nombre] = '*'; // default to not delivered if column is missing on this row
          }
        });
      });
      
      return {
        id: documento || `temp-${index}`,
        nombre,
        documento,
        correo,
        telefono,
        evidencias,
        ultimoAcceso: null,
        diasSinAcceso: null,
        puntajeRiesgo: 0,
        nivelRiesgo: 'Bajo' as const,
        estadoIntervencion: 'Sin intervención' as const,
        historialIntervenciones: []
      } as Aprendiz;
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
