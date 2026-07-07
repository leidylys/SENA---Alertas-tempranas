import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Layers, AlertTriangle, Info } from 'lucide-react';
import { Fase } from '../types';
import { formatEvidenciaNombre } from '../utils/formatters';

interface PhaseSelectorProps {
  fases: Fase[];
  hasPendingChanges: boolean;
  onToggleFase: (faseId: string) => void;
  onToggleEvidencia: (faseId: string, evNombre: string) => void;
  onAplicarSeguimiento: () => void;
}

export default function PhaseSelector({
  fases,
  hasPendingChanges,
  onToggleFase,
  onToggleEvidencia,
  onAplicarSeguimiento
}: PhaseSelectorProps) {
  const [expandedPhaseIds, setExpandedPhaseIds] = useState<string[]>([]);

  useEffect(() => {
    setExpandedPhaseIds(prev => {
      if (prev.length > 0 || fases.length === 0) return prev;
      return [fases[0].id];
    });
  }, [fases]);
  
  // Total checked check helper
  const getSelectedCount = (fase: Fase) => {
    return fase.evidencias.filter(e => e.selected).length;
  };

  const getGaCode = (nombre: string) => {
    const match = String(nombre || '').match(/(GA\d+)-[A-Z0-9]+-AA\d+-EV\d+/i);
    return match ? match[1].toUpperCase() : 'SIN-GA';
  };

  const getApLabel = (gaCode: string) => {
    const match = gaCode.match(/^GA(\d+)$/i);
    return match ? `AP${match[1]} / ${gaCode}` : 'Sin AP / GA';
  };

  const groupByGa = (fase: Fase) => {
    return fase.evidencias.reduce<Record<string, typeof fase.evidencias>>((acc, evidencia) => {
      const gaCode = getGaCode(evidencia.nombre);
      acc[gaCode] = acc[gaCode] || [];
      acc[gaCode].push(evidencia);
      return acc;
    }, {});
  };

  const toggleGaGroup = (fase: Fase, evidencias: typeof fase.evidencias) => {
    const shouldSelect = evidencias.some(ev => !ev.selected || !fase.selected);
    evidencias.forEach(ev => {
      if (ev.selected !== shouldSelect || !fase.selected) {
        onToggleEvidencia(fase.id, ev.nombre);
      }
    });
  };

  const togglePhaseExpanded = (faseId: string) => {
    setExpandedPhaseIds(prev =>
      prev.includes(faseId) ? prev.filter(id => id !== faseId) : [...prev, faseId]
    );
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden" id="phase-selector-container">
      {/* Box Header */}
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
          <Layers className="w-4 h-4 text-sena-600" />
          <span>Fases y Evidencias Académicas</span>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Recalculate Button Box if there are pending modifications */}
        <div className="space-y-2">
          <button
            onClick={onAplicarSeguimiento}
            disabled={fases.length === 0}
            className={`w-full py-2.5 px-4 text-xs font-bold rounded-md shadow-xs transition-all flex items-center justify-center gap-2 ${
              hasPendingChanges
                ? 'bg-amber-500 hover:bg-amber-600 text-white animate-pulse'
                : 'bg-sena-500 hover:bg-sena-600 text-white disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none'
            }`}
            id="apply-phasing-button"
          >
            Generar Seguimiento
          </button>
          
          {hasPendingChanges && (
            <div className="flex items-center gap-1.5 p-2 bg-amber-50 rounded-md border border-amber-100 text-amber-800 text-[10.5px]">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>Hay cambios sin aplicar. Haz clic en "Generar Seguimiento" para recalcular alertas.</span>
            </div>
          )}
        </div>

        {/* Phase Checklist Directory */}
        <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
          {fases.length === 0 ? (
            <p className="text-xs text-slate-400 italic text-center py-4">
              Cargue primero el reporte de calificaciones para generar el listado real de evidencias.
            </p>
          ) : (
            fases.map(fase => {
              const selectedCount = getSelectedCount(fase);
              const totalCount = fase.evidencias.length;
              const isAllSelected = selectedCount === totalCount;
              const isSomeSelected = selectedCount > 0 && selectedCount < totalCount;
              const isExpanded = expandedPhaseIds.includes(fase.id);

              return (
                <div key={fase.id} className="border border-slate-150 rounded-lg overflow-hidden bg-slate-50/50">
                  {/* Phase Row Header */}
                  <div className="flex items-center justify-between px-3 py-2 bg-slate-100/70 border-b border-slate-150">
                    <div className="flex items-center gap-2 min-w-0">
                      <button
                        type="button"
                        onClick={() => togglePhaseExpanded(fase.id)}
                        className="p-0.5 rounded hover:bg-slate-200 text-slate-600 cursor-pointer"
                        title={isExpanded ? 'Contraer fase' : 'Expandir fase'}
                      >
                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      </button>
                      <label className="flex items-center gap-2 cursor-pointer select-none font-semibold text-xs text-slate-800 min-w-0">
                        <input
                          type="checkbox"
                          checked={fase.selected && isAllSelected}
                          ref={(el) => {
                            if (el) {
                              el.indeterminate = isSomeSelected;
                            }
                          }}
                          onChange={() => onToggleFase(fase.id)}
                          className="rounded border-slate-300 text-sena-600 focus:ring-sena-500 w-3.5 h-3.5"
                        />
                        <span className="truncate max-w-[150px]" title={fase.nombre}>
                          {fase.nombre}
                        </span>
                      </label>
                    </div>
                    <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded-full font-bold shrink-0">
                      {selectedCount}/{totalCount}
                    </span>
                  </div>

                  {isExpanded && <div className="p-2.5 space-y-3 bg-white">
                    {Object.entries(groupByGa(fase)).map(([gaCode, evidencias]) => {
                      const selectedGaCount = evidencias.filter(ev => ev.selected && fase.selected).length;
                      const isGaAllSelected = selectedGaCount === evidencias.length;
                      const isGaSomeSelected = selectedGaCount > 0 && selectedGaCount < evidencias.length;

                      return (
                        <div key={`${fase.id}-${gaCode}`} className="border border-slate-100 rounded-md overflow-hidden">
                          <div className="flex items-center justify-between bg-slate-50 px-2.5 py-1.5">
                            <label className="flex items-center gap-2 cursor-pointer select-none text-[10px] font-extrabold text-slate-700">
                              <input
                                type="checkbox"
                                checked={isGaAllSelected}
                                ref={(el) => {
                                  if (el) {
                                    el.indeterminate = isGaSomeSelected;
                                  }
                                }}
                                onChange={() => toggleGaGroup(fase, evidencias)}
                                className="rounded border-slate-300 text-sena-600 focus:ring-sena-500 w-3 h-3"
                              />
                              <span>{getApLabel(gaCode)}</span>
                            </label>
                            <span className="text-[9px] bg-white border border-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full font-bold">
                              {selectedGaCount}/{evidencias.length}
                            </span>
                          </div>
                          <div className="p-2 space-y-1.5">
                            {evidencias.map(ev => (
                              <label
                                key={ev.nombre}
                                className="flex items-start gap-2 text-[11px] text-slate-650 hover:text-slate-900 cursor-pointer select-none py-0.5 leading-tight"
                              >
                                <input
                                  type="checkbox"
                                  checked={ev.selected && fase.selected}
                                  onChange={() => onToggleEvidencia(fase.id, ev.nombre)}
                                  className="mt-0.5 rounded border-slate-300 text-sena-500 focus:ring-sena-400 w-3 h-3 shrink-0"
                                />
                                <span className="break-words" title={ev.nombre}>{formatEvidenciaNombre(ev.nombre)}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>}
                </div>
              );
            })
          )}
        </div>

        {/* Scoring Legend Card */}
        <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-100 text-emerald-950 text-xs space-y-2">
          <div className="flex items-center gap-1 font-bold text-emerald-900 text-[11px]">
            <Info className="w-3.5 h-3.5" />
            <span>Leyenda de Alertas Tempranas</span>
          </div>
          <div className="space-y-1 text-[10.5px] text-emerald-800 font-medium">
            <p>A = Evidencia aprobada</p>
            <p>D = Evidencia desaprobada / requiere corrección</p>
            <p>- = Evidencia no entregada</p>
            <p>Pendientes = D + -</p>
          </div>
          <div className="text-[9.5px] italic text-emerald-700/80 leading-snug border-t border-emerald-100/60 pt-1">
            Posible deserción: aprendiz sin evidencias registradas, sin evidencias aprobadas, desaprobadas o pendientes, y con más de 15 días sin acceso a la plataforma.<br />
            Riesgo Alto: 10 o más evidencias pendientes y más de 15 días sin ingreso.<br />
            Riesgo Medio: 5 a 9 evidencias pendientes y más de 15 días sin ingreso.<br />
            Riesgo Bajo: menos de 5 evidencias pendientes o sin condición crítica de acceso.<br />
            Prioridad: Posible deserción, Riesgo alto, Riesgo medio, Riesgo bajo.
          </div>
        </div>

      </div>
    </div>
  );
}
