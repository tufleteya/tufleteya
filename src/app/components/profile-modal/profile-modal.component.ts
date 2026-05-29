import { Component, Input } from '@angular/core';
import { ModalController } from '@ionic/angular';

type ProfileType = 'Usuario' | 'Fletero';

@Component({
  selector: 'app-profile-modal',
  templateUrl: './profile-modal.component.html',
  styleUrls: ['./profile-modal.component.scss'],
})
export class ProfileModalComponent {
  @Input() profileData: any;
  @Input() profileType: ProfileType = 'Fletero';

  constructor(
    private modalCtrl: ModalController
  ) {}

  dismiss() {
    this.modalCtrl.dismiss();
  }

  get isFletero(): boolean {
    return this.profileType === 'Fletero';
  }

  get displayName(): string {
    const nombre = this.profileData?.nombre || '';
    const apellido = this.profileData?.apellido || '';
    const fullName = `${nombre} ${apellido}`.trim();
    return fullName || (this.isFletero ? 'Fletero' : 'Cliente');
  }

  get profileEyebrow(): string {
    return this.isFletero ? 'Perfil del fletero' : 'Perfil del cliente';
  }

  get statusLabel(): string {
    if (this.isFletero) {
      return this.profileData?.verificado ? 'Cuenta verificada' : 'Verificación pendiente';
    }

    return 'Cliente de la plataforma';
  }

  get avatarUrl(): string {
    return this.profileData?.image || this.profileData?.photoURL || 'assets/person-outline.svg';
  }

  get vehicleData(): any {
    return this.profileData?.datosVehiculos || null;
  }

  get vehicleSummary(): string | null {
    if (!this.vehicleData) {
      return null;
    }

    const partes = [
      this.vehicleData?.tipoVehiculo,
      this.vehicleData?.marca,
      this.vehicleData?.modelo,
    ].filter(Boolean);

    return partes.length ? partes.join(' • ') : null;
  }

  get trustLabel(): string | null {
    if (this.isFletero && this.profileData?.nivelConfiabilidad) {
      return `Confiabilidad ${this.profileData.nivelConfiabilidad}`;
    }

    if (!this.isFletero && this.profileData?.nivelConfiabilidadUsuario) {
      return `Confiabilidad ${this.profileData.nivelConfiabilidadUsuario}`;
    }

    return null;
  }

  get trustScore(): number | null {
    const score = this.isFletero
      ? this.profileData?.scoreConfiabilidad
      : this.profileData?.scoreConfiabilidadUsuario;

    return typeof score === 'number' ? score : null;
  }

  get recommendationValue(): number | null {
    const recomendacion = this.profileData?.recomendacion;
    return typeof recomendacion === 'number' ? recomendacion : null;
  }

  get province(): string | null {
    return this.profileData?.provincia || null;
  }

  get hasContactInfo(): boolean {
    return Boolean(this.profileData?.email || this.profileData?.telefono || this.profileData?.domicilio || this.province);
  }
}
