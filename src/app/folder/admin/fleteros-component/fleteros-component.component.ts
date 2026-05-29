import { Component, OnDestroy, OnInit } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import firebase from 'firebase/compat/app';
import { Subscription } from 'rxjs';
import { EstadoRevisionDocumento, MetricasFletero, UserF, VehiculoFletero } from '../../models/models';
import { FirestoreService } from '../../services/firestore.service';

type ReasonCatalogKey =
  | 'apelacion'
  | 'levantarSancion'
  | 'bloqueoManual'
  | 'desbloqueoManual'
  | 'rechazoApelacion';

type ConfiguracionOperacionAdmin = {
  pagoSeniaHabilitado: boolean;
  antifraudeCancelacionCercaDestinoHabilitado: boolean;
  distanciaDestinoSospechosaMetros: number;
};

@Component({
  selector: 'app-fleteros-component',
  templateUrl: './fleteros-component.component.html',
})
export class FleterosComponentComponent implements OnInit, OnDestroy {

  fleteros: Array<UserF & MetricasFletero & { id: string }> = [];
  selectedFletero: (UserF & MetricasFletero & { id: string }) | null = null;
  selectedVehiculos: VehiculoFletero[] = [];
  detailModalOpen = false;
  cargandoDetalle = false;
  cargando = true;
  private fleterosRaw: Array<UserF & { id: string }> = [];
  private metricasRaw: Array<MetricasFletero & { id: string }> = [];
  private readonly subs = new Subscription();
  private readonly defaultReasonCatalog: Record<ReasonCatalogKey, string[]> = {
    apelacion: [
      'Documentación de respaldo presentada',
      'Cancelación atribuible al usuario',
      'Falla técnica validada',
      'Incidente de seguridad justificado',
      'Error de clasificación automática'
    ],
    levantarSancion: [
      'Se valida apelación y corresponde levantar sanción',
      'Se comprobó error operativo del sistema',
      'La evidencia favorece al fletero',
      'Sanción ya cumplida y se rehabilita la cuenta',
      'Caso excepcional aprobado por administración'
    ],
    bloqueoManual: [
      'Reincidencia operativa detectada',
      'Incumplimiento grave de servicio',
      'Conducta inapropiada reportada',
      'Falta de documentación o validación',
      'Revisión preventiva por auditoría'
    ],
    desbloqueoManual: [
      'Se completó la revisión administrativa',
      'La evidencia fue satisfactoria',
      'Se regularizó la documentación',
      'Cumplió el período de bloqueo manual',
      'Se cerró el incidente operativo'
    ],
    rechazoApelacion: [
      'No se aportó evidencia suficiente',
      'La reincidencia mantiene la sanción',
      'La cancelación fue responsabilidad del fletero',
      'La revisión administrativa confirma la sanción',
      'Se detectó inconsistencia en la apelación'
    ]
  };
  private customReasonCatalog: Partial<Record<ReasonCatalogKey, string[]>> = {};
  reasonModalOpen = false;
  reasonModalTitle = '';
  reasonModalSubtitle = '';
  reasonModalKey: ReasonCatalogKey = 'bloqueoManual';
  reasonModalSelected = '';
  reasonModalCustomReason = '';
  readonly reasonSelectOptions = { cssClass: 'tfy-admin-popover' };
  private reasonModalResolver: ((value: string | null) => void) | null = null;
  guardandoHabilitado: Record<string, boolean> = {};
  guardandoVerificado: Record<string, boolean> = {};
  guardandoOperacion = false;
  operacionConfig: ConfiguracionOperacionAdmin = {
    pagoSeniaHabilitado: false,
    antifraudeCancelacionCercaDestinoHabilitado: true,
    distanciaDestinoSospechosaMetros: 200,
  };

  constructor(
    private firestore: AngularFirestore,
    private firestoreService: FirestoreService
  ) {}

  ngOnInit() {
    this.cargarFleteros();
    this.cargarMetricas();
    this.cargarMotivosPersonalizados();
    this.cargarConfiguracionOperacion();
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  cargarMotivosPersonalizados() {
    this.subs.add(this.firestore.doc<Partial<Record<ReasonCatalogKey, string[]>>>('ConfiguracionAdmin/motivosSancion')
      .valueChanges()
      .subscribe({
        next: config => {
        this.customReasonCatalog = config || {};
        },
        error: (error) => this.handleLoadError('motivos personalizados', error),
      }));
  }

  cargarConfiguracionOperacion() {
    this.subs.add(this.firestore.doc<Partial<ConfiguracionOperacionAdmin>>('ConfiguracionAdmin/operacion')
      .valueChanges()
      .subscribe({
        next: config => {
          this.operacionConfig = {
            pagoSeniaHabilitado: Boolean(config?.pagoSeniaHabilitado),
            antifraudeCancelacionCercaDestinoHabilitado: config?.antifraudeCancelacionCercaDestinoHabilitado !== false,
            distanciaDestinoSospechosaMetros: Number(config?.distanciaDestinoSospechosaMetros || 200),
          };
        },
        error: (error) => this.handleLoadError('configuracion operativa', error),
      }));
  }

  async guardarConfiguracionOperacion() {
    const distancia = Math.max(50, Math.min(5000, Math.round(Number(this.operacionConfig.distanciaDestinoSospechosaMetros) || 200)));
    this.guardandoOperacion = true;

    try {
      await this.firestore.collection('ConfiguracionAdmin').doc('operacion').set({
        pagoSeniaHabilitado: Boolean(this.operacionConfig.pagoSeniaHabilitado),
        antifraudeCancelacionCercaDestinoHabilitado: Boolean(this.operacionConfig.antifraudeCancelacionCercaDestinoHabilitado),
        distanciaDestinoSospechosaMetros: distancia,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      this.operacionConfig.distanciaDestinoSospechosaMetros = distancia;
    } catch (error) {
      console.error('Error al guardar configuracion operativa', error);
      alert('No se pudo guardar la configuracion operativa.');
    } finally {
      this.guardandoOperacion = false;
    }
  }

  cargarFleteros() {
    this.subs.add(this.firestore.collection('Fleteros', ref =>
      ref.orderBy('apellido')
    ).snapshotChanges().subscribe({
      next: res => {

      this.fleterosRaw = res.map(doc => {
        const data = doc.payload.doc.data() as any; // 👈 clave
        return {
          id: doc.payload.doc.id,
          ...data
        };
      });

      this.syncFleteros();
      },
      error: (error) => this.handleLoadError('fleteros', error),
    }));
  }

  cargarMetricas() {
    this.subs.add(this.firestore.collection('MetricasFleteros').snapshotChanges().subscribe({
      next: res => {
      this.metricasRaw = res.map(doc => ({
        id: doc.payload.doc.id,
        ...(doc.payload.doc.data() as any),
      }));

      this.syncFleteros();
      },
      error: (error) => this.handleLoadError('metricas de fleteros', error),
    }));
  }

  private handleLoadError(context: string, error: unknown): void {
    console.error(`Error cargando ${context}:`, error);
    this.cargando = false;
  }

  private syncFleteros() {
    const metricasMap = new Map(this.metricasRaw.map((metricas) => [metricas.id, metricas]));

    this.fleteros = this.fleterosRaw.map((fletero) => ({
      ...metricasMap.get(fletero.id),
      ...fletero,
      id: fletero.id,
    }));

    this.cargando = false;
  }

  private normalizarFecha(valor: any): Date | null {
    if (!valor) {
      return null;
    }

    if (valor instanceof Date) {
      return valor;
    }

    if (typeof valor?.toDate === 'function') {
      return valor.toDate();
    }

    if (typeof valor?.seconds === 'number') {
      return new Date(valor.seconds * 1000);
    }

    const parsed = new Date(valor);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  formatearFecha(valor: any): string {
    const fecha = this.normalizarFecha(valor);
    if (!fecha) {
      return 'Sin fecha';
    }

    return fecha.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  getEstadoRegistro(fletero: UserF & MetricasFletero & { id: string }): string {
    if (fletero.bloqueoManualAdmin) {
      return 'Bloqueo manual';
    }

    if (fletero.bloqueadoPorVencimiento) {
      return 'Vencido';
    }

    if (fletero.bloqueadoPorSancion) {
      return 'Bloqueado por sanción';
    }

    if (!fletero.habilitado) {
      return 'Pendiente';
    }

    const estadoRegistro = (fletero.estadoRegistro || 'Activo').toLowerCase();

    switch (estadoRegistro) {
      case 'auth':
        return 'Autenticado';
      case 'vehiculo':
        return 'Vehículo';
      case 'documentacion':
        return 'Documentación';
      case 'pendiente_revision':
        return 'Pendiente de revisión';
      case 'completo':
        return 'Completo';
      default:
        return fletero.estadoRegistro || 'Activo';
    }
  }

  getDocumentacionEstado(fletero: UserF & MetricasFletero & { id: string }): string {
    return fletero.documentacionCompleta ? 'Completa' : 'Pendiente';
  }

  getAntecedentesEstado(fletero: UserF & MetricasFletero & { id: string }): string {
    if (fletero.antecedentesPenales?.aprobado) {
      return 'Aprobados';
    }

    if (fletero.antecedentesPenales?.url) {
      return 'En revisión';
    }

    return 'Pendientes';
  }

  getVencimientoEstado(fletero: UserF & MetricasFletero & { id: string }): string {
    if (fletero.bloqueadoPorVencimiento) {
      return 'Vencido';
    }

    const vencimiento = this.normalizarFecha(fletero.fechaVencimientoVerificacion);
    if (!vencimiento) {
      return 'Sin vencimiento';
    }

    const restante = vencimiento.getTime() - Date.now();
    if (restante <= 0) {
      return 'Vencido';
    }

    const dias = Math.ceil(restante / (1000 * 60 * 60 * 24));
    return `${dias} día${dias === 1 ? '' : 's'}`;
  }

  getEstadoRegistroClass(fletero: UserF & MetricasFletero & { id: string }): string {
    const estado = this.getEstadoRegistro(fletero).toLowerCase();

    if (estado.includes('venc')) {
      return 'bg-rose-100 text-rose-700';
    }

    if (estado.includes('bloqueo')) {
      return 'bg-slate-200 text-slate-800';
    }

    if (estado.includes('pendiente')) {
      return 'bg-amber-100 text-amber-700';
    }

    return 'bg-emerald-100 text-emerald-700';
  }

  getDocumentoClass(fletero: UserF & MetricasFletero & { id: string }): string {
    return fletero.documentacionCompleta
      ? 'bg-emerald-100 text-emerald-700'
      : 'bg-amber-100 text-amber-700';
  }

  getAntecedentesClass(fletero: UserF & MetricasFletero & { id: string }): string {
    if (fletero.antecedentesPenales?.aprobado) {
      return 'bg-emerald-100 text-emerald-700';
    }

    if (fletero.antecedentesPenales?.url) {
      return 'bg-sky-100 text-sky-700';
    }

    return 'bg-slate-100 text-slate-500';
  }

  async abrirDetalleFletero(fletero: UserF & MetricasFletero & { id: string }) {
    this.selectedFletero = fletero;
    this.selectedVehiculos = [];
    this.detailModalOpen = true;
    this.cargandoDetalle = true;

    try {
      const snap = await this.firestore.collection<VehiculoFletero>(`Fleteros/${fletero.id}/Vehiculos`).ref.get();
      const vehiculos = snap.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as VehiculoFletero),
      }));

      this.selectedVehiculos = vehiculos.length > 0
        ? vehiculos.sort((a, b) => Number(Boolean(b.principal)) - Number(Boolean(a.principal)))
        : (fletero.datosVehiculos ? [{ ...fletero.datosVehiculos, id: fletero.id, principal: true }] : []);
    } catch (error) {
      console.error('Error cargando detalle del fletero:', error);
      this.selectedVehiculos = fletero.datosVehiculos ? [{ ...fletero.datosVehiculos, id: fletero.id, principal: true }] : [];
    } finally {
      this.cargandoDetalle = false;
    }
  }

  cerrarDetalleFletero() {
    this.detailModalOpen = false;
    this.selectedFletero = null;
    this.selectedVehiculos = [];
    this.cargandoDetalle = false;
  }

  getArchivoVehiculo(vehiculo: VehiculoFletero, key: keyof VehiculoFletero): string {
    const value = vehiculo?.[key];
    return typeof value === 'string' ? value : '';
  }

  async toggleHabilitado(fletero: UserF & MetricasFletero & { id: string }, event: CustomEvent) {
    const habilitado = Boolean(event.detail?.checked);
    this.guardandoHabilitado[fletero.id] = true;

    try {
      await this.firestoreService.setHabilitadoFletero(fletero.id, habilitado);
    } finally {
      this.guardandoHabilitado[fletero.id] = false;
    }
  }

  async toggleVerificado(fletero: UserF & MetricasFletero & { id: string }, event: CustomEvent) {
    const verificado = Boolean(event.detail?.checked);
    this.guardandoVerificado[fletero.id] = true;

    try {
      await this.firestoreService.setVerificadoFletero(fletero.id, verificado);
    } finally {
      this.guardandoVerificado[fletero.id] = false;
    }
  }

  getDniEstado(fletero: UserF & MetricasFletero & { id: string }): string {
    const estado = fletero.verificacionDni?.estado || 'pendiente';

    if (estado === 'aprobado') {
      return 'Aprobado';
    }

    if (estado === 'rechazado') {
      return 'Rechazado';
    }

    return 'Pendiente';
  }

  getDniEstadoClass(fletero: UserF & MetricasFletero & { id: string }): string {
    const estado = fletero.verificacionDni?.estado || 'pendiente';

    if (estado === 'aprobado') {
      return 'bg-emerald-100 text-emerald-700';
    }

    if (estado === 'rechazado') {
      return 'bg-rose-100 text-rose-700';
    }

    return 'bg-amber-100 text-amber-700';
  }

  async actualizarRevisionDni(
    fletero: UserF & MetricasFletero & { id: string },
    estado: Exclude<EstadoRevisionDocumento, 'pendiente'>
  ) {
    const observacion = estado === 'aprobado'
      ? 'DNI validado manualmente desde admin.'
      : 'DNI rechazado. Requiere nueva carga o corrección.';

    await this.firestoreService.revisarDniFletero(fletero.id, estado, observacion);
  }

  async toggleBloqueoManual(fletero: UserF & MetricasFletero & { id: string }) {
    const bloquear = !fletero.bloqueoManualAdmin;
    const motivo = await this.selectReasonFromDropdown(
      bloquear ? 'bloqueoManual' : 'desbloqueoManual',
      bloquear ? 'Bloqueo manual' : 'Desbloqueo manual',
      bloquear ? 'Seleccioná el motivo del bloqueo' : 'Seleccioná el motivo del desbloqueo',
      fletero.motivoBloqueoManual || ''
    );

    if (!motivo) {
      return;
    }

    await this.firestoreService.setBloqueoManualFletero(fletero.id, bloquear, motivo);
  }

  async marcarApelacion(fletero: UserF & MetricasFletero & { id: string }) {
    const detalle = await this.selectReasonFromDropdown(
      'apelacion',
      'Marcar apelación',
      'Seleccioná el motivo de la apelación',
      fletero.apelacionDetalle || ''
    );

    if (!detalle) {
      return;
    }

    await this.firestoreService.marcarApelacionPendienteFletero(fletero.id, detalle);
  }

  async resolverApelacion(fletero: UserF & MetricasFletero & { id: string }, aprobar: boolean) {
    const detalle = await this.selectReasonFromDropdown(
      aprobar ? 'levantarSancion' : 'rechazoApelacion',
      aprobar ? 'Levantar sanción' : 'Rechazar apelación',
      aprobar ? 'Seleccioná el motivo del levantamiento' : 'Seleccioná el motivo del rechazo',
      fletero.apelacionDetalle || ''
    );

    if (!detalle) {
      return;
    }

    await this.firestoreService.resolverApelacionFletero(
      fletero.id,
      aprobar,
      detalle
    );
  }

  getReasonOptions(kind: ReasonCatalogKey): string[] {
    const defaults = this.defaultReasonCatalog[kind] || [];
    const custom = this.customReasonCatalog[kind] || [];

    return [...new Set([...defaults, ...custom])];
  }

  getReasonImpactTitle(): string {
    switch (this.reasonModalKey) {
      case 'bloqueoManual':
        return 'Impacto: bloquea la operacion del fletero';
      case 'desbloqueoManual':
        return 'Impacto: retira el bloqueo manual';
      case 'apelacion':
        return 'Impacto: deja la apelacion pendiente de revision';
      case 'levantarSancion':
        return 'Impacto: rehabilita la cuenta si no hay otro bloqueo activo';
      case 'rechazoApelacion':
        return 'Impacto: mantiene la sancion vigente';
      default:
        return 'Impacto administrativo';
    }
  }

  getReasonImpactBody(): string {
    switch (this.reasonModalKey) {
      case 'bloqueoManual':
        return 'El fletero puede seguir visible en el panel, pero no deberia operar hasta que admin levante el bloqueo.';
      case 'desbloqueoManual':
        return 'La cuenta vuelve a depender de su estado automatico, verificacion, habilitacion y vencimientos.';
      case 'apelacion':
        return 'No levanta la sancion por si sola: solo marca que existe evidencia o reclamo para revisar.';
      case 'levantarSancion':
        return 'Se aprueba la apelacion o revision y se limpia la sancion automatica asociada al caso.';
      case 'rechazoApelacion':
        return 'La sancion sigue activa y queda registrado el motivo de la decision administrativa.';
      default:
        return 'La accion queda registrada para trazabilidad.';
    }
  }

  private async selectReasonFromDropdown(
    kind: ReasonCatalogKey,
    title: string,
    subtitle: string,
    fallbackValue: string
  ): Promise<string | null> {
    this.reasonModalKey = kind;
    this.reasonModalTitle = title;
    this.reasonModalSubtitle = subtitle;
    this.reasonModalCustomReason = '';

    const options = this.getReasonOptions(kind);
    this.reasonModalSelected = options.includes(fallbackValue) ? fallbackValue : (options[0] || '');
    this.reasonModalOpen = true;

    return new Promise<string | null>((resolve) => {
      this.reasonModalResolver = resolve;
    });
  }

  async confirmReasonModal() {
    const customReason = this.reasonModalCustomReason.trim();

    if (customReason) {
      await this.saveCustomReason(this.reasonModalKey, customReason);
      this.closeReasonModal(customReason);
      return;
    }

    const selectedReason = this.reasonModalSelected.trim();
    if (!selectedReason) {
      return;
    }

    this.closeReasonModal(selectedReason);
  }

  cancelReasonModal() {
    this.closeReasonModal(null);
  }

  private closeReasonModal(value: string | null) {
    this.reasonModalOpen = false;
    this.reasonModalTitle = '';
    this.reasonModalSubtitle = '';
    this.reasonModalSelected = '';
    this.reasonModalCustomReason = '';

    if (this.reasonModalResolver) {
      this.reasonModalResolver(value);
      this.reasonModalResolver = null;
    }
  }

  private async saveCustomReason(kind: ReasonCatalogKey, reason: string) {
    const normalized = reason.trim();

    if (!normalized) {
      return;
    }

    await this.firestore.collection('ConfiguracionAdmin').doc('motivosSancion').set({
      [kind]: firebase.firestore.FieldValue.arrayUnion(normalized)
    }, { merge: true });
  }

  getEstadoOperativo(fletero: UserF & MetricasFletero & { id: string }): string {
    if (fletero.bloqueoManualAdmin) {
      return 'bloqueo_manual';
    }

    if (fletero.bloqueadoPorVencimiento) {
      return 'bloqueado_vencimiento';
    }

    if (fletero.bloqueadoPorSancion) {
      return 'bloqueado_sancion';
    }

    return fletero.estadoSancion || 'normal';
  }

  getSancionClass(estado?: string): string {
    switch (estado) {
      case 'bloqueo_manual':
        return 'bg-slate-200 text-slate-800';
      case 'bloqueado_vencimiento':
        return 'bg-rose-100 text-rose-700';
      case 'bloqueado_sancion':
        return 'bg-orange-100 text-orange-700';
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
}
