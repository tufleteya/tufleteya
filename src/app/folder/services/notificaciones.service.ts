import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Router } from '@angular/router';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import {
  FirebaseMessaging,
  NotificationActionPerformedEvent,
  NotificationReceivedEvent,
} from '@capacitor-firebase/messaging';
import { getApp, getApps } from 'firebase/app';
import {
  MessagePayload,
  deleteToken,
  getMessaging,
  getToken,
  isSupported,
  onMessage,
} from 'firebase/messaging';
import { BehaviorSubject } from 'rxjs';
import { environment } from 'src/environments/environment';
import { PerfilApp } from '../models/models';

export type PushDebugEvent = {
  stage: string;
  message: string;
  url?: string;
  payload?: unknown;
  timestamp: string;
};

@Injectable({
  providedIn: 'root'
})
export class NotificacionesService {
  private foregroundListenerInitialized = false;
  private nativeListenersInitialized = false;
  private nativeListenerHandles: PluginListenerHandle[] = [];
  private lastInitKey = '';
  private currentPushToken: string | null = null;
  private readonly pushDebugSubject = new BehaviorSubject<PushDebugEvent | null>(null);
  readonly pushDebug$ = this.pushDebugSubject.asObservable();

  constructor(
    private firestore: AngularFirestore,
    private router: Router,
  ) {}

  async initPushForUser(uid: string, perfil: PerfilApp | null): Promise<void> {
    try {
      if (!uid || !perfil) {
        return;
      }

      const initKey = `${uid}:${perfil}`;
      if (this.lastInitKey === initKey) {
        this.emitDebug('init-cache', 'Push ya inicializada para este usuario.', undefined, { uid, perfil });
        return;
      }

      if (Capacitor.isNativePlatform()) {
        await this.initNativePush(uid, perfil);
      } else {
        await this.initWebPush(uid, perfil);
      }

      this.lastInitKey = initKey;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido al inicializar push.';
      console.error('FCM init error:', error);
      this.emitDebug('init-error', message, undefined, error);
    }
  }

  async disableCurrentPushToken(): Promise<void> {
    if (!this.currentPushToken) {
      return;
    }

    const token = this.currentPushToken;
    this.currentPushToken = null;
    this.lastInitKey = '';

    try {
      await this.firestore.collection('PushSubscriptions').doc(encodeURIComponent(token)).set({
        enabled: false,
        updatedAt: new Date(),
      }, { merge: true });

      if (Capacitor.isNativePlatform()) {
        await FirebaseMessaging.deleteToken().catch((error) => {
          console.warn('No se pudo eliminar el token nativo de push:', error);
        });
      } else {
        const app = getApps().length ? getApp() : undefined;
        if (app) {
          const messaging = getMessaging(app);
          await deleteToken(messaging).catch((error) => {
            console.warn('No se pudo eliminar el token web de push:', error);
          });
        }
      }

      this.emitDebug('token-disabled', 'Token de push deshabilitado al cerrar sesión.');
    } catch (error) {
      console.error('No se pudo deshabilitar el token actual:', error);
      this.emitDebug('token-disable-error', 'No se pudo deshabilitar el token actual.', undefined, error);
    }
  }

  clearDebugEvent(): void {
    this.pushDebugSubject.next(null);
  }

  private async initNativePush(uid: string, perfil: PerfilApp): Promise<void> {
    const supported = await FirebaseMessaging.isSupported().catch(() => ({ isSupported: false }));
    if (!supported.isSupported) {
      this.emitDebug('native-unsupported', 'Firebase Messaging no está soportado en esta plataforma.');
      return;
    }

    const permissions = await FirebaseMessaging.checkPermissions();
    const receivePermission = permissions.receive === 'granted'
      ? permissions
      : await FirebaseMessaging.requestPermissions();

    if (receivePermission.receive !== 'granted') {
      this.emitDebug('native-permission-denied', `Permiso de notificaciones: ${receivePermission.receive}`);
      return;
    }

    await this.ensureNativeListeners();

    const result = await FirebaseMessaging.getToken();
    if (!result?.token) {
      this.emitDebug('native-token-empty', 'No se pudo obtener token FCM nativo.');
      return;
    }

    await this.saveTokenRegistration(result.token, uid, perfil, this.getNativePlatform());
    this.emitDebug('native-token-registered', 'Token FCM nativo registrado en Firestore.', undefined, {
      uid,
      perfil,
      tokenPreview: `${result.token.slice(0, 14)}...`,
      platform: Capacitor.getPlatform(),
    });
  }

  private async initWebPush(uid: string, perfil: PerfilApp): Promise<void> {
    const supportsMessaging = await isSupported().catch(() => false);
    if (!supportsMessaging || typeof window === 'undefined' || !('Notification' in window)) {
      this.emitDebug('init-unsupported', 'El navegador no soporta Firebase Messaging.');
      return;
    }

    if (!window.isSecureContext) {
      this.emitDebug('init-insecure-context', 'Push web requiere HTTPS o localhost.');
      return;
    }

    if (!('serviceWorker' in navigator)) {
      this.emitDebug('init-no-sw-support', 'El navegador no soporta Service Workers.');
      return;
    }

    if (!environment.fcmVapidKey) {
      console.warn('FCM no configurado: falta environment.fcmVapidKey');
      this.emitDebug('init-missing-vapid', 'Falta fcmVapidKey en environment.');
      return;
    }

    if (!this.isValidVapidPublicKey(environment.fcmVapidKey)) {
      this.emitDebug('init-invalid-vapid', 'La fcmVapidKey es invalida o esta incompleta.');
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      this.emitDebug('permission-denied', `Permiso de notificaciones: ${permission}`);
      return;
    }

    const app = getApps().length ? getApp() : undefined;
    if (!app) {
      this.emitDebug('init-no-app', 'Firebase App no inicializada.');
      return;
    }

    const existingRegistration = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
    const registration = existingRegistration || await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    await navigator.serviceWorker.ready;
    await registration.update();
    if (!registration.active) {
      this.emitDebug('sw-not-active', 'Service Worker registrado pero aun no activo.');
      return;
    }

    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey: environment.fcmVapidKey,
      serviceWorkerRegistration: registration,
    });

    if (!token) {
      this.emitDebug('token-empty', 'No se pudo obtener token FCM.');
      return;
    }

    await this.saveTokenRegistration(token, uid, perfil, 'web');
    this.ensureForegroundListener(messaging);
    this.emitDebug('token-registered', 'Token FCM web registrado en Firestore.', undefined, {
      uid,
      perfil,
      tokenPreview: `${token.slice(0, 14)}...`,
    });
  }

  private async saveTokenRegistration(
    token: string,
    uid: string,
    perfil: PerfilApp,
    platform: 'web' | 'android' | 'ios'
  ): Promise<void> {
    this.currentPushToken = token;

    const payload = {
      uid,
      perfil,
      token,
      enabled: true,
      platform,
      userAgent: typeof navigator !== 'undefined' ? (navigator.userAgent || '') : '',
      updatedAt: new Date(),
      createdAt: new Date(),
    };

    await this.firestore.collection('PushSubscriptions').doc(encodeURIComponent(token)).set(payload, { merge: true });
  }

  private getNativePlatform(): 'android' | 'ios' {
    return Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';
  }

  private async ensureNativeListeners(): Promise<void> {
    if (this.nativeListenersInitialized) {
      return;
    }

    const handles = await Promise.all([
      FirebaseMessaging.addListener('tokenReceived', async (event) => {
        this.currentPushToken = event.token;
        this.emitDebug('native-token-received', 'Se recibió un nuevo token FCM nativo.', undefined, event);
      }),
      FirebaseMessaging.addListener('notificationReceived', (event: NotificationReceivedEvent) => {
        const title = event.notification?.title || 'TuFleteYa';
        const body = event.notification?.body || 'Tienes una actualización de tu viaje.';
        const url = this.extractNotificationUrl(event.notification?.data);
        this.emitDebug('native-foreground-received', `${title} - ${body}`, url, event);
      }),
      FirebaseMessaging.addListener('notificationActionPerformed', (event: NotificationActionPerformedEvent) => {
        const url = this.extractNotificationUrl(event.notification?.data);
        this.emitDebug('native-action', 'Se abrió una notificación nativa.', url, event);

        if (url) {
          void this.router.navigateByUrl(url);
        }
      }),
    ]);

    this.nativeListenerHandles = handles;
    this.nativeListenersInitialized = true;
  }

  private ensureForegroundListener(messaging: ReturnType<typeof getMessaging>): void {
    if (this.foregroundListenerInitialized) {
      return;
    }

    onMessage(messaging, (payload: MessagePayload) => {
      const title = payload.notification?.title || 'TuFleteYa';
      const body = payload.notification?.body || 'Tienes una actualizacion de tu viaje.';
      const url = (payload.data?.url || '').toString();
      this.emitDebug('foreground-received', `${title} - ${body}`, url, payload);

      if (Notification.permission === 'granted') {
        const notification = new Notification(title, { body });
        notification.onclick = () => {
          this.emitDebug('foreground-click', 'Click en notificacion foreground.', url, payload);
          if (url) {
            void this.router.navigateByUrl(url);
            if (typeof window !== 'undefined' && typeof window.focus === 'function') {
              window.focus();
            }
            notification.close();
            this.emitDebug('foreground-navigate', 'Navegacion realizada por click foreground.', url, payload);
          }
        };
      }
    });

    this.foregroundListenerInitialized = true;
  }

  private extractNotificationUrl(data: unknown): string | undefined {
    if (!data || typeof data !== 'object') {
      return undefined;
    }

    const rawUrl = (data as Record<string, unknown>)['url'];
    return typeof rawUrl === 'string' && rawUrl.trim() ? rawUrl : undefined;
  }

  private emitDebug(stage: string, message: string, url?: string, payload?: unknown): void {
    this.pushDebugSubject.next({
      stage,
      message,
      url,
      payload,
      timestamp: new Date().toISOString(),
    });
  }

  private isValidVapidPublicKey(key: string): boolean {
    if (!/^[A-Za-z0-9_-]+$/.test(key)) {
      return false;
    }

    try {
      const normalized = key.replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
      const decoded = atob(padded);

      return decoded.length === 65 && decoded.charCodeAt(0) === 4;
    } catch {
      return false;
    }
  }
}
