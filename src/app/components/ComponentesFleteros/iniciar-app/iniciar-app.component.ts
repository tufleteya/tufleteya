import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { Opiniones, UserF, MetricasFletero, FleteEnProceso, VehiculoFletero, TipoVehiculo } from 'src/app/folder/models/models';
import { AuthService } from 'src/app/folder/services/auth.service';
import { FirestoreService } from 'src/app/folder/services/firestore.service';
import { InteractionService } from 'src/app/folder/services/interaction.service';

type VehiculoFormulario = {
  tipoVehiculo: TipoVehiculo;
  marca: string;
  ano: string;
  modelo: string;
  patente: string;
  principal: boolean;
};

@Component({
  selector: 'app-iniciar-app',
  templateUrl: './iniciar-app.component.html',
  styleUrls: ['./iniciar-app.component.scss'],
})
export class IniciarAppComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  login = false;
  fleteroId = '';
  cargando = false;

  metricas: MetricasFletero | null = null;
  viajesFinalizados: FleteEnProceso[] = [];
  viajesCancelados: FleteEnProceso[] = [];
  resenas: Array<Opiniones & { rating?: number; comment?: string; date?: any }> = [];
  reportes: any[] = [];
  vehiculos: VehiculoFletero[] = [];

  mostrarFormularioVehiculo = false;
  vehiculoForm: VehiculoFormulario = this.crearVehiculoVacio();
  estadoCuenta: Pick<UserF, 'verificado' | 'habilitado' | 'bloqueadoPorSancion' | 'bloqueadoPorVencimiento'> = {
    verificado: false,
    habilitado: false,
    bloqueadoPorSancion: false,
    bloqueadoPorVencimiento: false,
  };

  constructor(
    private auth: AuthService,
    private db: FirestoreService,
    private interaction: InteractionService,
    private router: Router,
  ) {}

  ngOnInit() {
    this.auth.stateUser<UserF>()
      .pipe(takeUntil(this.destroy$))
      .subscribe((user) => {
        if (!user) {
          this.login = false;
          return;
        }

        this.login = true;
        this.fleteroId = user.uid;
        this.cargarEstadoCuenta();
        this.cargarDashboard();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  irAFletesDisponibles(): void {
    if (this.cuentaConAccesoRestringido) {
      this.interaction.presentToast('Podés ver pedidos, pero para ver ruta o enviar precio primero completá tu verificación.');
    }
    this.router.navigate(['/fletes/fletesDis']);
  }

  irACompletarVerificacion(): void {
    this.interaction.presentToast('Tu cuenta queda pendiente hasta que un administrador la verifique y habilite.');
  }

  abrirDashboard(): void {
    const target = document.getElementById('dashboard-fletero');
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  toggleFormularioVehiculo(): void {
    this.mostrarFormularioVehiculo = !this.mostrarFormularioVehiculo;
  }

  async guardarVehiculo(): Promise<void> {
    if (!this.fleteroId) return;

    const marca = this.vehiculoForm.marca.trim();
    const modelo = this.vehiculoForm.modelo.trim();
    const ano = this.vehiculoForm.ano.trim();
    const patente = this.vehiculoForm.patente.trim();

    if (!marca || !modelo || !ano || !patente) {
      this.interaction.presentToast('Completá marca, modelo, año y patente.');
      return;
    }

    const id = this.db.createId();
    const esPrincipal = this.vehiculos.length === 0 || this.vehiculoForm.principal;
    const vehiculo: VehiculoFletero = {
      id,
      uid: this.fleteroId,
      tipoVehiculo: this.vehiculoForm.tipoVehiculo,
      marca,
      ano,
      modelo,
      patente,
      principal: esPrincipal,
      imagePatente: '',
      imageDni: '',
      imageCarnet: '',
      imageDniDorzal: '',
      imageCarnetDorzal: '',
      creadoEn: new Date(),
    };

    await this.db.createDoc(vehiculo, `Fleteros/${this.fleteroId}/Vehiculos`, id);

    if (esPrincipal) {
      await this.marcarVehiculoPrincipalLocal(id, vehiculo);
    }

    this.vehiculoForm = this.crearVehiculoVacio();
    this.mostrarFormularioVehiculo = false;
    await this.cargarVehiculos();
    this.interaction.presentToast('Vehículo guardado correctamente.');
  }

  async marcarVehiculoPrincipal(vehiculo: VehiculoFletero): Promise<void> {
    if (!vehiculo.id) return;
    await this.marcarVehiculoPrincipalLocal(vehiculo.id, vehiculo);
    await this.cargarVehiculos();
    this.interaction.presentToast('Vehículo principal actualizado.');
  }

  async eliminarVehiculo(vehiculo: VehiculoFletero): Promise<void> {
    if (!vehiculo.id) return;

    await this.db.deleteDoc(`Fleteros/${this.fleteroId}/Vehiculos`, vehiculo.id);

    if (vehiculo.principal) {
      const restantes = this.vehiculos.filter((item) => item.id !== vehiculo.id);
      if (restantes.length > 0) {
        await this.marcarVehiculoPrincipalLocal(restantes[0].id!, restantes[0]);
      } else {
        await this.db.updateDoc('Fleteros', this.fleteroId, {
          vehiculoPrincipalId: null,
          vehiculoPrincipalResumen: null,
        }).catch(() => undefined);
      }
    }

    await this.cargarVehiculos();
    this.interaction.presentToast('Vehículo eliminado.');
  }

  get promedioResenas(): number {
    if (!this.resenas.length) return 0;
    const total = this.resenas.reduce((sum, review) => sum + Number(review.rating || 0), 0);
    return Math.round((total / this.resenas.length) * 10) / 10;
  }

  get scoreConfiabilidad(): number {
    return Number(this.metricas?.scoreConfiabilidad ?? 0);
  }

  get tasaFinalizacion(): number {
    return Number(this.metricas?.tasaFinalizacion ?? 0);
  }

  get viajesTomados(): number {
    return Number(this.metricas?.viajesTomadosTotal ?? this.viajesFinalizados.length ?? 0);
  }

  get alertasTotales(): number {
    return this.reportes.length;
  }

  get cancelacionesImputables(): number {
    return this.viajesCancelados.filter((viaje) => this.cancelacionAfectaScore(viaje)).length;
  }

  get cuentaConAccesoRestringido(): boolean {
    return !this.estadoCuenta.verificado
      || !this.estadoCuenta.habilitado
      || this.estadoCuenta.bloqueadoPorSancion === true
      || this.estadoCuenta.bloqueadoPorVencimiento === true;
  }

  get estadoCuentaTitulo(): string {
    if (this.estadoCuenta.bloqueadoPorSancion) {
      return 'Cuenta bloqueada por sanción';
    }

    if (this.estadoCuenta.bloqueadoPorVencimiento) {
      return 'Cuenta bloqueada por vencimiento';
    }

    if (!this.estadoCuenta.verificado || !this.estadoCuenta.habilitado) {
      return 'Cuenta pendiente de verificación';
    }

    return 'Cuenta verificada';
  }

  get estadoCuentaDetalle(): string {
    if (this.estadoCuenta.bloqueadoPorSancion) {
      return 'Tenés una sanción activa. Podés revisar pedidos, pero no operar hasta resolverla.';
    }

    if (this.estadoCuenta.bloqueadoPorVencimiento) {
      return 'Tu validación venció. Actualizá la documentación para volver a operar.';
    }

    if (!this.estadoCuenta.verificado || !this.estadoCuenta.habilitado) {
      return 'Podés entrar a la app y ver pedidos, pero para ver ruta y enviar precio necesitás que un administrador verifique y habilite tu cuenta.';
    }

    return 'Tu cuenta está habilitada para operar normalmente.';
  }

  formatearFecha(valor: any): string {
    if (!valor) return 'Sin fecha';

    const fecha = this.convertirAFecha(valor);
    if (!fecha) return 'Sin fecha';

    return fecha.toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  motivoCancelacion(viaje: FleteEnProceso): string {
    return viaje.cancelacion?.motivo || 'Sin motivo informado';
  }

  responsableCancelacion(viaje: FleteEnProceso): string {
    const responsable = viaje.cancelacion?.canceladoPor || 'Sistema';
    if (responsable === 'Fletero') return 'Fletero';
    if (responsable === 'Usuario') return 'Usuario';
    return 'Sistema';
  }

  cancelacionAfectaScore(viaje: FleteEnProceso): boolean {
    const cancelacion = viaje.cancelacion;
    return cancelacion?.canceladoPor === 'Fletero' || cancelacion?.motivo === 'no_inicio_24h';
  }

  claseResponsableCancelacion(viaje: FleteEnProceso): string {
    if (this.cancelacionAfectaScore(viaje)) {
      return 'bg-rose-100 text-rose-700';
    }

    if (viaje.cancelacion?.canceladoPor === 'Usuario') {
      return 'bg-blue-100 text-blue-700';
    }

    return 'bg-slate-100 text-slate-700';
  }

  trackByVehiculo(_: number, vehiculo: VehiculoFletero): string {
    return vehiculo.id || `${vehiculo.marca}-${vehiculo.patente}`;
  }

  private async cargarDashboard(): Promise<void> {
    this.cargando = true;

    try {
      await Promise.all([
        this.cargarMetricas(),
        this.cargarVehiculos(),
        this.cargarReseñas(),
        this.cargarReportes(),
        this.cargarViajesFinalizados(),
        this.cargarViajesCancelados(),
      ]);
    } finally {
      this.cargando = false;
    }
  }

  private async cargarEstadoCuenta(): Promise<void> {
    this.db.getDoc<UserF>('Fleteros', this.fleteroId)
      .pipe(takeUntil(this.destroy$))
      .subscribe((fletero) => {
        this.estadoCuenta = {
          verificado: fletero?.verificado === true,
          habilitado: fletero?.habilitado === true,
          bloqueadoPorSancion: fletero?.bloqueadoPorSancion === true,
          bloqueadoPorVencimiento: fletero?.bloqueadoPorVencimiento === true,
        };
      });
  }

  private async cargarMetricas(): Promise<void> {
    this.db.getDoc<MetricasFletero>('MetricasFleteros', this.fleteroId)
      .pipe(takeUntil(this.destroy$))
      .subscribe((metricas) => {
        this.metricas = metricas || null;
      });
  }

  private async cargarViajesFinalizados(): Promise<void> {
    this.db.obtenerFletesPorEstado(this.fleteroId, 'Finalizado')
      .pipe(takeUntil(this.destroy$))
      .subscribe((fletes) => {
        this.viajesFinalizados = fletes || [];
      });
  }

  private async cargarViajesCancelados(): Promise<void> {
    this.db.obtenerFletesPorEstado(this.fleteroId, 'Cancelado')
      .pipe(takeUntil(this.destroy$))
      .subscribe((fletes) => {
        this.viajesCancelados = fletes || [];
      });
  }

  private async cargarReseñas(): Promise<void> {
    const query = this.db.angularFirestore.collectionGroup('reviews', ref => ref.where('fleteroId', '==', this.fleteroId));
    query.valueChanges({ idField: 'id' })
      .pipe(takeUntil(this.destroy$))
      .subscribe((reviews: any[]) => {
        this.resenas = (reviews || []) as Array<Opiniones & { rating?: number; comment?: string; date?: any }>;
      });
  }

  private async cargarReportes(): Promise<void> {
    const query = this.db.angularFirestore.collection('HistorialSancionesFleteros', ref => ref.where('fleteroId', '==', this.fleteroId));
    query.valueChanges({ idField: 'id' })
      .pipe(takeUntil(this.destroy$))
      .subscribe((reportes: any[]) => {
        this.reportes = reportes || [];
      });
  }

  private async cargarVehiculos(): Promise<void> {
    const vehiculosRef = this.db.angularFirestore.collection(`Fleteros/${this.fleteroId}/Vehiculos`);

    vehiculosRef.valueChanges({ idField: 'id' })
      .pipe(takeUntil(this.destroy$))
      .subscribe(async (vehiculos: VehiculoFletero[]) => {
        if (vehiculos && vehiculos.length > 0) {
          this.vehiculos = this.ordenarVehiculos(vehiculos);
          return;
        }

        const fletero = await firstValueFrom(
          this.db.getDoc<UserF>('Fleteros', this.fleteroId)
        ).catch(() => null);
        const vehiculoPrincipal = fletero?.datosVehiculos || null;

        if (vehiculoPrincipal) {
          this.vehiculos = [{
            ...vehiculoPrincipal,
            id: this.fleteroId,
            principal: true,
          }];
        } else {
          this.vehiculos = [];
        }
      });
  }

  private async marcarVehiculoPrincipalLocal(idPrincipal: string, vehiculoPrincipal: VehiculoFletero): Promise<void> {
    const vehiculosNormalizados = this.vehiculos.map((vehiculo) => ({
      ...vehiculo,
      principal: vehiculo.id === idPrincipal,
    }));

    await Promise.all(
      vehiculosNormalizados
        .filter((vehiculo) => vehiculo.id)
        .map((vehiculo) =>
          this.db.updateDoc(`Fleteros/${this.fleteroId}/Vehiculos`, vehiculo.id!, {
            principal: vehiculo.principal,
          }).catch(() => undefined)
        )
    );

    await this.db.updateDoc('Fleteros', this.fleteroId, {
      vehiculoPrincipalId: idPrincipal,
      vehiculoPrincipalResumen: {
        tipoVehiculo: vehiculoPrincipal.tipoVehiculo,
        marca: vehiculoPrincipal.marca,
        modelo: vehiculoPrincipal.modelo,
        ano: vehiculoPrincipal.ano,
        patente: vehiculoPrincipal.patente,
      },
    }).catch(() => undefined);
  }

  private crearVehiculoVacio(): VehiculoFormulario {
    return {
      tipoVehiculo: 'Camioneta',
      marca: '',
      ano: '',
      modelo: '',
      patente: '',
      principal: false,
    };
  }

  private ordenarVehiculos(vehiculos: VehiculoFletero[]): VehiculoFletero[] {
    return [...vehiculos].sort((a, b) => Number(Boolean(b.principal)) - Number(Boolean(a.principal)));
  }

  private convertirAFecha(valor: any): Date | null {
    if (!valor) return null;

    if (valor instanceof Date) {
      return valor;
    }

    if (typeof valor?.toDate === 'function') {
      return valor.toDate();
    }

    if (typeof valor?.seconds === 'number') {
      return new Date(valor.seconds * 1000 + Math.floor((valor.nanoseconds || 0) / 1_000_000));
    }

    const fecha = new Date(valor);
    return Number.isNaN(fecha.getTime()) ? null : fecha;
  }
}
