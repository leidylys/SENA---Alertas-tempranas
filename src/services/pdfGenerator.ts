import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { Aprendiz, FichaInfo } from '../types';

/**
 * Draws the vector SENA Logo on the top-left of the PDF document.
 * Circular green symbol with 'S' next to text layout.
 */
export function drawSenaLogo(doc: jsPDF, x: number, y: number) {
  // Draw outer circle in SENA dark green (#007832)
  doc.setFillColor(0, 120, 50); 
  doc.circle(x + 8, y + 8, 8, 'F');
  
  // Draw stylish white 'S' inside
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('S', x + 5.5, y + 13.5);
  
  // Draw institution text
  doc.setTextColor(0, 120, 50);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('SENA', x + 20, y + 10);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(117, 117, 117);
  doc.text('Regional Antioquia', x + 20, y + 14);
}

/**
 * Generates the master PDF report of all learners.
 */
export function generarPdfSeguimiento(
  aprendices: Aprendiz[],
  fichaInfo: FichaInfo,
  observacionesGenerales: string,
  soloConIntervencion: boolean
): jsPDF {
  const doc = new jsPDF('p', 'mm', 'a4');
  
  // Filter if option is selected
  const listaFiltrada = soloConIntervencion 
    ? aprendices.filter(a => a.estadoIntervencion !== 'Sin intervención' || a.historialIntervenciones.length > 0)
    : aprendices;

  // Header band
  drawSenaLogo(doc, 15, 12);
  
  // Title Right aligned or centered
  doc.setTextColor(0, 120, 50);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('SISTEMA DE ALERTAS TEMPRANAS - RETENCIÓN', 78, 17, { align: 'left' });
  
  doc.setFontSize(10);
  doc.setTextColor(66, 66, 66);
  doc.setFont('helvetica', 'normal');
  doc.text('Reporte de Seguimiento y Alertas Académicas', 78, 22, { align: 'left' });

  // Thin decorative line
  doc.setDrawColor(57, 169, 0); // SENA light green
  doc.setLineWidth(1);
  doc.line(15, 30, 195, 30);

  // Ficha Info Cards Layout
  doc.setFillColor(245, 245, 245);
  doc.rect(15, 34, 180, 32, 'F');
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(0, 120, 50);
  doc.text('INFORMACIÓN DE LA FICHA', 18, 40);

  doc.setTextColor(33, 33, 33);
  doc.setFont('helvetica', 'normal');
  doc.text(`Programa: ${fichaInfo.programaFormacion}`, 18, 46);
  doc.text(`Ficha N°: ${fichaInfo.numeroFicha}`, 18, 51);
  doc.text(`Nivel: ${fichaInfo.nivel}`, 18, 56);
  doc.text(`Instructor(a): ${fichaInfo.instructor}`, 18, 61);

  doc.text(`Regional: ${fichaInfo.regional}`, 120, 46);
  doc.text(`Centro: ${fichaInfo.centroFormacion}`, 120, 51);
  doc.text(`Fecha Reporte: ${new Date().toLocaleDateString()}`, 120, 56);

  // Table header
  doc.setTextColor(0, 120, 50);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('RESUMEN DE APRENDICES Y RIESGO', 15, 73);

  // Helper counters
  const totalD = (ap: Aprendiz) => {
    if (!ap || !ap.evidencias) return 0;
    return Object.values(ap.evidencias).filter(v => {
      const valStr = v && typeof v === 'object' ? (v as any).estado : String(v);
      return valStr === 'D';
    }).length;
  };
  const totalNoEntregadas = (ap: Aprendiz) => {
    if (!ap || !ap.evidencias) return 0;
    return Object.values(ap.evidencias).filter(v => {
      const valStr = v && typeof v === 'object' ? (v as any).estado : String(v);
      return valStr === '-' || valStr === '*';
    }).length;
  };

  const tableRows = listaFiltrada.map(ap => {
    return [
      ap.nombre,
      ap.documento,
      ap.nivelRiesgo,
      `${ap.puntajeRiesgo} pts`,
      totalD(ap).toString(),
      totalNoEntregadas(ap).toString(),
      ap.diasSinAcceso !== null ? `${ap.diasSinAcceso} días` : 'Sin datos',
      ap.estadoIntervencion
    ];
  });

  (doc as any).autoTable({
    startY: 77,
    head: [['Nombre Aprendiz', 'Documento', 'Nivel Riesgo', 'Puntaje', 'Evid. D', 'No Entregó', 'Sin Acceso', 'Estado']],
    body: tableRows,
    theme: 'striped',
    headStyles: {
      fillColor: [0, 120, 50],
      textColor: [255, 255, 255],
      fontSize: 8.5,
      fontStyle: 'bold'
    },
    columnStyles: {
      0: { cellWidth: 50, fontSize: 8 },
      1: { cellWidth: 22, fontSize: 8 },
      2: { cellWidth: 22, fontSize: 8, fontStyle: 'bold' },
      3: { cellWidth: 16, fontSize: 8 },
      4: { cellWidth: 15, fontSize: 8, halign: 'center' },
      5: { cellWidth: 18, fontSize: 8, halign: 'center' },
      6: { cellWidth: 18, fontSize: 8 },
      7: { cellWidth: 19, fontSize: 8 }
    },
    didParseCell: function(data: any) {
      if (data.column.index === 2 && data.section === 'body') {
        const val = data.cell.raw;
        if (val === 'Alto') {
          data.cell.styles.textColor = [220, 38, 38]; // Red
        } else if (val === 'Medio') {
          data.cell.styles.textColor = [217, 119, 6]; // Amber
        } else if (val === 'Bajo') {
          data.cell.styles.textColor = [5, 150, 105]; // Emerald
        }
      }
    }
  });

  // Observations Section
  let finalY = (doc as any).lastAutoTable.finalY + 10;
  
  if (observacionesGenerales && observacionesGenerales.trim()) {
    // Page check to prevent clipping
    if (finalY > 230) {
      doc.addPage();
      finalY = 20;
    }

    doc.setFillColor(253, 253, 225); // amber warm tint highlight
    doc.rect(15, finalY, 180, 24, 'F');
    doc.setDrawColor(217, 119, 6);
    doc.setLineWidth(0.5);
    doc.rect(15, finalY, 180, 24);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(180, 83, 9);
    doc.text('OBSERVACIONES ACADÉMICAS GENERALES DEL INSTRUCTOR:', 18, finalY + 5);

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(66, 66, 66);
    
    // Wrap text inside box cleanly
    const lines = doc.splitTextToSize(observacionesGenerales, 172);
    doc.text(lines, 18, finalY + 11);
    
    finalY += 30;
  }

  // Signature Block
  if (finalY > 240) {
    doc.addPage();
    finalY = 40;
  } else {
    finalY = Math.max(finalY, 210); // push signature to bottom consistently
  }

  doc.setDrawColor(189, 189, 189);
  doc.setLineWidth(0.5);
  doc.line(15, finalY + 15, 85, finalY + 15);
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(33, 33, 33);
  doc.text('Firma del Instructor Vocero / Responsable', 15, finalY + 20);
  doc.setFont('helvetica', 'normal');
  doc.text(`Documento: CC _____________________`, 15, finalY + 25);
  doc.text(`${fichaInfo.instructor}`, 15, finalY + 30);

  doc.line(115, finalY + 15, 185, finalY + 15);
  doc.setFont('helvetica', 'bold');
  doc.text('Vo.Bo. Coordinación Académica', 115, finalY + 20);
  doc.setFont('helvetica', 'normal');
  doc.text('SENA CSGE Antioquia', 115, finalY + 25);

  return doc;
}

/**
 * Generates an elegant single sheet style report PDF for one specific student.
 */
export function generarPdfIndividual(aprendiz: Aprendiz, fichaInfo: FichaInfo): jsPDF {
  const doc = new jsPDF('p', 'mm', 'a4');
  
  // Header
  drawSenaLogo(doc, 15, 12);
  
  doc.setTextColor(0, 120, 50);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('FICHA INDIVIDUAL DE SEGUIMIENTO Y PLAN DE RETENCIÓN', 60, 17);
  
  doc.setFontSize(9);
  doc.setTextColor(97, 97, 97);
  doc.setFont('helvetica', 'normal');
  doc.text('SENA - Subdirección de Centro CSGE', 60, 22);

  doc.setDrawColor(57, 169, 0);
  doc.setLineWidth(0.8);
  doc.line(15, 30, 195, 30);

  // Row 1: Apprentice Metadata
  doc.setFillColor(245, 245, 245);
  doc.rect(15, 35, 180, 26, 'F');
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(0, 120, 50);
  doc.text('DATOS DEL APRENDIZ EN ALERTA', 18, 41);

  doc.setFontSize(9);
  doc.setTextColor(33, 33, 33);
  doc.setFont('helvetica', 'normal');
  doc.text(`Aprendiz: ${aprendiz.nombre}`, 18, 47);
  doc.text(`Documento: ${aprendiz.documento}`, 18, 52);
  doc.text(`Correo institucional: ${aprendiz.correo}`, 18, 57);

  doc.text(`Ficha Programa: ${fichaInfo.numeroFicha}`, 120, 47);
  doc.text(`Nivel de Riesgo: ${aprendiz.nivelRiesgo.toUpperCase()}`, 120, 52);
  doc.text(`Puntaje Riesgo: ${aprendiz.puntajeRiesgo} puntos`, 120, 57);

  // Section 2: Evidences Details
  doc.setTextColor(0, 120, 50);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('ESTADO DETALLADO DE EVIDENCIAS', 15, 70);

  const totalD = (() => {
    if (!aprendiz || !aprendiz.evidencias) return 0;
    return Object.values(aprendiz.evidencias).filter(v => {
      const valStr = v && typeof v === 'object' ? (v as any).estado : String(v);
      return valStr === 'D';
    }).length;
  })();
  const totalNoEntregadas = (() => {
    if (!aprendiz || !aprendiz.evidencias) return 0;
    return Object.values(aprendiz.evidencias).filter(v => {
      const valStr = v && typeof v === 'object' ? (v as any).estado : String(v);
      return valStr === '-' || valStr === '*';
    }).length;
  })();

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Evidencias calificadas con D (Aprobación deficiente): ${totalD}`, 18, 76);
  doc.text(`Evidencias sin entrega registrada (-): ${totalNoEntregadas}`, 18, 81);
  doc.text(`Inasistencia o Días sin acceso reportados: ${aprendiz.diasSinAcceso !== null ? `${aprendiz.diasSinAcceso} días` : 'Sin datos'}`, 18, 86);

  // Table of all grades
  const gradesRows = Object.entries(aprendiz.evidencias).map(([evName, val]) => {
    const valStr = val && typeof val === 'object' ? (val as any).estado : String(val);
    let readableVal = 'Aprobada (A)';
    if (valStr === 'D') readableVal = 'Desaprobada (D) - REQUIERE ATENCIÓN';
    if (valStr === '-' || valStr === '*') readableVal = 'No entregada (-) - REQUIERE ATENCIÓN';
    return [evName, readableVal];
  });

  (doc as any).autoTable({
    startY: 92,
    head: [['Nombre de la Evidencia Analizada', 'Calificación Actual']],
    body: gradesRows,
    theme: 'grid',
    headStyles: { fillColor: [57, 169, 0], textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 110, fontSize: 8.5 },
      1: { cellWidth: 70, fontSize: 8.5 }
    },
    didParseCell: function(data: any) {
      if (data.column.index === 1 && data.section === 'body') {
        const text = data.cell.raw;
        if (text.includes('Desaprobada')) {
          data.cell.styles.textColor = [220, 38, 38];
          data.cell.styles.fontStyle = 'bold';
        } else if (text.includes('No entregada')) {
          data.cell.styles.textColor = [217, 119, 6];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    }
  });

  let currentY = (doc as any).lastAutoTable.finalY + 10;

  // Interventions History Title
  doc.setTextColor(0, 120, 50);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('ACCIONES PEDAGÓGICAS E HISTORIAL DE INTERVENCIONES', 15, currentY);
  
  if (aprendiz.historialIntervenciones.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(97, 97, 97);
    doc.text('No hay registros de acompañamientos confirmados aún. Se recomienda registrar una intervención inmediata.', 18, currentY + 6);
    currentY += 14;
  } else {
    currentY += 4;
    // Iterate and print history cards
    aprendiz.historialIntervenciones.forEach((inter, idx) => {
      if (currentY > 230) {
        doc.addPage();
        currentY = 20;
      }
      
      doc.setFillColor(249, 250, 251);
      doc.rect(15, currentY, 180, 26, 'F');
      doc.setDrawColor(229, 231, 235);
      doc.rect(15, currentY, 180, 26);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(0, 120, 50);
      doc.text(`Intervención #${aprendiz.historialIntervenciones.length - idx} (${inter.fecha}) - Estado: ${inter.estadoIntervencion}`, 18, currentY + 5);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(55, 65, 81);
      
      const strategiesText = inter.estrategias.slice(0, 4).join(', ') + (inter.estrategias.length > 4 ? '...' : '');
      const causasText = inter.causas.slice(0, 3).join(', ');

      doc.text(`Estrategias: ${strategiesText || 'Ninguna'}`, 18, currentY + 10);
      doc.text(`Causas: ${causasText || 'No diagnosticadas'}`, 18, currentY + 15);
      
      const obsTxt = inter.observaciones ? `Obs: ${inter.observaciones}` : 'Sin observaciones.';
      const slicedObs = obsTxt.length > 90 ? obsTxt.substring(0, 90) + '...' : obsTxt;
      doc.text(slicedObs, 18, currentY + 20);

      currentY += 30;
    });
  }

  // Bottom Signature area
  if (currentY > 240) {
    doc.addPage();
    currentY = 30;
  } else {
    currentY = Math.max(currentY, 235);
  }

  doc.setDrawColor(189, 189, 189);
  doc.line(15, currentY + 15, 85, currentY + 15);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('Firma del Aprendiz Acompañado', 15, currentY + 19);

  doc.line(115, currentY + 15, 185, currentY + 15);
  doc.text('Instructor Responsable del Plan', 115, currentY + 19);
  doc.setFont('helvetica', 'normal');
  doc.text(fichaInfo.instructor, 115, currentY + 24);

  return doc;
}

/**
 * Generates an official Bienestar referral document for a learner in possible desertion.
 */
export function generarPdfBienestar(
  aprendiz: Aprendiz,
  fichaInfo: FichaInfo,
  causa: string,
  descripcion: string,
  fecha: string
): jsPDF {
  const doc = new jsPDF('p', 'mm', 'a4');
  
  // Header
  drawSenaLogo(doc, 15, 12);
  
  doc.setTextColor(190, 24, 74); // Rose-700 / Rose-800
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('REMISIÓN OFICIAL AL ÁREA DE BIENESTAR AL APRENDIZ', 55, 17);
  
  doc.setFontSize(9);
  doc.setTextColor(97, 97, 97);
  doc.setFont('helvetica', 'normal');
  doc.text('SENA - Plan Nacional de Retención de la Permanencia', 55, 22);

  doc.setDrawColor(190, 24, 74); // Rose
  doc.setLineWidth(0.8);
  doc.line(15, 30, 195, 30);

  // Box: Aprendiz Info
  doc.setFillColor(253, 242, 245); // Rose warm tint
  doc.rect(15, 35, 180, 28, 'F');
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(190, 24, 74);
  doc.text('INFORMACIÓN GENERAL DEL CASO', 18, 41);

  doc.setFontSize(9);
  doc.setTextColor(33, 33, 33);
  doc.setFont('helvetica', 'normal');
  doc.text(`Aprendiz: ${aprendiz.nombre}`, 18, 47);
  doc.text(`Identificación: ${aprendiz.documento}`, 18, 52);
  doc.text(`Correo: ${aprendiz.correo}`, 18, 57);

  doc.text(`Ficha N°: ${fichaInfo.numeroFicha}`, 120, 47);
  doc.text(`Programa: ${fichaInfo.programaFormacion}`, 120, 52);
  doc.text(`Inasistencia: ${aprendiz.diasSinAcceso || 0} días sin acceso`, 120, 57);

  // Section: Causa and Description
  doc.setTextColor(190, 24, 74);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('DIAGNÓSTICO Y MOTIVOS DE LA REMISIÓN', 15, 71);

  doc.setTextColor(33, 33, 33);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(`Causa Declarada:`, 18, 77);
  doc.setFont('helvetica', 'normal');
  doc.text(`${causa}`, 48, 77);

  doc.setFont('helvetica', 'bold');
  doc.text(`Fecha de Solicitud:`, 18, 83);
  doc.setFont('helvetica', 'normal');
  doc.text(`${fecha}`, 52, 83);

  // Detailed Description Multi-line
  doc.setFont('helvetica', 'bold');
  doc.text(`Descripción Detallada del Caso y Acciones de Acompañamiento Previas:`, 18, 91);
  
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  doc.setTextColor(66, 66, 66);
  const textLines = doc.splitTextToSize(descripcion || 'Sin descripción adicional provista por el instructor.', 174);
  doc.text(textLines, 18, 97);

  // Recommendation footer
  const boxY = 110 + (textLines.length * 4);
  doc.setFillColor(245, 245, 245);
  doc.rect(15, boxY, 180, 24, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(33, 33, 33);
  doc.text('ACCIONES SUGERIDAS PARA BIENESTAR AL APRENDIZ:', 18, boxY + 6);
  doc.setFont('helvetica', 'normal');
  doc.text('1. Brindar orientación psicológica y social inmediata para evaluar desmotivación académica.', 18, boxY + 11);
  doc.text('2. Coordinar acompañamiento familiar o tutorías personalizadas si existen causales socioeconómicas.', 18, boxY + 15);
  doc.text('3. Emitir concepto no vinculante de apoyo de sostenimiento o alimentación si aplica.', 18, boxY + 19);

  // Signature Block
  const sigY = Math.max(boxY + 35, 215);
  doc.setDrawColor(189, 189, 189);
  doc.line(15, sigY + 15, 85, sigY + 15);
  doc.setFont('helvetica', 'bold');
  doc.text('Firma del Instructor Responsable', 15, sigY + 19);
  doc.setFont('helvetica', 'normal');
  doc.text(`${fichaInfo.instructor}`, 15, sigY + 24);

  doc.line(115, sigY + 15, 185, sigY + 15);
  doc.setFont('helvetica', 'bold');
  doc.text('Firma Responsable Bienestar Aprendiz', 115, sigY + 19);
  doc.setFont('helvetica', 'normal');
  doc.text('Coordinación de Bienestar - SENA', 115, sigY + 24);

  return doc;
}

/**
 * Generates an official Academic Improvement Plan PDF document.
 */
export function generarPdfPlanMejoramiento(
  aprendiz: Aprendiz,
  fichaInfo: FichaInfo,
  estrategias: string,
  fechaLimite: string,
  compromisos: string
): jsPDF {
  const doc = new jsPDF('p', 'mm', 'a4');
  
  // Header
  drawSenaLogo(doc, 15, 12);
  
  doc.setTextColor(0, 120, 50); // SENA Green
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('CONCERTACIÓN DE PLAN DE MEJORAMIENTO ACADÉMICO', 55, 17);
  
  doc.setFontSize(9);
  doc.setTextColor(97, 97, 97);
  doc.setFont('helvetica', 'normal');
  doc.text('SENA - Proceso de Gestión de Formación Profesional Integral', 55, 22);

  doc.setDrawColor(57, 169, 0); // SENA light green
  doc.setLineWidth(0.8);
  doc.line(15, 30, 195, 30);

  // Box: Apprentice Metadata
  doc.setFillColor(240, 248, 235); // Green warm tint
  doc.rect(15, 35, 180, 26, 'F');
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(0, 120, 50);
  doc.text('DATOS CONVENIDOS DEL PLAN DE MEJORAMIENTO', 18, 41);

  doc.setFontSize(9);
  doc.setTextColor(33, 33, 33);
  doc.setFont('helvetica', 'normal');
  doc.text(`Aprendiz: ${aprendiz.nombre}`, 18, 47);
  doc.text(`Documento: ${aprendiz.documento}`, 18, 52);
  doc.text(`Correo: ${aprendiz.correo}`, 18, 57);

  doc.text(`Ficha Programa: ${fichaInfo.numeroFicha}`, 120, 47);
  doc.text(`Programa: ${fichaInfo.programaFormacion}`, 120, 52);
  doc.text(`Fecha Concertación: ${new Date().toLocaleDateString()}`, 120, 57);

  // Section: Actividades y Estrategias
  doc.setTextColor(0, 120, 50);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('1. ESTRATEGIAS DE RECUPERACIÓN PEDAGÓGICA', 15, 71);

  doc.setTextColor(33, 33, 33);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(`Fecha Límite Concedida:`, 18, 77);
  doc.setFont('helvetica', 'normal');
  doc.text(`${fechaLimite || 'No especificada'}`, 60, 77);

  doc.setFont('helvetica', 'bold');
  doc.text(`Estrategias y Actividades Concertadas a Desarrollar:`, 18, 85);
  doc.setFont('helvetica', 'normal');
  const estLines = doc.splitTextToSize(estrategias || 'Sustentar evidencias desaprobadas y presentar portafolio de evidencias completo.', 174);
  doc.text(estLines, 18, 91);

  const startCompromisoY = 96 + (estLines.length * 4);
  
  // Section: Compromisos
  doc.setTextColor(0, 120, 50);
  doc.setFont('helvetica', 'bold');
  doc.text('2. COMPROMISOS ADQUIRIDOS POR EL APRENDIZ', 15, startCompromisoY);

  doc.setTextColor(33, 33, 33);
  doc.setFont('helvetica', 'normal');
  const compLines = doc.splitTextToSize(compromisos || 'Me comprometo a asistir a las tutorías programadas por el instructor vocero y a cargar la totalidad de las evidencias acordadas en la plataforma de aprendizaje LMS antes del vencimiento del plazo fijado.', 174);
  doc.text(compLines, 18, startCompromisoY + 6);

  const startWarningY = startCompromisoY + 12 + (compLines.length * 4);

  // Section: Advertencias
  doc.setFillColor(255, 253, 230); // yellow warning tint
  doc.rect(15, startWarningY, 180, 20, 'F');
  doc.setDrawColor(217, 119, 6);
  doc.rect(15, startWarningY, 180, 20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(180, 83, 9);
  doc.text('⚠️ ADVERTENCIA DE INCUMPLIMIENTO:', 18, startWarningY + 5);
  doc.setFont('helvetica', 'normal');
  doc.text('El incumplimiento de los compromisos aquí pactados acarreará el traslado automático del caso al Comité de Evaluación y Seguimiento', 18, startWarningY + 10);
  doc.text('de Centro, lo cual podría desencadenar una recomendación de sanción o cancelación de matrícula.', 18, startWarningY + 14);

  // Signature Block
  const sigY = Math.max(startWarningY + 35, 220);
  doc.setDrawColor(189, 189, 189);
  doc.line(15, sigY + 12, 85, sigY + 12);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(33, 33, 33);
  doc.text('Firma de Conformidad del Aprendiz', 15, sigY + 16);
  doc.setFont('helvetica', 'normal');
  doc.text(`Aprendiz: ${aprendiz.nombre}`, 15, sigY + 20);
  doc.text(`Identificación: CC ${aprendiz.documento}`, 15, sigY + 24);

  doc.line(115, sigY + 12, 185, sigY + 12);
  doc.setFont('helvetica', 'bold');
  doc.text('Firma del Instructor Responsable', 115, sigY + 16);
  doc.setFont('helvetica', 'normal');
  doc.text(`${fichaInfo.instructor}`, 115, sigY + 20);
  doc.text('Centro de Servicios y Gestión Empresarial', 115, sigY + 24);

  return doc;
}
