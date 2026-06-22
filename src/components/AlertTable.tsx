import React, { useState, useMemo } from 'react';
import { 
  Search, ArrowUpDown, ChevronDown, ChevronUp, Briefcase, 
  Sparkles, CheckSquare, Square, Filter, FileArchive, Download, Eye, Activity
} from 'lucide-react';
import { Aprendiz, FichaInfo } from '../types';
import { badgeNivel, badgeEstado, rowColorNivel } from '../utils/formatters';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { generarPdfIndividual } from '../services/pdfGenerator';

interface AlertTableProps {
  aprendices: Aprendiz[];
  fichaInfo: FichaInfo;
  selectedIds: string[];
  filterSearch: string;
  onFilterSearchChange: (search: string) => void;
  filterRiesgo: 'Todos' | 'Bajo' | 'Medio' | 'Alto';
  onFilterRiesgoChange: (riesgo: 'Todos' | 'Bajo' | 'Medio' | 'Alto') => void;
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
  onIntervenirMasivo
}: AlertTableProps) {
  
  // Track which rows are expanded to see history
  const [expandedDocIds, setExpandedDocIds] = useState<string[]>([]);
  const [zipExporting, setZipExporting] = useState(false);

  const toggleRowExpand = (id: string) => {
    setExpandedDocIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Helper getters for metrics
  const getDCount = (ap: Aprendiz) => Object.values(ap.evidencias).filter(v => v === 'D').length;
  const getNoEntregasCount = (ap: Aprendiz) => Object.values(ap.evidencias).filter(v => v === '*').length;

  // Filter and sort learners
  const processedAprendices = useMemo(() => {
    let list = [...aprendices];

    // 1. Search Query (name or document)
    if (filterSearch.trim()) {
      const q = filterSearch.toLowerCase().trim();
      list = list.filter(
        ap => ap.nombre.toLowerCase().includes(q) || ap.documento.includes(q)
      );
    }

    // 2. Risk Card Filter
    if (filterRiesgo !== 'Todos') {
      list = list.filter(ap => ap.nivelRiesgo === filterRiesgo);
    }

    // 3. Intervention State Dropdown Filter
    if (filterEstado !== 'Todos') {
      list = list.filter(ap => ap.estadoIntervencion === filterEstado);
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
  }, [aprendices, filterSearch, filterRiesgo, filterEstado, sortColumn, sortDirection]);

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
              Riesgo: {filterRiesgo}
              <button onClick={() => onFilterRiesgoChange('Todos')} className="text-[#39A900] hover:text-[#007832] px-1 font-black">×</button>
            </span>
          )}

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
          {(filterSearch || filterRiesgo !== 'Todos' || filterEstado !== 'Todos') && (
            <button
              onClick={() => {
                onFilterSearchChange('');
                onFilterRiesgoChange('Todos');
                onFilterEstadoChange('Todos');
              }}
              className="text-[#39A900] hover:text-[#007832] font-black cursor-pointer py-2 px-3 hover:bg-emerald-50 rounded-xl transition-colors border border-transparent hover:border-emerald-100"
            >
              Restablecer
            </button>
          )}

        </div>
      </div>

      {/* Main Table */}
      <div className="overflow-x-auto flex-1">
        <table className="w-full text-left border-collapse min-w-[800px]" id="learners-alert-table">
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
              <th onClick={() => handleSort('nombre')} className="py-4 px-4 cursor-pointer hover:bg-slate-100/50 transition-colors">
                <div className="flex items-center gap-1.5">
                  <span>Aprendiz</span>
                  <ArrowUpDown className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                </div>
              </th>
              <th onClick={() => handleSort('documento')} className="py-4 px-4 cursor-pointer hover:bg-slate-100/50 transition-colors w-32">
                <div className="flex items-center gap-1.5">
                  <span>Documento</span>
                  <ArrowUpDown className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                </div>
              </th>
              <th onClick={() => handleSort('evidencias_d')} className="py-4 px-3 cursor-pointer hover:bg-slate-100/50 transition-colors text-center w-24" title="Evidencias en rojo">
                <div className="flex items-center justify-center gap-1.5">
                  <span>Evid. D</span>
                  <ArrowUpDown className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                </div>
              </th>
              <th onClick={() => handleSort('no_entregadas')} className="py-4 px-3 cursor-pointer hover:bg-slate-100/50 transition-colors text-center w-28" title="No entregó (*)">
                <div className="flex items-center justify-center gap-1.5">
                  <span>No Entregada</span>
                  <ArrowUpDown className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                </div>
              </th>
              <th onClick={() => handleSort('diasSinAcceso')} className="py-4 px-3 cursor-pointer hover:bg-slate-100/50 transition-colors w-28">
                <div className="flex items-center gap-1.5">
                  <span>Sin Acceso</span>
                  <ArrowUpDown className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                </div>
              </th>
              <th onClick={() => handleSort('nivelRiesgo')} className="py-4 px-4 cursor-pointer hover:bg-slate-100/50 transition-colors w-32">
                <div className="flex items-center gap-1.5">
                  <span>Riesgo</span>
                  <ArrowUpDown className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                </div>
              </th>
              <th onClick={() => handleSort('estadoIntervencion')} className="py-4 px-4 cursor-pointer hover:bg-slate-100/50 transition-colors w-36">
                <div className="flex items-center gap-1.5">
                  <span>Estado</span>
                  <ArrowUpDown className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                </div>
              </th>
              <th className="py-4 px-4 text-center w-32">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {processedAprendices.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-16 text-center text-slate-400 font-medium italic bg-white">
                  No se encontraron aprendices con los filtros seleccionados.
                </td>
              </tr>
            ) : (
              processedAprendices.map(ap => {
                const isExpanded = expandedDocIds.includes(ap.documento);
                const isChecked = selectedIds.includes(ap.documento);
                
                return (
                  <React.Fragment key={ap.documento}>
                    {/* Primary Row */}
                    <tr className={`transition-only-bg duration-150 text-slate-700 ${rowColorNivel(ap.nivelRiesgo)} ${isChecked ? 'bg-emerald-50/15' : 'hover:bg-slate-50/35'}`}>
                      <td className="py-3.5 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => onToggleSelect(ap.documento)}
                          className="rounded-md border-slate-300 text-[#39A900] focus:ring-emerald-500 cursor-pointer w-4 h-4"
                        />
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{ap.nombre}</div>
                        <div className="text-[10px] text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span>{ap.correo}</span>
                          {ap.telefono && (
                            <>
                              <span className="text-slate-300">•</span>
                              <span className="font-medium text-emerald-700 bg-emerald-50 border border-emerald-100 px-1 py-0.2 rounded hover:translate-y-[-1px] transition-transform select-all" title="Haga doble click para copiar">
                                📞 {ap.telefono}
                              </span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-600">{ap.documento}</td>
                      <td className="py-3 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full font-bold ${getDCount(ap) > 0 ? 'bg-red-50 text-red-650' : 'bg-slate-50 text-slate-400'}`}>
                          {getDCount(ap)}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full font-bold ${getNoEntregasCount(ap) > 0 ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-400'}`}>
                          {getNoEntregasCount(ap)}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        {ap.diasSinAcceso !== null ? (
                          <div className="flex flex-col">
                            <span className={`font-semibold ${ap.diasSinAcceso >= 14 ? 'text-red-600' : ap.diasSinAcceso >= 7 ? 'text-amber-650' : 'text-slate-600'}`}>
                              {ap.diasSinAcceso} días
                            </span>
                            <span className="text-[10px] text-slate-400 italic">Lms: {ap.ultimoAcceso}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Sin datos</span>
                        )}
                      </td>
                      <td className="py-3 px-4">{badgeNivel(ap.nivelRiesgo)}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          {badgeEstado(ap.estadoIntervencion)}
                          {ap.historialIntervenciones.length > 0 && (
                            <button
                              type="button"
                              onClick={() => toggleRowExpand(ap.documento)}
                              className="text-[10.5px] text-slate-400 hover:text-sena-600 flex items-center justify-between"
                              title="Ver historial de intervenciones"
                            >
                              ({ap.historialIntervenciones.length})
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Intervenir individually */}
                          <button
                            type="button"
                            onClick={() => onIntervenirIndividual(ap)}
                            className="bg-sena-50 hover:bg-sena-100 text-sena-800 text-xs py-1.5 px-3 rounded-md font-bold transition-all border border-sena-100 shrink-0"
                          >
                            Intervenir
                          </button>
                          
                          {/* Chevron expand for historic timeline */}
                          <button
                            type="button"
                            onClick={() => toggleRowExpand(ap.documento)}
                            className="p-1 hover:bg-slate-100 rounded-md transition-colors text-slate-400 hover:text-slate-700"
                            title="Desplegar historial de intervenciones"
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Historical Logs Expandible Subrow */}
                    {isExpanded && (
                      <tr className="bg-slate-50/60 transition-all">
                        <td colSpan={9} className="py-3.5 px-6 border-l-4 border-l-slate-400">
                          <div className="space-y-3">
                            <h5 className="font-bold text-slate-800 uppercase tracking-wider text-[10px] flex items-center gap-1">
                              <Activity className="w-3.5 h-3.5 text-sena-600" />
                              Historial de Intervenciones y Compromisos del Aprendiz
                            </h5>
                            
                            {ap.historialIntervenciones.length === 0 ? (
                              <p className="text-xs text-slate-400 italic">No hay intervenciones registradas aún. Haz clic en "Intervenir" para registrar la primera.</p>
                            ) : (
                              <div className="relative border-l border-slate-200 pl-4 ml-1 space-y-4">
                                {ap.historialIntervenciones.map(hist => (
                                  <div key={hist.id} className="relative text-xs">
                                    {/* Timeline dot marker */}
                                    <div className="absolute -left-[20.5px] top-1 w-2.5 h-2.5 rounded-full bg-sena-600 border border-white"></div>
                                    
                                    <div className="p-3 bg-white rounded-lg border border-slate-150 shadow-xs space-y-1">
                                      <div className="flex items-center justify-between text-slate-400 font-medium text-[10px]">
                                        <span>Fecha: <strong className="text-slate-600">{hist.fecha}</strong></span>
                                        <span>Instructor: <strong className="text-slate-600">{hist.instructor}</strong></span>
                                        <span className="text-sena-700 font-bold bg-sena-50 px-1.5 py-0.2 rounded-sm border border-sena-100">{hist.estadoIntervencion}</span>
                                      </div>
                                      
                                      {hist.estrategias.length > 0 && (
                                        <div className="pt-1.5">
                                          <span className="font-bold text-slate-600">Estrategias:</span>{' '}
                                          <span className="text-slate-700 text-[11px] bg-slate-50 px-1.5 py-0.5 rounded-sm border border-slate-100">
                                            {hist.estrategias.join(', ')}
                                          </span>
                                        </div>
                                      )}

                                      {hist.causas.length > 0 && (
                                        <div className="pt-1">
                                          <span className="font-bold text-slate-600">Causas evaluadas:</span>{' '}
                                          <span className="text-amber-800 text-[11.5px]">
                                            {hist.causas.join(', ')}
                                          </span>
                                        </div>
                                      )}

                                      {hist.observaciones && (
                                        <div className="pt-2 text-slate-600 italic border-t border-slate-100/60 mt-1">
                                          "{hist.observaciones}"
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
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
    </div>
  );
}
