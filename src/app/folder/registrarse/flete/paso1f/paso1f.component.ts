import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MetodoRegistro, EstadoRegistro, datosVehiculo, provincias, tipoVehiculo, UserF } from 'src/app/folder/models/models';
import { AuthService } from 'src/app/folder/services/auth.service';
import { FirestoreService } from 'src/app/folder/services/firestore.service';
import { InteractionService } from 'src/app/folder/services/interaction.service';
import { LocationService } from 'src/app/folder/services/location.service';
import { take } from 'rxjs/operators';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-paso1f',
  templateUrl: './paso1f.component.html',
  styleUrls: ['./paso1f.component.scss'],
})
export class Paso1fComponent implements OnInit {
  private googleRedirectHandled = false;
  valueSelected: '1' | '2' | '3' = '1';
  step1Completed = false;
  step2Completed = false;
  isChecked = false;
  provincia = provincias;
  provinciaInterfaceOptions = {
    cssClass: 'tfy-province-popover',
  };
  vehiculo = tipoVehiculo;
  metodoRegistro: MetodoRegistro = 'email';

  registerF: UserF = {
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
    verificado: false,
    habilitado: false,
    perfil: 'Fletero',
    datosVehiculos: null,
    recomendacion: null,
    provincia: null,
    telefonoRespaldo: '',
    verificacionDni: {
      estado: 'pendiente',
      observacion: 'Pendiente de carga',
      revisadoPorAdmin: false,
      fechaCarga: null,
      fechaRevision: null,
    },
  };

  Datovehicular: datosVehiculo = {
    uid: null,
    tipoVehiculo: null,
    marca: null,
    ano: null,
    modelo: null,
    patente: '',
    imagePatente: null,
    imageDni: null,
    imageCarnet: null,
    imageDniDorzal: null,
    imageCarnetDorzal: null,
  };

  constructor(
    private router: Router,
    private authS: AuthService,
    private firestore: FirestoreService,
    private interaction: InteractionService,
    private locationService: LocationService
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
    this.firestore.getDoc<UserF>('Fleteros', uid).pipe(take(1)).subscribe((data) => {
      if (!data) {
        return;
      }

      this.registerF = {
        ...this.registerF,
        ...data,
      };

      if (data.estadoRegistro === 'vehiculo' || data.estadoRegistro === 'documentacion' || data.estadoRegistro === 'pendiente_revision' || data.estadoRegistro === 'completo') {
        this.step1Completed = true;
        this.valueSelected = '3';
        this.step2Completed = true;
      }
    });
  }

  private addDays(base: Date, days: number): Date {
    const result = new Date(base);
    result.setDate(result.getDate() + days);
    return result;
  }

  private async getCurrentUser() {
    return this.authS.getCurrentUser();
  }

  private async guardarBaseFletero(uid: string, data: {
    email?: string;
    provincia?: string | null;
    photoURL?: string;
    metodoRegistro: MetodoRegistro;
    estadoRegistro: EstadoRegistro;
    emailVerificado?: boolean;
    documentacionCompleta?: boolean;
    verificado?: boolean;
    habilitado?: boolean;
    bloqueadoPorSancion?: boolean;
    bloqueadoPorVencimiento?: boolean;
  }): Promise<void> {
    const fechaRegistro = new Date();
    const fechaVencimientoVerificacion = this.addDays(fechaRegistro, 15);

    await this.firestore.createDoc({
      uid,
      perfil: 'Fletero',
      email: data.email || '',
      telefono: '',
      provincia: data.provincia || null,
      photoURL: data.photoURL || '',
      metodoRegistro: data.metodoRegistro,
      estadoRegistro: data.estadoRegistro,
      fechaRegistro,
      fechaVencimientoVerificacion,
      emailVerificado: data.emailVerificado ?? false,
      telefonoVerificado: false,
      documentacionCompleta: data.documentacionCompleta ?? false,
      verificado: data.verificado ?? false,
      habilitado: data.habilitado ?? false,
      bloqueadoPorSancion: data.bloqueadoPorSancion ?? false,
      bloqueadoPorVencimiento: data.bloqueadoPorVencimiento ?? false,
      verificacionDni: {
        estado: 'pendiente',
        observacion: 'Pendiente de carga',
        revisadoPorAdmin: false,
        fechaCarga: null,
        fechaRevision: null,
      },
    }, 'Fleteros', uid);
  }

  volver(): void {
    this.router.navigate(['/registrarse']);
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

  btn3(): void {
    if (!this.canAccessStep('3')) {
      return;
    }
    this.valueSelected = '3';
  }

  canAccessStep(step: '1' | '2' | '3'): boolean {
    if (step === '1') {
      return true;
    }

    if (step === '2') {
      return this.step1Completed;
    }

    return this.step1Completed && this.step2Completed;
  }

  private async getRegistrationLocation(): Promise<{ latitude: number; longitude: number; accuracy: number; capturedAt: Date } | null> {
    return this.locationService.getCurrentLocation({
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 0,
    });
  }

  onPatenteInput(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const cleaned = (input?.value || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 7);

    this.Datovehicular.patente = cleaned;

    if (input) {
      input.value = cleaned;
    }
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
    if (perfil === 'Usuario') {
      return 'Ese correo ya está registrado como usuario.';
    }

    if (perfil === 'Fletero') {
      return 'Ese correo ya está registrado como fletero.';
    }

    return 'Ese correo ya está registrado.';
  }

  validateNombre(): boolean {
    return !!(this.registerF.nombre && this.registerF.nombre.length < 3);
  }

  validateApellido(): boolean {
    return !!(this.registerF.apellido && this.registerF.apellido.length < 3);
  }

  validateDNI(): boolean {
    const dniPattern = /^[0-9]{8}$/;
    return !dniPattern.test(this.registerF.dni);
  }

  validateDomicilio(): boolean {
    return !this.registerF.domicilio;
  }

  validateEdad(): boolean {
    const edad = Number(this.registerF.edad);
    return edad < 18 || edad > 65;
  }

  private validateVehicleStep(): boolean {
    return !this.Datovehicular.tipoVehiculo ||
      !this.Datovehicular.marca ||
      !this.Datovehicular.modelo ||
      !this.Datovehicular.ano ||
      !this.Datovehicular.patente ||
      this.validateTipoVehiculo() ||
      this.validateMarca() ||
      this.validateModelo() ||
      this.validateAno() ||
      this.validatePatente();
  }

  validateTipoVehiculo(): boolean {
    const allowedTypes = [
      'Camioneta',
      'Camion',
      'Grua',
      'Furgonetas',
      'Camiones frigoríficos',
      'Trailer',
      'Cisterna',
      'Portacontenedores',
      'Vehículo de carga pesada',
    ] as const;

    return !this.Datovehicular.tipoVehiculo || !allowedTypes.includes(this.Datovehicular.tipoVehiculo as any);
  }

  validateMarca(): boolean {
    return !this.Datovehicular.marca || this.Datovehicular.marca.trim() === '';
  }

  validateModelo(): boolean {
    return !this.Datovehicular.modelo || this.Datovehicular.modelo.trim() === '';
  }

  validateAno(): boolean {
    const ano = Number(this.Datovehicular.ano);
    const actual = new Date().getFullYear() + 1;
    return !ano || Number.isNaN(ano) || ano < 1900 || ano > actual;
  }

  validatePatente(): boolean {
    const patente = (this.Datovehicular.patente || '').toString().toUpperCase().trim();
    const patentePattern = /^[A-Z0-9]{6,7}$/;
    return !patentePattern.test(patente);
  }

  async siguiente(): Promise<void> {
    if (this.customEmailValidator(this.registerF.email)) {
      this.interaction.presentToast('El correo electrónico no es válido.');
      return;
    }

    if (this.customPasswordValidator(this.registerF.password)) {
      this.interaction.presentToast('La contraseña no cumple con los requisitos.');
      return;
    }

    await this.interaction.presentLoading('Creando tu cuenta...');

    try {
      await this.authS.registerF(this.registerF, false);
      const user = await this.getCurrentUser();

      if (user) {
        this.registerF.uid = user.uid;
        this.metodoRegistro = 'email';
        this.registerF.metodoRegistro = 'email';
        this.step1Completed = true;
        this.valueSelected = '2';
        this.interaction.presentToast('Cuenta creada. Completá tus datos personales.');
      } else {
        this.interaction.presentToast('No pudimos recuperar tu sesión.');
      }
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
      this.authS.setPendingGoogleRegistration('Fletero');
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

      const fleteroExistente = await firstValueFrom(
        this.firestore.getDoc<UserF>('Fleteros', user.uid).pipe(take(1))
      );

      if (fleteroExistente) {
        this.registerF = {
          ...this.registerF,
          ...fleteroExistente,
          uid: user.uid,
          email: user.email || fleteroExistente.email || this.registerF.email,
          image: user.photoURL || fleteroExistente.image || '',
        };
        this.metodoRegistro = (fleteroExistente.metodoRegistro as MetodoRegistro) || 'google';

        if (fleteroExistente.estadoRegistro === 'documentacion') {
          this.interaction.presentToast('Tu cuenta quedo pendiente de revision administrativa.');
          this.router.navigate(['/fletes/iniciarApp'], { replaceUrl: true });
          return;
        }

        if (fleteroExistente.estadoRegistro === 'pendiente_revision' || fleteroExistente.estadoRegistro === 'completo') {
          this.interaction.presentToast('Ya tenés cuenta registrada. Ingresando...');
          this.router.navigate(['/home', 'fletero'], { replaceUrl: true });
          return;
        }

        this.hydrateStepperState(user.uid);
        this.interaction.presentToast('Retomamos tu registro donde lo dejaste.');
        return;
      }

      const existing = await this.authS.findExistingProfileByEmail(user.email || '', user.uid);
      if (existing.exists) {
        await this.authS.signOutSilently();
        this.interaction.presentToast(this.getDuplicateEmailMessage(existing.perfil));
        return;
      }

      await this.guardarBaseFletero(user.uid, {
        email: (user.email || '').trim().toLowerCase(),
        photoURL: user.photoURL || '',
        provincia: this.registerF.provincia || null,
        metodoRegistro: 'google',
        estadoRegistro: 'auth',
        emailVerificado: user.emailVerified ?? true,
        verificado: false,
        habilitado: false,
        documentacionCompleta: false,
      });

      this.registerF.uid = user.uid;
      this.registerF.email = user.email || this.registerF.email;
      this.registerF.image = user.photoURL || '';
      this.metodoRegistro = 'google';
      this.registerF.metodoRegistro = 'google';
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

      const fleteroExistente = await firstValueFrom(
        this.firestore.getDoc<UserF>('Fleteros', user.uid).pipe(take(1))
      );

      if (fleteroExistente) {
        this.registerF = {
          ...this.registerF,
          ...fleteroExistente,
          uid: user.uid,
          email: user.email || fleteroExistente.email || this.registerF.email,
          image: user.photoURL || fleteroExistente.image || '',
        };
        this.metodoRegistro = (fleteroExistente.metodoRegistro as MetodoRegistro) || 'google';

        if (fleteroExistente.estadoRegistro === 'documentacion') {
          this.interaction.presentToast('Tu cuenta quedo pendiente de revision administrativa.');
          this.router.navigate(['/fletes/iniciarApp'], { replaceUrl: true });
          return;
        }

        if (fleteroExistente.estadoRegistro === 'pendiente_revision' || fleteroExistente.estadoRegistro === 'completo') {
          this.interaction.presentToast('Ya tenés cuenta registrada. Ingresando...');
          this.router.navigate(['/home', 'fletero'], { replaceUrl: true });
          return;
        }

        this.hydrateStepperState(user.uid);
        this.interaction.presentToast('Retomamos tu registro donde lo dejaste.');
        return;
      }

      const existing = await this.authS.findExistingProfileByEmail(user.email || '', user.uid);
      if (existing.exists) {
        await this.authS.signOutSilently();
        this.interaction.presentToast(this.getDuplicateEmailMessage(existing.perfil));
        return;
      }

      await this.guardarBaseFletero(user.uid, {
        email: (user.email || '').trim().toLowerCase(),
        photoURL: user.photoURL || '',
        provincia: this.registerF.provincia || null,
        metodoRegistro: 'google',
        estadoRegistro: 'auth',
        emailVerificado: user.emailVerified ?? true,
        verificado: false,
        habilitado: false,
        documentacionCompleta: false,
      });

      this.registerF.uid = user.uid;
      this.registerF.email = user.email || this.registerF.email;
      this.registerF.image = user.photoURL || '';
      this.metodoRegistro = 'google';
      this.registerF.metodoRegistro = 'google';
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

  async siguiente2(): Promise<void> {
    if (!this.isChecked) {
      this.interaction.presentToast('Aceptá los términos y condiciones para continuar.');
      return;
    }

    if (this.validateNombre()) {
      this.interaction.presentToast('El nombre no es válido.');
      return;
    }

    if (this.validateApellido()) {
      this.interaction.presentToast('El apellido no es válido.');
      return;
    }

    if (this.validateDNI()) {
      this.interaction.presentToast('El DNI no es válido.');
      return;
    }

    if (this.validateDomicilio()) {
      this.interaction.presentToast('El domicilio no puede estar vacío.');
      return;
    }

    if (this.validateEdad()) {
      this.interaction.presentToast('La edad no es válida.');
      return;
    }

    if (!this.registerF.provincia) {
      this.interaction.presentToast('Debe seleccionar una provincia.');
      return;
    }
    this.step2Completed = true;
    this.valueSelected = '3';
    this.interaction.presentToast('Perfecto. Ahora completá el vehículo para continuar.');
  }

  async enviarF(): Promise<void> {
    if (this.validateVehicleStep()) {
      this.interaction.presentToast('Completá correctamente los datos del vehículo.');
      return;
    }

    const user = await this.getCurrentUser();
    if (!user) {
      this.interaction.presentToast('No encontramos la sesión activa.');
      return;
    }

    await this.interaction.presentLoading('Guardando vehículo...');

    try {
      const ubicacionRegistro = await this.getRegistrationLocation();
      const patente = (this.Datovehicular.patente || '').toUpperCase().trim();
      const datosVehiculoNormalizado = {
        ...this.Datovehicular,
        uid: user.uid,
        patente,
      };

      const datosPersonales = {
        uid: user.uid,
        nombre: this.registerF.nombre,
        apellido: this.registerF.apellido,
        dni: this.registerF.dni,
        edad: this.registerF.edad,
        domicilio: this.registerF.domicilio,
        telefono: '',
        email: user.email || this.registerF.email || '',
        perfil: 'Fletero',
        provincia: this.registerF.provincia,
        image: user.photoURL || this.registerF.image || '',
        metodoRegistro: this.registerF.metodoRegistro || this.metodoRegistro || 'email',
        estadoRegistro: 'pendiente_revision',
        emailVerificado: user.emailVerified ?? false,
        verificado: false,
        habilitado: false,
        telefonoRespaldo: this.registerF.telefonoRespaldo || '',
        ubicacionRegistro,
        documentacionCompleta: false,
        verificacionDni: {
          estado: 'pendiente',
          observacion: 'Revision manual pendiente desde el panel admin',
          revisadoPorAdmin: false,
          fechaCarga: null,
          fechaRevision: null,
        },
      };
      const vehiculoPrincipalId = user.uid;

      await this.firestore.createDoc5(datosPersonales, 'Fleteros', user.uid);
      await this.firestore.createDoc({
        ...datosVehiculoNormalizado,
        id: vehiculoPrincipalId,
        principal: true,
        creadoEn: new Date(),
      }, `Fleteros/${user.uid}/Vehiculos`, vehiculoPrincipalId);

      await this.firestore.updateDoc('Fleteros', user.uid, {
        vehiculoPrincipalId,
        vehiculoPrincipalResumen: {
          tipoVehiculo: datosVehiculoNormalizado.tipoVehiculo,
          marca: datosVehiculoNormalizado.marca,
          modelo: datosVehiculoNormalizado.modelo,
          ano: datosVehiculoNormalizado.ano,
          patente: datosVehiculoNormalizado.patente,
        },
        estadoRegistro: 'pendiente_revision',
        verificado: false,
        habilitado: false,
        documentacionCompleta: false,
        verificacionDni: {
          estado: 'pendiente',
          observacion: 'Revision manual pendiente desde el panel admin',
          revisadoPorAdmin: false,
          fechaCarga: null,
          fechaRevision: null,
        },
      });

      this.interaction.presentToast('Registro enviado. Un administrador debe verificar y habilitar tu cuenta.');
      this.router.navigate(['/fletes/iniciarApp'], { replaceUrl: true });
    } catch (error) {
      console.error('Error guardando vehículo:', error);
      this.interaction.presentToast('No se pudo guardar el vehículo.');
    } finally {
      await this.interaction.closeLoading();
    }
  }
}

