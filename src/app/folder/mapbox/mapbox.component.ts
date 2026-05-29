import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Input,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as mapboxgl from 'mapbox-gl';
import { firstValueFrom, Subscription } from 'rxjs';

import { DatosFlete, ParadaRuta } from '../models/models';
import { MapCustomService } from './map-custom.service';
import { ModalController } from '@ionic/angular';
import { LocationService } from '../services/location.service';

type RoutePointKind = 'start' | 'stop' | 'end';

interface RoutePointState {
  id: string;
  kind: RoutePointKind;
  label: string;
  address: string;
  coordinates: [number, number] | null;
  marker: mapboxgl.Marker | null;
  stopNumber?: number;
}

interface RouteSelectionResult {
  startCoordinates: { latitude: number; longitude: number };
  endCoordinates: { latitude: number; longitude: number };
  uDesde: string;
  uHasta: string;
  paradas: ParadaRuta[];
  routeDistanceKm?: number;
  routeDurationMinutes?: number;
}

@Component({
  selector: 'app-mapbox',
  templateUrl: './mapbox.component.html',
  styleUrls: ['./mapbox.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule],
})
export class MapboxComponent implements AfterViewInit, OnDestroy {
  @ViewChild('map') mapContainer!: ElementRef<HTMLDivElement>;
  @Input() routeDraft: Partial<DatosFlete> | null = null;

  map!: mapboxgl.Map;
  panelCollapsed = false;
  pointsExpanded = true;
  routePoints: RoutePointState[] = [];
  activePointId = 'start';
  routeDistanceKm: number | null = null;
  routeDurationMinutes: number | null = null;
  routeError = '';
  uiStatusMessage = '';

  private routeSub: Subscription | null = null;

  constructor(
    private mapCustom: MapCustomService,
    private modalController: ModalController,
    private locationService: LocationService,
    private cdr: ChangeDetectorRef
  ) {}

  get stopPoints(): RoutePointState[] {
    return this.routePoints.filter((point) => point.kind === 'stop');
  }

  get canAddStop(): boolean {
    return Boolean(this.getStartPoint()?.coordinates && this.stopPoints.length < 3);
  }

  get canSave(): boolean {
    return Boolean(this.getStartPoint()?.coordinates && this.getEndPoint()?.coordinates && !this.hasIncompletePoints());
  }

  get routeDistanceLabel(): string {
    return this.routeDistanceKm ? this.formatDistance(this.routeDistanceKm) : '';
  }

  get routeDurationLabel(): string {
    return this.routeDurationMinutes ? this.formatDuration(this.routeDurationMinutes) : '';
  }

  get activePointLabel(): string {
    return this.activePoint?.label || 'Origen';
  }

  get activePoint(): RoutePointState | undefined {
    return this.routePoints.find((point) => point.id === this.activePointId);
  }

  get activePointHint(): string {
    const point = this.activePoint;

    if (!point) {
      return 'Selecciona un punto para continuar.';
    }

    if (point.kind === 'start') {
      return point.coordinates
        ? 'Origen listo. Toca el mapa para ajustar la parada de salida.'
        : 'Toca el mapa para marcar el origen.';
    }

    if (point.kind === 'end') {
      return point.coordinates
        ? 'Destino listo. Puedes seguir editando o moverlo en el mapa.'
        : 'Toca el mapa para marcar el destino.';
    }

    return point.coordinates
      ? `Parada ${point.stopNumber ?? 1} lista. Puedes moverla en el mapa.`
      : `Toca el mapa para marcar la parada ${point.stopNumber ?? 1}.`;
  }

  get guidanceTitle(): string {
    const point = this.activePoint;

    if (this.canSave) {
      return 'Ruta lista para confirmar';
    }

    if (!point) {
      return 'Selecciona un punto de la ruta';
    }

    if (point.kind === 'start') {
      return point.coordinates ? 'Inicio colocado' : 'Haz click para colocar el inicio';
    }

    if (point.kind === 'end') {
      return point.coordinates ? 'Destino colocado' : 'Haz click para colocar el destino';
    }

    return point.coordinates
      ? `Parada ${point.stopNumber ?? 1} colocada`
      : `Haz click para colocar la parada ${point.stopNumber ?? 1}`;
  }

  get guidanceMessage(): string {
    const point = this.activePoint;

    if (this.canSave) {
      return this.routeDistanceKm && this.routeDurationMinutes
        ? `${this.formatDistance(this.routeDistanceKm)} - ${this.formatDuration(this.routeDurationMinutes)}. Puedes confirmar o ajustar un punto.`
        : 'Puedes confirmar la ruta o ajustar los puntos antes de seguir.';
    }

    if (!point) {
      return 'Abre el detalle de puntos y elige cual quieres editar.';
    }

    if (!point.coordinates) {
      return 'Toca una zona del mapa para colocar este punto. Puedes mover el marcador despues.';
    }

    const nextPoint = this.getNextIncompletePoint(point.id);
    if (nextPoint) {
      return `Siguiente: ${nextPoint.label}. El mapa ya esta listo para marcarlo.`;
    }

    return 'Revisa el recorrido y confirma cuando este todo correcto.';
  }

  get primaryActionLabel(): string {
    if (this.canSave) {
      return 'Confirmar ruta';
    }

    const point = this.activePoint;
    if (!point?.coordinates) {
      return 'Toca el mapa';
    }

    const nextPoint = this.getNextIncompletePoint(point.id);
    return nextPoint ? `Seguir con ${nextPoint.label}` : 'Revisar ruta';
  }

  get secondaryActionLabel(): string {
    if (this.canAddStop && this.getStartPoint()?.coordinates && !this.canSave) {
      return 'Agregar parada';
    }

    return this.panelCollapsed ? 'Editar puntos' : 'Ocultar detalle';
  }

  get quickPoints(): RoutePointState[] {
    return this.routePoints.filter((point) => point.kind === 'start' || point.kind === 'stop' || point.kind === 'end');
  }

  get panelTitle(): string {
    return this.panelCollapsed ? 'Ruta resumida' : 'Diseña tu recorrido';
  }

  get panelSummary(): string {
    if (this.panelCollapsed) {
      return this.summaryText;
    }

    return 'Marca origen, agrega paradas si hace falta y termina con destino.';
  }

  get primaryActionDisabled(): boolean {
    return !this.canSave && !this.activePoint?.coordinates;
  }

  get isPointsVisible(): boolean {
    return !this.panelCollapsed && this.pointsExpanded;
  }

  get canCloseMap(): boolean {
    return true;
  }

  trackByPointId(index: number, point: RoutePointState): string {
    return point.id;
  }

  canSelectPoint(point: RoutePointState): boolean {
    return Boolean(point.coordinates || point.id === this.getFirstIncompletePointId());
  }

  get summaryText(): string {
    if (this.routeDistanceKm && this.routeDurationMinutes) {
      return `${this.formatDistance(this.routeDistanceKm)} · ${this.formatDuration(this.routeDurationMinutes)}`;
    }

    if (!this.getStartPoint()?.coordinates) {
      return 'Marca el origen para empezar a trazar la ruta';
    }

    if (!this.getEndPoint()?.coordinates) {
      return 'Marca el destino para completar el recorrido';
    }

    const missingPoints = this.routePoints.filter((point) => !point.coordinates).length;
    if (missingPoints > 0) {
      return `Falta ubicar ${missingPoints} punto${missingPoints > 1 ? 's' : ''} para calcular la ruta`;
    }

    return 'Ruta lista para guardar';
  }

  async ngAfterViewInit(): Promise<void> {
    try {
      const { map } = await this.mapCustom.buildMap(this.mapContainer.nativeElement);
      this.map = map;

      this.map.on('load', () => {
        window.setTimeout(() => this.map.resize(), 0);
        this.initializeRoutePoints();
        void this.prefillStartWithCurrentLocation();
        this.setUiStatus(this.guidanceTitle);

        this.map.on('click', (event) => {
          this.updatePoint(this.activePointId, [event.lngLat.lng, event.lngLat.lat]).catch((error) => {
            console.error('No se pudo actualizar el punto seleccionado:', error);
            this.setUiStatus('No se pudo actualizar el punto seleccionado');
          });
        });
      });
    } catch (error) {
      console.error('Error al cargar el mapa:', error);
    }
  }

  addStop(): void {
    if (!this.canAddStop) {
      return;
    }

    const newStop: RoutePointState = {
      id: `stop-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      kind: 'stop',
      label: '',
      address: '',
      coordinates: null,
      marker: null,
    };

    this.routePoints.splice(this.routePoints.length - 1, 0, newStop);
    this.refreshPointLabels();
    this.activePointId = newStop.id;
    this.panelCollapsed = false;
    this.pointsExpanded = true;
    this.setUiStatus(`Marca ${newStop.label.toLowerCase()} en el mapa`);
    this.renderPointMarkers();
    this.updateRoutePreview();
    this.cdr.markForCheck();
  }

  removeStop(pointId: string): void {
    const point = this.routePoints.find((item) => item.id === pointId);
    point?.marker?.remove();

    this.routePoints = this.routePoints.filter((item) => item.id !== pointId);
    this.refreshPointLabels();

    if (this.activePointId === pointId) {
      this.activePointId = this.getFirstIncompletePointId() ?? this.getEndPoint()?.id ?? 'end';
    }

    this.setUiStatus('Parada eliminada');
    this.renderPointMarkers();
    this.updateRoutePreview();
    this.cdr.markForCheck();
  }

  setActivePoint(pointId: string): void {
    const point = this.routePoints.find((item) => item.id === pointId);
    if (!point || !this.canSelectPoint(point)) {
      const nextPoint = this.getFirstIncompletePoint();
      this.setUiStatus(`Primero marca ${nextPoint?.label.toLowerCase() || 'el punto pendiente'}`);
      return;
    }

    this.activePointId = pointId;

    this.panelCollapsed = false;
    this.pointsExpanded = true;

    this.setUiStatus(point?.coordinates ? `${point.label} seleccionado para ajustar` : `Marca ${point?.label || 'Origen'} en el mapa`);
    this.renderPointMarkers();
    this.cdr.markForCheck();
  }

  clearPoint(pointId: string): void {
    const point = this.routePoints.find((item) => item.id === pointId);
    if (!point) {
      return;
    }

    point.coordinates = null;
    point.address = '';
    point.marker?.remove();
    point.marker = null;

    this.refreshPointLabels();
    this.updateRoutePreview();
    this.renderPointMarkers();
    this.cdr.markForCheck();
  }

  getPointBadge(point: RoutePointState): string {
    if (point.kind === 'start') {
      return 'A';
    }

    if (point.kind === 'end') {
      return 'B';
    }

    return String(point.stopNumber ?? 1);
  }

  getPointPlaceholder(point: RoutePointState): string {
    if (point.kind === 'start') {
      return 'Selecciona el punto de retiro';
    }

    if (point.kind === 'end') {
      return 'Selecciona el punto de entrega';
    }

    return 'Selecciona una parada intermedia';
  }

  async guardarRuta(): Promise<void> {
    if (!this.canSave) {
      return;
    }

    const startPoint = this.getStartPoint();
    const endPoint = this.getEndPoint();

    if (!startPoint?.coordinates || !endPoint?.coordinates) {
      return;
    }

    const result: RouteSelectionResult = {
      startCoordinates: {
        latitude: startPoint.coordinates[1],
        longitude: startPoint.coordinates[0],
      },
      endCoordinates: {
        latitude: endPoint.coordinates[1],
        longitude: endPoint.coordinates[0],
      },
      uDesde: startPoint.address || this.formatCoords(startPoint.coordinates),
      uHasta: endPoint.address || this.formatCoords(endPoint.coordinates),
      paradas: this.stopPoints
        .filter((point) => point.coordinates)
        .map((point, index) => ({
          id: point.id,
          orden: index + 1,
          direccion: point.address || this.formatCoords(point.coordinates as [number, number]),
          coordinates: {
            latitude: (point.coordinates as [number, number])[1],
            longitude: (point.coordinates as [number, number])[0],
          },
        })),
      ...(this.routeDistanceKm ? { routeDistanceKm: Number(this.routeDistanceKm.toFixed(1)) } : {}),
      ...(this.routeDurationMinutes ? { routeDurationMinutes: this.routeDurationMinutes } : {}),
    };

    await this.modalController.dismiss(result, 'route-selected');
  }

  cerrarPanel(): void {
    this.panelCollapsed = true;
    this.pointsExpanded = false;
    this.setUiStatus('Panel minimizado. El mapa queda libre');
    this.resizeMapSoon();
    this.fitCurrentRouteToViewport();
    this.cdr.markForCheck();
  }

  expandirPanel(): void {
    this.panelCollapsed = false;
    this.pointsExpanded = true;
    this.setUiStatus('Panel expandido');
    this.resizeMapSoon();
    this.fitCurrentRouteToViewport();
    this.cdr.markForCheck();
  }

  togglePointsSection(): void {
    if (this.panelCollapsed) {
      this.panelCollapsed = false;
      this.pointsExpanded = true;
      this.resizeMapSoon();
      this.cdr.markForCheck();
      return;
    }

    this.pointsExpanded = !this.pointsExpanded;
    this.setUiStatus(this.pointsExpanded ? 'Puntos del viaje abiertos' : 'Puntos del viaje ocultos');
    this.cdr.markForCheck();
  }

  async runPrimaryAction(): Promise<void> {
    if (this.canSave) {
      await this.guardarRuta();
      return;
    }

    const point = this.activePoint;
    if (!point?.coordinates) {
      this.setUiStatus(this.guidanceTitle);
      return;
    }

    const nextPoint = this.getNextIncompletePoint(point.id);
    if (nextPoint) {
      this.setActivePoint(nextPoint.id);
      return;
    }

    this.expandirPanel();
  }

  runSecondaryAction(): void {
    if (this.canAddStop && this.getStartPoint()?.coordinates && !this.canSave) {
      this.addStop();
      return;
    }

    if (this.panelCollapsed) {
      this.expandirPanel();
      this.pointsExpanded = true;
      this.resizeMapSoon();
      this.cdr.markForCheck();
      return;
    }

    this.cerrarPanel();
  }

  cerrarModal(): void {
    this.setUiStatus('Cerrando mapa');
    this.modalController.dismiss();
  }

  async cerrarYConfirmar(): Promise<void> {
    if (this.canSave) {
      await this.guardarRuta();
      return;
    }

    this.cerrarModal();
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();

    this.routePoints.forEach((point) => point.marker?.remove());

    if (this.map) {
      this.map.remove();
      this.map = null as unknown as mapboxgl.Map;
    }

    if (this.mapContainer?.nativeElement) {
      this.mapContainer.nativeElement.innerHTML = '';
    }
  }

  private initializeRoutePoints(): void {
    const draftStops = [...(this.routeDraft?.paradas ?? [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));

    this.routePoints = [
      {
        id: 'start',
        kind: 'start',
        label: 'Origen',
        address: this.routeDraft?.uDesde ?? '',
        coordinates: this.toTuple(this.routeDraft?.startCoordinates),
        marker: null,
      },
      ...draftStops.map((stop) => ({
        id: stop.id || `stop-${stop.orden}`,
        kind: 'stop' as const,
        label: '',
        address: stop.direccion ?? '',
        coordinates: this.toTuple(stop.coordinates),
        marker: null,
      })),
      {
        id: 'end',
        kind: 'end',
        label: 'Destino',
        address: this.routeDraft?.uHasta ?? '',
        coordinates: this.toTuple(this.routeDraft?.endCoordinatesP),
        marker: null,
      },
    ];

    this.refreshPointLabels();
    this.activePointId = this.getFirstIncompletePointId() ?? this.getEndPoint()?.id ?? 'end';
    this.panelCollapsed = false;
    this.pointsExpanded = true;
    this.routeDistanceKm = this.routeDraft?.routeDistanceKm ?? null;
    this.routeDurationMinutes = this.routeDraft?.routeDurationMinutes ?? null;
    this.routeError = '';

    this.renderPointMarkers();
    this.updateRoutePreview();
    this.fitPointsWithoutRoute();
    this.cdr.markForCheck();
  }

  private async prefillStartWithCurrentLocation(): Promise<void> {
    const startPoint = this.getStartPoint();
    if (!startPoint || startPoint.coordinates) {
      return;
    }

    const location = await this.locationService.getCurrentLocation({
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 30000,
    });

    if (!location || this.getStartPoint()?.coordinates) {
      return;
    }

    await this.updatePoint(
      'start',
      [location.longitude, location.latitude],
      'Mi ubicacion actual',
      true,
      true
    );
  }

  private async handleExternalRouteSelection(result: any): Promise<void> {
    if (!Array.isArray(result?.center) || result.center.length < 2) {
      return;
    }

    this.setUiStatus(`Ubicación encontrada para ${this.activePointLabel}`);
    await this.updatePoint(
      this.activePointId,
      [Number(result.center[0]), Number(result.center[1])],
      result.place_name || result.text || ''
    );
  }

  private async updatePoint(
    pointId: string,
    coordinates: [number, number],
    address = '',
    advanceToNext = true,
    centerMap = true
  ): Promise<void> {
    const point = this.routePoints.find((item) => item.id === pointId);
    if (!point) {
      return;
    }

    point.coordinates = coordinates;
    point.address = address || 'Buscando referencia...';
    this.setUiStatus(`${point.label || 'Punto'} marcado en el mapa`);

    this.renderPointMarkers();
    this.updateRoutePreview();

    if (!address) {
      point.address = await this.getAddressFromCoords(coordinates);
    }

    if (centerMap && this.map) {
      this.map.flyTo({
        center: coordinates,
        zoom: Math.max(this.map.getZoom(), 14),
        speed: 1.1,
        curve: 1.2,
        essential: true,
      });
    }

    if (advanceToNext) {
      this.activePointId = this.getNextIncompletePointId(pointId) ?? pointId;
    }

    if (advanceToNext) {
      this.panelCollapsed = false;
      this.pointsExpanded = true;
      this.setUiStatus(this.guidanceTitle);
    }

    this.renderPointMarkers();
    this.cdr.markForCheck();
  }

  private async getAddressFromCoords(coords: [number, number]): Promise<string> {
    try {
      return await firstValueFrom(
        this.mapCustom.getStreetName(new mapboxgl.LngLat(coords[0], coords[1]))
      );
    } catch (error) {
      console.error('No se pudo obtener la referencia del punto:', error);
      return this.formatCoords(coords);
    }
  }

  private updateRoutePreview(): void {
    this.routeSub?.unsubscribe();
    this.routeError = '';

    const startPoint = this.getStartPoint();
    const endPoint = this.getEndPoint();

    if (!startPoint?.coordinates || !endPoint?.coordinates) {
      this.routeDistanceKm = null;
      this.routeDurationMinutes = null;
      this.mapCustom.clearRouteSourceAndLayer();
      this.fitPointsWithoutRoute();
      this.cdr.markForCheck();
      return;
    }

    if (this.hasIncompletePoints()) {
      this.routeDistanceKm = null;
      this.routeDurationMinutes = null;
      this.mapCustom.clearRouteSourceAndLayer();
      this.fitPointsWithoutRoute();
      this.cdr.markForCheck();
      return;
    }

    this.routeSub = this.mapCustom.loadCoords(this.getOrderedCoordinates()).subscribe({
      next: (route) => {
        this.routeDistanceKm = Number(route.distanceKm.toFixed(1));
        this.routeDurationMinutes = route.durationMinutes;
        this.routeError = '';
        this.fitCoordinates(route.coordinates, 700);
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('No se pudo calcular la ruta:', error);
        this.routeDistanceKm = null;
        this.routeDurationMinutes = null;
        this.routeError = 'No pudimos trazar esa ruta. Puedes guardar igual y revisarla luego.';
        this.fitPointsWithoutRoute();
        this.cdr.markForCheck();
      },
    });
  }

  private renderPointMarkers(): void {
    if (!this.map) {
      return;
    }

    this.routePoints.forEach((point) => {
      point.marker?.remove();
      point.marker = null;

      if (!point.coordinates) {
        return;
      }

      const markerElement = this.createMarkerElement(point, point.id === this.activePointId);
      markerElement.addEventListener('click', (event) => {
        event.stopPropagation();
        this.setActivePoint(point.id);
      });

      const marker = new mapboxgl.Marker({
        element: markerElement,
        draggable: true,
      })
        .setLngLat(point.coordinates)
        .setPopup(
          new mapboxgl.Popup({
            closeButton: false,
            offset: point.kind === 'stop' ? 22 : 26,
          }).setHTML(this.createPointPopupHtml(point))
        )
        .addTo(this.map);

      marker.on('dragend', () => {
        const lngLat = marker.getLngLat();
        this.updatePoint(point.id, [lngLat.lng, lngLat.lat], '', false, false).catch((error) => {
          console.error('No se pudo actualizar la posicion del marcador:', error);
        });
      });

      point.marker = marker;

      if (point.id === this.activePointId) {
        marker.togglePopup();
      }
    });
  }

  private createMarkerElement(point: RoutePointState, isActive: boolean): HTMLDivElement {
    const element = document.createElement('div');
    const palette = this.getPointPalette(point.kind);

    element.style.width = point.kind === 'stop' ? '34px' : '40px';
    element.style.height = point.kind === 'stop' ? '34px' : '40px';
    element.style.borderRadius = '999px';
    element.style.display = 'flex';
    element.style.alignItems = 'center';
    element.style.justifyContent = 'center';
    element.style.color = '#ffffff';
    element.style.fontSize = point.kind === 'stop' ? '13px' : '14px';
    element.style.fontWeight = '700';
    element.style.background = palette.background;
    element.style.border = isActive ? '4px solid rgba(255,255,255,0.92)' : '3px solid rgba(255,255,255,0.82)';
    element.style.boxShadow = isActive
      ? '0 16px 34px rgba(15, 23, 42, 0.32)'
      : '0 10px 24px rgba(15, 23, 42, 0.24)';
    element.style.transform = isActive ? 'scale(1.06)' : 'scale(1)';
    element.style.cursor = 'grab';
    element.innerText = this.getPointBadge(point);

    return element;
  }

  private createPointPopupHtml(point: RoutePointState): string {
    const address = point.address || this.getPointPlaceholder(point);

    return `
      <strong class="map-planner__popup-title">${this.escapeHtml(point.label)}</strong>
      <div class="map-planner__popup-text">${this.escapeHtml(address)}</div>
    `;
  }

  private getPointPalette(kind: RoutePointKind): { background: string } {
    if (kind === 'start') {
      return { background: 'linear-gradient(135deg, #22c55e, #16a34a)' };
    }

    if (kind === 'end') {
      return { background: 'linear-gradient(135deg, #0f766e, #0f172a)' };
    }

    return { background: 'linear-gradient(135deg, #f59e0b, #f97316)' };
  }

  private refreshPointLabels(): void {
    let stopCounter = 0;

    this.routePoints.forEach((point) => {
      if (point.kind === 'start') {
        point.label = 'Origen';
        point.stopNumber = undefined;
        return;
      }

      if (point.kind === 'end') {
        point.label = 'Destino';
        point.stopNumber = undefined;
        return;
      }

      stopCounter += 1;
      point.label = `Parada ${stopCounter}`;
      point.stopNumber = stopCounter;
    });
  }

  private getOrderedCoordinates(): Array<[number, number]> {
    return this.routePoints
      .map((point) => point.coordinates)
      .filter((coords): coords is [number, number] => Boolean(coords));
  }

  private setUiStatus(message: string): void {
    this.uiStatusMessage = message;
    this.cdr.markForCheck();
  }

  private resizeMapSoon(): void {
    if (!this.map) {
      return;
    }

    requestAnimationFrame(() => this.map?.resize());
    window.setTimeout(() => this.map?.resize(), 220);
  }

  private fitPointsWithoutRoute(): void {
    const coords = this.getOrderedCoordinates();
    if (!this.map || coords.length === 0) {
      return;
    }

    if (coords.length === 1) {
      this.map.flyTo({
        center: coords[0],
        zoom: 14,
        speed: 1,
        essential: true,
      });
      return;
    }

    const bounds = coords.reduce((acc, point) => {
      acc.extend(point);
      return acc;
    }, new mapboxgl.LngLatBounds(coords[0], coords[0]));

    this.map.fitBounds(bounds, {
      padding: this.getMapPadding(),
      maxZoom: 14,
      duration: 500,
    });
  }

  private fitCurrentRouteToViewport(): void {
    const coords = this.mapCustom.wayPoints?.length ? this.mapCustom.wayPoints : this.getOrderedCoordinates();
    this.fitCoordinates(coords, 420);
  }

  private fitCoordinates(coords: Array<[number, number]>, duration = 500): void {
    if (!this.map || !coords.length) {
      return;
    }

    if (coords.length === 1) {
      this.map.flyTo({
        center: coords[0],
        zoom: 14,
        speed: 1,
        essential: true,
      });
      return;
    }

    const bounds = coords.reduce((acc, point) => {
      acc.extend(point);
      return acc;
    }, new mapboxgl.LngLatBounds(coords[0], coords[0]));

    this.map.fitBounds(bounds, {
      padding: this.getMapPadding(),
      maxZoom: 14,
      duration,
    });
  }

  private getMapPadding(): mapboxgl.PaddingOptions {
    if (this.panelCollapsed) {
      return { top: 96, right: 40, bottom: 92, left: 40 };
    }

    const extraStops = Math.min(this.stopPoints.length, 3) * 28;

    return {
      top: 108,
      right: 48,
      bottom: 260 + extraStops,
      left: 48,
    };
  }

  private hasIncompletePoints(): boolean {
    return this.routePoints.some((point) => !point.coordinates);
  }

  private getFirstIncompletePointId(): string | null {
    return this.getFirstIncompletePoint()?.id ?? null;
  }

  private getFirstIncompletePoint(): RoutePointState | null {
    return this.routePoints.find((point) => !point.coordinates) ?? null;
  }

  private getNextIncompletePointId(currentId: string): string | null {
    const currentIndex = this.routePoints.findIndex((point) => point.id === currentId);

    if (currentIndex === -1) {
      return this.getFirstIncompletePointId();
    }

    const nextPoint = this.routePoints.slice(currentIndex + 1).find((point) => !point.coordinates);
    return nextPoint?.id ?? this.getFirstIncompletePointId();
  }

  private getNextIncompletePoint(currentId: string): RoutePointState | null {
    const nextId = this.getNextIncompletePointId(currentId);
    return nextId ? this.routePoints.find((point) => point.id === nextId) ?? null : null;
  }

  private getStartPoint(): RoutePointState | undefined {
    return this.routePoints.find((point) => point.kind === 'start');
  }

  private getEndPoint(): RoutePointState | undefined {
    return this.routePoints.find((point) => point.kind === 'end');
  }

  private toTuple(
    coords?: { latitude: number; longitude: number } | null
  ): [number, number] | null {
    if (!coords || !Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude)) {
      return null;
    }

    return [coords.longitude, coords.latitude];
  }

  private formatDistance(distanceKm: number): string {
    return `${distanceKm.toFixed(1)} km`;
  }

  private formatDuration(durationMinutes: number): string {
    if (durationMinutes < 60) {
      return `${durationMinutes} min`;
    }

    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;

    if (!minutes) {
      return `${hours} h`;
    }

    return `${hours} h ${minutes} min`;
  }

  private formatCoords(coords: [number, number]): string {
    return `${coords[1].toFixed(5)}, ${coords[0].toFixed(5)}`;
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (char) => {
      const entities: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
      };

      return entities[char];
    });
  }
}
