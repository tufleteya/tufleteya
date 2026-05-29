import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay, switchMap, take, tap } from 'rxjs/operators';
import { PanelAccess, Perfil, PerfilApp, PermisoPanel, RolPanel, UserF, UserU } from '../models/models';
import { FirestoreService } from './firestore.service';

@Injectable({
  providedIn: 'root'
})
export class RoleResolverService {
  private readonly perfilCache = new Map<string, Observable<Perfil | null>>();
  private readonly panelAccessCache = new Map<string, Observable<PanelAccess | null>>();

  private readonly permisosPorRol: Record<RolPanel, PermisoPanel[]> = {
    Admin: [
      'panel:acceder',
      'usuarios:leer',
      'usuarios:editar_perfil',
      'fleteros:leer',
      'fleteros:verificar',
      'soporte:leer',
      'soporte:responder',
      'pedidos:leer',
      'metricas:leer',
      'configuracion:editar',
    ],
    Verificador: [
      'panel:acceder',
      'fleteros:leer',
      'fleteros:verificar',
      'metricas:leer',
    ],
    Soporte: [
      'panel:acceder',
      'usuarios:leer',
      'soporte:leer',
      'soporte:responder',
      'pedidos:leer',
    ],
  };

  constructor(private firestoreService: FirestoreService) {}

  resolvePerfil(uid: string): Observable<Perfil | null> {
    if (!uid) {
      return of(null);
    }

    const cachedPerfil = this.perfilCache.get(uid);
    if (cachedPerfil) {
      return cachedPerfil;
    }

    const perfil$ = this.resolvePerfilInternal(uid).pipe(
      tap((perfil) => {
        if (!perfil) {
          this.perfilCache.delete(uid);
        }
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    );

    this.perfilCache.set(uid, perfil$);
    return perfil$;
  }

  clearPerfilCache(uid?: string): void {
    if (uid) {
      this.perfilCache.delete(uid);
      this.panelAccessCache.delete(uid);
      return;
    }

    this.perfilCache.clear();
    this.panelAccessCache.clear();
  }

  resolveRolPanel(uid: string): Observable<RolPanel | null> {
    return this.resolvePanelAccess(uid).pipe(
      map((access) => access?.rol ?? null)
    );
  }

  resolvePanelAccess(uid: string): Observable<PanelAccess | null> {
    if (!uid) {
      return of(null);
    }

    const cachedAccess = this.panelAccessCache.get(uid);
    if (cachedAccess) {
      return cachedAccess;
    }

    const access$ = this.safeGetDoc<any>('Admins', uid).pipe(
      map((admin) => this.normalizePanelAccess(uid, admin)),
      tap((access) => {
        if (!access) {
          this.panelAccessCache.delete(uid);
        }
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    );

    this.panelAccessCache.set(uid, access$);
    return access$;
  }

  hasPanelPermission(uid: string, permiso: PermisoPanel): Observable<boolean> {
    return this.resolvePanelAccess(uid).pipe(
      map((access) => Boolean(access?.activo && access.permisos.includes(permiso)))
    );
  }

  private resolvePerfilInternal(uid: string): Observable<Perfil | null> {
    return this.resolvePanelAccess(uid).pipe(
      switchMap((panelAccess) => {
        if (panelAccess?.activo && panelAccess.rol) {
          return of(panelAccess.rol as Perfil);
        }

        return this.safeGetDoc<UserU>('Usuarios', uid).pipe(
          switchMap((usuarioRaiz) => {
            if (usuarioRaiz?.perfilActivo || usuarioRaiz?.perfil) {
              return of((usuarioRaiz.perfilActivo || usuarioRaiz.perfil) as Perfil);
            }

            return this.safeGetDoc<UserU>(`Usuarios/${uid}/DatosPersonales`, uid).pipe(
              switchMap((usuarioPersonal) => {
                if (usuarioPersonal?.perfilActivo || usuarioPersonal?.perfil) {
                  return of((usuarioPersonal.perfilActivo || usuarioPersonal.perfil) as Perfil);
                }

                return this.safeGetDoc<UserF>('Fleteros', uid).pipe(
                  map((fletero) => {
                    if (fletero?.perfilActivo || fletero?.perfil) {
                      return (fletero.perfilActivo || fletero.perfil) as Perfil;
                    }

                    return null;
                  })
                );
              })
            );
          })
        );
      })
    );
  }

  private safeGetDoc<T>(path: string, id: string): Observable<T | null> {
    return this.firestoreService.getDoc<T>(path, id).pipe(
      take(1),
      catchError((error) => {
        console.warn(`No se pudo leer ${path}/${id} al resolver perfil:`, error);
        return of(null);
      })
    );
  }

  private normalizePanelAccess(uid: string, admin: any): PanelAccess | null {
    if (!admin) {
      return null;
    }

    const rol: RolPanel = admin.rol === 'Verificador' || admin.rol === 'Soporte'
      ? admin.rol
      : 'Admin';
    const activo = admin.activo !== false;
    const permisosBase = this.permisosPorRol[rol];
    const permisosExtra = Array.isArray(admin.permisos)
      ? admin.permisos.filter((permiso: unknown): permiso is PermisoPanel =>
          typeof permiso === 'string' && permisosBase.concat(this.permisosPorRol.Admin).includes(permiso as PermisoPanel)
        )
      : [];

    return {
      uid,
      rol,
      activo,
      permisos: Array.from(new Set([...permisosBase, ...permisosExtra])),
    };
  }
}
