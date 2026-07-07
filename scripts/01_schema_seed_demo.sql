BEGIN;

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

CREATE TABLE IF NOT EXISTS programas_formacion (
  id SERIAL PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  nivel TEXT NOT NULL DEFAULT 'Tecnólogo',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fichas (
  id SERIAL PRIMARY KEY,
  codigo_ficha TEXT NOT NULL UNIQUE,
  programa_id INTEGER NOT NULL REFERENCES programas_formacion(id) ON DELETE CASCADE,
  fecha_inicio TEXT,
  fecha_fin TEXT,
  ultimo_seguimiento TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS instructor_ficha (
  id SERIAL PRIMARY KEY,
  instructor_id INTEGER NOT NULL REFERENCES instructores(id) ON DELETE CASCADE,
  ficha_id INTEGER NOT NULL REFERENCES fichas(id) ON DELETE CASCADE,
  rol_en_ficha TEXT NOT NULL DEFAULT 'Instructor Técnico',
  area TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS instructor_ficha_instructor_id_ficha_id_idx
  ON instructor_ficha (instructor_id, ficha_id);

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

CREATE UNIQUE INDEX IF NOT EXISTS aprendices_fichas_ficha_id_documento_idx
  ON aprendices_fichas (ficha_id, documento);

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

INSERT INTO instructores (nombre, correo, rol, estado, contrasena)
VALUES (
  'Leidy Johanna González Ballesteros',
  'leidy.lys@gmail.com',
  'Administrativo',
  'Activo',
  'sena123'
)
ON CONFLICT (correo) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  rol = EXCLUDED.rol,
  estado = EXCLUDED.estado,
  contrasena = EXCLUDED.contrasena;

INSERT INTO programas_formacion (codigo, nombre, nivel)
VALUES ('ADSO', 'Análisis y Desarrollo de Software', 'Tecnólogo')
ON CONFLICT (codigo) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  nivel = EXCLUDED.nivel;

WITH programa AS (
  SELECT id FROM programas_formacion WHERE codigo = 'ADSO'
)
INSERT INTO fichas (codigo_ficha, programa_id, fecha_inicio, fecha_fin, ultimo_seguimiento)
SELECT codigo_ficha, programa.id, fecha_inicio, fecha_fin, CURRENT_DATE::text
FROM programa
CROSS JOIN (
  VALUES
    ('3118294', '2025-01-20', '2026-07-19'),
    ('3118558', '2025-02-03', '2026-08-02'),
    ('3134530', '2025-03-10', '2026-09-09')
) AS demo(codigo_ficha, fecha_inicio, fecha_fin)
ON CONFLICT (codigo_ficha) DO UPDATE SET
  programa_id = EXCLUDED.programa_id,
  fecha_inicio = EXCLUDED.fecha_inicio,
  fecha_fin = EXCLUDED.fecha_fin,
  ultimo_seguimiento = EXCLUDED.ultimo_seguimiento;

WITH instructor AS (
  SELECT id FROM instructores WHERE correo = 'leidy.lys@gmail.com'
)
INSERT INTO instructor_ficha (instructor_id, ficha_id, rol_en_ficha, area)
SELECT instructor.id, fichas.id, 'Instructor Líder', 'Técnica'
FROM instructor
JOIN fichas ON fichas.codigo_ficha IN ('3118294', '3118558', '3134530')
ON CONFLICT (instructor_id, ficha_id) DO UPDATE SET
  rol_en_ficha = EXCLUDED.rol_en_ficha,
  area = EXCLUDED.area;

WITH ficha_demo AS (
  SELECT id, codigo_ficha
  FROM fichas
  WHERE codigo_ficha IN ('3118294', '3118558', '3134530')
),
aprendiz_demo AS (
  SELECT
    ficha_demo.id AS ficha_id,
    ficha_demo.codigo_ficha,
    serie.n,
    CASE
      WHEN serie.n <= 5 THEN 'Bajo'
      WHEN serie.n <= 10 THEN 'Medio'
      ELSE 'Alto'
    END AS nivel_riesgo,
    CASE
      WHEN serie.n <= 5 THEN 'Sin intervención'
      WHEN serie.n <= 10 THEN 'En seguimiento'
      ELSE 'Intervenido'
    END AS estado_intervencion,
    CASE
      WHEN serie.n <= 5 THEN 2 + serie.n
      WHEN serie.n <= 10 THEN 8 + serie.n
      WHEN serie.n <= 15 THEN 18 + serie.n
      ELSE 45 + serie.n
    END AS dias_sin_acceso,
    CASE
      WHEN serie.n <= 5 THEN 15 + serie.n
      WHEN serie.n <= 10 THEN 45 + serie.n
      WHEN serie.n <= 15 THEN 75 + serie.n
      ELSE 90 + serie.n
    END AS puntaje_riesgo
  FROM ficha_demo
  CROSS JOIN generate_series(1, 17) AS serie(n)
)
INSERT INTO aprendices_fichas (
  ficha_id,
  documento,
  nombre,
  correo,
  telefono,
  nivel_riesgo,
  estado_intervencion,
  ultimo_acceso,
  dias_sin_acceso,
  puntaje_riesgo,
  evidencias,
  tipo_documento,
  resumen_fases,
  estado_aprendiz,
  observacion_estado,
  fecha_ultimo_reporte
)
SELECT
  ficha_id,
  '900' || codigo_ficha || LPAD(n::text, 2, '0') AS documento,
  'Aprendiz Demo ' || codigo_ficha || '-' || LPAD(n::text, 2, '0') AS nombre,
  'aprendiz.' || codigo_ficha || '.' || LPAD(n::text, 2, '0') || '@example.com' AS correo,
  '300555' || LPAD(((codigo_ficha::integer + n) % 10000)::text, 4, '0') AS telefono,
  nivel_riesgo,
  estado_intervencion,
  (CURRENT_DATE - (dias_sin_acceso || ' days')::interval)::date::text AS ultimo_acceso,
  dias_sin_acceso,
  puntaje_riesgo,
  jsonb_build_object(
    'Evidencia 1', CASE WHEN n <= 10 THEN 'Aprobada' ELSE 'Pendiente' END,
    'Evidencia 2', CASE WHEN n <= 5 THEN 'Aprobada' ELSE 'Desaprobada' END,
    'Evidencia 3', CASE WHEN n IN (16, 17) THEN 'Sin enviar' ELSE 'Pendiente' END
  ) AS evidencias,
  'CC' AS tipo_documento,
  jsonb_build_object(
    'analisis', CASE WHEN n <= 10 THEN 'Completa' ELSE 'En riesgo' END,
    'planeacion', CASE WHEN n <= 5 THEN 'Completa' ELSE 'Pendiente' END,
    'ejecucion', CASE WHEN n <= 15 THEN 'En proceso' ELSE 'Sin avance' END,
    'evaluacion', CASE WHEN n <= 5 THEN 'En proceso' ELSE 'Pendiente' END
  ) AS resumen_fases,
  CASE WHEN n IN (16, 17) THEN 'Posible deserción' ELSE 'Activo' END AS estado_aprendiz,
  CASE
    WHEN n IN (16, 17) THEN 'Aprendiz ficticio marcado para probar posible deserción.'
    ELSE 'Registro ficticio de demostración.'
  END AS observacion_estado,
  CURRENT_DATE::text AS fecha_ultimo_reporte
FROM aprendiz_demo
ON CONFLICT (ficha_id, documento) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  correo = EXCLUDED.correo,
  telefono = EXCLUDED.telefono,
  nivel_riesgo = EXCLUDED.nivel_riesgo,
  estado_intervencion = EXCLUDED.estado_intervencion,
  ultimo_acceso = EXCLUDED.ultimo_acceso,
  dias_sin_acceso = EXCLUDED.dias_sin_acceso,
  puntaje_riesgo = EXCLUDED.puntaje_riesgo,
  evidencias = EXCLUDED.evidencias,
  resumen_fases = EXCLUDED.resumen_fases,
  estado_aprendiz = EXCLUDED.estado_aprendiz,
  observacion_estado = EXCLUDED.observacion_estado,
  fecha_ultimo_reporte = EXCLUDED.fecha_ultimo_reporte;

WITH base AS (
  SELECT
    aprendices_fichas.id AS aprendiz_ficha_id,
    instructores.id AS instructor_id,
    instructores.nombre AS instructor_nombre,
    instructores.rol AS instructor_rol,
    fichas.codigo_ficha,
    aprendices_fichas.dias_sin_acceso,
    aprendices_fichas.ultimo_acceso
  FROM aprendices_fichas
  JOIN fichas ON fichas.id = aprendices_fichas.ficha_id
  CROSS JOIN instructores
  WHERE fichas.codigo_ficha = '3118294'
    AND aprendices_fichas.documento = '900311829411'
    AND instructores.correo = 'leidy.lys@gmail.com'
),
correo AS (
  INSERT INTO seguimientos_historico (
    aprendiz_ficha_id,
    instructor_id,
    fecha,
    estado_previo,
    estado_nuevo,
    detalles,
    compromiso_fecha,
    tipo_seguimiento,
    evidencias_pendientes,
    dias_sin_acceso,
    numero_llamado,
    codigo_ficha,
    usuario_responsable_nombre,
    usuario_responsable_rol,
    medio_comunicacion,
    fecha_envio_mensaje,
    fecha_proximo_seguimiento,
    asunto,
    cuerpo_mensaje,
    observacion,
    acuerdos_establecidos,
    fecha_ultimo_ingreso,
    total_evidencias,
    evidencias_enviadas,
    evidencias_aprobadas,
    evidencias_desaprobadas,
    detalle_evidencias_pendientes,
    creado_por_id,
    creado_por_nombre,
    creado_por_rol,
    editable_por_rol,
    origen_registro
  )
  SELECT
    aprendiz_ficha_id,
    instructor_id,
    NOW() - INTERVAL '6 days',
    'Sin intervención',
    'En seguimiento',
    'Primer llamado académico por falta de entrega de evidencias.',
    (CURRENT_DATE + 5)::text,
    'Primer llamado',
    3,
    dias_sin_acceso,
    1,
    codigo_ficha,
    instructor_nombre,
    instructor_rol,
    'Correo electrónico',
    (CURRENT_DATE - 6)::text,
    (CURRENT_DATE - 2)::text,
    'Primer llamado a ponerse al día',
    'Mensaje demo: se invita al aprendiz a revisar sus actividades pendientes y responder el plan de recuperación.',
    'Se envía correo institucional de prueba para validar la bitácora.',
    'Responder el correo y entregar dos evidencias iniciales.',
    ultimo_acceso,
    8,
    4,
    2,
    2,
    'Evidencia 4, Evidencia 5, Evidencia 6',
    instructor_id,
    instructor_nombre,
    instructor_rol,
    'Administrativo',
    'Instructor'
  FROM base
  WHERE NOT EXISTS (
    SELECT 1
    FROM seguimientos_historico sh
    WHERE sh.aprendiz_ficha_id = base.aprendiz_ficha_id
      AND sh.tipo_seguimiento = 'Primer llamado'
      AND sh.numero_llamado = 1
      AND sh.medio_comunicacion = 'Correo electrónico'
  )
  RETURNING id, aprendiz_ficha_id, instructor_id
)
INSERT INTO seguimientos_historico (
  aprendiz_ficha_id,
  instructor_id,
  fecha,
  estado_previo,
  estado_nuevo,
  detalles,
  tipo_seguimiento,
  evidencias_pendientes,
  dias_sin_acceso,
  numero_llamado,
  codigo_ficha,
  usuario_responsable_nombre,
  usuario_responsable_rol,
  medio_comunicacion,
  fecha_respuesta_aprendiz,
  asunto,
  cuerpo_mensaje,
  observacion,
  respuesta_aprendiz,
  acuerdos_establecidos,
  compromisos,
  proxima_accion,
  creado_por_id,
  creado_por_nombre,
  creado_por_rol,
  editable_por_rol,
  origen_registro,
  parent_seguimiento_id
)
SELECT
  base.aprendiz_ficha_id,
  base.instructor_id,
  NOW() - INTERVAL '5 days',
  'En seguimiento',
  'En seguimiento',
  'Respuesta posterior del aprendiz al primer llamado.',
  'Respuesta del aprendiz',
  3,
  base.dias_sin_acceso,
  1,
  base.codigo_ficha,
  base.instructor_nombre,
  base.instructor_rol,
  'Correo electrónico',
  (CURRENT_DATE - 5)::text,
  'Respuesta al primer llamado',
  'Registro demo de respuesta relacionada con el llamado inicial.',
  'El aprendiz confirma recepción del llamado.',
  'Indica que tuvo dificultades de conectividad y solicita plazo adicional.',
  'Entregar dos evidencias antes del próximo seguimiento.',
  'Enviar evidencia 4 y 5.',
  'Revisar avance en 3 días.',
  base.instructor_id,
  base.instructor_nombre,
  base.instructor_rol,
  'Administrativo',
  'Aprendiz',
  correo.id
FROM correo
JOIN base ON base.aprendiz_ficha_id = correo.aprendiz_ficha_id
WHERE NOT EXISTS (
  SELECT 1
  FROM seguimientos_historico sh
  WHERE sh.parent_seguimiento_id = correo.id
    AND sh.tipo_seguimiento = 'Respuesta del aprendiz'
);

WITH base AS (
  SELECT
    aprendices_fichas.id AS aprendiz_ficha_id,
    instructores.id AS instructor_id,
    instructores.nombre AS instructor_nombre,
    instructores.rol AS instructor_rol,
    fichas.codigo_ficha,
    aprendices_fichas.dias_sin_acceso,
    aprendices_fichas.ultimo_acceso
  FROM aprendices_fichas
  JOIN fichas ON fichas.id = aprendices_fichas.ficha_id
  CROSS JOIN instructores
  WHERE fichas.codigo_ficha IN ('3118558', '3134530')
    AND aprendices_fichas.documento IN ('900311855812', '900313453016')
    AND instructores.correo = 'leidy.lys@gmail.com'
)
INSERT INTO seguimientos_historico (
  aprendiz_ficha_id,
  instructor_id,
  fecha,
  estado_previo,
  estado_nuevo,
  detalles,
  compromiso_fecha,
  tipo_seguimiento,
  evidencias_pendientes,
  dias_sin_acceso,
  numero_llamado,
  codigo_ficha,
  usuario_responsable_nombre,
  usuario_responsable_rol,
  medio_comunicacion,
  fecha_envio_mensaje,
  fecha_proximo_seguimiento,
  asunto,
  cuerpo_mensaje,
  observacion,
  acuerdos_establecidos,
  fecha_ultimo_ingreso,
  total_evidencias,
  evidencias_enviadas,
  evidencias_aprobadas,
  evidencias_desaprobadas,
  detalle_evidencias_pendientes,
  creado_por_id,
  creado_por_nombre,
  creado_por_rol,
  editable_por_rol,
  origen_registro
)
SELECT
  aprendiz_ficha_id,
  instructor_id,
  CASE WHEN codigo_ficha = '3118558' THEN NOW() - INTERVAL '4 days' ELSE NOW() - INTERVAL '3 days' END,
  'Sin intervención',
  'En seguimiento',
  CASE WHEN codigo_ficha = '3118558' THEN 'Comunicación por WhatsApp para confirmar avance.' ELSE 'Llamada telefónica de verificación académica.' END,
  (CURRENT_DATE + 4)::text,
  CASE WHEN codigo_ficha = '3118558' THEN 'Comunicación por WhatsApp' ELSE 'Llamada telefónica' END,
  CASE WHEN codigo_ficha = '3118558' THEN 4 ELSE 5 END,
  dias_sin_acceso,
  CASE WHEN codigo_ficha = '3118558' THEN 2 ELSE 3 END,
  codigo_ficha,
  instructor_nombre,
  instructor_rol,
  CASE WHEN codigo_ficha = '3118558' THEN 'WhatsApp' ELSE 'Llamada telefónica' END,
  CURRENT_DATE::text,
  (CURRENT_DATE + 4)::text,
  CASE WHEN codigo_ficha = '3118558' THEN 'Seguimiento por WhatsApp' ELSE 'Seguimiento telefónico' END,
  CASE WHEN codigo_ficha = '3118558' THEN 'Mensaje demo por WhatsApp para acordar plan de recuperación.' ELSE 'Registro demo de llamada para validar continuidad del aprendiz.' END,
  CASE WHEN codigo_ficha = '3118558' THEN 'El aprendiz responde parcialmente y solicita acompañamiento.' ELSE 'No se logra contacto completo; se deja constancia de llamada.' END,
  CASE WHEN codigo_ficha = '3118558' THEN 'Enviar captura de avances y asistir a asesoría.' ELSE 'Intentar nuevo contacto y remitir a apoyo si no responde.' END,
  ultimo_acceso,
  10,
  CASE WHEN codigo_ficha = '3118558' THEN 5 ELSE 3 END,
  CASE WHEN codigo_ficha = '3118558' THEN 3 ELSE 1 END,
  CASE WHEN codigo_ficha = '3118558' THEN 2 ELSE 2 END,
  CASE WHEN codigo_ficha = '3118558' THEN 'Evidencias 6, 7, 8 y 9' ELSE 'Evidencias 3, 4, 5, 6 y 7' END,
  instructor_id,
  instructor_nombre,
  instructor_rol,
  'Administrativo',
  'Instructor'
FROM base
WHERE NOT EXISTS (
  SELECT 1
  FROM seguimientos_historico sh
  WHERE sh.aprendiz_ficha_id = base.aprendiz_ficha_id
    AND sh.codigo_ficha = base.codigo_ficha
    AND sh.medio_comunicacion IN ('WhatsApp', 'Llamada telefónica')
);

WITH alerta_base AS (
  SELECT
    aprendices_fichas.id AS aprendiz_ficha_id,
    instructores.id AS instructor_id,
    fichas.codigo_ficha,
    aprendices_fichas.nombre,
    aprendices_fichas.dias_sin_acceso,
    aprendices_fichas.ultimo_acceso,
    aprendices_fichas.nivel_riesgo
  FROM aprendices_fichas
  JOIN fichas ON fichas.id = aprendices_fichas.ficha_id
  CROSS JOIN instructores
  WHERE instructores.correo = 'leidy.lys@gmail.com'
    AND aprendices_fichas.documento IN ('900311829416', '900311855817', '900313453017')
)
INSERT INTO alertas_criticas (
  aprendiz_ficha_id,
  instructor_id,
  total_llamados,
  evidencias_pendientes,
  dias_sin_acceso,
  ultimo_acceso,
  historial_resumido,
  nivel_riesgo,
  estado,
  fecha_escalamiento
)
SELECT
  aprendiz_ficha_id,
  instructor_id,
  3,
  5,
  dias_sin_acceso,
  ultimo_acceso,
  'Alerta demo para ' || nombre || ' de la ficha ' || codigo_ficha || ': riesgo alto y baja actividad reciente.',
  nivel_riesgo,
  CASE WHEN codigo_ficha = '3134530' THEN 'En gestión administrativa' ELSE 'Pendiente de revisión' END,
  NOW()
FROM alerta_base
WHERE NOT EXISTS (
  SELECT 1
  FROM alertas_criticas ac
  WHERE ac.aprendiz_ficha_id = alerta_base.aprendiz_ficha_id
    AND ac.estado IN ('Pendiente de revisión', 'En gestión administrativa')
);

COMMIT;

SELECT COUNT(*) FROM instructores;
SELECT COUNT(*) FROM programas_formacion;
SELECT COUNT(*) FROM fichas;
SELECT COUNT(*) FROM instructor_ficha;
SELECT COUNT(*) FROM aprendices_fichas;
SELECT COUNT(*) FROM seguimientos_historico;
SELECT COUNT(*) FROM alertas_criticas;
