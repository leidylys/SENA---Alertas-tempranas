import React, { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, Sparkles, Building, Briefcase, GraduationCap, User, Info, HelpCircle } from 'lucide-react';
import { FichaInfo } from '../types';
import { useFichaInfo } from '../hooks/useFichaInfo';
import { leerArchivoExcel, leerArchivoExcel2D, detectarFases, normalizarAprendices, combinarDatos, detectExcelReportType } from '../utils/excelParser';
import { CALIFICACIONES_MOCK_RAW, PARTICIPANTES_MOCK_RAW, GENERATED_FASES_MOCK } from '../data/mockData';

interface UploadSectionProps {
  onDataLoaded: (aprendices: any[], fases: any[], info: FichaInfo) => void;
}

export default function UploadSection({ onDataLoaded }: UploadSectionProps) {
  const { fichaInfo, saveFichaInfo } = useFichaInfo();

  // Excel Files state
  const [qualificationsFile, setQualificationsFile] = useState<File | null>(null);
  const [participantsFile, setParticipantsFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  // Drag and drop states
  const [dragQuals, setDragQuals] = useState(false);
  const [dragParts, setDragParts] = useState(false);

  const qualsInputRef = useRef<HTMLInputElement>(null);
  const partsInputRef = useRef<HTMLInputElement>(null);

  // Handle Qualifications uploaded
  const handleQualsFile = (file: File) => {
    setQualificationsFile(file);
    
    // Auto-detect number of ficha with regex /(\d{5,})/
    const match = file.name.match(/(\d{5,})/);
    if (match && match[1]) {
      const detectedFicha = match[1];
      saveFichaInfo({ numeroFicha: detectedFicha });
    }
  };

  const handleDragOverQuals = (e: React.DragEvent) => {
    e.preventDefault();
    setDragQuals(true);
  };
  const handleDragLeaveQuals = () => setDragQuals(false);
  
  const handleDropQuals = (e: React.DragEvent) => {
    e.preventDefault();
    setDragQuals(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleQualsFile(e.dataTransfer.files[0]);
    }
  };

  // Handle Participants uploaded
  const handlePartsFile = (file: File) => {
    setParticipantsFile(file);
  };

  const handleDragOverParts = (e: React.DragEvent) => {
    e.preventDefault();
    setDragParts(true);
  };
  const handleDragLeaveParts = () => setDragParts(false);

  const handleDropParts = (e: React.DragEvent) => {
    e.preventDefault();
    setDragParts(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handlePartsFile(e.dataTransfer.files[0]);
    }
  };

  // Trigger spreadsheet compilation
  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qualificationsFile) return;

    setLoading(true);
    try {
      // Validate that qualificationsFile corresponds to a qualifications report
      const rows2D = await leerArchivoExcel2D(qualificationsFile);
      const reportType = detectExcelReportType(rows2D);
      if (reportType === 'aprendices') {
        alert("El archivo cargado corresponde a un reporte de aprendices y no a un reporte de calificaciones.");
        setLoading(false);
        return;
      }

      // 1. Process Qualifications Excel (obligatorio)
      const parsedQuals = await leerArchivoExcel(qualificationsFile);
      const phases = detectarFases(parsedQuals.headers);
      let list = normalizarAprendices(parsedQuals.rows, phases);

      // 2. Process Participants Excel (opcional)
      if (participantsFile) {
        const parsedParts = await leerArchivoExcel(participantsFile);
        list = combinarDatos(list, parsedParts.rows);
      }

      // Automatically construct or supplement Ficha Info if fields are empty
      const detectedFicha = qualificationsFile.name.match(/(\d{5,})/)?.[1] || fichaInfo.numeroFicha || '2281902';
      const resolvedInfo: FichaInfo = {
        ...fichaInfo,
        numeroFicha: detectedFicha,
        programaFormacion: fichaInfo.programaFormacion || 'Análisis y Desarrollo de Software (ADSO)',
        instructor: fichaInfo.instructor || 'Instructor Técnico Responsable',
        nivel: fichaInfo.nivel || 'Tecnólogo',
        regional: 'Antioquia',
        centroFormacion: 'Centro de Servicios y Gestión Empresarial'
      };

      onDataLoaded(list, phases, resolvedInfo);
    } catch (err) {
      console.error(err);
      alert("Error al parsear los archivos de calificaciones. Valida que el archivo excel corresponda a un reporte exportado oficial del LMS.");
    } finally {
      setLoading(false);
    }
  };

  // Trigger Seeding Mock Data
  const handleLoadMockData = () => {
    setLoading(true);
    setTimeout(() => {
      // Create copy of pre-defined mock data
      const infoMock: FichaInfo = {
        regional: 'Antioquia',
        centroFormacion: 'Centro de Servicios y Gestión Empresarial',
        programaFormacion: 'Análisis y Desarrollo de Software (ADSO)',
        nivel: 'Tecnólogo',
        numeroFicha: '2281902',
        instructor: 'Dra. María Cleofé Restrepo'
      };

      saveFichaInfo(infoMock);
      
      const mockedPhases = JSON.parse(JSON.stringify(GENERATED_FASES_MOCK));
      let mockedStudents = normalizarAprendices(CALIFICACIONES_MOCK_RAW, mockedPhases);
      mockedStudents = combinarDatos(mockedStudents, PARTICIPANTES_MOCK_RAW);

      onDataLoaded(mockedStudents, mockedPhases, infoMock);
      setLoading(false);
    }, 700);
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6" id="upload-landing-container">
      
      {/* Institutional Top Title and Banner */}
      <div className="bg-gradient-to-r from-sena-700 via-sena-650 to-sena-600 rounded-2xl p-6 md:p-8 text-white shadow-md relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="space-y-2 text-center md:text-left z-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/10 text-xs font-semibold backdrop-blur-xs">
            Servicio Nacional de Aprendizaje • SENA
          </div>
          <h1 className="text-2xl md:text-3.5xl font-extrabold tracking-tight">
            Sistema de Alertas Tempranas - Retención
          </h1>
          <p className="text-sm text-sena-50 md:max-w-xl font-medium">
            Plataforma institucional para instructores de Antioquia. Analiza calificaciones y registros de ingreso para proponer planes oportunos de acompañamiento.
          </p>
        </div>
        
        {/* Draw Vector SENA Emblem */}
        <div className="w-24 h-24 shrink-0 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center p-2.5 border border-white/20 shadow-inner z-10 hover:scale-105 transition-transform">
          <div className="relative w-full h-full flex flex-col items-center justify-center">
            {/* outer ring */}
            <div className="w-14 h-14 rounded-full border-[5px] border-white flex items-center justify-center">
              <span className="text-white text-3xl font-black select-none tracking-tighter">S</span>
            </div>
            <span className="text-[10px] font-bold tracking-widest text-[#FFF] mt-1">SENA</span>
          </div>
        </div>

        {/* Ambient subtle decorative circle */}
        <div className="absolute -right-16 -bottom-16 w-64 h-64 bg-sena-400/20 rounded-full blur-2xl"></div>
      </div>

      <div className="max-w-3xl mx-auto">
        
        {/* Centered Upload Drag Zone Box */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-6">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Upload className="w-5 h-5 text-sena-600" />
            <h2 className="text-base font-bold text-slate-800">Cargar Archivos de Reporte LMS</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Box 1: Qualifications (OBLIGATORIO) */}
            <div className="space-y-1">
              <span className="block text-xs font-bold text-slate-700 flex items-center gap-1">
                1. Archivo de Calificaciones
                <span className="text-red-500 font-bold">*</span>
              </span>
              
              <div
                onDragOver={handleDragOverQuals}
                onDragLeave={handleDragLeaveQuals}
                onDrop={handleDropQuals}
                onClick={() => qualsInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[140px] hover:border-sena-400 hover:bg-sena-50/15 ${
                  dragQuals ? 'border-sena-500 bg-sena-100/10' : 'border-slate-250 bg-slate-50/30'
                }`}
                id="qualifications-excel-dropzone"
              >
                <input
                  type="file"
                  ref={qualsInputRef}
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={e => {
                    if (e.target.files && e.target.files[0]) {
                      handleQualsFile(e.target.files[0]);
                    }
                  }}
                />
                <FileSpreadsheet className={`w-8 h-8 mb-2 ${qualificationsFile ? 'text-sena-500 animate-bounce' : 'text-slate-400'}`} />
                <span className="text-xs font-bold text-slate-700 break-all px-2 block">
                  {qualificationsFile ? qualificationsFile.name : 'Subir excel Calificaciones'}
                </span>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  {qualificationsFile ? 'Archivo seleccionado' : 'Arrastra y suelta aquí o interactúa'}
                </span>
              </div>
            </div>

            {/* Box 2: Participants list (OPCIONAL) */}
            <div className="space-y-1">
              <span className="block text-xs font-bold text-slate-600 flex items-center gap-1">
                2. Archivo de Participantes (Opcional)
              </span>
              
              <div
                onDragOver={handleDragOverParts}
                onDragLeave={handleDragLeaveParts}
                onDrop={handleDropParts}
                onClick={() => partsInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[140px] hover:border-blue-450 hover:bg-blue-50/10 ${
                  dragParts ? 'border-blue-500 bg-blue-100/10' : 'border-slate-250 bg-slate-50/30'
                }`}
                id="participants-excel-dropzone"
              >
                <input
                  type="file"
                  ref={partsInputRef}
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={e => {
                    if (e.target.files && e.target.files[0]) {
                      handlePartsFile(e.target.files[0]);
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

          <div className="flex items-center gap-1.5 p-2.5 rounded-md bg-stone-50 border border-slate-100 text-[10.5px] text-slate-500">
            <Info className="w-4 h-4 text-sena-500 shrink-0" />
            <span>Para un diagnóstico preciso, el excel de calificaciones debe contener las columnas de documento e identificadores.</span>
          </div>

          {/* Action trigger buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-3 pt-4 border-t border-slate-100">
            
            {/* Primary Analysis trigger */}
            <button
              onClick={handleAnalyze}
              disabled={!qualificationsFile || loading}
              className="w-full sm:flex-1 bg-sena-500 hover:bg-sena-600 active:bg-sena-700 disabled:bg-slate-100 disabled:text-slate-400 text-white font-extrabold text-sm py-3 px-6 rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
              id="analyze-excel-data-btn"
            >
              {loading ? (
                <span>Cargando y ordenando...</span>
              ) : (
                <span>Analizar Aprendices</span>
              )}
            </button>

            {/* Seed Mock Example trigger */}
            <button
              type="button"
              onClick={handleLoadMockData}
              disabled={loading}
              className="w-full sm:w-auto bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-3.5 px-5 rounded-xl border border-slate-200/80 shadow-3xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              title="Cargar simulación institucional prefabricada"
              id="mock-load-demo-btn"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
              Usar datos de ejemplo
            </button>

          </div>

        </div>

      </div>

    </div>
  );
}
