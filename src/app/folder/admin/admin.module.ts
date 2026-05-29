import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
// import { AdminComponent } from './admin.component';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { DashboardComponent } from './dashboard/dashboard.component';
import { EstadisticasComponentComponent } from './estadisticas-component/estadisticas-component.component';
import { FleterosComponentComponent } from './fleteros-component/fleteros-component.component';
import { PedidosComponentComponent } from './pedidos-component/pedidos-component.component';
import { UsuariosComponentComponent } from './usuarios-component/usuarios-component.component';
import { OperacionesComponentComponent } from './operaciones-component/operaciones-component.component';
import { AccesosAdminComponent } from './accesos-admin/accesos-admin.component';
import { AdminComponent } from './admin.component';
import { AdminRoutingModule } from './admin-routing.module';
import { ComponentsModule } from 'src/app/components/components.module';



@NgModule({
  declarations: [
    AdminComponent,
    DashboardComponent,
    EstadisticasComponentComponent,
    FleterosComponentComponent,
    AccesosAdminComponent,
    OperacionesComponentComponent,
    PedidosComponentComponent,
    UsuariosComponentComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    AdminRoutingModule,
    ComponentsModule
  ],
  exports: [
    AdminComponent,
    DashboardComponent,
    EstadisticasComponentComponent,
    FleterosComponentComponent,
    AccesosAdminComponent,
    OperacionesComponentComponent,
    PedidosComponentComponent,
    UsuariosComponentComponent,
  ]
})
export class AdminModule { }
