-- ============================================================================
-- SCRIPT DE CREACIÓN DE BASE DE DATOS Y DATOS SEMILLA PARA SENA ALERTAS TEMPRANAS
-- Compatible con PostgreSQL y Neon DB
-- ============================================================================

-- 1. Tabla de Instructores
CREATE TABLE IF NOT EXISTS instructores (
    id SERIAL PRIMARY KEY,
    uid TEXT UNIQUE,
    nombre TEXT,
    correo TEXT NOT NULL UNIQUE,
    contrasena TEXT NOT NULL DEFAULT 'sena123',
    rol TEXT NOT NULL DEFAULT 'Instructor Técnico',
    estado TEXT NOT NULL DEFAULT 'Activo',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 2. Tabla de Programas de Formación
CREATE TABLE IF NOT EXISTS programas_formacion (
    id SERIAL PRIMARY KEY,
    codigo TEXT NOT NULL UNIQUE,
    nombre TEXT NOT NULL,
    nivel TEXT NOT NULL DEFAULT 'Tecnólogo',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 3. Tabla de Fichas de Formación
CREATE TABLE IF NOT EXISTS fichas (
    id SERIAL PRIMARY KEY,
    codigo_ficha TEXT NOT NULL UNIQUE,
    programa_id INTEGER NOT NULL REFERENCES programas_formacion(id) ON DELETE CASCADE,
    fecha_inicio TEXT,
    fecha_fin TEXT,
    ultimo_seguimiento TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 4. Tabla Intermedia de Instructor - Ficha (Many-to-Many)
CREATE TABLE IF NOT EXISTS instructor_ficha (
    id SERIAL PRIMARY KEY,
    instructor_id INTEGER NOT NULL REFERENCES instructores(id) ON DELETE CASCADE,
    ficha_id INTEGER NOT NULL REFERENCES fichas(id) ON DELETE CASCADE,
    rol_en_ficha TEXT NOT NULL DEFAULT 'Instructor Técnico',
    area TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 5. Tabla de Aprendices por Ficha
CREATE TABLE IF NOT EXISTS aprendices_fichas (
    id SERIAL PRIMARY KEY,
    ficha_id INTEGER NOT NULL REFERENCES fichas(id) ON DELETE CASCADE,
    documento TEXT NOT NULL,
    nombre TEXT NOT NULL,
    correo TEXT NOT NULL,
    telefono TEXT,
    nivel_riesgo TEXT NOT NULL DEFAULT 'Bajo',
    estado_intervencion TEXT NOT NULL DEFAULT 'Sin intervención',
    ultimo_acceso TEXT,
    dias_sin_acceso INTEGER,
    puntaje_riesgo INTEGER NOT NULL DEFAULT 0,
    evidencias JSONB NOT NULL DEFAULT '{}'::jsonb,
    tipo_documento TEXT DEFAULT 'CC',
    resumen_fases JSONB NOT NULL DEFAULT '{}'::jsonb,
    estado_aprendiz TEXT NOT NULL DEFAULT 'Activo',
    observacion_estado TEXT,
    fecha_ultimo_reporte TEXT,
    fecha_inactivacion TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 6. Tabla de Seguimientos Históricos (Bitácora)
CREATE TABLE IF NOT EXISTS seguimientos_historico (
    id SERIAL PRIMARY KEY,
    aprendiz_ficha_id INTEGER NOT NULL REFERENCES aprendices_fichas(id) ON DELETE CASCADE,
    instructor_id INTEGER NOT NULL REFERENCES instructores(id),
    fecha TIMESTAMP NOT NULL DEFAULT NOW(),
    estado_previo TEXT NOT NULL,
    estado_nuevo TEXT NOT NULL,
    detalles TEXT NOT NULL,
    compromiso_fecha TEXT,
    tipo_seguimiento TEXT,
    evidencias_pendientes INTEGER,
    dias_sin_acceso INTEGER,
    numero_llamado INTEGER,
    
    -- Campos unificados de Bitácora
    codigo_ficha TEXT,
    usuario_responsable_nombre TEXT,
    usuario_responsable_rol TEXT,
    medio_comunicacion TEXT,
    fecha_registro TIMESTAMP DEFAULT NOW(),
    fecha_envio_mensaje TEXT,
    fecha_respuesta_aprendiz TEXT,
    fecha_proximo_seguimiento TEXT,
    asunto TEXT,
    cuerpo_mensaje TEXT,
    observacion TEXT,
    respuesta_aprendiz TEXT,
    acuerdos_establecidos TEXT,
    compromisos TEXT,
    proxima_accion TEXT,
    fecha_ultimo_ingreso TEXT,
    total_evidencias INTEGER,
    evidencias_enviadas INTEGER,
    evidencias_aprobadas INTEGER,
    evidencias_desaprobadas INTEGER,
    detalle_evidencias_pendientes TEXT,
    creado_por_id INTEGER,
    creado_por_nombre TEXT,
    creado_por_rol TEXT,
    editable_por_rol TEXT,
    origen_registro TEXT,
    parent_seguimiento_id INTEGER,
    
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 7. Tabla de Alertas Críticas (Escalamiento)
CREATE TABLE IF NOT EXISTS alertas_criticas (
    id SERIAL PRIMARY KEY,
    aprendiz_ficha_id INTEGER NOT NULL REFERENCES aprendices_fichas(id) ON DELETE CASCADE,
    instructor_id INTEGER NOT NULL REFERENCES instructores(id),
    total_llamados INTEGER NOT NULL DEFAULT 0,
    evidencias_pendientes INTEGER NOT NULL DEFAULT 0,
    dias_sin_acceso INTEGER,
    ultimo_acceso TEXT,
    historial_resumido TEXT NOT NULL,
    nivel_riesgo TEXT NOT NULL DEFAULT 'Alto',
    estado TEXT NOT NULL DEFAULT 'Pendiente de revisión',
    fecha_escalamiento TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 8. Tabla de Competencias de Formación
CREATE TABLE IF NOT EXISTS competencias_formacion (
    id SERIAL PRIMARY KEY,
    programa_id INTEGER NOT NULL REFERENCES programas_formacion(id) ON DELETE CASCADE,
    codigo_competencia TEXT NOT NULL,
    nombre_competencia TEXT NOT NULL,
    area_competencia TEXT,
    texto_original_ncl TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 9. Tabla de Raps de Formación (Resultados de Aprendizaje)
CREATE TABLE IF NOT EXISTS raps_formacion (
    id SERIAL PRIMARY KEY,
    competencia_id INTEGER NOT NULL REFERENCES competencias_formacion(id) ON DELETE CASCADE,
    codigo_rap TEXT NOT NULL,
    descripcion_rap TEXT NOT NULL,
    texto_original_rap TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 10. Tabla de Itinerarios de Ficha
CREATE TABLE IF NOT EXISTS itinerarios_ficha (
    id SERIAL PRIMARY KEY,
    ficha_id INTEGER NOT NULL REFERENCES fichas(id) ON DELETE CASCADE,
    archivo_origen TEXT,
    fk_itinerary TEXT,
    fecha_inicio_ficha TEXT,
    fecha_fin_ficha TEXT,
    fecha_carga TIMESTAMP DEFAULT NOW(),
    creado_por TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 11. Tabla de Detalle del Itinerario de la Ficha
CREATE TABLE IF NOT EXISTS itinerario_detalle_ficha (
    id SERIAL PRIMARY KEY,
    ficha_id INTEGER NOT NULL REFERENCES fichas(id) ON DELETE CASCADE,
    itinerario_id INTEGER NOT NULL REFERENCES itinerarios_ficha(id) ON DELETE CASCADE,
    competencia_id INTEGER NOT NULL REFERENCES competencias_formacion(id) ON DELETE CASCADE,
    rap_id INTEGER NOT NULL REFERENCES raps_formacion(id) ON DELETE CASCADE,
    fk_keyword TEXT,
    ncl TEXT,
    competency TEXT,
    rap_texto_original TEXT,
    quarter TEXT,
    trimestre TEXT,
    fecha_intervencion_inicio TEXT,
    fecha_intervencion_fin TEXT,
    hora TEXT,
    instructor_id INTEGER REFERENCES instructores(id) ON DELETE SET NULL,
    instructor_nombre_original TEXT,
    estado_asignacion_instructor TEXT DEFAULT 'Por asignar',
    rol_instructor_en_ficha TEXT,
    area TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);


-- ============================================================================
-- INSERTAR DATOS SEMILLA DE DEMOSTRACIÓN (SEED DATA)
-- ============================================================================

-- A. Insertar Instructores de demostración (Administrativo e Instructores de Área)
INSERT INTO instructores (uid, nombre, correo, contrasena, rol, estado) VALUES
('demo-uid-admin', 'Martha Cecilia Gómez', 'admin@sena.edu.co', 'sena123', 'Administrativo', 'Activo'),
('demo-uid-instructor1', 'Juan Fernando Pérez', 'juan.perez@sena.edu.co', 'sena123', 'Instructor Técnico', 'Activo'),
('demo-uid-instructor2', 'Diana Carolina Ruiz', 'diana.ruiz@sena.edu.co', 'sena123', 'Vocero', 'Activo'),
('demo-uid-instructor3', 'Carlos Mario Restrepo', 'carlos.restrepo@sena.edu.co', 'sena123', 'Instructor Técnico', 'Activo')
ON CONFLICT (correo) DO NOTHING;

-- B. Insertar Programas de Formación
INSERT INTO programas_formacion (codigo, nombre, nivel) VALUES
('ADSO', 'Análisis y Desarrollo de Software', 'Tecnólogo'),
('ADSO_V', 'Análisis y Desarrollo de Software Virtual', 'Tecnólogo')
ON CONFLICT (codigo) DO NOTHING;

-- C. Insertar Fichas de Formación
INSERT INTO fichas (codigo_ficha, programa_id, fecha_inicio, fecha_fin, ultimo_seguimiento) VALUES
('2281902', (SELECT id FROM programas_formacion WHERE codigo = 'ADSO' LIMIT 1), '2025-01-15', '2027-04-30', '2026-06-15'),
('2281903', (SELECT id FROM programas_formacion WHERE codigo = 'ADSO_V' LIMIT 1), '2025-03-01', '2027-06-30', NULL)
ON CONFLICT (codigo_ficha) DO NOTHING;

-- D. Asociar Instructores a Fichas en instructor_ficha
INSERT INTO instructor_ficha (instructor_id, ficha_id, rol_en_ficha, area) VALUES
((SELECT id FROM instructores WHERE correo = 'juan.perez@sena.edu.co' LIMIT 1), (SELECT id FROM fichas WHERE codigo_ficha = '2281902' LIMIT 1), 'Instructor Líder', 'Técnica'),
((SELECT id FROM instructores WHERE correo = 'diana.ruiz@sena.edu.co' LIMIT 1), (SELECT id FROM fichas WHERE codigo_ficha = '2281902' LIMIT 1), 'Instructor Transversal', 'Inglés'),
((SELECT id FROM instructores WHERE correo = 'carlos.restrepo@sena.edu.co' LIMIT 1), (SELECT id FROM fichas WHERE codigo_ficha = '2281903' LIMIT 1), 'Instructor Técnico', 'Técnica')
ON CONFLICT DO NOTHING;

-- E. Insertar Aprendices de demostración (Con distintos niveles de riesgo y estados)
INSERT INTO aprendices_fichas (ficha_id, documento, nombre, correo, telefono, nivel_riesgo, estado_intervencion, ultimo_acceso, dias_sin_acceso, puntaje_riesgo, evidencias, tipo_documento, estado_aprendiz) VALUES
(
  (SELECT id FROM fichas WHERE codigo_ficha = '2281902' LIMIT 1), 
  '1020405060', 
  'Andrés Felipe Torres', 
  'andres.torres@misena.edu.co', 
  '3101234567', 
  'Bajo', 
  'Sin intervención', 
  '2026-06-30', 
  1, 
  10, 
  '{"Evidencia 1: Requisitos": "A", "Evidencia 2: Casos de Uso": "A", "Evidencia 3: Modelo Entidad Relación": "A"}'::jsonb, 
  'CC', 
  'Activo'
),
(
  (SELECT id FROM fichas WHERE codigo_ficha = '2281902' LIMIT 1), 
  '1030506070', 
  'María Camila Restrepo', 
  'maria.restrepo@misena.edu.co', 
  '3129876543', 
  'Medio', 
  'En seguimiento', 
  '2026-06-20', 
  11, 
  45, 
  '{"Evidencia 1: Requisitos": "A", "Evidencia 2: Casos de Uso": "D", "Evidencia 3: Modelo Entidad Relación": "D"}'::jsonb, 
  'CC', 
  'Activo'
),
(
  (SELECT id FROM fichas WHERE codigo_ficha = '2281902' LIMIT 1), 
  '1040607080', 
  'Santiago Alexander Muñoz', 
  'santiago.munoz@misena.edu.co', 
  '3154567890', 
  'Alto', 
  'En seguimiento', 
  '2026-05-15', 
  47, 
  85, 
  '{"Evidencia 1: Requisitos": "D", "Evidencia 2: Casos de Uso": "D", "Evidencia 3: Modelo Entidad Relación": "D", "Evidencia 4: DDL SQL": "D"}'::jsonb, 
  'CC', 
  'Activo'
)
ON CONFLICT DO NOTHING;

-- F. Insertar un Seguimiento (Historial Compacto)
INSERT INTO seguimientos_historico (aprendiz_ficha_id, instructor_id, estado_previo, estado_nuevo, detalles, compromiso_fecha, tipo_seguimiento, evidencias_pendientes, dias_sin_acceso, numero_llamado, codigo_ficha, usuario_responsable_nombre, usuario_responsable_rol, medio_comunicacion, asunto, cuerpo_mensaje, observacion, compromisos, origen_registro) VALUES
(
  (SELECT id FROM aprendices_fichas WHERE documento = '1030506070' LIMIT 1),
  (SELECT id FROM instructores WHERE correo = 'juan.perez@sena.edu.co' LIMIT 1),
  'Sin intervención',
  'En seguimiento',
  'Llamado de atención por no entrega de Casos de Uso y Modelo ER.',
  '2026-07-15',
  'Correo electrónico / Llamado oficial',
  2,
  11,
  1,
  '2281902',
  'Juan Fernando Pérez',
  'Instructor Técnico',
  'Correo electrónico',
  'Llamado de Atención No. 1 - Ficha 2281902',
  'Estimado aprendiz María Camila Restrepo, se le informa que tiene 2 evidencias pendientes...',
  'El aprendiz se comprometió a entregar las evidencias el 15 de julio de 2026.',
  'Entregar Casos de Uso y Modelo Entidad Relación corregidos.',
  'Instructor'
)
ON CONFLICT DO NOTHING;

-- G. Insertar Alerta Crítica para el aprendiz con riesgo Alto
INSERT INTO alertas_criticas (aprendiz_ficha_id, instructor_id, total_llamados, evidencias_pendientes, dias_sin_acceso, ultimo_acceso, historial_resumido, nivel_riesgo, estado) VALUES
(
  (SELECT id FROM aprendices_fichas WHERE documento = '1040607080' LIMIT 1),
  (SELECT id FROM instructores WHERE correo = 'juan.perez@sena.edu.co' LIMIT 1),
  2,
  4,
  47,
  '2026-05-15',
  'Se enviaron 2 llamados oficiales y no se ha obtenido respuesta por parte del aprendiz. Tampoco registra ingresos a la plataforma Territorium en los últimos 45 días.',
  'Alto',
  'Pendiente de revisión'
)
ON CONFLICT DO NOTHING;
