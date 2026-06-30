import { useState, useCallback } from 'react';
import { Aprendiz, Fase, AlertasEstado, Intervencion, FichaInfo } from '../types';
import { procesarTodosLosAprendices } from '../utils/riskCalculator';

export function useAlertasStore() {
  const [aprendices, setAprendices] = useState<Aprendiz[]>([]);
  const [fases, setFases] = useState<Fase[]>([]);
  const [hasPendingChanges, setHasPendingChanges] = useState<boolean>(false);
  const [selectedAprendicesIds, setSelectedAprendicesIds] = useState<string[]>([]);
  
  // Filtering and Sorting
  const [filterSearch, setFilterSearch] = useState<string>('');
  const [filterRiesgo, setFilterRiesgo] = useState<'Todos' | 'Posible deserción' | 'Riesgo alto' | 'Riesgo medio' | 'Riesgo bajo' | 'Sin dato suficiente'>('Todos');
  const [filterEstado, setFilterEstado] = useState<'Todos' | 'Sin intervención' | 'En seguimiento' | 'Intervenido'>('Todos');
  const [sortColumn, setSortColumn] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Load new spreadsheet data
  const setDatosCargados = useCallback((nuevosAprendices: Aprendiz[], nuevasFases: Fase[]) => {
    // Ensure each learner has an initialized historialIntervenciones array
    const safeLearners = (nuevosAprendices || []).map(ap => ({
      ...ap,
      historialIntervenciones: ap.historialIntervenciones || []
    }));
    // Recalculate using active phases at start
    const calculados = procesarTodosLosAprendices(safeLearners, nuevasFases);
    setAprendices(calculados);
    setFases(nuevasFases || []);
    setHasPendingChanges(false);
    setSelectedAprendicesIds([]);
    // Reset filters
    setFilterSearch('');
    setFilterRiesgo('Todos');
    setFilterEstado('Todos');
    setSortColumn('');
    setSortDirection('asc');
  }, []);

  // Update phases checkboxes and mark pending changes
  const toggleFaseCheckbox = useCallback((faseId: string) => {
    setFases(prev => {
      const updated = prev.map(fase => {
        if (fase.id === faseId) {
          const nextSelected = !fase.selected;
          return {
            ...fase,
            selected: nextSelected,
            evidencias: fase.evidencias.map(ev => ({ ...ev, selected: nextSelected }))
          };
        }
        return fase;
      });
      setHasPendingChanges(true);
      return updated;
    });
  }, []);

  const toggleEvidenciaCheckbox = useCallback((faseId: string, evNombre: string) => {
    setFases(prev => {
      const updated = prev.map(fase => {
        if (fase.id === faseId) {
          const updatedEvidencias = fase.evidencias.map(ev => {
            if (ev.nombre === evNombre) {
              return { ...ev, selected: !ev.selected };
            }
            return ev;
          });
          const anySelected = updatedEvidencias.some(e => e.selected);
          return {
            ...fase,
            evidencias: updatedEvidencias,
            selected: anySelected
          };
        }
        return fase;
      });
      setHasPendingChanges(true);
      return updated;
    });
  }, []);

  // Commit selected phases, recalculating alert scores
  const aplicarSeguimiento = useCallback(() => {
    setAprendices(prev => {
      const recalculado = procesarTodosLosAprendices(prev, fases);
      return recalculado;
    });
    setHasPendingChanges(false);
  }, [fases]);

  // Handle interventions (individual)
  const aplicarIntervencionIndividual = useCallback((
    documento: string,
    estadoId: 'Sin intervención' | 'En seguimiento' | 'Intervenido',
    intervencionDetalle: Omit<Intervencion, 'id'>
  ) => {
    setAprendices(prev => {
      return prev.map(ap => {
        if (ap.documento === documento) {
          const nuevaIntervencion: Intervencion = {
            id: `int-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            ...intervencionDetalle
          };
          return {
            ...ap,
            estadoIntervencion: estadoId,
            historialIntervenciones: [nuevaIntervencion, ...(ap.historialIntervenciones || [])]
          };
        }
        return ap;
      });
    });
  }, []);

  // Handle interventions (bulk)
  const aplicarIntervencionMasiva = useCallback((
    documentos: string[],
    estadoId: 'Sin intervención' | 'En seguimiento' | 'Intervenido',
    intervencionDetalle: Omit<Intervencion, 'id'>
  ) => {
    setAprendices(prev => {
      return prev.map(ap => {
        if (documentos.includes(ap.documento)) {
          const nuevaIntervencion: Intervencion = {
            id: `int-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            ...intervencionDetalle
          };
          return {
            ...ap,
            estadoIntervencion: estadoId,
            historialIntervenciones: [nuevaIntervencion, ...(ap.historialIntervenciones || [])]
          };
        }
        return ap;
      });
    });
    // Clear selections on success
    setSelectedAprendicesIds([]);
  }, []);

  // Selection toggles
  const toggleSeleccionAprendiz = useCallback((id: string) => {
    setSelectedAprendicesIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }, []);

  const toggleSeleccionarTodos = useCallback((idsFiltrados: string[]) => {
    setSelectedAprendicesIds(prev => {
      const allSelectedInFiltered = idsFiltrados.every(id => prev.includes(id));
      if (allSelectedInFiltered) {
        // Deselect all in filtered list
        return prev.filter(id => !idsFiltrados.includes(id));
      } else {
        // Select all in filtered list (add them to currently selected if not present)
        const toAdd = idsFiltrados.filter(id => !prev.includes(id));
        return [...prev, ...toAdd];
      }
    });
  }, []);

  // Reset entire dashboard back to uploading screen safely
  const reiniciarDashboard = useCallback(() => {
    setAprendices([]);
    setFases([]);
    setHasPendingChanges(false);
    setSelectedAprendicesIds([]);
    setFilterSearch('');
    setFilterRiesgo('Todos');
    setFilterEstado('Todos');
    setSortColumn('');
    setSortDirection('asc');
  }, []);

  return {
    aprendices,
    fases,
    hasPendingChanges,
    selectedAprendicesIds,
    filterSearch,
    filterRiesgo,
    filterEstado,
    sortColumn,
    sortDirection,

    // Setters
    setFilterSearch,
    setFilterRiesgo,
    setFilterEstado,
    setSortColumn,
    setSortDirection,
    setSelectedAprendicesIds,

    // Actions
    setDatosCargados,
    toggleFaseCheckbox,
    toggleEvidenciaCheckbox,
    aplicarSeguimiento,
    aplicarIntervencionIndividual,
    aplicarIntervencionMasiva,
    toggleSeleccionAprendiz,
    toggleSeleccionarTodos,
    reiniciarDashboard
  };
}
export type AlertasStore = ReturnType<typeof useAlertasStore>;
