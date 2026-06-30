import React from 'react';
import { Users, AlertOctagon, AlertCircle, AlertTriangle, CheckCircle2, HelpCircle, ShieldAlert, FileText } from 'lucide-react';

interface DashboardCardsProps {
  total: number;
  desercion: number;
  alto: number;
  medio: number;
  bajo: number;
  sinDato: number;
  sinIntervencion: number;
  remitidosBienestar: number;
  selectedFilter: 'Todos' | 'Posible deserción' | 'Riesgo alto' | 'Riesgo medio' | 'Riesgo bajo' | 'Sin dato suficiente' | 'Sin intervención' | 'Remitidos a Bienestar';
  onFilterSelect: (filter: 'Todos' | 'Posible deserción' | 'Riesgo alto' | 'Riesgo medio' | 'Riesgo bajo' | 'Sin dato suficiente' | 'Sin intervención' | 'Remitidos a Bienestar') => void;
}

export default function DashboardCards({
  total,
  desercion,
  alto,
  medio,
  bajo,
  sinDato,
  sinIntervencion,
  remitidosBienestar,
  selectedFilter,
  onFilterSelect
}: DashboardCardsProps) {
  
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-4" id="dashboard-metric-cards-row">
      
      {/* 1. Total Card */}
      <button
        type="button"
        onClick={() => onFilterSelect('Todos')}
        className={`p-3 rounded-2xl text-left transition-all duration-300 relative overflow-hidden shadow-[0_4px_15px_rgba(0,0,0,0.01)] border cursor-pointer hover:scale-[1.02] flex flex-col justify-between min-h-[110px] ${
          selectedFilter === 'Todos'
            ? 'bg-slate-900 text-white border-slate-950 shadow-lg shadow-slate-900/10'
            : 'bg-white text-slate-800 border-slate-150 hover:border-[#39A900] hover:shadow-md'
        }`}
        title="Filtrar por todos los aprendices"
        id="metric-card-total"
      >
        <div className="flex justify-between items-start w-full">
          <span className={`text-[8.5px] font-black uppercase tracking-widest block ${selectedFilter === 'Todos' ? 'text-emerald-400' : 'text-slate-400'}`}>
            Total
          </span>
          <div className={`p-1 rounded-lg ${selectedFilter === 'Todos' ? 'bg-[#39A900] text-white' : 'bg-slate-50 text-[#007832]'}`}>
            <Users className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="mt-2">
          <span className="block text-xl font-heading font-extrabold leading-none tracking-tight">
            {total}
          </span>
          <span className={`block text-[9px] mt-1 ${selectedFilter === 'Todos' ? 'text-slate-400' : 'text-slate-500'}`}>
            Matriculados
          </span>
        </div>
      </button>

      {/* 2. Posible Deserción */}
      <button
        type="button"
        onClick={() => onFilterSelect('Posible deserción')}
        className={`p-3 rounded-2xl text-left transition-all duration-300 relative overflow-hidden shadow-[0_4px_15px_rgba(0,0,0,0.01)] border cursor-pointer hover:scale-[1.02] flex flex-col justify-between min-h-[110px] ${
          selectedFilter === 'Posible deserción'
            ? 'bg-rose-950 text-rose-50 border-rose-950 shadow-lg shadow-rose-900/15'
            : 'bg-white text-slate-800 border-slate-150 hover:border-rose-500 hover:shadow-md'
        }`}
        title="Filtrar por posible deserción"
        id="metric-card-desercion"
      >
        <div className="flex justify-between items-start w-full">
          <span className={`text-[8.5px] font-black uppercase tracking-widest block ${selectedFilter === 'Posible deserción' ? 'text-rose-400' : 'text-slate-400'}`}>
            Deserción
          </span>
          <div className={`p-1 rounded-lg ${selectedFilter === 'Posible deserción' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-600'}`}>
            <AlertOctagon className="w-3.5 h-3.5 animate-pulse" />
          </div>
        </div>
        <div className="mt-2">
          <span className="block text-xl font-heading font-extrabold leading-none tracking-tight text-rose-600 dark:text-rose-450">
            {desercion}
          </span>
          <span className={`block text-[9px] mt-1 ${selectedFilter === 'Posible deserción' ? 'text-rose-300' : 'text-slate-500'}`}>
            Inactivos / Alerta
          </span>
        </div>
      </button>

      {/* 3. Riesgo Alto */}
      <button
        type="button"
        onClick={() => onFilterSelect('Riesgo alto')}
        className={`p-3 rounded-2xl text-left transition-all duration-300 relative overflow-hidden shadow-[0_4px_15px_rgba(0,0,0,0.01)] border cursor-pointer hover:scale-[1.02] flex flex-col justify-between min-h-[110px] ${
          selectedFilter === 'Riesgo alto'
            ? 'bg-red-950 text-red-50 border-red-950 shadow-lg shadow-red-900/15'
            : 'bg-white text-slate-800 border-slate-150 hover:border-red-400 hover:shadow-md'
        }`}
        title="Filtrar por riesgo alto"
        id="metric-card-alto"
      >
        <div className="flex justify-between items-start w-full">
          <span className={`text-[8.5px] font-black uppercase tracking-widest block ${selectedFilter === 'Riesgo alto' ? 'text-red-400' : 'text-slate-400'}`}>
            Riesgo Alto
          </span>
          <div className={`p-1 rounded-lg ${selectedFilter === 'Riesgo alto' ? 'bg-red-650 text-white' : 'bg-red-50 text-red-650'}`}>
            <AlertCircle className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="mt-2">
          <span className="block text-xl font-heading font-extrabold leading-none tracking-tight text-red-650">
            {alto}
          </span>
          <span className={`block text-[9px] mt-1 ${selectedFilter === 'Riesgo alto' ? 'text-red-300' : 'text-slate-500'}`}>
            Alerta Crítica
          </span>
        </div>
      </button>

      {/* 4. Riesgo Medio */}
      <button
        type="button"
        onClick={() => onFilterSelect('Riesgo medio')}
        className={`p-3 rounded-2xl text-left transition-all duration-300 relative overflow-hidden shadow-[0_4px_15px_rgba(0,0,0,0.01)] border cursor-pointer hover:scale-[1.02] flex flex-col justify-between min-h-[110px] ${
          selectedFilter === 'Riesgo medio'
            ? 'bg-amber-950 text-amber-50 border-amber-950 shadow-lg shadow-amber-900/15'
            : 'bg-white text-slate-800 border-slate-150 hover:border-amber-400 hover:shadow-md'
        }`}
        title="Filtrar por riesgo medio"
        id="metric-card-medio"
      >
        <div className="flex justify-between items-start w-full">
          <span className={`text-[8.5px] font-black uppercase tracking-widest block ${selectedFilter === 'Riesgo medio' ? 'text-amber-400' : 'text-slate-400'}`}>
            Riesgo Medio
          </span>
          <div className={`p-1 rounded-lg ${selectedFilter === 'Riesgo medio' ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-600'}`}>
            <AlertTriangle className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="mt-2">
          <span className="block text-xl font-heading font-extrabold leading-none tracking-tight text-amber-600">
            {medio}
          </span>
          <span className={`block text-[9px] mt-1 ${selectedFilter === 'Riesgo medio' ? 'text-amber-300' : 'text-slate-500'}`}>
            Seguimiento Activo
          </span>
        </div>
      </button>

      {/* 5. Riesgo Bajo */}
      <button
        type="button"
        onClick={() => onFilterSelect('Riesgo bajo')}
        className={`p-3 rounded-2xl text-left transition-all duration-300 relative overflow-hidden shadow-[0_4px_15px_rgba(0,0,0,0.01)] border cursor-pointer hover:scale-[1.02] flex flex-col justify-between min-h-[110px] ${
          selectedFilter === 'Riesgo bajo'
            ? 'bg-emerald-950 text-emerald-50 border-emerald-950 shadow-lg shadow-emerald-900/15'
            : 'bg-white text-slate-800 border-slate-150 hover:border-emerald-400 hover:shadow-md'
        }`}
        title="Filtrar por riesgo bajo"
        id="metric-card-bajo"
      >
        <div className="flex justify-between items-start w-full">
          <span className={`text-[8.5px] font-black uppercase tracking-widest block ${selectedFilter === 'Riesgo bajo' ? 'text-emerald-400' : 'text-slate-400'}`}>
            Riesgo Bajo
          </span>
          <div className={`p-1 rounded-lg ${selectedFilter === 'Riesgo bajo' ? 'bg-[#39A900] text-white' : 'bg-emerald-50 text-[#39A900]'}`}>
            <CheckCircle2 className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="mt-2">
          <span className="block text-xl font-heading font-extrabold leading-none tracking-tight text-[#39A900]">
            {bajo}
          </span>
          <span className={`block text-[9px] mt-1 ${selectedFilter === 'Riesgo bajo' ? 'text-emerald-300' : 'text-slate-500'}`}>
            Al Día
          </span>
        </div>
      </button>

      {/* 6. Sin Dato Suficiente */}
      <button
        type="button"
        onClick={() => onFilterSelect('Sin dato suficiente')}
        className={`p-3 rounded-2xl text-left transition-all duration-300 relative overflow-hidden shadow-[0_4px_15px_rgba(0,0,0,0.01)] border cursor-pointer hover:scale-[1.02] flex flex-col justify-between min-h-[110px] ${
          selectedFilter === 'Sin dato suficiente'
            ? 'bg-slate-800 text-slate-50 border-slate-800 shadow-lg shadow-slate-900/15'
            : 'bg-white text-slate-800 border-slate-150 hover:border-slate-400 hover:shadow-md'
        }`}
        title="Filtrar por sin dato suficiente"
        id="metric-card-sindato"
      >
        <div className="flex justify-between items-start w-full">
          <span className={`text-[8.5px] font-black uppercase tracking-widest block ${selectedFilter === 'Sin dato suficiente' ? 'text-slate-300' : 'text-slate-400'}`}>
            Sin Datos
          </span>
          <div className={`p-1 rounded-lg ${selectedFilter === 'Sin dato suficiente' ? 'bg-slate-500 text-white' : 'bg-slate-50 text-slate-500'}`}>
            <HelpCircle className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="mt-2">
          <span className="block text-xl font-heading font-extrabold leading-none tracking-tight text-slate-650">
            {sinDato}
          </span>
          <span className={`block text-[9px] mt-1 ${selectedFilter === 'Sin dato suficiente' ? 'text-slate-400' : 'text-slate-500'}`}>
            Sin Reporte LMS
          </span>
        </div>
      </button>

      {/* 7. Sin Intervención */}
      <button
        type="button"
        onClick={() => onFilterSelect('Sin intervención')}
        className={`p-3 rounded-2xl text-left transition-all duration-300 relative overflow-hidden shadow-[0_4px_15px_rgba(0,0,0,0.01)] border cursor-pointer hover:scale-[1.02] flex flex-col justify-between min-h-[110px] ${
          selectedFilter === 'Sin intervención'
            ? 'bg-blue-950 text-blue-50 border-blue-950 shadow-lg shadow-blue-900/15'
            : 'bg-white text-slate-800 border-slate-150 hover:border-blue-400 hover:shadow-md'
        }`}
        title="Filtrar por aprendices sin intervención"
        id="metric-card-sin-intervencion"
      >
        <div className="flex justify-between items-start w-full">
          <span className={`text-[8.5px] font-black uppercase tracking-widest block ${selectedFilter === 'Sin intervención' ? 'text-blue-300' : 'text-slate-400'}`}>
            Sin Interv.
          </span>
          <div className={`p-1 rounded-lg ${selectedFilter === 'Sin intervención' ? 'bg-blue-600 text-white' : 'bg-slate-50 text-blue-600'}`}>
            <FileText className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="mt-2">
          <span className="block text-xl font-heading font-extrabold leading-none tracking-tight text-blue-650">
            {sinIntervencion}
          </span>
          <span className={`block text-[9px] mt-1 ${selectedFilter === 'Sin intervención' ? 'text-blue-300' : 'text-slate-500'}`}>
            Por Atender
          </span>
        </div>
      </button>

      {/* 8. Remitidos a Bienestar */}
      <button
        type="button"
        onClick={() => onFilterSelect('Remitidos a Bienestar')}
        className={`p-3 rounded-2xl text-left transition-all duration-300 relative overflow-hidden shadow-[0_4px_15px_rgba(0,0,0,0.01)] border cursor-pointer hover:scale-[1.02] flex flex-col justify-between min-h-[110px] ${
          selectedFilter === 'Remitidos a Bienestar'
            ? 'bg-purple-950 text-purple-50 border-purple-950 shadow-lg shadow-purple-900/15'
            : 'bg-white text-slate-800 border-slate-150 hover:border-purple-400 hover:shadow-md'
        }`}
        title="Filtrar por aprendices remitidos a Bienestar"
        id="metric-card-remitidos-bienestar"
      >
        <div className="flex justify-between items-start w-full">
          <span className={`text-[8.5px] font-black uppercase tracking-widest block ${selectedFilter === 'Remitidos a Bienestar' ? 'text-purple-300' : 'text-slate-400'}`}>
            Bienestar
          </span>
          <div className={`p-1 rounded-lg ${selectedFilter === 'Remitidos a Bienestar' ? 'bg-purple-600 text-white' : 'bg-slate-50 text-purple-650'}`}>
            <ShieldAlert className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="mt-2">
          <span className="block text-xl font-heading font-extrabold leading-none tracking-tight text-purple-650">
            {remitidosBienestar}
          </span>
          <span className={`block text-[9px] mt-1 ${selectedFilter === 'Remitidos a Bienestar' ? 'text-purple-300' : 'text-slate-500'}`}>
            Casos Remitidos
          </span>
        </div>
      </button>

    </div>
  );
}
