import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { LegalRoutingModule } from './legal-routing.module';
import { LegalPageComponent } from './legal-page.component';

@NgModule({
  declarations: [LegalPageComponent],
  imports: [
    CommonModule,
    IonicModule,
    LegalRoutingModule,
  ],
})
export class LegalModule {}
