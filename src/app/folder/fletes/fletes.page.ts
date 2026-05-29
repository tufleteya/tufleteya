import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { Perfil } from '../models/models';
import { AuthService } from '../services/auth.service';
import { InteractionService } from '../services/interaction.service';
import { RoleResolverService } from '../services/role-resolver.service';

@Component({
  selector: 'app-fletes',
  templateUrl: './fletes.page.html',
  styleUrls: ['./fletes.page.scss'],
})
export class FletesPage {




  
  login: boolean = false;
  rol: Perfil = null;

  constructor( private auth: AuthService,
               private router: Router ,
               private interaction: InteractionService,
               private roleResolverService: RoleResolverService,
               
    ) {      this.auth.stateUser().subscribe( res => {
      if (res) {

           this.login = true;
           this.roleResolverService.resolvePerfil(res.uid).subscribe((perfil) => {
            this.rol = perfil;
           });
      } else {

        this.login = false;
       this.router.navigate(['/login'])
        
      }   
 })}
}
