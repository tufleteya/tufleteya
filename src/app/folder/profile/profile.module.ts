import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProfileComponent } from './profile.component';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { ComponentsModule } from 'src/app/components/components.module';
import { ProfileUsuarioComponent } from 'src/app/components/ComponentesUsuario/profile-usuario/profile-usuario.component';
import { ProfileFleteroComponent } from 'src/app/components/ComponentesFleteros/profile-fletero/profile-fletero.component';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  { path: '', component: ProfileComponent }
];

@NgModule({
  declarations: [
    ProfileComponent,
    ProfileUsuarioComponent,
    ProfileFleteroComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ComponentsModule,
    RouterModule.forChild(routes),
  ],
  exports: [
    ProfileComponent,
  ]
})
export class ProfileModule { }
