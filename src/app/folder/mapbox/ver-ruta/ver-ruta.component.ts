import {
  Component,
  ElementRef,
  AfterViewInit,
  ViewChild,
  Input,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  HostListener
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import * as mapboxgl from 'mapbox-gl';
import { MapCustomService } from '../../mapbox/map-custom.service';
import { AlertController, AlertInput, IonicModule, ModalController } from '@ionic/angular';
import { CardComponent } from '../../fletes/fletes-dis/card/card.component';
import { FirestoreService } from '../../services/firestore.service';
import { EventoParadaRuta, FleteEnProceso, ParadaRuta } from '../../models/models';
import { Subscription } from 'rxjs';
import { InteractionService } from '../../services/interaction.service';
import { LocationService, LocationWatchId } from '../../services/location.service';

@Component({
  selector: 'app-ver-ruta',
  templateUrl: './ver-ruta.component.html',
  styleUrls: ['./ver-ruta.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, IonicModule],
})
export class VerRutaComponent implements AfterViewInit, OnDestroy {
  private static readonly TRACKING_WRITE_INTERVAL_MS = 8000;
  private static readonly TRACKING_CAMERA_INTERVAL_MS = 2500;
  private static readonly TRACKING_MIN_DISTANCE_METERS = 25;
  private static readonly STOP_ARRIVAL_RADIUS_METERS = 80;
  private static readonly STOP_EXIT_RADIUS_METERS = 130;


  @ViewChild('map') mapContainer!: ElementRef;
  @ViewChild('slideTrack') slideTrack?: ElementRef<HTMLDivElement>;
  @Input() cardComponentRef!: CardComponent;
  @Input() datos: any;

  // Modo del componente: 'ver' (solo ruta), 'tracking' (fletero conduce), 'seguimiento' (usuario sigue)
  @Input() modo: 'ver' | 'tracking' | 'seguimiento' = 'ver';
  @Input() fleteEnProceso: FleteEnProceso | null = null;

  map!: mapboxgl.Map;
  mapLoaded = false;
  startMarker: mapboxgl.Marker | null = null;
  endMarker: mapboxgl.Marker | null = null;
  routeDistance: string = '';
  routeDuration: string = '';
  stopCount = 0;
  routeReady = false;
  staticMarkers: mapboxgl.Marker[] = [];

  // Seguimiento en tiempo real
  trackingActive = false;
  watchId: LocationWatchId | null = null;
  liveMarker: mapboxgl.Marker | null = null;
  private liveLocationSeen = false;
  private firestoreSub: Subscription | null = null;
  private routeSub: Subscription | null = null;
  private isClosing = false;
  viajeIniciado = false;
  viajeFinalizado = false;
  slideOffset = 0;
  slideDragging = false;
  private slideStartX = 0;
  private slideStartOffset = 0;
  private lastTrackingPersistAt = 0;
  private lastTrackingCameraAt = 0;
  private lastPersistedLocation: { latitude: number; longitude: number } | null = null;
  private stopProgress = new Map<string, { arrived: boolean; departed: boolean }>();
  private notifiedStopEventIds = new Set<string>();

  constructor(
    private mapCustom: MapCustomService,
    private modalController: ModalController,
    private alertController: AlertController,
    private db: FirestoreService,
    private interaction: InteractionService,
    private locationService: LocationService,
    private cdr: ChangeDetectorRef,
    private router: Router
  ) {}

  async ngAfterViewInit(): Promise<void> {
  try {
    if (this.map) {
      this.map.remove();
      this.map = null as any;
    }

    const { map } = await this.mapCustom.buildMap();
    this.map = map;

    this.map.on('load', () => {
      window.setTimeout(() => this.map.resize(), 0);
      this.renderRouteScene();

      // Si es modo seguimiento (usuario), iniciar escucha de ubicación en Firestore
      if (this.modo === 'seguimiento' && this.fleteEnProceso) {
        this.iniciarSeguimientoUsuario();
      }

      if (this.modo === 'tracking' && this.fleteEnProceso) {
        this.viajeIniciado = this.fleteEnProceso.estado === 'En Viaje';
        this.cdr.markForCheck();

        if (this.viajeIniciado) {
          this.iniciarViaje(false);
        }
      }
    });
  } catch (error) {
    console.error('Error al cargar el mapa:', error);
  }
}

  get routeStageLabel(): string {
    if (this.viajeFinalizado) {
      return 'Viaje finalizado';
    }

    if (this.modo === 'tracking') {
      return (this.viajeIniciado || this.fleteEnProceso?.estado === 'En Viaje')
        ? 'Ruta en curso'
        : 'Ruta lista para iniciar';
    }

    if (this.modo === 'seguimiento') {
      return this.fleteEnProceso?.estado === 'En Viaje'
        ? 'Siguiendo viaje en vivo'
        : 'Esperando salida del fletero';
    }

    return 'Resumen del viaje';
  }

  get seguimientoUbicacionDisponible(): boolean {
    return this.liveLocationSeen || Boolean(this.fleteEnProceso?.ubicacionActual);
  }

  private renderRouteScene(): void {
    const startCoordinates = this.datos?.startCoordinates || this.fleteEnProceso?.startCoordinates;
    const endCoordinates = this.datos?.endCoordinates || this.datos?.endCoordinatesP || this.fleteEnProceso?.endCoordinatesP;
    const stops = this.getRouteStops();

    this.stopCount = stops.length;
    this.routeDistance = this.formatDistance(
      this.datos?.routeDistanceKm || this.fleteEnProceso?.routeDistanceKm || null
    );
    this.routeDuration = this.formatDuration(
      this.datos?.routeDurationMinutes || this.fleteEnProceso?.routeDurationMinutes || null
    );

    this.clearStaticMarkers();
    this.mapCustom.clearRouteSourceAndLayer();

    if (!startCoordinates || !endCoordinates) {
      this.routeReady = false;
      this.cdr.markForCheck();
      return;
    }

    const orderedCoords: Array<[number, number]> = [
      [startCoordinates.longitude, startCoordinates.latitude],
      ...stops.map((stop) => [stop.coordinates.longitude, stop.coordinates.latitude] as [number, number]),
      [endCoordinates.longitude, endCoordinates.latitude],
    ];

    this.addStaticMarker(orderedCoords[0], 'start', 'A');
    stops.forEach((stop, index) => {
      this.addStaticMarker(
        [stop.coordinates.longitude, stop.coordinates.latitude],
        'stop',
        String(index + 1)
      );
    });
    this.addStaticMarker(orderedCoords[orderedCoords.length - 1], 'end', 'B');
    this.focusRouteBounds(orderedCoords);

    this.routeSub?.unsubscribe();
    this.routeSub = this.mapCustom.loadCoords(orderedCoords).subscribe({
      next: (route) => {
        this.routeDistance = this.formatDistance(Number(route.distanceKm.toFixed(1)));
        this.routeDuration = this.formatDuration(route.durationMinutes);
        this.routeReady = true;
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('No se pudo dibujar la ruta completa:', error);
        this.routeReady = false;
        this.cdr.markForCheck();
      },
    });
  }

  private getRouteStops(): ParadaRuta[] {
    const sourceStops = this.datos?.paradas || this.fleteEnProceso?.paradas || [];
    return [...sourceStops].sort((a: ParadaRuta, b: ParadaRuta) => (a.orden ?? 0) - (b.orden ?? 0));
  }

  private addStaticMarker(
    coordinates: [number, number],
    kind: 'start' | 'stop' | 'end',
    label: string
  ): void {
    const marker = new mapboxgl.Marker({
      element: this.createStaticMarkerElement(kind, label),
    })
      .setLngLat(coordinates)
      .addTo(this.map);

    this.staticMarkers.push(marker);

    if (kind === 'start') {
      this.startMarker = marker;
    }

    if (kind === 'end') {
      this.endMarker = marker;
    }
  }

  private createStaticMarkerElement(
    kind: 'start' | 'stop' | 'end',
    label: string
  ): HTMLDivElement {
    const element = document.createElement('div');
    const palette = kind === 'start'
      ? 'linear-gradient(135deg, #22c55e, #16a34a)'
      : kind === 'end'
        ? 'linear-gradient(135deg, #0f766e, #0f172a)'
        : 'linear-gradient(135deg, #f59e0b, #f97316)';

    element.style.width = kind === 'stop' ? '34px' : '40px';
    element.style.height = kind === 'stop' ? '34px' : '40px';
    element.style.display = 'flex';
    element.style.alignItems = 'center';
    element.style.justifyContent = 'center';
    element.style.borderRadius = '999px';
    element.style.border = '3px solid rgba(255,255,255,0.9)';
    element.style.background = palette;
    element.style.boxShadow = '0 14px 32px rgba(15, 23, 42, 0.24)';
    element.style.color = '#ffffff';
    element.style.fontSize = kind === 'stop' ? '13px' : '14px';
    element.style.fontWeight = '700';
    element.innerText = label;

    return element;
  }

  private focusRouteBounds(coords: Array<[number, number]>): void {
    if (!this.map || !coords.length) {
      return;
    }

    const bounds = coords.reduce((acc, point) => {
      acc.extend(point);
      return acc;
    }, new mapboxgl.LngLatBounds(coords[0], coords[0]));

    this.map.fitBounds(bounds, {
      padding: 96,
      maxZoom: 14.5,
      duration: 650,
    });
  }

  private clearStaticMarkers(): void {
    this.staticMarkers.forEach((marker) => marker.remove());
    this.staticMarkers = [];
    this.startMarker = null;
    this.endMarker = null;
  }

  private formatDistance(distanceKm: number | null): string {
    if (!distanceKm) {
      return '';
    }

    return `${distanceKm.toFixed(1)} km`;
  }

  private formatDuration(durationMinutes: number | null): string {
    if (!durationMinutes) {
      return '';
    }

    if (durationMinutes < 60) {
      return `${durationMinutes} min`;
    }

    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;
    return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
  }

  // === MODO TRACKING (fletero conduce) ===
  async iniciarViaje(actualizarEstado: boolean = true): Promise<void> {
    if (this.trackingActive || !this.fleteEnProceso) return;
    const initialLocation = await this.locationService.getCurrentLocation({
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    });

    if (!initialLocation) {
      this.interaction.presentToast('Necesitamos acceso a tu ubicacion para iniciar el viaje.');
      return;
    }

    if (actualizarEstado) {
      try {
        await this.db.actualizarEstadoFlete(
          this.fleteEnProceso.fleteroId,
          this.fleteEnProceso.id,
          'En Viaje'
        );

        this.fleteEnProceso = {
          ...this.fleteEnProceso,
          estado: 'En Viaje',
          fechaInicioViaje: new Date(),
        };
      } catch (error) {
        console.error('No se pudo iniciar el viaje:', error);
        this.interaction.presentToast('No pudimos iniciar el viaje. Intentá nuevamente.');
        return;
      }
    }

    this.actualizarPosicionEnMapa(initialLocation.latitude, initialLocation.longitude);
    await this.persistTrackingLocationIfNeeded(initialLocation.latitude, initialLocation.longitude, true);
    await this.detectarSalidaDeParadas(initialLocation.latitude, initialLocation.longitude);

    const watchId = await this.locationService.startTracking(
      async (location) => {
        this.actualizarPosicionEnMapa(location.latitude, location.longitude);
        await this.persistTrackingLocationIfNeeded(location.latitude, location.longitude);
        await this.detectarSalidaDeParadas(location.latitude, location.longitude);
      },
      (error) => console.error('Error en seguimiento GPS:', error),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
    );

    if (watchId === null) {
      this.interaction.presentToast('No pudimos activar el seguimiento de ubicacion.');
      return;
    }

    this.trackingActive = true;
    this.viajeIniciado = true;
    this.watchId = watchId;
    this.slideOffset = this.getMaxSlide();
    this.cdr.detectChanges();
  }

  async finalizarViaje(): Promise<void> {
    if (!this.fleteEnProceso) return;

    // Detener geolocalización
    if (this.watchId !== null) {
      void this.locationService.stopTracking(this.watchId);
      this.watchId = null;
    }
    this.trackingActive = false;
    this.viajeFinalizado = true;
    this.cdr.detectChanges();

    await this.db.finalizarFleteYArchivarPedido(this.fleteEnProceso);
    this.fleteEnProceso = {
      ...this.fleteEnProceso,
      estado: 'Finalizado',
      fechaFinalizacion: new Date(),
    };

    // Cerrar modal después de un breve delay
    setTimeout(() => {
      this.modalController.dismiss({ viajeCompletado: true });
    }, 1500);
  }

  async cancelarPreparacionViaje(): Promise<void> {
    if (this.viajeIniciado || this.viajeFinalizado) {
      return;
    }

    if (!this.fleteEnProceso) {
      await this.dismissAndNavigateHome({ viajeCanceladoAntesDeIniciar: true });
      return;
    }

    const motivo = await this.pedirMotivoCancelacion('antes_de_iniciar');
    if (!motivo) {
      return;
    }

    try {
      await this.interaction.presentLoading('Cancelando viaje...');
      await this.db.cancelarFleteYRegistrarEvento(this.fleteEnProceso, {
        motivo,
        canceladoPor: 'Fletero',
      });
      this.fleteEnProceso = {
        ...this.fleteEnProceso,
        estado: 'Cancelado',
        cancelacion: {
          motivo,
          canceladoPor: 'Fletero',
          fecha: new Date(),
          etapa: 'antes_de_iniciar',
        },
      };
      await this.interaction.closeLoading();
      this.interaction.presentToast('Viaje cancelado');
      await this.dismissAndNavigateHome({ viajeCanceladoAntesDeIniciar: true, motivoCancelacion: motivo });
    } catch (error) {
      console.error('Error cancelando viaje:', error);
      await this.interaction.closeLoading();
      this.interaction.presentToast('No se pudo cancelar el viaje');
    }
  }

  async cancelarViajeEnCurso(): Promise<void> {
    if (!this.viajeIniciado || this.viajeFinalizado || !this.fleteEnProceso) {
      return;
    }

    const motivo = await this.pedirMotivoCancelacion('en_viaje');
    if (!motivo) {
      return;
    }

    try {
      await this.interaction.presentLoading('Cancelando viaje en curso...');

      if (this.watchId !== null) {
        await this.locationService.stopTracking(this.watchId);
        this.watchId = null;
      }

      this.trackingActive = false;
      await this.db.cancelarFleteYRegistrarEvento(this.fleteEnProceso, {
        motivo,
        canceladoPor: 'Fletero',
        observacion: 'Cancelación realizada durante el viaje en curso.',
      });
      this.fleteEnProceso = {
        ...this.fleteEnProceso,
        estado: 'Cancelado',
        cancelacion: {
          motivo,
          canceladoPor: 'Fletero',
          observacion: 'Cancelacion realizada durante el viaje en curso.',
          fecha: new Date(),
          etapa: 'en_viaje',
        },
      };

      await this.interaction.closeLoading();
      this.interaction.presentToast('Viaje cancelado en curso');
      await this.dismissAndNavigateHome({
        viajeCancelado: true,
        etapaCancelacion: 'en_viaje',
        motivoCancelacion: motivo,
      });
    } catch (error) {
      console.error('Error cancelando viaje en curso:', error);
      await this.interaction.closeLoading();
      this.interaction.presentToast('No se pudo cancelar el viaje en curso');
    }
  }

  async cancelarViajeUsuarioEnCurso(): Promise<void> {
    if (this.modo !== 'seguimiento' || this.viajeFinalizado || !this.fleteEnProceso) {
      return;
    }

    const motivo = await this.pedirMotivoCancelacionUsuario('en_viaje');
    if (!motivo) {
      return;
    }

    try {
      await this.interaction.presentLoading('Procesando cancelación...');
      await this.db.cancelarFleteYRegistrarEvento(this.fleteEnProceso, {
        motivo,
        canceladoPor: 'Usuario',
        observacion: 'Cancelación solicitada por el usuario con el viaje en curso.',
      });
      this.fleteEnProceso = {
        ...this.fleteEnProceso,
        estado: 'Cancelado',
        cancelacion: {
          motivo,
          canceladoPor: 'Usuario',
          observacion: 'Cancelacion solicitada por el usuario con el viaje en curso.',
          fecha: new Date(),
          etapa: 'en_viaje',
        },
      };
      await this.interaction.closeLoading();
      this.interaction.presentToast('Viaje cancelado por el usuario');
      await this.dismissAndNavigateHome({
        viajeCanceladoUsuario: true,
        etapaCancelacion: 'en_viaje',
        motivoCancelacion: motivo,
      });
    } catch (error) {
      console.error('Error cancelando viaje desde seguimiento de usuario:', error);
      await this.interaction.closeLoading();
      this.interaction.presentToast('No se pudo cancelar el viaje');
    }
  }

  private async pedirMotivoCancelacion(etapa: 'antes_de_iniciar' | 'en_viaje'): Promise<string | null> {
    const inputs: AlertInput[] = etapa === 'en_viaje'
      ? [
          { type: 'radio', label: 'Emergencia o incidente de seguridad', value: 'emergencia_seguridad', checked: true },
          { type: 'radio', label: 'Falla mecánica durante el viaje', value: 'falla_mecanica_en_viaje' },
          { type: 'radio', label: 'Dirección inaccesible o bloqueada', value: 'direccion_inaccesible' },
          { type: 'radio', label: 'El usuario solicita detener y cancelar', value: 'usuario_solicita_cancelacion' },
          { type: 'radio', label: 'Carga no coincide con lo acordado', value: 'carga_no_coincide' },
        ]
      : [
          { type: 'radio', label: 'El usuario no responde', value: 'usuario_no_responde', checked: true },
          { type: 'radio', label: 'Problema con el vehículo antes de salir', value: 'problema_vehiculo' },
          { type: 'radio', label: 'No puedo llegar al punto de retiro', value: 'no_puedo_llegar' },
          { type: 'radio', label: 'Incidente o seguridad', value: 'incidente_seguridad' },
          { type: 'radio', label: 'Otro motivo operativo', value: 'otro_motivo_operativo' },
        ];

    const alert = await this.alertController.create({
      cssClass: 'tfy-cancel-alert',
      header: etapa === 'en_viaje' ? 'Cancelar viaje en curso' : 'Cancelar viaje',
      subHeader: etapa === 'en_viaje'
        ? 'Seleccioná un motivo justificado. Esta acción impacta más fuerte en la confiabilidad.'
        : 'Seleccioná el motivo',
      inputs,
      buttons: [
        {
          text: 'Mantener viaje',
          role: 'cancel',
          cssClass: 'tfy-cancel-alert-secondary',
        },
        {
          text: 'Cancelar viaje',
          role: 'confirm',
          cssClass: 'tfy-cancel-alert-danger',
        },
      ],
    });

    await alert.present();
    const result = await alert.onDidDismiss();
    return result.role === 'confirm' ? (result.data?.values || null) : null;
  }

  private async pedirMotivoCancelacionUsuario(etapa: 'antes_de_iniciar' | 'en_viaje'): Promise<string | null> {
    const inputs: AlertInput[] = etapa === 'en_viaje'
      ? [
          { type: 'radio', label: 'Incidente de seguridad', value: 'incidente_seguridad_usuario', checked: true },
          { type: 'radio', label: 'El servicio no coincide con lo acordado', value: 'servicio_no_coincide' },
          { type: 'radio', label: 'Cobro o condición no informada', value: 'cobro_no_informado' },
          { type: 'radio', label: 'Necesito detener el viaje por emergencia', value: 'emergencia_usuario' },
          { type: 'radio', label: 'Otro incidente durante el viaje', value: 'otro_incidente_viaje' },
        ]
      : [
          { type: 'radio', label: 'Ya no necesito el viaje', value: 'ya_no_necesito', checked: true },
          { type: 'radio', label: 'Error en la solicitud', value: 'error_en_solicitud' },
          { type: 'radio', label: 'Cambio de horario o destino', value: 'cambio_horario_destino' },
          { type: 'radio', label: 'El fletero no responde', value: 'fletero_no_responde' },
          { type: 'radio', label: 'Otro motivo', value: 'otro_motivo_usuario' },
        ];

    const alert = await this.alertController.create({
      cssClass: 'tfy-cancel-alert',
      header: etapa === 'en_viaje' ? 'Reportar y cancelar viaje' : 'Cancelar pedido',
      subHeader: etapa === 'en_viaje'
        ? 'Esta cancelación impacta más fuerte en la confiabilidad del usuario y puede requerir revisión.'
        : 'Seleccioná el motivo de la cancelación.',
      inputs,
      buttons: [
        {
          text: 'Mantener viaje',
          role: 'cancel',
          cssClass: 'tfy-cancel-alert-secondary',
        },
        {
          text: etapa === 'en_viaje' ? 'Reportar y cancelar' : 'Cancelar pedido',
          role: 'confirm',
          cssClass: 'tfy-cancel-alert-danger',
        },
      ],
    });

    await alert.present();
    const result = await alert.onDidDismiss();
    return result.role === 'confirm' ? (result.data?.values || null) : null;
  }

  getTrackingMessage(): string {
    if (!this.fleteEnProceso) {
      return 'Preparando viaje';
    }

    if (this.viajeFinalizado) {
      return 'Viaje finalizado';
    }

    if (this.viajeIniciado || this.fleteEnProceso.estado === 'En Viaje') {
      return 'Compartiendo ubicación en tiempo real';
    }

    return 'Deslizá para iniciar y compartir tu ubicación';
  }

  @HostListener('window:pointermove', ['$event'])
  onPointerMove(event: PointerEvent): void {
    if (!this.slideDragging || this.viajeIniciado || this.viajeFinalizado) return;

    const nextOffset = this.slideStartOffset + (event.clientX - this.slideStartX);
    this.slideOffset = Math.max(0, Math.min(this.getMaxSlide(), nextOffset));
    this.cdr.markForCheck();
  }

  @HostListener('window:pointerup')
  onPointerUp(): void {
    if (!this.slideDragging) return;

    this.slideDragging = false;
    const threshold = this.getMaxSlide() * 0.82;

    if (this.slideOffset >= threshold) {
      this.slideOffset = this.getMaxSlide();
      this.iniciarViaje();
      return;
    }

    this.slideOffset = 0;
    this.cdr.markForCheck();
  }

  onSlideStart(event: PointerEvent): void {
    if (this.viajeIniciado || this.viajeFinalizado) return;

    this.slideDragging = true;
    this.slideStartX = event.clientX;
    this.slideStartOffset = this.slideOffset;
    this.cdr.markForCheck();
  }

  private getMaxSlide(): number {
    const trackWidth = this.slideTrack?.nativeElement?.clientWidth || 260;
    return Math.max(trackWidth - 68, 0);
  }

  private actualizarPosicionEnMapa(lat: number, lng: number): void {
    if (!this.liveMarker) {
      this.liveMarker = new mapboxgl.Marker({ element: this.createLiveMarkerElement() })
        .setLngLat([lng, lat])
        .addTo(this.map);
    } else {
      this.liveMarker.setLngLat([lng, lat]);
    }

    if (this.shouldAnimateTrackingCamera(lat, lng)) {
      this.map.flyTo({ center: [lng, lat], zoom: 15, speed: 0.8, essential: true });
    }
  }

  // === MODO SEGUIMIENTO (usuario observa) ===
  private iniciarSeguimientoUsuario(): void {
    if (!this.fleteEnProceso) return;

    this.firestoreSub = this.db.obtenerFleteEnProceso(
      this.fleteEnProceso.fleteroId,
      this.fleteEnProceso.id
    ).subscribe((flete) => {
      if (!flete) return;

      this.fleteEnProceso = flete;

      // Si el viaje fue finalizado, notificar al usuario
      if (flete.estado === 'Finalizado') {
        this.viajeFinalizado = true;
        this.interaction.presentToast('El viaje fue finalizado');
        this.cdr.detectChanges();
        setTimeout(() => {
          void this.dismissAndNavigateHome({ viajeCompletado: true });
        }, 1500);
        return;
      }

      if (flete.estado === 'Cancelado') {
        if (this.isClosing) {
          return;
        }
        this.interaction.presentToast('El viaje fue cancelado');
        this.dismissAndNavigateHome({ viajeCancelado: true });
        return;
      }

      // Actualizar marcador del fletero en tiempo real
      if (flete.ubicacionActual) {
        const { latitude, longitude } = flete.ubicacionActual;
        this.actualizarUbicacionEnVivo(latitude, longitude);
      }

      this.notificarEventosDeParadas(flete.paradasEventos || []);
    });
  }

  private actualizarUbicacionEnVivo(lat: number, lng: number): void {
    if (!this.liveMarker) {
      this.liveMarker = new mapboxgl.Marker({ element: this.createLiveMarkerElement() })
        .setLngLat([lng, lat])
        .addTo(this.map);
    } else {
      this.liveMarker.setLngLat([lng, lat]);
    }

    if (!this.liveLocationSeen) {
      this.liveLocationSeen = true;
      this.map.flyTo({ center: [lng, lat], zoom: 15, speed: 0.9, essential: true });
      this.cdr.detectChanges();
      return;
    }

    if (this.shouldAnimateTrackingCamera(lat, lng)) {
      this.map.easeTo({
        center: [lng, lat],
        duration: 900,
        essential: true,
      });
    }
  }

  cerrarModal(): void {
    this.safeDismiss();
  }

  private async dismissAndNavigateHome(data: Record<string, unknown>): Promise<void> {
    const dismissed = await this.safeDismiss(data);
    if (!dismissed) {
      return;
    }
    await this.router.navigate(['/home']);
  }

  private createLiveMarkerElement(): HTMLDivElement {
    const element = document.createElement('div');
    element.style.width = '50px';
    element.style.height = '50px';
    element.style.display = 'flex';
    element.style.alignItems = 'center';
    element.style.justifyContent = 'center';
    element.style.borderRadius = '999px';
    element.style.background = 'linear-gradient(135deg, #0ea5e9, #2563eb)';
    element.style.border = '3px solid rgba(255,255,255,0.92)';
    element.style.boxShadow = '0 16px 34px rgba(37, 99, 235, 0.28)';
    element.style.fontSize = '23px';
    element.style.lineHeight = '1';
    element.textContent = '🚚';
    return element;
  }

  private async safeDismiss(data?: Record<string, unknown>): Promise<boolean> {
    if (this.isClosing) {
      return false;
    }

    this.isClosing = true;
    try {
      await this.modalController.dismiss(data);
      return true;
    } catch (error) {
      const message = String((error as Error)?.message || error || '');
      if (!message.includes('overlay does not exist')) {
        console.error('Error cerrando modal de ruta:', error);
      }
      return false;
    }
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
    this.clearStaticMarkers();
    this.liveMarker?.remove();

    if (this.map) {
      this.map.remove();
      this.map = null as any;
    }

    this.startMarker = null;
    this.endMarker = null;
    this.liveMarker = null;

    if (this.watchId !== null) {
      void this.locationService.stopTracking(this.watchId);
      this.watchId = null;
    }

    if (this.firestoreSub) {
      this.firestoreSub.unsubscribe();
      this.firestoreSub = null;
    }

    if (this.mapContainer?.nativeElement) {
      this.mapContainer.nativeElement.innerHTML = '';
    }

    this.mapLoaded = false;
  }

  private async persistTrackingLocationIfNeeded(
    latitude: number,
    longitude: number,
    force = false
  ): Promise<void> {
    if (!this.fleteEnProceso) {
      return;
    }

    const now = Date.now();
    const enoughTimePassed = now - this.lastTrackingPersistAt >= VerRutaComponent.TRACKING_WRITE_INTERVAL_MS;
    const enoughDistanceMoved = this.hasMovedEnough(latitude, longitude);

    if (!force && !enoughTimePassed && !enoughDistanceMoved) {
      return;
    }

    this.lastTrackingPersistAt = now;
    this.lastPersistedLocation = { latitude, longitude };

    await this.db.actualizarUbicacionFlete(
      this.fleteEnProceso.fleteroId,
      this.fleteEnProceso.id,
      latitude,
      longitude
    );
  }

  private async detectarSalidaDeParadas(latitude: number, longitude: number): Promise<void> {
    if (!this.fleteEnProceso?.paradas?.length) {
      return;
    }

    const stops = this.getRouteStops();
    for (const stop of stops) {
      if (!stop?.id || !stop.coordinates) {
        continue;
      }

      const progress = this.stopProgress.get(stop.id) || {
        arrived: Boolean(this.fleteEnProceso.paradasVisitadas?.[stop.id]),
        departed: Boolean(this.fleteEnProceso.paradasVisitadas?.[stop.id]),
      };

      if (progress.departed) {
        this.stopProgress.set(stop.id, progress);
        continue;
      }

      const distance = this.calculateDistanceMeters(
        latitude,
        longitude,
        stop.coordinates.latitude,
        stop.coordinates.longitude
      );

      if (!progress.arrived && distance <= VerRutaComponent.STOP_ARRIVAL_RADIUS_METERS) {
        progress.arrived = true;
        this.stopProgress.set(stop.id, progress);
        continue;
      }

      if (progress.arrived && distance >= VerRutaComponent.STOP_EXIT_RADIUS_METERS) {
        progress.departed = true;
        this.stopProgress.set(stop.id, progress);
        await this.db.registrarSalidaParadaFlete(
          this.fleteEnProceso.fleteroId,
          this.fleteEnProceso.id,
          {
            id: stop.id,
            orden: stop.orden,
            direccion: stop.direccion,
          }
        );
        this.interaction.presentToast(`Salida registrada de parada ${stop.orden}`);
      }
    }
  }

  private notificarEventosDeParadas(eventos: EventoParadaRuta[]): void {
    eventos
      .filter((evento) => evento?.id && !this.notifiedStopEventIds.has(evento.id))
      .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
      .forEach((evento) => {
        this.notifiedStopEventIds.add(evento.id);
        this.interaction.presentToast(evento.mensaje || `El fletero salio de la parada ${evento.orden}`);
      });
  }

  private shouldAnimateTrackingCamera(latitude: number, longitude: number): boolean {
    const now = Date.now();
    const enoughTimePassed = now - this.lastTrackingCameraAt >= VerRutaComponent.TRACKING_CAMERA_INTERVAL_MS;
    const enoughDistanceMoved = this.hasMovedEnough(latitude, longitude);

    if (!enoughTimePassed && !enoughDistanceMoved) {
      return false;
    }

    this.lastTrackingCameraAt = now;
    return true;
  }

  private hasMovedEnough(latitude: number, longitude: number): boolean {
    if (!this.lastPersistedLocation) {
      return true;
    }

    return this.calculateDistanceMeters(
      this.lastPersistedLocation.latitude,
      this.lastPersistedLocation.longitude,
      latitude,
      longitude
    ) >= VerRutaComponent.TRACKING_MIN_DISTANCE_METERS;
  }

  private calculateDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const toRad = (value: number) => value * Math.PI / 180;
    const earthRadiusMeters = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);

    return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

}



