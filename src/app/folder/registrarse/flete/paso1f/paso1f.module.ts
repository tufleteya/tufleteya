import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import { ComponentsModule } from 'src/app/components/components.module';
import { Paso1fComponent } from './paso1f.component';
import { Paso1fRoutingModule } from './paso1f-routing.module';

@NgModule({
  declarations: [Paso1fComponent],
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    RouterModule,
    ComponentsModule,
    Paso1fRoutingModule,
  ],
})
export class Paso1fModule {}