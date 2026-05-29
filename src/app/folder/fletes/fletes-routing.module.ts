import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
// import { AdminComponent } from '../admin/admin.component';
// import { ChatComponent } from '../chat/chat.component';
// import { HomeLogComponent } from '../homeF/home-log.component';
import { FletesPage } from './fletes.page';
import { Paso1Component } from './pasos/paso1/paso1.component';
// import { Paso2Component } from './pasos/paso2/paso2.component';
// import { Paso3Component } from './pasos/paso3/paso3.component';
import { AngularFireAuthGuard } from '@angular/fire/compat/auth-guard';
import { map } from 'rxjs/operators';
import { canActivate } from '@angular/fire/compat/auth-guard';
import { UserF } from 'src/app/folder/models/models';
import { pipe } from 'rxjs';
import { customClaims } from '@angular/fire/compat/auth-guard';
import { RoleGuard } from 'src/app/folder/guards/role.guard';
import { FletesDisComponent } from './fletes-dis/fletes-dis.component';
import { CardComponent } from './fletes-dis/card/card.component';
import { PreciosComponent } from './pasos/precios/precios.component';
import { RegistrarsePage } from '../registrarse/registrarse.page';
import { IniciarAppComponent } from 'src/app/components/ComponentesFleteros/iniciar-app/iniciar-app.component';
import { PedidosFinalizadosComponent } from './pasos/precios/pedidos-finalizados/pedidos-finalizados.component';



// const uidAdmin = 'fsfPU1AMSwUBihOXISnw6ZBFeun1'; 
// const onlyAdmin = () => map((user: any) => !!user && user.uid  === uidAdmin); 


// const User = 'Fletero'
// const onlyUser = () => map((user: any) => !!user && user.uid  === User); 
// const onlyUser = () => map((user: any) => !!user && uidUser  === User); 

//hola


const routes: Routes = [
  {
    path: '',
    component: FletesPage
  },
  {
    path: 'paso1',
    component: Paso1Component
  },
  {
    path: 'iniciarApp',
    component: IniciarAppComponent
  },
  
  // {
  //   path: 'paso2',
  //   component: Paso2Component
  // },
  // {
  //   path: 'paso3',
  //   component: Paso3Component
  // },

  
  {
    path: 'regi',
    component: RegistrarsePage,
  },
  // {
  //   path: 'chat',
  //   component: ChatComponent,
  // },
  // {
  //   path: 'chat',
  //   component: ChatComponent, 
  // },
  // {
  //   path: 'admin',
  //   component: AdminComponent, 
  // },
  {
    path: 'fletesDis',
    component: FletesDisComponent,
    canActivate: [AngularFireAuthGuard, RoleGuard],
    data: { roles: ['Fletero'] }
  },
  {
    path: 'card',
    component: CardComponent,
    canActivate: [AngularFireAuthGuard, RoleGuard],
    data: { roles: ['Fletero'] }
  },
  {
    path: 'precios',
    component: PreciosComponent,
    canActivate: [AngularFireAuthGuard, RoleGuard],
    data: { roles: ['Usuario'] }
  },
  {
    path: 'pedidosFinalizados',
    component: PedidosFinalizadosComponent, 
  },
  
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class FletesPageRoutingModule {

}