import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from './header/header.component';
import { TabsUComponent } from './tabs-u/tabs-u.component';

import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import { ProfileModalComponent } from './profile-modal/profile-modal.component';



@NgModule({
  declarations: [
    HeaderComponent,
    TabsUComponent,
    ProfileModalComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    IonicModule,
  ],
  exports: [
    HeaderComponent,
    TabsUComponent
  ], 
})
export class ComponentsModule { }
