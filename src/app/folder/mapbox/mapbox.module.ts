import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MapboxComponent } from './mapbox.component';
import { HttpClientModule } from '@angular/common/http';
import { VerRutaComponent } from './ver-ruta/ver-ruta.component';


@NgModule({
  imports: [
    CommonModule,
    HttpClientModule,
    MapboxComponent,
    VerRutaComponent,
  ],
  exports: [
    MapboxComponent,
    VerRutaComponent
  ]
})
export class MapboxModule { }
