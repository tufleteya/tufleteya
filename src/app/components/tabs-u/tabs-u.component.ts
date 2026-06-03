import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { Perfil, RolPanel, UserF } from 'src/app/folder/models/models';
import { AuthService } from 'src/app/folder/services/auth.service';
import { FirestoreService } from 'src/app/folder/services/firestore.service';
import { InteractionService } from 'src/app/folder/services/interaction.service';
import { RoleResolverService } from 'src/app/folder/services/role-resolver.service';
import { take } from 'rxjs/operators';

@Component({
  selector: 'app-tabs-u',
  templateUrl: './tabs-u.component.html',
  styleUrls: ['./tabs-u.component.scss'],
})
export class TabsUComponent {


  login: boolean = false;
  rol: Perfil = null;
  rolPanel: RolPanel | null = null;
  homeRoute: string[] = ['/home'];

  constructor( private auth: AuthService,
               private router: Router,
               private interaction: InteractionService,
               private firestore: FirestoreService,
               private roleResolverService: RoleResolverService,
               
    ) {      this.auth.stateUser().subscribe( res => {
      if (res) {
          //  console.log('está logeado');
           this.login = true;
           this.detectarRol(res.uid);

      } else {
        // console.log('no está logeado');
        this.login = false;
       this.router.navigate(['/login'])
        
      }   
 })}
 FleteDisplonibles(){
  this.auth.stateUser<UserF>().pipe(take(1)).subscribe(res => {
    if (res) {
      console.log("respuestacomun", res.uid);
      const path = `Fleteros`;
      this.firestore.getDoc<UserF>(path, res.uid).pipe(take(1)).subscribe(res2 => {
        if (res2?.verificado === false || res2?.habilitado === false) {
          this.interaction.presentToast('Podés ver pedidos, pero para ver ruta y enviar precio primero completá tu verificación.');
        }
        this.router.navigate(['/fletes/fletesDis']);
      });
    }
  });
}

  detectarRol(uid: string) {
    this.roleResolverService.resolvePerfil(uid).subscribe((perfil) => {
      this.rol = perfil;
      this.homeRoute = this.getHomeRouteByRole(perfil);
    });
    this.roleResolverService.resolveRolPanel(uid).subscribe((rolPanel) => {
      this.rolPanel = rolPanel;
      if (!this.rol && rolPanel) {
        this.homeRoute = ['/home', 'admin'];
      }
    });
  }


PedirFlete(){
  this.router.navigate(['/fletes']);
}

Profile(){
  this.router.navigate(['/profile']);
}

Home(){
  this.router.navigate(this.homeRoute);
}

loginn(){
  this.router.navigate(['/login'])
}

  logout(){
      this.auth.logout();
  }

  private getHomeRouteByRole(perfil: Perfil | null): string[] {
    if (perfil === 'Usuario') {
      return ['/home', 'usuario'];
    }

    if (perfil === 'Fletero') {
      return ['/home', 'fletero'];
    }

    if (perfil === 'Admin' || perfil === 'Verificador' || perfil === 'Soporte') {
      return ['/home', 'admin'];
    }

    return ['/home'];
  }

  isHomeActive(): boolean {
    return this.matchesRoute(this.homeRoute);
  }

  isProfileActive(): boolean {
    return this.matchesRoute(['/profile']);
  }

  isSupportActive(): boolean {
    return this.matchesRoute(['/chat', 'soporte', 'ayuda']);
  }

  isPrimaryTabActive(): boolean {
    if (this.rol === 'Usuario') {
      return this.matchesRoute(['/fletes']);
    }

    if (this.rol === 'Fletero') {
      return this.matchesRoute(['/fletes', 'fletesDis']);
    }

    if (this.rolPanel) {
      return this.matchesRoute(['/admin', 'dashboard']);
    }

    return false;
  }

  private matchesRoute(segments: string[]): boolean {
    const target = this.normalizeRoute(segments);
    const current = this.normalizeRoute(this.router.url.split('?')[0].split('#')[0].split('/').filter(Boolean));

    return current === target || current.startsWith(`${target}/`);
  }

  private normalizeRoute(segments: string[]): string {
    const path = segments.filter(Boolean).join('/');
    return `/${path}`;
  }

}
