import { Aprendiz, Fase } from '../types';

export const ESTRATEGIAS_DISPONIBLES = [
  'Material visual adicional',
  'Flexibilización del tiempo',
  'Explicación individual',
  'Reforzamiento de instrucciones',
  'Acompañamiento sincrónico',
  'Seguimiento personalizado',
  'Recordatorio institucional',
  'Remisión a bienestar',
  'Remisión a Líder de Ficha',
  'Plan de Mejoramiento Académico'
];

export const CAUSAS_RIESGO = [
  'Dificultades personales o familiares',
  'Dificultades económicas',
  'Personalidad conflictiva',
  'Problemas emocionales o psicológicos',
  'Dificultades en el manejo de la plataforma',
  'Falta de habilidades digitales básicas'
];

// Helper to get standard date relative to today for mock purposes
const getFechaRelativa = (diasAtras: number): string => {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() - diasAtras);
  const dia = String(fecha.getDate()).padStart(2, '0');
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const anio = fecha.getFullYear();
  return `${dia}/${mes}/${anio}`;
};

// Raw qualifications and participants mocks (so they pass through parse logic)
export const CALIFICACIONES_MOCK_RAW = [
  {
    "Nombre completo": "Carlos Alberto Gómez Restrepo",
    "Nombre": "Carlos Alberto",
    "Apellido": "Gómez Restrepo",
    "Documento de identidad": "1017283491",
    "Correo electrónico": "carlos.gomez@misena.edu.co",
    "Evidencia 1: Foro Social": "A",
    "Evidencia 2: Cuestionario Técnico": "D",
    "Evidencia 3: Taller Práctico Algoritmia": "A",
    "Total Fase 1: Inducción": "100",
    "Evidencia 4: Mapa de Procesos": "*",
    "Evidencia 5: Maquetación HTML": "*",
    "Total Fase 2: Análisis": "80"
  },
  {
    "Nombre completo": "Diana Marcela Patiño Rojas",
    "Nombre": "Diana Marcela",
    "Apellido": "Patiño Rojas",
    "Documento de identidad": "1036492019",
    "Correo electrónico": "diana.patino@misena.edu.co",
    "Evidencia 1: Foro Social": "A",
    "Evidencia 2: Cuestionario Técnico": "A",
    "Evidencia 3: Taller Práctico Algoritmia": "A",
    "Total Fase 1: Inducción": "100",
    "Evidencia 4: Mapa de Procesos": "A",
    "Evidencia 5: Maquetación HTML": "A",
    "Total Fase 2: Análisis": "100"
  },
  {
    "Nombre completo": "Andrés Felipe Jaramillo Uribe",
    "Nombre": "Andrés Felipe",
    "Apellido": "Jaramillo Uribe",
    "Documento de identidad": "1152438190",
    "Correo electrónico": "andres.jaramillo@misena.edu.co",
    "Evidencia 1: Foro Social": "A",
    "Evidencia 2: Cuestionario Técnico": "D",
    "Evidencia 3: Taller Práctico Algoritmia": "D",
    "Total Fase 1: Inducción": "60",
    "Evidencia 4: Mapa de Procesos": "*",
    "Evidencia 5: Maquetación HTML": "D",
    "Total Fase 2: Análisis": "40"
  },
  {
    "Nombre completo": "Sandra Patricia Montoya Alzate",
    "Nombre": "Sandra Patricia",
    "Apellido": "Montoya Alzate",
    "Documento de identidad": "1040382910",
    "Correo electrónico": "sandra.montoya@misena.edu.co",
    "Evidencia 1: Foro Social": "A",
    "Evidencia 2: Cuestionario Técnico": "A",
    "Evidencia 3: Taller Práctico Algoritmia": "*",
    "Total Fase 1: Inducción": "80",
    "Evidencia 4: Mapa de Procesos": "A",
    "Evidencia 5: Maquetación HTML": "A",
    "Total Fase 2: Análisis": "90"
  },
  {
    "Nombre completo": "Mateo Vasco Serna",
    "Nombre": "Mateo",
    "Apellido": "Vasco Serna",
    "Documento de identidad": "1214738592",
    "Correo electrónico": "mateo.vasco@misena.edu.co",
    "Evidencia 1: Foro Social": "D",
    "Evidencia 2: Cuestionario Técnico": "*",
    "Evidencia 3: Taller Práctico Algoritmia": "*",
    "Total Fase 1: Inducción": "20",
    "Evidencia 4: Mapa de Procesos": "*",
    "Evidencia 5: Maquetación HTML": "*",
    "Total Fase 2: Análisis": "0"
  },
  {
    "Nombre completo": "Valentina Cardona Castro",
    "Nombre": "Valentina",
    "Apellido": "Cardona Castro",
    "Documento de identidad": "1035928104",
    "Correo electrónico": "valentina.cardona@misena.edu.co",
    "Evidencia 1: Foro Social": "A",
    "Evidencia 2: Cuestionario Técnico": "A",
    "Evidencia 3: Taller Práctico Algoritmia": "A",
    "Total Fase 1: Inducción": "100",
    "Evidencia 4: Mapa de Procesos": "A",
    "Evidencia 5: Maquetación HTML": "D",
    "Total Fase 2: Análisis": "80"
  },
  {
    "Nombre completo": "Jonathan Estiven Chaverra Pérez",
    "Nombre": "Jonathan Estiven",
    "Apellido": "Chaverra Pérez",
    "Documento de identidad": "1015382012",
    "Correo electrónico": "jonathan.chaverra@misena.edu.co",
    "Evidencia 1: Foro Social": "A",
    "Evidencia 2: Cuestionario Técnico": "A",
    "Evidencia 3: Taller Práctico Algoritmia": "A",
    "Total Fase 1: Inducción": "100",
    "Evidencia 4: Mapa de Procesos": "A",
    "Evidencia 5: Maquetación HTML": "A",
    "Total Fase 2: Análisis": "100"
  },
  {
    "Nombre completo": "Isabella Tobón Ruiz",
    "Nombre": "Isabella",
    "Apellido": "Tobón Ruiz",
    "Documento de identidad": "1020485912",
    "Correo electrónico": "isabella.tobon@misena.edu.co",
    "Evidencia 1: Foro Social": "*",
    "Evidencia 2: Cuestionario Técnico": "D",
    "Evidencia 3: Taller Práctico Algoritmia": "*",
    "Total Fase 1: Inducción": "10",
    "Evidencia 4: Mapa de Procesos": "*",
    "Evidencia 5: Maquetación HTML": "D",
    "Total Fase 2: Análisis": "5"
  }
];

export const PARTICIPANTES_MOCK_RAW = [
  { "Documento de identidad": "1017283491", "Último acceso": getFechaRelativa(2) },  // 2 days ago
  { "Documento de identidad": "1036492019", "Último acceso": getFechaRelativa(1) },  // 1 day ago
  { "Documento de identidad": "1152438190", "Último acceso": getFechaRelativa(8) },  // 8 days ago
  { "Documento de identidad": "1040382910", "Último acceso": getFechaRelativa(0) },  // today
  { "Documento de identidad": "1214738592", "Último acceso": getFechaRelativa(16) }, // 16 days ago
  { "Documento de identidad": "1035928104", "Último acceso": getFechaRelativa(4) },  // 4 days ago
  { "Documento de identidad": "1015382012", "Último acceso": getFechaRelativa(1) },  // 1 day ago
  { "Documento de identidad": "1020485912", "Último acceso": getFechaRelativa(22) }  // 22 days ago
];

// Reconstructed list for quicker direct seeding if needed
export const GENERATED_FASES_MOCK: Fase[] = [
  {
    id: "Fase 1: Inducción",
    nombre: "Fase 1: Inducción",
    selected: true,
    evidencias: [
      { nombre: "Evidencia 1: Foro Social", selected: true },
      { nombre: "Evidencia 2: Cuestionario Técnico", selected: true },
      { nombre: "Evidencia 3: Taller Práctico Algoritmia", selected: true }
    ]
  },
  {
    id: "Fase 2: Análisis",
    nombre: "Fase 2: Análisis",
    selected: true,
    evidencias: [
      { nombre: "Evidencia 4: Mapa de Procesos", selected: true },
      { nombre: "Evidencia 5: Maquetación HTML", selected: true }
    ]
  }
];
