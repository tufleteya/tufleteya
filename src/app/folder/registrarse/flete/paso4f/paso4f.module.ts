import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import { ComponentsModule } from 'src/app/components/components.module';
import { Paso4fComponent } from './paso4f.component';
import { Paso4fRoutingModule } from './paso4f-routing.module';

@NgModule({
  declarations: [Paso4fComponent],
  imports: [
    CommonModule,
    IonicModule,
    RouterModule,
    ComponentsModule,
    Paso4fRoutingModule,
  ],
})
export class Paso4fModule {}