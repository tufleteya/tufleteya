import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./mapbox.component').then((m) => m.MapboxComponent),
  },
  {
    path: 'ver-ruta/:id',
    loadComponent: () => import('./ver-ruta/ver-ruta.component').then((m) => m.VerRutaComponent),
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class MapboxRoutingModule { }
