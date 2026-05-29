import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { FleteroRegistroGuard } from '../../guards/fletero-registro.guard';

const routes: Routes = [
  {
    path: '',
    redirectTo: 'inicio',
    pathMatch: 'full',
  },
  {
    path: 'inicio',
    loadChildren: () => import('./paso1f/paso1f.module').then(m => m.Paso1fModule),
    canActivate: [FleteroRegistroGuard],
  },
  {
    path: 'final',
    redirectTo: '/fletes/iniciarApp',
    pathMatch: 'full',
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class FleteRoutingModule {}
