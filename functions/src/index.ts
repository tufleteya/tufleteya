import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';

initializeApp();

const db = getFirestore();

const callableCors = [
  'http://localhost:8100',
  'http://localhost:4200',
  'http://127.0.0.1:8100',
  'http://127.0.0.1:4200',
  'capacitor://localhost',
  'ionic://localhost',
  'https://fletesya-c31eb.web.app',
  'https://fletesya-c31eb.firebaseapp.com',
  'https://tufleteyarg.web.app',
  'https://tufleteyarg.firebaseapp.com',
  'https://tufleteya.vercel.app',
];

type PendingAlert = {
  id: string;
  motivo?: unknown;
  etapa?: unknown;
  fecha?: unknown;
};

type EstadoFleteProceso = 'Confirmado' | 'En Viaje' | 'Finalizado' | 'Cancelado';
type EtapaCancelacion = 'antes_de_iniciar' | 'en_viaje';
type EstadoSancionAutomatico = 'normal' | 'advertencia' | 'suspension_automatica' | 'bloqueado_revision';

type FleteDoc = {
  id: string;
  pedidoId: string;
  usuarioId: string;
  fleteroId: string;
  nombre: string;
  apellido: string;
  fecha: string;
  hora: number;
  minutos: number;
  uDesde: string;
  uHasta: string;
  precio: number;
  precioAceptado?: number;
  cargamento: string;
  tipoVehiculo: string;
  tipoServicio: string;
  ayudantes: string;
  fechaConfirmacion?: unknown;
  fechaInicioViaje?: unknown;
  endCoordinatesP?: GeoPointLike;
  ubicacionActual?: GeoPointLike;
  ubicacionActualizadaAt?: unknown;
  estado: EstadoFleteProceso;
};

type NivelConfiabilidad = 'Alta' | 'Media' | 'Baja' | 'Critica';

type GeoPointLike = {
  latitude?: unknown;
  longitude?: unknown;
};

type ConfiguracionOperacion = {
  pagoSeniaHabilitado: boolean;
  antifraudeCancelacionCercaDestinoHabilitado: boolean;
  distanciaDestinoSospechosaMetros: number;
};

type AnalisisAntifraudeCancelacion = {
  habilitado: boolean;
  evaluable: boolean;
  sospechosa: boolean;
  tipo: 'cancelacion_cerca_destino' | null;
  distanciaDestinoMetros: number | null;
  umbralMetros: number;
  pagoSeniaHabilitado: boolean;
  motivo: string;
};

const DEFAULT_OPERACION_CONFIG: ConfiguracionOperacion = {
  pagoSeniaHabilitado: false,
  antifraudeCancelacionCercaDestinoHabilitado: true,
  distanciaDestinoSospechosaMetros: 200,
};

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeDate(value: unknown): Date | null {
  if (!value) {
    return null;
  }

  if (value instanceof Timestamp) {
    return value.toDate();
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof (value as { toDate?: unknown })?.toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }

  if (typeof (value as { seconds?: unknown })?.seconds === 'number') {
    return new Date((value as { seconds: number }).seconds * 1000);
  }

  const parsed = new Date(value as string);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildFechaProgramadaFlete(flete: Pick<FleteDoc, 'fecha' | 'hora' | 'minutos'>): Date | null {
  const fechaTexto = asString(flete.fecha).trim();
  if (!fechaTexto) {
    return null;
  }

  const matchFecha = fechaTexto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const hora = asNumber(flete.hora, 0);
  const minutos = asNumber(flete.minutos, 0);
  const fecha = matchFecha
    ? new Date(
        Number(matchFecha[1]),
        Number(matchFecha[2]) - 1,
        Number(matchFecha[3]),
        hora,
        minutos,
        0,
        0
      )
    : normalizeDate(fechaTexto);

  if (!fecha) {
    return null;
  }

  if (!matchFecha) {
    fecha.setHours(hora, minutos, 0, 0);
  }

  return fecha;
}

async function assertAdmin(uid?: string) {
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  }

  const adminDoc = await db.doc(`Admins/${uid}`).get();
  const admin = adminDoc.data() || {};
  if (!(adminDoc.exists && admin.activo !== false && (!admin.rol || admin.rol === 'Admin')) && !(await hasLegacyAdminProfile(uid))) {
    throw new HttpsError('permission-denied', 'Solo admins pueden ejecutar esta acción.');
  }
}

async function hasLegacyAdminProfile(uid: string) {
  const [usuarioDoc, usuarioPersonalDoc, fleteroDoc] = await Promise.all([
    db.doc(`Usuarios/${uid}`).get(),
    db.doc(`Usuarios/${uid}/DatosPersonales/${uid}`).get(),
    db.doc(`Fleteros/${uid}`).get(),
  ]);

  const usuario = usuarioDoc.data() || {};
  const usuarioPersonal = usuarioPersonalDoc.data() || {};
  const fletero = fleteroDoc.data() || {};

  return usuario.perfil === 'Admin'
    || usuario.perfilActivo === 'Admin'
    || usuarioPersonal.perfil === 'Admin'
    || usuarioPersonal.perfilActivo === 'Admin'
    || fletero.perfil === 'Admin'
    || fletero.perfilActivo === 'Admin';
}

async function assertPanelRole(uid: string | undefined, roles: string[]) {
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesiÃ³n.');
  }

  const adminDoc = await db.doc(`Admins/${uid}`).get();
  const admin = adminDoc.data() || {};
  const rol = asString(admin.rol, 'Admin');
  if (!(adminDoc.exists && admin.activo !== false && roles.includes(rol)) && !(roles.includes('Admin') && await hasLegacyAdminProfile(uid))) {
    throw new HttpsError('permission-denied', 'No tenÃ©s permisos para ejecutar esta acciÃ³n.');
  }
}

async function isPanelUser(uid?: string) {
  if (!uid) {
    return false;
  }

  const adminDoc = await db.doc(`Admins/${uid}`).get();
  const admin = adminDoc.data() || {};
  return adminDoc.exists && admin.activo !== false;
}

function normalizeRolPanel(value: unknown): 'Admin' | 'Verificador' | 'Soporte' {
  const rol = asString(value).trim();
  if (rol === 'Admin' || rol === 'Verificador' || rol === 'Soporte') {
    return rol;
  }

  throw new HttpsError('invalid-argument', 'Rol de panel invÃ¡lido.');
}

function normalizePerfilApp(value: unknown): 'Usuario' | 'Fletero' {
  const perfil = asString(value).trim();
  if (perfil === 'Usuario' || perfil === 'Fletero') {
    return perfil;
  }

  throw new HttpsError('invalid-argument', 'Perfil de aplicacion invalido.');
}

function calcNivel(score: number): NivelConfiabilidad {
  if (score >= 85) return 'Alta';
  if (score >= 65) return 'Media';
  if (score >= 40) return 'Baja';
  return 'Critica';
}

function calcUserScore(metricas: Record<string, unknown>) {
  const viajesConfirmadosTotal = asNumber(metricas.viajesConfirmadosTotal, 0);
  const viajesFinalizados = asNumber(metricas.viajesFinalizados, 0);
  const cancelacionesPorUsuario = asNumber(metricas.cancelacionesPorUsuario, 0);
  const cancelacionesAntesDeIniciar = asNumber(metricas.cancelacionesAntesDeIniciar, 0);
  const cancelacionesEnViaje = asNumber(metricas.cancelacionesEnViaje, 0);
  const tasaFinalizacion = viajesConfirmadosTotal > 0
    ? Math.round((viajesFinalizados / viajesConfirmadosTotal) * 100)
    : 100;

  const scoreBruto = 100
    - (cancelacionesAntesDeIniciar * 12)
    - (cancelacionesEnViaje * 28)
    - (Math.max(cancelacionesPorUsuario - 1, 0) * 4)
    + Math.min(viajesFinalizados * 2, 16);

  const scoreConfiabilidadUsuario = Math.max(0, Math.min(100, Math.round(scoreBruto)));
  return {
    tasaFinalizacion,
    scoreConfiabilidadUsuario,
    nivelConfiabilidadUsuario: calcNivel(scoreConfiabilidadUsuario),
  };
}

function serverNow() {
  return Timestamp.now();
}

function normalizeGeoPoint(value: unknown): { latitude: number; longitude: number } | null {
  const latitude = (value as GeoPointLike | undefined)?.latitude;
  const longitude = (value as GeoPointLike | undefined)?.longitude;

  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return null;
  }

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return { latitude, longitude };
}

function calcularDistanciaMetros(origen: { latitude: number; longitude: number }, destino: { latitude: number; longitude: number }): number {
  const earthRadiusMeters = 6371000;
  const toRadians = (value: number) => value * Math.PI / 180;
  const dLat = toRadians(destino.latitude - origen.latitude);
  const dLon = toRadians(destino.longitude - origen.longitude);
  const lat1 = toRadians(origen.latitude);
  const lat2 = toRadians(destino.latitude);
  const haversine = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return Math.round(earthRadiusMeters * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)));
}

async function obtenerConfiguracionOperacion(): Promise<ConfiguracionOperacion> {
  const snap = await db.doc('ConfiguracionAdmin/operacion').get();
  const data = snap.data() || {};
  const distancia = asNumber(data.distanciaDestinoSospechosaMetros, DEFAULT_OPERACION_CONFIG.distanciaDestinoSospechosaMetros);

  return {
    pagoSeniaHabilitado: asBoolean(data.pagoSeniaHabilitado, DEFAULT_OPERACION_CONFIG.pagoSeniaHabilitado),
    antifraudeCancelacionCercaDestinoHabilitado: asBoolean(
      data.antifraudeCancelacionCercaDestinoHabilitado,
      DEFAULT_OPERACION_CONFIG.antifraudeCancelacionCercaDestinoHabilitado
    ),
    distanciaDestinoSospechosaMetros: Math.max(50, Math.min(5000, Math.round(distancia))),
  };
}

async function evaluarCancelacionCercaDestino(flete: FleteDoc, etapa: EtapaCancelacion): Promise<AnalisisAntifraudeCancelacion> {
  const config = await obtenerConfiguracionOperacion();
  const base = {
    habilitado: config.antifraudeCancelacionCercaDestinoHabilitado,
    evaluable: false,
    sospechosa: false,
    tipo: null,
    distanciaDestinoMetros: null,
    umbralMetros: config.distanciaDestinoSospechosaMetros,
    pagoSeniaHabilitado: config.pagoSeniaHabilitado,
  };

  if (!config.antifraudeCancelacionCercaDestinoHabilitado) {
    return { ...base, motivo: 'monitoreo_antifraude_deshabilitado' };
  }

  if (etapa !== 'en_viaje') {
    return { ...base, motivo: 'cancelacion_antes_de_iniciar' };
  }

  const ubicacionActual = normalizeGeoPoint(flete.ubicacionActual);
  const destino = normalizeGeoPoint(flete.endCoordinatesP);

  if (!ubicacionActual || !destino) {
    return { ...base, motivo: 'ubicacion_o_destino_no_disponible' };
  }

  const distanciaDestinoMetros = calcularDistanciaMetros(ubicacionActual, destino);
  const sospechosa = distanciaDestinoMetros <= config.distanciaDestinoSospechosaMetros;

  return {
    ...base,
    evaluable: true,
    sospechosa,
    tipo: sospechosa ? 'cancelacion_cerca_destino' : null,
    distanciaDestinoMetros,
    motivo: sospechosa ? 'cancelacion_en_viaje_cerca_del_destino' : 'cancelacion_en_viaje_fuera_del_umbral',
  };
}

function calcFleteroSancion(input: {
  scoreConfiabilidad: number;
  cancelacionesTotal: number;
  cancelacionesEnViaje: number;
}) {
  if (input.cancelacionesEnViaje >= 3 || input.scoreConfiabilidad < 25) {
    return {
      estadoSancion: 'bloqueado_revision' as EstadoSancionAutomatico,
      motivoSancionAutomatica: 'Bloqueo automático por reincidencia crítica o score extremadamente bajo.',
    };
  }

  if (input.cancelacionesEnViaje >= 2 || input.scoreConfiabilidad < 45) {
    return {
      estadoSancion: 'suspension_automatica' as EstadoSancionAutomatico,
      motivoSancionAutomatica: 'Suspensión automática por cancelaciones graves o score bajo.',
    };
  }

  if (input.cancelacionesTotal >= 2 || input.scoreConfiabilidad < 70) {
    return {
      estadoSancion: 'advertencia' as EstadoSancionAutomatico,
      motivoSancionAutomatica: 'Advertencia por tendencia de cancelaciones o caída de confiabilidad.',
    };
  }

  return {
    estadoSancion: 'normal' as EstadoSancionAutomatico,
    motivoSancionAutomatica: 'Operación normal.',
  };
}

async function registrarHistorialSancionFletero(evento: Record<string, unknown>) {
  const historialRef = db.collection('HistorialSancionesFleteros').doc();
  await historialRef.set({
    id: historialRef.id,
    ...evento,
  }, { merge: true });
}

async function registrarHistorialPenalizacionUsuario(evento: Record<string, unknown>) {
  const historialRef = db.collection('HistorialPenalizacionesUsuarios').doc();
  await historialRef.set({
    id: historialRef.id,
    ...evento,
  }, { merge: true });
}

async function syncPendingUserAlerts(usuarioId: string) {
  const metricasRef = db.doc(`MetricasUsuarios/${usuarioId}`);
  const pendientesSnap = await db.collection('AlertasAdminUsuarios')
    .where('usuarioId', '==', usuarioId)
    .where('estado', '==', 'pendiente')
    .get();

  const pendientes: PendingAlert[] = pendientesSnap.docs
    .map((doc): PendingAlert => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }))
    .sort((a, b) => {
      const aTime = a.fecha instanceof Timestamp ? a.fecha.toMillis() : new Date(String(a.fecha || '')).getTime();
      const bTime = b.fecha instanceof Timestamp ? b.fecha.toMillis() : new Date(String(b.fecha || '')).getTime();
      return bTime - aTime;
    });

  const ultimaPendiente = pendientes[0];
  await metricasRef.set({
    penalizacionPendienteAdmin: pendientes.length > 0,
    penalizacionesPendientesCount: pendientes.length,
    ultimoMotivoPenalizacion: asString(ultimaPendiente?.motivo),
    ultimaPenalizacionEtapa: ultimaPendiente?.etapa || null,
    ultimaPenalizacionFecha: ultimaPendiente?.fecha || null,
    ultimoEventoPenalizacionId: asString(ultimaPendiente?.id),
    updatedAt: serverNow(),
  }, { merge: true });
}

async function actualizarConfiabilidadUsuario(usuarioId: string) {
  const metricasRef = db.doc(`MetricasUsuarios/${usuarioId}`);
  const usuarioRef = db.doc(`Usuarios/${usuarioId}`);
  const metricasSnap = await metricasRef.get();
  const metricas = metricasSnap.data() || {};
  const recalculo = calcUserScore(metricas);

  await metricasRef.set({
    updatedAt: serverNow(),
    cancelacionesPorFletero: asNumber(metricas.cancelacionesPorFletero, 0),
    cancelacionesPorUsuario: asNumber(metricas.cancelacionesPorUsuario, 0),
    cancelacionesAntesDeIniciar: asNumber(metricas.cancelacionesAntesDeIniciar, 0),
    cancelacionesEnViaje: asNumber(metricas.cancelacionesEnViaje, 0),
    ...recalculo,
  }, { merge: true });

  await usuarioRef.set({
    scoreConfiabilidadUsuario: recalculo.scoreConfiabilidadUsuario,
    nivelConfiabilidadUsuario: recalculo.nivelConfiabilidadUsuario,
  }, { merge: true });
}

async function actualizarConfiabilidadYSancionFletero(fleteroId: string) {
  const metricasRef = db.doc(`MetricasFleteros/${fleteroId}`);
  const fleteroRef = db.doc(`Fleteros/${fleteroId}`);
  const [metricasSnap, fleteroSnap] = await Promise.all([metricasRef.get(), fleteroRef.get()]);
  const metricas = metricasSnap.data() || {};
  const fletero = fleteroSnap.data() || {};

  const viajesTomados = asNumber(metricas.viajesTomadosTotal, 0);
  const viajesFinalizados = asNumber(metricas.viajesFinalizados, 0);
  const cancelacionesTotal = asNumber(metricas.cancelacionesTotal, 0);
  const cancelacionesAntesDeIniciar = asNumber(metricas.cancelacionesAntesDeIniciar, 0);
  const cancelacionesEnViaje = asNumber(metricas.cancelacionesEnViaje, 0);
  const tasaFinalizacion = viajesTomados > 0 ? Math.round((viajesFinalizados / viajesTomados) * 100) : 100;
  const scoreBruto = 100
    - (cancelacionesAntesDeIniciar * 12)
    - (cancelacionesEnViaje * 25)
    - (Math.max(cancelacionesTotal - 1, 0) * 4)
    + Math.min(viajesFinalizados * 3, 18)
    + Math.min(viajesTomados, 10);
  const scoreConfiabilidad = Math.max(0, Math.min(100, Math.round(scoreBruto)));
  const nivelConfiabilidad = calcNivel(scoreConfiabilidad);
  const { estadoSancion, motivoSancionAutomatica } = calcFleteroSancion({
    scoreConfiabilidad,
    cancelacionesTotal,
    cancelacionesEnViaje,
  });
  const bloqueoManualAdmin = asBoolean(metricas.bloqueoManualAdmin, asBoolean(fletero.bloqueoManualAdmin));
  const motivoBloqueoManual = asString(metricas.motivoBloqueoManual, asString(fletero.motivoBloqueoManual));
  const apelacionPendiente = asBoolean(metricas.apelacionPendiente, asBoolean(fletero.apelacionPendiente));
  const apelacionDetalle = asString(metricas.apelacionDetalle, asString(fletero.apelacionDetalle));
  const estadoAnterior = asString(metricas.estadoSancion, asString(fletero.estadoSancion, 'normal'));
  const scoreAnterior = asNumber(metricas.scoreConfiabilidad, asNumber(fletero.scoreConfiabilidad, 100));
  const bloqueadoPorSancion = estadoSancion === 'suspension_automatica' || estadoSancion === 'bloqueado_revision';

  await metricasRef.set({
    updatedAt: serverNow(),
    scoreConfiabilidad,
    nivelConfiabilidad,
    estadoSancion,
    bloqueadoPorSancion,
    motivoSancionAutomatica,
    bloqueoManualAdmin,
    motivoBloqueoManual,
    apelacionPendiente,
    apelacionDetalle,
    tasaFinalizacion,
  }, { merge: true });

  await fleteroRef.set({
    scoreConfiabilidad,
    nivelConfiabilidad,
    estadoSancion,
    bloqueadoPorSancion,
    bloqueoManualAdmin,
    motivoBloqueoManual,
    apelacionPendiente,
    apelacionDetalle,
  }, { merge: true });

  if (estadoAnterior !== estadoSancion) {
    await registrarHistorialSancionFletero({
      fleteroId,
      fecha: serverNow(),
      actor: 'Sistema',
      accion: 'sancion_automatica',
      estadoAnterior,
      estadoNuevo: estadoSancion,
      bloqueadoManualAnterior: bloqueoManualAdmin,
      bloqueadoManualNuevo: bloqueoManualAdmin,
      motivo: motivoSancionAutomatica,
      detalle: `Score ${scoreConfiabilidad} | tasa finalización ${tasaFinalizacion}%`,
    });
  }

  return {
    scoreAnterior,
    scoreNuevo: scoreConfiabilidad,
    tasaFinalizacion,
    estadoAnterior,
    estadoNuevo: estadoSancion,
    motivoSancionAutomatica,
  };
}

async function cerrarChatRelacionado(userId: string, fleteroId: string, pedidoId: string) {
  const chatsSnap = await db.collectionGroup('chats')
    .where('userId', '==', userId)
    .where('fleteroId', '==', fleteroId)
    .get();

  const updates = chatsSnap.docs
    .filter((doc) => {
      const data = doc.data();
      return data?.pedidoId === pedidoId || data?.fleteId === pedidoId || doc.id === pedidoId || doc.id === `${userId}_${fleteroId}_${pedidoId}`;
    })
    .map((doc) => doc.ref.set({ estado: 'cerrado' }, { merge: true }));

  if (updates.length > 0) {
    await Promise.all(updates);
  }
}

async function registrarMetricasFinalizacionFletero(fleteroId: string) {
  const metricasRef = db.doc(`MetricasFleteros/${fleteroId}`);
  await metricasRef.set({
    updatedAt: serverNow(),
    viajesFinalizados: FieldValue.increment(1),
  }, { merge: true });
  await actualizarConfiabilidadYSancionFletero(fleteroId);
}

async function registrarMetricasTomaViaje(fleteroId: string) {
  const metricasRef = db.doc(`MetricasFleteros/${fleteroId}`);
  await metricasRef.set({
    updatedAt: serverNow(),
    viajesTomadosTotal: FieldValue.increment(1),
  }, { merge: true });
  await actualizarConfiabilidadYSancionFletero(fleteroId);
}

async function registrarMetricasCancelacionFletero(fleteroId: string, etapa: EtapaCancelacion) {
  const metricasRef = db.doc(`MetricasFleteros/${fleteroId}`);
  await metricasRef.set({
    updatedAt: serverNow(),
    cancelacionesTotal: FieldValue.increment(1),
    cancelacionesAntesDeIniciar: FieldValue.increment(etapa === 'antes_de_iniciar' ? 1 : 0),
    cancelacionesEnViaje: FieldValue.increment(etapa === 'en_viaje' ? 1 : 0),
    sancionableScore: FieldValue.increment(etapa === 'en_viaje' ? 2 : 1),
  }, { merge: true });
  return actualizarConfiabilidadYSancionFletero(fleteroId);
}

function esCancelacionImputableAlFletero(cancelacion: { motivo: string; canceladoPor: 'Fletero' | 'Usuario' | 'Sistema'; }) {
  return cancelacion.canceladoPor === 'Fletero' || cancelacion.motivo === 'no_inicio_24h';
}

async function notificarBajaScoreFletero(
  fleteroId: string,
  evento: {
    pedidoId: string;
    motivo: string;
    etapa: EtapaCancelacion;
    scoreAnterior: number;
    scoreNuevo: number;
  }
) {
  if (evento.scoreNuevo >= evento.scoreAnterior) {
    return;
  }

  const tokens = await getTokensByUid(fleteroId);
  await sendPush(
    tokens,
    'Bajo tu score de confiabilidad',
    `La cancelacion del viaje redujo tu score de ${evento.scoreAnterior} a ${evento.scoreNuevo}. Motivo: ${evento.motivo}.`,
    {
      type: 'score_fletero_bajado',
      fleteroId,
      pedidoId: evento.pedidoId,
      motivo: evento.motivo,
      etapa: evento.etapa,
      scoreAnterior: String(evento.scoreAnterior),
      scoreNuevo: String(evento.scoreNuevo),
      url: fleteroPedidoUrl(evento.pedidoId),
    }
  );
}

async function registrarConfirmacionUsuario(usuarioId: string) {
  const metricasRef = db.doc(`MetricasUsuarios/${usuarioId}`);
  await metricasRef.set({
    updatedAt: serverNow(),
    viajesConfirmadosTotal: FieldValue.increment(1),
  }, { merge: true });
  await actualizarConfiabilidadUsuario(usuarioId);
}

async function registrarMetricasFinalizacionUsuario(usuarioId: string) {
  const metricasRef = db.doc(`MetricasUsuarios/${usuarioId}`);
  await metricasRef.set({
    updatedAt: serverNow(),
    viajesFinalizados: FieldValue.increment(1),
  }, { merge: true });
  await actualizarConfiabilidadUsuario(usuarioId);
}

async function registrarMetricasCancelacionUsuario(usuarioId: string, canceladoPor: 'Fletero' | 'Usuario' | 'Sistema', etapa: EtapaCancelacion) {
  const metricasRef = db.doc(`MetricasUsuarios/${usuarioId}`);
  await metricasRef.set({
    updatedAt: serverNow(),
    cancelacionesTotal: FieldValue.increment(1),
    cancelacionesPorFletero: FieldValue.increment(canceladoPor === 'Fletero' ? 1 : 0),
    cancelacionesPorUsuario: FieldValue.increment(canceladoPor === 'Usuario' ? 1 : 0),
    cancelacionesAntesDeIniciar: FieldValue.increment(canceladoPor === 'Usuario' && etapa === 'antes_de_iniciar' ? 1 : 0),
    cancelacionesEnViaje: FieldValue.increment(canceladoPor === 'Usuario' && etapa === 'en_viaje' ? 1 : 0),
  }, { merge: true });
  await actualizarConfiabilidadUsuario(usuarioId);
}

async function registrarMetricasAntifraudeCancelacion(
  flete: FleteDoc,
  cancelacion: { motivo: string; canceladoPor: 'Fletero' | 'Usuario' | 'Sistema'; },
  etapa: EtapaCancelacion,
  analisis: AnalisisAntifraudeCancelacion,
  eventoCancelacionId: string
) {
  if (!analisis.sospechosa) {
    return;
  }

  await Promise.all([
    db.doc(`MetricasFleteros/${flete.fleteroId}`).set({
      updatedAt: serverNow(),
      cancelacionesCercaDestino: FieldValue.increment(1),
      posiblesArreglosPorFuera: FieldValue.increment(1),
      cancelacionesFleteroCercaDestino: FieldValue.increment(cancelacion.canceladoPor === 'Fletero' ? 1 : 0),
    }, { merge: true }),
    db.doc(`MetricasUsuarios/${flete.usuarioId}`).set({
      updatedAt: serverNow(),
      cancelacionesCercaDestino: FieldValue.increment(1),
      posiblesArreglosPorFuera: FieldValue.increment(1),
      cancelacionesUsuarioConFleteroEnDestino: FieldValue.increment(cancelacion.canceladoPor === 'Usuario' ? 1 : 0),
    }, { merge: true }),
    db.collection('AlertasAntifraude').doc(eventoCancelacionId).set({
      id: eventoCancelacionId,
      tipo: analisis.tipo,
      estado: 'pendiente',
      pedidoId: flete.pedidoId,
      fleteProcesoId: flete.id,
      usuarioId: flete.usuarioId,
      fleteroId: flete.fleteroId,
      fecha: serverNow(),
      etapa,
      motivo: cancelacion.motivo,
      canceladoPor: cancelacion.canceladoPor,
      distanciaDestinoMetros: analisis.distanciaDestinoMetros,
      umbralMetros: analisis.umbralMetros,
      pagoSeniaHabilitado: analisis.pagoSeniaHabilitado,
      route: {
        desde: flete.uDesde,
        hasta: flete.uHasta,
      },
    }, { merge: true }),
  ]);
}

async function notificarAdminPenalizacionUsuario(alerta: Record<string, unknown>): Promise<string> {
  const alertaRef = db.collection('AlertasAdminUsuarios').doc();
  await alertaRef.set({
    ...alerta,
    id: alertaRef.id,
  }, { merge: true });
  await syncPendingUserAlerts(asString(alerta.usuarioId));
  return alertaRef.id;
}

async function obtenerFlete(fleteroId: string, fleteId: string) {
  const fleteRef = db.doc(`Fleteros/${fleteroId}/FletesProceso/${fleteId}`);
  const fleteSnap = await fleteRef.get();
  if (!fleteSnap.exists) {
    throw new HttpsError('not-found', 'No se encontró el viaje.');
  }
  return {
    ref: fleteRef,
    data: { id: fleteSnap.id, ...(fleteSnap.data() as Record<string, unknown>) } as unknown as FleteDoc,
  };
}

function ensureTripActor(uid: string | undefined, flete: FleteDoc, allowUser = false) {
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  }

  if (uid === flete.fleteroId) {
    return 'Fletero' as const;
  }

  if (allowUser && uid === flete.usuarioId) {
    return 'Usuario' as const;
  }

  throw new HttpsError('permission-denied', 'No tienes permiso para operar este viaje.');
}

async function finalizarFleteInterno(flete: FleteDoc) {
  const fechaFinalizacion = serverNow();

  await db.doc(`Fleteros/${flete.fleteroId}/FletesProceso/${flete.id}`).set({
    estado: 'Finalizado',
    fechaFinalizacion,
    monitoreoUbicacion: {
      activo: false,
      finalizadoAt: fechaFinalizacion,
      motivo: 'viaje_finalizado',
    },
  }, { merge: true });

  const pedidoConfirmadoRef = db.doc(`PedirFlete/${flete.usuarioId}/PedidosConfirmados/${flete.pedidoId}`);
  const pedidoFinalizadoRef = db.doc(`PedirFlete/${flete.usuarioId}/PedidosFinalizados/${flete.pedidoId}`);
  const pedidoConfirmadoSnap = await pedidoConfirmadoRef.get();
  const pedidoConfirmadoData = (pedidoConfirmadoSnap.data() ?? {}) as Record<string, unknown>;

  const pedidoFinalizadoData = pedidoConfirmadoSnap.exists
    ? {
        ...pedidoConfirmadoData,
        fechaFinalizacion,
        estadoViaje: 'Finalizado',
      }
    : {
        pedidoId: flete.pedidoId,
        fleteroId: flete.fleteroId,
        usuarioId: flete.usuarioId,
        nombre: flete.nombre,
        apellido: flete.apellido,
        fecha: flete.fecha,
        hora: flete.hora,
        minutos: flete.minutos,
        uDesde: flete.uDesde,
        uHasta: flete.uHasta,
        precio: flete.precio,
        cargamento: flete.cargamento,
        tipoVehiculo: flete.tipoVehiculo,
        tipoServicio: flete.tipoServicio,
        ayudantes: flete.ayudantes,
        fechaConfirmacion: flete.fechaConfirmacion || null,
        fechaInicioViaje: flete.fechaInicioViaje || null,
        fechaFinalizacion,
        estadoViaje: 'Finalizado',
      };

  await pedidoFinalizadoRef.set(pedidoFinalizadoData, { merge: true });
  if (pedidoConfirmadoSnap.exists) {
    await pedidoConfirmadoRef.delete();
  }

  await registrarMetricasFinalizacionFletero(flete.fleteroId);
  await registrarMetricasFinalizacionUsuario(flete.usuarioId);
  await cerrarChatRelacionado(flete.usuarioId, flete.fleteroId, flete.pedidoId);
}

async function cancelarFleteInterno(flete: FleteDoc, cancelacion: { motivo: string; observacion?: string; canceladoPor: 'Fletero' | 'Usuario' | 'Sistema'; }) {
  const fechaCancelacion = serverNow();
  const etapa: EtapaCancelacion = flete.estado === 'En Viaje' ? 'en_viaje' : 'antes_de_iniciar';
  const analisisAntifraude = await evaluarCancelacionCercaDestino(flete, etapa);
  const cancelacionData = {
    ...cancelacion,
    fecha: fechaCancelacion,
    etapa,
    antifraude: analisisAntifraude,
  };

  await db.doc(`Fleteros/${flete.fleteroId}/FletesProceso/${flete.id}`).set({
    estado: 'Cancelado',
    cancelacion: cancelacionData,
    fechaCancelacion,
    monitoreoUbicacion: {
      activo: false,
      finalizadoAt: fechaCancelacion,
      motivo: 'viaje_cancelado',
    },
  }, { merge: true });

  const pedidoConfirmadoRef = db.doc(`PedirFlete/${flete.usuarioId}/PedidosConfirmados/${flete.pedidoId}`);
  const pedidoCanceladoRef = db.doc(`PedirFlete/${flete.usuarioId}/PedidosCancelados/${flete.pedidoId}`);
  const pedidoConfirmadoSnap = await pedidoConfirmadoRef.get();
  const pedidoConfirmadoData = (pedidoConfirmadoSnap.data() ?? {}) as Record<string, unknown>;
  const [fleteroSnap, usuarioSnap] = await Promise.all([
    db.doc(`Fleteros/${flete.fleteroId}`).get(),
    db.doc(`Usuarios/${flete.usuarioId}`).get(),
  ]);
  const fleteroData = fleteroSnap.data() || {};
  const usuarioData = usuarioSnap.data() || {};

  const payloadCancelado = pedidoConfirmadoSnap.exists
    ? {
        ...pedidoConfirmadoData,
        estadoViaje: 'Cancelado',
        cancelacion: cancelacionData,
        fechaCancelacion,
      }
    : {
        pedidoId: flete.pedidoId,
        fleteroId: flete.fleteroId,
        usuarioId: flete.usuarioId,
        nombre: flete.nombre,
        apellido: flete.apellido,
        fecha: flete.fecha,
        hora: flete.hora,
        minutos: flete.minutos,
        uDesde: flete.uDesde,
        uHasta: flete.uHasta,
        precio: flete.precio,
        precioAceptado: flete.precioAceptado || null,
        cargamento: flete.cargamento,
        tipoVehiculo: flete.tipoVehiculo,
        tipoServicio: flete.tipoServicio,
        ayudantes: flete.ayudantes,
        fechaConfirmacion: flete.fechaConfirmacion || null,
        fechaInicioViaje: flete.fechaInicioViaje || null,
        fechaCancelacion,
        estadoViaje: 'Cancelado',
        cancelacion: cancelacionData,
      };

  await pedidoCanceladoRef.set(payloadCancelado, { merge: true });
  if (pedidoConfirmadoSnap.exists) {
    await pedidoConfirmadoRef.delete();
  }

  const eventoCancelacionRef = db.collection('ViajesCancelados').doc();
  await eventoCancelacionRef.set({
    id: eventoCancelacionRef.id,
    pedidoId: flete.pedidoId,
    fleteProcesoId: flete.id,
    usuarioId: flete.usuarioId,
    fleteroId: flete.fleteroId,
    fechaCancelacion,
    etapa,
    motivo: cancelacion.motivo,
    canceladoPor: cancelacion.canceladoPor,
    observacion: cancelacion.observacion || '',
    antifraude: analisisAntifraude,
    route: {
      desde: flete.uDesde,
      hasta: flete.uHasta,
    },
    provinciaFletero: asString(fleteroData.provincia),
    provinciaUsuario: asString(usuarioData.provincia),
    zonaTexto: `${flete.uDesde || ''} ${flete.uHasta || ''}`.trim(),
  }, { merge: true });

  await registrarMetricasAntifraudeCancelacion(flete, cancelacion, etapa, analisisAntifraude, eventoCancelacionRef.id);

  if (esCancelacionImputableAlFletero(cancelacion)) {
    const cambioScore = await registrarMetricasCancelacionFletero(flete.fleteroId, etapa);
    await notificarBajaScoreFletero(flete.fleteroId, {
      pedidoId: flete.pedidoId,
      motivo: cancelacion.motivo,
      etapa,
      scoreAnterior: cambioScore.scoreAnterior,
      scoreNuevo: cambioScore.scoreNuevo,
    });
  }

  await registrarMetricasCancelacionUsuario(flete.usuarioId, cancelacion.canceladoPor, etapa);

  if (cancelacion.canceladoPor === 'Usuario') {
    const metricasUsuarioSnap = await db.doc(`MetricasUsuarios/${flete.usuarioId}`).get();
    const metricasUsuario = metricasUsuarioSnap.data() || {};
    const alertaId = await notificarAdminPenalizacionUsuario({
      usuarioId: flete.usuarioId,
      pedidoId: flete.pedidoId,
      fleteProcesoId: flete.id,
      eventoCancelacionId: eventoCancelacionRef.id,
      fecha: fechaCancelacion,
      etapa,
      motivo: cancelacion.motivo,
      canceladoPor: 'Usuario',
      usuarioNombre: `${flete.nombre || ''} ${flete.apellido || ''}`.trim(),
      provinciaUsuario: asString(usuarioData.provincia),
      zonaTexto: `${flete.uDesde || ''} ${flete.uHasta || ''}`.trim(),
      estado: 'pendiente',
    });

    await registrarHistorialPenalizacionUsuario({
      usuarioId: flete.usuarioId,
      alertaId,
      pedidoId: flete.pedidoId,
      fleteProcesoId: flete.id,
      fecha: fechaCancelacion,
      actor: 'Sistema',
      accion: 'penalizacion_usuario',
      etapa,
      motivo: cancelacion.motivo,
      detalle: `Cancelación registrada por el usuario en etapa ${etapa}.`,
      origenPantalla: 'sistema',
      scoreAnterior: asNumber(metricasUsuario.scoreConfiabilidadUsuario, 100),
      scoreNuevo: asNumber(metricasUsuario.scoreConfiabilidadUsuario, 100),
    });
  }

  await cerrarChatRelacionado(flete.usuarioId, flete.fleteroId, flete.pedidoId);
}

export const adminDespenalizarUsuario = onCall({ cors: callableCors }, async (request) => {
  await assertPanelRole(request.auth?.uid, ['Admin', 'Soporte']);

  const alertaId = asString(request.data?.alertaId).trim();
  const detalleAdmin = asString(request.data?.detalleAdmin, 'Despenalización manual por admin').trim() || 'Despenalización manual por admin';
  const origenPantalla = request.data?.origenPantalla === 'reportes' ? 'reportes' : 'usuarios';
  const actorId = request.auth?.uid || '';
  const actorEmail = asString(request.auth?.token?.email);

  if (!alertaId) {
    throw new HttpsError('invalid-argument', 'Falta alertaId.');
  }

  const alertaRef = db.doc(`AlertasAdminUsuarios/${alertaId}`);
  const alertaSnap = await alertaRef.get();
  if (!alertaSnap.exists) {
    throw new HttpsError('not-found', 'No se encontró la alerta.');
  }

  const alerta = alertaSnap.data() || {};
  if (alerta.estado !== 'pendiente') {
    return { ok: true, skipped: true };
  }

  const usuarioId = asString(alerta.usuarioId);
  const metricasRef = db.doc(`MetricasUsuarios/${usuarioId}`);
  const usuarioRef = db.doc(`Usuarios/${usuarioId}`);
  const metricasPreviasSnap = await metricasRef.get();
  const metricasPrevias = metricasPreviasSnap.data() || {};
  const scoreAnterior = asNumber(metricasPrevias.scoreConfiabilidadUsuario, 100);
  const etapa = asString(alerta.etapa);

  await metricasRef.set({
    updatedAt: serverNow(),
    cancelacionesTotal: FieldValue.increment(-1),
    cancelacionesPorUsuario: FieldValue.increment(-1),
    cancelacionesAntesDeIniciar: FieldValue.increment(etapa === 'antes_de_iniciar' ? -1 : 0),
    cancelacionesEnViaje: FieldValue.increment(etapa === 'en_viaje' ? -1 : 0),
  }, { merge: true });

  await alertaRef.set({
    estado: 'despenalizado',
    detalleAdmin,
    fechaResolucion: serverNow(),
  }, { merge: true });

  const pendientesSnap = await db.collection('AlertasAdminUsuarios')
    .where('usuarioId', '==', usuarioId)
    .where('estado', '==', 'pendiente')
    .get();

  const pendientes: PendingAlert[] = pendientesSnap.docs
    .map((doc): PendingAlert => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }))
    .sort((a, b) => {
      const aTime = a.fecha instanceof Timestamp ? a.fecha.toMillis() : new Date(String(a.fecha || '')).getTime();
      const bTime = b.fecha instanceof Timestamp ? b.fecha.toMillis() : new Date(String(b.fecha || '')).getTime();
      return bTime - aTime;
    });

  const ultimaPendiente = pendientes[0];
  const metricasActualesSnap = await metricasRef.get();
  const metricasActuales = metricasActualesSnap.data() || {};
  const recalculo = calcUserScore(metricasActuales);

  await metricasRef.set({
    updatedAt: serverNow(),
    penalizacionPendienteAdmin: pendientes.length > 0,
    penalizacionesPendientesCount: pendientes.length,
    ultimoMotivoPenalizacion: asString(ultimaPendiente?.motivo),
    ultimaPenalizacionEtapa: ultimaPendiente?.etapa || null,
    ultimaPenalizacionFecha: ultimaPendiente?.fecha || null,
    ultimoEventoPenalizacionId: asString(ultimaPendiente?.id),
    ...recalculo,
  }, { merge: true });

  await usuarioRef.set({
    scoreConfiabilidadUsuario: recalculo.scoreConfiabilidadUsuario,
    nivelConfiabilidadUsuario: recalculo.nivelConfiabilidadUsuario,
  }, { merge: true });

  const historialRef = db.collection('HistorialPenalizacionesUsuarios').doc();
  await historialRef.set({
    id: historialRef.id,
    usuarioId,
    alertaId,
    pedidoId: alerta.pedidoId || '',
    fleteProcesoId: alerta.fleteProcesoId || '',
    fecha: serverNow(),
    actor: 'Admin',
    actorId,
    actorEmail,
    accion: 'despenalizacion_usuario',
    etapa: alerta.etapa || null,
    motivo: alerta.motivo || '',
    detalle: detalleAdmin,
    origenPantalla,
    scoreAnterior,
    scoreNuevo: recalculo.scoreConfiabilidadUsuario,
  }, { merge: true });

  return { ok: true };
});

export const adminSetRolPanelUsuario = onCall({ cors: callableCors }, async (request) => {
  await assertAdmin(request.auth?.uid);

  const targetUid = asString(request.data?.uid).trim();
  const rol = normalizeRolPanel(request.data?.rol);
  const activo = request.data?.activo === undefined ? true : asBoolean(request.data?.activo);
  const actorAdmin = asString(request.data?.actorAdmin, 'admin-panel');

  if (!targetUid) {
    throw new HttpsError('invalid-argument', 'Falta el usuario a modificar.');
  }

  const usuarioSnap = await db.doc(`Usuarios/${targetUid}`).get();
  const fleteroSnap = await db.doc(`Fleteros/${targetUid}`).get();
  const email = asString(
    usuarioSnap.data()?.email,
    asString(fleteroSnap.data()?.email)
  );

  await db.doc(`Admins/${targetUid}`).set({
    uid: targetUid,
    email,
    rol,
    activo,
    updatedAt: serverNow(),
    updatedBy: request.auth?.uid,
    updatedByLabel: actorAdmin,
  }, { merge: true });

  return { ok: true };
});

export const adminSetPerfilAplicacionUsuario = onCall({ cors: callableCors }, async (request) => {
  await assertPanelRole(request.auth?.uid, ['Admin', 'Soporte', 'Verificador']);

  const targetUid = asString(request.data?.uid).trim();
  const perfilActivo = normalizePerfilApp(request.data?.perfilActivo);
  const motivo = asString(request.data?.motivo).trim();
  const actorAdmin = asString(request.data?.actorAdmin, 'panel');

  if (!targetUid || !motivo) {
    throw new HttpsError('invalid-argument', 'Faltan datos para cambiar el perfil.');
  }

  const usuarioRef = db.doc(`Usuarios/${targetUid}`);
  const fleteroRef = db.doc(`Fleteros/${targetUid}`);
  const [usuarioSnap, fleteroSnap] = await Promise.all([usuarioRef.get(), fleteroRef.get()]);

  if (!usuarioSnap.exists && !fleteroSnap.exists) {
    throw new HttpsError('not-found', 'No se encontro la cuenta.');
  }

  const usuario = usuarioSnap.data() || {};
  const fletero = fleteroSnap.data() || {};
  const base = usuarioSnap.exists ? usuario : fletero;
  const perfilesDisponibles = new Set<string>([
    ...(Array.isArray(base.perfilesDisponibles) ? base.perfilesDisponibles.map(String) : []),
    usuarioSnap.exists ? 'Usuario' : '',
    fleteroSnap.exists ? 'Fletero' : '',
    perfilActivo,
  ].filter(Boolean));

  const batch = db.batch();
  const audit = {
    perfilActivo,
    perfilesDisponibles: Array.from(perfilesDisponibles),
    cambioPerfilMotivo: motivo,
    cambioPerfilAt: serverNow(),
    cambioPerfilBy: request.auth?.uid,
    cambioPerfilByLabel: actorAdmin,
  };

  if (usuarioSnap.exists) {
    batch.set(usuarioRef, audit, { merge: true });
  }

  if (perfilActivo === 'Usuario' && !usuarioSnap.exists) {
    throw new HttpsError('failed-precondition', 'La cuenta no tiene perfil de usuario para activar.');
  }

  if (perfilActivo === 'Fletero' && !fleteroSnap.exists) {
    batch.set(fleteroRef, {
      uid: targetUid,
      nombre: asString(base.nombre),
      apellido: asString(base.apellido),
      dni: asString(base.dni),
      edad: base.edad ?? null,
      domicilio: asString(base.domicilio),
      telefono: asString(base.telefono),
      telefonoRespaldo: asString(base.telefonoRespaldo),
      email: asString(base.email),
      image: asString(base.image, asString(base.photoURL)),
      photoURL: asString(base.photoURL, asString(base.image)),
      provincia: base.provincia || null,
      perfil: 'Fletero',
      metodoRegistro: base.metodoRegistro || 'email',
      estadoRegistro: 'pendiente_revision',
      fechaRegistro: base.fechaRegistro || serverNow(),
      fechaVencimientoVerificacion: Timestamp.fromDate(new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)),
      emailVerificado: asBoolean(base.emailVerificado),
      telefonoVerificado: asBoolean(base.telefonoVerificado),
      documentacionCompleta: false,
      verificado: false,
      habilitado: false,
      bloqueadoPorSancion: false,
      bloqueadoPorVencimiento: false,
      altaPorCambioPerfil: true,
      altaPorCambioPerfilAt: serverNow(),
      altaPorCambioPerfilBy: request.auth?.uid,
      verificacionDni: {
        estado: 'pendiente',
        observacion: 'Pendiente de carga y revision por cambio de usuario a fletero.',
        revisadoPorAdmin: false,
        fechaCarga: null,
        fechaRevision: null,
      },
      ...audit,
    }, { merge: true });
  } else if (fleteroSnap.exists) {
    batch.set(fleteroRef, {
      perfil: 'Fletero',
      ...audit,
    }, { merge: true });
  }

  const historialRef = db.collection('HistorialCambiosPerfil').doc();
  batch.set(historialRef, {
    id: historialRef.id,
    uid: targetUid,
    fecha: serverNow(),
    actor: 'Panel',
    actorId: request.auth?.uid,
    actorLabel: actorAdmin,
    perfilAnterior: asString(base.perfilActivo, asString(base.perfil)),
    perfilNuevo: perfilActivo,
    motivo,
  }, { merge: true });

  await batch.commit();
  return { ok: true };
});

export const adminSetBloqueoManualFletero = onCall({ cors: callableCors }, async (request) => {
  await assertPanelRole(request.auth?.uid, ['Admin', 'Verificador']);

  const fleteroId = asString(request.data?.fleteroId).trim();
  const bloquear = asBoolean(request.data?.bloquear);
  const motivo = asString(request.data?.motivo).trim();
  const actorAdmin = asString(request.data?.actorAdmin, 'admin-panel');

  if (!fleteroId || !motivo) {
    throw new HttpsError('invalid-argument', 'Faltan datos para actualizar el bloqueo manual.');
  }

  const metricasRef = db.doc(`MetricasFleteros/${fleteroId}`);
  const fleteroRef = db.doc(`Fleteros/${fleteroId}`);
  const [metricasSnap, fleteroSnap] = await Promise.all([metricasRef.get(), fleteroRef.get()]);
  const metricas = metricasSnap.data() || {};
  const fletero = fleteroSnap.data() || {};

  await Promise.all([
    metricasRef.set({
      updatedAt: serverNow(),
      bloqueoManualAdmin: bloquear,
      motivoBloqueoManual: motivo,
      apelacionPendiente: false,
      apelacionDetalle: '',
    }, { merge: true }),
    fleteroRef.set({
      bloqueoManualAdmin: bloquear,
      motivoBloqueoManual: motivo,
      apelacionPendiente: false,
      apelacionDetalle: '',
    }, { merge: true }),
  ]);

  const historialRef = db.collection('HistorialSancionesFleteros').doc();
  await historialRef.set({
    id: historialRef.id,
    fleteroId,
    fecha: serverNow(),
    actor: 'Admin',
    accion: bloquear ? 'bloqueo_manual' : 'desbloqueo_manual',
    estadoAnterior: asString(metricas.estadoSancion, asString(fletero.estadoSancion, 'normal')),
    estadoNuevo: asString(metricas.estadoSancion, asString(fletero.estadoSancion, 'normal')),
    bloqueadoManualAnterior: asBoolean(metricas.bloqueoManualAdmin, asBoolean(fletero.bloqueoManualAdmin)),
    bloqueadoManualNuevo: bloquear,
    motivo,
    detalle: `Operado por ${actorAdmin}`,
  }, { merge: true });

  return { ok: true };
});

export const adminSetHabilitadoFletero = onCall({ cors: callableCors }, async (request) => {
  await assertPanelRole(request.auth?.uid, ['Admin', 'Verificador']);

  const fleteroId = asString(request.data?.fleteroId).trim();
  const habilitado = asBoolean(request.data?.habilitado);
  const actorAdmin = asString(request.data?.actorAdmin, 'admin-panel');

  if (!fleteroId) {
    throw new HttpsError('invalid-argument', 'Falta el fletero a actualizar.');
  }

  const fleteroRef = db.doc(`Fleteros/${fleteroId}`);
  const fleteroSnap = await fleteroRef.get();
  if (!fleteroSnap.exists) {
    throw new HttpsError('not-found', 'No se encontró el fletero.');
  }

  const fletero = fleteroSnap.data() || {};
  await fleteroRef.set({
    habilitado,
    updatedAt: serverNow(),
  }, { merge: true });

  const historialRef = db.collection('HistorialSancionesFleteros').doc();
  await historialRef.set({
    id: historialRef.id,
    fleteroId,
    fecha: serverNow(),
    actor: 'Admin',
    accion: habilitado ? 'habilitacion_manual' : 'deshabilitacion_manual',
    motivo: habilitado ? 'Fletero habilitado manualmente' : 'Fletero deshabilitado manualmente',
    detalle: `Operado por ${actorAdmin}`,
    habilitadoAnterior: asBoolean(fletero.habilitado),
    habilitadoNuevo: habilitado,
  }, { merge: true });

  return { ok: true };
});

export const adminSetVerificadoFletero = onCall({ cors: callableCors }, async (request) => {
  await assertPanelRole(request.auth?.uid, ['Admin', 'Verificador']);

  const fleteroId = asString(request.data?.fleteroId).trim();
  const verificado = asBoolean(request.data?.verificado);
  const actorAdmin = asString(request.data?.actorAdmin, 'admin-panel');

  if (!fleteroId) {
    throw new HttpsError('invalid-argument', 'Falta el fletero a actualizar.');
  }

  const fleteroRef = db.doc(`Fleteros/${fleteroId}`);
  const fleteroSnap = await fleteroRef.get();
  if (!fleteroSnap.exists) {
    throw new HttpsError('not-found', 'No se encontró el fletero.');
  }

  const fletero = fleteroSnap.data() || {};
  const verificacionDni = typeof fletero.verificacionDni === 'object' && fletero.verificacionDni
    ? fletero.verificacionDni as Record<string, unknown>
    : {};
  const update: Record<string, unknown> = {
    verificado,
    updatedAt: serverNow(),
    verificacionDni: {
      ...verificacionDni,
      estado: verificado ? 'aprobado' : asString(verificacionDni.estado, 'pendiente'),
      observacion: verificado
        ? 'Validado manualmente desde admin.'
        : asString(verificacionDni.observacion),
      revisadoPorAdmin: verificado,
      fechaRevision: serverNow(),
      revisadoPor: actorAdmin,
    },
  };

  if (verificado) {
    update.habilitado = true;
  }

  await fleteroRef.set(update, { merge: true });

  const historialRef = db.collection('HistorialSancionesFleteros').doc();
  await historialRef.set({
    id: historialRef.id,
    fleteroId,
    fecha: serverNow(),
    actor: 'Admin',
    accion: verificado ? 'verificacion_manual' : 'quitar_verificacion_manual',
    motivo: verificado ? 'Fletero verificado manualmente' : 'Verificación removida manualmente',
    detalle: `Operado por ${actorAdmin}`,
    verificadoAnterior: asBoolean(fletero.verificado),
    verificadoNuevo: verificado,
    habilitadoAnterior: asBoolean(fletero.habilitado),
    habilitadoNuevo: verificado ? true : asBoolean(fletero.habilitado),
  }, { merge: true });

  return { ok: true };
});

export const adminRevisarDniFletero = onCall({ cors: callableCors }, async (request) => {
  await assertPanelRole(request.auth?.uid, ['Admin', 'Verificador']);

  const fleteroId = asString(request.data?.fleteroId).trim();
  const estado = asString(request.data?.estado).trim();
  const observacion = asString(request.data?.observacion).trim();
  const actorAdmin = asString(request.data?.actorAdmin, 'admin-panel');

  if (!fleteroId || (estado !== 'aprobado' && estado !== 'rechazado')) {
    throw new HttpsError('invalid-argument', 'Faltan datos válidos para revisar el DNI.');
  }

  const fleteroRef = db.doc(`Fleteros/${fleteroId}`);
  const fleteroSnap = await fleteroRef.get();
  if (!fleteroSnap.exists) {
    throw new HttpsError('not-found', 'No se encontró el fletero.');
  }

  const fletero = fleteroSnap.data() || {};
  const verificacionDni = typeof fletero.verificacionDni === 'object' && fletero.verificacionDni
    ? fletero.verificacionDni as Record<string, unknown>
    : {};
  const aprobado = estado === 'aprobado';
  const detalleRevision = observacion || (aprobado
    ? 'DNI validado manualmente desde admin.'
    : 'DNI rechazado. Requiere nueva carga o corrección.');

  await fleteroRef.set({
    verificado: aprobado,
    habilitado: aprobado,
    updatedAt: serverNow(),
    verificacionDni: {
      ...verificacionDni,
      estado,
      observacion: detalleRevision,
      revisadoPorAdmin: true,
      fechaRevision: serverNow(),
      revisadoPor: actorAdmin,
    },
  }, { merge: true });

  const historialRef = db.collection('HistorialSancionesFleteros').doc();
  await historialRef.set({
    id: historialRef.id,
    fleteroId,
    fecha: serverNow(),
    actor: 'Admin',
    accion: aprobado ? 'dni_aprobado' : 'dni_rechazado',
    motivo: detalleRevision,
    detalle: `Operado por ${actorAdmin}`,
    verificadoAnterior: asBoolean(fletero.verificado),
    verificadoNuevo: aprobado,
    habilitadoAnterior: asBoolean(fletero.habilitado),
    habilitadoNuevo: aprobado,
  }, { merge: true });

  return { ok: true };
});

export const adminMarcarApelacionPendienteFletero = onCall({ cors: callableCors }, async (request) => {
  await assertPanelRole(request.auth?.uid, ['Admin', 'Verificador']);

  const fleteroId = asString(request.data?.fleteroId).trim();
  const detalle = asString(request.data?.detalle).trim();
  const actorAdmin = asString(request.data?.actorAdmin, 'admin-panel');

  if (!fleteroId || !detalle) {
    throw new HttpsError('invalid-argument', 'Faltan datos para registrar la apelación.');
  }

  const metricasRef = db.doc(`MetricasFleteros/${fleteroId}`);
  const fleteroRef = db.doc(`Fleteros/${fleteroId}`);

  await Promise.all([
    metricasRef.set({
      updatedAt: serverNow(),
      apelacionPendiente: true,
      apelacionDetalle: detalle,
    }, { merge: true }),
    fleteroRef.set({
      apelacionPendiente: true,
      apelacionDetalle: detalle,
    }, { merge: true }),
  ]);

  const historialRef = db.collection('HistorialSancionesFleteros').doc();
  await historialRef.set({
    id: historialRef.id,
    fleteroId,
    fecha: serverNow(),
    actor: 'Admin',
    accion: 'apelacion_pendiente',
    motivo: 'Apelación registrada',
    detalle: `${detalle} | ${actorAdmin}`,
  }, { merge: true });

  return { ok: true };
});

export const adminResolverApelacionFletero = onCall({ cors: callableCors }, async (request) => {
  await assertPanelRole(request.auth?.uid, ['Admin', 'Verificador']);

  const fleteroId = asString(request.data?.fleteroId).trim();
  const aprobar = asBoolean(request.data?.aprobar);
  const detalle = asString(request.data?.detalle).trim();
  const actorAdmin = asString(request.data?.actorAdmin, 'admin-panel');

  if (!fleteroId || !detalle) {
    throw new HttpsError('invalid-argument', 'Faltan datos para resolver la apelación.');
  }

  const metricasRef = db.doc(`MetricasFleteros/${fleteroId}`);
  const fleteroRef = db.doc(`Fleteros/${fleteroId}`);
  const [metricasSnap, fleteroSnap] = await Promise.all([metricasRef.get(), fleteroRef.get()]);
  const metricas = metricasSnap.data() || {};
  const fletero = fleteroSnap.data() || {};
  const nuevoEstado = aprobar ? 'normal' : asString(metricas.estadoSancion, asString(fletero.estadoSancion, 'advertencia'));
  const nuevoMotivo = aprobar ? 'Sanción levantada manualmente por admin.' : asString(metricas.motivoSancionAutomatica, 'Apelación rechazada');

  await Promise.all([
    metricasRef.set({
      updatedAt: serverNow(),
      apelacionPendiente: false,
      apelacionDetalle: detalle,
      estadoSancion: nuevoEstado,
      bloqueadoPorSancion: aprobar ? false : asBoolean(metricas.bloqueadoPorSancion),
      motivoSancionAutomatica: nuevoMotivo,
    }, { merge: true }),
    fleteroRef.set({
      apelacionPendiente: false,
      apelacionDetalle: detalle,
      estadoSancion: nuevoEstado,
      bloqueadoPorSancion: aprobar ? false : asBoolean(fletero.bloqueadoPorSancion),
    }, { merge: true }),
  ]);

  const historialRef = db.collection('HistorialSancionesFleteros').doc();
  await historialRef.set({
    id: historialRef.id,
    fleteroId,
    fecha: serverNow(),
    actor: 'Admin',
    accion: aprobar ? 'apelacion_aprobada' : 'apelacion_rechazada',
    estadoAnterior: asString(metricas.estadoSancion, asString(fletero.estadoSancion, 'normal')),
    estadoNuevo: nuevoEstado,
    bloqueadoManualAnterior: asBoolean(metricas.bloqueoManualAdmin, asBoolean(fletero.bloqueoManualAdmin)),
    bloqueadoManualNuevo: asBoolean(metricas.bloqueoManualAdmin, asBoolean(fletero.bloqueoManualAdmin)),
    motivo: aprobar ? 'Levantamiento manual de sanción' : 'Apelación rechazada',
    detalle: `${detalle} | ${actorAdmin}`,
  }, { merge: true });

  return { ok: true };
});

export const actualizarEstadoFleteSeguro = onCall({ cors: callableCors }, async (request) => {
  const fleteroId = asString(request.data?.fleteroId).trim();
  const fleteId = asString(request.data?.fleteId).trim();
  const nuevoEstado = asString(request.data?.nuevoEstado) as EstadoFleteProceso;

  if (!fleteroId || !fleteId || !nuevoEstado) {
    throw new HttpsError('invalid-argument', 'Faltan datos del viaje.');
  }

  const { ref, data: flete } = await obtenerFlete(fleteroId, fleteId);
  const isAdminUser = await isPanelUser(request.auth?.uid);
  if (!isAdminUser) {
    ensureTripActor(request.auth?.uid, flete, false);
  }

  if (nuevoEstado === 'En Viaje') {
    if (flete.estado !== 'Confirmado') {
      throw new HttpsError('failed-precondition', 'Solo se puede iniciar un viaje confirmado.');
    }

    await ref.set({
      estado: 'En Viaje',
      fechaInicioViaje: serverNow(),
      monitoreoUbicacion: {
        activo: true,
        iniciadoAt: serverNow(),
        motivo: 'viaje_iniciado',
      },
    }, { merge: true });

    return { ok: true };
  }

  if (nuevoEstado === 'Finalizado') {
    if (flete.estado !== 'En Viaje' && flete.estado !== 'Confirmado') {
      throw new HttpsError('failed-precondition', 'El viaje no se puede finalizar desde su estado actual.');
    }

    await finalizarFleteInterno(flete);
    return { ok: true };
  }

  throw new HttpsError('invalid-argument', 'Estado no permitido para esta operación.');
});

export const finalizarFleteSeguro = onCall({ cors: callableCors }, async (request) => {
  const fleteroId = asString(request.data?.fleteroId).trim();
  const fleteId = asString(request.data?.fleteId).trim();

  if (!fleteroId || !fleteId) {
    throw new HttpsError('invalid-argument', 'Faltan datos del viaje.');
  }

  const { data: flete } = await obtenerFlete(fleteroId, fleteId);
  const isAdminUser = await isPanelUser(request.auth?.uid);
  if (!isAdminUser) {
    ensureTripActor(request.auth?.uid, flete, false);
  }

  if (flete.estado === 'Finalizado' || flete.estado === 'Cancelado') {
    throw new HttpsError('failed-precondition', 'El viaje ya está cerrado.');
  }

  await finalizarFleteInterno(flete);
  return { ok: true };
});

export const cancelarFleteSeguro = onCall({ cors: callableCors }, async (request) => {
  const fleteroId = asString(request.data?.fleteroId).trim();
  const fleteId = asString(request.data?.fleteId).trim();
  const motivo = asString(request.data?.motivo).trim();
  const observacion = asString(request.data?.observacion).trim();

  if (!fleteroId || !fleteId || !motivo) {
    throw new HttpsError('invalid-argument', 'Faltan datos para cancelar el viaje.');
  }

  const { data: flete } = await obtenerFlete(fleteroId, fleteId);
  const isAdminUser = await isPanelUser(request.auth?.uid);
  let canceladoPor: 'Fletero' | 'Usuario' | 'Sistema' = 'Sistema';

  if (!isAdminUser) {
    canceladoPor = ensureTripActor(request.auth?.uid, flete, true);
  }

  if (flete.estado === 'Finalizado' || flete.estado === 'Cancelado') {
    throw new HttpsError('failed-precondition', 'El viaje ya está cerrado.');
  }

  await cancelarFleteInterno(flete, {
    motivo,
    observacion,
    canceladoPor,
  });

  return { ok: true };
});

export const cancelarFletesNoIniciados24h = onSchedule(
  {
    schedule: 'every 60 minutes',
    timeZone: 'America/Argentina/Buenos_Aires',
  },
  async () => {
    const ahoraMs = Date.now();
    const limiteMs = 24 * 60 * 60 * 1000;
    const snap = await db.collectionGroup('FletesProceso')
      .where('estado', '==', 'Confirmado')
      .get();

    let cancelados = 0;

    for (const docSnap of snap.docs) {
      const flete = { id: docSnap.id, ...(docSnap.data() as Record<string, unknown>) } as unknown as FleteDoc;
      const fechaProgramada = buildFechaProgramadaFlete(flete);

      if (!fechaProgramada || ahoraMs - fechaProgramada.getTime() < limiteMs) {
        continue;
      }

      try {
        await cancelarFleteInterno(flete, {
          motivo: 'no_inicio_24h',
          observacion: 'Cancelacion automatica: el fletero no inicio el viaje dentro de las 24 horas posteriores al horario pactado.',
          canceladoPor: 'Sistema',
        });

        await db.collection('HistorialSancionesFleteros').doc().set({
          fleteroId: flete.fleteroId,
          fecha: serverNow(),
          actor: 'Sistema',
          accion: 'sancion_automatica',
          estadoAnterior: 'normal',
          estadoNuevo: 'normal',
          motivo: 'Viaje no iniciado en plazo',
          detalle: `Pedido ${flete.pedidoId} cancelado automaticamente por no iniciar dentro de 24 horas.`,
        }, { merge: true });

        cancelados += 1;
      } catch (error) {
        console.error('Error cancelando flete no iniciado:', docSnap.ref.path, error);
      }
    }

    console.info(`cancelarFletesNoIniciados24h: ${cancelados} viajes cancelados.`);
  }
);

export const confirmarPedidoConRespuestaSeguro = onCall({ cors: callableCors }, async (request) => {
  const pedido = (request.data?.pedido || {}) as Record<string, unknown>;
  const respuesta = (request.data?.respuesta || {}) as Record<string, unknown>;
  const fleteEnProceso = (request.data?.fleteEnProceso || {}) as Record<string, unknown>;

  const usuarioId = asString(pedido.uid).trim();
  const pedidoId = asString(pedido.id).trim();
  const fleteroId = asString(respuesta.idFletero || fleteEnProceso.fleteroId).trim();
  const respuestaId = asString(respuesta.docId || fleteroId).trim();
  const fleteId = asString(fleteEnProceso.id).trim();

  if (!usuarioId || !pedidoId || !fleteroId || !respuestaId || !fleteId) {
    throw new HttpsError('invalid-argument', 'Faltan datos para confirmar el pedido.');
  }

  if (request.auth?.uid !== usuarioId) {
    throw new HttpsError('permission-denied', 'Solo el usuario dueño del pedido puede confirmarlo.');
  }

  const pedidoRef = db.doc(`PedirFlete/${usuarioId}/Pedidos/${pedidoId}`);
  const respuestaRef = db.doc(`PedirFlete/${usuarioId}/Pedidos/${pedidoId}/Respuesta/${respuestaId}`);
  const pedidoConfirmadoRef = db.doc(`PedirFlete/${usuarioId}/PedidosConfirmados/${pedidoId}`);
  const fleteProcesoRef = db.doc(`Fleteros/${fleteroId}/FletesProceso/${fleteId}`);

  const [pedidoSnap, respuestaSnap] = await Promise.all([pedidoRef.get(), respuestaRef.get()]);
  if (!pedidoSnap.exists) {
    throw new HttpsError('not-found', 'No se encontró el pedido original.');
  }
  if (!respuestaSnap.exists) {
    throw new HttpsError('not-found', 'No se encontró la respuesta seleccionada.');
  }

  const fechaConfirmacion = serverNow();
  const pedidoData = pedidoSnap.data() || pedido;
  const respuestaData = respuestaSnap.data() || respuesta;

  await fleteProcesoRef.set({
    ...fleteEnProceso,
    id: fleteId,
    pedidoId,
    usuarioId,
    fleteroId,
    estado: 'Confirmado',
    fechaConfirmacion,
  }, { merge: true });

  await pedidoConfirmadoRef.set({
    ...pedidoData,
    precio: respuestaData.precio ?? pedidoData.precio ?? 0,
    respuesta: respuestaData,
    estadoViaje: 'Confirmado',
    fechaConfirmacion,
  }, { merge: true });

  await Promise.all([
    pedidoRef.delete(),
    respuestaRef.delete(),
  ]);

  await registrarMetricasTomaViaje(fleteroId);
  await registrarConfirmacionUsuario(usuarioId);

  return { ok: true, fleteId };
});

type PushPerfil = 'Usuario' | 'Fletero';
type PushSubscriptionDoc = {
  uid?: unknown;
  perfil?: unknown;
  token?: unknown;
  enabled?: unknown;
};

async function getTokensByUid(uid: string): Promise<string[]> {
  if (!uid) {
    return [];
  }

  const snap = await db.collection('PushSubscriptions')
    .where('uid', '==', uid)
    .where('enabled', '==', true)
    .get();

  return snap.docs
    .map((doc) => asString((doc.data() as PushSubscriptionDoc).token).trim())
    .filter(Boolean);
}

async function getTokensByPerfil(perfil: PushPerfil): Promise<string[]> {
  const snap = await db.collection('PushSubscriptions')
    .where('perfil', '==', perfil)
    .where('enabled', '==', true)
    .get();

  return snap.docs
    .map((doc) => asString((doc.data() as PushSubscriptionDoc).token).trim())
    .filter(Boolean);
}

async function sendPush(tokens: string[], title: string, body: string, data: Record<string, string> = {}) {
  if (!tokens.length) {
    return;
  }

  const uniqueTokens = Array.from(new Set(tokens));
  const chunkSize = 500;
  const chunks: string[][] = [];

  for (let i = 0; i < uniqueTokens.length; i += chunkSize) {
    chunks.push(uniqueTokens.slice(i, i + chunkSize));
  }

  for (const chunk of chunks) {
    const response = await getMessaging().sendEachForMulticast({
      tokens: chunk,
      notification: { title, body },
      data,
      android: { priority: 'high' },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
    });

    const tokensToDisable: string[] = [];
    response.responses.forEach((item, index) => {
      if (!item.success && item.error) {
        const code = item.error.code || '';
        if (
          code === 'messaging/invalid-registration-token' ||
          code === 'messaging/registration-token-not-registered'
        ) {
          tokensToDisable.push(chunk[index]);
        }
      }
    });

    if (tokensToDisable.length > 0) {
      for (let i = 0; i < tokensToDisable.length; i += 10) {
        const batch = tokensToDisable.slice(i, i + 10);
        const invalidSnap = await db.collection('PushSubscriptions')
          .where('token', 'in', batch)
          .get();

        const updates = invalidSnap.docs.map((doc) => doc.ref.set({
          enabled: false,
          updatedAt: serverNow(),
        }, { merge: true }));
        await Promise.all(updates);
      }
    }
  }
}

function userPedidoUrl(pedidoId: string, segmento = 'pedidos'): string {
  const id = encodeURIComponent(pedidoId || '');
  const seg = encodeURIComponent(segmento);
  return `/fletes/precios?pedidoId=${id}&segmento=${seg}`;
}

function fleteroPedidoUrl(pedidoId: string): string {
  const id = encodeURIComponent(pedidoId || '');
  return `/fletes/card?pedidoId=${id}`;
}

export const pushPedidoNuevoParaFleteros = onDocumentCreated('PedirFlete/{usuarioId}/Pedidos/{pedidoId}', async (event) => {
  const data = event.data?.data() as Record<string, unknown> | undefined;
  if (!data) {
    return;
  }

  const usuarioNombre = `${asString(data.nombre)} ${asString(data.apellido)}`.trim() || 'Un usuario';
  const desde = asString(data.uDesde);
  const hasta = asString(data.uHasta);
  const tokens = await getTokensByPerfil('Fletero');

  await sendPush(
    tokens,
    'Nuevo pedido disponible',
    `${usuarioNombre} necesita un flete${desde && hasta ? `: ${desde} -> ${hasta}` : '.'}`,
    {
      type: 'pedido_nuevo',
      usuarioId: event.params.usuarioId,
      pedidoId: event.params.pedidoId,
      url: fleteroPedidoUrl(asString(event.params.pedidoId)),
    }
  );
});

export const pushRespuestaNuevaParaUsuario = onDocumentCreated(
  'PedirFlete/{usuarioId}/Pedidos/{pedidoId}/Respuesta/{fleteroId}',
  async (event) => {
    const usuarioId = asString(event.params.usuarioId);
    const tokens = await getTokensByUid(usuarioId);
    const data = event.data?.data() as Record<string, unknown> | undefined;
    const nombreFletero = `${asString(data?.nombre)} ${asString(data?.apellido)}`.trim() || 'Un fletero';

    await sendPush(
      tokens,
      'Nueva respuesta para tu pedido',
      `${nombreFletero} envió una propuesta.`,
      {
        type: 'respuesta_nueva',
        usuarioId,
        pedidoId: asString(event.params.pedidoId),
        fleteroId: asString(event.params.fleteroId),
        url: userPedidoUrl(asString(event.params.pedidoId), 'pedidos'),
      }
    );
  }
);

export const pushPedidoConfirmadoParaFletero = onDocumentCreated('Fleteros/{fleteroId}/FletesProceso/{fleteId}', async (event) => {
  const fleteroId = asString(event.params.fleteroId);
  const tokens = await getTokensByUid(fleteroId);
  const data = event.data?.data() as Record<string, unknown> | undefined;
  const desde = asString(data?.uDesde);
  const hasta = asString(data?.uHasta);
  const pedidoId = asString(data?.pedidoId || event.params.fleteId);

  await sendPush(
    tokens,
    'Pedido confirmado',
    `Tienes un viaje confirmado${desde && hasta ? `: ${desde} -> ${hasta}` : '.'}`,
    {
      type: 'pedido_confirmado',
      fleteroId,
      pedidoId,
      url: fleteroPedidoUrl(pedidoId),
    }
  );
});

function buildEstadoMessage(estado: string): string {
  if (estado === 'En Viaje') return 'El viaje está en curso.';
  if (estado === 'Finalizado') return 'El viaje fue finalizado.';
  if (estado === 'Cancelado') return 'El viaje fue cancelado.';
  if (estado === 'Confirmado') return 'El viaje fue confirmado.';
  return `El viaje cambió a estado ${estado}.`;
}

export const pushCambioEstadoViaje = onDocumentUpdated('Fleteros/{fleteroId}/FletesProceso/{fleteId}', async (event) => {
  const before = event.data?.before.data() as Record<string, unknown> | undefined;
  const after = event.data?.after.data() as Record<string, unknown> | undefined;

  if (!after) {
    return;
  }

  const estadoAnterior = asString(before?.estado);
  const estadoNuevo = asString(after.estado);

  if (!estadoNuevo || estadoNuevo === estadoAnterior) {
    return;
  }

  const usuarioId = asString(after.usuarioId);
  const fleteroId = asString(after.fleteroId || event.params.fleteroId);
  const pedidoId = asString(after.pedidoId || event.params.fleteId);
  const message = buildEstadoMessage(estadoNuevo);

  const [tokensUsuario, tokensFletero] = await Promise.all([
    getTokensByUid(usuarioId),
    getTokensByUid(fleteroId),
  ]);

  await Promise.all([
    sendPush(tokensUsuario, 'Actualización de tu pedido', message, {
      type: 'estado_actualizado',
      pedidoId,
      estado: estadoNuevo,
      actor: 'usuario',
      url: userPedidoUrl(pedidoId, estadoNuevo === 'Finalizado' ? 'finalizados' : 'enProceso'),
    }),
    sendPush(tokensFletero, 'Actualización de viaje', message, {
      type: 'estado_actualizado',
      pedidoId,
      estado: estadoNuevo,
      actor: 'fletero',
      url: fleteroPedidoUrl(pedidoId),
    }),
  ]);
});
