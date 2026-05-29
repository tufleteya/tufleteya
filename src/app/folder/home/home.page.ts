import { Component } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { RoleResolverService } from '../services/role-resolver.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
})
export class HomePage {
  login: boolean = false;


  constructor( private auth: AuthService,
               private router: Router,
               private route: ActivatedRoute,
               private roleResolverService: RoleResolverService,
    ) {      this.auth.stateUser().subscribe(async res => {
      if (res) {
           this.login = true;
           this.redirigirSegunRol(res.uid);

      } else {
        const currentUser = await this.auth.getCurrentUser();
        if (currentUser?.uid) {
          this.login = true;
          this.redirigirSegunRol(currentUser.uid);
          return;
        }

        this.login = false;
        this.router.navigate(['/login'])
        
      }   
 })}
  private redirigirSegunRol(uid: string) {
    this.roleResolverService.resolvePerfil(uid).subscribe((perfil) => {
      if (!perfil) {
        return;
      }

      const destinoPorRol = {
        Usuario: 'usuario',
        Fletero: 'fletero',
        Admin: 'admin',
        Verificador: 'admin',
        Soporte: 'admin',
      } as const;

      const destino = destinoPorRol[perfil];
      const actual = this.route.firstChild?.snapshot.routeConfig?.path;

      if (actual === destino) {
        return;
      }

      this.router.navigate([destino], {
        relativeTo: this.route,
        queryParamsHandling: 'preserve',
        replaceUrl: true,
      });
    });
  }
}
