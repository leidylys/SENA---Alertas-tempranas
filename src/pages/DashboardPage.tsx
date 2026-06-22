import React, { useState, useRef } from 'react';
import { 
  Home, RefreshCw, Download, FileText, AlertTriangle, LogOut,
  Building, User, Calendar, Sparkles, FolderSync, Info,
  Upload, Loader2, CheckCircle2, AlertCircle, CalendarClock, Trash2,
  FileSpreadsheet, ArrowLeft, ShieldCheck
} from 'lucide-react';
import { Aprendiz, Fase, FichaInfo } from '../types';
import DashboardCards from '../components/DashboardCards';
import PhaseSelector from '../components/PhaseSelector';
import AlertTable from '../components/AlertTable';
import StrategyModal from '../components/StrategyModal';
import ReportModal from '../components/ReportModal';
import { useAlertasStore } from '../hooks/useAlertasStore';
import { saveIndividualIntervention, saveBulkIntervention, syncLearnersToDb } from '../lib/api.ts';
import { leerArchivoExcel, detectarFases, normalizarAprendices, combinarDatos } from '../utils/excelParser';

interface DashboardPageProps {
  aprendices: Aprendiz[];
  fases: Fase[];
  fichaInfo: FichaInfo;
  store: ReturnType<typeof useAlertasStore>;
  onReiniciar: () => void;
  authToken: string;
  isAdmin?: boolean;
}

export default function DashboardPage({
  aprendices,
  fases,
  fichaInfo,
  store,
  onReiniciar,
  authToken,
  isAdmin = false
}: DashboardPageProps) {
  
  // Modals state
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isStrategyOpen, setIsStrategyOpen] = useState(false);
  const [isSavingIntervention, setIsSavingIntervention] = useState(false);
  
  // Strategy targets (either singular learner or mass block)
  const [strategySingleTarget, setStrategySingleTarget] = useState<Aprendiz | null>(null);
  const [strategyMassTarget, setStrategyMassTarget] = useState<Aprendiz[] | null>(null);

  // Excel tracking uploading states
  const [qualificationsFile, setQualificationsFile] = useState<File | null>(null);
  const [participantsFile, setParticipantsFile] = useState<File | null>(null);
  const [isUpdatingTracking, setIsUpdatingTracking] = useState(false);
  const [dragQuals, setDragQuals] = useState(false);
  const [dragParts, setDragParts] = useState(false);
  const qualsInputRef = useRef<HTMLInputElement>(null);
  const partsInputRef = useRef<HTMLInputElement>(null);

  // Calculate days since last seguimiento (Colombia standard GMT-5 adjustment or simple date substraction)
  const lastSegDate = fichaInfo.ultimoSeguimiento ? new Date(fichaInfo.ultimoSeguimiento + 'T00:00:00') : null;
  const daysDiff = lastSegDate 
    ? Math.floor((new Date().setHours(0,0,0,0) - lastSegDate.setHours(0,0,0,0)) / (1000 * 3600 * 24)) 
    : null;

  const handleTrackingUploadAndSync = async () => {
    if (!qualificationsFile) {
      alert('Por favor selecciona obligatoriamente un archivo Excel de Calificaciones.');
      return;
    }
    setIsUpdatingTracking(true);
    try {
      // 1. Process Qualifications Excel (obligatorio)
      const parsedQuals = await leerArchivoExcel(qualificationsFile);
      const phases = detectarFases(parsedQuals.headers);
      let list = normalizarAprendices(parsedQuals.rows, phases);

      // 2. Process Participants Excel (opcional)
      if (participantsFile) {
        const parsedParts = await leerArchivoExcel(participantsFile);
        list = combinarDatos(list, parsedParts.rows);
      }
      
      const todayISO = new Date().toISOString().split('T')[0];
      
      // Update DB and Memory fallback
      await syncLearnersToDb(
        authToken,
        fichaInfo.numeroFicha,
        fichaInfo.programaFormacion,
        fichaInfo.nivel,
        fichaInfo.fechaInicio || '2026-01-15',
        fichaInfo.fechaFin || '2027-12-15',
        list,
        todayISO
      );

      // Re-populate our store
      store.setDatosCargados(list, phases);
      
      // Update current props memory directly
      fichaInfo.ultimoSeguimiento = todayISO;
      
      alert(`🎉 ¡Seguimiento LMS actualizado con éxito! Se cargaron ${list.length} aprendices y se recalculó el estado de retención escolar.`);
      setQualificationsFile(null);
      setParticipantsFile(null);
    } catch (err: any) {
      console.error(err);
      alert('Error procesando el reporte del LMS: ' + err.message);
    } finally {
      setIsUpdatingTracking(false);
    }
  };

  // Computed live general stats
  const countUnIntervened = store.aprendices.filter(
    a => a.estadoIntervencion === 'Sin intervención'
  ).length;

  const countAlto = store.aprendices.filter(a => a.nivelRiesgo === 'Alto').length;
  const countMedio = store.aprendices.filter(a => a.nivelRiesgo === 'Medio').length;
  const countBajo = store.aprendices.filter(a => a.nivelRiesgo === 'Bajo').length;

  // Modals Triggers
  const triggerIndividualIntervention = (ap: Aprendiz) => {
    setStrategyMassTarget(null);
    setStrategySingleTarget(ap);
    setIsStrategyOpen(true);
  };

  const triggerBulkIntervention = (aps: Aprendiz[]) => {
    setStrategySingleTarget(null);
    setStrategyMassTarget(aps);
    setIsStrategyOpen(true);
  };

  const handleGuardarIntervencion = async (
    documentos: string[],
    estado: 'Sin intervención' | 'En seguimiento' | 'Intervenido',
    intervencionDetalle: any
  ) => {
    setIsSavingIntervention(true);
    try {
      // Pack full structured fields cleanly for PostgreSQL Detalles string
      const compromiseText = [
        intervencionDetalle.estrategias?.length > 0 ? `Estrategias: ${intervencionDetalle.estrategias.join(', ')}` : '',
        intervencionDetalle.causas?.length > 0 ? `Causas: ${intervencionDetalle.causas.join(', ')}` : '',
        intervencionDetalle.observaciones ? `Observaciones: ${intervencionDetalle.observaciones}` : ''
      ].filter(Boolean).join(' | ') || 'Asignación de estrategia pedagógica';

      if (strategyMassTarget) {
        // Bulk save
        await saveBulkIntervention(
          authToken,
          documentos,
          fichaInfo.numeroFicha,
          estado,
          compromiseText,
          intervencionDetalle.fecha
        );
        store.aplicarIntervencionMasiva(documentos, estado, intervencionDetalle);
      } else {
        // Individual save
        await saveIndividualIntervention(
          authToken,
          documentos[0],
          fichaInfo.numeroFicha,
          estado,
          compromiseText,
          intervencionDetalle.fecha
        );
        store.aplicarIntervencionIndividual(documentos[0], estado, intervencionDetalle);
      }
    } catch (err: any) {
      console.error(err);
      alert('Error guardando en base de datos: ' + err.message);
    } finally {
      setIsSavingIntervention(false);
    }
  };

  return (
    <div className="space-y-6" id="dashboard-page-view">
      
      {/* Navbar Institucional Dark Green #007832 */}
      <header className="bg-[#007832] text-white rounded-xl shadow-lg p-4 px-6 flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* Left SENA Info / Logo */}
        <div className="flex items-center gap-4 w-full md:w-auto">
          {/* Logo container circle */}
          <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center p-1.5 border border-white/20 shadow-inner shrink-0">
            <span className="text-[#39A900] text-xl font-black">S</span>
          </div>
          <div className="border-l border-white/30 pl-4 text-left leading-tight">
            <h1 className="text-base font-bold leading-none uppercase tracking-wide">SENA Alertas Tempranas</h1>
            <p className="text-[10px] opacity-80 uppercase tracking-widest mt-1">
              Centro de Servicios y Gestión Empresarial
            </p>
          </div>
        </div>

        {/* Dynamic Ficha Badge from Sleek Interface theme */}
        <div className="flex items-center gap-4 font-semibold text-xs py-2">
          <div className="bg-[#39A900] px-3 py-1 rounded text-xs font-bold shrink-0 shadow-sm">
            FICHA: {fichaInfo.numeroFicha || 'No especificada'}
          </div>
          <span className="text-xs text-white/90 truncate max-w-[200px] hidden sm:inline" title={fichaInfo.programaFormacion}>
            {fichaInfo.programaFormacion}
          </span>
        </div>

        {/* Action button triggers Excel/PDF, and Back Home */}
        <div className="flex items-center gap-2.5 w-full md:w-auto justify-end shrink-0">
          
          {/* Open Export Modal */}
          <button
            type="button"
            onClick={() => setIsReportOpen(true)}
            className="flex-1 sm:flex-initial bg-white/10 hover:bg-white/20 text-white text-xs font-bold py-2.5 px-3 rounded transition-colors flex items-center justify-center gap-1.5 border border-white/20"
            id="open-report-options-btn"
          >
            <FileText className="w-4 h-4" />
            <span>Generar PDF</span>
          </button>

          {isAdmin ? (
            <button
              type="button"
              onClick={onReiniciar}
              className="flex-1 sm:flex-initial bg-white hover:bg-slate-50 text-slate-800 text-xs font-extrabold py-2.5 px-4 rounded transition-all flex items-center justify-center gap-2 border border-slate-350 shadow-sm"
              title="Volver al panel administrativo de coordinación SENA"
              id="back-to-admin-panel-btn"
            >
              <ArrowLeft className="w-4 h-4 text-[#39A900]" />
              <span>Volver a Panel Admin</span>
            </button>
          ) : (
            /* Return button */
            <button
              type="button"
              onClick={onReiniciar}
              className="flex-1 sm:flex-initial bg-red-650 hover:bg-red-700 text-white text-xs font-bold py-2.5 px-3.5 rounded transition-colors flex items-center justify-center gap-1.5"
              title="Sube una nueva ficha excel para re-analizar"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reiniciar</span>
            </button>
          )}

        </div>
      </header>

      {/* Dynamic tracking panel for instructors */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-3xs space-y-4" id="instructor-tracking-panel">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-start gap-3">
            <div className={`p-2.5 rounded-xl shrink-0 border ${
              daysDiff === null
                ? 'bg-red-50 text-red-650 border-red-150 animate-pulse'
                : daysDiff >= 8
                ? 'bg-amber-50 text-amber-700 border-amber-150'
                : 'bg-emerald-50 text-[#007832] border-emerald-150'
            }`}>
              <CalendarClock className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <span>Seguimiento de Ficha (Obligatorio cada 8 días)</span>
                <span className={`text-[9.5px] font-black uppercase px-2 py-0.5 rounded-full ${
                  daysDiff === null
                    ? 'bg-red-100 text-red-800'
                    : daysDiff >= 8
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {daysDiff === null
                    ? 'Pendiente Carga Inicial'
                    : daysDiff >= 8
                    ? 'Desactualizado'
                    : 'Al Día'}
                </span>
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed max-w-2xl">
                {daysDiff === null ? (
                  <span className="text-red-600 font-semibold">⚠️ Esta ficha no registra reporte de seguimiento. Suba el archivo de calificaciones LMS para calcular las alertas iniciales.</span>
                ) : daysDiff >= 8 ? (
                  <span className="text-amber-700 font-semibold">⚠️ El último reporte de seguimiento LMS se cargó hace <span className="font-extrabold underline">{daysDiff} días</span>. Es obligatorio actualizar los datos hoy para evitar deserción escolar.</span>
                ) : (
                  <span className="text-emerald-700">🟢 Reporte de seguimiento al día. Actualizado de forma exitosa hace <span className="font-bold">{daysDiff === 0 ? 'hoy (0 días)' : `${daysDiff} día(s)`}</span> (Próxima actualización en {8 - daysDiff} días).</span>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Dual Input upload area Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* Box 1: Qualifications (OBLIGATORIO) */}
          <div className="space-y-1 text-left">
            <span className="block text-xs font-bold text-slate-700 flex items-center gap-1">
              1. Archivo de Calificaciones
              <span className="text-red-500 font-bold">*</span>
            </span>
            
            <div
              onDragOver={(e) => { e.preventDefault(); setDragQuals(true); }}
              onDragLeave={() => setDragQuals(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragQuals(false);
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  setQualificationsFile(e.dataTransfer.files[0]);
                }
              }}
              onClick={() => qualsInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[140px] hover:border-[#39A900] hover:bg-[#39A900]/5 ${
                dragQuals ? 'border-[#39A900] bg-emerald-50/10' : 'border-slate-200 bg-slate-50/30'
              }`}
              id="instructor-quals-dropzone"
            >
              <input
                type="file"
                ref={qualsInputRef}
                accept=".xlsx,.xls"
                className="hidden"
                onChange={e => {
                  if (e.target.files && e.target.files[0]) {
                    setQualificationsFile(e.target.files[0]);
                  }
                }}
              />
              <FileSpreadsheet className={`w-8 h-8 mb-2 ${qualificationsFile ? 'text-[#39A900] animate-bounce' : 'text-slate-400'}`} />
              <span className="text-xs font-bold text-slate-700 break-all px-2 block">
                {qualificationsFile ? qualificationsFile.name : 'Subir excel Calificaciones'}
              </span>
              <span className="text-[10px] text-slate-400 mt-1 block">
                {qualificationsFile ? 'Archivo seleccionado' : 'Arrastra y suelta aquí o interactúa'}
              </span>
            </div>
          </div>

          {/* Box 2: Participants list (OPCIONAL) */}
          <div className="space-y-1 text-left">
            <span className="block text-xs font-bold text-slate-600 flex items-center gap-1">
              2. Archivo de Participantes (Opcional)
            </span>
            
            <div
              onDragOver={(e) => { e.preventDefault(); setDragParts(true); }}
              onDragLeave={() => setDragParts(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragParts(false);
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  setParticipantsFile(e.dataTransfer.files[0]);
                }
              }}
              onClick={() => partsInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[140px] hover:border-blue-450 hover:bg-blue-50/10 ${
                dragParts ? 'border-blue-500 bg-blue-100/10' : 'border-slate-200 bg-slate-50/30'
              }`}
              id="instructor-parts-dropzone"
            >
              <input
                type="file"
                ref={partsInputRef}
                accept=".xlsx,.xls"
                className="hidden"
                onChange={e => {
                  if (e.target.files && e.target.files[0]) {
                    setParticipantsFile(e.target.files[0]);
                  }
                }}
              />
              <Upload className={`w-8 h-8 mb-2 ${participantsFile ? 'text-blue-500 animate-bounce' : 'text-slate-400'}`} />
              <span className="text-xs font-bold text-slate-700 break-all px-2 block">
                {participantsFile ? participantsFile.name : 'Subir excel Participantes'}
              </span>
              <span className="text-[10px] text-slate-400 mt-1 block">
                {participantsFile ? 'Archivo seleccionado' : 'Arrastra para registrar últimos accesos'}
              </span>
            </div>
          </div>

        </div>

        {/* Footer / Info / Action Trigger bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-1.5 p-2 rounded-lg bg-slate-50 border border-slate-150 text-[10.5px] text-slate-500 max-w-xl text-left">
            <Info className="w-4 h-4 text-sena-500 shrink-0" />
            <span>Para un diagnóstico preciso, el excel de calificaciones debe contener las columnas de documento e identificadores.</span>
          </div>

          <button
            type="button"
            onClick={handleTrackingUploadAndSync}
            disabled={isUpdatingTracking || !qualificationsFile}
            className={`px-6 py-2.5 rounded-lg text-xs font-extrabold flex items-center justify-center gap-2 shadow-2xs transition-all ${
              !qualificationsFile 
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                : 'bg-[#39A900] hover:bg-[#2f8800] text-white cursor-pointer active:scale-95'
            }`}
            id="instructor-sync-submit-btn"
          >
            {isUpdatingTracking ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Analizando & Sincronizando...</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                <span>Actualizar Seguimiento de Ficha</span>
              </>
            )}
          </button>
        </div>

      </div>

      {/* Overview statistical count cards (Clicking applies risk filter) */}
      <DashboardCards
        total={store.aprendices.length}
        alto={countAlto}
        medio={countMedio}
        bajo={countBajo}
        selectedFilter={store.filterRiesgo}
        onFilterSelect={(item) => store.setFilterRiesgo(item)}
      />

      {/* Main bento layout: Side selectors (3/12) + Main table (9/12) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Evidence check selectors & Legend */}
        <div className="lg:col-span-3 h-fit">
          <PhaseSelector
            fases={store.fases}
            hasPendingChanges={store.hasPendingChanges}
            onToggleFase={store.toggleFaseCheckbox}
            onToggleEvidencia={store.toggleEvidenciaCheckbox}
            onAplicarSeguimiento={store.aplicarSeguimiento}
          />
        </div>

        {/* Right Column: Complete Student Grid Table */}
        <div className="lg:col-span-9 h-full">
          <AlertTable
            aprendices={store.aprendices}
            fichaInfo={fichaInfo}
            selectedIds={store.selectedAprendicesIds}
            filterSearch={store.filterSearch}
            onFilterSearchChange={store.setFilterSearch}
            filterRiesgo={store.filterRiesgo}
            onFilterRiesgoChange={store.setFilterRiesgo}
            filterEstado={store.filterEstado}
            onFilterEstadoChange={store.setFilterEstado}
            sortColumn={store.sortColumn}
            onSortColumnChange={store.setSortColumn}
            sortDirection={store.sortDirection}
            onSortDirectionChange={store.setSortDirection}
            onToggleSelect={store.toggleSeleccionAprendiz}
            onToggleSelectAll={store.toggleSeleccionarTodos}
            onIntervenirIndividual={triggerIndividualIntervention}
            onIntervenirMasivo={triggerBulkIntervention}
          />
        </div>

      </div>

      {/* Modals Containers */}
      
      {/* 1. Strategy Assignment Modal */}
      <StrategyModal
        isOpen={isStrategyOpen}
        onClose={() => setIsStrategyOpen(false)}
        aprendiz={strategySingleTarget}
        aprendicesMasivos={strategyMassTarget}
        instructorNombreActual={fichaInfo.instructor}
        onGuardar={handleGuardarIntervencion}
      />

      {/* 2. Download formal PDF/Excel Options Modal */}
      <ReportModal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        aprendices={store.aprendices}
        fichaInfo={fichaInfo}
      />

    </div>
  );
}
