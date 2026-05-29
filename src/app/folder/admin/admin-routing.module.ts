import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { AdminComponent } from './admin.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { UsuariosComponentComponent } from './usuarios-component/usuarios-component.component';
import { FleterosComponentComponent } from './fleteros-component/fleteros-component.component';
import { PedidosComponentComponent } from './pedidos-component/pedidos-component.component';
import { EstadisticasComponentComponent } from './estadisticas-component/estadisticas-component.component';
import { OperacionesComponentComponent } from './operaciones-component/operaciones-component.component';
import { AccesosAdminComponent } from './accesos-admin/accesos-admin.component';
import { RoleGuard } from '../guards/role.guard';

const routes: Routes = [
  {
    path: '',
    component: AdminComponent,
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },

      { path: 'dashboard', component: DashboardComponent, canActivate: [RoleGuard], data: { roles: ['Admin', 'Verificador', 'Soporte'] } },
      { path: 'usuarios', component: UsuariosComponentComponent, canActivate: [RoleGuard], data: { roles: ['Admin', 'Soporte'] } },
      { path: 'fleteros', component: FleterosComponentComponent, canActivate: [RoleGuard], data: { roles: ['Admin', 'Verificador'] } },
      { path: 'accesos', component: AccesosAdminComponent, canActivate: [RoleGuard], data: { roles: ['Admin'] } },
      { path: 'pedidos', component: PedidosComponentComponent, canActivate: [RoleGuard], data: { roles: ['Admin', 'Soporte'] } },
      { path: 'operaciones', component: OperacionesComponentComponent, canActivate: [RoleGuard], data: { roles: ['Admin', 'Soporte'] } },
      { path: 'estadisticas', component: EstadisticasComponentComponent, canActivate: [RoleGuard], data: { roles: ['Admin', 'Verificador'] } },
      { path: 'reportes', component: OperacionesComponentComponent, canActivate: [RoleGuard], data: { roles: ['Admin', 'Soporte'] } },
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AdminRoutingModule {}
