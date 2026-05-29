import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, RouterStateSnapshot } from '@angular/router';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap, take } from 'rxjs/operators';
import { UserF, UserU } from '../models/models';
import { AuthService } from '../services/auth.service';
import { FirestoreService } from '../services/firestore.service';
import { RoleResolverService } from '../services/role-resolver.service';

@Injectable({
  providedIn: 'root'
})
export class FleteroRegistroGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private firestoreService: FirestoreService,
    private roleResolverService: RoleResolverService,
    private router: Router
  ) {}

  canActivate(_: ActivatedRouteSnapshot, __: RouterStateSnapshot): Observable<boolean> {
    return this.authService.stateUser().pipe(
      take(1),
      switchMap((user) => {
        if (!user?.uid) {
          return of(true);
        }

        return this.roleResolverService.resolvePerfil(user.uid).pipe(
          take(1),
          switchMap((perfil) => {
            if (perfil === 'Usuario') {
              return this.firestoreService.getDoc<UserU>('Usuarios', user.uid).pipe(
                take(1),
                map((usuario) => {
                  if (usuario?.estadoRegistro === 'completo') {
                    this.router.navigate(['/home', 'usuario']);
                  } else {
                    this.router.navigate(['/registrarse', 'usuario']);
                  }

                  return false;
                }),
                catchError(() => {
                  this.router.navigate(['/registrarse', 'usuario']);
                  return of(false);
                })
              );
            }

            if (perfil !== 'Fletero') {
              return of(true);
            }

            return this.firestoreService.getDoc<UserF>('Fleteros', user.uid).pipe(
              take(1),
              map((fletero) => {
                if (!fletero) {
                  return true;
                }

                const registroBloqueado =
                  fletero.documentacionCompleta === true ||
                  fletero.estadoRegistro === 'documentacion' ||
                  fletero.estadoRegistro === 'pendiente_revision' ||
                  fletero.estadoRegistro === 'completo';

                if (registroBloqueado) {
                  this.router.navigate(['/fletes/iniciarApp']);
                  return false;
                }

                return true;
              }),
              catchError(() => of(true))
            );
          }),
          catchError(() => of(true))
        );
      }),
      catchError(() => of(true))
    );
  }
}
