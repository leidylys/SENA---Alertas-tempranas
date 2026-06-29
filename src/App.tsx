import React, { useState, useEffect } from 'react';
import { useAlertasStore } from './hooks/useAlertasStore';
import { FichaInfo, Aprendiz, Fase } from './types';
import UploadSection from './components/UploadSection';
import AdminSection from './components/AdminSection';
import FichasTable from './components/FichasTable';
import DashboardPage from './pages/DashboardPage';
import { signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { auth, googleAuthProvider, isFirebaseConfigured } from './lib/firebase.ts';
import { 
  syncInstructor, 
  fetchFichas, 
  fetchFichaDetails, 
  syncLearnersToDb,
  updateInstructorRole,
  loginAsInstructorWithDb
} from './lib/api.ts';
import { 
  LogOut, 
  User, 
  Plus, 
  Database, 
  BookOpen, 
  Calendar, 
  ChevronRight, 
  Sparkles, 
  Building,
  RefreshCw,
  HelpCircle,
  Clock,
  Loader2,
  ShieldCheck,
  Lock,
  Key,
  GraduationCap
} from 'lucide-react';

const formatInstructorNombre = (nombre: string, correo?: string): string => {
  if (!nombre) return 'Instructor';
  
  const cleanEmail = (correo || '').trim().toLowerCase();
  const lowerNombre = nombre.trim().toLowerCase();
  
  // If the name is exactly an email, or contains @, or is identical to the cleaned email:
  if (nombre.includes('@') || lowerNombre === cleanEmail) {
    const prefix = nombre.split('@')[0];
    const cleanPrefix = prefix.replace(/[0-9_.-]/g, ' ').trim();
    if (!cleanPrefix) return 'Instructor';
    return cleanPrefix
      .split(/\s+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
  
  // If it's a simple flat lowercased word without spaces, let's also capitalize it
  if (nombre === nombre.toLowerCase() && !nombre.includes(' ')) {
    const cleanWord = nombre.replace(/[0-9_.-]/g, ' ').trim();
    if (!cleanWord) return nombre;
    return cleanWord
      .split(/\s+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
  
  return nombre;
};

export default function App() {
  const store = useAlertasStore();
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [instructorProfile, setInstructorProfile] = useState<{ id: number; nombre: string; correo: string; rol: string } | null>(null);
  const [savedFichasState, setSavedFichasState] = useState<any[]>([]);
  const deduplicateFichas = (fichasArray: any[]) => {
    if (!Array.isArray(fichasArray)) return [];
    const seenIds = new Set();
    return fichasArray.filter(f => {
      if (!f) return false;
      const identifier = f.id !== undefined && f.id !== null ? f.id : f.codigoFicha;
      if (identifier === undefined || identifier === null) return true;
      if (seenIds.has(identifier)) {
        return false;
      }
      seenIds.add(identifier);
      return true;
    });
  };
  const setSavedFichas = (fichasArray: any[]) => {
    setSavedFichasState(deduplicateFichas(fichasArray));
  };
  const savedFichas = savedFichasState;
  const [fichasSearchQuery, setFichasSearchQuery] = useState('');
  const [fichasTabFilter, setFichasTabFilter] = useState<'todas' | 'activas' | 'futuras' | 'finalizadas'>('activas');
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isSyncingDb, setIsSyncingDb] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  
  // Diagnostic states
  const [lastStep, setLastStep] = useState<string>('idle');
  const [lastErrorCode, setLastErrorCode] = useState<string>('');
  const [lastBackendStatus, setLastBackendStatus] = useState<number | null>(null);
  const [resumeMessage, setResumeMessage] = useState<string>('');
  
  // UI views: 'fichas_list' | 'upload_new' | 'active_dashboard'
  const [currentView, setCurrentView] = useState<'fichas_list' | 'upload_new' | 'active_dashboard'>('fichas_list');
  const [fichaInfo, setFichaInfo] = useState<FichaInfo | null>(null);
  const [isSavingNewFicha, setIsSavingNewFicha] = useState(false);
  const [adminActiveTab, setAdminActiveTab] = useState<'programacion' | 'aprendices_masivo' | 'alertas_criticas'>('programacion');
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [tempRol, setTempRol] = useState('');
  const [tempNombre, setTempNombre] = useState('');
  const [adminKey, setAdminKey] = useState('');

  const isUserAdmin = instructorProfile?.rol === 'Administrativo' || instructorProfile?.rol === 'Coordinación' || instructorProfile?.rol === 'Coordinacion';

  // 1. Monitor Firebase Authentication State and Handle Redirects
  useEffect(() => {
    if (!isFirebaseConfigured) {
      setAuthError("La configuración de Firebase no está completa. Verifique las variables de entorno.");
      setIsLoadingAuth(false);
      return;
    }

    const checkRedirectResult = async () => {
      console.log('[DEV LOG] LOGIN_STEP: redirect_result_start');
      setLastStep('redirect_result_start');
      try {
        const result = await getRedirectResult(auth);
        if (result) {
          console.log('[DEV LOG] LOGIN_STEP: redirect_result_success');
          setLastStep('redirect_result_success');
          setResumeMessage(`Usuario redirect autenticado: ${result.user?.email || 'sin-correo'}`);
        } else {
          console.log('[DEV LOG] No active redirect result.');
        }
      } catch (err: any) {
        const code = err.code || 'unknown';
        const message = err.message || '';
        console.error('[DEV LOG] LOGIN_STEP: redirect_result_error', err);
        setLastStep('redirect_result_error');
        setLastErrorCode(code);
        setResumeMessage(`Error Redirect: ${message.substring(0, 100)}`);
        
        if (code === 'auth/api-key-not-valid') {
          setAuthError('La API Key configurada no es válida para Firebase Authentication.');
        } else if (code === 'auth/unauthorized-domain') {
          setAuthError('El dominio actual no está autorizado en Firebase Authentication.');
        } else {
          setAuthError(`Error de redirección: ${message}`);
        }
      }
    };

    checkRedirectResult();

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        console.log('[DEV LOG] email autenticado:', user.email);
        setResumeMessage(`Autenticado con Firebase: ${user.email}`);
        
        try {
          console.log('[DEV LOG] LOGIN_STEP: get_id_token_start');
          setLastStep('get_id_token_start');
          const token = await user.getIdToken();
          
          console.log('[DEV LOG] LOGIN_STEP: get_id_token_success');
          setLastStep('get_id_token_success');
          setAuthToken(token);
          
          // Verify instructor profile in Cloud SQL
          console.log('[DEV LOG] LOGIN_STEP: sync_start | endpoint llamado: POST /api/instructor/sync');
          setLastStep('sync_start');
          setIsSyncingDb(true);
          const syncRes = await syncInstructor(token);
          
          console.log('[DEV LOG] LOGIN_STEP: sync_success | status HTTP recibido: 200 | respuesta resumida del backend:', syncRes);
          setLastStep('sync_success');
          setLastBackendStatus(200);
          
          if (syncRes && syncRes.instructor) {
            setInstructorProfile(syncRes.instructor);
            setTempRol(syncRes.instructor.rol);
            setTempNombre(syncRes.instructor.nombre);
            setAuthError(null); // Clear errors on success
          }
          
          // Load Fichas that this instructor participates in
          const fichasData = await fetchFichas(token);
          setSavedFichas(fichasData);
          setCurrentView('fichas_list');
        } catch (err: any) {
          console.error('Error synchronizing database session:', err);
          const status = err.status || 500;
          setLastBackendStatus(status);
          setLastStep('sync_error');
          setResumeMessage(`Status: ${status} | Error: ${err.details || err.message}`);
          
          // Identify the exact reason for refusal and set the required user-friendly error message
          const msg = err.details || err.message || '';
          if (status === 403 || msg.includes('inactiva')) {
            setAuthError('Su cuenta se encuentra inactiva. Comuníquese con coordinación.');
          } else if (status === 401 || msg.includes('autorizada') || msg.includes('registrado') || msg.includes('autorizado')) {
            setAuthError('Su cuenta no se encuentra autorizada para ingresar al sistema. Comuníquese con coordinación.');
          } else {
            setAuthError(`No fue posible validar su perfil institucional (status ${status}). Comuníquese con soporte.`);
          }
          
          // Clear authenticated user states to force them to the login view with the error shown
          setCurrentUser(null);
          setAuthToken(null);
          setInstructorProfile(null);
          setSavedFichas([]);
          setFichaInfo(null);
          store.reiniciarDashboard();
          
          // Log out from Firebase client-side too so state remains consistent
          await signOut(auth).catch(() => null);
        } finally {
          setIsSyncingDb(false);
          setIsLoadingAuth(false);
        }
      } else {
        setCurrentUser(null);
        setAuthToken(null);
        setInstructorProfile(null);
        setSavedFichas([]);
        setFichaInfo(null);
        store.reiniciarDashboard();
        setIsLoadingAuth(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Refresh saved fichas list helper
  const reloadFichas = async () => {
    if (!authToken) return;
    try {
      const data = await fetchFichas(authToken);
      setSavedFichas(data);
    } catch (err) {
      console.error('Error reloading saved cohort list:', err);
    }
  };

  // Login handler
  const handleLogin = async () => {
    if (!isFirebaseConfigured) {
      setAuthError("La configuración de Firebase no está completa. Verifique las variables de entorno.");
      return;
    }
    
    console.log('[DEV LOG] LOGIN_STEP: click_login');
    setLastStep('click_login');
    setIsLoadingAuth(true);
    setAuthError(null);
    setLastErrorCode('');
    setLastBackendStatus(null);
    setResumeMessage('');
    
    console.log('[DEV LOG] LOGIN_STEP: popup_start');
    setLastStep('popup_start');
    
    try {
      const result = await signInWithPopup(auth, googleAuthProvider);
      console.log('[DEV LOG] LOGIN_STEP: popup_success');
      setLastStep('popup_success');
      setResumeMessage(`Usuario popup autenticado: ${result.user?.email || 'sin-correo'}`);
    } catch (err: any) {
      const code = err.code || 'unknown';
      const message = err.message || '';
      console.error('[DEV LOG] LOGIN_STEP: popup_error', err);
      setLastStep('popup_error');
      setLastErrorCode(code);
      setResumeMessage(`Error Firebase: ${message.substring(0, 100)}`);
      
      // Specifically check for invalid API key
      if (code === 'auth/api-key-not-valid' || message.includes('api-key-not-valid')) {
        setAuthError('La API Key configurada no es válida para Firebase Authentication.');
        setIsLoadingAuth(false);
        return;
      }
      
      // Specifically check for unauthorized domain
      if (code === 'auth/unauthorized-domain' || message.includes('unauthorized-domain')) {
        setAuthError('El dominio actual no está autorizado en Firebase Authentication.');
        setIsLoadingAuth(false);
        return;
      }
      
      // If error is popup-blocked, closed-by-user, or cancelled-popup, attempt redirect as fallback
      if (
        code === 'auth/popup-blocked' ||
        code === 'auth/popup-closed-by-user' ||
        code === 'auth/cancelled-popup-request'
      ) {
        console.log('[DEV LOG] LOGIN_STEP: redirect_start (Intento de redirección como alternativa)');
        setLastStep('redirect_start');
        setResumeMessage('Popup bloqueado/cancelado. Intentando redirección...');
        try {
          await signInWithRedirect(auth, googleAuthProvider);
        } catch (redirErr: any) {
          console.error('[DEV LOG] Error starting redirect:', redirErr);
          setAuthError('No fue posible abrir el inicio de sesión con Google. Verifique que el navegador permita ventanas emergentes.');
          setIsLoadingAuth(false);
        }
      } else {
        setAuthError(`Error de autenticación con Google: ${message}`);
        setIsLoadingAuth(false);
      }
    }
  };

  // Logout handler
  const handleLogout = async () => {
    try {
      if (isFirebaseConfigured) {
        await signOut(auth);
      }
    } catch (err) {
      console.error('Sign out error:', err);
    } finally {
      setCurrentUser(null);
      setAuthToken(null);
      setInstructorProfile(null);
      setSavedFichas([]);
      setFichaInfo(null);
      store.reiniciarDashboard();
      setCurrentView('fichas_list');
    }
  };

  // Modify active profile role with admin password check
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authToken) return;
    try {
      const updated = await updateInstructorRole(authToken, tempRol, tempNombre, adminKey);
      setInstructorProfile(updated);
      setIsEditingProfile(false);
      setAdminKey(''); // Reset passcode
      // Reload fichas catalogue instantly to adjust scoping (e.g. admins see all, instructors see assigned)
      const data = await fetchFichas(authToken);
      setSavedFichas(data);
    } catch (err: any) {
      alert(err.message || 'No se pudo guardar la información del rol.');
    }
  };

  // Categorize a Ficha by today's date against its start & end dates
  const getFichaDateStatus = (fechaInicioStr?: string, fechaFinStr?: string) => {
    if (!fechaInicioStr || !fechaFinStr) return 'activas';
    
    // Normalize today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Parse dates (treating as UTC or local safely)
    const start = new Date(fechaInicioStr);
    const end = new Date(fechaFinStr);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    
    if (today < start) {
      return 'futuras';
    } else if (today > end) {
      return 'finalizadas';
    } else {
      return 'activas';
    }
  };

  // Filtered Fichas of formacion list based on active search text and date tab selected
  const getFilteredFichas = () => {
    return savedFichas.filter(ficha => {
      // Search query filtering
      const query = fichasSearchQuery.toLowerCase().trim();
      const matchesSearch = !query || 
        (ficha.codigoFicha && ficha.codigoFicha.toLowerCase().includes(query)) ||
        (ficha.programaFormacion && ficha.programaFormacion.toLowerCase().includes(query)) ||
        (ficha.instructor && ficha.instructor.toLowerCase().includes(query)) ||
        (ficha.nivel && ficha.nivel.toLowerCase().includes(query));

      if (!matchesSearch) return false;

      // Tab filtering
      if (fichasTabFilter === 'todas') return true;
      const status = getFichaDateStatus(ficha.fechaInicio, ficha.fechaFin);
      return status === fichasTabFilter;
    });
  };

  // Select/activate a previously saved Ficha from general catalog
  const handleSelectSavedFicha = async (codigoFicha: string) => {
    if (!authToken) return;
    setIsSyncingDb(true);
    try {
      const data = await fetchFichaDetails(authToken, codigoFicha);
      if (data && data.ficha) {
        // Construct the Ficha metadata block
        const loadedFichaInfo: FichaInfo = {
          regional: 'Antioquia',
          centroFormacion: 'Centro de Servicios y Gestión Empresarial',
          programaFormacion: data.ficha.programaFormacion,
          nivel: data.ficha.nivel,
          numeroFicha: data.ficha.codigoFicha,
          instructor: instructorProfile?.nombre || 'Instructor Responsable',
          ultimoSeguimiento: data.ficha.ultimoSeguimiento,
          fechaInicio: data.ficha.fechaInicio,
          fechaFin: data.ficha.fechaFin
        };
        
        // Rebuild standard phases for checking risk
        // A standard full-track course usually has standard phases
        const mockPhases: Fase[] = [
          {
            id: 'fase-analisis',
            nombre: 'Fase 1: Análisis',
            selected: true,
            evidencias: [
              { nombre: 'Evidencia 1: Mapa conceptual del software', ponderacion: 25, selected: true },
              { nombre: 'Evidencia 2: Especificación de requerimientos', ponderacion: 25, selected: true },
              { nombre: 'Evidencia 3: Caso de estudio y modelado', ponderacion: 50, selected: true },
            ]
          },
          {
            id: 'fase-diseno',
            nombre: 'Fase 2: Diseño',
            selected: false,
            evidencias: [
              { nombre: 'Evidencia 1: Diseño de base de datos relacional', ponderacion: 30, selected: false },
              { nombre: 'Evidencia 2: Prototipado y arquitectura de interfaz', ponderacion: 30, selected: false },
              { nombre: 'Evidencia 3: Manual de diseño de software', ponderacion: 40, selected: false },
            ]
          },
          {
            id: 'fase-desarrollo',
            nombre: 'Fase 3: Desarrollo',
            selected: false,
            evidencias: [
              { nombre: 'Evidencia 1: Codificación de módulos API Express', ponderacion: 40, selected: false },
              { nombre: 'Evidencia 2: Pruebas unitarias de software', ponderacion: 30, selected: false },
              { nombre: 'Evidencia 3: Despliegue en servidores en la nube', ponderacion: 30, selected: false },
            ]
          },
          {
            id: 'fase-evaluacion',
            nombre: 'Fase 4: Evaluación',
            selected: false,
            evidencias: [
              { nombre: 'Evidencia 1: Manual técnico y documentación', ponderacion: 50, selected: false },
              { nombre: 'Evidencia 2: Informe de pruebas de aceptación', ponderacion: 50, selected: false },
            ]
          }
        ];

        // Synchronize our React store state
        store.setDatosCargados(data.aprendices, mockPhases);
        setFichaInfo(loadedFichaInfo);
        setCurrentView('active_dashboard');
      }
    } catch (err) {
      console.error(err);
      alert('Error recuperando la ficha seleccionada.');
    } finally {
      setIsSyncingDb(false);
    }
  };

  // Intercept data loaded callback from Excel parser and persist in Cloud SQL first
  const handleDataLoadedSync = async (
    aprendices: Aprendiz[],
    phases: Fase[],
    info: FichaInfo
  ) => {
    if (!authToken) {
      alert('Debe iniciar sesión para guardar datos');
      return;
    }

    setIsSavingNewFicha(true);
    try {
      // 1. Sync structures to secure Google Cloud SQL backend
      await syncLearnersToDb(
        authToken,
        info.numeroFicha,
        info.programaFormacion,
        info.nivel,
        '2026-01-15', // Fecha inicio estimación
        '2027-12-15', // Fecha fin estimación
        aprendices
      );

      // 2. Refreshsaved fichas catalogue in memory
      await reloadFichas();

      // 3. Load standard React State
      store.setDatosCargados(aprendices, phases);
      setFichaInfo(info);
      setCurrentView('active_dashboard');
    } catch (err: any) {
      console.error(err);
      alert('No se pudo guardar la ficha en Google Cloud SQL: ' + err.message);
    } finally {
      setIsSavingNewFicha(false);
    }
  };

  // Back to home
  const handleReset = () => {
    store.reiniciarDashboard();
    setFichaInfo(null);
    reloadFichas();
    setCurrentView('fichas_list');
  };

  // ==========================================
  // RENDER LEVEL A: loading auth spinner
  // ==========================================
  if (isLoadingAuth) {
    return (
      <div className="min-h-screen bg-[#F4FBF7] flex flex-col items-center justify-center p-6" id="sena-loader-screen">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-white border border-[#39A900]/25 rounded-full flex items-center justify-center mx-auto shadow-sm">
            <Loader2 className="w-8 h-8 text-[#39A900] animate-spin" />
          </div>
          <p className="text-sm font-semibold text-slate-600">Sincronizando sesión segura con SENA Alertas Tempranas...</p>
        </div>
      </div>
    );
  }

  // ==========================================
  // RENDER LEVEL B: unauthenticated login portal
  // ==========================================
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 md:p-8 relative overflow-hidden" id="sena-login-screen">
        {/* Modern glowing ambient details */}
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-[#39A900]/5 rounded-full filter blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-[#007832]/5 rounded-full filter blur-3xl pointer-events-none"></div>
        
        <div className="w-full max-w-md bg-white rounded-3xl border border-slate-150 shadow-[0_10px_40px_rgba(0,0,0,0.02)] p-8 md:p-10 relative overflow-hidden space-y-6 z-10">
          
          {/* Accent top lines */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#39A900]"></div>

          {/* New refined branding presentation */}
          <div className="text-center space-y-3">
            <div className="mx-auto w-14 h-14 bg-[#39A900]/10 border border-[#39A900]/25 rounded-2xl flex items-center justify-center shadow-xs">
              <span className="text-[#39A900] text-2xl font-black select-none font-heading">S</span>
            </div>
            
            <div className="space-y-1">
              <h1 className="text-2xl font-heading font-extrabold text-slate-900 tracking-tight leading-none">
                Alertas Tempranas
              </h1>
              <p className="text-[9px] text-[#39A900] font-black uppercase tracking-widest bg-emerald-50 border border-emerald-100/50 px-2 py-0.5 rounded-md inline-block">
                Centro de Servicios y Gestión Empresarial
              </p>
            </div>
            
            <p className="text-[11px] text-slate-500 max-w-xs mx-auto leading-relaxed font-medium">
              Plataforma institucional de retención pedagógica. Inicie sesión de forma segura utilizando sus credenciales de acceso.
            </p>
          </div>

          {/* SECURE GOOGLE SIGN-IN FLOW */}
          <div className="space-y-4">
            {authError && (
              <div className="bg-rose-50 text-rose-700 text-xs font-semibold p-3.5 rounded-xl border border-rose-100 text-center leading-normal" id="login-error-display">
                ⚠️ {authError}
              </div>
            )}

            <button
              onClick={handleLogin}
              className="w-full bg-white hover:bg-slate-50 text-slate-700 font-extrabold text-xs py-3.5 px-4 rounded-xl shadow-md border border-slate-200 transition-all duration-300 flex items-center justify-center gap-2.5 cursor-pointer"
            >
              <svg className="w-4 h-4 mr-1 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              <span>Ingresar con Google</span>
            </button>

            {/* DIAGNOSTIC PANEL FOR DEVELOPMENT ONLY */}
            {((import.meta as any).env?.DEV || process.env.NODE_ENV !== 'production') && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5 text-[11px] font-mono text-slate-600 text-left" id="dev-diagnostics-panel">
                <div className="flex items-center justify-between border-b border-slate-200 pb-1.5 font-bold text-slate-800">
                  <span>🛠️ Panel de Diagnóstico (DEV)</span>
                  <span className="text-[9px] bg-emerald-100 text-emerald-800 font-sans font-bold px-1.5 py-0.5 rounded uppercase">Activo</span>
                </div>
                <div className="grid grid-cols-2 gap-x-2 gap-y-1 leading-relaxed">
                  <div className="text-slate-500 font-medium font-sans">Último paso:</div>
                  <div className="font-semibold text-slate-800 break-all">{lastStep || 'Ninguno'}</div>
                  
                  <div className="text-slate-500 font-medium font-sans">Código error:</div>
                  <div className={`font-semibold break-all ${lastErrorCode ? 'text-rose-600' : 'text-slate-800'}`}>
                    {lastErrorCode || 'Ninguno'}
                  </div>
                  
                  <div className="text-slate-500 font-medium font-sans">Status backend:</div>
                  <div className={`font-semibold ${lastBackendStatus === 200 ? 'text-emerald-600' : lastBackendStatus ? 'text-rose-600' : 'text-slate-800'}`}>
                    {lastBackendStatus || 'Ninguno'}
                  </div>
                </div>
                {resumeMessage && (
                  <div className="bg-white border border-slate-150 rounded p-2 text-[10px] break-words text-slate-500 leading-normal">
                    <span className="font-sans font-bold text-slate-700 block mb-0.5">Mensaje resumido:</span>
                    {resumeMessage}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Secure lock note */}
          <div className="flex flex-col items-center justify-center gap-1 text-[10px] text-slate-400 font-extrabold uppercase tracking-wider text-center">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#39A900]" />
              <span>Resguardo seguro con Google Cloud SQL</span>
            </div>
          </div>

        </div>
      </div>
    );
  }

  // ==========================================
  // RENDER LEVEL C: authenticated experiences
  // ==========================================
  return (
    <main className="min-h-screen bg-slate-50 text-slate-800 p-4 md:p-8" id="sena-authenticated-app">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Top Header Section for authenticated Instructors */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-tr from-[#007832] to-[#39A900] text-white rounded-full flex items-center justify-center shadow-xs">
              <User className="w-5 h-5" />
            </div>
            
            <div className="text-left">
              <div className="text-[10px] text-slate-450 font-bold uppercase tracking-widest">Instructor Activo</div>
              
              {isEditingProfile ? (
                <form onSubmit={handleSaveProfile} className="flex flex-wrap items-center gap-2 mt-1">
                  <input 
                    type="text" 
                    value={tempNombre} 
                    onChange={e => setTempNombre(e.target.value)} 
                    placeholder="Nombre Completo"
                    className="text-xs px-2 py-1 border border-slate-300 rounded text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <select
                    value={tempRol}
                    onChange={e => setTempRol(e.target.value)}
                    className="text-xs px-2 py-1 border border-slate-300 rounded text-slate-700 bg-white"
                  >
                    <option value="Instructor Técnico">Instructor Técnico</option>
                    <option value="Vocero de Ficha">Vocero de Ficha</option>
                    <option value="Instructor Transversal">Instructor Transversal</option>
                    <option value="Apoyo de Coordinación">Apoyo de Coordinación</option>
                    <option value="Administrativo">Administrativo (Planeador / Coordinador)</option>
                  </select>
                  {tempRol === 'Administrativo' && (
                    <input 
                      type="password" 
                      value={adminKey} 
                      onChange={e => setAdminKey(e.target.value)} 
                      placeholder="Ingrese Clave (ej: sena2026)" 
                      className="text-xs px-2 py-1 border border-amber-300 bg-amber-50/70 rounded text-slate-800 font-bold focus:outline-none focus:ring-1 focus:ring-amber-500 placeholder:font-normal"
                      required
                    />
                  )}
                  <button type="submit" className="text-[10px] bg-[#39A900] hover:bg-[#319200] text-white font-bold py-1 px-2.5 rounded-sm">
                    Guardar
                  </button>
                  <button type="button" onClick={() => setIsEditingProfile(false)} className="text-[10px] text-slate-400 hover:text-slate-600 py-1 px-1.5">
                    Cancelar
                  </button>
                </form>
              ) : (
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-neutral-800">
                    {formatInstructorNombre(instructorProfile?.nombre || currentUser.displayName || currentUser.email, currentUser.email || undefined)} 
                    <span className="ml-2 font-mono text-[10.5px] text-emerald-700 bg-[#39A900]/10 px-2 py-0.5 rounded-full font-bold">
                      {instructorProfile?.rol || 'Instructor'}
                    </span>
                  </h3>
                  <button 
                    onClick={() => {
                      setIsEditingProfile(true);
                      setTempNombre(instructorProfile?.nombre || '');
                      setTempRol(instructorProfile?.rol || 'Instructor Técnico');
                    }}
                    className="text-[10px] text-[#39A900] hover:underline font-semibold"
                  >
                    (Editar rol)
                  </button>
                </div>
              )}
              
              <div className="text-[11px] text-slate-400">{currentUser.email}</div>
            </div>
          </div>

          {/* Quick Stats or Actions */}
          <div className="flex items-center gap-3">
            <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#39A900]/5 border border-[#39A900]/15 text-xs text-slate-600">
              <Database className="w-3.5 h-3.5 text-[#39A900]" />
              <span>Conectado a Cloud SQL con <strong className="text-slate-800">{savedFichas.length}</strong> fichas guardadas</span>
            </div>

            <button
              onClick={handleLogout}
              className="bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold py-2 px-3 rounded-lg border border-red-200/50 transition-colors flex items-center justify-center gap-1.5"
              id="user-logout-btn"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Cerrar sesión</span>
            </button>
          </div>

        </div>

        {/* ==========================================
            VIEW 1: saved fichas catalog landing
            ========================================== */}
        {currentView === 'fichas_list' && (
          <div className="space-y-6" id="fichas-catalog-view">
            
            {/* Welcome banner card */}
            <div className="bg-gradient-to-r from-[#007832] to-[#39A900] rounded-2xl p-6 md:p-8 text-white shadow-md relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="space-y-2 text-center md:text-left z-10">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/10 text-xs font-semibold backdrop-blur-xs">
                  Servicio Nacional de Aprendizaje • SENA
                </span>
                <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
                  Sistema de Alertas Tempranas - Retención
                </h1>
                <p className="text-sm text-white/90 md:max-w-xl font-medium">
                  Portal de seguimiento pedagógico. Acceda y refresque el análisis de sus grupos o suba nuevos reportes excel para iniciar el diagnóstico.
                </p>
              </div>

              {/* Upload cohort button trigger */}
              {!isUserAdmin && (
                <button
                  onClick={() => setCurrentView('upload_new')}
                  className="z-10 shrink-0 bg-white hover:bg-emerald-50 text-neutral-850 font-extrabold text-xs py-3 px-5 rounded-xl border border-white/30 transition-all flex items-center justify-center gap-2 shadow-md"
                  id="create-new-ficha-trigger-btn"
                >
                  <Plus className="w-4 h-4 text-[#39A900]" />
                  <span>Subir nueva ficha</span>
                </button>
              )}
            </div>

            {isUserAdmin && (
              <AdminSection
                authToken={authToken || ''}
                onSuccessSync={reloadFichas}
                activeTab={adminActiveTab}
                onChangeTab={setAdminActiveTab}
                savedFichas={savedFichas}
                onSelectFicha={handleSelectSavedFicha}
              />
            )}

            {/* Fichas title layout */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2 flex-wrap gap-2">
                <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-[#39A900]" />
                  <span>Mis Fichas de Formación</span>
                </h2>
                <div className="flex items-center gap-2">
                  {isUserAdmin && (
                    <button
                      onClick={() => {
                        setAdminActiveTab('aprendices_masivo');
                        document.getElementById('admin-centre-panel')?.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className="p-1.5 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[10.5px] font-bold rounded flex items-center gap-1.5 transition-all border border-emerald-200 cursor-pointer shadow-4xs"
                      id="admin-quick-upload-btn-main"
                    >
                      <GraduationCap className="w-3.5 h-3.5 text-[#39A900]" />
                      <span>Cargar reporte de aprendices</span>
                    </button>
                  )}
                  <button 
                    onClick={reloadFichas}
                    className="p-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10.5px] font-bold rounded flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Refrescar</span>
                  </button>
                </div>
              </div>

              {isSyncingDb ? (
                <div className="text-center py-16 bg-white rounded-xl border border-slate-200 space-y-3">
                  <Loader2 className="w-8 h-8 text-[#39A900] animate-spin mx-auto" />
                  <p className="text-xs text-slate-400 font-semibold">Cargando fichas de la base de datos de Google...</p>
                </div>
              ) : savedFichas.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-xl border border-slate-200 p-8 max-w-xl mx-auto space-y-4 shadow-3xs">
                  <div className="w-12 h-12 bg-neutral-100 rounded-full flex items-center justify-center mx-auto text-slate-400">
                    <Database className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-slate-800">No se encontraron fichas guardadas</h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Aún no tiene grupos asignados o registros en la base de datos de Google Cloud SQL. Suba un archivo Excel para iniciar el mapa de alertas tempranas.
                    </p>
                  </div>
                  {!isUserAdmin && (
                    <button
                      onClick={() => setCurrentView('upload_new')}
                      className="bg-[#39A900] hover:bg-[#2f8800] text-white text-xs font-bold py-2.5 px-4 rounded-lg inline-flex items-center gap-1"
                      id="upload-first-ficha-btn"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Iniciar primera carga</span>
                    </button>
                  )}
                </div>
              ) : (
                <FichasTable
                  savedFichas={savedFichas}
                  onSelectFicha={handleSelectSavedFicha}
                  onSuccessSync={reloadFichas}
                  authToken={authToken || ''}
                  isUserAdmin={isUserAdmin}
                />
              )}

            </div>

          </div>
        )}

        {/* ==========================================
            VIEW 2: upload new Cohort section
            ========================================== */}
        {currentView === 'upload_new' && (
          <div className="space-y-4" id="upload-new-excel-wrapper">
            
            <button 
              onClick={() => setCurrentView('fichas_list')}
              className="text-xs text-slate-500 hover:text-slate-800 font-bold inline-flex items-center gap-1 bg-slate-200/50 hover:bg-slate-200 px-3 py-1.5 rounded-lg border border-slate-300/30"
              id="back-to-fichas-catalog-btn"
            >
              <span>← Volver a mis fichas</span>
            </button>

            {isSavingNewFicha ? (
              <div className="text-center py-20 bg-white rounded-xl border border-slate-200 shadow-md flex flex-col items-center justify-center space-y-4">
                <Loader2 className="w-12 h-12 text-[#39A900] animate-spin" />
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-slate-800">Guardando Ficha en Google Cloud SQL</h3>
                  <p className="text-xs text-slate-400">Insertando registros de instructores, programa, alumnos y cálculo de riesgos iniciales...</p>
                </div>
              </div>
            ) : (
              <UploadSection onDataLoaded={handleDataLoadedSync} />
            )}
          </div>
        )}

        {/* ==========================================
            VIEW 3: active Ficha dashboard
            ========================================== */}
        {currentView === 'active_dashboard' && fichaInfo && (
          <div id="active-ficha-dashboard-container">
            <DashboardPage
              aprendices={store.aprendices}
              fases={store.fases}
              fichaInfo={fichaInfo}
              store={store}
              onReiniciar={handleReset}
              authToken={authToken || ''} // Pass raw token so inner operations like saving can coordinate directly with backend database as well!
              isAdmin={isUserAdmin}
            />
          </div>
        )}

      </div>
    </main>
  );
}
