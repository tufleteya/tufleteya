import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { FletesPageRoutingModule } from './fletes-routing.module';

import { FletesPage } from './fletes.page';
import { ComponentsModule } from 'src/app/components/components.module';
import { PasosModule } from './pasos/pasos.module';
import { IniciarAppComponent } from 'src/app/components/ComponentesFleteros/iniciar-app/iniciar-app.component';
import { MisViajesComponent } from 'src/app/components/ComponentesFleteros/mis-viajes/mis-viajes.component';


@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    FletesPageRoutingModule,
    ComponentsModule,
    PasosModule,
    // RegisterModule,
    
  ],
  declarations: [FletesPage, IniciarAppComponent, MisViajesComponent],
  exports: [
  ]
})
export class FletesPageModule {}
