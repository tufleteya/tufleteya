import { Component, OnDestroy, OnInit } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { AlertController } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { MetricasUsuario, NotificacionPenalizacionUsuarioAdmin, UserU } from '../../models/models';
import { FirestoreService } from '../../services/firestore.service';

@Component({
  selector: 'app-usuarios-component',
  templateUrl: './usuarios-component.component.html',
})
export class UsuariosComponentComponent implements OnInit, OnDestroy {

  usuarios: Array<UserU & MetricasUsuario & {
    id: string;
    alertaPendiente?: NotificacionPenalizacionUsuarioAdmin | null;
    alertasPendientesCount?: number;
  }> = [];
  cargando = true;
  private usuariosRaw: Array<UserU & { id: string }> = [];
  private metricasRaw: Array<MetricasUsuario & { id: string }> = [];
  private alertasRaw: Array<NotificacionPenalizacionUsuarioAdmin & { id: string }> = [];
  private readonly subs = new Subscription();

  constructor(
    private firestore: AngularFirestore,
    private firestoreService: FirestoreService,
    private alertController: AlertController,
  ) {}

  ngOnInit() {
    this.cargarUsuarios();
    this.cargarMetricasUsuarios();
    this.cargarAlertasUsuarios();
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  cargarUsuarios() {
    this.subs.add(this.firestore
      .collection('Usuarios')
      .snapshotChanges()
      .subscribe({
        next: res => {

        this.usuariosRaw = res
          .map(u => ({
            id: u.payload.doc.id,
            ...(u.payload.doc.data() as any),
          }))
          .filter(u => u.perfil === 'Usuario');

        this.syncUsuarios();
        },
        error: (error) => this.handleLoadError('usuarios', error),
      }));
  }

  cargarMetricasUsuarios() {
    this.subs.add(this.firestore.collection('MetricasUsuarios').snapshotChanges().subscribe({
      next: (res) => {
      this.metricasRaw = res.map((doc) => ({
        id: doc.payload.doc.id,
        ...(doc.payload.doc.data() as any),
      }));

      this.syncUsuarios();
      },
      error: (error) => this.handleLoadError('metricas de usuarios', error),
    }));
  }

  cargarAlertasUsuarios() {
    this.subs.add(this.firestore.collection('AlertasAdminUsuarios', ref =>
      ref.where('estado', '==', 'pendiente')
    ).snapshotChanges().subscribe({
      next: (res) => {
      this.alertasRaw = res.map((doc) => ({
        id: doc.payload.doc.id,
        ...(doc.payload.doc.data() as any),
      }));

      this.syncUsuarios();
      },
      error: (error) => this.handleLoadError('alertas de usuarios', error),
    }));
  }

  private handleLoadError(context: string, error: unknown): void {
    console.error(`Error cargando ${context}:`, error);
    this.cargando = false;
  }

  private syncUsuarios() {
    const metricasMap = new Map(this.metricasRaw.map((metricas) => [metricas.id, metricas]));
    const alertasMap = new Map<string, Array<NotificacionPenalizacionUsuarioAdmin & { id: string }>>();

    this.alertasRaw.forEach((alerta) => {
      const current = alertasMap.get(alerta.usuarioId) || [];
      current.push(alerta);
      alertasMap.set(alerta.usuarioId, current);
    });

    this.usuarios = this.usuariosRaw.map((usuario) => ({
      ...metricasMap.get(usuario.id),
      ...usuario,
      id: usuario.id,
      alertaPendiente: (alertasMap.get(usuario.id) || []).sort((a, b) => {
        const aTime = new Date(a.fecha as any).getTime();
        const bTime = new Date(b.fecha as any).getTime();
        return bTime - aTime;
      })[0] || null,
      alertasPendientesCount: (alertasMap.get(usuario.id) || []).length,
    }));

    this.cargando = false;
  }

  async despenalizarUsuario(usuario: UserU & MetricasUsuario & { id: string; alertaPendiente?: NotificacionPenalizacionUsuarioAdmin | null }) {
    if (!usuario.alertaPendiente?.id) {
      return;
    }

    const alert = await this.alertController.create({
      cssClass: 'tfy-admin-alert',
      header: 'Despenalizar usuario',
      message: `Se va a revertir la penalización por "${usuario.alertaPendiente.motivo}".`,
      inputs: [
        {
          name: 'detalleAdmin',
          type: 'textarea',
          placeholder: 'Motivo interno de despenalización (opcional)',
          value: 'Despenalización manual aprobada por administración.',
        },
      ],
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel',
          cssClass: 'tfy-admin-alert-secondary',
        },
        {
          text: 'Despenalizar',
          role: 'confirm',
          cssClass: 'tfy-admin-alert-primary',
        },
      ],
    });

    await alert.present();
    const result = await alert.onDidDismiss();
    if (result.role !== 'confirm') {
      return;
    }

    const detalleAdmin = (result.data?.values?.detalleAdmin || '').trim() || 'Despenalización manual aprobada por administración.';
    await this.firestoreService.despenalizarUsuario(usuario.alertaPendiente.id, detalleAdmin, 'usuarios');
  }
}
