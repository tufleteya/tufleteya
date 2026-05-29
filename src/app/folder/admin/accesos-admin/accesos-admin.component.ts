import { Component, OnDestroy, OnInit } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Subscription } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';
import { InteractionService } from '../../services/interaction.service';
import { RoleResolverService } from '../../services/role-resolver.service';
import { PanelAccess, PerfilApp, RolPanel } from '../../models/models';

interface AdminAccess extends PanelAccess {
  id: string;
  email?: string;
  updatedAt?: unknown;
  updatedBy?: string;
}

interface AccessCandidate {
  uid: string;
  nombre: string;
  apellido: string;
  email: string;
  perfil: PerfilApp;
}

@Component({
  selector: 'app-accesos-admin',
  templateUrl: './accesos-admin.component.html',
  styleUrls: ['./accesos-admin.component.scss'],
})
export class AccesosAdminComponent implements OnInit, OnDestroy {
  readonly roles: RolPanel[] = ['Soporte', 'Verificador', 'Admin'];

  accesos: AdminAccess[] = [];
  candidatos: AccessCandidate[] = [];
  candidatosFiltrados: AccessCandidate[] = [];
  busquedaCandidato = '';
  cargando = true;
  guardando = false;
  currentUid = '';

  form = {
    uid: '',
    rol: 'Soporte' as RolPanel,
    activo: true,
  };

  private usuariosRaw: AccessCandidate[] = [];
  private fleterosRaw: AccessCandidate[] = [];
  private readonly subs = new Subscription();

  constructor(
    private firestore: AngularFirestore,
    private firestoreService: FirestoreService,
    private roleResolverService: RoleResolverService,
    private authService: AuthService,
    private interaction: InteractionService,
  ) {}

  ngOnInit(): void {
    this.subs.add(
      this.authService.stateUser().subscribe((user) => {
        this.currentUid = user?.uid || '';
      })
    );

    this.cargarAccesos();
    this.cargarCandidatos();
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  cargarAccesos(): void {
    this.subs.add(
      this.firestore.collection('Admins').snapshotChanges().subscribe({
        next: (snapshot) => {
          this.accesos = snapshot
            .map((doc) => ({
              id: doc.payload.doc.id,
              ...((doc.payload.doc.data() as any) || {}),
            } as AdminAccess))
            .sort((a, b) => this.getRoleOrder(a.rol) - this.getRoleOrder(b.rol));
          this.cargando = false;
        },
        error: (error) => this.handleLoadError('accesos administrativos', error),
      })
    );
  }

  cargarCandidatos(): void {
    this.subs.add(
      this.firestore.collection('Usuarios').snapshotChanges().subscribe({
        next: (snapshot) => {
          this.usuariosRaw = snapshot.map((doc) => this.mapCandidate(doc.payload.doc.id, doc.payload.doc.data(), 'Usuario'));
          this.syncCandidatos();
        },
        error: (error) => this.handleLoadError('usuarios candidatos', error),
      })
    );

    this.subs.add(
      this.firestore.collection('Fleteros').snapshotChanges().subscribe({
        next: (snapshot) => {
          this.fleterosRaw = snapshot.map((doc) => this.mapCandidate(doc.payload.doc.id, doc.payload.doc.data(), 'Fletero'));
          this.syncCandidatos();
        },
        error: (error) => this.handleLoadError('fleteros candidatos', error),
      })
    );
  }

  seleccionarCandidato(candidato: AccessCandidate): void {
    this.form.uid = candidato.uid;
    const accesoActual = this.accesos.find((acceso) => acceso.uid === candidato.uid || acceso.id === candidato.uid);
    if (accesoActual?.rol) {
      this.form.rol = accesoActual.rol;
      this.form.activo = accesoActual.activo !== false;
    }
  }

  filtrarCandidatos(): void {
    const query = this.busquedaCandidato.trim().toLowerCase();

    this.candidatosFiltrados = this.candidatos
      .filter((candidato) => {
        if (!query) {
          return true;
        }

        return [
          candidato.uid,
          candidato.nombre,
          candidato.apellido,
          candidato.email,
          candidato.perfil,
        ].filter(Boolean).join(' ').toLowerCase().includes(query);
      })
      .slice(0, 8);
  }

  async guardarAcceso(): Promise<void> {
    const uid = this.form.uid.trim();

    if (!uid) {
      await this.interaction.presentToast('Falta el UID del usuario.');
      return;
    }

    this.guardando = true;
    await this.interaction.presentLoading('Guardando acceso...');

    try {
      await this.firestoreService.setRolPanelUsuario(uid, this.form.rol, this.form.activo);
      this.roleResolverService.clearPerfilCache(uid);
      await this.interaction.presentToast('Acceso administrativo guardado con exito.');
      this.form = { uid: '', rol: 'Soporte', activo: true };
      this.busquedaCandidato = '';
      this.filtrarCandidatos();
    } catch (error) {
      console.error('No se pudo guardar el acceso administrativo:', error);
      await this.interaction.presentToast('No se pudo guardar el acceso administrativo.');
    } finally {
      this.guardando = false;
      await this.interaction.closeLoading();
    }
  }

  async cambiarEstadoAcceso(acceso: AdminAccess): Promise<void> {
    const uid = acceso.uid || acceso.id;
    const activar = acceso.activo === false;

    if (uid === this.currentUid && !activar) {
      await this.interaction.presentToast('No podés desactivar tu propio acceso admin desde esta pantalla.');
      return;
    }

    this.guardando = true;
    await this.interaction.presentLoading(activar ? 'Activando acceso...' : 'Desactivando acceso...');

    try {
      await this.firestoreService.setRolPanelUsuario(uid, acceso.rol, activar);
      this.roleResolverService.clearPerfilCache(uid);
      await this.interaction.presentToast(activar ? 'Acceso activado.' : 'Acceso desactivado.');
    } catch (error) {
      console.error('No se pudo cambiar el estado del acceso:', error);
      await this.interaction.presentToast('No se pudo actualizar el acceso.');
    } finally {
      this.guardando = false;
      await this.interaction.closeLoading();
    }
  }

  getCandidateLabel(uid: string): string {
    const candidato = this.candidatos.find((item) => item.uid === uid);
    if (!candidato) {
      return uid;
    }

    const nombre = `${candidato.nombre || ''} ${candidato.apellido || ''}`.trim();
    return nombre ? `${nombre} · ${candidato.email || uid}` : (candidato.email || uid);
  }

  getUpdatedAtText(value: unknown): string {
    const date = this.toDate(value);
    return date ? date.toLocaleString('es-AR') : '-';
  }

  trackByUid(index: number, item: { uid?: string; id?: string }): string {
    return item.uid || item.id || String(index);
  }

  private syncCandidatos(): void {
    const merged = new Map<string, AccessCandidate>();

    [...this.usuariosRaw, ...this.fleterosRaw].forEach((candidate) => {
      const current = merged.get(candidate.uid);
      merged.set(candidate.uid, {
        ...current,
        ...candidate,
        perfil: current?.perfil === 'Fletero' ? 'Fletero' : candidate.perfil,
      });
    });

    this.candidatos = Array.from(merged.values())
      .sort((a, b) => this.getCandidateLabel(a.uid).localeCompare(this.getCandidateLabel(b.uid)));
    this.filtrarCandidatos();
  }

  private mapCandidate(uid: string, data: unknown, perfil: PerfilApp): AccessCandidate {
    const value = (data || {}) as any;
    return {
      uid,
      nombre: value.nombre || '',
      apellido: value.apellido || '',
      email: value.email || '',
      perfil,
    };
  }

  private getRoleOrder(rol: RolPanel): number {
    return rol === 'Admin' ? 0 : rol === 'Verificador' ? 1 : 2;
  }

  private toDate(value: unknown): Date | null {
    if (!value) {
      return null;
    }

    if (value instanceof Date) {
      return value;
    }

    if (typeof (value as { toDate?: unknown })?.toDate === 'function') {
      return (value as { toDate: () => Date }).toDate();
    }

    if (typeof (value as { seconds?: unknown })?.seconds === 'number') {
      return new Date((value as { seconds: number }).seconds * 1000);
    }

    const parsed = new Date(value as string);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private handleLoadError(context: string, error: unknown): void {
    console.error(`Error cargando ${context}:`, error);
    this.cargando = false;
  }
}
