import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { LoadingController, ToastController, ModalController, AlertController, AlertInput } from '@ionic/angular';
import { DatosFlete, UserF, UserU, respuesta, FleteEnProceso } from 'src/app/folder/models/models';
import { AuthService } from 'src/app/folder/services/auth.service';
import { FirestoreService } from 'src/app/folder/services/firestore.service';
import { FleteroServiceService } from 'src/app/folder/services/fletero-service.service';
import { InteractionService } from 'src/app/folder/services/interaction.service';
import { NuevoService } from 'src/app/folder/services/nuevo.service';
import { firstValueFrom } from 'rxjs';
import { first } from 'rxjs/operators';
import { AngularFirestore } from '@angular/fire/compat/firestore';

@Component({
  selector: 'app-pedidos-finalizados',
  templateUrl: './pedidos-finalizados.component.html',
  styleUrls: ['./pedidos-finalizados.component.scss'],
})
export class PedidosFinalizadosComponent implements OnInit {

  login: boolean = false;
  rol: 'Usuario' | 'Fletero'| 'Admin' = null;
  pedidosConfirmados: any[] = []
  pedidosFinalizadosArchivados: any[] = []
  private formularioEnviado: boolean = false;
  autenticandoUsuario: boolean = false;
  isModalOpen: boolean = false;
  respuestas: any[] = [];
  botonVisible: boolean = true;
  currentUserId: string = '';

  // Segmento activo: 'enProceso' o 'finalizados'
  segmento: 'enProceso' | 'finalizados' = 'enProceso';

  // Estado del viaje por pedido (para mostrar botón "Seguir Viaje")
  estadoViajePorPedido: { [pedidoId: string]: FleteEnProceso | null } = {};
  private ultimoEstadoViajePorPedido: { [pedidoId: string]: string | null } = {};

  reviewData: { [pedidoId: string]: { rating: number; comment: string; submitted: boolean } } = {};

  get pedidosEnProceso(): any[] {
    return this.pedidosConfirmados.filter(p => {
      const estado = this.estadoViajePorPedido[p.id]?.estado;
      return estado === 'Confirmado' || estado === 'En Viaje';
    });
  }

  get pedidosFinalizados(): any[] {
    return this.pedidosFinalizadosArchivados;
  }

  getEstadoViajeEtiqueta(pedido: any): string {
    const estado = this.estadoViajePorPedido[pedido.id]?.estado;

    if (estado === 'En Viaje') {
      return '🚚 En Proceso';
    }

    if (estado === 'Confirmado') {
      return '⏳ Confirmado — Esperando inicio';
    }

    return '';
  }

  getEstadoViajeClase(pedido: any): string {
    const estado = this.estadoViajePorPedido[pedido.id]?.estado;

    if (estado === 'En Viaje') {
      return 'bg-blue-100 text-blue-700';
    }

    if (estado === 'Confirmado') {
      return 'bg-yellow-100 text-yellow-700';
    }

    return '';
  }

  constructor(
          private auth: AuthService,
          private router: Router,
          private authS: AuthService,
          private interacion : InteractionService,
          private db: FirestoreService,
          private database: NuevoService,
          public toastController: ToastController,
          private loadingCtrl: LoadingController, 
          private fleteroService: FleteroServiceService,
          private interaction : InteractionService,
          private modalController: ModalController,
          private angularFirestore: AngularFirestore,
            private alertController: AlertController,


  ) { }

  ngOnInit() {

    // const botonVisibleString = localStorage.getItem('botonVisible');
    // if (botonVisibleString === 'false') {
    //   this.botonVisible = false;
    // } else {
    //   this.botonVisible = true; // Si no se encuentra la variable en el almacenamiento local, mantener visible el botón por defecto
    // }

    this.auth.stateUser<UserU>().subscribe( res  => {
      this.currentUserId = res?.uid || '';

      if (res) {
        this.login = true;
            // Aquí puedes realizar acciones con la ruta del pedido
            
            //aqui quiero agregar las respuestas de los pedidos `PedirFlete/${res.uid}/Pedidos//${pedidoID}/Respuesta/${ID DEL USUARIO DEL FLETERO QUE QUIERO OBTENER}`
            this.database.getAll(`PedirFlete/${res.uid}/PedidosConfirmados/`).then((res) => {
              if (res && res.subscribe) {
                res.subscribe((resRef) => {
                  this.pedidosConfirmados = resRef.map((pasosRef) => {
                    const pasosFlete: any = pasosRef.payload.doc.data();
                    pasosFlete.id = pasosRef.payload.doc.id;
                    pasosFlete.recomendado = false;
                    this.reviewData[pasosFlete.id] = this.reviewData[pasosFlete.id] || { rating: 0, comment: '', submitted: false };
                    return pasosFlete;
                  });
                  // Cargar estado de viaje para cada pedido
                  this.pedidosConfirmados.forEach(p => {
                    this.cargarEstadoViaje(p);
                    this.verificarResenaExistente(p.id);
                  });
                });
              } else {
                console.log('La respuesta de this.database.getAll() no es un observable válido.');
                // Manejar el caso en el que res no sea un observable válido
              }
            });
            this.database.getAll(`PedirFlete/${res.uid}/PedidosFinalizados/`).then((finalizadosRes) => {
              if (finalizadosRes && finalizadosRes.subscribe) {
                finalizadosRes.subscribe((resRef) => {
                  this.pedidosFinalizadosArchivados = resRef.map((pasosRef) => {
                    const pasosFlete: any = pasosRef.payload.doc.data();
                    pasosFlete.id = pasosRef.payload.doc.id;
                    pasosFlete.recomendado = false;
                    this.reviewData[pasosFlete.id] = this.reviewData[pasosFlete.id] || { rating: 0, comment: '', submitted: false };
                    return pasosFlete;
                  });

                  this.pedidosFinalizadosArchivados.forEach(p => {
                    this.verificarResenaExistente(p.id);
                  });
                });
              }
            });
      } else {
        this.login = false;
         this.router.navigate(['/login'])
      }   
 })
  }

  async recomendarFletero(idFletero: string) {
    const path = `Fleteros`; // Ruta del documento del fletero

    this.db.getDoc<UserF>(path, idFletero).subscribe(res2 => {
        if (res2) {
            // Verificar si el fletero ya ha sido recomendado
            if (res2.recomendacion) {
                if (!this.formularioEnviado) {
                    console.log("Este fletero ya ha sido recomendado anteriormente");
                    // Actualizar el campo recomendacion sumando 1 al valor actual
                    const nuevasRecomendaciones = res2.recomendacion + 1;
                    this.db.updateDoc(path, idFletero, {recomendacion: nuevasRecomendaciones})
                    this.formularioEnviado = true; // Establece la bandera en true
                    this.botonVisible = false; // Ocultar el botón después de recomendar
                    localStorage.setItem('botonVisible', 'false');
                    this.interaction.presentToast('Fletero recomendado exitosamente')
                }
            } else {
                if (!this.formularioEnviado) {
                    this.db.updateDoc(path, idFletero, {recomendacion: 1})
                    this.botonVisible = false; // Ocultar el botón después de recomendar
                    localStorage.setItem('botonVisible', 'false');
                    this.formularioEnviado = true; // Establece la bandera en true
                    this.interaction.presentToast('Fletero recomendado exitosamente')
                }
            }
        } else {
            this.interaction.presentToast('No se encontró el fletero en la base de datos')
        }
    });
}

  async submitResena(pedido: any) {
    const fleteroId = pedido.respuesta?.idFletero || pedido.fleteroId;
    if (!fleteroId) {
      this.interaction.presentToast('No se encontró el fletero para calificar');
      return;
    }

    const form = this.reviewData[pedido.id];
    if (!form || !form.rating || !form.comment?.trim()) {
      this.interaction.presentToast('Completa la calificación y el comentario');
      return;
    }

    const review = {
      userId: this.currentUserId || '',
      fleteroId,
      rating: form.rating,
      comment: form.comment.trim(),
      date: new Date(),
      pedidoId: pedido.id
    };

    await this.db.createDoc3(`PedirFlete/${this.currentUserId || pedido.uid}/PedidosFinalizados/${pedido.id}/reviews`, review);
    this.reviewData[pedido.id].submitted = true;
    this.interaction.presentToast('Reseña enviada. ¡Gracias!');
  }


    
    
    
    async presentToast(message: string) {
    const toast = await this.toastController.create({
      message: message,
      duration: 2000
    });
    toast.present();
  }

  async cerrar(data: any) {
    await this.modalController.dismiss(data);
  }


  atras(){
    this.router.navigate(['/fletes'])
  }

  /**
   * Verifica el estado del viaje para un pedido (si tiene fletero asignado)
   */
  cargarEstadoViaje(pedido: any): void {
    const fleteroId = pedido.respuesta?.idFletero;
    if (!fleteroId || !pedido.id) return;

    this.db.obtenerFleteProcesoPorPedidoId(fleteroId, pedido.id, this.currentUserId).subscribe((fletes) => {
      if (fletes && fletes.length > 0) {
        const estadoAnterior = this.ultimoEstadoViajePorPedido[pedido.id] ?? null;
        this.estadoViajePorPedido[pedido.id] = fletes[0];
        this.ultimoEstadoViajePorPedido[pedido.id] = fletes[0].estado ?? null;

        if (
          fletes[0].estado === 'En Viaje' &&
          estadoAnterior !== 'En Viaje' &&
          !this.isModalOpen
        ) {
          this.isModalOpen = true;
          setTimeout(() => {
            this.seguirViaje(pedido).finally(() => {
              this.isModalOpen = false;
            });
          }, 0);
        }
      } else {
        this.estadoViajePorPedido[pedido.id] = null;
        this.ultimoEstadoViajePorPedido[pedido.id] = null;
      }
    });
  }

  /**
   * Abre el modal de seguimiento de viaje en tiempo real
   */
  async seguirViaje(pedido: any): Promise<void> {
    const fleteEnProceso = this.estadoViajePorPedido[pedido.id];
    if (!fleteEnProceso) {
      this.interaction.presentToast('No se encontró el viaje activo');
      this.isModalOpen = false;
      return;
    }

    const coordsStart = fleteEnProceso.startCoordinates || pedido.startCoordinates;
    const coordsEnd = fleteEnProceso.endCoordinatesP || pedido.endCoordinatesP;

    if (!coordsStart || !coordsEnd) {
      this.interaction.presentToast('No hay coordenadas de ruta disponibles');
      this.isModalOpen = false;
      return;
    }

    const { VerRutaComponent } = await import('src/app/folder/mapbox/ver-ruta/ver-ruta.component');
    const modal = await this.modalController.create({
      component: VerRutaComponent,
      componentProps: {
        datos: {
          startCoordinates: coordsStart,
          endCoordinates: coordsEnd,
          paradas: fleteEnProceso.paradas || pedido.paradas || [],
          routeDistanceKm: fleteEnProceso.routeDistanceKm || pedido.routeDistanceKm,
          routeDurationMinutes: fleteEnProceso.routeDurationMinutes || pedido.routeDurationMinutes,
        },
        modo: 'seguimiento',
        fleteEnProceso: fleteEnProceso,
      },
    });

    modal.onDidDismiss().then((result) => {
      this.isModalOpen = false;
      if (result.data?.viajeCanceladoUsuario || result.data?.viajeCancelado) {
        this.interaction.presentToast('Pedido cancelado');
      }
    });

    await modal.present();
  }

  async cancelarPedidoUsuario(pedido: any): Promise<void> {
    const fleteEnProceso = this.estadoViajePorPedido[pedido.id];
    if (!fleteEnProceso) {
      this.interaction.presentToast('No se encontró el viaje activo');
      return;
    }

    const etapa = fleteEnProceso.estado === 'En Viaje' ? 'en_viaje' : 'antes_de_iniciar';
    const motivo = await this.pedirMotivoCancelacionUsuario(etapa);
    if (!motivo) {
      return;
    }

    try {
      await this.interaction.presentLoading('Cancelando pedido...');
      await this.db.cancelarFleteYRegistrarEvento(fleteEnProceso, {
        motivo,
        canceladoPor: 'Usuario',
        observacion: etapa === 'en_viaje'
          ? 'Cancelación solicitada por el usuario con el viaje ya iniciado.'
          : 'Cancelación solicitada por el usuario antes del inicio del viaje.',
      });
      await this.interaction.closeLoading();
      this.interaction.presentToast('Pedido cancelado');
      await this.router.navigate(['/home']);
    } catch (error) {
      console.error('Error cancelando pedido del usuario:', error);
      await this.interaction.closeLoading();
      this.interaction.presentToast('No se pudo cancelar el pedido');
    }
  }

  private async pedirMotivoCancelacionUsuario(etapa: 'antes_de_iniciar' | 'en_viaje'): Promise<string | null> {
    const inputs: AlertInput[] = etapa === 'en_viaje'
      ? [
          { type: 'radio', label: 'Incidente de seguridad', value: 'incidente_seguridad_usuario', checked: true },
          { type: 'radio', label: 'El servicio no coincide con lo acordado', value: 'servicio_no_coincide' },
          { type: 'radio', label: 'Cobro o condición no informada', value: 'cobro_no_informado' },
          { type: 'radio', label: 'Necesito detener el viaje por emergencia', value: 'emergencia_usuario' },
          { type: 'radio', label: 'Otro incidente durante el viaje', value: 'otro_incidente_viaje' },
        ]
      : [
          { type: 'radio', label: 'Ya no necesito el viaje', value: 'ya_no_necesito', checked: true },
          { type: 'radio', label: 'Error en la solicitud', value: 'error_en_solicitud' },
          { type: 'radio', label: 'Cambio de horario o destino', value: 'cambio_horario_destino' },
          { type: 'radio', label: 'El fletero no responde', value: 'fletero_no_responde' },
          { type: 'radio', label: 'Otro motivo', value: 'otro_motivo_usuario' },
        ];

    const alert = await this.alertController.create({
      cssClass: 'tfy-cancel-alert',
      header: etapa === 'en_viaje' ? 'Reportar y cancelar viaje' : 'Cancelar pedido',
      subHeader: etapa === 'en_viaje'
        ? 'Esta acción impacta más fuerte en la confiabilidad del usuario y queda registrada para revisión.'
        : 'Seleccioná el motivo de la cancelación.',
      inputs,
      buttons: [
        {
          text: 'Mantener viaje',
          role: 'cancel',
          cssClass: 'tfy-cancel-alert-secondary',
        },
        {
          text: etapa === 'en_viaje' ? 'Reportar y cancelar' : 'Cancelar pedido',
          role: 'confirm',
          cssClass: 'tfy-cancel-alert-danger',
        },
      ],
    });

    await alert.present();
    const result = await alert.onDidDismiss();
    return result.role === 'confirm' ? (result.data?.values || null) : null;
  }

  /**
   * Verifica si ya existe una reseña para este pedido y marca como submitted
   */
  verificarResenaExistente(pedidoId: string): void {
    this.angularFirestore
      .collectionGroup('reviews', ref => ref
        .where('pedidoId', '==', pedidoId)
        .where('userId', '==', this.currentUserId)
      )
      .valueChanges()
      .pipe(first())
      .subscribe((reviews: any[]) => {
        if (reviews && reviews.length > 0) {
          this.reviewData[pedidoId] = {
            rating: reviews[0].rating || 0,
            comment: reviews[0].comment || '',
            submitted: true
          };
        }
      });
  }

  cambiarSegmento(seg: 'enProceso' | 'finalizados') {
    this.segmento = seg;
  }

}
