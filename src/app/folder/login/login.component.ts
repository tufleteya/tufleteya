import { Component, NgZone, OnInit } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { InteractionService } from '../services/interaction.service';
import { FirestoreService } from '../services/firestore.service';
import { firstValueFrom, of } from 'rxjs';
import { catchError, filter, take, timeout } from 'rxjs/operators';
import { RoleResolverService } from '../services/role-resolver.service';
import { UserF, UserU } from '../models/models';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent implements OnInit {
  private googleRedirectHandled = false;
  googleLoading = false;

  credenciales = {
    email: '',
    password: '',
  };

  recordarContrasena = false;

  constructor(
    private authService: AuthService,
    private interaction: InteractionService,
    private router: Router,
    private firestore: FirestoreService,
    private roleResolverService: RoleResolverService,
    private ngZone: NgZone
  ) {}

  ngOnInit(): void {
    const savedEmail = localStorage.getItem('email');

    if (savedEmail) {
      this.credenciales.email = savedEmail;
      this.recordarContrasena = true;
    }

    void this.initializeLoginSession();
  }

  async login(): Promise<void> {
    if (this.googleLoading) {
      return;
    }

    await this.interaction.presentLoading('Ingresando...');

    try {
      const res = await this.authService.login(this.credenciales.email, this.credenciales.password);
      if (!res) {
        throw new Error('Credenciales inválidas');
      }

      if (this.recordarContrasena) {
        localStorage.setItem('email', this.credenciales.email);
      } else {
        localStorage.removeItem('email');
      }

      await this.interaction.closeLoading();
      this.interaction.presentToast('Ingresado con éxito');
      if (res.user?.uid) {
        await this.checkUserType(res.user.uid, res.user.email || '', res.user);
      } else {
        await this.router.navigate(['/login'], { replaceUrl: true });
      }
    } catch (error) {
      console.error(error);
      await this.interaction.closeLoading();
      this.interaction.presentToast('Usuario o contraseña inválidos');
    }
  }

  toggleRecordarContrasena(checked: boolean): void {
    this.recordarContrasena = checked;
  }

  async signInWithGoogle(): Promise<void> {
    if (this.googleLoading) {
      return;
    }

    let navigationDone: Promise<void> | null = null;
    this.googleLoading = true;

    try {
      await this.interaction.presentLoading('Ingresando con Google...');
      const result = await this.authService.signInWithGoogle();
      if (!result) {
        return;
      }

      const user = result.user;
      if (!user?.uid) {
        return;
      }

      navigationDone = this.waitForNavigationToSettle();
      await this.checkUserType(user.uid, user.email || '', user);
    } catch (error: any) {
      if (this.authService.isGoogleSignInCancelled(error)) {
        console.log('El popup fue cerrado antes de completar el inicio de sesión');
      } else {
        console.error('Error al iniciar sesión con Google:', error);
        this.interaction.presentToast('Error con el inicio de sesión de Google');
      }
    } finally {
      if (navigationDone) {
        await navigationDone;
      }

      await this.interaction.closeLoading();
      this.googleLoading = false;
    }
  }

  private async handleGoogleRedirectResult(): Promise<void> {
    if (this.googleRedirectHandled) {
      return;
    }

    this.googleRedirectHandled = true;
    let navigationDone: Promise<void> | null = null;

    try {
      const result = await this.authService.getGoogleRedirectResult();
      if (!result?.user) {
        return;
      }

      this.googleLoading = true;
      await this.interaction.presentLoading('Completando ingreso con Google...');
      navigationDone = this.waitForNavigationToSettle();
      await this.checkUserType(result.user.uid, result.user.email || '', result.user);
    } catch (error) {
      console.error('Error recuperando redirect de Google:', error);
      this.interaction.presentToast('No se pudo completar el inicio con Google.');
    } finally {
      if (navigationDone) {
        await navigationDone;
      }

      await this.interaction.closeLoading();
      this.googleLoading = false;
    }
  }

  private async initializeLoginSession(): Promise<void> {
    await this.handleGoogleRedirectResult();
    await this.redirectLoggedUserAwayFromLogin();
  }

  private async checkUserType(uid: string, email: string, user: any): Promise<void> {
    try {
      let perfil = await firstValueFrom(this.roleResolverService.resolvePerfil(uid));

      if (!perfil) {
        this.roleResolverService.clearPerfilCache(uid);
        perfil = await firstValueFrom(this.roleResolverService.resolvePerfil(uid));
      }

      if (perfil) {
        console.log(`Tipo de usuario: ${perfil}`);
        await this.ensureLegacyPanelAccess(uid, perfil);
        this.interaction.presentToast('Ingresado con éxito');
        await this.navigateByRole(perfil);
      } else {
        await this.redirigirSegunRegistro(uid, email, user);
      }
    } catch (error) {
      console.error('Error al verificar el tipo de usuario:', error);
      this.interaction.presentToast('Error verificando usuario');
    }
  }

  private async redirigirSegunRegistro(uid: string, email = '', user?: any): Promise<void> {
    this.roleResolverService.clearPerfilCache(uid);

    const [usuario, fletero] = await Promise.all([
      firstValueFrom(
        this.firestore.getDoc<UserU>('Usuarios', uid).pipe(
          catchError((error) => {
            console.warn(`No se pudo leer Usuarios/${uid}:`, error);
            return of(null);
          })
        )
      ),
      firstValueFrom(
        this.firestore.getDoc<UserF>('Fleteros', uid).pipe(
          catchError((error) => {
            console.warn(`No se pudo leer Fleteros/${uid}:`, error);
            return of(null);
          })
        )
      ),
    ]);

    if (usuario) {
      if (usuario.estadoRegistro === 'completo') {
        this.interaction.presentToast('Ingresado con éxito');
        await this.navigateByRole('Usuario');
        return;
      }

      this.interaction.presentToast('Retomamos tu registro de usuario.');
      await this.router.navigate(['/registrarse', 'usuario'], { replaceUrl: true });
      return;
    }

    if (fletero) {
      if (fletero.estadoRegistro === 'pendiente_revision' || fletero.estadoRegistro === 'completo' || fletero.estadoRegistro === 'documentacion') {
        this.interaction.presentToast('Ingresado con éxito');
        await this.navigateByRole('Fletero');
        return;
      }

      this.interaction.presentToast('Retomamos tu registro de fletero.');
      await this.router.navigate(['/registrarse', 'flete', 'inicio'], { replaceUrl: true });
      return;
    }

    const pendingGoogleRegistration = this.authService.consumePendingGoogleRegistration();
    if (pendingGoogleRegistration && user?.uid) {
      await this.completePendingGoogleRegistration(pendingGoogleRegistration, user, email);
      return;
    }

    this.interaction.presentToast('¡Bienvenido! Debes completar tu registro.');
    await this.router.navigate(['/registrarse'], { replaceUrl: true });
  }

  private async completePendingGoogleRegistration(
    perfil: 'Usuario' | 'Fletero',
    user: any,
    fallbackEmail = ''
  ): Promise<void> {
    const email = ((user.email || fallbackEmail || '') as string).trim().toLowerCase();
    const existing = await this.authService.findExistingProfileByEmail(email, user.uid);

    if (existing.exists) {
      await this.authService.signOutSilently();
      this.interaction.presentToast(
        existing.perfil === 'Fletero'
          ? 'Ese correo ya está registrado como fletero.'
          : 'Ese correo ya está registrado como usuario.'
      );
      await this.router.navigate(['/login'], { replaceUrl: true });
      return;
    }

    if (perfil === 'Usuario') {
      await this.authService.guardarBaseUsuario(user.uid, {
        email,
        photoURL: user.photoURL || '',
        metodoRegistro: 'google',
        estadoRegistro: 'auth',
        emailVerificado: user.emailVerified ?? true,
      });

      this.roleResolverService.clearPerfilCache(user.uid);
      this.interaction.presentToast('Cuenta Google vinculada. Completá tus datos personales.');
      await this.router.navigate(['/registrarse', 'usuario'], { replaceUrl: true });
      return;
    }

    await this.authService.guardarBaseFletero(user.uid, {
      email,
      photoURL: user.photoURL || '',
      metodoRegistro: 'google',
      estadoRegistro: 'auth',
      emailVerificado: user.emailVerified ?? true,
      verificado: false,
      habilitado: false,
      documentacionCompleta: false,
    });

    this.roleResolverService.clearPerfilCache(user.uid);
    this.interaction.presentToast('Cuenta Google vinculada. Completá tus datos personales.');
    await this.router.navigate(['/registrarse', 'flete', 'inicio'], { replaceUrl: true });
  }

  private async redirectLoggedUserAwayFromLogin(): Promise<void> {
    const user = await this.authService.getCurrentUser();
    if (!user?.uid) {
      return;
    }

    await this.interaction.presentLoading('Ingresando...');

    try {
      let perfil = await firstValueFrom(this.roleResolverService.resolvePerfil(user.uid));
      if (!perfil) {
        this.roleResolverService.clearPerfilCache(user.uid);
        perfil = await firstValueFrom(this.roleResolverService.resolvePerfil(user.uid));
      }

      if (perfil) {
        await this.ensureLegacyPanelAccess(user.uid, perfil);
        await this.navigateByRole(perfil);
        return;
      }

      this.interaction.presentToast('Elegi como queres registrarte para completar tu cuenta.');
      await this.router.navigate(['/registrarse'], { replaceUrl: true });
    } finally {
      await this.interaction.closeLoading();
    }
  }

  private navigateByRole(perfil: string): Promise<boolean> {
    if (perfil === 'Admin' || perfil === 'Verificador' || perfil === 'Soporte') {
      return this.ngZone.run(() =>
        this.router.navigate(['/admin'], { replaceUrl: true })
      );
    }

    return this.ngZone.run(() =>
      this.router.navigate(['/home', perfil.toLowerCase()], { replaceUrl: true })
    );
  }

  private async ensureLegacyPanelAccess(uid: string, perfil: string): Promise<void> {
    if (perfil !== 'Admin') {
      return;
    }

    try {
      await this.firestore.setRolPanelUsuario(uid, 'Admin', true, 'legacy-admin-login');
      this.roleResolverService.clearPerfilCache(uid);
    } catch (error) {
      console.warn('No se pudo migrar el acceso admin legacy:', error);
    }
  }

  private async waitForNavigationToSettle(): Promise<void> {
    await firstValueFrom(
      this.router.events.pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        take(1),
        timeout(5000),
        catchError(() => of(null))
      )
    );

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  user(): void {
    this.router.navigate(['/formUser1']);
  }

  fletero(): void {
    this.router.navigate(['/formF1']);
  }

  redirRegistro(): void {
    this.router.navigate(['/registrarse']);
  }
}
