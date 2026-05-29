import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import * as mapboxgl from 'mapbox-gl';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { LocationService } from '../services/location.service';

export interface RouteRenderResult {
  distanceKm: number;
  durationMinutes: number;
  coordinates: [number, number][];
}

@Injectable({
  providedIn: 'root'
})
export class MapCustomService {
  private static mapboxStylesLoaded = false;
  private readonly mapboxGeocodingUrl = 'https://api.mapbox.com/geocoding/v5/mapbox.places';
  private readonly routeSourceId = 'route';
  private readonly routeCasingLayerId = 'route-casing';
  private readonly routeMainLayerId = 'route-main';

  mapbox = mapboxgl as typeof mapboxgl;
  map!: mapboxgl.Map;
  wayPoints: Array<[number, number]> = [];
  markerDriver: mapboxgl.Marker | null = null;
  streetNames: string[] = [];
  styles = 'mapbox://styles/mapbox/light-v11';

  constructor(
    private httpClient: HttpClient,
    private locationService: LocationService
  ) {
    this.mapbox.accessToken = environment.apiKey;
    this.ensureMapboxStyles();
  }

  private ensureMapboxStyles(): void {
    if (typeof document === 'undefined' || MapCustomService.mapboxStylesLoaded) {
      return;
    }

    const existingLink = document.querySelector<HTMLLinkElement>('link[data-mapbox-gl-css="true"]');
    if (existingLink) {
      MapCustomService.mapboxStylesLoaded = true;
      return;
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://api.mapbox.com/mapbox-gl-js/v2.10.0/mapbox-gl.css';
    link.setAttribute('data-mapbox-gl-css', 'true');
    document.head.appendChild(link);
    MapCustomService.mapboxStylesLoaded = true;
  }

  buildMap(container: string | HTMLElement = 'map'): Promise<{ map: mapboxgl.Map }> {
    return new Promise((resolve, reject) => {
      try {
        const defaultCenter: [number, number] = [-68.5250, -31.5375];

        this.map = new mapboxgl.Map({
          container,
          style: this.styles,
          zoom: 10,
          center: defaultCenter,
        });

        void this.locationService.getCurrentLocation({
          enableHighAccuracy: true,
          timeout: 10000,
        }).then((location) => {
          if (!location) {
            return;
          }

          const userCenter: [number, number] = [
            location.longitude,
            location.latitude,
          ];

          this.map.flyTo({
            center: userCenter,
            zoom: 14,
            speed: 1.2,
            curve: 1.25,
            essential: true,
          });
        });

        resolve({
          map: this.map,
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  loadCoords(coords: Array<[number, number]>): Observable<RouteRenderResult> {
    const cleanCoords = coords.filter(
      (point) =>
        Array.isArray(point) &&
        point.length === 2 &&
        Number.isFinite(point[0]) &&
        Number.isFinite(point[1])
    );

    const url = [
      'https://api.mapbox.com/directions/v5/mapbox/driving/',
      cleanCoords.map(([lng, lat]) => `${lng},${lat}`).join(';'),
      `?alternatives=false&geometries=geojson&overview=full&steps=true&access_token=${environment.apiKey}`,
    ].join('');

    return this.httpClient.get(url).pipe(
      map((response: any) => {
        if (!response?.routes?.length || !response.routes[0]?.geometry?.coordinates?.length) {
          throw new Error('No se encontro una ruta valida.');
        }

        const selectedRoute = response.routes[0];
        const routeCoordinates = selectedRoute.geometry.coordinates as [number, number][];

        this.renderRoute(routeCoordinates);

        return {
          distanceKm: Number(selectedRoute.distance || 0) / 1000,
          durationMinutes: Math.max(1, Math.round(Number(selectedRoute.duration || 0) / 60)),
          coordinates: routeCoordinates,
        };
      })
    );
  }

  addMarkerCustom(coords: [number, number]): void {
    const el = document.createElement('div');
    el.className = 'marker';
    this.markerDriver = new mapboxgl.Marker(el);
    this.markerDriver.setLngLat(coords).addTo(this.map);
  }

  clearRouteSourceAndLayer(): void {
    if (!this.map) {
      return;
    }

    if (this.map.getLayer(this.routeMainLayerId)) {
      this.map.removeLayer(this.routeMainLayerId);
    }

    if (this.map.getLayer(this.routeCasingLayerId)) {
      this.map.removeLayer(this.routeCasingLayerId);
    }

    if (this.map.getSource(this.routeSourceId)) {
      this.map.removeSource(this.routeSourceId);
    }
  }

  getStreetName(coordinates: mapboxgl.LngLat): Observable<string> {
    const url = `${this.mapboxGeocodingUrl}/${coordinates.lng},${coordinates.lat}.json?access_token=${environment.apiKey}&language=es`;

    return this.httpClient.get(url).pipe(
      map((response: any) => {
        if (response.features && response.features.length > 0) {
          const feature = response.features[0];

          if (feature.place_name) {
            return feature.place_name;
          }

          if (feature.address) {
            return `${feature.text} ${feature.address}`;
          }

          const contextAddress = feature.context?.find((c: any) => c.id.startsWith('address'));
          if (contextAddress) {
            return `${feature.text} ${contextAddress.text}`;
          }

          return feature.text;
        }

        return 'Direccion no encontrada';
      })
    );
  }

  addStreetName(name: string): void {
    this.streetNames.push(name);
  }

  drawRoute(startCoordinates: mapboxgl.LngLat, endCoordinates: mapboxgl.LngLat): void {
    this.loadCoords([
      [startCoordinates.lng, startCoordinates.lat],
      [endCoordinates.lng, endCoordinates.lat],
    ]).subscribe({
      error: (error) => console.error('No se pudo dibujar la ruta', error),
    });
  }

  private renderRoute(routeCoordinates: [number, number][]): void {
    if (!this.map) {
      return;
    }

    this.clearRouteSourceAndLayer();

    const sourceConfig: mapboxgl.GeoJSONSourceRaw = {
      type: 'geojson',
      lineMetrics: true,
      data: {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: routeCoordinates,
        },
      },
    };

    this.map.addSource(this.routeSourceId, sourceConfig);

    this.map.addLayer({
      id: this.routeCasingLayerId,
      type: 'line',
      source: this.routeSourceId,
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
      },
      paint: {
        'line-color': 'rgba(13, 148, 136, 0.24)',
        'line-width': 12,
        'line-opacity': 0.95,
      },
    });

    this.map.addLayer({
      id: this.routeMainLayerId,
      type: 'line',
      source: this.routeSourceId,
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
      },
      paint: {
        'line-width': 6,
        'line-opacity': 0.98,
        'line-gradient': [
          'interpolate',
          ['linear'],
          ['line-progress'],
          0,
          '#0f766e',
          0.5,
          '#14b8a6',
          1,
          '#22c55e',
        ],
      },
    });

    this.wayPoints = routeCoordinates;

    const bounds = routeCoordinates.reduce((acc, point) => {
      acc.extend(point);
      return acc;
    }, new mapboxgl.LngLatBounds(routeCoordinates[0], routeCoordinates[0]));

    this.map.fitBounds(bounds, {
      padding: 96,
      maxZoom: 14.5,
      duration: 700,
    });
  }
}
