import { Component, OnDestroy, OnInit, ChangeDetectionStrategy, ChangeDetectorRef, HostListener } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingController, ToastController } from '@ionic/angular';
import { DatosFlete, datosVehiculo, respuesta, UserF, UserU, FleteEnProceso, ParadaRuta } from 'src/app/folder/models/models';
import { AuthService } from 'src/app/folder/services/auth.service';
import { FirestoreService } from 'src/app/folder/services/firestore.service';
import { InteractionService } from 'src/app/folder/services/interaction.service';
import { CapturedLocation, LocationService, LocationUnavailableReason } from 'src/app/folder/services/location.service';
import { NuevoService } from 'src/app/folder/services/nuevo.service';
import 'firebase/firestore';
import { Inject } from '@angular/core';
import firebase from 'firebase/compat/app';
import { DOCUMENT } from '@angular/common';
import { ModalController } from '@ionic/angular';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { firstValueFrom, Subscription } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';


@Component({
  selector: 'app-card',
  templateUrl: './card.component.html',
  styleUrls: ['./card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardComponent implements OnInit, OnDestroy {
  readonly maxRadioFiltroKm = 200;
  fleteroEstado: Pick<UserF, 'verificado' | 'habilitado' | 'bloqueadoPorSancion' | 'bloqueadoPorVencimiento'> = {
    verificado: false,
    habilitado: false,
    bloqueadoPorSancion: false,
    bloqueadoPorVencimiento: false,
  };
  enviandoPrecio = false; // Evita clicks múltiples

  @HostListener('window:DOMContentLoaded', ['$event'])
  onDOMContentLoaded(event: Event): void {
    this.checkHiddenOrders();
  }

  @HostListener('document:visibilitychange')
  onVisibilityChange(): void {
    if (this.document.hidden) {
      this.detenerSuscripcionesDeViajes();
      return;
    }

    if (this.miIdDeFletero) {
      this.suscribirDatosDeViajes();
    }
  }
  userIDs: string[] = [];

  hiddenOrders: string[] = [];
  login: boolean = false;
  rol: 'Usuario' | 'Fletero' | 'Admin' = null;
  loading: any;
  fletes: (DatosFlete & { precioEnviado?: boolean })[] = [];
  fletesDisponibles: (DatosFlete & { precioEnviado?: boolean })[] = [];
  fletesEnProceso: FleteEnProceso[] = [];
  fletesFinalizados: FleteEnProceso[] = [];
  respuestasPorPedido: { [pedidoId: string]: respuesta[] } = {};
  ubicacionFletero: CapturedLocation | null = null;
  filtroRadioKm: number | null = this.maxRadioFiltroKm;
  radioPersonalizadoKm: number | null = null;
  obteniendoUbicacion = false;
  ubicacionFiltroError = '';
  ubicacionFleteroReason: LocationUnavailableReason | null = null;
  readonly radiosKm = [10, 25, 50, 100, this.maxRadioFiltroKm];
  datoss: UserU;
  DatosV: datosVehiculo;
  pasosFlete2: DatosFlete = {
    nombre: '',
    apellido: '',
    fecha: null,
    hora: null,
    minutos: null,
    uDesde: '',
    uHasta: '',
    cargamento: '',
    tipoVehiculo: null,
    
    ayudantes: null,
    tipoServicio: 'Ninguno',
    uid: '',
    id: '',
    precio: null,
    startCoordinates: {
      latitude: null,
      longitude: null,
  },
  endCoordinatesP: {
    latitude: null,
    longitude: null,
}
  };
  private miIdDeFletero: string = ''; // Declara la variable para almacenar el ID del fletero actual

  rta: respuesta = {
    id: '',
    idFletero: '',
    nombre: '',
    apellido: '',
    precio: null,
    telefono: null,
    mensaje: '',
    precioEnviado: false, // Agrega esta propiedad
  };
  pasosFlete: DatosFlete[] = [];
  selectedSegment: 'disponibles' | 'enProceso' | 'finalizados' = 'disponibles';
  fletesRespondidos: DatosFlete[] = [];

  // Modal enviar precio
  isPrecioModalOpen = false;
  precioStep: 'input' | 'confirm' = 'input';
  precioInput: number = null;
  mensajeInput = '';
  precioComision = 0;
  precioNeto = 0;
  precioPendingData: { pedidoId: string; precioEnviado: boolean; datos: DatosFlete } = null;
  private reminderTimerId: number | null = null;
  private authSub: Subscription | null = null;
  private pedidosDisponiblesSub: Subscription | null = null;
  private fletesProcesoSub: Subscription | null = null;
  private fleteroEstadoSub: Subscription | null = null;
  private respuestasSubs = new Map<string, Subscription>();
  private respuestaPropiaSubs = new Map<string, Subscription>();
  private pedidosMinimizados = new Set<string>();
  private ubicacionFiltroSolicitada = false;

  constructor(
    @Inject(DOCUMENT) private document: Document,
    private auth: AuthService,
    private router: Router,
    private interaction: InteractionService,
    private db: FirestoreService,
    private database: NuevoService,
    public toastController: ToastController,
    private loadingCtrl: LoadingController,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute,
    private modal: ModalController,
    private firestore: AngularFirestore,
    private locationService: LocationService,
    ) {
      // Suscríbete al estado del usuario para obtener el ID del fletero cuando inicie sesión
      this.auth.stateUser().subscribe((res) => {
        if (res) {
          // Asigna el ID del fletero actual
          this.miIdDeFletero = this.miIdDeFletero || res.uid;
        }
      });
    }
    
  async ngOnInit() {
    this.fletesRespondidos = [];
    this.checkHiddenOrders();
    this.reminderTimerId = window.setInterval(() => {
      this.cdr.markForCheck();
    }, 60000);
    this.authSub = this.auth.stateUser<UserF>().pipe(
      map((user) => user?.uid ?? ''),
      distinctUntilChanged()
    ).subscribe((uid) => {
      if (this.miIdDeFletero !== uid) {
        this.limpiarDatosDeCuentaActual();
      }

      this.miIdDeFletero = uid;

      if (!uid) {
        this.resetColecciones();
        return;
      }

      this.suscribirEstadoFletero(uid);
      this.suscribirDatosDeViajes();
    });
  }

  ngOnDestroy(): void {
    if (this.reminderTimerId !== null) {
      window.clearInterval(this.reminderTimerId);
      this.reminderTimerId = null;
    }

    this.authSub?.unsubscribe();
    this.detenerSuscripcionesDeViajes();
    this.fleteroEstadoSub?.unsubscribe();
    this.detenerSuscripcionesRespuestas();
  }

  cambiarSegmento(segment: 'disponibles' | 'enProceso' | 'finalizados') {
    this.selectedSegment = segment;
    console.log('Segmento cambiado:', segment);
    if (segment === 'disponibles') {
      console.log('Fletes disponibles:', this.fletes);
    } else if (segment === 'enProceso') {
      console.log('Fletes en proceso:', this.fletesEnProceso);
    } else if (segment === 'finalizados') {
      console.log('Fletes finalizados:', this.fletesFinalizados);
    }
    this.cdr.detectChanges();
  }

  getRecordatorioInicio(flete: FleteEnProceso): string {
    const fechaInicio = this.construirFechaViaje(flete);

    if (!fechaInicio) {
      return 'Revisá la hora pactada con el cliente por chat';
    }

    const diferenciaMs = fechaInicio.getTime() - Date.now();

    if (flete.estado === 'En Viaje') {
      return 'Viaje en curso. Tu ubicación se comparte en tiempo real.';
    }

    if (diferenciaMs <= 0) {
      return 'La hora de salida ya llegó. Abrí el mapa y deslizá para iniciar.';
    }

    const totalMinutos = Math.ceil(diferenciaMs / 60000);
    const horas = Math.floor(totalMinutos / 60);
    const minutos = totalMinutos % 60;

    if (totalMinutos <= 15) {
      return `Faltan ${totalMinutos} min para el inicio pactado.`;
    }

    if (horas > 0) {
      return `Faltan ${horas}h ${minutos}m para el inicio del viaje.`;
    }

    return `Faltan ${minutos} min para el inicio del viaje.`;
  }

  getRecordatorioClase(flete: FleteEnProceso): string {
    const fechaInicio = this.construirFechaViaje(flete);

    if (flete.estado === 'En Viaje') {
      return 'recordatorio recordatorio--info';
    }

    if (!fechaInicio) {
      return 'recordatorio recordatorio--neutral';
    }

    const diferenciaMs = fechaInicio.getTime() - Date.now();

    if (diferenciaMs <= 0) {
      return 'recordatorio recordatorio--danger';
    }

    if (diferenciaMs <= 15 * 60 * 1000) {
      return 'recordatorio recordatorio--warning';
    }

    return 'recordatorio recordatorio--success';
  }

  get pedidosDisponiblesFiltrados(): (DatosFlete & { precioEnviado?: boolean })[] {
    const radioKm = this.getRadioFiltroAplicable();

    if (!this.ubicacionFletero) {
      return [];
    }

    return this.fletes.filter((pedido) => {
      const distanciaKm = this.getDistanciaPedidoKm(pedido);
      return distanciaKm !== null && distanciaKm <= radioKm;
    });
  }

  get radioFiltroActivoLabel(): string {
    return `${this.getRadioFiltroAplicable()} km`;
  }

  async seleccionarRadioKm(radioKm: number | null): Promise<void> {
    const radioAplicable = this.normalizarRadioFiltro(radioKm);

    const ubicacionDisponible = await this.ensureUbicacionFletero();
    if (!ubicacionDisponible) {
      return;
    }

    this.filtroRadioKm = radioAplicable;
    this.radioPersonalizadoKm = null;
    this.ubicacionFiltroError = '';
    this.cdr.markForCheck();
  }

  async aplicarRadioPersonalizado(): Promise<void> {
    const radioKm = Number(this.radioPersonalizadoKm);

    if (!Number.isFinite(radioKm) || radioKm <= 0) {
      this.interaction.presentToast('Ingresá un radio válido en km');
      return;
    }

    if (radioKm > this.maxRadioFiltroKm) {
      this.interaction.presentToast(`El radio máximo permitido es ${this.maxRadioFiltroKm} km`);
      this.radioPersonalizadoKm = this.maxRadioFiltroKm;
      this.cdr.markForCheck();
      return;
    }

    await this.seleccionarRadioKm(radioKm);
  }

  getDistanciaPedidoLabel(pedido: DatosFlete): string {
    const distanciaKm = this.getDistanciaPedidoKm(pedido);

    if (distanciaKm === null) {
      return 'Distancia no disponible';
    }

    if (distanciaKm < 1) {
      return `${Math.round(distanciaKm * 1000)} m de tu ubicación`;
    }

    return `${distanciaKm.toFixed(1)} km de tu ubicación`;
  }

  togglePedidoMinimizado(pedidoId: string): void {
    if (this.pedidosMinimizados.has(pedidoId)) {
      this.pedidosMinimizados.delete(pedidoId);
    } else {
      this.pedidosMinimizados.add(pedidoId);
    }

    this.cdr.markForCheck();
  }

  isPedidoMinimizado(pedidoId: string): boolean {
    return this.pedidosMinimizados.has(pedidoId);
  }

  getTiempoDesdePedido(pedido: DatosFlete): string {
    const fechaPedido = this.getFechaTimestamp(pedido.timestamp);
    if (!fechaPedido) {
      return 'Recibido recientemente';
    }

    const diferenciaMs = Date.now() - fechaPedido.getTime();
    if (diferenciaMs < 60 * 1000) {
      return 'Recibido hace instantes';
    }

    const minutos = Math.floor(diferenciaMs / 60000);
    if (minutos < 60) {
      return `Recibido hace ${minutos} min`;
    }

    const horas = Math.floor(minutos / 60);
    if (horas < 24) {
      return `Recibido hace ${horas} h`;
    }

    const dias = Math.floor(horas / 24);
    return `Recibido hace ${dias} d`;
  }

  getResumenOfertasPedido(pedido: DatosFlete): string {
    const miRespuesta = this.getMiRespuesta(pedido);
    const colegas = this.getRespuestasColegas(pedido);

    if (miRespuesta) {
      return `Tu oferta $${this.getPrecioRespuesta(miRespuesta)} - ${colegas.length} colegas`;
    }

    if (colegas.length === 0) {
      return 'Sin ofertas de colegas';
    }

    const mejorPrecio = this.getPrecioMinimoColegas(pedido);
    return mejorPrecio ? `${colegas.length} colegas - mejor $${mejorPrecio}` : `${colegas.length} colegas`;
  }

  getRecordatorioVencimientoPedido(pedido: DatosFlete): string {
    return this.db.obtenerTextoTiempoRestantePedido(pedido);
  }

  getRecordatorioVencimientoClase(pedido: DatosFlete): string {
    const fechaExpiracion = this.db.obtenerFechaExpiracionPedido(pedido);
    if (!fechaExpiracion) {
      return 'recordatorio recordatorio--neutral';
    }

    const diferenciaMs = fechaExpiracion.getTime() - Date.now();
    if (diferenciaMs <= 0) {
      return 'recordatorio recordatorio--danger';
    }

    if (diferenciaMs <= 30 * 60 * 1000) {
      return 'recordatorio recordatorio--warning';
    }

    return 'recordatorio recordatorio--success';
  }
    
    checkHiddenOrders() {
      const hiddenOrdersString = localStorage.getItem('hiddenOrders');
      if (hiddenOrdersString) {
        this.hiddenOrders = JSON.parse(hiddenOrdersString);
      } else {
        // Si no hay datos en localStorage, usa las cookies
        const cookies = document.cookie.split(';');
        this.hiddenOrders = cookies
          .filter((cookie) => cookie.trim().startsWith('PedirFlete'))
          .map((cookie) => {
            const [key] = cookie.trim().split('=');
            return key.substring(6); // Obtiene el ID del pedido de la cookie
          });
    
        // Guarda los pedidos ocultos en localStorage para la próxima vez
        localStorage.setItem('hiddenOrders', JSON.stringify(this.hiddenOrders));
      }
    }
    
    atras(){
      this.router.navigate(['/home'])

    }



precioInputChanged(pedidoId: string, precioEnviado: boolean, DatosFletes: DatosFlete) {
  if (!this.puedeOperarAccionesCriticas()) {
    void this.mostrarAvisoCuentaPendiente('enviar un precio');
    return;
  }

  if (precioEnviado || this.getMiRespuesta(DatosFletes) || this.enviandoPrecio) return;
  this.precioPendingData = { pedidoId, precioEnviado, datos: DatosFletes };
  this.precioInput = null;
  this.mensajeInput = '';
  this.precioStep = 'input';
  this.isPrecioModalOpen = true;
  this.cdr.detectChanges();
}

calcularComision() {
  if (!this.precioInput || this.precioInput <= 0) return;
  this.precioComision = this.precioInput * 0.15;
  this.precioNeto = this.precioInput - this.precioComision;
  this.precioStep = 'confirm';
  this.cdr.detectChanges();
}

cancelarPrecioModal() {
  this.isPrecioModalOpen = false;
  this.precioPendingData = null;
  this.precioStep = 'input';
  this.cdr.detectChanges();
}

async confirmarEnvioPrecio() {
  if (!this.puedeOperarAccionesCriticas()) {
    await this.mostrarAvisoCuentaPendiente('enviar un precio');
    return;
  }

  if (!this.precioPendingData || this.enviandoPrecio) return;
  this.enviandoPrecio = true;

  try {
    const { pedidoId, datos } = this.precioPendingData;
    const precioNumerico = this.precioInput;

    document.cookie = `pedido${pedidoId}=${this.miIdDeFletero}`;

    const index = this.fletes.findIndex(flete => flete.id === pedidoId);
    if (index !== -1) {
      this.fletes[index].precio = precioNumerico;
      this.fletes[index].precioEnviado = true;
    }

    const res2 = await firstValueFrom(this.db.getDoc<UserF>('Fleteros', this.miIdDeFletero));

    const enlace = `PedirFlete/${datos.uid}/Pedidos/${datos.id}/Respuesta`;
    const rta22 = {
      ...this.rta,
      nombre: res2.nombre,
      apellido: res2.apellido,
      telefono: res2.telefono,
      id: datos.uid,
      usuarioId: datos.uid,
      pedidoId: datos.id,
      idFletero: this.miIdDeFletero,
      precio: precioNumerico,
      mensaje: this.mensajeInput || '',
      precioEnviado: true
    };

    await this.db.createDoc<respuesta>(rta22, enlace, this.miIdDeFletero);
    this.respuestasPorPedido[pedidoId] = [
      ...this.getRespuestasPedido(datos).filter((item) => this.getRespuestaFleteroId(item) !== this.miIdDeFletero),
      rta22,
    ];

    this.isPrecioModalOpen = false;
    this.precioPendingData = null;
    this.interaction.presentToast('Precio enviado con éxito');
  } catch (error) {
    console.error('Error al enviar precio:', error);
    this.interaction.presentToast('Error al enviar el precio');
  } finally {
    this.enviandoPrecio = false;
    this.cdr.detectChanges();
  }
}

  
  // checkHiddenOrders() {
  //   // Verifica si hay IDs de pedidos ocultos en localStorage
  //   const hiddenOrdersString = localStorage.getItem('hiddenOrders');
  //   if (hiddenOrdersString) {
  //     const hiddenOrders = JSON.parse(hiddenOrdersString);

  //     // Recorre this.fletes y oculta los pedidos correspondientes
  //     this.fletes.forEach((datos) => {
  //       if (hiddenOrders.includes(datos.id)) {
  //         datos.oculto = true;
  //       } else {
  //         datos.oculto = false;
  //       }
  //     });

  //     // También puedes ocultar los elementos HTML según el estado de datos.oculto
  //     this.cdr.detectChanges();
  //   } else {
  //     // Si no hay IDs de pedidos ocultos en localStorage, utiliza la lógica anterior basada en cookies
  //     const cookies = document.cookie.split(';');
  //     this.hiddenOrders = cookies
  //       .filter((cookie) => cookie.trim().startsWith('pedido'))
  //       .map((cookie) => {
  //         console.log('Cookies:', document.cookie);
  //         const [key, value] = cookie.trim().split('=');
  //         return key.substring(6); // Obtiene el ID del pedido de la cookie
  //       });

  //     // Recorre this.fletes y oculta los pedidos correspondientes
  //     this.fletes.forEach((datos) => {
  //       if (this.hiddenOrders.includes(datos.id)) {
  //         console.log('Pedidos ocultos:', this.hiddenOrders);
  //         datos.oculto = true;
  //       } else {
  //         datos.oculto = false;
  //       }
  //     });

  //     // Actualiza el localStorage con los pedidos ocultos
  //     localStorage.setItem('hiddenOrders', JSON.stringify(this.hiddenOrders));

  //     // También puedes ocultar los elementos HTML según el estado de datos.oculto
  //     this.cdr.detectChanges();
  //   }
  // }

  
  
  
  
  
 async mostrarRuta(DatosFletes: DatosFlete) {
    if (!this.puedeOperarAccionesCriticas()) {
      await this.mostrarAvisoCuentaPendiente('ver la ruta');
      return;
    }

    if (DatosFletes.startCoordinates && DatosFletes.endCoordinatesP) {
      await this.ensureUbicacionFletero();
      const startCoordinates = this.ubicacionFletero
        ? {
            latitude: this.ubicacionFletero.latitude,
            longitude: this.ubicacionFletero.longitude,
          }
        : DatosFletes.startCoordinates;
      const endCoordinates = DatosFletes.endCoordinatesP;
      const pickupStop: ParadaRuta = {
        id: `${DatosFletes.id || 'pedido'}-retiro`,
        orden: 1,
        direccion: `Retiro: ${DatosFletes.uDesde || 'Punto de inicio del pedido'}`,
        coordinates: DatosFletes.startCoordinates,
      };
      const paradas = [
        pickupStop,
        ...(DatosFletes.paradas || []).map((parada, index) => ({
          ...parada,
          orden: index + 2,
        })),
      ];
      const { VerRutaComponent } = await import('src/app/folder/mapbox/ver-ruta/ver-ruta.component');
  
      const modal = await this.modal.create({
        component: VerRutaComponent,
        componentProps: {
          datos: {
            startCoordinates,
            endCoordinates,
            paradas,
            routeDistanceKm: DatosFletes.routeDistanceKm,
            routeDurationMinutes: DatosFletes.routeDurationMinutes,
          },
          cardComponentRef: this,
          modo: 'ver',
        },
      });
    
      await modal.present();
      console.log('Coordenadas de inicio:', startCoordinates);
      console.log('Coordenadas de fin:', endCoordinates);
    } else {
      console.error('Las coordenadas de inicio o fin no están disponibles en los datos del pedido.');
    }
  }

  async abrirChatViaje(flete: FleteEnProceso) {
    try {
      const chat = await this.db.getOrCreateChat(
        flete.usuarioId,
        flete.fleteroId || this.miIdDeFletero,
        flete.pedidoId,
        {
          userNombre: `${flete.nombre || ''} ${flete.apellido || ''}`.trim(),
          pedidoResumen: {
            desde: flete.uDesde,
            hasta: flete.uHasta,
            fecha: flete.fecha,
            hora: flete.hora,
            minutos: flete.minutos,
            cargamento: flete.cargamento,
          }
        }
      );

      this.router.navigate(['/chat', chat.id], {
        queryParams: {
          fleteroId: flete.fleteroId || this.miIdDeFletero,
          fleteId: flete.pedidoId,
          userId: flete.usuarioId,
        },
        state: {
          pedido: {
            id: flete.pedidoId,
            uid: flete.usuarioId,
            uDesde: flete.uDesde,
            uHasta: flete.uHasta,
            fecha: flete.fecha,
            hora: flete.hora,
            minutos: flete.minutos,
          },
          fletero: {
            idFletero: flete.fleteroId || this.miIdDeFletero,
          }
        }
      });
    } catch (error) {
      console.error('Error al abrir chat del viaje:', error);
      this.interaction.presentToast('No se pudo abrir el chat del viaje');
    }
  }

  async abrirViajeTracking(flete: FleteEnProceso) {
    if (!flete.startCoordinates || !flete.endCoordinatesP) {
      this.interaction.presentToast('Este flete no tiene coordenadas de ruta');
      return;
    }

    const { VerRutaComponent } = await import('src/app/folder/mapbox/ver-ruta/ver-ruta.component');
    const modal = await this.modal.create({
      component: VerRutaComponent,
      componentProps: {
        datos: {
          startCoordinates: flete.startCoordinates,
          endCoordinates: flete.endCoordinatesP,
          paradas: flete.paradas || [],
          routeDistanceKm: flete.routeDistanceKm,
          routeDurationMinutes: flete.routeDurationMinutes,
        },
        modo: 'tracking',
        fleteEnProceso: flete,
      },
    });

    modal.onDidDismiss().then((result) => {
      if (result.data?.viajeCompletado) {
        this.interaction.presentToast('¡Viaje completado exitosamente!');
        this.fletesEnProceso = this.fletesEnProceso.filter((item) => item.id !== flete.id);
        this.fletesFinalizados = [
          { ...flete, estado: 'Finalizado', fechaFinalizacion: new Date() },
          ...this.fletesFinalizados.filter((item) => item.id !== flete.id),
        ];
        this.cdr.detectChanges();
        return;
      }

      if (result.data?.viajeCanceladoAntesDeIniciar || result.data?.viajeCancelado || result.data?.viajeCanceladoUsuario) {
        this.interaction.presentToast('Viaje cancelado');
        this.fletesEnProceso = this.fletesEnProceso.filter((item) => item.id !== flete.id);
        this.cdr.detectChanges();
      }
    });

    await modal.present();
  }

  private construirFechaViaje(flete: FleteEnProceso): Date | null {
    if (!flete?.fecha) return null;

    const baseFecha = new Date(flete.fecha as any);
    if (Number.isNaN(baseFecha.getTime())) {
      return null;
    }

    baseFecha.setHours(Number(flete.hora || 0), Number(flete.minutos || 0), 0, 0);
    return baseFecha;
  }

  async presentToast(mensaje: string, tiempo: number) {
    const toast = await this.toastController.create({
      message: mensaje,
      duration: tiempo,
      position: 'middle',
    });
    await toast.present();
  }

  async presentLoading() {
    this.loading = await this.loadingCtrl.create({
      message: 'Guardando',
    });

    await this.loading.present();
  }

  trackByFleteId(_: number, flete: DatosFlete | FleteEnProceso): string {
    return flete.id;
  }

  trackByRespuesta(_: number, item: respuesta): string {
    return (item?.idFletero || item?.docId || '').trim() || `${item?.nombre || 'fletero'}-${item?.precio || 0}`;
  }

  getPrecioRespuesta(item: Partial<respuesta>): number {
    return Number(item?.precio || 0);
  }

  getRespuestasPedido(pedido: DatosFlete): respuesta[] {
    return (this.respuestasPorPedido[pedido.id] || [])
      .filter((item) => this.esRespuestaConPrecioValido(item));
  }

  getMiRespuesta(pedido: DatosFlete): respuesta | null {
    if (!this.miIdDeFletero) {
      return null;
    }

    return this.getRespuestasPedido(pedido)
      .find((item) => this.getRespuestaFleteroId(item) === this.miIdDeFletero) || null;
  }

  getRespuestasColegas(pedido: DatosFlete): respuesta[] {
    return this.getRespuestasPedido(pedido)
      .filter((item) => this.getRespuestaFleteroId(item) !== this.miIdDeFletero)
      .sort((a, b) => this.getPrecioRespuesta(a) - this.getPrecioRespuesta(b));
  }

  getPrecioMinimoPedido(pedido: DatosFlete): number | null {
    const precios = this.getRespuestasPedido(pedido)
      .map((item) => Number(item.precio || 0))
      .filter((precio) => Number.isFinite(precio) && precio > 0);

    return precios.length ? Math.min(...precios) : null;
  }

  getPrecioMinimoColegas(pedido: DatosFlete): number | null {
    const precios = this.getRespuestasColegas(pedido)
      .map((item) => Number(item.precio || 0))
      .filter((precio) => Number.isFinite(precio) && precio > 0);

    return precios.length ? Math.min(...precios) : null;
  }

  getPosicionMiOferta(pedido: DatosFlete): string {
    const miRespuesta = this.getMiRespuesta(pedido);
    if (!miRespuesta) {
      return '';
    }

    const ordenadas = this.getRespuestasPedido(pedido)
      .filter((item) => this.getPrecioRespuesta(item) > 0)
      .sort((a, b) => this.getPrecioRespuesta(a) - this.getPrecioRespuesta(b));
    const posicion = ordenadas.findIndex((item) => this.getRespuestaFleteroId(item) === this.miIdDeFletero) + 1;

    return posicion > 0 ? `${posicion}/${ordenadas.length}` : '';
  }

  private resetColecciones(): void {
    this.fletes = [];
    this.fletesDisponibles = [];
    this.fletesEnProceso = [];
    this.fletesFinalizados = [];
    this.respuestasPorPedido = {};
    this.detenerSuscripcionesRespuestas();
    this.ubicacionFletero = null;
    this.ubicacionFiltroSolicitada = false;
    this.filtroRadioKm = this.maxRadioFiltroKm;
    this.radioPersonalizadoKm = null;
    this.ubicacionFiltroError = '';
    this.ubicacionFleteroReason = null;
    this.detenerSuscripcionesDeViajes();
    this.fleteroEstadoSub?.unsubscribe();
    this.fleteroEstadoSub = null;
    this.cdr.markForCheck();
  }

  private limpiarDatosDeCuentaActual(): void {
    this.detenerSuscripcionesDeViajes();
    this.fleteroEstadoSub?.unsubscribe();
    this.fleteroEstadoSub = null;
    this.fletes = [];
    this.fletesDisponibles = [];
    this.fletesEnProceso = [];
    this.fletesFinalizados = [];
    this.respuestasPorPedido = {};
    this.precioPendingData = null;
    this.isPrecioModalOpen = false;
  }

  private suscribirDatosDeViajes(): void {
    this.suscribirPedidosDisponibles();
    this.suscribirFletesProceso();
  }

  private detenerSuscripcionesDeViajes(): void {
    this.pedidosDisponiblesSub?.unsubscribe();
    this.pedidosDisponiblesSub = null;
    this.fletesProcesoSub?.unsubscribe();
    this.fletesProcesoSub = null;
    this.detenerSuscripcionesRespuestas();
  }

  private suscribirPedidosDisponibles(): void {
    this.pedidosDisponiblesSub?.unsubscribe();
    this.pedidosDisponiblesSub = this.db.obtenerPedidosDisponibles().subscribe({
      next: (fletes) => {
        this.fletesDisponibles = (fletes || []).filter((flete) =>
          this.esPedidoDisponibleValido(flete)
          && !this.db.pedidoExpirado(flete)
          && flete.uid !== this.miIdDeFletero
          && !flete.visible?.[this.miIdDeFletero]
          && !this.hiddenOrders.includes(flete.id)
        );
        this.sincronizarSuscripcionesRespuestas(this.fletesDisponibles);
        this.fletes = this.fletesDisponibles;
        if (this.fletesDisponibles.length > 0 && !this.ubicacionFletero && !this.obteniendoUbicacion && !this.ubicacionFiltroSolicitada) {
          this.ubicacionFiltroSolicitada = true;
          this.ensureUbicacionFletero();
        }
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Error cargando pedidos disponibles:', error);
        this.fletesDisponibles = [];
        this.fletes = [];
        this.cdr.markForCheck();
      }
    });
  }

  private suscribirFletesProceso(): void {
    this.fletesProcesoSub?.unsubscribe();
    this.fletesProcesoSub = this.db.obtenerFletesProceso(this.miIdDeFletero).subscribe((fletes) => {
      this.fletesEnProceso = fletes.filter((f) => f.estado === 'Confirmado' || f.estado === 'En Viaje');
      this.fletesFinalizados = fletes.filter((f) => f.estado === 'Finalizado');
      this.cdr.markForCheck();
    });
  }

  private suscribirEstadoFletero(uid: string): void {
    this.fleteroEstadoSub?.unsubscribe();
    this.fleteroEstadoSub = this.db.getDoc<UserF>('Fleteros', uid).subscribe({
      next: (fletero) => {
        this.fleteroEstado = {
          verificado: fletero?.verificado === true,
          habilitado: fletero?.habilitado === true,
          bloqueadoPorSancion: fletero?.bloqueadoPorSancion === true,
          bloqueadoPorVencimiento: fletero?.bloqueadoPorVencimiento === true,
        };
        this.cdr.markForCheck();
      },
      error: () => {
        this.fleteroEstado = {
          verificado: false,
          habilitado: false,
          bloqueadoPorSancion: false,
          bloqueadoPorVencimiento: false,
        };
        this.cdr.markForCheck();
      },
    });
  }

  get cuentaPendienteVerificacion(): boolean {
    return !this.puedeOperarAccionesCriticas();
  }

  get estadoCuentaTexto(): string {
    if (this.fleteroEstado.bloqueadoPorSancion) {
      return 'Tu cuenta tiene una sanción activa. Contactá soporte o revisá el panel.';
    }

    if (this.fleteroEstado.bloqueadoPorVencimiento) {
      return 'Tu verificación está vencida. Actualizá documentación para reactivar acciones.';
    }

    if (!this.fleteroEstado.verificado || !this.fleteroEstado.habilitado) {
      return 'Podés ver pedidos, pero para ver rutas y enviar precios necesitás que un administrador verifique y habilite tu cuenta.';
    }

    return 'Cuenta operativa.';
  }

  irACompletarVerificacion(): void {
    this.interaction.presentToast('Tu cuenta queda pendiente hasta que un administrador la verifique y habilite.');
  }

  private puedeOperarAccionesCriticas(): boolean {
    return this.fleteroEstado.verificado === true
      && this.fleteroEstado.habilitado === true
      && this.fleteroEstado.bloqueadoPorSancion !== true
      && this.fleteroEstado.bloqueadoPorVencimiento !== true;
  }

  private async mostrarAvisoCuentaPendiente(accion: string): Promise<void> {
    await this.interaction.presentInfoAlert(
      'Verificación requerida',
      `Podés ver pedidos, pero para ${accion} necesitás que un administrador verifique y habilite tu cuenta.`
    );
  }

  private sincronizarSuscripcionesRespuestas(pedidos: DatosFlete[]): void {
    const idsActuales = new Set(pedidos.map((pedido) => pedido.id));

    this.respuestasSubs.forEach((subscription, pedidoId) => {
      if (!idsActuales.has(pedidoId)) {
        subscription.unsubscribe();
        this.respuestasSubs.delete(pedidoId);
        this.respuestaPropiaSubs.get(pedidoId)?.unsubscribe();
        this.respuestaPropiaSubs.delete(pedidoId);
        delete this.respuestasPorPedido[pedidoId];
      }
    });

    pedidos.forEach((pedido) => {
      if (this.respuestasSubs.has(pedido.id)) {
        return;
      }

      const sub = this.firestore
        .collection<respuesta>(`PedirFlete/${pedido.uid}/Pedidos/${pedido.id}/Respuesta`)
        .snapshotChanges()
        .subscribe({
          next: (respuestasRef) => {
            const respuestas = respuestasRef.map((respuestaRef) => this.mapRespuestaSnapshot(respuestaRef, pedido));
            console.log('[ofertas-fleteros]', {
              pedidoId: pedido.id,
              usuarioId: pedido.uid,
              cantidad: respuestas.length,
              precios: respuestas.map((respuesta) => ({
                fletero: this.getRespuestaFleteroId(respuesta),
                precio: respuesta.precio,
              })),
            });
            this.aplicarRespuestasPedido(pedido, respuestas);
          },
          error: (error) => {
            if (this.isPermissionDenied(error)) {
              console.info(
                'Firestore no permite leer todas las ofertas de este pedido; solo se mostrara tu oferta hasta desplegar firestore.rules.',
                pedido.id
              );
            } else {
              console.warn('No se pudieron cargar todas las ofertas del pedido.', pedido.id, error);
            }
            this.cdr.markForCheck();
          },
        });

      this.respuestasSubs.set(pedido.id, sub);

      const propiaSub = this.firestore
        .doc<respuesta>(`PedirFlete/${pedido.uid}/Pedidos/${pedido.id}/Respuesta/${this.miIdDeFletero}`)
        .valueChanges({ idField: 'docId' })
        .subscribe({
          next: (respuestaActual) => {
            const respuestas = this.mergeRespuestasPropias(
              this.getRespuestasPedido(pedido),
              respuestaActual ? this.normalizarRespuesta({
                ...respuestaActual,
                idFletero: respuestaActual.idFletero || this.miIdDeFletero
              }) : null
            );
            this.aplicarRespuestasPedido(pedido, respuestas);
          },
          error: (error) => {
            console.warn('No se pudo cargar tu oferta del pedido.', pedido.id, error);
            this.cdr.markForCheck();
          },
        });

      this.respuestaPropiaSubs.set(pedido.id, propiaSub);
    });
  }

  private detenerSuscripcionesRespuestas(): void {
    this.respuestasSubs.forEach((subscription) => subscription.unsubscribe());
    this.respuestasSubs.clear();
    this.respuestaPropiaSubs.forEach((subscription) => subscription.unsubscribe());
    this.respuestaPropiaSubs.clear();
  }

  private aplicarRespuestasPedido(pedido: DatosFlete, respuestas: respuesta[]): void {
    this.respuestasPorPedido[pedido.id] = this.normalizarRespuestas(respuestas || []);
    const respuestaPropia = this.getMiRespuesta(pedido);
    pedido.precioEnviado = Boolean(respuestaPropia);
    if (respuestaPropia) {
      pedido.precio = Number(respuestaPropia.precio || pedido.precio || 0);
    }
    this.cdr.markForCheck();
  }

  private mergeRespuestasPropias(respuestas: respuesta[], miRespuesta: respuesta | null): respuesta[] {
    if (!miRespuesta) {
      return respuestas;
    }

    const miRespuestaFleteroId = this.getRespuestaFleteroId(miRespuesta);

    return [
      ...respuestas.filter((item) => this.getRespuestaFleteroId(item) !== miRespuestaFleteroId),
      miRespuesta,
    ];
  }

  private normalizarRespuestas(respuestas: respuesta[]): respuesta[] {
    return respuestas.map((item) => this.normalizarRespuesta(item));
  }

  private normalizarRespuesta(item: respuesta): respuesta {
    const fleteroId = this.getRespuestaFleteroId(item);
    const precio = this.normalizarPrecioRespuesta(item);
    return {
      ...item,
      idFletero: fleteroId,
      precio,
    };
  }

  private mapRespuestaSnapshot(respuestaRef: any, pedido?: DatosFlete): respuesta {
    const data = respuestaRef.payload.doc.data() as respuesta;
    const docId = respuestaRef.payload.doc.id;
    return this.normalizarRespuesta({
      ...data,
      docId,
      usuarioId: data.usuarioId || pedido?.uid,
      pedidoId: data.pedidoId || pedido?.id,
      idFletero: data.idFletero || docId,
    });
  }

  private getRespuestaFleteroId(item: Partial<respuesta>): string {
    return (item?.idFletero || item?.docId || '').trim();
  }

  private isPermissionDenied(error: any): boolean {
    const code = String(error?.code || '').toLowerCase();
    const message = String(error?.message || '').toLowerCase();
    return code.includes('permission-denied') || message.includes('missing or insufficient permissions');
  }

  private esRespuestaConPrecioValido(item: Partial<respuesta>): boolean {
    const precio = this.getPrecioRespuesta(item);
    return Number.isFinite(precio) && precio > 0;
  }

  private normalizarPrecioRespuesta(item: Partial<respuesta>): number {
    const rawPrecio = (item as any)?.precio ?? (item as any)?.importe ?? (item as any)?.monto;
    const precio = Number(rawPrecio);
    return Number.isFinite(precio) ? precio : 0;
  }

  private esPedidoDisponibleValido(flete: Partial<DatosFlete>): boolean {
    return this.tieneTexto(flete?.id)
      && this.tieneTexto(flete?.uid)
      && this.tieneTexto(flete?.nombre)
      && this.tieneTexto(flete?.fecha)
      && flete?.hora !== null
      && flete?.hora !== undefined
      && flete?.minutos !== null
      && flete?.minutos !== undefined
      && this.tieneTexto(flete?.uDesde)
      && this.tieneTexto(flete?.uHasta)
      && this.tieneTexto(flete?.cargamento)
      && this.tieneTexto(flete?.tipoVehiculo as any);
  }

  private tieneTexto(value: unknown): boolean {
    return String(value ?? '').trim().length > 0;
  }

  private getFechaTimestamp(value: any): Date | null {
    if (!value) {
      return null;
    }

    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }

    if (typeof value?.toDate === 'function') {
      const fecha = value.toDate();
      return fecha instanceof Date && !Number.isNaN(fecha.getTime()) ? fecha : null;
    }

    if (typeof value?.seconds === 'number') {
      return new Date(value.seconds * 1000);
    }

    const fecha = new Date(value);
    return Number.isNaN(fecha.getTime()) ? null : fecha;
  }

  private async ensureUbicacionFletero(): Promise<boolean> {
    if (this.ubicacionFletero) {
      return true;
    }

    this.obteniendoUbicacion = true;
    this.ubicacionFiltroError = '';
    this.ubicacionFleteroReason = null;
    this.cdr.markForCheck();

    const result = await this.locationService.getCurrentLocationResult({
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 30000,
    });
    const ubicacion = result.location;

    this.obteniendoUbicacion = false;

    if (!ubicacion) {
      this.ubicacionFleteroReason = result.reason || 'unknown';
      this.ubicacionFiltroError = 'No pudimos obtener tu ubicación para filtrar por radio.';
      this.interaction.presentToast('Activá tu ubicación para filtrar por distancia');
      this.cdr.markForCheck();
      return false;
    }

    this.ubicacionFletero = ubicacion;
    this.ubicacionFleteroReason = null;
    this.cdr.markForCheck();
    return true;
  }

  private getDistanciaPedidoKm(pedido: DatosFlete): number | null {
    if (!this.ubicacionFletero || !pedido.startCoordinates) {
      return null;
    }

    return this.calculateDistanceKm(
      this.ubicacionFletero.latitude,
      this.ubicacionFletero.longitude,
      pedido.startCoordinates.latitude,
      pedido.startCoordinates.longitude
    );
  }

  async solicitarActivarUbicacion(): Promise<void> {
    await this.ensureUbicacionFletero();
  }

  get ubicacionAccionTexto(): string {
    if (this.obteniendoUbicacion) {
      return 'Buscando ubicacion...';
    }

    if (this.ubicacionFleteroReason === 'permission-denied') {
      return 'Pedir permiso otra vez';
    }

    return 'Activar ubicacion';
  }

  get ubicacionAyudaTexto(): string {
    if (this.ubicacionFleteroReason === 'permission-denied') {
      return 'Si el navegador ya bloqueo el permiso, habilitalo desde el candado de la barra de direcciones o desde ajustes de la app.';
    }

    if (this.ubicacionFleteroReason === 'location-off') {
      return 'Prende el GPS/ubicacion del telefono y volve a intentar.';
    }

    return 'Usamos tu ubicacion solo para mostrar pedidos dentro del radio elegido.';
  }

  private getRadioFiltroAplicable(): number {
    return this.normalizarRadioFiltro(this.filtroRadioKm);
  }

  private normalizarRadioFiltro(radioKm: number | null): number {
    if (!radioKm || !Number.isFinite(radioKm) || radioKm <= 0) {
      return this.maxRadioFiltroKm;
    }

    return Math.min(radioKm, this.maxRadioFiltroKm);
  }

  private calculateDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const toRad = (value: number) => value * Math.PI / 180;
    const earthRadiusKm = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);

    return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  
}
    
      //   async enviarPrecio(DatosFletes: DatosFlete) {
      //     this.interaction.presentLoading;
      //   if (this.miIdDeFletero) {
      //     const path = 'Fleteros';
      //     this.db.getDoc<UserF>(path, this.miIdDeFletero).subscribe((res2) => {
      //       const nuevoDato = DatosFletes;
      //       const rta22 = this.rta;
      //       const enlace = `PedirFlete/${DatosFletes.uid}/Pedidos/${DatosFletes.id}/Respuesta`;
      //       rta22.nombre = res2.nombre;
      //       rta22.apellido = res2.apellido;
      //       rta22.id = nuevoDato.uid;
      //       rta22.idFletero = this.miIdDeFletero;
      //       this.db.createDoc<respuesta>(rta22, enlace, this.miIdDeFletero).then((_) => {
      //         this.interaction.presentToast('Enviado con éxito');
      //         this.interaction.closeLoading;
      //         this.rta = {
      //           id: nuevoDato.id,
      //           idFletero: this.miIdDeFletero,
      //           nombre: '',
      //           apellido: '',
      //           precio: rta22.precio,
      //           mensaje: '',
      //           precioEnviado: true, // Agrega esta propiedad
      //         };
      //         const index = this.pasosFlete.findIndex((flete) => flete.id === DatosFletes.id);
      //         if (index !== -1) {
      //           this.pasosFlete.splice(index, 1);
      //           this.fletesRespondidos.push(DatosFletes);
                
      //         }
    
      //         // Ahora puedes usar this.miIdDeFletero donde sea necesario
      //         console.log('ID del fletero actual:', this.miIdDeFletero);
      //       });
      //     });
      //   }
      // }

