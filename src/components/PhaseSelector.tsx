import React from 'react';
import { Layers, AlertTriangle, CheckSquare, Square, Info } from 'lucide-react';
import { Fase } from '../types';

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
  
  // Total checked check helper
  const getSelectedCount = (fase: Fase) => {
    return fase.evidencias.filter(e => e.selected).length;
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
              Ninguna fase detectada. Sube un archivo Excel para iniciar.
            </p>
          ) : (
            fases.map(fase => {
              const selectedCount = getSelectedCount(fase);
              const totalCount = fase.evidencias.length;
              const isAllSelected = selectedCount === totalCount;
              const isSomeSelected = selectedCount > 0 && selectedCount < totalCount;

              return (
                <div key={fase.id} className="border border-slate-150 rounded-lg overflow-hidden bg-slate-50/50">
                  {/* Phase Row Header */}
                  <div className="flex items-center justify-between px-3 py-2 bg-slate-100/70 border-b border-slate-150">
                    <label className="flex items-center gap-2 cursor-pointer select-none font-semibold text-xs text-slate-800">
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
                    <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded-full font-bold shrink-0">
                      {selectedCount}/{totalCount}
                    </span>
                  </div>

                  {/* Evidences list */}
                  <div className="p-2.5 space-y-1.5 bg-white">
                    {fase.evidencias.map(ev => (
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
                        <span className="break-words" title={ev.nombre}>{ev.nombre}</span>
                      </label>
                    ))}
                  </div>
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
            <div className="flex items-center justify-between border-b border-emerald-100/60 pb-1">
              <span>Evidencia Desaprobada (D)</span>
              <strong className="text-red-700 font-bold">+2 pts</strong>
            </div>
            <div className="flex items-center justify-between border-b border-emerald-100/60 pb-1">
              <span>Evidencia No entregada (*)</span>
              <strong className="text-amber-800 font-bold">+3 pts</strong>
            </div>
            <div className="flex items-center justify-between border-b border-emerald-100/60 pb-1">
              <span>Sin ingreso LMS ≥ 7 días</span>
              <strong className="text-slate-800 font-bold">+2 pts</strong>
            </div>
            <div className="flex items-center justify-between">
              <span>Sin ingreso LMS ≥ 14 días</span>
              <strong className="text-slate-900 font-bold">+4 pts</strong>
            </div>
          </div>
          <div className="text-[9.5px] italic text-emerald-700/80 leading-snug border-t border-emerald-100/60 pt-1">
            * Rangos de Clasificación:<br />
            0–2 Bajo (Verde) | 3–5 Medio (Naranja) | ≥ 6 Alto (Rojo).
          </div>
        </div>

      </div>
    </div>
  );
}
