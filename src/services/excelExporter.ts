import * as XLSX from 'xlsx';
import { Aprendiz, FichaInfo } from '../types';

/**
 * Exports a multisheet Excel file using SheetJS (xlsx).
 * Sheet 1: "Seguimiento" - complete data row per apprentice
 * Sheet 2: "Información" - institutional and ficha definitions
 */
export function exportarExcelSeguimiento(
  aprendices: Aprendiz[],
  fichaInfo: FichaInfo
) {
  const wb = XLSX.utils.book_new();

  // 1. Prepare data for "Seguimiento"
  const seguimientoRows = aprendices.map(ap => {
    // Base columns
    const row: Record<string, any> = {
      'Nombre Aprendiz': ap.nombre,
      'Documento': ap.documento,
      'Correo Electrónico': ap.correo,
      'Nivel de Riesgo': ap.nivelRiesgo,
      'Puntaje de Riesgo': ap.puntajeRiesgo,
      'Estado de Intervención': ap.estadoIntervencion,
      'Último Acceso LMS': ap.ultimoAcceso || 'Sin registro',
      'Días sin Acceso': ap.diasSinAcceso ?? 'N/A'
    };

    // Append columns for each evidence
    Object.entries(ap.evidencias).forEach(([evName, val]) => {
      let label = 'Aprobado (A)';
      if (val === 'D') label = 'Desaprobado (D)';
      if (val === '*') label = 'No Entregado (*)';
      row[`Evid: ${evName}`] = label;
    });

    // Append last intervention details
    const ultInter = ap.historialIntervenciones[0];
    if (ultInter) {
      row['Última Fecha Intervención'] = ultInter.fecha;
      row['Estrategias Aplicadas'] = ultInter.estrategias.join('; ');
      row['Causas Diagnosticadas'] = ultInter.causas.join('; ');
      row['Observaciones Registradas'] = ultInter.observaciones;
    } else {
      row['Última Fecha Intervención'] = 'Ninguna';
      row['Estrategias Aplicadas'] = 'N/A';
      row['Causas Diagnosticadas'] = 'N/A';
      row['Observaciones Registradas'] = '';
    }

    return row;
  });

  const wsSeguimiento = XLSX.utils.json_to_sheet(seguimientoRows);
  XLSX.utils.book_append_sheet(wb, wsSeguimiento, 'Seguimiento');

  // 2. Prepare data for "Información"
  const infoRows = [
    { 'Parámetro Institucional': 'Regional', 'Valor': fichaInfo.regional },
    { 'Parámetro Institucional': 'Centro de Formación', 'Valor': fichaInfo.centroFormacion },
    { 'Parámetro Institucional': 'Programa de Formación', 'Valor': fichaInfo.programaFormacion },
    { 'Parámetro Institucional': 'Nivel', 'Valor': fichaInfo.nivel },
    { 'Parámetro Institucional': 'Número de Ficha', 'Valor': fichaInfo.numeroFicha },
    { 'Parámetro Institucional': 'Instructor Vocero', 'Valor': fichaInfo.instructor },
    { 'Parámetro Institucional': 'Fecha de Reporte', 'Valor': new Date().toLocaleDateString() },
    { 'Parámetro Institucional': 'Total Aprendices Analizados', 'Valor': aprendices.length }
  ];

  const wsInfo = XLSX.utils.json_to_sheet(infoRows);
  XLSX.utils.book_append_sheet(wb, wsInfo, 'Información');

  // 3. Write Excel
  XLSX.writeFile(wb, `SENA_Alertas_Seguimiento_${fichaInfo.numeroFicha}.xlsx`);
}
