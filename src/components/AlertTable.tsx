import React, { useState, useMemo } from 'react';
import { 
  Search, ArrowUpDown, ChevronDown, ChevronUp, Briefcase, 
  Sparkles, CheckSquare, Square, Filter, FileArchive, Download, Eye, Activity, Mail
} from 'lucide-react';
import { Aprendiz, FichaInfo } from '../types';
import { badgeNivel, badgeEstado, rowColorNivel, formatEvidenciaNombre } from '../utils/formatters';
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
  onEnviarLlamado: (aprendiz: Aprendiz) => void;
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
  onIntervenirMasivo,
  onEnviarLlamado
}: AlertTableProps) {
  
  // Track which rows are expanded to see history
  const [expandedDocIds, setExpandedDocIds] = useState<string[]>([]);
  const [zipExporting, setZipExporting] = useState(false);
  const [selectedLearnerForEvidences, setSelectedLearnerForEvidences] = useState<any>(null);
  const [modalStateFilter, setModalStateFilter] = useState<'Todas' | 'A' | 'D' | '-'>('Todas');

  // Find all pending evidences for selected learner
  const pendingEvidencesList = useMemo(() => {
    if (!selectedLearnerForEvidences) return [];
    
    const evs = selectedLearnerForEvidences.evidencias || {};
    return Object.entries(evs).map(([header, value]) => {
      let valStr = '';
      let detail: any = null;
      if (typeof value === 'object' && value !== null) {
        valStr = (value as any).estado;
        detail = value;
      } else {
        valStr = String(value);
      }
      
      if (valStr === '-') {
        if (detail) {
          return {
            nombre: detail.nombre || header,
            codigo: detail.codigo || '',
            actividadProyecto: detail.actividadProyecto || 'Sin Actividad',
            fase: detail.fase || 'Fase de Formación',
            tipo: detail.tipo || 'Evidencia',
            estado: 'Pendiente'
          };
        } else {
          const norm = header.toLowerCase();
          let tipo = 'Evidencia';
          if (norm.includes('prueba') || norm.includes('evaluacion') || norm.includes('cuestionario')) {
            tipo = 'Prueba de Conocimiento';
          } else if (norm.includes('foro')) {
            tipo = 'Foro';
          }
          
          let codigo = header;
          let act = 'Sin Actividad';
          const matchCode = header.match(/(GA\d+-[A-Za-z0-9_-]+)/i);
          if (matchCode) {
            codigo = matchCode[1].toUpperCase();
            const actMatch = codigo.match(/^(GA\d+)/i);
            if (actMatch) {
              act = actMatch[1].toUpperCase();
            }
          } else {
            const gaMatch = header.match(/(GA\d+)/i);
            if (gaMatch) {
              act = gaMatch[1].toUpperCase();
            }
          }
          
          return {
            nombre: header,
            codigo,
            actividadProyecto: act,
            fase: 'Fase de Formación',
            tipo,
            estado: 'Pendiente'
          };
        }
      }
      return null;
    }).filter(Boolean);
  }, [selectedLearnerForEvidences]);

  // Group the pending list by Fase and Actividad de Proyecto
  const groupedPendingEvidences = useMemo(() => {
    const groups: Record<string, Record<string, any[]>> = {};
    
    pendingEvidencesList.forEach(ev => {
      if (!ev) return;
      const f = ev.fase || 'Fase de Formación';
      let act = ev.actividadProyecto || 'Sin Actividad';
      if (/GA(\d+)/i.test(act)) {
        act = act.replace(/GA(\d+)/gi, 'AP$1');
      }
      
      if (!groups[f]) {
        groups[f] = {};
      }
      if (!groups[f][act]) {
        groups[f][act] = [];
      }
      groups[f][act].push(ev);
    });
    
    return groups;
  }, [pendingEvidencesList]);

  const modalEvidencesList = useMemo(() => {
    if (!selectedLearnerForEvidences) return [];
    
    const evs = selectedLearnerForEvidences.evidencias || {};
    return Object.entries(evs).map(([header, value]) => {
      let valStr = '';
      let detail: any = null;
      if (typeof value === 'object' && value !== null) {
        valStr = (value as any).estado;
        detail = value;
      } else {
        valStr = String(value);
      }
      
      if (detail) {
        return {
          nombre: detail.nombre || header,
          codigo: detail.codigo || '',
          actividadProyecto: detail.actividadProyecto || 'Sin Actividad',
          fase: detail.fase || 'Fase de Formación',
          tipo: detail.tipo || 'Evidencia',
          estado: valStr
        };
      } else {
        const norm = header.toLowerCase();
        let tipo = 'Evidencia';
        if (norm.includes('prueba') || norm.includes('evaluacion') || norm.includes('cuestionario')) {
          tipo = 'Prueba de Conocimiento';
        } else if (norm.includes('foro')) {
          tipo = 'Foro';
        }
        
        let codigo = header;
        let act = 'Sin Actividad';
        const matchCode = header.match(/(GA\d+-[A-Za-z0-9_-]+)/i);
        if (matchCode) {
          codigo = matchCode[1].toUpperCase();
          const actMatch = codigo.match(/^(GA\d+)/i);
          if (actMatch) {
            act = actMatch[1].toUpperCase();
          }
        } else {
          const gaMatch = header.match(/(GA\d+)/i);
          if (gaMatch) {
            act = gaMatch[1].toUpperCase();
          }
        }
        
        return {
          nombre: header,
          codigo,
          actividadProyecto: act,
          fase: 'Fase de Formación',
          tipo,
          estado: valStr
        };
      }
    });
  }, [selectedLearnerForEvidences]);

  const filteredModalEvidencesList = useMemo(() => {
    if (modalStateFilter === 'Todas') {
      return modalEvidencesList;
    }
    return modalEvidencesList.filter(ev => ev.estado === modalStateFilter);
  }, [modalEvidencesList, modalStateFilter]);

  // Group the filtered list by Fase and Actividad de Proyecto (using AP nomenclature for grouping / visual)
  const groupedModalEvidences = useMemo(() => {
    const groups: Record<string, Record<string, any[]>> = {};
    
    filteredModalEvidencesList.forEach(ev => {
      if (!ev) return;
      const f = ev.fase || 'Fase de Formación';
      
      let actFormatted = ev.actividadProyecto || 'Sin Actividad';
      if (/GA(\d+)/i.test(actFormatted)) {
        actFormatted = actFormatted.replace(/GA(\d+)/gi, 'AP$1');
      }
      
      if (!groups[f]) {
        groups[f] = {};
      }
      if (!groups[f][actFormatted]) {
        groups[f][actFormatted] = [];
      }
      groups[f][actFormatted].push(ev);
    });
    
    return groups;
  }, [filteredModalEvidencesList]);

  const toggleRowExpand = (id: string) => {
    setExpandedDocIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Helper getters for metrics
  const getDCount = (ap: Aprendiz) => {
    if (!ap || !ap.evidencias) return 0;
    return Object.values(ap.evidencias).filter(v => {
      const valStr = v && typeof v === 'object' ? (v as any).estado : String(v);
      return valStr === 'D';
    }).length;
  };

  const getNoEntregasCount = (ap: Aprendiz) => {
    if (!ap || !ap.evidencias) return 0;
    return Object.values(ap.evidencias).filter(v => {
      const valStr = v && typeof v === 'object' ? (v as any).estado : String(v);
      return valStr === '-';
    }).length;
  };

  const getACount = (ap: Aprendiz) => {
    if (!ap || !ap.evidencias) return 0;
    return Object.values(ap.evidencias).filter(v => {
      const valStr = v && typeof v === 'object' ? (v as any).estado : String(v);
      return valStr === 'A';
    }).length;
  };

  const getTotalCount = (ap: Aprendiz) => {
    if (!ap || !ap.evidencias) return 0;
    return Object.keys(ap.evidencias).length;
  };

  // Filter and sort learners
  const processedAprendices = useMemo(() => {
    let list = [...aprendices].filter(Boolean);

    // 1. Search Query (name or document)
    if (filterSearch.trim()) {
      const q = filterSearch.toLowerCase().trim();
      list = list.filter(
        ap => (ap.nombre || '').toLowerCase().includes(q) || (ap.documento || '').includes(q)
      );
    }

    // 2. Risk Card Filter
    if (filterRiesgo !== 'Todos') {
      list = list.filter(ap => (ap.nivelRiesgo || 'Bajo') === filterRiesgo);
    }

    // 3. Intervention State Dropdown Filter
    if (filterEstado !== 'Todos') {
      list = list.filter(ap => (ap.estadoIntervencion || 'Sin intervención') === filterEstado);
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
        } else if (sortColumn === 'evidencias_a') {
          valA = getACount(a);
          valB = getACount(b);
        } else if (sortColumn === 'total_evidencias') {
          valA = getTotalCount(a);
          valB = getTotalCount(b);
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
              <th onClick={() => handleSort('total_evidencias')} className="py-4 px-2 cursor-pointer hover:bg-slate-100/50 transition-colors text-center w-24 font-black" title="Total de evidencias del aprendiz">
                <div className="flex items-center justify-center gap-1.5">
                  <span>Evid. Totales</span>
                  <ArrowUpDown className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                </div>
              </th>
              <th onClick={() => handleSort('evidencias_a')} className="py-4 px-2 cursor-pointer hover:bg-slate-100/50 transition-colors text-center w-24 font-black" title="Evidencias aprobadas (A)">
                <div className="flex items-center justify-center gap-1.5">
                  <span>Aprobadas (A)</span>
                  <ArrowUpDown className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                </div>
              </th>
              <th onClick={() => handleSort('evidencias_d')} className="py-4 px-2 cursor-pointer hover:bg-slate-100/50 transition-colors text-center w-24 font-black" title="Evidencias desaprobadas (D)">
                <div className="flex items-center justify-center gap-1.5">
                  <span>Desaprobadas (D)</span>
                  <ArrowUpDown className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                </div>
              </th>
              <th onClick={() => handleSort('no_entregadas')} className="py-4 px-2 cursor-pointer hover:bg-slate-100/50 transition-colors text-center w-28 font-black" title="Evidencias pendientes (-)">
                <div className="flex items-center justify-center gap-1.5">
                  <span>Pendientes (-)</span>
                  <ArrowUpDown className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                </div>
              </th>
              <th onClick={() => handleSort('diasSinAcceso')} className="py-4 px-3 cursor-pointer hover:bg-slate-100/50 transition-colors w-32" title="Información de acceso y riesgo de inasistencia">
                <div className="flex items-center gap-1.5">
                  <span>Inasistencia / Acceso</span>
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
              <th className="py-4 px-4 text-center w-32 font-black">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {processedAprendices.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-16 text-center text-slate-400 font-medium italic bg-white">
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
                      <td className="py-3 px-2 text-center text-slate-600 font-semibold">
                        <button
                          type="button"
                          onClick={() => {
                            setModalStateFilter('Todas');
                            setSelectedLearnerForEvidences(ap);
                          }}
                          className="px-2 py-0.5 rounded-md font-bold text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
                        >
                          {getTotalCount(ap)}
                        </button>
                      </td>
                      <td className="py-3 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            setModalStateFilter('A');
                            setSelectedLearnerForEvidences(ap);
                          }}
                          className={`px-2.5 py-0.5 rounded-full font-bold transition-all ${getACount(ap) > 0 ? 'bg-emerald-55 text-[#007832] hover:bg-emerald-100 hover:scale-105 cursor-pointer shadow-3xs' : 'bg-slate-50 text-slate-400 cursor-default'}`}
                        >
                          {getACount(ap)}
                        </button>
                      </td>
                      <td className="py-3 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            setModalStateFilter('D');
                            setSelectedLearnerForEvidences(ap);
                          }}
                          className={`px-2.5 py-0.5 rounded-full font-bold transition-all ${getDCount(ap) > 0 ? 'bg-red-50 text-red-650 hover:bg-red-100 hover:scale-105 cursor-pointer shadow-3xs' : 'bg-slate-50 text-slate-400 cursor-default'}`}
                        >
                          {getDCount(ap)}
                        </button>
                      </td>
                      <td className="py-3 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            setModalStateFilter('-');
                            setSelectedLearnerForEvidences(ap);
                          }}
                          className={`px-2.5 py-0.5 rounded-full font-bold transition-all ${getNoEntregasCount(ap) > 0 ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 hover:scale-105 border border-amber-250 cursor-pointer shadow-3xs' : 'bg-slate-50 text-slate-400'}`}
                          title={getNoEntregasCount(ap) > 0 ? "Ver detalle de evidencias académicas pendientes" : "Sin evidencias pendientes"}
                        >
                          {getNoEntregasCount(ap)}
                        </button>
                      </td>
                      <td className="py-3 px-3">
                        {ap.diasSinAcceso !== null && ap.diasSinAcceso !== undefined ? (
                          <div className="flex flex-col space-y-0.5">
                            <span className={`font-semibold ${ap.diasSinAcceso > 15 ? 'text-red-600' : ap.diasSinAcceso >= 8 ? 'text-amber-650' : 'text-slate-600'}`}>
                              {ap.diasSinAcceso} días sin acceso
                            </span>
                            <span className="text-[10px] text-slate-500 font-medium">
                              Último: {ap.ultimoAcceso || 'Sin datos'}
                            </span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-extrabold w-fit uppercase ${
                              ap.diasSinAcceso > 15 
                                ? 'bg-red-50 text-red-700 border border-red-200' 
                                : ap.diasSinAcceso >= 8 
                                ? 'bg-amber-50 text-amber-700 border border-amber-200' 
                                : 'bg-emerald-50 text-emerald-750 border border-emerald-200'
                            }`}>
                              Riesgo: {ap.diasSinAcceso > 15 ? 'Alto' : ap.diasSinAcceso >= 8 ? 'Medio' : 'Bajo'}
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col space-y-0.5">
                            <span className="text-slate-400 italic text-xs">Sin datos de acceso</span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded font-extrabold w-fit uppercase bg-slate-50 text-slate-400 border border-slate-200">
                              Sin datos
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">{badgeNivel(ap.nivelRiesgo)}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          {badgeEstado(ap.estadoIntervencion)}
                          {(ap.historialIntervenciones || []).length > 0 && (
                            <button
                              type="button"
                              onClick={() => toggleRowExpand(ap.documento)}
                              className="text-[10.5px] text-slate-400 hover:text-sena-600 flex items-center justify-between"
                              title="Ver historial de intervenciones"
                            >
                              ({(ap.historialIntervenciones || []).length})
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

                          {/* Enviar llamado to prompt compliance */}
                          <button
                            type="button"
                            onClick={() => onEnviarLlamado(ap)}
                            className="bg-red-50 hover:bg-red-100 text-red-700 hover:text-red-800 text-xs py-1.5 px-3 rounded-md font-bold transition-all border border-red-100 shrink-0 flex items-center gap-1"
                            title="Enviar correo formal de llamado de atención"
                          >
                            <Mail className="w-3.5 h-3.5" />
                            Enviar llamado
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
                        <td colSpan={11} className="py-3.5 px-6 border-l-4 border-l-slate-400">
                          <div className="space-y-3">
                            <h5 className="font-bold text-slate-800 uppercase tracking-wider text-[10px] flex items-center gap-1">
                              <Activity className="w-3.5 h-3.5 text-sena-600" />
                              Historial de Intervenciones y Compromisos del Aprendiz
                            </h5>
                            
                            {(!ap.historialIntervenciones || ap.historialIntervenciones.length === 0) ? (
                              <p className="text-xs text-slate-400 italic">No hay intervenciones registradas aún. Haz clic en "Intervenir" para registrar la primera.</p>
                            ) : (
                              <div className="relative border-l border-slate-200 pl-4 ml-1 space-y-4">
                                {ap.historialIntervenciones.map(hist => {
                                  const isLlamado = hist.tipoSeguimiento === 'Correo de llamado a ponerse al día' || hist.numeroLlamado !== undefined;
                                  return (
                                    <div key={hist.id} className="relative text-xs">
                                      {/* Timeline dot marker */}
                                      <div className={`absolute -left-[20.5px] top-1.5 w-2.5 h-2.5 rounded-full ${isLlamado ? 'bg-red-500' : 'bg-sena-600'} border border-white`}></div>
                                      
                                      <div className={`p-3 bg-white rounded-lg border ${isLlamado ? 'border-red-100 bg-red-50/5' : 'border-slate-150'} shadow-xs space-y-1`}>
                                        <div className="flex items-center justify-between text-slate-400 font-medium text-[10px]">
                                          <span>Fecha: <strong className="text-slate-600">{hist.fecha}</strong></span>
                                          <span>Instructor: <strong className="text-slate-600">{hist.instructor}</strong></span>
                                          <span className={`${isLlamado ? 'text-red-700 bg-red-50 border-red-100' : 'text-sena-700 bg-sena-50 border-sena-100'} font-bold px-1.5 py-0.2 rounded-sm border`}>
                                            {isLlamado ? `Llamado #${hist.numeroLlamado || 1}` : (hist.estadoIntervencion || hist.nuevo || 'Intervenido')}
                                          </span>
                                        </div>
                                        
                                        {isLlamado ? (
                                          <div className="pt-1 space-y-1">
                                            <p className="text-slate-700 font-bold text-[11.5px] text-red-600">
                                              Llamado #{hist.numeroLlamado || 1} enviado - {hist.evidenciasPendientes || 0} evidencias pendientes
                                            </p>
                                            <div className="text-slate-600 text-[11px] bg-red-50/20 p-2 rounded border border-red-100/10 whitespace-pre-line font-mono max-h-40 overflow-y-auto">
                                              {hist.detalle || hist.observaciones}
                                            </div>
                                          </div>
                                        ) : (
                                          <>
                                            {hist.estrategias && hist.estrategias.length > 0 && (
                                              <div className="pt-1.5">
                                                <span className="font-bold text-slate-600">Estrategias:</span>{' '}
                                                <span className="text-slate-700 text-[11px] bg-slate-50 px-1.5 py-0.5 rounded-sm border border-slate-100">
                                                  {hist.estrategias.join(', ')}
                                                </span>
                                              </div>
                                            )}

                                            {hist.causas && hist.causas.length > 0 && (
                                              <div className="pt-1">
                                                <span className="font-bold text-slate-600">Causas evaluadas:</span>{' '}
                                                <span className="text-amber-800 text-[11.5px]">
                                                  {hist.causas.join(', ')}
                                                </span>
                                              </div>
                                            )}

                                            {(hist.observaciones || hist.detalle) && (
                                              <div className="pt-2 text-slate-600 italic border-t border-slate-100/60 mt-1">
                                                "{hist.observaciones || hist.detalle}"
                                              </div>
                                            )}
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
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

      {/* Modal de Evidencias Pendientes */}
      {selectedLearnerForEvidences && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-300 max-w-2xl w-full max-h-[85vh] flex flex-col text-left">
            {/* Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-[#39A900]/5 rounded-t-xl">
              <div className="space-y-1">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wide">
                  Análisis y Reporte de Evidencias
                </h3>
                <p className="text-xs text-slate-600 font-semibold">
                  {selectedLearnerForEvidences.nombre} ({selectedLearnerForEvidences.tipoDocumento || 'CC'}: {selectedLearnerForEvidences.documento})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLearnerForEvidences(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-100 rounded-lg transition-colors font-bold text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="p-5 overflow-y-auto space-y-6">
              {/* Resumen General Metrics Dashboard */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalStateFilter('Todas')}
                  className={`w-full text-center p-3 rounded-lg border transition-all duration-200 cursor-pointer focus:outline-none ${
                    modalStateFilter === 'Todas'
                      ? 'bg-slate-100 border-slate-400 text-slate-900 ring-2 ring-slate-450/20 scale-[1.03] shadow-md'
                      : 'bg-white border-slate-150 text-slate-750 hover:border-slate-350 hover:bg-slate-50/50 hover:scale-[1.01]'
                  }`}
                >
                  <div className={`text-[10px] uppercase font-black tracking-wider ${modalStateFilter === 'Todas' ? 'text-slate-800' : 'text-slate-500'}`}>Total Evidencias</div>
                  <div className="text-lg font-black tracking-tight mt-1">{getTotalCount(selectedLearnerForEvidences)}</div>
                </button>

                <button
                  type="button"
                  onClick={() => setModalStateFilter('A')}
                  className={`w-full text-center p-3 rounded-lg border transition-all duration-200 cursor-pointer focus:outline-none ${
                    modalStateFilter === 'A'
                      ? 'bg-emerald-50 border-emerald-500 text-[#007832] ring-2 ring-emerald-500/20 scale-[1.03] shadow-md'
                      : 'bg-white border-slate-150 text-slate-750 hover:border-emerald-300 hover:bg-emerald-50/10 hover:scale-[1.01]'
                  }`}
                >
                  <div className={`text-[10px] uppercase font-black tracking-wider ${modalStateFilter === 'A' ? 'text-[#007832]' : 'text-slate-500'}`}>Aprobadas (A)</div>
                  <div className="text-lg font-black tracking-tight mt-1">{getACount(selectedLearnerForEvidences)}</div>
                </button>

                <button
                  type="button"
                  onClick={() => setModalStateFilter('D')}
                  className={`w-full text-center p-3 rounded-lg border transition-all duration-200 cursor-pointer focus:outline-none ${
                    modalStateFilter === 'D'
                      ? 'bg-rose-50 border-rose-500 text-rose-800 ring-2 ring-rose-500/20 scale-[1.03] shadow-md'
                      : 'bg-white border-slate-150 text-slate-750 hover:border-rose-300 hover:bg-rose-50/10 hover:scale-[1.01]'
                  }`}
                >
                  <div className={`text-[10px] uppercase font-black tracking-wider ${modalStateFilter === 'D' ? 'text-rose-750' : 'text-slate-500'}`}>Desaprobadas (D)</div>
                  <div className="text-lg font-black tracking-tight mt-1">{getDCount(selectedLearnerForEvidences)}</div>
                </button>

                <button
                  type="button"
                  onClick={() => setModalStateFilter('-')}
                  className={`w-full text-center p-3 rounded-lg border transition-all duration-200 cursor-pointer focus:outline-none ${
                    modalStateFilter === '-'
                      ? 'bg-amber-50 border-amber-500 text-amber-800 ring-2 ring-amber-500/20 scale-[1.03] shadow-md'
                      : 'bg-white border-slate-150 text-slate-750 hover:border-amber-300 hover:bg-amber-50/10 hover:scale-[1.01]'
                  }`}
                >
                  <div className={`text-[10px] uppercase font-black tracking-wider ${modalStateFilter === '-' ? 'text-amber-800' : 'text-slate-500'}`}>Pendientes (-)</div>
                  <div className="text-lg font-black tracking-tight mt-1">{getNoEntregasCount(selectedLearnerForEvidences)}</div>
                </button>
              </div>

              {/* Filtros por Estado */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4" id="modal-filter-segment">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <span>Filtrar evidencias de este aprendiz:</span>
                  <span className={`px-2 py-0.5 rounded-full font-black text-[9.5px] tracking-wide ${
                    modalStateFilter === 'Todas' ? 'bg-slate-100 text-slate-700' :
                    modalStateFilter === 'A' ? 'bg-emerald-50 text-[#007832]' :
                    modalStateFilter === 'D' ? 'bg-rose-50 text-rose-700' :
                    'bg-amber-50 text-amber-700'
                  }`}>
                    {modalStateFilter === 'Todas' ? 'Todas las evidencias' :
                     modalStateFilter === 'A' ? 'Solo Aprobadas (A)' :
                     modalStateFilter === 'D' ? 'Solo Desaprobadas (D)' :
                     'Solo Pendientes (-)'}
                  </span>
                </div>
              </div>

              {filteredModalEvidencesList.length === 0 ? (
                <div className="py-12 text-center text-slate-400 font-medium italic">
                  No se encontraron evidencias de este aprendiz con el estado seleccionado.
                </div>
              ) : (
                Object.entries(groupedModalEvidences).map(([fase, actividades]) => {
                  // Phase Totalization based on the unfiltered raw set to be always mathematically correct
                  const allPhaseEvsOfLearner = modalEvidencesList.filter(ev => ev.fase === fase);
                  const totalEvFase = allPhaseEvsOfLearner.length;
                  const aprobadasFase = allPhaseEvsOfLearner.filter(ev => ev.estado === 'A').length;
                  const desaprobadasFase = allPhaseEvsOfLearner.filter(ev => ev.estado === 'D').length;
                  const pendientesFase = allPhaseEvsOfLearner.filter(ev => ev.estado === '-').length;

                  return (
                    <div key={fase} className="space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-100 pb-2">
                        <h4 className="text-xs font-black text-[#007832] flex items-center gap-1.5 uppercase tracking-wide">
                          <span className="w-1.5 h-3.5 bg-[#39A900] rounded-xs"></span>
                          {fase}
                        </h4>
                        <div className="flex flex-wrap gap-1.5 text-[9px] font-bold">
                          <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md border border-slate-200">
                            Evidencias: {totalEvFase}
                          </span>
                          <span className="bg-emerald-50 text-[#007832] px-2 py-0.5 rounded-md border border-emerald-200">
                            Aprobadas: {aprobadasFase}
                          </span>
                          <span className="bg-rose-50 text-rose-700 px-2 py-0.5 rounded-md border border-rose-200">
                            Desaprobadas: {desaprobadasFase}
                          </span>
                          <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-md border border-amber-200">
                            Pendientes: {pendientesFase}
                          </span>
                        </div>
                      </div>
                      
                      <div className="space-y-4 pl-3">
                        {Object.entries(actividades).map(([actividad, evidencias]) => (
                          <div key={actividad} className="space-y-2">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-100/70 py-1.5 px-3 rounded-lg border border-slate-200">
                              <h5 className="text-[10.5px] font-bold text-slate-700">
                                Actividad de Proyecto: {actividad}
                              </h5>
                              <span className="text-[9.5px] font-black uppercase text-slate-500 bg-white px-2 py-0.2 rounded border border-slate-200">
                                Mostrando: {evidencias.length}
                              </span>
                            </div>
                            
                            <div className="space-y-1.5">
                              {evidencias.map((ev: any, idx) => (
                                <div
                                  key={idx}
                                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 bg-slate-50 border border-slate-150 rounded-lg hover:border-slate-250 hover:bg-slate-100/50 transition-colors"
                                >
                                  <div className="space-y-0.5 max-w-md">
                                    <div className="text-xs font-semibold text-slate-800 leading-tight">
                                      {formatEvidenciaNombre(ev.nombre)}
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-mono">
                                      Código: {ev.codigo || 'S/C'}
                                    </div>
                                  </div>
                                  
                                  <div className="flex items-center gap-2 self-start sm:self-center">
                                    <span className="text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded bg-amber-100 text-amber-850 border border-amber-200">
                                      {ev.tipo}
                                    </span>
                                    {ev.estado === 'A' ? (
                                      <span className="text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-150">
                                        Aprobada (A)
                                      </span>
                                    ) : ev.estado === 'D' ? (
                                      <span className="text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-150">
                                        Desaprobada (D)
                                      </span>
                                    ) : (
                                      <span className="text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-150">
                                        Pendiente (-)
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end rounded-b-xl">
              <button
                type="button"
                onClick={() => setSelectedLearnerForEvidences(null)}
                className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold py-2 px-4 rounded-lg transition-colors border border-slate-900 cursor-pointer"
              >
                Cerrar Detalle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
