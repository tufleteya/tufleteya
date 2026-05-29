import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LegalPageComponent } from './legal-page.component';

const routes: Routes = [
  {
    path: 'privacidad',
    component: LegalPageComponent,
    data: { documentType: 'privacy' },
  },
  {
    path: 'terminos',
    component: LegalPageComponent,
    data: { documentType: 'terms' },
  },
  {
    path: '',
    redirectTo: 'privacidad',
    pathMatch: 'full',
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class LegalRoutingModule {}
