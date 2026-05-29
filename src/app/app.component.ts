import { Component, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom, of, Subject } from 'rxjs';
import { distinctUntilChanged, map, switchMap, takeUntil } from 'rxjs/operators';
import { Perfil, RolPanel } from './folder/models/models';
import { ChatService } from './folder/chat/chat-services';
import { AuthService } from './folder/services/auth.service';
import { InteractionService } from './folder/services/interaction.service';
import { NotificacionesService, PushDebugEvent } from './folder/services/notificaciones.service';
import { RoleResolverService } from './folder/services/role-resolver.service';
import { environment } from 'src/environments/environment';
// import { AngularFireMessaging } from '@angular/fire/compat/messaging';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
})
export class AppComponent implements OnDestroy {
  private readonly destroy$ = new Subject<void>();

  login: boolean = false;
  rol: Perfil = null;
  rolPanel: RolPanel | null = null;
  newChatCount: number = 0;
  pushDebugEvent: PushDebugEvent | null = null;
  showPushDebug = !environment.production;

  constructor(
    private auth: AuthService,
    private router: Router,
    private chatService: ChatService,
    private interaction: InteractionService,
    private notificacionesService: NotificacionesService,
    private roleResolverService: RoleResolverService,
    //  private afMessaging: AngularFireMessaging,
  ) {
    this.auth.stateUser().pipe(
      map((user) => user?.uid ?? null),
      distinctUntilChanged(),
      switchMap((uid) => {
        if (!uid) {
          void this.handleLoggedOutState();
          return of(0);
        }

        this.login = true;

        return this.roleResolverService.resolvePerfil(uid).pipe(
          switchMap((perfil) => this.roleResolverService.resolveRolPanel(uid).pipe(
            switchMap((rolPanel) => {
            this.rol = perfil;
            this.rolPanel = rolPanel;
            if (perfil === 'Usuario' || perfil === 'Fletero') {
              void this.notificacionesService.initPushForUser(uid, perfil);
            }

            if (perfil === 'Usuario') {
              return this.chatService.getOpenChatCountForUser(uid);
            }

            if (perfil === 'Fletero') {
              return this.chatService.getOpenChatCountForFletero(uid);
            }

            return of(0);
            })
          ))
        );
      }),
      takeUntil(this.destroy$)
    ).subscribe((count) => {
      this.newChatCount = count ?? 0;
    });

    this.notificacionesService.pushDebug$
      .pipe(takeUntil(this.destroy$))
      .subscribe((event) => {
        this.pushDebugEvent = event;
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  logout() {
    this.auth.logout();
  }

  irInicio(): void {
    const destinoPorRol = {
      Usuario: '/home/usuario',
      Fletero: '/home/fletero',
      Admin: '/home/admin',
      Verificador: '/home/admin',
      Soporte: '/home/admin',
    } as const;

    const destino = this.rol ? destinoPorRol[this.rol] : '/home';
    this.router.navigate([destino]);
  }

  async irPerfil(): Promise<void> {
    const user = await firstValueFrom(this.auth.stateUser());

    if (!user) {
      this.router.navigate(['/login']);
      return;
    }

    const perfil = this.rol ?? await firstValueFrom(this.roleResolverService.resolvePerfil(user.uid));
    if (!perfil) {
      await this.interaction.presentToast('Completá tu registro para acceder al perfil.');
      await this.router.navigate(['/registrarse']);
      return;
    }

    await this.router.navigate(['/profile']);
  }

  closePushDebug(): void {
    this.showPushDebug = false;
    this.notificacionesService.clearDebugEvent();
  }

  openPushDebug(): void {
    this.showPushDebug = true;
  }

  private async handleLoggedOutState(): Promise<void> {
    const currentUser = await this.auth.getCurrentUser();
    if (currentUser?.uid) {
      return;
    }

    this.login = false;
    this.rol = null;
    this.rolPanel = null;
    this.newChatCount = 0;

    const publicRoute =
      this.router.url.startsWith('/login') ||
      this.router.url.startsWith('/registrarse') ||
      this.router.url.startsWith('/legal');

    if (!publicRoute) {
      this.router.navigate(['/login']);
    }
  }
}
