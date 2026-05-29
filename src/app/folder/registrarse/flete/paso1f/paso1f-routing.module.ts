import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { Paso1fComponent } from './paso1f.component';

const routes: Routes = [
  {
    path: '',
    component: Paso1fComponent,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class Paso1fRoutingModule {}