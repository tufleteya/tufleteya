import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { HomeAdminComponent } from 'src/app/components/ComponentesAdmin/home-admin/home-admin.component';
import { AdminHomeRoutingModule } from './admin-home-routing.module';

@NgModule({
  declarations: [HomeAdminComponent],
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    AdminHomeRoutingModule,
  ],
})
export class AdminHomeModule {}