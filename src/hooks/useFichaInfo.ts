import { useState, useEffect } from 'react';
import { FichaInfo } from '../types';

const STORAGE_KEY = 'sena_ficha_info';

const INITIAL_FICHA: FichaInfo = {
  regional: 'Antioquia',
  centroFormacion: 'Centro de Servicios y Gestión Empresarial',
  programaFormacion: '',
  nivel: 'Tecnólogo',
  numeroFicha: '',
  instructor: ''
};

export function useFichaInfo() {
  const [fichaInfo, setFichaInfo] = useState<FichaInfo>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          ...INITIAL_FICHA,
          ...parsed,
          // Guarantee regional and centro remain fixed as requested
          regional: 'Antioquia',
          centroFormacion: 'Centro de Servicios y Gestión Empresarial'
        };
      }
    } catch (e) {
      console.error("Error reading localStorage", e);
    }
    return INITIAL_FICHA;
  });

  const saveFichaInfo = (newInfo: Partial<FichaInfo>) => {
    setFichaInfo(prev => {
      const updated = {
        ...prev,
        ...newInfo,
        regional: 'Antioquia', // Non-editable overrides
        centroFormacion: 'Centro de Servicios y Gestión Empresarial'
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  return {
    fichaInfo,
    saveFichaInfo,
    isConfigured: !!(fichaInfo.programaFormacion && fichaInfo.numeroFicha && fichaInfo.instructor)
  };
}
