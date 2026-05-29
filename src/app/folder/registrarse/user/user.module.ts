import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import { ComponentsModule } from 'src/app/components/components.module';
import { FormsModule } from '@angular/forms';
import { Paso1UComponent } from './paso1-u/paso1-u.component';
import { UserRoutingModule } from './user-routing.module';



@NgModule({
  declarations: [
    Paso1UComponent,
    // Paso2UComponent,
    // Paso3UComponent,
    // Paso4UComponent
  ],
  imports: [
    CommonModule,
    IonicModule,
    RouterModule,
    ComponentsModule,    
    FormsModule,
    UserRoutingModule

  ],
})
export class UserModule { }
