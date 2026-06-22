import React, { useState } from 'react';
import { X, FileText, Download, AlertCircle, FileSpreadsheet } from 'lucide-react';
import { Aprendiz, FichaInfo } from '../types';
import { generarPdfSeguimiento } from '../services/pdfGenerator';
import { exportarExcelSeguimiento } from '../services/excelExporter';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  aprendices: Aprendiz[];
  fichaInfo: FichaInfo;
}

export default function ReportModal({
  isOpen,
  onClose,
  aprendices,
  fichaInfo
}: ReportModalProps) {
  const [observacionesGenerales, setObservacionesGenerales] = useState('');
  const [contenidoSelect, setContenidoSelect] = useState<'todos' | 'solo_intervenidos'>('todos');
  const [isExporting, setIsExporting] = useState(false);

  if (!isOpen) return null;

  const handleExportFiles = (e: React.FormEvent) => {
    e.preventDefault();
    setIsExporting(true);

    try {
      // 1. Generate and save the PDF
      const soloConIntervencion = contenidoSelect === 'solo_intervenidos';
      const pdf = generarPdfSeguimiento(
        aprendices,
        fichaInfo,
        observacionesGenerales,
        soloConIntervencion
      );
      pdf.save(`SENA_Informe_Seguimiento_Ficha_${fichaInfo.numeroFicha || 'SinFicha'}.pdf`);

      // 2. Generate and save the multi-sheet Excel
      const targetLearners = soloConIntervencion
        ? aprendices.filter(a => a.estadoIntervencion !== 'Sin intervención' || a.historialIntervenciones.length > 0)
        : aprendices;
      exportarExcelSeguimiento(targetLearners, fichaInfo);

    } catch (err) {
      console.error("Error generating reports", err);
      alert("Hubo un error al compilar los informes. Por favor, revisa la información de la ficha.");
    } finally {
      setIsExporting(false);
      onClose();
    }
  };

  const countIntervenidos = aprendices.filter(
    a => a.estadoIntervencion !== 'Sin intervención' || a.historialIntervenciones.length > 0
  ).length;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" id="report-modal-backdrop">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        
        {/* Background Overlay */}
        <div className="fixed inset-0 transition-opacity bg-slate-900/60 backdrop-blur-xs" onClick={onClose}></div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        {/* Modal Container */}
        <div 
          className="inline-block w-full max-w-lg overflow-hidden text-left align-middle transition-all transform bg-white rounded-lg shadow-xl sm:my-8"
          id="report-modal-container"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-sena-700 text-white">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              <h3 className="text-lg font-bold">Generar Reporte Institucional</h3>
            </div>
            <button 
              onClick={onClose} 
              className="p-1 hover:bg-white/11 rounded-full transition-colors text-white"
              title="Cerrar modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleExportFiles} className="p-6 space-y-4">
            
            <div className="p-3 bg-sena-50 border border-sena-100 text-sena-950 text-xs rounded-md">
              Se exportarán <strong>dos archivos</strong> complementarios para tu bitácora de seguimiento LMS: un PDF de presentación oficial firmado y un archivo de cálculo Excel detallado con todas las calificaciones filtradas.
            </div>

            {/* Content selector */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Filtro de Contenido
              </label>
              <select
                value={contenidoSelect}
                onChange={e => setContenidoSelect(e.target.value as any)}
                className="w-full text-xs px-3 py-2 border border-slate-200 rounded-md focus:ring-1 focus:ring-sena-500 focus:border-sena-500 bg-white"
              >
                <option value="todos">Exportar todos los aprendices ({aprendices.length} registros)</option>
                <option value="solo_intervenidos">
                  Solo aprendices con intervención registrada ({countIntervenidos} registros)
                </option>
              </select>
            </div>

            {/* General observations textarea */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Observaciones Generales del Reporte (Opcional)
              </label>
              <textarea
                placeholder="Escribe comentarios, compromisos del grupo, o justificaciones globales que aparecerán impresas en el encabezado del reporte final..."
                rows={4}
                value={observacionesGenerales}
                onChange={e => setObservacionesGenerales(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-slate-200 rounded-md focus:ring-1 focus:ring-sena-500 focus:border-sena-500"
              />
              <p className="text-[10px] text-slate-400">
                Estas anotaciones se anexarán formalmente en la sección intermedia de tu PDF institucional compilado.
              </p>
            </div>

            {/* Summary counters indicator */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="flex items-center gap-2 p-2.5 bg-slate-50 border border-slate-100 rounded-lg">
                <FileText className="w-5 h-5 text-red-600" />
                <div className="text-[11px]">
                  <span className="block font-bold text-slate-700">Bitácora Oficial PDF</span>
                  <span className="text-slate-400">Firmado, listo para comité</span>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2.5 bg-slate-50 border border-slate-100 rounded-lg">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                <div className="text-[11px]">
                  <span className="block font-bold text-slate-700">Dossier Base Excel</span>
                  <span className="text-slate-400">Dos hojas de cálculo (.xlsx)</span>
                </div>
              </div>
            </div>

            {/* Footer buttons */}
            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md transition-colors"
              >
                Cerrar
              </button>
              <button
                type="submit"
                disabled={isExporting}
                className="px-5 py-2 text-xs font-bold text-white bg-sena-500 hover:bg-sena-600 rounded-md shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
                id="export-documents-btn"
              >
                <Download className="w-4 h-4" />
                {isExporting ? 'Procesando...' : 'Descargar Archivos'}
              </button>
            </div>

          </form>
        </div>
      </div>
    </div>
  );
}
