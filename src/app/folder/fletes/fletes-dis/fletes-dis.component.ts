import { Component } from '@angular/core';
import { DatosFlete, Perfil } from '../../models/models';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
import { InteractionService } from '../../services/interaction.service';
import { RoleResolverService } from '../../services/role-resolver.service';

@Component({
  selector: 'app-fletes-dis',
  templateUrl: './fletes-dis.component.html',
  styleUrls: ['./fletes-dis.component.scss'],
})
export class FletesDisComponent {
  
  login: boolean = false;
  rol: Perfil = null;

  constructor( private auth: AuthService,
               private router: Router,
               private interaction: InteractionService,
               private roleResolverService: RoleResolverService,
               
    ) {      this.auth.stateUser().subscribe( res => {
      if (res) {
           console.log('está logeado');
           this.login = true;
           this.roleResolverService.resolvePerfil(res.uid).subscribe((perfil) => {
            this.rol = perfil;
           });
      } else {
        console.log('no está logeado');
        this.login = false;
       this.router.navigate(['/login'])
        
      }   
 })}
}
