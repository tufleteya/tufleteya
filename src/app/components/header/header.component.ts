import { Component, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, Subject, of } from 'rxjs';
import { distinctUntilChanged, map, switchMap, takeUntil } from 'rxjs/operators';
import { ChatService } from 'src/app/folder/chat/chat-services';
import { AuthService } from 'src/app/folder/services/auth.service';
import { RoleResolverService } from 'src/app/folder/services/role-resolver.service';
import { Perfil, RolPanel } from 'src/app/folder/models/models';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
})
export class HeaderComponent implements OnDestroy {
  private readonly destroy$ = new Subject<void>();

  login: boolean = false;
  rol: Perfil = null;
  rolPanel: RolPanel | null = null;
  chatCount$: Observable<number> = of(0);
  homeRoute: string[] = ['/home'];
  homeHref = '/home';

  constructor(
    private auth: AuthService,
    private router: Router,
    private chatService: ChatService,
    private roleResolverService: RoleResolverService
  ) {
    this.auth.stateUser().pipe(
      map((user) => user?.uid ?? null),
      distinctUntilChanged(),
      switchMap((uid) =>
        uid
          ? this.roleResolverService.resolvePerfil(uid).pipe(
              switchMap((rol) => this.roleResolverService.resolveRolPanel(uid).pipe(
                map((rolPanel) => ({ uid, rol, rolPanel }))
              ))
            )
          : of(null)
      ),
      takeUntil(this.destroy$)
    ).subscribe((userState) => {
      if (!userState) {
        this.login = false;
        this.rol = null;
        this.rolPanel = null;
        this.chatCount$ = of(0);
        this.homeRoute = ['/home'];
        this.homeHref = '/home';
        return;
      }

      this.login = true;
      this.rol = userState.rol;
      this.rolPanel = userState.rolPanel;
      this.homeRoute = this.getHomeRouteByRole(userState.rol);
      this.homeHref = this.homeRoute.join('/');
      this.chatCount$ = this.getChatCountStream(userState.uid, userState.rol);
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  goToChat() {
    const queryParams = {
      openChat: 'true',
      openChatAt: Date.now(),
    };

    if (this.rol === 'Usuario' || this.rol === 'Fletero') {
      this.router.navigate(this.homeRoute, { queryParams });
    }
  }

  private getChatCountStream(uid: string, rol: Perfil | null): Observable<number> {
    if (rol === 'Usuario') {
      return this.chatService.getOpenChatCountForUser(uid);
    }

    if (rol === 'Fletero') {
      return this.chatService.getOpenChatCountForFletero(uid);
    }

    return of(0);
  }

  private getHomeRouteByRole(rol: Perfil | null): string[] {
    if (rol === 'Usuario') {
      return ['/home', 'usuario'];
    }

    if (rol === 'Fletero') {
      return ['/home', 'fletero'];
    }

    if (rol === 'Admin' || rol === 'Verificador' || rol === 'Soporte') {
      return ['/home', 'admin'];
    }

    return ['/home'];
  }
}
