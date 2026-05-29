import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { RegistrarsePage } from './registrarse.page';

const routes: Routes = [
  {
    path: '',
    component: RegistrarsePage
  },
  {
    path: 'usuario',
    loadChildren: () => import('./user/user.module').then(m => m.UserModule)
  },
  {
    path: 'flete',
    loadChildren: () => import('./flete/flete.module').then(m => m.FleteModule)
  },
  {
    path: 'paso1U',
    redirectTo: 'usuario',
    pathMatch: 'full'
  },
  {
    path: 'paso1F',
    redirectTo: 'flete',
    pathMatch: 'full'
  },
  {
    path: 'paso4F',
    redirectTo: '/fletes/iniciarApp',
    pathMatch: 'full'
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class RegistrarsePageRoutingModule {}
