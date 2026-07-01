import { pgTable, serial, text, integer, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// 1. Table for Instructores (tied to Firebase Auth uid if logged in)
export const instructores = pgTable('instructores', {
  id: serial('id').primaryKey(),
  uid: text('uid').unique(), // Firebase Auth UID (nullable until first sync login)
  nombre: text('nombre'),
  correo: text('correo').notNull().unique(),
  contrasena: text('contrasena').default('sena123').notNull(), // User custom password default sena123
  rol: text('rol').notNull().default('Instructor Técnico'), // 'Administrativo', 'Vocero', 'Apoyo', 'Instructor Técnico', etc.
  estado: text('estado').notNull().default('Activo'), // 'Activo' or 'Inactivo'
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 2. Table for Programas de Formación
export const programasFormacion = pgTable('programas_formacion', {
  id: serial('id').primaryKey(),
  codigo: text('codigo').notNull().unique(), // e.g. 'ADSO' or '2281902'
  nombre: text('nombre').notNull(),         // e.g. 'Análisis y Desarrollo de Software'
  nivel: text('nivel').notNull().default('Tecnólogo'), // 'Técnico', 'Tecnólogo'
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 3. Table for Fichas de Formación (with Start and End dates)
export const fichas = pgTable('fichas', {
  id: serial('id').primaryKey(),
  codigoFicha: text('codigo_ficha').notNull().unique(), // e.g. '2281902'
  programaId: integer('programa_id')
    .references(() => programasFormacion.id, { onDelete: 'cascade' })
    .notNull(),
  fechaInicio: text('fecha_inicio'), // Start Date YYYY-MM-DD or standard ISO
  fechaFin: text('fecha_fin'),       // End Date YYYY-MM-DD or standard ISO
  ultimoSeguimiento: text('ultimo_seguimiento'), // Last tracking report date
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 4. Intermediate Table for Instructor - Ficha Relationship (Many-to-Many)
export const instructorFicha = pgTable('instructor_ficha', {
  id: serial('id').primaryKey(),
  instructorId: integer('instructor_id')
    .references(() => instructores.id, { onDelete: 'cascade' })
    .notNull(),
  fichaId: integer('ficha_id')
    .references(() => fichas.id, { onDelete: 'cascade' })
    .notNull(),
  rolEnFicha: text('rol_en_ficha').notNull().default('Instructor Técnico'),
  area: text('area'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 5. Table for Aprendices belonging to Fichas
export const aprendicesFichas = pgTable('aprendices_fichas', {
  id: serial('id').primaryKey(),
  fichaId: integer('ficha_id')
    .references(() => fichas.id, { onDelete: 'cascade' })
    .notNull(),
  documento: text('documento').notNull(),
  nombre: text('nombre').notNull(),
  correo: text('correo').notNull(),
  telefono: text('telefono'),
  nivelRiesgo: text('nivel_riesgo').notNull().default('Bajo'), // 'Bajo', 'Medio', 'Alto'
  estadoIntervencion: text('estado_intervencion').notNull().default('Sin intervención'), // 'Sin intervención', 'En seguimiento', 'Intervenido'
  ultimoAcceso: text('ultimo_acceso'),
  diasSinAcceso: integer('dias_sin_acceso'),
  puntajeRiesgo: integer('puntaje_riesgo').notNull().default(0),
  evidencias: jsonb('evidencias').default({}).notNull(), // Map of grade statuses: { "Evid 1": "A", "Evid 2": "D" }
  tipoDocumento: text('tipo_documento').default('CC'),
  resumenFases: jsonb('resumen_fases').default({}).notNull(),
  estadoAprendiz: text('estado_aprendiz').notNull().default('Activo'), // 'Activo' or 'Inactivo'
  observacionEstado: text('observacion_estado'),
  fechaUltimoReporte: text('fecha_ultimo_reporte'),
  fechaInactivacion: text('fecha_inactivacion'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 6. Table for Seguimientos Historico (Detailed track record)
export const seguimientosHistorico = pgTable('seguimientos_historico', {
  id: serial('id').primaryKey(),
  aprendizFichaId: integer('aprendiz_ficha_id')
    .references(() => aprendicesFichas.id, { onDelete: 'cascade' })
    .notNull(),
  instructorId: integer('instructor_id')
    .references(() => instructores.id)
    .notNull(),
  fecha: timestamp('fecha').defaultNow().notNull(),
  estadoPrevio: text('estado_previo').notNull(), // State transition audit log
  estadoNuevo: text('estado_nuevo').notNull(),
  detalles: text('detalles').notNull(), // text from instructor's commitment modal
  compromisoFecha: text('compromiso_fecha'), // Optional commitment deadline
  tipoSeguimiento: text('tipo_seguimiento'), // e.g. "Correo de llamado a ponerse al día", "Comunicación de seguimiento", etc.
  evidenciasPendientes: integer('evidencias_pendientes'),
  diasSinAcceso: integer('dias_sin_acceso'),
  numeroLlamado: integer('numero_llamado'),
  
  // New Bitacora fields for consolidation
  codigoFicha: text('codigo_ficha'),
  usuarioResponsableNombre: text('usuario_responsable_nombre'),
  usuarioResponsableRol: text('usuario_responsable_rol'),
  medioComunicacion: text('medio_comunicacion'), // "Correo electrónico", "Llamada telefónica", "WhatsApp", etc.
  fechaRegistro: timestamp('fecha_registro').defaultNow(),
  fechaEnvioMensaje: text('fecha_envio_mensaje'),
  fechaRespuestaAprendiz: text('fecha_respuesta_aprendiz'),
  fechaProximoSeguimiento: text('fecha_proximo_seguimiento'),
  asunto: text('asunto'),
  cuerpoMensaje: text('cuerpo_mensaje'),
  observacion: text('observacion'),
  respuestaAprendiz: text('respuesta_aprendiz'),
  acuerdosEstablecidos: text('acuerdos_establecidos'),
  compromisos: text('compromisos'),
  proximaAccion: text('proxima_accion'),
  fechaUltimoIngreso: text('fecha_ultimo_ingreso'),
  totalEvidencias: integer('total_evidencias'),
  evidenciasEnviadas: integer('evidencias_enviadas'),
  evidenciasAprobadas: integer('evidencias_aprobadas'),
  evidenciasDesaprobadas: integer('evidencias_desaprobadas'),
  detalleEvidenciasPendientes: text('detalle_evidencias_pendientes'),
  creadoPorId: integer('creado_por_id'),
  creadoPorNombre: text('creado_por_nombre'),
  creadoPorRol: text('creado_por_rol'),
  editablePorRol: text('editable_por_rol'),
  origenRegistro: text('origen_registro'), // 'Instructor', 'Administrativo', 'Bienestar', 'Sistema'
  parentSeguimientoId: integer('parent_seguimiento_id'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 7. Table for Alertas Críticas (Administrative escalation)
export const alertasCriticas = pgTable('alertas_criticas', {
  id: serial('id').primaryKey(),
  aprendizFichaId: integer('aprendiz_ficha_id')
    .references(() => aprendicesFichas.id, { onDelete: 'cascade' })
    .notNull(),
  instructorId: integer('instructor_id')
    .references(() => instructores.id)
    .notNull(),
  totalLlamados: integer('total_llamados').notNull().default(0),
  evidenciasPendientes: integer('evidencias_pendientes').notNull().default(0),
  diasSinAcceso: integer('dias_sin_acceso'),
  ultimoAcceso: text('ultimo_acceso'),
  historialResumido: text('historial_resumido').notNull(),
  nivelRiesgo: text('nivel_riesgo').notNull().default('Alto'),
  estado: text('estado').notNull().default('Pendiente de revisión'), // 'Pendiente de revisión', 'En gestión administrativa', 'Remitido a comité', 'Cerrado', 'Cerrado por mejora'
  fechaEscalamiento: timestamp('fecha_escalamiento').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Relationships definitions
export const instructoresRelations = relations(instructores, ({ many }) => ({
  instructorFichas: many(instructorFicha),
  seguimientos: many(seguimientosHistorico),
  alertasCriticas: many(alertasCriticas),
}));

export const programasRelations = relations(programasFormacion, ({ many }) => ({
  fichas: many(fichas),
}));

export const fichasRelations = relations(fichas, ({ one, many }) => ({
  programa: one(programasFormacion, {
    fields: [fichas.programaId],
    references: [programasFormacion.id],
  }),
  instructorFichas: many(instructorFicha),
  aprendices: many(aprendicesFichas),
}));

export const instructorFichaRelations = relations(instructorFicha, ({ one }) => ({
  instructor: one(instructores, {
    fields: [instructorFicha.instructorId],
    references: [instructores.id],
  }),
  ficha: one(fichas, {
    fields: [instructorFicha.fichaId],
    references: [fichas.id],
  }),
}));

export const aprendicesRelations = relations(aprendicesFichas, ({ one, many }) => ({
  ficha: one(fichas, {
    fields: [aprendicesFichas.fichaId],
    references: [fichas.id],
  }),
  seguimientos: many(seguimientosHistorico),
  alertasCriticas: many(alertasCriticas),
}));

export const seguimientosRelations = relations(seguimientosHistorico, ({ one }) => ({
  aprendizFicha: one(aprendicesFichas, {
    fields: [seguimientosHistorico.aprendizFichaId],
    references: [aprendicesFichas.id],
  }),
  instructor: one(instructores, {
    fields: [seguimientosHistorico.instructorId],
    references: [instructores.id],
  }),
}));

export const alertasCriticasRelations = relations(alertasCriticas, ({ one }) => ({
  aprendizFicha: one(aprendicesFichas, {
    fields: [alertasCriticas.aprendizFichaId],
    references: [aprendicesFichas.id],
  }),
  instructor: one(instructores, {
    fields: [alertasCriticas.instructorId],
    references: [instructores.id],
  }),
}));
