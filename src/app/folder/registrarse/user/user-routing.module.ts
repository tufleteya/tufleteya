import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { Paso1UComponent } from './paso1-u/paso1-u.component';
import { UsuarioRegistroGuard } from '../../guards/usuario-registro.guard';

const routes: Routes = [
  {
    path: '',
    component: Paso1UComponent,
    canActivate: [UsuarioRegistroGuard],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class UserRoutingModule {}
