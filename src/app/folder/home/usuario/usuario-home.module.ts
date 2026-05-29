import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { HomeUserComponent } from 'src/app/components/ComponentesUsuario/home-user/home-user.component';
import { UsuarioHomeRoutingModule } from './usuario-home-routing.module';

@NgModule({
  declarations: [HomeUserComponent],
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    UsuarioHomeRoutingModule,
  ],
})
export class UsuarioHomeModule {}