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
export class UsuarioRegistroGuard implements CanActivate {
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
            if (perfil === 'Fletero') {
              return this.firestoreService.getDoc<UserF>('Fleteros', user.uid).pipe(
                take(1),
                map((fletero) => {
                  if (fletero?.estadoRegistro === 'auth' || fletero?.estadoRegistro === 'vehiculo') {
                    this.router.navigate(['/registrarse', 'flete', 'inicio']);
                  } else {
                    this.router.navigate(['/fletes', 'iniciarApp']);
                  }

                  return false;
                }),
                catchError(() => {
                  this.router.navigate(['/fletes', 'iniciarApp']);
                  return of(false);
                })
              );
            }

            if (perfil !== 'Usuario') {
              return of(true);
            }

            return this.firestoreService.getDoc<UserU>('Usuarios', user.uid).pipe(
              take(1),
              map((usuario) => {
                if (!usuario) {
                  return true;
                }

                const registroCompleto = usuario.estadoRegistro === 'completo';
                if (registroCompleto) {
                  this.router.navigate(['/home', 'usuario']);
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
