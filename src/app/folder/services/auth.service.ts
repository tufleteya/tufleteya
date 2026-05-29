import { Injectable } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { AngularFireStorage } from '@angular/fire/compat/storage';
import { Router } from '@angular/router';
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import { EstadoRegistro, MetodoRegistro, datosVehiculo, UserF, UserU } from '../models/models';
import { InteractionService } from './interaction.service';
import { NotificacionesService } from './notificaciones.service';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { firstValueFrom, of } from 'rxjs';
import { catchError, filter, take, timeout } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  currentUserId: string; // Propiedad para almacenar el ID del usuario actual
  private webPersistenceReady = false;
  private readonly pendingGoogleRegistrationKey = 'tfy_pending_google_registration';

  constructor( private authS: AngularFireAuth,
               private interaction: InteractionService, 
               private router: Router,
              public fireStorage: AngularFireStorage,
               private firestore: AngularFirestore,
               private notificacionesService: NotificacionesService ) { }

  async login(email:string, password:string){
    await this.ensureWebAuthPersistence();
    const response = await this.authS.signInWithEmailAndPassword(this.normalizeEmail(email), password);
    const user = response.user;


    if (user?.uid) {
      await this.waitForAuthenticatedSession(user.uid);
      await this.syncEmailVerificationStatus(user.uid, Boolean(user.emailVerified));
    }

    return response;
  }
  updateCurrentUserId(userId: string) {
    this.currentUserId = userId;
  }
  async logout(){
    await this.notificacionesService.disableCurrentPushToken().catch((error) => {
      console.warn('No se pudo deshabilitar el token push actual al cerrar sesión:', error);
    });

    await this.signOutSilently();

    this.interaction.presentToast('Sesion finalizada...')
    this.router.navigate(['/login']);
  }

  async signOutSilently(): Promise<void> {
    await this.authS.signOut();

    if (Capacitor.isNativePlatform()) {
      try {
        await FirebaseAuthentication.signOut();
      } catch (error) {
        console.warn('No se pudo cerrar la sesión nativa de Firebase Authentication:', error);
      }
    }
  }

  async signInWithGoogle(): Promise<firebase.auth.UserCredential | null> {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    if (!Capacitor.isNativePlatform()) {
      await this.ensureWebAuthPersistence();

      if (this.isIOSWeb()) {
        await this.authS.signInWithRedirect(provider);
        return null;
      }

      try {
        const result = await this.authS.signInWithPopup(provider);
        await this.waitForAuthenticatedSession(result.user?.uid);
        return result;
      } catch (error) {
        if (!this.shouldUseRedirectFallback(error)) {
          throw error;
        }

        await this.authS.signInWithRedirect(provider);
        return null;
      }
    }

    const result = await FirebaseAuthentication.signInWithGoogle({
      scopes: ['email', 'profile'],
      skipNativeAuth: false,
    });

    const idToken = result.credential?.idToken;
    const accessToken = result.credential?.accessToken;

    if (!idToken) {
      throw new Error('google-native-missing-id-token');
    }

    const credential = firebase.auth.GoogleAuthProvider.credential(idToken, accessToken);
    const session = await this.authS.signInWithCredential(credential);
    await this.waitForAuthenticatedSession(session.user?.uid);
    return session;
  }

  async getGoogleRedirectResult(): Promise<firebase.auth.UserCredential | null> {
    if (Capacitor.isNativePlatform()) {
      return null;
    }

    await this.ensureWebAuthPersistence();
    const result = await this.authS.getRedirectResult();

    if (!result?.user?.uid) {
      return null;
    }

    await this.waitForAuthenticatedSession(result.user.uid);
    return result;
  }

  isGoogleSignInCancelled(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const message = `${(error as any)?.code || ''} ${error.message || ''}`.toLowerCase();

    return (
      message.includes('cancelled-popup-request') ||
      message.includes('popup-closed-by-user') ||
      message.includes('user-cancelled') ||
      message.includes('user cancelled') ||
      message.includes('canceled') ||
      message.includes('cancelled')
    );
  }

  private shouldUseRedirectFallback(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const message = `${(error as any)?.code || ''} ${error.message || ''}`.toLowerCase();

    return (
      message.includes('popup-blocked') ||
      message.includes('operation-not-supported-in-this-environment') ||
      message.includes('web-storage-unsupported') ||
      message.includes('redirect') ||
      message.includes('ios') ||
      message.includes('safari')
    );
  }

  private normalizeEmail(email: string): string {
    return (email || '').trim().toLowerCase();
  }

  private async ensureWebAuthPersistence(): Promise<void> {
    if (this.webPersistenceReady || Capacitor.isNativePlatform()) {
      return;
    }

    try {
      await this.authS.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    } catch (error) {
      console.warn('No se pudo usar persistencia LOCAL de Firebase Auth; usando SESSION:', error);
      await this.authS.setPersistence(firebase.auth.Auth.Persistence.SESSION);
    }

    this.webPersistenceReady = true;
  }

  setPendingGoogleRegistration(perfil: 'Usuario' | 'Fletero'): void {
    if (typeof sessionStorage === 'undefined') {
      return;
    }

    sessionStorage.setItem(this.pendingGoogleRegistrationKey, JSON.stringify({
      perfil,
      createdAt: Date.now(),
    }));
  }

  consumePendingGoogleRegistration(): 'Usuario' | 'Fletero' | null {
    if (typeof sessionStorage === 'undefined') {
      return null;
    }

    const raw = sessionStorage.getItem(this.pendingGoogleRegistrationKey);
    sessionStorage.removeItem(this.pendingGoogleRegistrationKey);

    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as { perfil?: string; createdAt?: number };
      const isFresh = typeof parsed.createdAt === 'number' && Date.now() - parsed.createdAt < 10 * 60 * 1000;
      const perfil = parsed.perfil === 'Usuario' || parsed.perfil === 'Fletero'
        ? parsed.perfil
        : null;

      return isFresh ? perfil : null;
    } catch {
      return null;
    }
  }

  clearPendingGoogleRegistration(): void {
    if (typeof sessionStorage === 'undefined') {
      return;
    }

    sessionStorage.removeItem(this.pendingGoogleRegistrationKey);
  }

  private isIOSWeb(): boolean {
    const userAgent = window.navigator.userAgent || '';
    const platform = window.navigator.platform || '';
    const maxTouchPoints = window.navigator.maxTouchPoints || 0;
    const isAppleMobilePlatform = /iPad|iPhone|iPod/.test(platform);
    const isIpadOSDesktopMode = platform === 'MacIntel' && maxTouchPoints > 1;

    return (
      (/iPad|iPhone|iPod/.test(userAgent) && isAppleMobilePlatform) ||
      isIpadOSDesktopMode
    );
  }

  private async waitForAuthenticatedSession(expectedUid?: string): Promise<void> {
    const targetUid = expectedUid?.trim();
    if (!targetUid) {
      return;
    }

    await firstValueFrom(
      this.authS.authState.pipe(
        filter((user): user is firebase.User => !!user && user.uid === targetUid),
        take(1),
        timeout(5000),
        catchError((error) => {
          console.warn('La sesión de AngularFireAuth tardó en sincronizarse con Google:', error);
          return of(null);
        })
      )
    );
  }

  async getCurrentUser(waitForSession = false): Promise<firebase.User | null> {
    const currentUser = await this.authS.currentUser;
    if (currentUser) {
      return currentUser;
    }

    if (!waitForSession) {
      return firstValueFrom(
        this.authS.authState.pipe(
          take(1),
          timeout(5000),
          catchError((error) => {
            console.warn('No se pudo recuperar la sesiÃ³n actual de AngularFireAuth:', error);
            return of(null);
          })
        )
      );
    }

    return firstValueFrom(
      this.authS.authState.pipe(
        filter((user): user is firebase.User => !!user),
        take(1),
        timeout(5000),
        catchError((error) => {
          console.warn('No se pudo recuperar la sesión actual de AngularFireAuth:', error);
          return of(null);
        })
      )
    );
  }

  async requireCurrentUser(): Promise<firebase.User> {
    const user = await this.getCurrentUser();
    if (!user) {
      throw new Error('auth-required-for-firestore-write');
    }

    await user.getIdToken();
    return user;
  }

  async findExistingProfileByEmail(
    email: string,
    exceptUid?: string
  ): Promise<{ exists: boolean; perfil?: 'Usuario' | 'Fletero'; uid?: string }> {
    const normalized = this.normalizeEmail(email);

    if (!normalized) {
      return { exists: false };
    }

    const [usuariosSnap, fleterosSnap] = await Promise.all([
      this.firestore.collection('Usuarios', ref => ref.where('email', '==', normalized).limit(1)).get().toPromise(),
      this.firestore.collection('Fleteros', ref => ref.where('email', '==', normalized).limit(1)).get().toPromise(),
    ]);

    const usuarioDoc = usuariosSnap?.docs?.[0];
    if (usuarioDoc && usuarioDoc.id !== exceptUid) {
      return { exists: true, perfil: 'Usuario', uid: usuarioDoc.id };
    }

    const fleteroDoc = fleterosSnap?.docs?.[0];
    if (fleteroDoc && fleteroDoc.id !== exceptUid) {
      return { exists: true, perfil: 'Fletero', uid: fleteroDoc.id };
    }

    return { exists: false };
  }

  async sendVerificationEmailToCurrentUser(): Promise<boolean> {
    const user = await this.authS.currentUser;

    if (!user) {
      return false;
    }

    await user.sendEmailVerification();
    return true;
  }

  private async syncEmailVerificationStatus(uid: string, emailVerificado: boolean): Promise<void> {
    const [usuarioDoc, fleteroDoc] = await Promise.all([
      this.firestore.collection('Usuarios').doc(uid).ref.get(),
      this.firestore.collection('Fleteros').doc(uid).ref.get(),
    ]);

    const updates: Promise<void>[] = [];

    if (usuarioDoc.exists) {
      updates.push(this.firestore.collection('Usuarios').doc(uid).set({ emailVerificado }, { merge: true }));
    }

    if (fleteroDoc.exists) {
      updates.push(this.firestore.collection('Fleteros').doc(uid).set({ emailVerificado }, { merge: true }));
    }

    await Promise.all(updates);
  }


  registerF(registerF: UserF, habilitado: boolean): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.findExistingProfileByEmail(registerF.email)
        .then((existing) => {
          if (existing.exists) {
            throw new Error(`duplicate-email:${existing.perfil}`);
          }

          return this.authS.createUserWithEmailAndPassword(this.normalizeEmail(registerF.email), registerF.password);
        })
        .then((result) => {
          const user = result.user;
          const fechaRegistro = new Date();
          user?.sendEmailVerification?.().catch((error) => {
            console.error('No se pudo enviar el correo de verificación del fletero:', error);
          });
  
          // Guardar email y contraseña en Firestore
          const collectionRef = this.firestore.collection('Fleteros');
          const docRef = collectionRef.doc(user.uid); // Utiliza el UID del usuario como ID del documento
          docRef.set({
            uid: user.uid,
            habilitado: habilitado,
            email: this.normalizeEmail(registerF.email),
            telefono: registerF.telefono || '',
            provincia: registerF.provincia || null,
            perfil: 'Fletero',
            metodoRegistro: 'email',
            estadoRegistro: 'auth',
            fechaRegistro,
            fechaVencimientoVerificacion: this.addDays(fechaRegistro, 15),
            emailVerificado: user.emailVerified ?? false,
            telefonoVerificado: false,
            documentacionCompleta: false,
            verificado: false,
            bloqueadoPorSancion: false,
            bloqueadoPorVencimiento: false,
            verificacionDni: {
              estado: 'pendiente',
              observacion: 'Pendiente de carga',
              revisadoPorAdmin: false,
              fechaCarga: null,
              fechaRevision: null,
            }
            // Otras propiedades que desees guardar
          }).then(() => {
            resolve(); // Resuelve la promesa una vez que se haya completado todo
          }).catch((error) => {
            reject(error); // Rechaza la promesa en caso de error en Firestore
          });
        })
        .catch((error) => {
          reject(error); // Rechaza la promesa en caso de error en createUserWithEmailAndPassword
        });
    });
  }



  registerU(registerU: UserU): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.findExistingProfileByEmail(registerU.email)
        .then((existing) => {
          if (existing.exists) {
            throw new Error(`duplicate-email:${existing.perfil}`);
          }

          return this.authS.createUserWithEmailAndPassword(this.normalizeEmail(registerU.email), registerU.password);
        })
        .then((result) => {
          const user = result.user;
          const fechaRegistro = new Date();
          user?.sendEmailVerification?.().catch((error) => {
            console.error('No se pudo enviar el correo de verificación del usuario:', error);
          });
  
          // Guardar email y contraseña en Firestore
          const collectionRef = this.firestore.collection('Usuarios');
          const docRef = collectionRef.doc(user.uid); // Utiliza el UID del usuario como ID del documento
          docRef.set({
            uid: user.uid,
            email: this.normalizeEmail(registerU.email),
            telefono: registerU.telefono || '',
            provincia: registerU.provincia || null,
            perfil: 'Usuario',
            metodoRegistro: 'email',
            estadoRegistro: 'auth',
            fechaRegistro,
            emailVerificado: user.emailVerified ?? false,
            telefonoVerificado: false,
            documentacionCompleta: false,
            // Otras propiedades que desees guardar
          }).then(() => {
            resolve(); // Resuelve la promesa una vez que se haya completado todo
          }).catch((error) => {
            reject(error); // Rechaza la promesa en caso de error en Firestore
          });
        })
        .catch((error) => {
          reject(error); // Rechaza la promesa en caso de error en createUserWithEmailAndPassword
        });
    });
  }

  async guardarBaseUsuario(uid: string, data: Partial<UserU> & {
    metodoRegistro?: MetodoRegistro;
    estadoRegistro?: EstadoRegistro;
  }): Promise<void> {
    const fechaRegistro = data.fechaRegistro ? new Date(data.fechaRegistro as any) : new Date();

    await this.firestore.collection('Usuarios').doc(uid).set({
      uid,
      perfil: 'Usuario',
      email: data.email || '',
      telefono: data.telefono || '',
      provincia: data.provincia || null,
      photoURL: data.photoURL || '',
      metodoRegistro: data.metodoRegistro || 'google',
      estadoRegistro: data.estadoRegistro || 'auth',
      fechaRegistro,
      emailVerificado: data.emailVerificado ?? false,
      telefonoVerificado: data.telefonoVerificado ?? false,
      documentacionCompleta: data.documentacionCompleta ?? false,
    }, { merge: true });
  }

  async guardarBaseFletero(uid: string, data: Partial<UserF> & {
    metodoRegistro?: MetodoRegistro;
    estadoRegistro?: EstadoRegistro;
  }): Promise<void> {
    const fechaRegistro = data.fechaRegistro ? new Date(data.fechaRegistro as any) : new Date();
    const fechaVencimientoVerificacion = data.fechaVencimientoVerificacion
      ? new Date(data.fechaVencimientoVerificacion as any)
      : this.addDays(fechaRegistro, 15);

    await this.firestore.collection('Fleteros').doc(uid).set({
      uid,
      perfil: 'Fletero',
      email: data.email || '',
      telefono: data.telefono || '',
      provincia: data.provincia || null,
      photoURL: data.photoURL || '',
      metodoRegistro: data.metodoRegistro || 'google',
      estadoRegistro: data.estadoRegistro || 'auth',
      fechaRegistro,
      fechaVencimientoVerificacion,
      emailVerificado: data.emailVerificado ?? false,
      telefonoVerificado: data.telefonoVerificado ?? false,
      documentacionCompleta: data.documentacionCompleta ?? false,
      habilitado: data.habilitado ?? false,
      verificado: data.verificado ?? false,
      bloqueadoPorSancion: data.bloqueadoPorSancion ?? false,
      bloqueadoPorVencimiento: data.bloqueadoPorVencimiento ?? false,
      verificacionDni: data.verificacionDni ?? {
        estado: 'pendiente',
        observacion: 'Pendiente de carga',
        revisadoPorAdmin: false,
        fechaCarga: null,
        fechaRevision: null,
      },
    }, { merge: true });
  }






  stateUser<tipo>(){
    return this.authS.authState
  }

  getCollection<UserU>(path: string, id:string) {

    const collection = this.firestore.collection<UserU>(path);
    return collection.valueChanges();

  }


  private saveEmailToFirestore(email: string) {
    // Puedes ajustar el nombre de la colección y el ID del documento según tus necesidades
    const collectionName = 'Usuarios';
    const docId = email; // Usar el correo electrónico como ID del documento

    this.firestore
      .collection(collectionName)
      .doc(docId)
      .set({ email }, { merge: true }) // Usar { merge: true } para actualizar el documento sin sobrescribirlo si ya existe
      .then(() => {
        console.log('Correo electrónico guardado en Firestore');
      })
      .catch((error) => {
        console.error('Error al guardar el correo electrónico en Firestore:', error);
      });
  }



  isLoggedIn() {
    // Implementa lógica para verificar si el usuario está autenticado, por ejemplo, utilizando AngularFireAuth.
    // Retorna true si el usuario está autenticado, de lo contrario, false.
    return this.authS.authState !== null;
  }

  async getUserToken() {
    // Implementa lógica para obtener el token del usuario autenticado, si es necesario.
    // Esto dependerá de tu sistema de autenticación y de cómo almacenas y obtienes el token.
    // Puedes retornar el token del usuario si está autenticado, o null si no lo está.
    // Por ejemplo:
    const user = await this.authS.currentUser;
    if (user) {
      const token = await user.getIdToken();
      return token;
    } else {
      return null;
    }
  }

  private addDays(base: Date, days: number): Date {
    const result = new Date(base);
    result.setDate(result.getDate() + days);
    return result;
  }


}
