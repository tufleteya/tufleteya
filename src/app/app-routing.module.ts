import { NgModule } from '@angular/core';
import { NoPreloading, RouterModule, Routes } from '@angular/router';
import { RoleGuard } from './folder/guards/role.guard';

const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },

  {
    path: 'home',
    loadChildren: () =>
      import('./folder/home/home.module').then(m => m.HomePageModule),
    canLoad: [RoleGuard],
    canActivate: [RoleGuard],
    data: { roles: ['Usuario', 'Fletero', 'Admin', 'Verificador', 'Soporte'] }
  },
  {
    path: 'fletes',
    loadChildren: () =>
      import('./folder/fletes/fletes.module').then(m => m.FletesPageModule),
    canActivate: [RoleGuard],
    data: { roles: ['Usuario', 'Fletero'] }
  },
  {
    path: 'registrarse',
    loadChildren: () =>
      import('./folder/registrarse/registrarse.module').then(m => m.RegistrarsePageModule)
  },
  {
    path: 'paso1U',
    redirectTo: 'registrarse/usuario',
    pathMatch: 'full'
  },
  {
    path: 'paso1F',
    redirectTo: 'registrarse/flete',
    pathMatch: 'full'
  },
  {
    path: 'paso4F',
    redirectTo: 'fletes/iniciarApp',
    pathMatch: 'full'
  },
  {
    path: 'login',
    loadChildren: () =>
      import('./folder/login/login.module').then(m => m.LoginModule)
  },
  {
    path: 'legal',
    loadChildren: () =>
      import('./folder/legal/legal.module').then(m => m.LegalModule)
  },


  {
    path: 'admin',
    loadChildren: () =>
      import('./folder/admin/admin.module').then(m => m.AdminModule),
    canLoad: [RoleGuard],
    canActivate: [RoleGuard],
    data: { roles: ['Admin', 'Verificador', 'Soporte'] }
  },

  {
    path: 'homeF',
    redirectTo: 'home',
    pathMatch: 'full'
  },
  {
    path: 'pasos',
    loadChildren: () =>
      import('./folder/fletes/pasos/pasos.module').then(m => m.PasosModule)
  },
  { path: 'chat', loadChildren: () => import('./folder/chat/chat.module').then(m => m.ChatModule) },
  {
    path: 'profile',
    loadChildren: () => import('./folder/profile/profile.module').then(m => m.ProfileModule)
  },
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { preloadingStrategy: NoPreloading })],
  exports: [RouterModule],
})
export class AppRoutingModule {}
