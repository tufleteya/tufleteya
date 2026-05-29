import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { HomeFleteroComponent } from 'src/app/components/ComponentesFleteros/home-fletero/home-fletero.component';
import { FleteroHomeRoutingModule } from './fletero-home-routing.module';

@NgModule({
  declarations: [HomeFleteroComponent],
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    FleteroHomeRoutingModule,
  ],
})
export class FleteroHomeModule {}