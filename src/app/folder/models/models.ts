import { Timestamp } from "firebase/firestore";

// Definición de tipos para mayor claridad
export type PerfilApp = 'Usuario' | 'Fletero';
export type RolPanel = 'Admin' | 'Verificador' | 'Soporte';
export type PermisoPanel =
  | 'panel:acceder'
  | 'usuarios:leer'
  | 'usuarios:editar_perfil'
  | 'fleteros:leer'
  | 'fleteros:verificar'
  | 'soporte:leer'
  | 'soporte:responder'
  | 'pedidos:leer'
  | 'metricas:leer'
  | 'configuracion:editar';
export type Perfil = PerfilApp | RolPanel;
export type MetodoRegistro = 'email' | 'google' | 'telefono';
export type EstadoRegistro = 'auth' | 'datos_personales' | 'vehiculo' | 'documentacion' | 'pendiente_revision' | 'completo';
export type EstadoRevisionDocumento = 'pendiente' | 'aprobado' | 'rechazado';
export type TipoVehiculo =   'Camioneta' | 
'Camion' | 
'Grua' | 
'Furgonetas' | 
'Camiones frigoríficos' | 
'Trailer' | 
'Cisterna' |  // Para transporte de líquidos
'Portacontenedores' |  // Camiones que transportan contenedores
'Vehículo de carga pesada' ;  // Para cargas planas como maquinaria ;


const tiposValidos: TipoVehiculo[] = [
  'Camioneta',
  'Camion',
  'Grua',
  'Furgonetas',
  'Camiones frigoríficos',
  'Trailer',
  'Cisterna',
  'Portacontenedores',
  'Vehículo de carga pesada'
];

// Constantes para opciones
export const provincias = [ 'Buenos Aires', 'Catamarca', 'Chaco', 'Chubut', 'Córdoba', 'Corrientes', 'Entre Ríos', 'Formosa', 'Jujuy',
  'La Pampa', 'La Rioja', 'Mendoza', 'Misiones', 'Neuquén', 'Río Negro', 'Salta', 'San Juan', 'Santa Cruz', 'Santa Fe',
   'Santiago del Estero', 'Tierra del Fuego', 'Tucumán'];
 
 export const hora = ['5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23'];
 export const minutos = ['00', '15', '30', '45'];
 export const tipoVehiculo = [  'Camioneta',
  'Camion',
  'Grua',
  'Furgonetas',
  'Camiones frigoríficos',
  'Trailer',
  'Cisterna',
  'Portacontenedores',
  'Vehículo de carga pesada'];
 export const ayudantes = ['Sin ayudantes', '+1 ayudantes', '+2 ayudantes', '+3 ayudantes'];
 

// Interfaz base para atributos comunes
export interface UserBase {
  uid: string;
  nombre: string;
  apellido: string;
  dni: string;
  edad: number | null;
  domicilio: string;
  telefono: string;
  image: string;
  photoURL?: string;
  email: string;
  password: string;
  perfil: PerfilApp; // Tipo de perfil dentro de la app
  perfilActivo?: PerfilApp;
  perfilesDisponibles?: PerfilApp[];
  codeVeri?: string;
  metodoRegistro?: MetodoRegistro;
  estadoRegistro?: EstadoRegistro;
  fechaRegistro?: Date | Timestamp | any;
  fechaVencimientoVerificacion?: Date | Timestamp | any;
  emailVerificado?: boolean;
  telefonoVerificado?: boolean;
  documentacionCompleta?: boolean;
  telefonoRespaldo?: string;
  ubicacionRegistro?: {
    latitude?: number;
    longitude?: number;
    accuracy?: number;
    capturedAt?: Date | Timestamp | any;
  };
  provincia?: 'Buenos Aires'| 'Catamarca'| 'Chaco'| 'Chubut'| 'Córdoba'| 'Corrientes'| 'Entre Ríos'| 'Formosa'| 'Jujuy'|
  'La Pampa'| 'La Rioja'|  'Mendoza'| 'Misiones'| 'Neuquén'| 'Río Negro'| 'Salta'| 'San Juan'| 'Santa Cruz'| 'Santa Fe'|
   'Santiago del Estero'| 'Tierra del Fuego'| 'Tucumán'
}

// Interfaz específica para "Usuario"
export interface UserU extends UserBase {
  perfil: 'Usuario'; // Limita el perfil a 'Usuario'
  scoreConfiabilidadUsuario?: number;
  nivelConfiabilidadUsuario?: NivelConfiabilidad;
}

// Interfaz específica para "Fletero"
export interface UserF extends UserBase {
  perfil: 'Fletero'; // Limita el perfil a 'Fletero'
  datosVehiculos?: datosVehiculo;
  vehiculoPrincipalId?: string | null;
  vehiculoPrincipalResumen?: Partial<Pick<datosVehiculo, 'tipoVehiculo' | 'marca' | 'modelo' | 'ano' | 'patente'>> | null;
  verificado: boolean;
  habilitado: boolean;
  recomendacion: number;
  usuariosRecomendados?: string[];
  scoreConfiabilidad?: number;
  nivelConfiabilidad?: NivelConfiabilidad;
  estadoSancion?: EstadoSancionAutomatico;
  bloqueadoPorSancion?: boolean;
  bloqueadoPorVencimiento?: boolean;
  bloqueoManualAdmin?: boolean;
  motivoBloqueoManual?: string;
  apelacionPendiente?: boolean;
  apelacionDetalle?: string;
  antecedentesPenales?: {
    url?: string;
    aprobado?: boolean;
    observacion?: string;
    fecha?: Date | Timestamp | any;
    vencimiento?: Date | Timestamp | any;
  };
  verificacionDni?: {
    frontalUrl?: string;
    dorsalUrl?: string;
    estado?: EstadoRevisionDocumento;
    observacion?: string;
    revisadoPorAdmin?: boolean;
    fechaCarga?: Date | Timestamp | any;
    fechaRevision?: Date | Timestamp | any;
    revisadoPor?: string;
  };
}

// Interfaz específica para "Admin"
export interface UserA extends UserBase {
  perfil: PerfilApp;
  rol: RolPanel;
  activo: boolean;
  permisos?: PermisoPanel[];
  // Puedes agregar atributos específicos para el administrador si lo necesitas
}

// Interfaz para detalles del vehículo
export interface PanelAccess {
  uid: string;
  rol: RolPanel;
  activo: boolean;
  permisos: PermisoPanel[];
}

export interface datosVehiculo {
  uid: string;
  tipoVehiculo: TipoVehiculo;
  marca: string;
  ano: string;
  modelo: string;
  patente: string;
  imagePatente: string; 
  imageDni: string; 
  imageCarnet: string; 
  imageDniDorzal: string;
  imageCarnetDorzal: string;
  antecedentesPenales?: string;
}

export interface VehiculoFletero extends Partial<datosVehiculo> {
  id?: string;
  principal?: boolean;
  creadoEn?: Date;
}

// Interfaz para detalles del flete
export interface ParadaRuta {
  id: string;
  orden: number;
  direccion: string;
  coordinates: { latitude: number; longitude: number };
}

export interface EventoParadaRuta {
  id: string;
  paradaId: string;
  orden: number;
  tipo: 'salida';
  mensaje: string;
  fecha: Date;
}

export interface DatosFlete {
  id: string;
  nombre: string;
  apellido: string;
  fecha: string;
  hora: number;
  minutos: number;
  startCoordinates?: { latitude: number; longitude: number };
  endCoordinatesP?: { latitude: number; longitude: number };
    street?: string; // 🔹 calle con numeración (opcional)
  uDesde: string;
  uHasta: string;
  paradas?: ParadaRuta[];
  km?: number;
  routeDistanceKm?: number;
  routeDurationMinutes?: number;
  cargamento: string;
  accesoCarga?: 'Planta baja' | '2do piso o más';
  tipoVehiculo: TipoVehiculo;
  ayudantes: 'Sin ayudantes' | '+1 ayudantes' | '+2 ayudantes' | '+3 ayudantes';
  uid: string;
  tiempoTranscurrido?: string;
  precio: number;
  visible?: { [fleteroId: string]: boolean };
  image?: string;
  timestamp?: Date;
  tipoServicio: 'Carga' | 'Descarga' | 'Carga y descarga' | 'Ninguno';
  precioEnviado?: boolean;
  respuestas?: { [fleteroId: string]: any };
  
}

// Interfaz para la respuesta de un flete
export interface respuesta {
  id: string;
  docId?: string;
  pedidoId?: string;
  usuarioId?: string;
  idFletero: string;
  nombre: string;
  apellido: string;
  precio: number; 
  telefono: string;
  mensaje: string;
  precioEnviado: boolean; 
  recomendado?: boolean; 
  image?: string;
}

// Estados del flete en proceso
export type EstadoFleteProceso = 'Confirmado' | 'En Viaje' | 'Finalizado' | 'Cancelado';

export type EtapaCancelacion = 'antes_de_iniciar' | 'en_viaje';

export interface CancelacionViaje {
  motivo: string;
  canceladoPor: 'Fletero' | 'Usuario' | 'Sistema';
  fecha: Date;
  etapa: EtapaCancelacion;
  observacion?: string;
  antifraude?: AntifraudeCancelacion;
}

export interface AntifraudeCancelacion {
  habilitado: boolean;
  evaluable: boolean;
  sospechosa: boolean;
  tipo: 'cancelacion_cerca_destino' | null;
  distanciaDestinoMetros: number | null;
  umbralMetros: number;
  pagoSeniaHabilitado: boolean;
  motivo: string;
}

export type NivelConfiabilidad = 'Alta' | 'Media' | 'Baja' | 'Critica';

export type EstadoSancionAutomatico = 'normal' | 'advertencia' | 'suspension_automatica' | 'bloqueado_revision';

export interface MetricasFletero {
  id?: string;
  updatedAt?: Date;
  viajesTomadosTotal?: number;
  viajesFinalizados?: number;
  cancelacionesTotal?: number;
  cancelacionesAntesDeIniciar?: number;
  cancelacionesEnViaje?: number;
  cancelacionesCercaDestino?: number;
  cancelacionesFleteroCercaDestino?: number;
  posiblesArreglosPorFuera?: number;
  sancionableScore?: number;
  scoreConfiabilidad?: number;
  nivelConfiabilidad?: NivelConfiabilidad;
  estadoSancion?: EstadoSancionAutomatico;
  bloqueadoPorSancion?: boolean;
  motivoSancionAutomatica?: string;
  bloqueoManualAdmin?: boolean;
  motivoBloqueoManual?: string;
  apelacionPendiente?: boolean;
  apelacionDetalle?: string;
  tasaFinalizacion?: number;
}

export interface MetricasUsuario {
  id?: string;
  updatedAt?: Date;
  viajesConfirmadosTotal?: number;
  viajesFinalizados?: number;
  cancelacionesTotal?: number;
  cancelacionesPorFletero?: number;
  cancelacionesPorUsuario?: number;
  cancelacionesAntesDeIniciar?: number;
  cancelacionesEnViaje?: number;
  cancelacionesCercaDestino?: number;
  cancelacionesUsuarioConFleteroEnDestino?: number;
  posiblesArreglosPorFuera?: number;
  scoreConfiabilidadUsuario?: number;
  nivelConfiabilidadUsuario?: NivelConfiabilidad;
  tasaFinalizacion?: number;
  penalizacionPendienteAdmin?: boolean;
  penalizacionesPendientesCount?: number;
  ultimoMotivoPenalizacion?: string;
  ultimaPenalizacionEtapa?: EtapaCancelacion;
  ultimaPenalizacionFecha?: Date;
  ultimoEventoPenalizacionId?: string;
}

export interface NotificacionPenalizacionUsuarioAdmin {
  id?: string;
  usuarioId: string;
  pedidoId: string;
  fleteProcesoId: string;
  eventoCancelacionId: string;
  fecha: Date;
  etapa: EtapaCancelacion;
  motivo: string;
  canceladoPor: 'Usuario';
  usuarioNombre?: string;
  provinciaUsuario?: string;
  zonaTexto?: string;
  estado: 'pendiente' | 'despenalizado';
  detalleAdmin?: string;
  fechaResolucion?: Date;
}

export interface HistorialPenalizacionUsuarioAdmin {
  id?: string;
  usuarioId: string;
  alertaId?: string;
  pedidoId: string;
  fleteProcesoId: string;
  fecha: Date;
  actor: 'Sistema' | 'Admin';
  actorId?: string;
  actorEmail?: string;
  accion: 'penalizacion_usuario' | 'despenalizacion_usuario';
  etapa: EtapaCancelacion;
  motivo: string;
  detalle?: string;
  origenPantalla?: 'sistema' | 'usuarios' | 'reportes';
  scoreAnterior?: number;
  scoreNuevo?: number;
}

export interface HistorialSancionFletero {
  id?: string;
  fleteroId: string;
  fecha: Date;
  actor: 'Sistema' | 'Admin';
  accion: 'sancion_automatica' | 'levantamiento_manual' | 'bloqueo_manual' | 'desbloqueo_manual' | 'apelacion_pendiente' | 'apelacion_aprobada' | 'apelacion_rechazada';
  estadoAnterior?: string;
  estadoNuevo?: string;
  bloqueadoManualAnterior?: boolean;
  bloqueadoManualNuevo?: boolean;
  motivo?: string;
  detalle?: string;
}

export interface EventoCancelacionAdmin {
  id: string;
  pedidoId: string;
  fleteProcesoId: string;
  usuarioId: string;
  fleteroId: string;
  fechaCancelacion: Date;
  etapa: EtapaCancelacion;
  motivo: string;
  canceladoPor: 'Fletero' | 'Usuario' | 'Sistema';
  observacion?: string;
  antifraude?: AntifraudeCancelacion;
  route?: {
    desde?: string;
    hasta?: string;
  };
  provinciaFletero?: string;
  provinciaUsuario?: string;
  zonaTexto?: string;
}

// Interfaz para fletes en proceso (subcollección en Fleteros/{uid}/FletesProceso)
export interface FleteEnProceso {
  id: string;
  precioEnviado?: boolean; // Nueva propiedad opcional
  respuestas?: { [fleteroId: string]: any }; // Nueva propiedad opcional para respuestas
  pedidoId: string; // ID del pedido original
  usuarioId: string; // ID del usuario que creó el pedido
  fleteroId: string; // ID del fletero
  
  // Datos del flete
  nombre: string;
  apellido: string;
  fecha: string;
  hora: number;
  minutos: number;
  uDesde: string;
  uHasta: string;
  precio: number;
  cargamento: string;
  tipoVehiculo: TipoVehiculo;
  tipoServicio: 'Carga' | 'Descarga' | 'Carga y descarga' | 'Ninguno';
  ayudantes: 'Sin ayudantes' | '+1 ayudantes' | '+2 ayudantes' | '+3 ayudantes';
  
  // Datos del fletero que aceptó
  precioAceptado: number;
  telefonoFletero: string;
  imagenFletero?: string;
  
  // Estado y timestamps
  estado: EstadoFleteProceso;
  fechaConfirmacion: Date;
  fechaInicioViaje?: Date;
  fechaFinalizacion?: Date;
  fechaCancelacion?: Date;
  cancelacion?: CancelacionViaje;
  
  // Ubicaciones
  startCoordinates?: { latitude: number; longitude: number };
  endCoordinatesP?: { latitude: number; longitude: number };
  
  // Ubicación actual del fletero (se actualiza en tiempo real durante el viaje)
  paradas?: ParadaRuta[];
  routeDistanceKm?: number;
  routeDurationMinutes?: number;
  ubicacionActual?: { latitude: number; longitude: number };
  ubicacionActualizadaAt?: Date;
  paradasEventos?: EventoParadaRuta[];
  paradasVisitadas?: { [paradaId: string]: boolean };
}

// Interfaz para opiniones
export interface Opiniones {
  id: string;
  nombre: string;
  apellido: string;
  mensaje: string;
  perfil: 'Usuario' | 'Fletero';
}


export interface Chat {
  id: string;
  path?: string;
  fleteId: string;
  userId: string;
  fleteroId: string;
  pedidoId?: string;
  fleteroNombre?: string;
  estado: 'activo' | 'cerrado';
  createdAt: any;
  lastMessage?: string;
  lastMessageTime?: any;
  userNombre?: string; // 👈 agregar el nombre del usuario
  pedidoResumen?: {
    desde?: string;
    hasta?: string;
    fecha?: any;
    hora?: number;
    minutos?: number;
    cargamento?: string;
  };

  typing?: {
    usuario: boolean;
    fletero: boolean;
  };
}


export interface Mensaje {
  id?: string;               
  chatId: string;            
  senderId: string;          
  senderRole: 'user' | 'fletero'; // ✅ AGREGAR
  text: string;              
  leido?: boolean;
  seen?: boolean;
  timestamp?: Date | Timestamp | null;
}
