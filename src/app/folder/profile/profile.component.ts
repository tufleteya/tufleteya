import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { take } from 'rxjs/operators';
import { Perfil } from '../models/models';
import { AuthService } from '../services/auth.service';
import { FirestoreService } from '../services/firestore.service';
import { InteractionService } from '../services/interaction.service';
import { RoleResolverService } from '../services/role-resolver.service';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss'],
})
export class ProfileComponent implements OnInit {
  login: boolean = false;
  rol: Perfil = null;
  viewingOtherProfile: boolean = false;
  otherProfileData: any = null;

  constructor(
    private auth: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private interaction: InteractionService,
    private firestore: FirestoreService,
    private roleResolverService: RoleResolverService,
  ) {
    this.viewingOtherProfile = Boolean(
      this.route.snapshot.queryParamMap.get('id') && this.route.snapshot.queryParamMap.get('type')
    );

    this.auth.stateUser().subscribe((res) => {
      if (!res) {
        this.login = false;
        this.router.navigate(['/login']);
        return;
      }

      this.login = true;
      if (this.viewingOtherProfile) {
        return;
      }

      this.roleResolverService.resolvePerfil(res.uid).pipe(take(1)).subscribe(async (perfil) => {
        if (!perfil) {
          this.rol = null;
          await this.interaction.presentToast('Tu cuenta todavia no tiene perfil completo. Elegi Usuario o Fletero para continuar el registro.');
          await this.router.navigate(['/registrarse']);
          return;
        }

        this.rol = perfil;
      });
    });
  }

  ngOnInit() {
    this.route.queryParams.subscribe((params) => {
      if (params['id'] && params['type']) {
        this.viewingOtherProfile = true;
        this.loadOtherProfile(params['id'], params['type']);
      }
    });
  }

  private loadOtherProfile(id: string, type: string) {
    if (type === 'fletero') {
      this.firestore.getDoc('Fleteros', id).subscribe((data) => {
        this.otherProfileData = data;
        this.rol = 'Fletero';
      });
    } else if (type === 'usuario') {
      this.firestore.getDoc('Usuarios', id).subscribe((data) => {
        if (data) {
          this.otherProfileData = data;
          this.rol = 'Usuario';
          return;
        }

        this.firestore.getDoc(`Usuarios/${id}/DatosPersonales`, id).subscribe((legacyData) => {
          this.otherProfileData = legacyData;
          this.rol = 'Usuario';
        });
      });
    }
  }

  pedirF() {
    this.router.navigate(['/paso1']);
  }

  ChatV() {
    this.router.navigate(['/chat']);
  }
}
