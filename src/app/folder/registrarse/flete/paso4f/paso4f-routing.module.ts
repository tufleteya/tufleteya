import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { Paso4fComponent } from './paso4f.component';

const routes: Routes = [
  {
    path: '',
    component: Paso4fComponent,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class Paso4fRoutingModule {}