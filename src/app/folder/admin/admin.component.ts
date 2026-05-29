import { Component, OnDestroy, OnInit } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';
import { RolPanel } from '../models/models';
import { RoleResolverService } from '../services/role-resolver.service';

@Component({
  selector: 'app-admin',
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.scss'],
})
export class AdminComponent implements OnInit, OnDestroy {
  readonly navItems = [
    {
      label: 'Dashboard',
      route: '/admin/dashboard',
      icon: 'grid-outline',
      eyebrow: 'Resumen',
      roles: ['Admin', 'Verificador', 'Soporte'] as RolPanel[],
    },
    {
      label: 'Usuarios',
      route: '/admin/usuarios',
      icon: 'people-outline',
      eyebrow: 'Cuentas',
      roles: ['Admin', 'Soporte'] as RolPanel[],
    },
    {
      label: 'Fleteros',
      route: '/admin/fleteros',
      icon: 'car-outline',
      eyebrow: 'Operativa',
      roles: ['Admin', 'Verificador'] as RolPanel[],
    },
    {
      label: 'Accesos',
      route: '/admin/accesos',
      icon: 'key-outline',
      eyebrow: 'Roles',
      roles: ['Admin'] as RolPanel[],
    },
    {
      label: 'Pedidos',
      route: '/admin/pedidos',
      icon: 'cube-outline',
      eyebrow: 'Actividad',
      roles: ['Admin', 'Soporte'] as RolPanel[],
    },
    {
      label: 'Operaciones',
      route: '/admin/operaciones',
      icon: 'alert-circle-outline',
      eyebrow: 'Alertas',
      roles: ['Admin', 'Soporte'] as RolPanel[],
    },
    {
      label: 'Riesgo',
      route: '/admin/estadisticas',
      icon: 'shield-checkmark-outline',
      eyebrow: 'Reportes',
      roles: ['Admin', 'Verificador'] as RolPanel[],
    },
  ];

  currentRoute = '/admin/dashboard';
  rolPanel: RolPanel | null = null;
  private readonly subs = new Subscription();

  constructor(
    private auth: AuthService,
    private roleResolverService: RoleResolverService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.currentRoute = this.router.url || '/admin/dashboard';

    this.subs.add(
      this.auth.stateUser().subscribe((res) => {
        if (!res) {
          void this.router.navigate(['/login']);
          return;
        }

        this.subs.add(
          this.roleResolverService.resolveRolPanel(res.uid).subscribe((rolPanel) => {
            this.rolPanel = rolPanel;
          })
        );
      })
    );

    this.subs.add(
      this.router.events
        .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
        .subscribe((event) => {
        this.currentRoute = event.urlAfterRedirects;
        })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  isRouteActive(route: string): boolean {
    return this.currentRoute.startsWith(route);
  }

  navigateTo(route: string): void {
    void this.router.navigateByUrl(route);
  }

  canSeeItem(item: { roles: RolPanel[] }): boolean {
    return Boolean(this.rolPanel && item.roles.includes(this.rolPanel));
  }
}
