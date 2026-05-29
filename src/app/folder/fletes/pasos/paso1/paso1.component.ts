import { Component, Input } from '@angular/core';
import { formatDate } from '@angular/common';
import { IonContent, LoadingController, ModalController, ToastController } from '@ionic/angular';
import { Observable } from 'rxjs';

import {
  ayudantes,
  DatosFlete,
  ParadaRuta,
  provincias,
  tipoVehiculo,
  UserF,
  UserU,
} from 'src/app/folder/models/models';
import { AuthService } from 'src/app/folder/services/auth.service';
import { FirestoreService } from 'src/app/folder/services/firestore.service';
import { InteractionService } from 'src/app/folder/services/interaction.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-paso1',
  templateUrl: './paso1.component.html',
  styleUrls: ['./paso1.component.scss'],
})
export class Paso1Component {
  @Input() scrollContent?: IonContent;

  rol: 'Usuario' | 'Fletero' | 'Admin' = null;
  minDate: string;
  private formularioEnviado = false;
  currentStep = 1;

  registerU: UserU;
  loading: any;
  data: any;
  startCoordinates: { latitude: number; longitude: number } | null = null;
  endCoordinates: { latitude: number; longitude: number } | null = null;
  vehiculos = tipoVehiculo;
  ayudante = ayudantes;
  accesosCarga: Array<'Planta baja' | '2do piso o más'> = ['Planta baja', '2do piso o más'];
  provincia = provincias;
  fechaBase: Date;
  tiempoTranscurrido: string;
  items = [];
  valueSelected: any = '1';
  pasosFlete: DatosFlete = {
    nombre: '',
    apellido: '',
    fecha: '',
    hora: null,
    minutos: null,
    uDesde: '',
    uHasta: '',
    cargamento: '',
    accesoCarga: 'Planta baja',
    tipoServicio: 'Ninguno',
    tipoVehiculo: null,
    ayudantes: null,
    uid: '',
    id: '',
    precio: null,
    paradas: [],
  };
  tiempoTranscurrido$: Observable<string>;

  fechaSeleccionada: string | null = null;
  horaSeleccionada: string | null = null;
  readonly hourOptions = Array.from({ length: 12 }, (_, index) => index + 1);
  readonly minuteOptions = [0, 15, 30, 45];

  constructor(
    private db: FirestoreService,
    private interaction: InteractionService,
    private authS: AuthService,
    private modal: ModalController,
    public toastController: ToastController,
    private loadingCtrl: LoadingController,
    private router: Router
  ) {
    const fechaActual = new Date();
    const horaActual = fechaActual.getHours();
    const minutosActuales = fechaActual.getMinutes();

    this.fechaBase = new Date();
    this.minDate = formatDate(new Date(), 'yyyy-MM-dd', 'en-US');
    this.fechaSeleccionada = fechaActual.toISOString();
    this.horaSeleccionada = fechaActual.toISOString();
    this.pasosFlete = {
      id: '',
      nombre: '',
      apellido: '',
      fecha: fechaActual.toISOString(),
      hora: horaActual,
      minutos: minutosActuales,
      uDesde: '',
      uHasta: '',
      tipoServicio: 'Ninguno',
      cargamento: '',
      accesoCarga: 'Planta baja',
      tipoVehiculo: null,
      ayudantes: null,
      uid: '',
      precio: null,
      paradas: [],
      tiempoTranscurrido: '',
    };
  }

  get paradasSeleccionadas(): ParadaRuta[] {
    return this.pasosFlete.paradas || [];
  }

  get tieneRutaConfigurada(): boolean {
    return Boolean(this.startCoordinates && this.endCoordinates);
  }

  get routeDistanceLabel(): string {
    if (!this.pasosFlete.routeDistanceKm) {
      return '';
    }

    return `${this.pasosFlete.routeDistanceKm.toFixed(1)} km`;
  }

  get routeDurationLabel(): string {
    const duration = this.pasosFlete.routeDurationMinutes;
    if (!duration) {
      return '';
    }

    if (duration < 60) {
      return `${duration} min`;
    }

    const hours = Math.floor(duration / 60);
    const minutes = duration % 60;
    return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
  }

  get fechaResumenLabel(): string {
    const fecha = this.buildSelectedDate();

    return fecha.toLocaleDateString('es-AR', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
    });
  }

  get horaResumenLabel(): string {
    const time = this.getSelectedTimeParts();
    return `${String(time.hours).padStart(2, '0')}:${String(time.minutes).padStart(2, '0')}`;
  }

  get selectedHour(): number {
    const hours = this.getSelectedTimeParts().hours % 12;
    return hours === 0 ? 12 : hours;
  }

  get selectedMinute(): number {
    return this.getSelectedTimeParts().minutes;
  }

  get selectedPeriod(): 'AM' | 'PM' {
    return this.getSelectedTimeParts().hours < 12 ? 'AM' : 'PM';
  }

  trackByParada(index: number, parada: ParadaRuta): string {
    return parada.id || `parada-${index}`;
  }

  async enviarDatos() {
    await this.interaction.presentLoading('Enviando...');

    if (this.validateForm()) {
      const startCoordinates = this.startCoordinates;
      const endCoordinates = this.endCoordinates;

      this.authS.stateUser<UserU>().subscribe((res) => {
        if (res) {
          const path = 'Usuarios';
          this.db.getDoc<UserF>(path, res.uid).subscribe(() => {
            this.db.getDoc<UserU>('Usuarios', res.uid).subscribe((usuarioRoot) => {
              const cargarPedido = (res2: UserU) => {
                if (!res2) {
                  this.interaction.closeLoading();
                  this.interaction.presentToast('No encontramos tus datos de usuario.');
                  return;
                }

              const data: DatosFlete = {
                ...this.pasosFlete,
                paradas: [...(this.pasosFlete.paradas || [])],
              };
              data.id = this.db.createId();
              data.uid = res.uid;
              data.nombre = res2.nombre;
              data.apellido = res2.apellido;

              const fechaBase = new Date(this.pasosFlete.fecha);
              data.hora = fechaBase.getHours();
              data.minutos = fechaBase.getMinutes();
              data.uDesde = this.pasosFlete.uDesde;
              data.uHasta = this.pasosFlete.uHasta;
              data.cargamento = this.pasosFlete.cargamento;
              data.accesoCarga = this.pasosFlete.accesoCarga || 'Planta baja';
              data.tipoVehiculo = this.pasosFlete.tipoVehiculo;
              data.ayudantes = this.pasosFlete.ayudantes;
              data.startCoordinates = startCoordinates;
              data.endCoordinatesP = endCoordinates;
              data.paradas = this.pasosFlete.paradas || [];
              data.routeDistanceKm = this.pasosFlete.routeDistanceKm;
              data.routeDurationMinutes = this.pasosFlete.routeDurationMinutes;
              data.image = res2.image;

              const enlace = `PedirFlete/${res.uid}/Pedidos`;
              const pedidoId = data.id;
              data.timestamp = new Date();
              const pedidoRootPath = 'PedirFlete';
              const pedidoRootData = {
                uid: res.uid,
                updatedAt: new Date(),
              };

              this.interaction.closeLoading();

              if (!this.formularioEnviado) {
                this.db.createDocument(pedidoRootData, pedidoRootPath, res.uid).then(() => {
                  this.db.createDocument<DatosFlete>(data, enlace, pedidoId).then(() => {
                  this.interaction.presentToast('Enviado con exito');
                  this.interaction.closeLoading();
                  this.formularioEnviado = true;
                  this.resetPedidoForm();
                  this.router.navigate(['/fletes/precios'], {
                    queryParams: {
                      segmento: 'pedidos',
                      pedidoId,
                    },
                    replaceUrl: true,
                  });
                  });
                });
              }
              };

              if (usuarioRoot) {
                cargarPedido(usuarioRoot);
                return;
              }

              const personalPath = `Usuarios/${res.uid}/DatosPersonales`;
              this.db.getDoc<UserU>(personalPath, res.uid).subscribe(cargarPedido);
            });
          });
        }
      });
    } else {
      this.interaction.closeLoading();
      this.interaction.presentToast('Debes terminar de hacer el pedido');
      console.log('Formulario no valido. Corrige los datos faltantes.');
    }
  }

  private resetPedidoForm(): void {
    const fechaActual = new Date();

    this.startCoordinates = null;
    this.endCoordinates = null;
    this.valueSelected = '1';
    this.fechaBase = new Date();
    this.minDate = formatDate(new Date(), 'yyyy-MM-dd', 'en-US');
    this.fechaSeleccionada = fechaActual.toISOString();
    this.horaSeleccionada = fechaActual.toISOString();
    this.pasosFlete = {
      id: '',
      nombre: '',
      apellido: '',
      fecha: fechaActual.toISOString(),
      hora: fechaActual.getHours(),
      minutos: fechaActual.getMinutes(),
      uDesde: '',
      uHasta: '',
      cargamento: '',
      accesoCarga: 'Planta baja',
      tipoServicio: 'Ninguno',
      tipoVehiculo: null,
      ayudantes: null,
      uid: '',
      precio: null,
      paradas: [],
      tiempoTranscurrido: '',
      routeDistanceKm: null,
      routeDurationMinutes: null,
      startCoordinates: null,
      endCoordinatesP: null,
    };
  }

  goToDatosPedido() {
    const fechaBase = this.buildSelectedDate();
    const horaBase = this.getSelectedTimeParts();

    fechaBase.setHours(horaBase.hours, horaBase.minutes, 0, 0);
    this.pasosFlete.fecha = fechaBase.toISOString();
    this.pasosFlete.hora = fechaBase.getHours();
    this.pasosFlete.minutos = fechaBase.getMinutes();
    this.valueSelected = '2';
    this.scrollToTopAfterStepChange();
  }

  private scrollToTopAfterStepChange(): void {
    const scroll = () => {
      if (this.scrollContent?.scrollToTop) {
        void this.scrollContent.scrollToTop(350);
        return;
      }

      const content = document.querySelector('ion-content.background2') as any;
      if (content?.scrollToTop) {
        void content.scrollToTop(350);
        return;
      }

      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    requestAnimationFrame(scroll);
    setTimeout(scroll, 80);
    setTimeout(scroll, 220);
  }

  onHourSelect(event: Event): void {
    const time = this.getSelectedTimeParts();
    const displayHour = Number((event.target as HTMLSelectElement).value);
    const hours = this.toTwentyFourHour(displayHour, this.selectedPeriod);

    this.setSelectedTime(hours, time.minutes);
  }

  onMinuteSelect(event: Event): void {
    const time = this.getSelectedTimeParts();
    const minutes = Number((event.target as HTMLSelectElement).value);

    this.setSelectedTime(time.hours, minutes);
  }

  selectMinute(minute: number): void {
    const time = this.getSelectedTimeParts();
    this.setSelectedTime(time.hours, minute);
  }

  selectPeriod(period: 'AM' | 'PM'): void {
    const time = this.getSelectedTimeParts();
    const hours = this.toTwentyFourHour(this.selectedHour, period);

    this.setSelectedTime(hours, time.minutes);
  }

  isSelectedMinute(minute: number): boolean {
    return this.getSelectedTimeParts().minutes === minute;
  }

  isSelectedPeriod(period: 'AM' | 'PM'): boolean {
    return this.selectedPeriod === period;
  }

  private buildSelectedDate(): Date {
    const selected = this.fechaSeleccionada || this.pasosFlete.fecha;

    if (selected) {
      const dateOnlyMatch = String(selected).match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (dateOnlyMatch) {
        const [, year, month, day] = dateOnlyMatch;
        return new Date(Number(year), Number(month) - 1, Number(day));
      }

      const parsedDate = new Date(selected);
      if (!Number.isNaN(parsedDate.getTime())) {
        return parsedDate;
      }
    }

    return new Date();
  }

  private getSelectedTimeParts(): { hours: number; minutes: number } {
    const selected = this.horaSeleccionada;

    if (selected) {
      const parsedTime = new Date(selected);
      if (!Number.isNaN(parsedTime.getTime())) {
        return {
          hours: parsedTime.getHours(),
          minutes: parsedTime.getMinutes(),
        };
      }

      const timeOnlyMatch = String(selected).match(/(\d{1,2}):(\d{2})/);
      if (timeOnlyMatch) {
        return {
          hours: Number(timeOnlyMatch[1]),
          minutes: this.snapMinute(Number(timeOnlyMatch[2])),
        };
      }
    }

    return {
      hours: this.pasosFlete.hora ?? new Date().getHours(),
      minutes: this.snapMinute(this.pasosFlete.minutos ?? new Date().getMinutes()),
    };
  }

  private setSelectedTime(hours: number, minutes: number): void {
    const safeHours = Math.min(Math.max(hours, 0), 23);
    const safeMinutes = this.snapMinute(minutes);

    this.horaSeleccionada = `${String(safeHours).padStart(2, '0')}:${String(safeMinutes).padStart(2, '0')}`;
  }

  private toTwentyFourHour(displayHour: number, period: 'AM' | 'PM'): number {
    const normalizedHour = displayHour === 12 ? 0 : displayHour;
    return period === 'PM' ? normalizedHour + 12 : normalizedHour;
  }

  private snapMinute(minutes: number): number {
    const snapped = Math.round(minutes / 15) * 15;

    if (snapped >= 60) {
      return 45;
    }

    return Math.min(Math.max(snapped, 0), 45);
  }

  siguiente() {
    if (this.valueSelected === '1') {
      this.valueSelected = '2';
    }
  }

  btn1() {
    this.valueSelected = '1';
  }

  btn2() {
    this.valueSelected = '2';
  }

  goToStep(step: number) {
    this.currentStep = step;
  }

  async presentToast(mensaje: string, tiempo: number) {
    const toast = await this.toastController.create({
      message: mensaje,
      duration: tiempo,
      position: 'middle'
    });
    await toast.present();
  }

  async presentLoading() {
    this.loading = await this.loadingCtrl.create({
      message: 'Guardando',
    });

    await this.loading.present();
  }

  segmentChanged(event: CustomEvent) {
    this.valueSelected = event.detail.value;
    console.log(this.valueSelected);
  }

  validateDesde() {
    if (!this.pasosFlete.uDesde || this.pasosFlete.uDesde.length < 3) {
      return !this.pasosFlete.uDesde || this.pasosFlete.uDesde.trim() === '';
    }

    return false;
  }

  validateHasta() {
    if (!this.pasosFlete.uHasta || this.pasosFlete.uHasta.length < 3) {
      return !this.pasosFlete.uHasta || this.pasosFlete.uHasta.trim() === '';
    }

    return false;
  }

  validateCargamento() {
    return !this.pasosFlete.cargamento || this.pasosFlete.cargamento.trim() === '';
  }

  validateAccesoCarga() {
    return !this.pasosFlete.accesoCarga || !this.accesosCarga.includes(this.pasosFlete.accesoCarga);
  }

  validateTipoVehiculo() {
    return !this.pasosFlete.tipoVehiculo || !this.vehiculos.includes(this.pasosFlete.tipoVehiculo);
  }

  validateAyudantes() {
    const allowedTypes: ('Sin ayudantes' | '+1 ayudantes' | '+2 ayudantes' | '+3 ayudantes')[] = [
      'Sin ayudantes',
      '+1 ayudantes',
      '+2 ayudantes',
      '+3 ayudantes',
    ];

    return !this.pasosFlete.ayudantes || !allowedTypes.includes(this.pasosFlete.ayudantes);
  }

  validateForm(): boolean {
    if (!this.startCoordinates || !this.endCoordinates) {
      return false;
    }

    if (!this.pasosFlete.tipoVehiculo || !this.vehiculos.includes(this.pasosFlete.tipoVehiculo)) {
      return false;
    }

    if (
      !this.pasosFlete.ayudantes ||
      (
        this.pasosFlete.ayudantes !== 'Sin ayudantes' &&
        this.pasosFlete.ayudantes !== '+1 ayudantes' &&
        this.pasosFlete.ayudantes !== '+2 ayudantes' &&
        this.pasosFlete.ayudantes !== '+3 ayudantes'
      )
    ) {
      return false;
    }

    if (!this.pasosFlete.uDesde || this.pasosFlete.uDesde.trim() === '') {
      return false;
    }

    if (!this.pasosFlete.uHasta || this.pasosFlete.uHasta.trim() === '') {
      return false;
    }

    if (!this.pasosFlete.cargamento || this.pasosFlete.cargamento.trim() === '') {
      return false;
    }

    if (!this.pasosFlete.accesoCarga || !this.accesosCarga.includes(this.pasosFlete.accesoCarga)) {
      return false;
    }

    if (
      !this.pasosFlete.tipoServicio ||
      !['Carga', 'Descarga', 'Carga y descarga', 'Ninguno'].includes(this.pasosFlete.tipoServicio)
    ) {
      return false;
    }

    return (
      !this.validateDesde() &&
      !this.validateHasta() &&
      !this.validateCargamento() &&
      !this.validateAccesoCarga() &&
      !this.validateTipoVehiculo() &&
      !this.validateAyudantes()
    );
  }

  async abrirMapa() {
    const { MapboxComponent } = await import('src/app/folder/mapbox/mapbox.component');
    const modal = await this.modal.create({
      component: MapboxComponent,
      componentProps: {
        routeDraft: {
          ...this.pasosFlete,
          startCoordinates: this.startCoordinates,
          endCoordinatesP: this.endCoordinates,
        },
      },
    });

    modal.onDidDismiss().then((result) => {
      if (result.role === 'route-selected' && result.data) {
        this.applyRouteSelection(result.data);
      }
    });

    await modal.present();
  }

  async iniciarNuevoViaje() {
    this.limpiarRuta();
    await this.abrirMapa();
  }

  applyRouteSelection(routeSelection: {
    startCoordinates: { latitude: number; longitude: number };
    endCoordinates: { latitude: number; longitude: number };
    uDesde: string;
    uHasta: string;
    paradas: ParadaRuta[];
    routeDistanceKm?: number;
    routeDurationMinutes?: number;
  }) {
    this.startCoordinates = routeSelection.startCoordinates;
    this.endCoordinates = routeSelection.endCoordinates;
    this.pasosFlete.uDesde = routeSelection.uDesde;
    this.pasosFlete.uHasta = routeSelection.uHasta;
    this.pasosFlete.paradas = routeSelection.paradas || [];
    this.pasosFlete.routeDistanceKm = routeSelection.routeDistanceKm;
    this.pasosFlete.routeDurationMinutes = routeSelection.routeDurationMinutes;
  }

  private limpiarRuta() {
    this.startCoordinates = null;
    this.endCoordinates = null;
    this.pasosFlete.uDesde = '';
    this.pasosFlete.uHasta = '';
    this.pasosFlete.paradas = [];
    this.pasosFlete.routeDistanceKm = null;
    this.pasosFlete.routeDurationMinutes = null;
  }

  receiveCoordinates(coordinatesData: any) {
    this.startCoordinates = coordinatesData.start;
    this.endCoordinates = coordinatesData.end;
  }

  confirmarUbicaciones(ubicaciones: string[]) {
    this.pasosFlete.uDesde = ubicaciones[0];
    this.pasosFlete.uHasta = ubicaciones[1];
  }
}
