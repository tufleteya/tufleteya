import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { HomePage } from './home.page';

const routes: Routes = [
  {
    path: '',
    component: HomePage,
    children: [
      {
        path: 'usuario',
        loadChildren: () => import('./usuario/usuario-home.module').then(m => m.UsuarioHomeModule)
      },
      {
        path: 'fletero',
        loadChildren: () => import('./fletero/fletero-home.module').then(m => m.FleteroHomeModule)
      },
      {
        path: 'admin',
        loadChildren: () => import('./admin/admin-home.module').then(m => m.AdminHomeModule)
      }
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class HomePageRoutingModule {}
