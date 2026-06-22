import React from 'react';
import { Users, AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface DashboardCardsProps {
  total: number;
  alto: number;
  medio: number;
  bajo: number;
  selectedFilter: 'Todos' | 'Alto' | 'Medio' | 'Bajo';
  onFilterSelect: (filter: 'Todos' | 'Alto' | 'Medio' | 'Bajo') => void;
}

export default function DashboardCards({
  total,
  alto,
  medio,
  bajo,
  selectedFilter,
  onFilterSelect
}: DashboardCardsProps) {
  
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6" id="dashboard-metric-cards-row">
      
      {/* 1. Total Card */}
      <button
        type="button"
        onClick={() => onFilterSelect('Todos')}
        className={`p-5 md:p-6 rounded-2xl text-left transition-all duration-300 relative overflow-hidden shadow-[0_4px_15px_rgba(0,0,0,0.01)] border cursor-pointer hover:scale-[1.02] ${
          selectedFilter === 'Todos'
            ? 'bg-slate-900 text-white border-slate-950 shadow-lg shadow-slate-900/10'
            : 'bg-white text-slate-800 border-slate-150 hover:border-[#39A900] hover:shadow-md'
        }`}
        title="Filtrar por todos los aprendices"
        id="metric-card-total"
      >
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <span className={`text-[10px] font-black uppercase tracking-widest block ${selectedFilter === 'Todos' ? 'text-emerald-400' : 'text-slate-400'}`}>
              Total General
            </span>
            <span className="block text-3xl font-heading font-extrabold leading-none tracking-tight">
              {total}
            </span>
          </div>
          <div className={`p-2.5 rounded-xl ${selectedFilter === 'Todos' ? 'bg-[#39A900] text-white' : 'bg-slate-50 text-[#007832]'}`}>
            <Users className="w-5 h-5" />
          </div>
        </div>
        <div className={`mt-3 text-[11px] leading-relaxed ${selectedFilter === 'Todos' ? 'text-slate-300' : 'text-slate-500'}`}>
          Vista completa de matriculados en la ficha.
        </div>
      </button>

      {/* 2. Riesgo Alto */}
      <button
        type="button"
        onClick={() => onFilterSelect('Alto')}
        className={`p-5 md:p-6 rounded-2xl text-left transition-all duration-300 relative overflow-hidden shadow-[0_4px_15px_rgba(0,0,0,0.01)] border cursor-pointer hover:scale-[1.02] ${
          selectedFilter === 'Alto'
            ? 'bg-rose-950 text-rose-50 border-rose-950 shadow-lg shadow-rose-900/15'
            : 'bg-white text-slate-800 border-slate-150 hover:border-rose-400 hover:shadow-md'
        }`}
        title="Filtrar por aprendices en riesgo ALTO (Rojo)"
        id="metric-card-alto"
      >
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <span className={`text-[10px] font-black uppercase tracking-widest block ${selectedFilter === 'Alto' ? 'text-rose-400' : 'text-slate-400'}`}>
              Riesgo Alto (≥6)
            </span>
            <span className="block text-3xl font-heading font-extrabold leading-none tracking-tight text-rose-650 dark:text-rose-400">
              {alto}
            </span>
          </div>
          <div className={`p-2.5 rounded-xl ${selectedFilter === 'Alto' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-600'}`}>
            <AlertCircle className="w-5 h-5" />
          </div>
        </div>
        <div className={`mt-3 text-[11px] leading-relaxed ${selectedFilter === 'Alto' ? 'text-rose-200/80' : 'text-slate-500'}`}>
          Alerta activa o inactivos sin reporte.
        </div>
      </button>

      {/* 3. Riesgo Medio */}
      <button
        type="button"
        onClick={() => onFilterSelect('Medio')}
        className={`p-5 md:p-6 rounded-2xl text-left transition-all duration-300 relative overflow-hidden shadow-[0_4px_15px_rgba(0,0,0,0.01)] border cursor-pointer hover:scale-[1.02] ${
          selectedFilter === 'Medio'
            ? 'bg-amber-950 text-amber-50 border-amber-950 shadow-lg shadow-amber-900/15'
            : 'bg-white text-slate-800 border-slate-150 hover:border-amber-400 hover:shadow-md'
        }`}
        title="Filtrar por aprendices en riesgo MEDIO (Naranja)"
        id="metric-card-medio"
      >
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <span className={`text-[10px] font-black uppercase tracking-widest block ${selectedFilter === 'Medio' ? 'text-amber-400' : 'text-slate-400'}`}>
              Riesgo Medio (3UI-5)
            </span>
            <span className="block text-3xl font-heading font-extrabold leading-none tracking-tight text-amber-600">
              {medio}
            </span>
          </div>
          <div className={`p-2.5 rounded-xl ${selectedFilter === 'Medio' ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-600'}`}>
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>
        <div className={`mt-3 text-[11px] leading-relaxed ${selectedFilter === 'Medio' ? 'text-amber-200/80' : 'text-slate-500'}`}>
          Puntaje intermedio. En observación constante.
        </div>
      </button>

      {/* 4. Riesgo Bajo */}
      <button
        type="button"
        onClick={() => onFilterSelect('Bajo')}
        className={`p-5 md:p-6 rounded-2xl text-left transition-all duration-300 relative overflow-hidden shadow-[0_4px_15px_rgba(0,0,0,0.01)] border cursor-pointer hover:scale-[1.02] ${
          selectedFilter === 'Bajo'
            ? 'bg-emerald-950 text-emerald-50 border-emerald-950 shadow-lg shadow-emerald-900/15'
            : 'bg-white text-slate-800 border-slate-150 hover:border-emerald-400 hover:shadow-md'
        }`}
        title="Filtrar por aprendices en riesgo BAJO (Verde)"
        id="metric-card-bajo"
      >
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <span className={`text-[10px] font-black uppercase tracking-widest block ${selectedFilter === 'Bajo' ? 'text-emerald-400' : 'text-slate-400'}`}>
              Riesgo Bajo (0-2)
            </span>
            <span className="block text-3xl font-heading font-extrabold leading-none tracking-tight text-emerald-600">
              {bajo}
            </span>
          </div>
          <div className={`p-2.5 rounded-xl ${selectedFilter === 'Bajo' ? 'bg-[#39A900] text-white' : 'bg-emerald-50 text-emerald-600'}`}>
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
        <div className={`mt-3 text-[11px] leading-relaxed ${selectedFilter === 'Bajo' ? 'text-emerald-200/80' : 'text-slate-500'}`}>
          Al día en entregas o puntajes mínimos.
        </div>
      </button>

    </div>
  );
}
