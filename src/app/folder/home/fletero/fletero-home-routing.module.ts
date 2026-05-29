import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { HomeFleteroComponent } from 'src/app/components/ComponentesFleteros/home-fletero/home-fletero.component';

const routes: Routes = [
  {
    path: '',
    component: HomeFleteroComponent,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class FleteroHomeRoutingModule {}