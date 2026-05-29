import { Component, OnInit, OnDestroy } from '@angular/core';
import { FleteEnProceso, EstadoFleteProceso } from 'src/app/folder/models/models';
import { AuthService } from 'src/app/folder/services/auth.service';
import { FirestoreService } from 'src/app/folder/services/firestore.service';
import { InteractionService } from 'src/app/folder/services/interaction.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-mis-viajes',
  templateUrl: './mis-viajes.component.html',
  styleUrls: ['./mis-viajes.component.scss'],
})
export class MisViajesComponent implements OnInit, OnDestroy {
  
  fleteroId: string;
  
  // Viajes por estado
  viajesConfirmados: FleteEnProceso[] = [];
  viajesEnCurso: FleteEnProceso[] = [];
  viajesFinalizados: FleteEnProceso[] = [];
  
  // UI
  activeTab: 'confirmados' | 'enCurso' | 'finalizados' = 'confirmados';
  cargando = true;
  
  // Manejo de suscripciones
  private destroy$ = new Subject<void>();

  constructor(
    private auth: AuthService,
    private db: FirestoreService,
    private interacion: InteractionService
  ) {}

  ngOnInit() {
    this.inicializarDatos();
  }

  private inicializarDatos() {
    this.auth.stateUser().pipe(takeUntil(this.destroy$)).subscribe(user => {
      if (user) {
        this.fleteroId = user.uid;
        this.cargarViajesPorEstado();
      }
    });
  }

  /**
   * Carga los viajes del fletero filtrados por estado
   */
  private cargarViajesPorEstado() {
    this.cargando = true;

    // Cargar viajes Confirmados
    this.db
      .obtenerFletesPorEstado(this.fleteroId, 'Confirmado')
      .pipe(takeUntil(this.destroy$))
      .subscribe(
        viajes => {
          this.viajesConfirmados = viajes;
          console.log('Viajes Confirmados:', viajes);
        },
        error => console.error('Error cargando viajes confirmados:', error)
      );

    // Cargar viajes En Viaje
    this.db
      .obtenerFletesPorEstado(this.fleteroId, 'En Viaje')
      .pipe(takeUntil(this.destroy$))
      .subscribe(
        viajes => {
          this.viajesEnCurso = viajes;
          console.log('Viajes En Viaje:', viajes);
          this.cargando = false;
        },
        error => console.error('Error cargando viajes en viaje:', error)
      );

    // Cargar viajes Finalizados
    this.db
      .obtenerFletesPorEstado(this.fleteroId, 'Finalizado')
      .pipe(takeUntil(this.destroy$))
      .subscribe(
        viajes => {
          this.viajesFinalizados = viajes;
          console.log('Viajes Finalizados:', viajes);
        },
        error => console.error('Error cargando viajes finalizados:', error)
      );
  }

  /**
   * Inicia un viaje (Confirmado → En Viaje)
   */
  async iniciarViaje(flete: FleteEnProceso) {
    const alerta = await this.interacion.presentAlert(
      'Iniciar Viaje',
      `¿Iniciar el viaje a ${flete.uHasta}?`
    );

    if (alerta) {
      try {
        await this.db.actualizarEstadoFlete(
          this.fleteroId,
          flete.id,
          'En Viaje'
        );
        this.interacion.presentToast('✅ Viaje iniciado');
        console.log('Viaje iniciado:', flete.id);
      } catch (error) {
        console.error('Error iniciando viaje:', error);
        this.interacion.presentToast('❌ Error al iniciar viaje');
      }
    }
  }

  /**
   * Finaliza un viaje (En Viaje → Finalizado)
   */
  async finalizarViaje(flete: FleteEnProceso) {
    const alerta = await this.interacion.presentAlert(
      'Finalizar Viaje',
      `¿Marcar como finalizado el viaje a ${flete.uHasta}?`
    );

    if (alerta) {
      try {
        await this.db.finalizarFleteYArchivarPedido(flete);
        this.interacion.presentToast('✅ Viaje finalizado');
        console.log('Viaje finalizado:', flete.id);
      } catch (error) {
        console.error('Error finalizando viaje:', error);
        this.interacion.presentToast('❌ Error al finalizar viaje');
      }
    }
  }

  /**
   * Calcula el tiempo transcurrido desde la confirmación
   */
  tiempoTranscurrido(fecha: Date): string {
    if (!fecha) return '';
    
    const ahora = new Date();
    const diff = ahora.getTime() - new Date(fecha).getTime();
    const minutos = Math.floor(diff / 60000);
    const horas = Math.floor(minutos / 60);

    if (horas > 0) return `hace ${horas}h`;
    if (minutos > 0) return `hace ${minutos}m`;
    return 'Ahora';
  }

  /**
   * Obtiene el estado visual para la UI
   */
  getEstadoClass(estado: EstadoFleteProceso): string {
    switch (estado) {
      case 'Confirmado':
        return 'estado-confirmado';
      case 'En Viaje':
        return 'estado-en-viaje';
      case 'Finalizado':
        return 'estado-finalizado';
      default:
        return '';
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
