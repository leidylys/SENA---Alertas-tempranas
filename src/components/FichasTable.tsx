import React, { useState, useEffect } from 'react';
import { 
  Table, 
  ArrowUpDown, 
  Trash2, 
  Edit, 
  Eye, 
  X, 
  AlertTriangle, 
  CheckCircle, 
  AlertCircle, 
  ChevronLeft, 
  ChevronRight, 
  Filter, 
  Search, 
  SlidersHorizontal,
  Calendar,
  Users,
  RefreshCw,
  Clock,
  User,
  ShieldAlert,
  Sliders
} from 'lucide-react';

interface Ficha {
  id: number;
  codigoFicha: string;
  fechaInicio: string;
  fechaFin: string;
  programaId: number;
  programaFormacion: string;
  nivel: string;
  rolEnFicha: string;
  instructor: string;
  assignments: any[];
  hasActiveLider?: boolean;
  missingTransversals?: string[];
  aprendicesCargados?: boolean;
  totalAprendices?: number;
  countAlto?: number;
  countMedio?: number;
  countBajo?: number;
}

interface FichasTableProps {
  savedFichas: Ficha[];
  onSelectFicha: (codigoFicha: string) => void;
  onSuccessSync: () => void;
  authToken: string;
  isUserAdmin: boolean;
}

export default function FichasTable({
  savedFichas = [],
  onSelectFicha,
  onSuccessSync,
  authToken,
  isUserAdmin
}: FichasTableProps) {
  // Filters & State
  const [searchQuery, setSearchQuery] = useState('');
  const [instructorSearch, setInstructorSearch] = useState('');
  const [estadoFilter, setEstadoFilter] = useState<'todas' | 'activas' | 'futuras' | 'finalizadas'>('todas');
  const [programaFilter, setProgramaFilter] = useState('todos');
  
  // Sorting State
  const [sortColumn, setSortColumn] = useState<keyof Ficha | 'estado' | 'riesgo'>('codigoFicha');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Selected Ficha for Drawer / Modal Detail
  const [selectedFichaDetail, setSelectedFichaDetail] = useState<Ficha | null>(null);

  // Editing State
  const [editingFicha, setEditingFicha] = useState<Ficha | null>(null);
  const [editingCodigo, setEditingCodigo] = useState('');
  const [editingFechaInicio, setEditingFechaInicio] = useState('');
  const [editingFechaFin, setEditingFechaFin] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Deleting State
  const [deletingFichaId, setDeletingFichaId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Helper calculation for Date status
  const getFichaDateStatus = (inicio?: string, fin?: string) => {
    if (!inicio || !fin) return 'activas';
    const cleanInicio = inicio.substring(0, 10);
    const cleanFin = fin.substring(0, 10);
    const todayStr = new Date().toISOString().substring(0, 10);

    if (todayStr < cleanInicio) {
      return 'futuras';
    } else if (todayStr > cleanFin) {
      return 'finalizadas';
    } else {
      return 'activas';
    }
  };

  // Compile programs list for filtering dynamically
  const uniquePrograms = Array.from(
    new Set(savedFichas.map(f => f.programaFormacion))
  ).filter(p => !!p).sort();

  // Handle Sort Toggle
  const handleSort = (column: keyof Ficha | 'estado' | 'riesgo') => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  // Execute Edit Ficha (PUT)
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFicha || !authToken) return;
    setIsSavingEdit(true);
    setEditError(null);

    try {
      const res = await fetch(`/api/fichas/${editingFicha.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          codigoFicha: editingCodigo,
          fechaInicio: editingFechaInicio,
          fechaFin: editingFechaFin
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Error al actualizar ficha');
      }

      setEditingFicha(null);
      onSuccessSync(); // Reload the fichas list of parent
    } catch (err: any) {
      console.error(err);
      setEditError(err.message || 'Error de conexión');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Execute Delete Ficha (DELETE)
  const handleDeleteFicha = async (id: number) => {
    if (!authToken) return;
    setIsDeleting(true);

    try {
      const res = await fetch(`/api/fichas/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Error al eliminar la ficha');
      }

      setDeletingFichaId(null);
      onSuccessSync(); // Reload the list of Parent
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Error de conexión');
    } finally {
      setIsDeleting(false);
    }
  };

  // Safe redirect or scroll helper to administration panel for reassignments
  const handleManageInstructors = (f: Ficha) => {
    setSelectedFichaDetail(null);
    const adminPanel = document.getElementById('admin-centre-panel');
    if (adminPanel) {
      adminPanel.scrollIntoView({ behavior: 'smooth' });
    } else {
      alert(`Para gestionar instructores de la ficha ${f.codigoFicha}, diríjase a la sección de administración de instructores al final de la página.`);
    }
  };

  // Reset page when search or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, instructorSearch, estadoFilter, programaFilter]);

  // Main filtration algorithm
  const filteredFichas = savedFichas.filter(ficha => {
    // 1. Search Query (By Code or Program Name)
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch = !q || 
      (ficha.codigoFicha && ficha.codigoFicha.toLowerCase().includes(q)) ||
      (ficha.programaFormacion && ficha.programaFormacion.toLowerCase().includes(q)) ||
      (ficha.nivel && ficha.nivel.toLowerCase().includes(q));

    if (!matchesSearch) return false;

    // 2. Instructor Search Query
    const instQ = instructorSearch.toLowerCase().trim();
    const matchesInstructor = !instQ || (
      ficha.instructor && ficha.instructor.toLowerCase().includes(instQ)
    ) || (
      ficha.assignments && ficha.assignments.some(a => 
        (a.nombre || '').toLowerCase().includes(instQ) || 
        (a.correo || '').toLowerCase().includes(instQ)
      )
    );

    if (!matchesInstructor) return false;

    // 3. Tab Filter (Vigencia/Estado)
    if (estadoFilter !== 'todas') {
      const status = getFichaDateStatus(ficha.fechaInicio, ficha.fechaFin);
      if (status !== estadoFilter) return false;
    }

    // 4. Program Filter
    if (programaFilter !== 'todos') {
      if (ficha.programaFormacion !== programaFilter) return false;
    }

    return true;
  });

  // Sorting logic
  const sortedFichas = [...filteredFichas].sort((a, b) => {
    let aVal: any = '';
    let bVal: any = '';

    if (sortColumn === 'estado') {
      aVal = getFichaDateStatus(a.fechaInicio, a.fechaFin);
      bVal = getFichaDateStatus(b.fechaInicio, b.fechaFin);
    } else if (sortColumn === 'riesgo') {
      // Sort by number of high risk learners
      aVal = a.countAlto || 0;
      bVal = b.countAlto || 0;
    } else {
      aVal = a[sortColumn as keyof Ficha] ?? '';
      bVal = b[sortColumn as keyof Ficha] ?? '';
    }

    if (typeof aVal === 'string') {
      aVal = aVal.toLowerCase();
      bVal = bVal.toLowerCase();
    }

    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  // Pagination bounds
  const totalRecords = sortedFichas.length;
  const totalPages = Math.ceil(totalRecords / pageSize) || 1;
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedFichas = sortedFichas.slice(startIndex, startIndex + pageSize);

  // Get active leader name helper
  const getLeaderName = (ficha: Ficha) => {
    if (!ficha.assignments || !Array.isArray(ficha.assignments)) return 'Sin asignación';
    const leader = ficha.assignments.find(a => 
      (a.rol?.toLowerCase().includes('lider') || a.rol?.toLowerCase().includes('líder')) && 
      a.estado === 'Activo'
    );
    return leader ? leader.nombre : null;
  };

  return (
    <div className="bg-white border border-slate-200.5 rounded-xl shadow-4xs space-y-4 p-5" id="fichas-advanced-table-module">
      
      {/* MODULE HEADER */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-105 pb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
            <Sliders className="w-4 h-4 text-[#39A900]" />
            <span>Panel de Gestión y Control de Fichas ({savedFichas.length})</span>
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Filtre, ordene y gestione el estado, vigencia e indicadores críticos de las cohortes académicas registradas.
          </p>
        </div>

        {/* View mode indicator */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-100 font-extrabold flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-[#39A900] rounded-full animate-pulse"></span>
            <span>Vista Tabla Administrativa Activa</span>
          </span>
        </div>
      </div>

      {/* SEARCH AND ADVANCED FILTERS BLOCK */}
      <div className="bg-slate-50/70 border border-slate-200/60 p-4 rounded-lg grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
        
        {/* Ficha query */}
        <div className="space-y-1">
          <label className="text-[10.5px] text-slate-500 font-bold uppercase tracking-wider block">Código o Programa</label>
          <div className="relative">
            <input 
              type="text"
              placeholder="Buscar por ficha, programa..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full text-xs pl-8 pr-2.5 py-1.5 border border-slate-250 rounded bg-white font-medium text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          </div>
        </div>

        {/* Instructor query */}
        <div className="space-y-1">
          <label className="text-[10.5px] text-slate-500 font-bold uppercase tracking-wider block">Instructor de Apoyo / Líder</label>
          <div className="relative">
            <input 
              type="text"
              placeholder="Buscar por nombre o correo..."
              value={instructorSearch}
              onChange={e => setInstructorSearch(e.target.value)}
              className="w-full text-xs pl-8 pr-2.5 py-1.5 border border-slate-250 rounded bg-white font-medium text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <User className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          </div>
        </div>

        {/* Estado/Vigencia Tab select */}
        <div className="space-y-1">
          <label className="text-[10.5px] text-slate-500 font-bold uppercase tracking-wider block">Vigencia / Estado</label>
          <div className="relative">
            <select
              value={estadoFilter}
              onChange={e => setEstadoFilter(e.target.value as any)}
              className="w-full text-xs pl-8 pr-2.5 py-1.5 border border-slate-250 rounded bg-white font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 appearance-none cursor-pointer"
            >
              <option value="todas">Todas las vigencias</option>
              <option value="activas">🟢 Vigentes (Activas)</option>
              <option value="futuras">📅 Futuras</option>
              <option value="finalizadas">🔴 Finalizadas (Terminadas)</option>
            </select>
            <Clock className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          </div>
        </div>

        {/* Programa Formacion Filter select */}
        <div className="space-y-1">
          <label className="text-[10.5px] text-slate-500 font-bold uppercase tracking-wider block">Programa de Formación</label>
          <div className="relative">
            <select
              value={programaFilter}
              onChange={e => setProgramaFilter(e.target.value)}
              className="w-full text-xs pl-8 pr-8 py-1.5 border border-slate-250 rounded bg-white font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 appearance-none cursor-pointer truncate"
            >
              <option value="todos">Todos los programas ({uniquePrograms.length})</option>
              {uniquePrograms.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <Filter className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          </div>
        </div>

      </div>

      {/* RESULTS COUNT SUMMARY */}
      <div className="flex items-center justify-between text-[11px] text-slate-400 flex-wrap gap-2">
        <div className="flex items-center gap-1">
          <span>Mostrando registros <strong>{totalRecords > 0 ? startIndex + 1 : 0}</strong> a <strong>{Math.min(startIndex + pageSize, totalRecords)}</strong> de <strong>{totalRecords}</strong> fichas encontradas</span>
          {savedFichas.length !== totalRecords && (
            <span className="text-slate-250 bg-slate-100 px-1.5 py-0.5 rounded-sm text-[9.5px] font-semibold text-slate-500 ml-1">
              Filtro Activo
            </span>
          )}
        </div>

        {/* Page size settings */}
        <div className="flex items-center gap-2">
          <span>Registros por página:</span>
          <select 
            value={pageSize} 
            onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
            className="border border-slate-200.5 px-2 py-0.5 rounded text-[10.5px] font-black focus:outline-none focus:border-emerald-500"
          >
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </div>
      </div>

      {/* TABLE ELEMENT (md and larger) / MOBILE CARD LIST (xs to sm) */}
      {totalRecords === 0 ? (
        <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-200 p-6 space-y-3">
          <p className="text-xs text-slate-400 font-bold">Ninguna cohorte o ficha coincide con la búsqueda o filtros aplicados.</p>
          <button 
            type="button"
            onClick={() => {
              setSearchQuery('');
              setInstructorSearch('');
              setEstadoFilter('todas');
              setProgramaFilter('todos');
            }}
            className="text-xs font-extrabold bg-[#39A900]/10 hover:bg-[#39A900]/20 text-[#39A900] px-3.5 py-2 rounded-lg border border-[#39A900]/10 transition-colors cursor-pointer"
          >
            Limpiar filtros de búsqueda
          </button>
        </div>
      ) : (
        <>
          {/* DESKTOP ADVANCED TABLE */}
          <div className="hidden md:block overflow-x-auto border border-slate-150 rounded-xl">
            <table className="w-full text-left text-xs text-slate-700 min-w-[1000px]">
              
              {/* Table Th Headers */}
              <thead className="bg-slate-100/80 border-b border-slate-200 text-[10.5px] text-slate-500 font-bold uppercase tracking-wider select-none">
                <tr>
                  <th className="p-3 w-[110px]">
                    <button 
                      type="button" 
                      onClick={() => handleSort('codigoFicha')}
                      className="flex items-center gap-1 hover:text-slate-800 transition-colors font-extrabold"
                    >
                      <span>Ficha (Código)</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </button>
                  </th>
                  <th className="p-3">
                    <button 
                      type="button" 
                      onClick={() => handleSort('programaFormacion')}
                      className="flex items-center gap-1 hover:text-slate-800 transition-colors font-extrabold"
                    >
                      <span>Programa</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </button>
                  </th>
                  <th className="p-3 w-[150px]">
                    <span>Instructor Líder</span>
                  </th>
                  <th className="p-3 w-[115px] text-center">
                    <button 
                      type="button" 
                      onClick={() => handleSort('estado')}
                      className="flex items-center gap-1 hover:text-slate-800 transition-colors font-extrabold mx-auto"
                    >
                      <span>Vigencia</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </button>
                  </th>
                  <th className="p-3 w-[120px] text-center">
                    <button 
                      type="button" 
                      onClick={() => handleSort('totalAprendices')}
                      className="flex items-center gap-1 hover:text-slate-800 transition-colors font-extrabold mx-auto"
                    >
                      <span>Aprendices</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </button>
                  </th>
                  <th className="p-3 w-[180px] text-center">
                    <span>Cronograma</span>
                  </th>
                  <th className="p-3 w-[105px] text-center">
                    <button 
                      type="button" 
                      onClick={() => handleSort('riesgo')}
                      className="flex items-center gap-1 hover:text-slate-800 transition-colors font-extrabold mx-auto"
                    >
                      <span>Riesgo / Alertas</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </button>
                  </th>
                  <th className="p-3 w-[140px] text-center font-extrabold">Acciones</th>
                </tr>
              </thead>

              {/* Table Body rows */}
              <tbody className="divide-y divide-slate-100 font-medium">
                {paginatedFichas.map(ficha => {
                  const vigencia = getFichaDateStatus(ficha.fechaInicio, ficha.fechaFin);
                  const leader = getLeaderName(ficha);
                  
                  // Evaluate indicators
                  const hasNoLeader = !leader;
                  const hasAlerts = (ficha.missingTransversals && ficha.missingTransversals.length > 0) || hasNoLeader;
                  const hasLearnerDanger = (ficha.countAlto ?? 0) > 0 || (ficha.countMedio ?? 0) > 0;
                  const isIncomplete = !ficha.aprendicesCargados || !ficha.fechaInicio || !ficha.fechaFin;

                  return (
                    <tr 
                      key={ficha.id}
                      className="hover:bg-slate-50/70 transition-colors group border-l-2 border-l-transparent hover:border-l-[#39A900] cursor-pointer"
                      onClick={() => setSelectedFichaDetail(ficha)}
                    >
                      {/* Código Ficha */}
                      <td className="p-3 font-mono text-[11px] text-slate-900 font-extrabold">
                        <span className="bg-slate-100 px-2 py-1 rounded inline-block group-hover:bg-[#39A900]/10 group-hover:text-[#39A900] transition-colors">
                          {ficha.codigoFicha}
                        </span>
                      </td>

                      {/* Programa Formación */}
                      <td className="p-3 max-w-[280px]">
                        <div className="font-extrabold text-[#39A900] leading-snug line-clamp-1" title={ficha.programaFormacion}>
                          {ficha.programaFormacion}
                        </div>
                        <div className="text-[10px] text-slate-650 flex items-center gap-1 mt-0.5 font-semibold">
                          <span>{ficha.nivel || 'Tecnólogo'}</span>
                          <span>•</span>
                          <span className="capitalize">{ficha.rolEnFicha || 'Participante'}</span>
                        </div>
                      </td>

                      {/* Instructor Líder */}
                      <td className="p-3">
                        {leader ? (
                          <span className="font-bold text-slate-700 flex items-center gap-1" title={ficha.instructor}>
                            <span>👤 {leader.split(' ')[0]}</span>
                          </span>
                        ) : (
                          <span className="text-[10px] font-extrabold text-amber-600 bg-amber-50 md:border border-amber-200.2 px-1.5 py-0.5 rounded flex items-center gap-1 w-max">
                            <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                            <span>Sin instructor líder</span>
                          </span>
                        )}
                      </td>

                      {/* Estado/Vigencia */}
                      <td className="p-3 text-center">
                        <span className={`text-[10px] uppercase font-black px-2 py-0.5 rounded-sm inline-block ${
                          vigencia === 'activas' 
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-150' 
                            : vigencia === 'futuras'
                            ? 'bg-blue-50 text-blue-800 border border-blue-150'
                            : 'bg-slate-105 text-slate-650'
                        }`}>
                          {vigencia === 'activas' ? 'Vigente' : vigencia === 'futuras' ? 'Futura' : 'Terminada'}
                        </span>
                      </td>

                      {/* Aprendices counts */}
                      <td className="p-3 text-center">
                        {ficha.aprendicesCargados ? (
                          <div className="inline-flex flex-col items-center justify-center">
                            <span className="font-bold text-slate-800 text-[11.5px]">{ficha.totalAprendices || 0}</span>
                            <span className="text-[9.5px] text-slate-650 bg-emerald-50 px-1 hover:accent-emerald-700 rounded block font-semibold mt-0.5">
                              🎓 Cargados
                            </span>
                          </div>
                        ) : (
                          <div className="inline-flex flex-col items-center justify-center">
                            <span className="font-extrabold text-amber-700 text-[11px]">⚠️ 0</span>
                            <span className="text-[8.5px] text-amber-600 bg-amber-50 px-1 rounded block font-bold mt-0.5 uppercase tracking-wide">
                              Incompleto
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Cronograma (Dates) */}
                      <td className="p-3 text-center text-[10.5px] text-slate-650 leading-loose">
                        <div className="flex items-center justify-center gap-1 text-slate-500">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span className="font-semibold font-mono text-[9.5px] bg-slate-50 px-1 rounded border border-slate-101 inline-block text-slate-600">
                            {ficha.fechaInicio?.substring(0, 10) || 'N/A'}
                          </span>
                          <span className="text-[9px]">/</span>
                          <span className="font-semibold font-mono text-[9.5px] bg-slate-50 px-1 rounded border border-slate-101 inline-block text-slate-600">
                            {ficha.fechaFin?.substring(0, 10) || 'N/A'}
                          </span>
                        </div>
                      </td>

                      {/* RIESGOS / ALERT INDICATORS */}
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1 font-mono">
                          
                          {/* Risk Badges dots if any risk */}
                          {ficha.aprendicesCargados && (ficha.totalAprendices ?? 0) > 0 ? (
                            <div className="flex items-center gap-1 text-[9.5px]" onClick={(e) => e.stopPropagation()}>
                              {(ficha.countAlto ?? 0) > 0 && (
                                <span className="bg-red-50 text-red-700 font-extrabold px-1 rounded border border-red-105" title={`${ficha.countAlto} Aprendices en Riesgo Alto (Rojo)`}>
                                  🔴 {ficha.countAlto}
                                </span>
                              )}
                              {(ficha.countMedio ?? 0) > 0 && (
                                <span className="bg-amber-50 text-amber-700 font-extrabold px-1 rounded border border-amber-105" title={`${ficha.countMedio} Aprendices en Riesgo Medio (Naranja)`}>
                                  🟡 {ficha.countMedio}
                                </span>
                              )}
                              {!(ficha.countAlto) && !(ficha.countMedio) ? (
                                <span className="bg-emerald-50 text-emerald-800 font-bold px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider" title="Ninguno en riesgo">
                                  ✅ Estable
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-[9.5px] font-extrabold text-amber-600 bg-amber-50 border border-amber-101 px-1.5 rounded flex items-center gap-0.5">
                              ⚠️ Sin Datos
                            </span>
                          )}

                          {/* Critical Alerts summary indicators */}
                          {hasAlerts && (
                            <span className="text-red-500 shrink-0 select-none ml-1 animate-ping" title="Sanción o alertas críticas de planeación pendientes o transversalidad incompleta!">
                              🔔
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Acciones */}
                      <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          
                          {/* Ver Detalle / Entrar */}
                          <button
                            type="button"
                            onClick={() => onSelectFicha(ficha.codigoFicha)}
                            className="p-1 text-slate-500 hover:text-[#39A900] hover:bg-slate-100 rounded transition-colors cursor-pointer"
                            title="Ingresar al Cuadro de Control y Alertas"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* Editar info (Admin only) */}
                          {isUserAdmin && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingFicha(ficha);
                                setEditingCodigo(ficha.codigoFicha);
                                setEditingFechaInicio(ficha.fechaInicio?.substring(0, 10) || '');
                                setEditingFechaFin(ficha.fechaFin?.substring(0, 10) || '');
                                setEditError(null);
                              }}
                              className="p-1 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                              title="Editar Ficha Básica"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                          )}

                          {/* Gestionar instructores asignaciones */}
                          <button
                            type="button"
                            onClick={() => handleManageInstructors(ficha)}
                            className="p-1 text-slate-500 hover:text-amber-600 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                            title="Desplazar a reasignar instructores"
                          >
                            <Users className="w-4 h-4" />
                          </button>

                          {/* Eliminar (Admin only) */}
                          {isUserAdmin && (
                            <button
                              type="button"
                              onClick={() => setDeletingFichaId(ficha.id)}
                              className="p-1 text-slate-500 hover:text-rose-600 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                              title="Eliminar Ficha permanentemente"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}

                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

            </table>
          </div>

          {/* MOBILE RECORD-ORIENTED CARDS LIST */}
          <div className="block md:hidden space-y-3.5">
            {paginatedFichas.map(ficha => {
              const vigencia = getFichaDateStatus(ficha.fechaInicio, ficha.fechaFin);
              const leader = getLeaderName(ficha);
              const hasNoLeader = !leader;
              const hasAlerts = (ficha.missingTransversals && ficha.missingTransversals.length > 0) || hasNoLeader;

              return (
                <div 
                  key={ficha.id}
                  onClick={() => setSelectedFichaDetail(ficha)}
                  className="bg-slate-50/50 p-4 rounded-xl border border-slate-200.5 hover:border-[#39A900] cursor-pointer relative space-y-2.5 shadow-4xs"
                >
                  {/* Left vigencia stripe */}
                  <div className={`absolute top-0 bottom-0 left-0 w-1 rounded-l-xl ${
                    vigencia === 'activas' ? 'bg-[#39A900]' : vigencia === 'futuras' ? 'bg-blue-500' : 'bg-slate-400'
                  }`}></div>

                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] font-black bg-slate-100 px-2.5 py-0.5 rounded text-slate-500">
                      CÓD: {ficha.codigoFicha}
                    </span>
                    <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${
                      vigencia === 'activas' 
                        ? 'bg-emerald-50 text-emerald-800' 
                        : vigencia === 'futuras'
                        ? 'bg-blue-50 text-blue-800'
                        : 'bg-slate-105 text-slate-650'
                    }`}>
                      {vigencia === 'activas' ? 'Vigente' : vigencia === 'futuras' ? 'Futura' : 'Terminada'}
                    </span>
                  </div>

                  <div>
                    <h4 className="text-xs font-black text-slate-800 leading-snug">{ficha.programaFormacion}</h4>
                    <p className="text-[10px] text-slate-450 mt-0.5">{ficha.nivel || 'Tecnólogo'} • {ficha.rolEnFicha || 'Administrativo'}</p>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1.5 border-t border-dashed border-slate-200 text-[11.5px] text-slate-500">
                    <div className="flex items-center gap-1">
                      <span>👤 Líder: <strong>{leader ? leader.split(' ')[0] : 'Sin asignar'}</strong></span>
                      {hasNoLeader && (
                        <span className="text-amber-500 text-[10px]" title="Requiere tutor corporativo o responsable">⚠️</span>
                      )}
                    </div>
                    <span>Alumnos: <strong>{ficha.totalAprendices || 0}</strong></span>
                  </div>

                  {/* Risks counts indicators */}
                  {ficha.aprendicesCargados && (ficha.totalAprendices ?? 0) > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 text-[9px] font-bold">
                      <span className="text-slate-450">Alertas:</span>
                      {(ficha.countAlto ?? 0) > 0 && <span className="bg-red-50 text-red-600 border border-red-105 px-1.5 py-0.5 rounded font-black">Alto: {ficha.countAlto}</span>}
                      {(ficha.countMedio ?? 0) > 0 && <span className="bg-amber-50 text-amber-600 border border-amber-105 px-1.5 py-0.5 rounded font-black">Medio: {ficha.countMedio}</span>}
                      {!(ficha.countAlto) && !(ficha.countMedio) && <span className="bg-emerald-50 text-emerald-800 px-1.5 py-0.5 rounded">Stable ✅</span>}
                      {hasAlerts && <span className="bg-rose-50 text-rose-700 font-extrabold px-1 rounded border border-rose-105">Estructura incompleta 🚨</span>}
                    </div>
                  )}

                  {/* Actions row */}
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100" onClick={e => e.stopPropagation()}>
                    <button 
                      type="button" 
                      onClick={() => onSelectFicha(ficha.codigoFicha)} 
                      className="px-2.5 py-1 bg-[#39A900] text-white text-[10px] font-black rounded-md flex items-center gap-1 shadow-4xs"
                    >
                      <Eye className="w-3 h-3" />
                      <span>Ingresar</span>
                    </button>
                    {isUserAdmin && (
                      <button 
                        type="button" 
                        onClick={() => {
                          setEditingFicha(ficha);
                          setEditingCodigo(ficha.codigoFicha);
                          setEditingFechaInicio(ficha.fechaInicio?.substring(0, 10) || '');
                          setEditingFechaFin(ficha.fechaFin?.substring(0, 10) || '');
                          setEditError(null);
                        }} 
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-650 text-[10px] font-black rounded-md flex items-center gap-1"
                      >
                        <Edit className="w-3 h-3" />
                        <span>Editar</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* PAGINATION INTERACTION PANEL */}
          <div className="border-t border-slate-105 pt-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 font-bold select-none">
            <div>
              <span>Página <strong>{currentPage}</strong> de <strong>{totalPages}</strong></span>
            </div>

            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded border border-slate-201 text-[11px]">
              
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(1)}
                className="px-2 py-1 rounded hover:bg-white text-slate-600 transition-all font-black disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                title="Primera página"
              >
                &lt;&lt;
              </button>

              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                className="px-2.5 py-1 rounded hover:bg-white text-slate-600 transition-all font-black disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed flex items-center gap-1"
              >
                <ChevronLeft className="w-3 h-3" />
                <span>Ant</span>
              </button>

              {/* Page numbers around current */}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pNum = currentPage;
                if (currentPage < 3) pNum = i + 1;
                else if (currentPage > totalPages - 2) pNum = totalPages - 4 + i;
                else pNum = currentPage - 2 + i;

                if (pNum < 1 || pNum > totalPages) return null;

                return (
                  <button
                    key={pNum}
                    type="button"
                    onClick={() => setCurrentPage(pNum)}
                    className={`px-3 py-1 rounded font-extrabold transition-all cursor-pointer ${
                      currentPage === pNum ? 'bg-white text-emerald-700 shadow-4xs border border-slate-200.5' : 'text-slate-500 hover:text-slate-800 hover:bg-white/40'
                    }`}
                  >
                    {pNum}
                  </button>
                );
              })}

              <button
                type="button"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                className="px-2.5 py-1 rounded hover:bg-white text-slate-600 transition-all font-black disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed flex items-center gap-1"
              >
                <span>Sig</span>
                <ChevronRight className="w-3 h-3" />
              </button>

              <button
                type="button"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(totalPages)}
                className="px-2 py-1 rounded hover:bg-white text-slate-600 transition-all font-black disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                title="Última página"
              >
                &gt;&gt;
              </button>

            </div>
          </div>
        </>
      )}

      {/* ========================================================
          DRAWER PANEL: VIEW DETAILED RECORD INFO (Row Click)
          ======================================================== */}
      {selectedFichaDetail && (() => {
        const f = selectedFichaDetail;
        const vigencia = getFichaDateStatus(f.fechaInicio, f.fechaFin);
        const leader = getLeaderName(f);
        const hasNoLeader = !leader;
        const hasAlerts = (f.missingTransversals && f.missingTransversals.length > 0) || hasNoLeader;
        const isIncomplete = !f.aprendicesCargados || !f.fechaInicio || !f.fechaFin;

        return (
          <div className="fixed inset-0 z-50 overflow-hidden flex justify-end animate-fade-in" style={{ backgroundColor: 'rgba(15, 23, 42, 0.4)' }} onClick={() => setSelectedFichaDetail(null)}>
            
            {/* Slide over layout container */}
            <div 
              className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col justify-between overflow-y-auto transform transition-transform duration-300 animate-slide-in p-6 space-y-6"
              onClick={e => e.stopPropagation()}
            >
              
              {/* Drawer Top Header area */}
              <div className="flex items-center justify-between border-b border-slate-105 pb-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-black bg-slate-100 text-[#39A900] px-2.5 py-0.5 rounded-full">
                      CÓDIGO: {f.codigoFicha}
                    </span>
                    <span className={`text-[10px] uppercase font-black px-2 py-0.5 rounded-sm ${
                      vigencia === 'activas' 
                        ? 'bg-emerald-50 text-emerald-800' 
                        : vigencia === 'futuras'
                        ? 'bg-blue-50 text-blue-800'
                        : 'bg-slate-105 text-slate-650'
                    }`}>
                      {vigencia === 'activas' ? 'Vigente' : vigencia === 'futuras' ? 'Futura' : 'Terminada'}
                    </span>
                  </div>
                  <h4 className="text-base font-extrabold text-slate-800 leading-snug">{f.programaFormacion}</h4>
                </div>
                <button 
                  type="button" 
                  onClick={() => setSelectedFichaDetail(null)}
                  className="p-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Drawer Content */}
              <div className="flex-1 space-y-5 text-xs text-slate-600 font-medium overflow-y-auto">
                
                {/* Visual warning indicators list */}
                {(hasNoLeader || hasAlerts || isIncomplete || (f.countAlto ?? 0) > 0) && (
                  <div className="bg-amber-50/70 border border-amber-200 rounded-lg p-3 space-y-1.5">
                    <span className="text-[10.5px] text-amber-800 font-black flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                      <span>Diagnóstico de Alertas Tempranas</span>
                    </span>
                    <ul className="list-disc pl-4.5 space-y-1 text-slate-600 text-[11px] font-semibold">
                      {hasNoLeader && (
                        <li className="text-amber-800">No tiene Instructor Líder activo. Es fundamental asignar tutela académica.</li>
                      )}
                      {f.missingTransversals && f.missingTransversals.length > 0 && (
                        <li className="text-amber-800">Falta tutor activo para las áreas transversales: {f.missingTransversals.join(', ')}</li>
                      )}
                      {isIncomplete && (
                        <li className="text-amber-800">Información incompleta: no cuenta con un listado oficial de aprendices matriculados.</li>
                      )}
                      {(f.countAlto ?? 0) > 0 && (
                        <li className="text-rose-800 font-bold">Posee {f.countAlto} aprendiz(ces) en estado de Riesgo Crítico (Rojo) por inasistencia o evidencias desaprobadas.</li>
                      )}
                    </ul>
                  </div>
                )}

                {/* Section 1: Basic specifications */}
                <div className="space-y-2.5">
                  <h5 className="text-[11px] uppercase tracking-wider font-extrabold text-slate-405 border-b border-slate-100 pb-1">Especificaciones Técnicas</h5>
                  <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <div>
                      <span className="text-slate-400 text-[10px] block font-bold uppercase">Nivel académico</span>
                      <span className="font-extrabold text-slate-800">{f.nivel || 'Tecnólogo'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block font-bold uppercase">Rol del docente activo</span>
                      <span className="font-extrabold text-slate-800 capitalize">{f.rolEnFicha || 'Administrativo'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block font-bold uppercase">Inicio lectiva</span>
                      <span className="font-extrabold font-mono text-slate-800">{f.fechaInicio?.substring(0, 10) || 'Sin registrar'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block font-bold uppercase">Cierre lectiva</span>
                      <span className="font-extrabold font-mono text-slate-800">{f.fechaFin?.substring(0, 10) || 'Sin registrar'}</span>
                    </div>
                  </div>
                </div>

                {/* Section 2: Health of Cohort (Metrics block) */}
                <div className="space-y-2.5">
                  <h5 className="text-[11px] uppercase tracking-wider font-extrabold text-slate-405 border-b border-slate-100 pb-1">Retención y Retos de Permanencia</h5>
                  <div className="grid grid-cols-3 gap-2.5">
                    
                    <div className="bg-red-50/50 border border-red-151 rounded-lg p-3 text-center">
                      <span className="block text-slate-500 font-bold text-[9px] uppercase">Riesgo Alto</span>
                      <span className="text-xl font-mono font-black text-red-650 block mt-0.5">{f.countAlto || 0}</span>
                      <span className="text-[8.5px] text-red-500 font-semibold block uppercase">Críticos</span>
                    </div>

                    <div className="bg-amber-50/50 border border-amber-151 rounded-lg p-3 text-center">
                      <span className="block text-slate-500 font-bold text-[9px] uppercase">Riesgo Medio</span>
                      <span className="text-xl font-mono font-black text-amber-655 block mt-0.5">{f.countMedio || 0}</span>
                      <span className="text-[8.5px] text-amber-600 font-semibold block">En Alerta</span>
                    </div>

                    <div className="bg-emerald-50/30 border border-emerald-151 rounded-lg p-3 text-center">
                      <span className="block text-slate-500 font-bold text-[9px] uppercase">Riesgo Bajo</span>
                      <span className="text-xl font-mono font-black text-emerald-800 block mt-0.5">{f.countBajo || 0}</span>
                      <span className="text-[8.5px] text-emerald-700 font-semibold block">Estables</span>
                    </div>

                  </div>
                  
                  <div className="flex items-center gap-1.5 text-[10.5px] justify-center bg-slate-50 border border-slate-100 rounded-lg p-2 font-bold text-slate-500">
                    <span>Estatus de estudiantes matriculados:</span>
                    <span className="text-slate-800 font-black">{f.totalAprendices || 0} total</span>
                  </div>
                </div>

                {/* Section 3: Professional Tutoring Staff assignments */}
                <div className="space-y-2.5">
                  <h5 className="text-[11px] uppercase tracking-wider font-extrabold text-slate-405 border-b border-slate-100 pb-1">Listado Oficial de Instructores Asignados</h5>
                  <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
                    {f.assignments && f.assignments.length > 0 ? (
                      f.assignments.map(a => {
                        const isLider = a.rol?.toLowerCase().includes('lider') || a.rol?.toLowerCase().includes('líder');
                        const isTransversal = a.rol?.toLowerCase().includes('transversal');

                        return (
                          <div key={a.id + a.rol} className="flex items-center justify-between p-2 rounded border border-slate-101 bg-white hover:bg-slate-50">
                            <div>
                              <div className="font-bold text-slate-850 flex items-center gap-1">
                                <span>{a.nombre}</span>
                                {isLider && (
                                  <span className="text-[8.5px] font-black uppercase text-emerald-800 bg-emerald-50 border border-emerald-110 px-1 rounded">Líder</span>
                                )}
                                {isTransversal && (
                                  <span className="text-[8.5px] font-black uppercase text-blue-800 bg-blue-50 border border-blue-110 px-0.5 rounded">Transversal</span>
                                )}
                              </div>
                              <span className="text-[9.5px] text-slate-450">{a.correo}</span>
                            </div>
                            <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded uppercase font-bold tracking-wide">
                              {a.estado === 'Activo' ? '🟢 Activo' : '🔴 Inactivo'}
                            </span>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-slate-400 italic font-semibold text-center text-[11px] py-2">Ningún instructor asignado. Vincule asignaturas en la consola inferior.</p>
                    )}
                  </div>
                </div>

              </div>

              {/* Drawer Footer Actions */}
              <div className="border-t border-slate-105 pt-4 space-y-2 select-none">
                <button
                  type="button"
                  onClick={() => onSelectFicha(f.codigoFicha)}
                  className="w-full bg-[#39A900] hover:bg-[#319200] text-white text-xs font-black py-2.5 rounded-lg flex items-center justify-center gap-1.5 shadow-4xs transition-all cursor-pointer"
                >
                  <Eye className="w-4 h-4" />
                  <span>Ingresar al Cuadro Completo de Alertas y Aprendices</span>
                </button>
                
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleManageInstructors(f)}
                    className="bg-white hover:bg-slate-50 border border-slate-200.5 text-slate-700 text-xs font-bold py-2 rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer shadow-4xs"
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>Vincular Docente</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedFichaDetail(null)}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold py-2 rounded-lg flex items-center justify-center transition-all cursor-pointer"
                  >
                    <span>Cerrar Panel</span>
                  </button>
                </div>
              </div>

            </div>

          </div>
        );
      })()}

      {/* ========================================================
          MODAL DIALOG: EDIT SINGLE FICHA (PUT API)
          ======================================================== */}
      {editingFicha && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 animate-fade-in" style={{ backgroundColor: 'rgba(15, 23, 42, 0.4)' }}>
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden text-xs text-slate-650 animate-zoom-in">
            
            <div className="bg-slate-100 border-b border-slate-200 px-5 py-3.5 flex items-center justify-between font-bold text-slate-800">
              <h4 className="text-sm font-black flex items-center gap-1.5">
                <Edit className="w-4 h-4 text-emerald-600" />
                <span>Editar Ficha Básica - {editingFicha.codigoFicha}</span>
              </h4>
              <button 
                type="button" 
                onClick={() => setEditingFicha(null)}
                className="text-slate-400 hover:text-slate-650 cursor-pointer"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-5 space-y-4 font-semibold text-slate-600">
              {editError && (
                <div className="p-2.5 bg-red-50 text-red-700 border border-red-100 rounded text-[11px] font-bold">
                  {editError}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10.5px] uppercase text-slate-400/90 font-bold block mb-0.5">Código de Ficha (Único):</label>
                <input 
                  type="text" 
                  value={editingCodigo}
                  onChange={e => setEditingCodigo(e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 border border-slate-250 rounded bg-white text-slate-800 focus:outline-none focus:border-emerald-500 font-mono"
                  required
                />
              </div>

              <div className="space-y-0.5">
                <p className="text-[10.5px] text-slate-450 font-bold">Programa de formación vinculado:</p>
                <p className="p-2 border border-slate-101 rounded bg-slate-50 text-slate-700 text-[11px] font-black">{editingFicha.programaFormacion}</p>
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="text-[10.5px] uppercase text-slate-400/90 font-bold block mb-0.5">Fecha Inicio:</label>
                  <input 
                    type="date" 
                    value={editingFechaInicio}
                    onChange={e => setEditingFechaInicio(e.target.value)}
                    className="w-full text-xs px-2.5 py-1.5 border border-slate-250 rounded bg-white text-slate-800 focus:outline-none focus:border-emerald-500 font-mono"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10.5px] uppercase text-slate-400/90 font-bold block mb-0.5">Fecha Fin:</label>
                  <input 
                    type="date" 
                    value={editingFechaFin}
                    onChange={e => setEditingFechaFin(e.target.value)}
                    className="w-full text-xs px-2.5 py-1.5 border border-slate-250 rounded bg-white text-slate-800 focus:outline-none focus:border-emerald-500 font-mono"
                    required
                  />
                </div>
              </div>

              <div className="bg-slate-50 p-2.5 border border-slate-200/50 rounded text-[10.5px] text-slate-450 leading-normal">
                Nota: Al modificar la fecha de vigencia o el código de la ficha, las relaciones con instructores y estudiantes se mantendrán sincronizadas en la base de datos de Google.
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-101">
                <button
                  type="button"
                  onClick={() => setEditingFicha(null)}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-650 rounded-lg font-bold transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="px-4 py-1.5 bg-[#39A900] hover:bg-[#319200] text-white rounded-lg font-bold transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSavingEdit ? 'Guardando...' : 'Aplicar Cambios'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL DIALOG: DELETE CONFIRMATION DANGER ZONE
          ======================================================== */}
      {deletingFichaId && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 animate-fade-in" style={{ backgroundColor: 'rgba(15, 23, 42, 0.4)' }}>
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full border border-slate-200 overflow-hidden text-xs text-slate-650 animate-zoom-in">
            
            <div className="bg-red-50 border-b border-red-105 px-4.5 py-3 flex items-center gap-2 text-rose-800 font-extrabold">
              <ShieldAlert className="w-5 h-5 text-red-500 shrink-0" />
              <span>Confirmar Eliminación Física de Ficha</span>
            </div>

            <div className="p-4.5 space-y-3.5 font-semibold text-slate-600 leading-normal">
              <p>
                ¿Está absolutamente seguro que desea retirar esta Ficha del sistema general de Alertas Tempranas?
              </p>
              <p className="bg-rose-50 border border-rose-100 text-rose-800 font-bold p-2 px-3 rounded text-[11px]">
                🚨 Esta acción es <strong>IRREVERSIBLE</strong> y borrará permanentemente el historial de seguimientos, todos los aprendices del grupo y sus reasociaciones académicas en la base de datos de Google.
              </p>
              
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setDeletingFichaId(null)}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg font-bold transition-all cursor-pointer"
                >
                  Conservar Registro
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => handleDeleteFicha(deletingFichaId)}
                  className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold transition-all cursor-pointer disabled:opacity-50"
                >
                  {isDeleting ? 'Borrando...' : 'Sí, Eliminar Todo'}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
