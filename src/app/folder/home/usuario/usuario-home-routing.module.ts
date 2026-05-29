import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { HomeUserComponent } from 'src/app/components/ComponentesUsuario/home-user/home-user.component';

const routes: Routes = [
  {
    path: '',
    component: HomeUserComponent,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class UsuarioHomeRoutingModule {}