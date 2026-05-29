import { Component, OnDestroy, OnInit } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { AlertController } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { EventoCancelacionAdmin, HistorialPenalizacionUsuarioAdmin, HistorialSancionFletero, MetricasFletero, MetricasUsuario, NotificacionPenalizacionUsuarioAdmin, UserF, UserU } from '../../models/models';
import { FirestoreService } from '../../services/firestore.service';

@Component({
  selector: 'app-estadisticas-component',
  templateUrl: './estadisticas-component.component.html',
  styleUrls: ['./estadisticas-component.component.scss'],
})
export class EstadisticasComponentComponent  implements OnInit, OnDestroy {

  cargando = true;
  busqueda = '';
  fechaDesde = '';
  fechaHasta = '';
  filtroEtapa: 'todas' | 'antes_de_iniciar' | 'en_viaje' = 'todas';
  filtroSancion: 'todas' | 'normal' | 'advertencia' | 'suspension_automatica' | 'bloqueado_revision' | 'bloqueo_manual' = 'todas';
  filtroVistaReporte: 'todas' | 'solo_alertas_usuario' = 'todas';
  filtroProvincia = 'todas';
  filtroZona = '';
  provinciasDisponibles: string[] = [];

  totalCancelaciones = 0;
  cancelacionesAntesDeIniciar = 0;
  cancelacionesEnViaje = 0;
  cancelacionesSospechosasCercaDestino = 0;
  scorePromedio = 100;
  scoreUsuarioPromedio = 100;
  tasaFinalizacionFleteroPromedio = 100;
  tasaFinalizacionUsuarioPromedio = 100;
  fleterosConAlerta = 0;
  fleterosSuspendidos = 0;
  usuariosConPenalizacionPendiente = 0;

  topMotivos: Array<{ motivo: string; cantidad: number }> = [];
  cancelacionesFiltradas: Array<EventoCancelacionAdmin & { fleteroNombre: string; estadoSancion: string; scoreConfiabilidad: number }> = [];
  fleterosRiesgo: Array<UserF & MetricasFletero & { id: string; nombreCompleto: string }> = [];
  historialSancionesFiltrado: Array<HistorialSancionFletero & { fleteroNombre: string; estadoVista: string }> = [];
  alertasUsuariosPendientesFiltradas: Array<NotificacionPenalizacionUsuarioAdmin & { usuarioNombreVista: string; scoreConfiabilidadUsuario: number; tasaFinalizacion: number }> = [];
  historialPenalizacionesUsuariosFiltrado: Array<HistorialPenalizacionUsuarioAdmin & { usuarioNombreVista: string }> = [];

  private fleterosRaw: Array<UserF & { id: string }> = [];
  private usuariosRaw: Array<UserU & { id: string }> = [];
  private metricasRaw: Array<MetricasFletero & { id: string }> = [];
  private metricasUsuariosRaw: Array<MetricasUsuario & { id: string }> = [];
  private cancelacionesRaw: EventoCancelacionAdmin[] = [];
  private historialSancionesRaw: HistorialSancionFletero[] = [];
  private alertasUsuariosRaw: NotificacionPenalizacionUsuarioAdmin[] = [];
  private historialPenalizacionesUsuariosRaw: HistorialPenalizacionUsuarioAdmin[] = [];
  private subs: Subscription[] = [];

  constructor(
    private firestore: AngularFirestore,
    private firestoreService: FirestoreService,
    private alertController: AlertController,
  ) { }

  ngOnInit() {
    this.subs.push(
      this.firestore.collection('Fleteros').snapshotChanges().subscribe((res) => {
        this.fleterosRaw = res.map((doc) => ({
          id: doc.payload.doc.id,
          ...(doc.payload.doc.data() as any),
        }));
        this.rebuildView();
      })
    );

    this.subs.push(
      this.firestore.collection('Usuarios').snapshotChanges().subscribe((res) => {
        this.usuariosRaw = res.map((doc) => ({
          id: doc.payload.doc.id,
          ...(doc.payload.doc.data() as any),
        })).filter((usuario) => usuario.perfil === 'Usuario');
        this.rebuildView();
      })
    );

    this.subs.push(
      this.firestore.collection('MetricasFleteros').snapshotChanges().subscribe((res) => {
        this.metricasRaw = res.map((doc) => ({
          id: doc.payload.doc.id,
          ...(doc.payload.doc.data() as any),
        }));
        this.rebuildView();
      })
    );

    this.subs.push(
      this.firestore.collection('MetricasUsuarios').snapshotChanges().subscribe((res) => {
        this.metricasUsuariosRaw = res.map((doc) => ({
          id: doc.payload.doc.id,
          ...(doc.payload.doc.data() as any),
        }));
        this.rebuildView();
      })
    );

    this.subs.push(
      this.firestore.collection('ViajesCancelados', ref => ref.orderBy('fechaCancelacion', 'desc').limit(100)).snapshotChanges().subscribe((res) => {
        this.cancelacionesRaw = res.map((doc) => {
          const data = doc.payload.doc.data() as any;
          return {
            id: doc.payload.doc.id,
            ...data,
            fechaCancelacion: this.normalizeDate(data.fechaCancelacion),
          };
        });
        this.rebuildView();
      })
    );

    this.subs.push(
      this.firestore.collection('HistorialSancionesFleteros', ref => ref.orderBy('fecha', 'desc').limit(100)).snapshotChanges().subscribe((res) => {
        this.historialSancionesRaw = res.map((doc) => {
          const data = doc.payload.doc.data() as any;
          return {
            id: doc.payload.doc.id,
            ...data,
            fecha: this.normalizeDate(data.fecha),
          };
        });
        this.rebuildView();
      })
    );

    this.subs.push(
      this.firestore.collection('AlertasAdminUsuarios', ref => ref.orderBy('fecha', 'desc').limit(100)).snapshotChanges().subscribe((res) => {
        this.alertasUsuariosRaw = res.map((doc) => {
          const data = doc.payload.doc.data() as any;
          return {
            id: doc.payload.doc.id,
            ...data,
            fecha: this.normalizeDate(data.fecha),
            fechaResolucion: data.fechaResolucion ? this.normalizeDate(data.fechaResolucion) : null,
          };
        });
        this.rebuildView();
      })
    );

    this.subs.push(
      this.firestore.collection('HistorialPenalizacionesUsuarios', ref => ref.orderBy('fecha', 'desc').limit(100)).snapshotChanges().subscribe((res) => {
        this.historialPenalizacionesUsuariosRaw = res.map((doc) => {
          const data = doc.payload.doc.data() as any;
          return {
            id: doc.payload.doc.id,
            ...data,
            fecha: this.normalizeDate(data.fecha),
          };
        });
        this.rebuildView();
      })
    );
  }

  ngOnDestroy() {
    this.subs.forEach((sub) => sub.unsubscribe());
  }

  onFilterChange() {
    this.rebuildView();
  }

  getSancionClass(estado?: string): string {
    switch (estado) {
      case 'bloqueo_manual':
        return 'bg-slate-200 text-slate-800';
      case 'bloqueado_revision':
        return 'bg-rose-100 text-rose-700';
      case 'suspension_automatica':
        return 'bg-amber-100 text-amber-700';
      case 'advertencia':
        return 'bg-yellow-100 text-yellow-700';
      default:
        return 'bg-emerald-100 text-emerald-700';
    }
  }

  private rebuildView() {
    const metricasMap = new Map(this.metricasRaw.map((metricas) => [metricas.id, metricas]));
    const metricasUsuariosMap = new Map(this.metricasUsuariosRaw.map((metricas) => [metricas.id, metricas]));
    const fleteros: Array<UserF & MetricasFletero & { id: string; nombreCompleto: string }> = this.fleterosRaw.map((fletero) => {
      const metricas = metricasMap.get(fletero.id) || {};
      return {
        ...metricas,
        ...fletero,
        id: fletero.id,
        nombreCompleto: `${fletero.nombre || ''} ${fletero.apellido || ''}`.trim(),
      };
    });
    const usuarios: Array<UserU & MetricasUsuario & { id: string; nombreCompleto: string }> = this.usuariosRaw.map((usuario) => ({
      ...(metricasUsuariosMap.get(usuario.id) || {}),
      ...usuario,
      id: usuario.id,
      nombreCompleto: `${usuario.nombre || ''} ${usuario.apellido || ''}`.trim(),
    }));

    const scores = fleteros.map((item) => Number(item.scoreConfiabilidad ?? 100));
    this.scorePromedio = scores.length
      ? Math.round(scores.reduce((acc, value) => acc + value, 0) / scores.length)
      : 100;
    const scoreUsuarios = usuarios.map((item) => Number(item.scoreConfiabilidadUsuario ?? 100));
    this.scoreUsuarioPromedio = scoreUsuarios.length
      ? Math.round(scoreUsuarios.reduce((acc, value) => acc + value, 0) / scoreUsuarios.length)
      : 100;
    const tasasFletero = fleteros.map((item) => Number(item.tasaFinalizacion ?? 100));
    this.tasaFinalizacionFleteroPromedio = tasasFletero.length
      ? Math.round(tasasFletero.reduce((acc, value) => acc + value, 0) / tasasFletero.length)
      : 100;
    const tasasUsuario = usuarios.map((item) => Number(item.tasaFinalizacion ?? 100));
    this.tasaFinalizacionUsuarioPromedio = tasasUsuario.length
      ? Math.round(tasasUsuario.reduce((acc, value) => acc + value, 0) / tasasUsuario.length)
      : 100;

    this.fleterosConAlerta = fleteros.filter((item) => (item.bloqueoManualAdmin ? 'bloqueo_manual' : (item.estadoSancion || 'normal')) !== 'normal').length;
    this.fleterosSuspendidos = fleteros.filter((item) => ['suspension_automatica', 'bloqueado_revision', 'bloqueo_manual'].includes(item.bloqueoManualAdmin ? 'bloqueo_manual' : (item.estadoSancion || ''))).length;
    this.usuariosConPenalizacionPendiente = usuarios.filter((item) => Boolean(item.penalizacionPendienteAdmin)).length;
    this.provinciasDisponibles = Array.from(new Set([
      ...fleteros.map((item) => item.provincia).filter(Boolean),
      ...usuarios.map((item) => item.provincia).filter(Boolean),
      ...this.cancelacionesRaw.map((item) => item.provinciaFletero).filter(Boolean),
      ...this.cancelacionesRaw.map((item) => item.provinciaUsuario).filter(Boolean),
      ...this.alertasUsuariosRaw.map((item) => item.provinciaUsuario).filter(Boolean),
    ] as string[])).sort();

    const query = this.busqueda.trim().toLowerCase();
    const zonaQuery = this.filtroZona.trim().toLowerCase();
    const filteredFleteros = fleteros.filter((item) => {
      const matchesSearch = !query
        || item.nombreCompleto.toLowerCase().includes(query)
        || (item.email || '').toLowerCase().includes(query)
        || item.id.toLowerCase().includes(query);

      const estadoOperativo = item.bloqueoManualAdmin ? 'bloqueo_manual' : (item.estadoSancion || 'normal');
      const matchesSancion = this.filtroSancion === 'todas' || estadoOperativo === this.filtroSancion;
      const matchesProvincia = this.filtroProvincia === 'todas' || item.provincia === this.filtroProvincia;
      return matchesSearch && matchesSancion && matchesProvincia;
    });

    this.fleterosRiesgo = filteredFleteros
      .sort((a, b) => Number(a.scoreConfiabilidad ?? 100) - Number(b.scoreConfiabilidad ?? 100) || Number(b.cancelacionesTotal ?? 0) - Number(a.cancelacionesTotal ?? 0))
      .slice(0, 12);

    const fleterosMap = new Map(fleteros.map((item) => [item.id, item]));
    const usuariosMap = new Map(usuarios.map((item) => [item.id, item]));
    this.cancelacionesFiltradas = this.cancelacionesRaw
      .map((evento) => {
        const fletero = fleterosMap.get(evento.fleteroId);
        return {
          ...evento,
          fleteroNombre: fletero?.nombreCompleto || evento.fleteroId,
          estadoSancion: fletero?.bloqueoManualAdmin ? 'bloqueo_manual' : (fletero?.estadoSancion || 'normal'),
          scoreConfiabilidad: Number(fletero?.scoreConfiabilidad ?? 100),
        };
      })
      .filter((evento) => {
        const matchesEtapa = this.filtroEtapa === 'todas' || evento.etapa === this.filtroEtapa;
        const matchesSearch = !query
          || evento.fleteroNombre.toLowerCase().includes(query)
          || (evento.motivo || '').toLowerCase().includes(query)
          || (evento.route?.desde || '').toLowerCase().includes(query)
          || (evento.route?.hasta || '').toLowerCase().includes(query);
        const matchesSancion = this.filtroSancion === 'todas' || evento.estadoSancion === this.filtroSancion;
        const matchesProvincia = this.filtroProvincia === 'todas'
          || evento.provinciaFletero === this.filtroProvincia
          || evento.provinciaUsuario === this.filtroProvincia;
        const matchesZona = !zonaQuery
          || (evento.zonaTexto || '').toLowerCase().includes(zonaQuery)
          || (evento.route?.desde || '').toLowerCase().includes(zonaQuery)
          || (evento.route?.hasta || '').toLowerCase().includes(zonaQuery);
        const matchesFecha = this.matchesDateRange(evento.fechaCancelacion);
        return matchesEtapa && matchesSearch && matchesSancion && matchesProvincia && matchesZona && matchesFecha;
      });

    this.totalCancelaciones = this.cancelacionesFiltradas.length;
    this.cancelacionesAntesDeIniciar = this.cancelacionesFiltradas.filter((item) => item.etapa === 'antes_de_iniciar').length;
    this.cancelacionesEnViaje = this.cancelacionesFiltradas.filter((item) => item.etapa === 'en_viaje').length;
    this.cancelacionesSospechosasCercaDestino = this.cancelacionesFiltradas.filter((item) => item.antifraude?.sospechosa).length;

    const motivos = new Map<string, number>();
    this.cancelacionesFiltradas.forEach((evento) => {
      const clave = evento.motivo || 'sin_motivo';
      motivos.set(clave, (motivos.get(clave) || 0) + 1);
    });

    this.topMotivos = Array.from(motivos.entries())
      .map(([motivo, cantidad]) => ({ motivo, cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 6);

    this.historialSancionesFiltrado = this.historialSancionesRaw
      .map((evento) => {
        const fletero = fleterosMap.get(evento.fleteroId);
        return {
          ...evento,
          fleteroNombre: fletero?.nombreCompleto || evento.fleteroId,
          estadoVista: fletero?.bloqueoManualAdmin ? 'bloqueo_manual' : (fletero?.estadoSancion || 'normal'),
        };
      })
      .filter((evento) => {
        const matchesSearch = !query
          || evento.fleteroNombre.toLowerCase().includes(query)
          || (evento.motivo || '').toLowerCase().includes(query)
          || (evento.detalle || '').toLowerCase().includes(query);
        const matchesSancion = this.filtroSancion === 'todas' || evento.estadoVista === this.filtroSancion;
        const fletero = fleterosMap.get(evento.fleteroId);
        const matchesProvincia = this.filtroProvincia === 'todas' || fletero?.provincia === this.filtroProvincia;
        const matchesFecha = this.matchesDateRange(evento.fecha);
        return matchesSearch && matchesSancion && matchesProvincia && matchesFecha;
      })
      .slice(0, 60);

    this.alertasUsuariosPendientesFiltradas = this.alertasUsuariosRaw
      .filter((item) => item.estado === 'pendiente')
      .map((item) => {
        const usuario = usuariosMap.get(item.usuarioId);
        return {
          ...item,
          usuarioNombreVista: usuario?.nombreCompleto || item.usuarioNombre || item.usuarioId,
          scoreConfiabilidadUsuario: Number(usuario?.scoreConfiabilidadUsuario ?? 100),
          tasaFinalizacion: Number(usuario?.tasaFinalizacion ?? 100),
        };
      })
      .filter((item) => {
        const matchesSearch = !query
          || item.usuarioNombreVista.toLowerCase().includes(query)
          || (item.motivo || '').toLowerCase().includes(query)
          || (item.zonaTexto || '').toLowerCase().includes(query);
        const matchesEtapa = this.filtroEtapa === 'todas' || item.etapa === this.filtroEtapa;
        const matchesProvincia = this.filtroProvincia === 'todas' || item.provinciaUsuario === this.filtroProvincia;
        const matchesZona = !zonaQuery || (item.zonaTexto || '').toLowerCase().includes(zonaQuery);
        const matchesFecha = this.matchesDateRange(item.fecha);
        return matchesSearch && matchesEtapa && matchesProvincia && matchesZona && matchesFecha;
      })
      .slice(0, 60);

    this.historialPenalizacionesUsuariosFiltrado = this.historialPenalizacionesUsuariosRaw
      .map((item) => ({
        ...item,
        usuarioNombreVista: usuariosMap.get(item.usuarioId)?.nombreCompleto || item.usuarioId,
      }))
      .filter((item) => {
        const matchesSearch = !query
          || item.usuarioNombreVista.toLowerCase().includes(query)
          || (item.motivo || '').toLowerCase().includes(query)
          || (item.detalle || '').toLowerCase().includes(query);
        const usuario = usuariosMap.get(item.usuarioId);
        const matchesProvincia = this.filtroProvincia === 'todas' || usuario?.provincia === this.filtroProvincia;
        const matchesEtapa = this.filtroEtapa === 'todas' || item.etapa === this.filtroEtapa;
        const matchesFecha = this.matchesDateRange(item.fecha);
        return matchesSearch && matchesProvincia && matchesEtapa && matchesFecha;
      })
      .slice(0, 60);

    this.cargando = false;
  }

  private matchesDateRange(value: Date): boolean {
    const date = new Date(value);
    if (this.fechaDesde) {
      const from = new Date(this.fechaDesde);
      from.setHours(0, 0, 0, 0);
      if (date < from) {
        return false;
      }
    }

    if (this.fechaHasta) {
      const to = new Date(this.fechaHasta);
      to.setHours(23, 59, 59, 999);
      if (date > to) {
        return false;
      }
    }

    return true;
  }

  private normalizeDate(value: any): Date {
    if (!value) {
      return new Date();
    }

    if (typeof value?.toDate === 'function') {
      return value.toDate();
    }

    return new Date(value);
  }

  async despenalizarDesdeReportes(item: NotificacionPenalizacionUsuarioAdmin & { usuarioNombreVista: string }) {
    if (!item.id) {
      return;
    }

    const alert = await this.alertController.create({
      cssClass: 'tfy-admin-alert',
      header: 'Despenalizar usuario',
      message: `Se va a revertir la penalización de ${item.usuarioNombreVista} por "${item.motivo}".`,
      inputs: [
        {
          name: 'detalleAdmin',
          type: 'textarea',
          placeholder: 'Motivo interno de despenalización (opcional)',
          value: 'Despenalización manual aprobada desde reportes.',
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

    const detalleAdmin = (result.data?.values?.detalleAdmin || '').trim() || 'Despenalización manual aprobada desde reportes.';
    await this.firestoreService.despenalizarUsuario(item.id, detalleAdmin, 'reportes');
  }

}
