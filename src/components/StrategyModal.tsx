import React, { useState, useEffect } from 'react';
import { X, Calendar, User, FileText, AlertTriangle, BookOpen, HelpCircle } from 'lucide-react';
import { Aprendiz, Intervencion } from '../types';
import { ESTRATEGIAS_DISPONIBLES, CAUSAS_RIESGO } from '../data/mockData';

interface StrategyModalProps {
  isOpen: boolean;
  onClose: () => void;
  // If editing a single student:
  aprendiz?: Aprendiz | null;
  // If doing mass intervention:
  aprendicesMasivos?: Aprendiz[] | null;
  instructorNombreActual: string;
  onGuardar: (
    documentos: string[],
    estado: 'Sin intervención' | 'En seguimiento' | 'Intervenido',
    intervencionDetalle: Omit<Intervencion, 'id'>
  ) => void;
}

export default function StrategyModal({
  isOpen,
  onClose,
  aprendiz,
  aprendicesMasivos,
  instructorNombreActual,
  onGuardar
}: StrategyModalProps) {
  const [estado, setEstado] = useState<'Sin intervención' | 'En seguimiento' | 'Intervenido'>('En seguimiento');
  const [estrategiasSelectas, setEstrategiasSelectas] = useState<string[]>([]);
  const [causasSelectas, setCausasSelectas] = useState<string[]>([]);
  const [estrategiaPersonalizada, setEstrategiaPersonalizada] = useState('');
  const [fecha, setFecha] = useState('');
  const [observaciones, setObservaciones] = useState('');

  // Prepopulate today's date and reset fields on open
  useEffect(() => {
    if (isOpen) {
      const todayString = new Date().toISOString().substring(0, 10);
      setFecha(todayString);
      
      if (aprendiz) {
        setEstado(aprendiz.estadoIntervencion !== 'Sin intervención' ? aprendiz.estadoIntervencion : 'En seguimiento');
        setEstrategiasSelectas([]);
        setCausasSelectas([]);
        setEstrategiaPersonalizada('');
        setObservaciones('');
      } else if (aprendicesMasivos) {
        setEstado('En seguimiento');
        setEstrategiasSelectas([]);
        setCausasSelectas([]);
        setEstrategiaPersonalizada('');
        setObservaciones('');
      }
    }
  }, [isOpen, aprendiz, aprendicesMasivos]);

  if (!isOpen) return null;

  const isMasivo = !!aprendicesMasivos;
  const targetAprendices = isMasivo ? (aprendicesMasivos || []) : (aprendiz ? [aprendiz] : []);
  
  if (targetAprendices.length === 0) return null;

  // Compute metrics for single student summary
  const getSingleStudentMetrics = () => {
    if (!aprendiz) return null;
    const desc = Object.values(aprendiz.evidencias).filter(v => v === 'D').length;
    const noEnt = Object.values(aprendiz.evidencias).filter(v => v === '*').length;
    return { desc, noEnt, dias: aprendiz.diasSinAcceso };
  };

  const metrics = getSingleStudentMetrics();

  const handleToggleEstrategia = (est: string) => {
    setEstrategiasSelectas(prev => 
      prev.includes(est) ? prev.filter(x => x !== est) : [...prev, est]
    );
  };

  const handleToggleCausa = (causa: string) => {
    setCausasSelectas(prev => 
      prev.includes(causa) ? prev.filter(x => x !== causa) : [...prev, causa]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Package strategies, adding the custom one if provided
    let finalEstrategias = [...estrategiasSelectas];
    if (estrategiaPersonalizada.trim()) {
      finalEstrategias.push(`Personalizada: ${estrategiaPersonalizada.trim()}`);
    }

    const docs = targetAprendices.map(a => a.documento);
    
    onGuardar(docs, estado, {
      fecha,
      instructor: instructorNombreActual || 'Instructor SENA',
      estadoIntervencion: estado,
      estrategias: finalEstrategias,
      causas: causasSelectas,
      estrategiaPersonalizada: estrategiaPersonalizada.trim(),
      observaciones: observaciones.trim()
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" id="strategy-modal-backdrop">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        
        {/* Background Overlay */}
        <div className="fixed inset-0 transition-opacity bg-slate-900/60 backdrop-blur-xs" onClick={onClose}></div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        {/* Modal Content */}
        <div 
          className="inline-block w-full max-w-2xl overflow-hidden text-left align-middle transition-all transform bg-white rounded-lg shadow-xl sm:my-8"
          id="strategy-modal-container"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-sena-700 text-white">
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5" />
              <h3 className="text-lg font-bold">
                {isMasivo 
                  ? `Registrar Intervención Masiva (${targetAprendices.length} aprendices)` 
                  : `Plan de Acompañamiento Individual`
                }
              </h3>
            </div>
            <button 
              onClick={onClose} 
              className="p-1 hover:bg-white/15 rounded-full transition-colors text-white"
              title="Cerrar modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            
            {/* 1. Target Summary Indicator */}
            {isMasivo ? (
              <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-100/70 text-emerald-950 text-sm">
                <span className="font-bold">Asignación Masiva:</span> Estás definiendo causas, planes y estrategias de contingencia para <span className="font-bold underline">{targetAprendices.length} aprendices</span> seleccionados de la ficha simultáneamente.
              </div>
            ) : (
              aprendiz && (
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Aprendiz en Evaluación:</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                      aprendiz.nivelRiesgo === 'Alto' ? 'bg-red-100 text-red-800' :
                      aprendiz.nivelRiesgo === 'Medio' ? 'bg-amber-100 text-amber-800' :
                      'bg-emerald-100 text-emerald-800'
                    }`}>
                      Riesgo {aprendiz.nivelRiesgo}
                    </span>
                  </div>
                  <h4 className="text-base font-bold text-slate-900">{aprendiz.nombre}</h4>
                  <div className="text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-1 pt-1 border-t border-slate-200/60">
                    <span>Documento: <strong className="text-slate-700">{aprendiz.documento}</strong></span>
                    <span>Correo: <strong className="text-slate-700">{aprendiz.correo}</strong></span>
                  </div>
                  
                  {/* Student Risk Diagnostics Summary */}
                  {metrics && (
                    <div className="grid grid-cols-3 gap-2 pt-2">
                      <div className="bg-red-50/50 p-2 rounded text-center border border-red-100/50">
                        <span className="block text-xs text-red-600 font-semibold">{metrics.desc}</span>
                        <span className="text-[10px] text-slate-500">Evidencias "D"</span>
                      </div>
                      <div className="bg-amber-50/50 p-2 rounded text-center border border-amber-100/50">
                        <span className="block text-xs text-amber-600 font-semibold">{metrics.noEnt}</span>
                        <span className="text-[10px] text-slate-500">No entregó (*)</span>
                      </div>
                      <div className="bg-blue-50/50 p-2 rounded text-center border border-blue-100/50">
                        <span className="block text-xs text-blue-600 font-semibold">
                          {metrics.dias !== null ? `${metrics.dias} días` : 'N/A'}
                        </span>
                        <span className="text-[10px] text-slate-500">Sin ingresar</span>
                      </div>
                    </div>
                  )}
                </div>
              )
            )}

            {/* 2. State Selector */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                1. Estado del Comité o Intervención
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['Sin intervención', 'En seguimiento', 'Intervenido'] as const).map(opId => (
                  <button
                    key={opId}
                    type="button"
                    onClick={() => setEstado(opId)}
                    className={`py-2 px-3 text-xs font-semibold rounded-md border transition-all ${
                      estado === opId
                        ? 'bg-sena-500 border-sena-600 text-white shadow-sm'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {opId}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Pedagogical Strategies */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                <BookOpen className="w-3.5 h-3.5 text-sena-600" />
                2. Estrategias Pedagógicas de Retención (Múltiples)
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1.5 p-3.5 bg-slate-50 rounded-lg border border-slate-100">
                {ESTRATEGIAS_DISPONIBLES.map(est => (
                  <label key={est} className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer select-none py-1 hover:text-slate-900">
                    <input
                      type="checkbox"
                      checked={estrategiasSelectas.includes(est)}
                      onChange={() => handleToggleEstrategia(est)}
                      className="mt-0.5 rounded text-sena-600 focus:ring-sena-500"
                    />
                    <span>{est}</span>
                  </label>
                ))}
              </div>
              
              {/* Other customized strategy */}
              <div className="mt-2 text-xs">
                <label className="block font-medium text-slate-600 mb-1">
                  Otra estrategia institucional complementaria:
                </label>
                <input
                  type="text"
                  placeholder="Por ejemplo: Traslado de franja de horario, comité ampliatorio, etc."
                  value={estrategiaPersonalizada}
                  onChange={e => setEstrategiaPersonalizada(e.target.value)}
                  className="w-full text-xs px-3 py-1.5 rounded-md border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-sena-500 focus:border-sena-500"
                />
              </div>
            </div>

            {/* 4. Risk Origin Causes */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                3. Causas Diagnósticas del Desempeño (Múltiples)
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1.5 p-3.5 bg-amber-50/40 rounded-lg border border-amber-100/50">
                {CAUSAS_RIESGO.map(causa => (
                  <label key={causa} className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer select-none py-1 hover:text-slate-900">
                    <input
                      type="checkbox"
                      checked={causasSelectas.includes(causa)}
                      onChange={() => handleToggleCausa(causa)}
                      className="mt-0.5 rounded text-amber-500 focus:ring-amber-400"
                    />
                    <span>{causa}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* 5. Scheduling Date and Instructor info Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  Fecha de Intervención
                </label>
                <input
                  type="date"
                  required
                  value={fecha}
                  onChange={e => setFecha(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-md border border-slate-200 focus:ring-1 focus:ring-sena-500 focus:border-sena-500"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-slate-500" />
                  Instructor Ejecutor
                </label>
                <input
                  type="text"
                  disabled
                  value={instructorNombreActual || 'No definido'}
                  className="w-full text-xs px-3 py-2 rounded-md border border-slate-200 bg-slate-100 text-slate-500 italic font-medium"
                  title="Precargado del instructor activo"
                />
              </div>
            </div>

            {/* 6. Textarea Observations */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-slate-500" />
                4. Observaciones y Acuerdos de Compromiso Académico
              </label>
              <textarea
                placeholder="Escribe los compromisos específicos con las respectivas fechas límite, compromisos del tutor o tutorías sincrónicas..."
                rows={3}
                value={observaciones}
                onChange={e => setObservaciones(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-md border border-slate-200 focus:ring-1 focus:ring-sena-500 focus:border-sena-500"
              />
            </div>

            {/* Actions Footer */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-bold text-white bg-sena-500 hover:bg-sena-600 rounded-md shadow-xs transition-colors flex items-center gap-1"
                id="save-intervention-btn"
              >
                Guardar Seguimiento
              </button>
            </div>

          </form>
        </div>
      </div>
    </div>
  );
}
