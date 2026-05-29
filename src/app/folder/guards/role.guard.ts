import { Injectable } from '@angular/core';
import { CanActivate, CanLoad, ActivatedRouteSnapshot, RouterStateSnapshot, UrlSegment, Route, Router } from '@angular/router';
import { from, Observable, of } from 'rxjs';
import { catchError, map, switchMap, take } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';
import { Perfil, UserF } from '../models/models';
import { InteractionService } from '../services/interaction.service';
import { RoleResolverService } from '../services/role-resolver.service';
import { FirestoreService } from '../services/firestore.service';

@Injectable({
  providedIn: 'root'
})
export class RoleGuard implements CanActivate, CanLoad {

  constructor(
    private authService: AuthService,
    private roleResolverService: RoleResolverService,
    private firestoreService: FirestoreService,
    private interactionService: InteractionService,
    private router: Router
  ) {}

  private isFletesRoute(routePath: string): boolean {
    return (routePath || '').includes('fletes');
  }

  private isExpired(value: any): boolean {
    if (!value) {
      return false;
    }

    const fecha = typeof value?.toDate === 'function'
      ? value.toDate()
      : value instanceof Date
        ? value
        : typeof value?.seconds === 'number'
          ? new Date(value.seconds * 1000)
          : new Date(value);

    return !Number.isNaN(fecha.getTime()) && fecha.getTime() < Date.now();
  }

  private validateRole(expectedRoles: Perfil[] = [], routePath = ''): Observable<boolean> {
    return from(this.authService.getCurrentUser(true)).pipe(
      switchMap(user => {
        if (!user) {
          this.router.navigate(['/login']);
          return of(false);
        }

        return this.roleResolverService.resolvePerfil(user.uid).pipe(
          switchMap(perfil => this.roleResolverService.resolveRolPanel(user.uid).pipe(
            switchMap(rolPanel => {
            if (!perfil && !rolPanel) {
              void this.interactionService.presentToast('Completá tu registro para continuar.');
              this.router.navigate(['/registrarse']);
              return of(false);
            }

            const isAuthorized = expectedRoles.length === 0
              || (perfil ? expectedRoles.includes(perfil) : false)
              || (rolPanel ? expectedRoles.includes(rolPanel) : false);
            if (!isAuthorized) {
              this.router.navigate(['/home']);
              return of(false);
            }

            if (perfil === 'Fletero' && this.isFletesRoute(routePath)) {
              return this.firestoreService.getDoc<UserF>('Fleteros', user.uid).pipe(
                take(1),
                map((fletero) => {
                  const esRutaExenta = routePath.includes('fletesDis') || routePath.includes('iniciarApp');
                  const requiereBloqueo = Boolean(
                    fletero?.bloqueadoPorVencimiento ||
                    fletero?.bloqueadoPorSancion ||
                    fletero?.bloqueoManualAdmin ||
                    fletero?.habilitado === false ||
                    (this.isExpired(fletero?.fechaVencimientoVerificacion) && !fletero?.verificado)
                  );

                  if (requiereBloqueo && !esRutaExenta) {
                    this.router.navigate(['/profile']);
                    return false;
                  }

                  return true;
                })
              );
            }

            return of(true);
            })
          )),
          catchError(() => {
            this.router.navigate(['/login']);
            return of(false);
          })
        );
      })
    );
  }

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean> {
    const expectedRoles = (route.data['roles'] as Perfil[]) || [];
    return this.validateRole(expectedRoles, state.url);
  }

  canLoad(route: Route, segments: UrlSegment[]): Observable<boolean> {
    const expectedRoles = (route.data?.['roles'] as Perfil[]) || [];
    const routePath = route.path || segments.map((segment) => segment.path).join('/');
    return this.validateRole(expectedRoles, routePath);
  }
}
