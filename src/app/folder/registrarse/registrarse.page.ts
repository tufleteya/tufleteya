import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-registrarse',
  templateUrl: './registrarse.page.html',
  styleUrls: ['./registrarse.page.scss'],
})
export class RegistrarsePage {
  login: boolean = false;
  constructor(
    private router: Router,
  ) { }
  
  user(){
    this.router.navigate(['/registrarse/usuario']);
  }
  volver(){
    this.router.navigate(['/login']);
  }

  fletero(){
    this.router.navigate(['/registrarse/flete']);
  }

}
