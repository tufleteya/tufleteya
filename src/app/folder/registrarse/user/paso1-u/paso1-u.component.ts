import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MetodoRegistro, provincias, UserU } from 'src/app/folder/models/models';
import { AuthService } from 'src/app/folder/services/auth.service';
import { FirestoreService } from 'src/app/folder/services/firestore.service';
import { InteractionService } from 'src/app/folder/services/interaction.service';
import { LocationService } from 'src/app/folder/services/location.service';
import { RoleResolverService } from 'src/app/folder/services/role-resolver.service';
import { take } from 'rxjs/operators';

@Component({
  selector: 'app-paso1-u',
  templateUrl: './paso1-u.component.html',
  styleUrls: ['./paso1-u.component.scss'],
})
export class Paso1UComponent implements OnInit {
  private googleRedirectHandled = false;
  valueSelected: '1' | '2' = '1';
  step1Completed = false;
  isChecked = false;
  provincia = provincias;
  provinciaInterfaceOptions = {
    cssClass: 'tfy-province-popover',
  };
  metodoRegistro: MetodoRegistro = 'email';

  registerU: UserU = {
    uid: null,
    nombre: null,
    apellido: null,
    dni: null,
    edad: null,
    domicilio: null,
    telefono: '',
    image: null,
    email: null,
    password: null,
    perfil: 'Usuario',
    provincia: null,
    telefonoRespaldo: '',
  };

  constructor(
    private routes: Router,
    private authS: AuthService,
    private interaction: InteractionService,
    private firestore: FirestoreService,
    private locationService: LocationService,
    private roleResolverService: RoleResolverService,
    private router: Router
  ) {}

  ngOnInit(): void {
    void this.handleGoogleRedirectResult();
    void this.restoreCurrentSession();
  }

  private async restoreCurrentSession(): Promise<void> {
    const user = await this.authS.getCurrentUser();
    if (user?.uid) {
      this.hydrateStepperState(user.uid);
      return;
    }

    this.authS.stateUser().pipe(take(1)).subscribe((sessionUser: any) => {
      if (!sessionUser?.uid) {
        return;
      }

      this.hydrateStepperState(sessionUser.uid);
    });
  }

  private hydrateStepperState(uid: string): void {
    this.step1Completed = true;
    this.valueSelected = '2';
    this.firestore.getDoc<UserU>('Usuarios', uid).pipe(take(1)).subscribe((data) => {
      if (!data) {
        return;
      }

      this.registerU = {
        ...this.registerU,
        ...data,
      };

      if (data.metodoRegistro) {
        this.metodoRegistro = data.metodoRegistro;
      }

      if (data.estadoRegistro === 'auth' || data.estadoRegistro === 'completo') {
        this.valueSelected = '2';
      }
    });
  }

  volver(): void {
    this.routes.navigate(['/registrarse']);
  }

  btn1(): void {
    this.valueSelected = '1';
  }

  btn2(): void {
    if (!this.canAccessStep('2')) {
      return;
    }
    this.valueSelected = '2';
  }

  canAccessStep(step: '1' | '2'): boolean {
    if (step === '1') {
      return true;
    }

    return this.step1Completed;
  }

  private async getRegistrationLocation(): Promise<{ latitude: number; longitude: number; accuracy: number; capturedAt: Date } | null> {
    return this.locationService.getCurrentLocation({
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 0,
    });
  }

  customEmailValidator(value: string): { [key: string]: any } | null {
    if (!value || !value.includes('@') || (!value.includes('.com') && !value.includes('.'))) {
      return { customEmailError: true };
    }
    return null;
  }

  customPasswordValidator(value: string): { [key: string]: any } | null {
    if (!value || value.length < 8 || !/[A-Z]/.test(value)) {
      return { customPasswordError: true };
    }
    return null;
  }

  private getDuplicateEmailMessage(perfil?: string): string {
    if (perfil === 'Fletero') {
      return 'Ese correo ya está registrado como fletero.';
    }

    if (perfil === 'Usuario') {
      return 'Ese correo ya está registrado como usuario.';
    }

    return 'Ese correo ya está registrado.';
  }

  async siguiente(): Promise<void> {
    if (this.customEmailValidator(this.registerU.email)) {
      this.interaction.presentToast('El correo electrónico no es válido.');
      return;
    }

    if (this.customPasswordValidator(this.registerU.password)) {
      this.interaction.presentToast('La contraseña no cumple con los requisitos.');
      return;
    }

    await this.crearCuentaEmail();
  }

  private async crearCuentaEmail(): Promise<void> {
    await this.interaction.presentLoading('Creando tu cuenta...');

    try {
      await this.authS.registerU(this.registerU);
      const user = await this.authS.getCurrentUser();

      this.metodoRegistro = 'email';
      this.registerU.metodoRegistro = 'email';
      this.roleResolverService.clearPerfilCache(user?.uid);
      this.step1Completed = true;
      this.valueSelected = '2';
      this.interaction.presentToast('Cuenta creada. Te enviamos un correo de verificación; completá tus datos personales.');
    } catch (error) {
      console.error(error);
      const code = error instanceof Error ? error.message : '';
      if (code.startsWith('duplicate-email:')) {
        this.interaction.presentToast(this.getDuplicateEmailMessage(code.split(':')[1]));
      } else {
        this.interaction.presentToast('No se pudo crear la cuenta.');
      }
    } finally {
      await this.interaction.closeLoading();
    }
  }

  async signInWithGoogle(): Promise<void> {
    let shouldClearPendingRegistration = true;

    try {
      await this.interaction.presentLoading('Vinculando Google...');
      this.authS.setPendingGoogleRegistration('Usuario');
      const result = await this.authS.signInWithGoogle();
      const user = result?.user;
      if (!user?.uid) {
        shouldClearPendingRegistration = false;
        return;
      }
      const continuar = await this.interaction.presentAlert(
        'Confirmar inicio de sesión',
        `¿Deseas continuar con la cuenta ${user.email || 'de Google'}?`
      );

      if (!continuar) {
        await this.authS.signOutSilently();
        return;
      }

      const existing = await this.authS.findExistingProfileByEmail(user.email || '', user.uid);
      if (existing.exists) {
        await this.authS.signOutSilently();
        this.interaction.presentToast(this.getDuplicateEmailMessage(existing.perfil));
        return;
      }

      await this.firestore.createDoc({
        uid: user.uid,
        email: (user.email || '').trim().toLowerCase(),
        telefono: '',
        perfil: 'Usuario',
        photoURL: user.photoURL || '',
        metodoRegistro: 'google',
        estadoRegistro: 'auth',
        fechaRegistro: new Date(),
        emailVerificado: user.emailVerified ?? true,
      }, 'Usuarios', user.uid);

      this.registerU.email = user.email || this.registerU.email;
      this.registerU.image = user.photoURL || '';
      this.metodoRegistro = 'google';
      this.registerU.metodoRegistro = 'google';
      this.registerU.uid = user.uid;
      this.roleResolverService.clearPerfilCache(user.uid);
      this.step1Completed = true;
      this.valueSelected = '2';
      this.interaction.presentToast('Cuenta Google vinculada. Completá tus datos personales.');
    } catch (error) {
      shouldClearPendingRegistration = true;
      console.error('Error al iniciar sesión con Google:', error);
      this.interaction.presentToast('No se pudo iniciar sesión con Google.');
    } finally {
      if (shouldClearPendingRegistration) {
        this.authS.clearPendingGoogleRegistration();
      }
      await this.interaction.closeLoading();
    }
  }

  private async handleGoogleRedirectResult(): Promise<void> {
    if (this.googleRedirectHandled) {
      return;
    }

    this.googleRedirectHandled = true;
    let handledRedirectResult = false;

    try {
      const result = await this.authS.getGoogleRedirectResult();
      const user = result?.user;
      if (!user?.uid) {
        return;
      }
      handledRedirectResult = true;

      await this.interaction.presentLoading('Completando vinculación con Google...');

      const continuar = await this.interaction.presentAlert(
        'Confirmar inicio de sesión',
        `¿Deseas continuar con la cuenta ${user.email || 'de Google'}?`
      );

      if (!continuar) {
        await this.authS.signOutSilently();
        return;
      }

      const existing = await this.authS.findExistingProfileByEmail(user.email || '', user.uid);
      if (existing.exists) {
        await this.authS.signOutSilently();
        this.interaction.presentToast(this.getDuplicateEmailMessage(existing.perfil));
        return;
      }

      await this.firestore.createDoc({
        uid: user.uid,
        email: (user.email || '').trim().toLowerCase(),
        telefono: '',
        perfil: 'Usuario',
        photoURL: user.photoURL || '',
        metodoRegistro: 'google',
        estadoRegistro: 'auth',
        fechaRegistro: new Date(),
        emailVerificado: user.emailVerified ?? true,
      }, 'Usuarios', user.uid);

      this.registerU.email = user.email || this.registerU.email;
      this.registerU.image = user.photoURL || '';
      this.metodoRegistro = 'google';
      this.registerU.metodoRegistro = 'google';
      this.registerU.uid = user.uid;
      this.roleResolverService.clearPerfilCache(user.uid);
      this.step1Completed = true;
      this.valueSelected = '2';
      this.interaction.presentToast('Cuenta Google vinculada. Completá tus datos personales.');
    } catch (error) {
      console.error('Error recuperando redirect de Google:', error);
      this.interaction.presentToast('No se pudo completar el inicio con Google.');
    } finally {
      if (handledRedirectResult) {
        this.authS.clearPendingGoogleRegistration();
      }
      await this.interaction.closeLoading();
    }
  }

  async enviar(): Promise<void> {
    if (!this.isChecked) {
      this.interaction.presentToast('Aceptá los términos y condiciones para finalizar el registro.');
      return;
    }

    await this.interaction.presentLoading('Guardando tus datos...');

    try {
      if (this.validateNombre()) {
        throw new Error('nombre');
      }
      if (this.validateApellido()) {
        throw new Error('apellido');
      }
      if (this.validateDNI()) {
        throw new Error('dni');
      }
      if (this.validateDomicilio()) {
        throw new Error('domicilio');
      }
      if (this.validateEdad()) {
        throw new Error('edad');
      }
      if (!this.registerU.provincia) {
        throw new Error('provincia');
      }

      const user = await this.authS.getCurrentUser();
      if (!user) {
        this.interaction.presentToast('No encontramos la sesión activa.');
        return;
      }

      const ubicacionRegistro = await this.getRegistrationLocation();

      const datosPersonales = {
        uid: user.uid,
        nombre: this.registerU.nombre,
        apellido: this.registerU.apellido,
        dni: this.registerU.dni,
        edad: this.registerU.edad,
        domicilio: this.registerU.domicilio,
        telefono: '',
        email: user.email || this.registerU.email || '',
        perfil: 'Usuario',
        provincia: this.registerU.provincia,
        image: user.photoURL || this.registerU.image || '',
        metodoRegistro: this.registerU.metodoRegistro || this.metodoRegistro || 'email',
        estadoRegistro: 'completo',
        emailVerificado: user.emailVerified ?? false,
        telefonoRespaldo: this.registerU.telefonoRespaldo || '',
        ubicacionRegistro,
      };

      await this.firestore.createDoc({
        ...datosPersonales,
        fechaRegistro: new Date(),
      }, 'Usuarios', user.uid);

      this.roleResolverService.clearPerfilCache(user.uid);

      this.interaction.presentToast('Registrado con éxito');
      this.router.navigate(['/home', 'usuario'], { replaceUrl: true });
    } catch (error) {
      if (error instanceof Error) {
        const mensaje =
          error.message === 'nombre' ? 'El nombre no es válido.' :
          error.message === 'apellido' ? 'El apellido no es válido.' :
          error.message === 'dni' ? 'El DNI no es válido.' :
          error.message === 'domicilio' ? 'El domicilio no puede estar vacío.' :
          error.message === 'edad' ? 'La edad no es válida.' :
          error.message === 'provincia' ? 'Debe seleccionar una provincia.' :
          'No se pudo completar el registro.';
        this.interaction.presentToast(mensaje);
      } else {
        this.interaction.presentToast('No se pudo completar el registro.');
      }
    } finally {
      await this.interaction.closeLoading();
    }
  }

  validateNombre(): boolean {
    return !!(this.registerU.nombre && this.registerU.nombre.length < 3);
  }

  validateApellido(): boolean {
    return !!(this.registerU.apellido && this.registerU.apellido.length < 3);
  }

  validateDNI(): boolean {
    const dniPattern = /^[0-9]{8}$/;
    return !dniPattern.test(this.registerU.dni);
  }

  validateDomicilio(): boolean {
    return !this.registerU.domicilio;
  }

  validateEdad(): boolean {
    const edad = Number(this.registerU.edad);
    return edad < 18 || edad > 65;
  }
}

