import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import {
  Geolocation,
  Position,
  PositionOptions,
} from '@capacitor/geolocation';

export type LocationWatchId = string | number;

export interface CapturedLocation {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  capturedAt: Date;
}

export type LocationUnavailableReason =
  | 'permission-denied'
  | 'location-off'
  | 'timeout'
  | 'unsupported'
  | 'unknown';

export interface LocationResult {
  location: CapturedLocation | null;
  reason?: LocationUnavailableReason;
  message?: string;
}

@Injectable({
  providedIn: 'root',
})
export class LocationService {
  private readonly defaultPositionOptions: PositionOptions = {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 0,
  };

  isNativePlatform(): boolean {
    return Capacitor.isNativePlatform();
  }

  async getCurrentLocation(options?: PositionOptions): Promise<CapturedLocation | null> {
    const result = await this.getCurrentLocationResult(options);
    return result.location;
  }

  async getCurrentLocationResult(options?: PositionOptions): Promise<LocationResult> {
    try {
      if (this.isNativePlatform()) {
        const permission = await this.ensureNativeLocationPermission();
        if (!permission.granted) {
          return {
            location: null,
            reason: 'permission-denied',
            message: 'La app no tiene permiso para usar tu ubicacion.',
          };
        }

        const position = await Geolocation.getCurrentPosition({
          ...this.defaultPositionOptions,
          ...options,
        });

        return { location: this.mapPosition(position) };
      }

      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        return {
          location: null,
          reason: 'unsupported',
          message: 'Este dispositivo o navegador no permite obtener ubicacion.',
        };
      }

      return await new Promise<LocationResult>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (position) => resolve({ location: this.mapWebPosition(position) }),
          (error) => resolve({
            location: null,
            reason: this.mapWebGeolocationError(error),
            message: this.getLocationErrorMessage(this.mapWebGeolocationError(error)),
          }),
          {
            ...this.defaultPositionOptions,
            ...options,
          }
        );
      });
    } catch (error) {
      console.warn('No se pudo obtener la ubicacion actual.', error);
      return {
        location: null,
        reason: this.mapUnknownLocationError(error),
        message: this.getLocationErrorMessage(this.mapUnknownLocationError(error)),
      };
    }
  }

  async startTracking(
    onSuccess: (location: CapturedLocation) => void | Promise<void>,
    onError?: (error: GeolocationPositionError | unknown) => void,
    options?: PositionOptions
  ): Promise<LocationWatchId | null> {
    try {
      if (this.isNativePlatform()) {
        const permission = await this.ensureNativeLocationPermission();
        if (!permission.granted) {
          return null;
        }

        return await Geolocation.watchPosition(
          {
            ...this.defaultPositionOptions,
            ...options,
          },
          (position: Position | null, error?: any) => {
            if (error) {
              onError?.(error);
              return;
            }

            if (!position) {
              return;
            }

            void onSuccess(this.mapPosition(position));
          }
        );
      }

      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        return null;
      }

      return navigator.geolocation.watchPosition(
        (position) => {
          void onSuccess(this.mapWebPosition(position));
        },
        (error) => {
          onError?.(error);
        },
        {
          ...this.defaultPositionOptions,
          ...options,
        }
      );
    } catch (error) {
      onError?.(error);
      return null;
    }
  }

  async stopTracking(watchId: LocationWatchId | null): Promise<void> {
    if (watchId === null || watchId === undefined) {
      return;
    }

    if (this.isNativePlatform()) {
      await Geolocation.clearWatch({ id: String(watchId) });
      return;
    }

    if (typeof navigator !== 'undefined' && navigator.geolocation && typeof watchId === 'number') {
      navigator.geolocation.clearWatch(watchId);
    }
  }

  private async ensureNativeLocationPermission(): Promise<{ granted: boolean }> {
    const permissions = await Geolocation.checkPermissions();
    if (permissions.location === 'granted' || permissions.coarseLocation === 'granted') {
      return { granted: true };
    }

    const requested = await Geolocation.requestPermissions();
    return {
      granted: requested.location === 'granted' || requested.coarseLocation === 'granted',
    };
  }

  private mapPosition(position: Position): CapturedLocation {
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy ?? null,
      capturedAt: new Date(position.timestamp),
    };
  }

  private mapWebPosition(position: GeolocationPosition): CapturedLocation {
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy ?? null,
      capturedAt: new Date(position.timestamp),
    };
  }

  private mapWebGeolocationError(error: GeolocationPositionError): LocationUnavailableReason {
    if (error.code === error.PERMISSION_DENIED) {
      return 'permission-denied';
    }

    if (error.code === error.TIMEOUT) {
      return 'timeout';
    }

    if (error.code === error.POSITION_UNAVAILABLE) {
      return 'location-off';
    }

    return 'unknown';
  }

  private mapUnknownLocationError(error: unknown): LocationUnavailableReason {
    const message = String((error as any)?.message || (error as any)?.code || '').toLowerCase();
    if (message.includes('permission') || message.includes('denied')) {
      return 'permission-denied';
    }

    if (message.includes('timeout')) {
      return 'timeout';
    }

    if (message.includes('location') || message.includes('position unavailable')) {
      return 'location-off';
    }

    return 'unknown';
  }

  private getLocationErrorMessage(reason: LocationUnavailableReason): string {
    switch (reason) {
      case 'permission-denied':
        return 'Activa el permiso de ubicacion para filtrar pedidos cercanos.';
      case 'location-off':
        return 'Parece que la ubicacion del dispositivo esta apagada.';
      case 'timeout':
        return 'No pudimos obtener tu ubicacion a tiempo. Proba otra vez.';
      case 'unsupported':
        return 'Este dispositivo o navegador no permite usar ubicacion.';
      default:
        return 'No pudimos obtener tu ubicacion.';
    }
  }
}
