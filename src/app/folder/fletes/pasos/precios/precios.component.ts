import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingController, ToastController, ModalController } from '@ionic/angular';
import { DatosFlete, UserF, UserU, datosVehiculo, respuesta, Opiniones, FleteEnProceso } from 'src/app/folder/models/models';
import { AuthService } from 'src/app/folder/services/auth.service';
import { FirestoreService } from 'src/app/folder/services/firestore.service';
import { FleteroServiceService } from 'src/app/folder/services/fletero-service.service';
import { InteractionService } from 'src/app/folder/services/interaction.service';
import { NuevoService } from 'src/app/folder/services/nuevo.service';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Subject, Subscription } from 'rxjs';
import { first, takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-precios',
  templateUrl: './precios.component.html',
  styleUrls: ['./precios.component.scss'],
})
export class PreciosComponent implements OnInit, OnDestroy {
respuestasPorPedido: { [pedidoId: string]: respuesta[] } = {};
  userId: string = '';
  pedidoDestacadoId: string | null = null;

  login: boolean = false;
  rol: 'Usuario' | 'Fletero'| 'Admin' = null;
  precios = []
  precios2: DatosFlete[] = [];
  DatosF: UserF
  datosFl: DatosFlete
  datos: respuesta;
  rta2: respuesta;
    isModalOpen = false;
    datos2!: DatosFlete;
    respuestas: respuesta[] = [];
    enlacesWhatsApp:string[];
  fleteros: UserF[];
  fleteroSeleccionadoId: string;
  detalleVisibleFleteroId: string | null = null;
  fleteroSeleccionado: Partial<Pick<UserF, 'uid' | 'nombre' | 'apellido' | 'verificado'>> | null = null;
  vehiculoSeleccionado: Partial<datosVehiculo> | null = null;
  resenas: Opiniones[] = [];
  cantidadViajes: number = 0;
  isRespuestasModalOpen: boolean = false;
  validacion : boolean = false;
  isConfirmModalOpen: boolean = false;
  confirmPendingData: { pedido: DatosFlete; rta: respuesta } | null = null;

  // Segmentos: pedidos, enProceso, finalizados
  segmento: 'pedidos' | 'enProceso' | 'finalizados' = 'pedidos';

  pedidosConfirmadosList: any[] = [];
  pedidosFinalizadosList: any[] = [];
  estadoViajePorPedido: { [pedidoId: string]: FleteEnProceso | null } = {};
  reviewData: { [pedidoId: string]: { rating: number; comment: string; submitted: boolean } } = {};
  private publicationTimerId: number | null = null;
  private readonly destroy$ = new Subject<void>();
  private readonly mainSubscriptions = new Subscription();
  private readonly respuestasSubscriptions = new Map<string, Subscription>();
  private readonly estadoViajeSubscriptions = new Map<string, Subscription>();
  private pedidoRespuestasActivoId: string | null = null;

  get pedidosEnProceso(): any[] {
    return this.pedidosConfirmadosList.filter(p => {
      const estado = this.estadoViajePorPedido[p.id]?.estado;
      return estado === 'Confirmado' || estado === 'En Viaje';
    });
  }

  get pedidosCompletados(): any[] {
    return this.pedidosFinalizadosList;
  }

  constructor(
          private auth: AuthService,
          private route: ActivatedRoute,
          private router: Router,
          private authS: AuthService,
          private interacion : InteractionService,
          private db: FirestoreService,
          private database: NuevoService,
          public toastController: ToastController,
          private loadingCtrl: LoadingController, 
          private fleteroService: FleteroServiceService,
          private modalController: ModalController,
          private angularFirestore: AngularFirestore,
  ) {

    
   }

ngOnInit() {
  this.validacion = true;
  this.publicationTimerId = window.setInterval(() => {
    this.precios = [...this.precios];
  }, 60000);

  this.route.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe((params) => {
    const segmento = params.get('segmento');
    this.pedidoDestacadoId = params.get('pedidoId');

    if (segmento === 'pedidos' || segmento === 'enProceso' || segmento === 'finalizados') {
      this.segmento = segmento;
    }

    if (this.segmento === 'enProceso' && this.pedidoDestacadoId) {
      this.programarScrollPedidoDestacado();
    }
  });

 
  this.auth.stateUser<UserU>().pipe(takeUntil(this.destroy$)).subscribe(res => {
    if (res) {
      if (this.userId === res.uid && this.login) {
        return;
      }

      this.login = true;
      this.userId = res.uid;
      console.log('Usuario logueado:', this.userId);

      this.cargarPedidosTiempoReal();
      this.cargarPedidosConfirmados();
      this.cargarPedidosFinalizados();

    } else {
      this.login = false;
      this.router.navigate(['/login']);
    }
  });
}

ngOnDestroy(): void {
  if (this.publicationTimerId !== null) {
    window.clearInterval(this.publicationTimerId);
    this.publicationTimerId = null;
  }

  this.destroy$.next();
  this.destroy$.complete();
  this.mainSubscriptions.unsubscribe();
  this.respuestasSubscriptions.forEach((subscription) => subscription.unsubscribe());
  this.respuestasSubscriptions.clear();
  this.estadoViajeSubscriptions.forEach((subscription) => subscription.unsubscribe());
  this.estadoViajeSubscriptions.clear();
}

  // Este componente mantiene listeners en tiempo real por pedido y los limpia al salir.



  
// Llama a detectChanges() después de calcular el número de respuestas
// ngAfterViewInit() {
//   this.cdr.detectChanges();
// }

  getDatos(rta: respuesta) {
    const path = 'Fleteros';
    const id = rta.idFletero;
    this.db.getDoc<UserF>(path, id).pipe(first()).subscribe( res => {
      if (res ) {
        this.DatosF = res;
        const fleteroId = res.uid
        // this.openWhatsApp(fleteroId)
        }
    })
  }

  verDetalleFletero(rta: respuesta) {
    // Toggle: si ya está visible, se cierra; si no, se abre con datos.
    if (this.detalleVisibleFleteroId === rta.idFletero) {
      this.clearDetalleFletero();
      return;
    }

    this.detalleVisibleFleteroId = rta.idFletero;

    const path = 'Fleteros';
    const id = rta.idFletero;

    this.db.getDoc<UserF>(path, id).pipe(first()).subscribe(res => {
      if (res) {
        this.fleteroSeleccionado = {
          uid: res.uid,
          nombre: res.nombre,
          apellido: res.apellido,
          verificado: res.verificado,
        };
      }
    });

    // Cargar datos vehiculares desde subcolección segura
    this.db.angularFirestore.collection(`Fleteros/${id}/Vehiculos`, ref => ref.where('principal', '==', true).limit(1))
      .valueChanges({ idField: 'id' })
      .pipe(first())
      .subscribe((vehiculos: any[]) => {
        const vehiculo = vehiculos?.[0];
        if (vehiculo) {
          this.vehiculoSeleccionado = {
            tipoVehiculo: vehiculo.tipoVehiculo,
            marca: vehiculo.marca,
            ano: vehiculo.ano,
            modelo: vehiculo.modelo,
            patente: vehiculo.patente,
          };
          return;
        }

        this.db.getDoc<UserF>('Fleteros', id).pipe(first()).subscribe((fletero) => {
          const legacyVehiculo = fletero?.datosVehiculos;
          if (!legacyVehiculo) {
            this.vehiculoSeleccionado = null;
            return;
          }

          this.vehiculoSeleccionado = {
            tipoVehiculo: legacyVehiculo.tipoVehiculo,
            marca: legacyVehiculo.marca,
            ano: legacyVehiculo.ano,
            modelo: legacyVehiculo.modelo,
            patente: legacyVehiculo.patente,
          };
        });
      });

    // Cargar reseñas del fletero
    this.db.angularFirestore
      .collectionGroup('reviews', ref => ref.where('fleteroId', '==', id))
      .get()
      .pipe(first())
      .subscribe(snapshot => {
        this.resenas = snapshot.docs.map(doc => ({ id: doc.id, ...((doc.data() as any) || {}) } as Opiniones));
      });

    // Contar viajes realizados (pedidos finalizados)
    this.db.angularFirestore
      .collectionGroup('PedidosFinalizados', ref => ref.where('fleteroId', '==', id))
      .get()
      .pipe(first())
      .subscribe((snapshot) => {
        this.cantidadViajes = snapshot.size;
      });
  }

  clearDetalleFletero() {
    this.fleteroSeleccionado = null;
    this.vehiculoSeleccionado = null;
    this.detalleVisibleFleteroId = null;
    this.resenas = [];
    this.cantidadViajes = 0;

    this.fleteroSeleccionado = null;
  }

  getDatosFf(rta: respuesta) {
    const path = 'Fleteros';
    const id = rta.idFletero;
    this.db.getDoc<UserF>(path, id).pipe(first()).subscribe( res => {
      if (res ) {
        this.DatosF = res;
        const fleteroId = res.uid
        
        // this.openWhatsApp(fleteroId)
        }
    })
  }


abrirChat = false;

irAlChat(pedido: any, rta: any) {
  this.interacion.presentToast('El chat se habilita cuando el pedido ya fue confirmado y está en proceso.');
}



  openConfirmModal(pedido: DatosFlete, rta: respuesta) {
    rta.recomendado = false;
    this.confirmPendingData = { pedido, rta };
    this.isConfirmModalOpen = true;
  }

private cerrarTodosLosModales() {
  this.isModalOpen = false;
  this.isConfirmModalOpen = false;
  this.confirmPendingData = null;
  this.datos2 = null;
  this.respuestas = [];
  this.pedidoRespuestasActivoId = null;
}

async confirmarPedido() {
  if (!this.confirmPendingData) return;

  const { pedido, rta } = this.confirmPendingData;
  this.confirmPendingData = null;
  this.isConfirmModalOpen = false;
  this.isModalOpen = false;
  
  try {
    // Crear el flete para la subcollección FletesProceso
    const fleteEnProceso: FleteEnProceso = {
      id: this.db.createId(), // ID único para el flete en proceso
      pedidoId: pedido.id,
      usuarioId: pedido.uid,
      fleteroId: rta.idFletero,
      
      // Datos del flete
      nombre: pedido.nombre,
      apellido: pedido.apellido,
      fecha: pedido.fecha,
      hora: pedido.hora,
      minutos: pedido.minutos,
      uDesde: pedido.uDesde,
      uHasta: pedido.uHasta,
      precio: pedido.precio,
      cargamento: pedido.cargamento,
      tipoVehiculo: pedido.tipoVehiculo,
      tipoServicio: pedido.tipoServicio,
      ayudantes: pedido.ayudantes,
      
      // Datos del fletero que aceptó
      precioAceptado: rta.precio,
      telefonoFletero: rta.telefono || '',
      imagenFletero: rta.image || '',
      
      // Estado inicial
      estado: 'Confirmado',
      fechaConfirmacion: new Date(),
      ...(pedido.startCoordinates ? { startCoordinates: pedido.startCoordinates } : {}),
      ...(pedido.endCoordinatesP ? { endCoordinatesP: pedido.endCoordinatesP } : {}),
      ...(pedido.paradas?.length ? { paradas: pedido.paradas } : {}),
      ...(pedido.routeDistanceKm ? { routeDistanceKm: pedido.routeDistanceKm } : {}),
      ...(pedido.routeDurationMinutes ? { routeDurationMinutes: pedido.routeDurationMinutes } : {})
    };
    
    // Confirmar en backend: crea FletesProceso, mueve a PedidosConfirmados y actualiza métricas
    await this.db.confirmarPedidoConRespuesta(pedido, rta, fleteEnProceso);

    try {
      await this.db.getOrCreateChat(this.userId, rta.idFletero, pedido.id, {
        userNombre: `${pedido.nombre || ''} ${pedido.apellido || ''}`.trim(),
        fleteroNombre: `${rta.nombre || ''} ${rta.apellido || ''}`.trim(),
        pedidoResumen: {
          desde: pedido.uDesde,
          hasta: pedido.uHasta,
          fecha: pedido.fecha,
          hora: pedido.hora,
          minutos: pedido.minutos,
          cargamento: pedido.cargamento,
        }
      });
    } catch (chatError) {
      console.warn('Flete confirmado, pero no se pudo preparar el chat.', chatError);
    }
    
    this.cerrarTodosLosModales();
    this.segmento = 'enProceso';
    this.pedidoDestacadoId = pedido.id;
    this.interacion.presentToast('¡Flete confirmado! El fletero ha recibido tu pedido');
    this.router.navigate(['/fletes/precios'], {
      queryParams: {
        segmento: 'enProceso',
        pedidoId: pedido.id,
      },
      replaceUrl: true,
    });
    console.log('Flete confirmado correctamente en backend');
    
  } catch (error) {
    console.error('Error al confirmar el pedido:', error);
    this.cerrarTodosLosModales();
    this.interacion.presentToast('Error al confirmar el pedido. Intenta de nuevo.');
  } finally {
    this.confirmPendingData = null;
  }
}

cancelarConfirm() {
  this.isConfirmModalOpen = false;
  this.confirmPendingData = null;
}
  
  VerPedidoss(){
    this.router.navigate(['/fletes/pedidosFinalizados']);

  }


 cargarPedidosTiempoReal() {
    const path = `PedirFlete/${this.userId}/Pedidos`;

    this.database.getAll(path).then((obs) => {
      if (obs && obs.subscribe) {
        const subscription = obs.subscribe(async (resRef) => {
          const pedidos = resRef.map((pedidoSnap: any) => {
            const pedido = pedidoSnap.payload.doc.data();
            pedido['id'] = pedidoSnap.payload.doc.id;

            return pedido;
          });

          this.syncRespuestaSubscriptions(pedidos.map((pedido: DatosFlete) => pedido.id));
          this.precios = pedidos.filter((pedido: DatosFlete) => !this.db.pedidoExpirado(pedido));
          await this.depurarPedidosExpirados(pedidos);
        });

        this.mainSubscriptions.add(subscription);
      }
    });
  }

private async depurarPedidosExpirados(pedidos: DatosFlete[]): Promise<void> {
  const expirados = (pedidos || []).filter((pedido) => this.db.pedidoExpirado(pedido));
  if (expirados.length === 0) {
    return;
  }

  await Promise.all(expirados.map((pedido) => this.db.eliminarPedidoPendienteExpirado(pedido)));
}

getRecordatorioPublicacion(pedido: DatosFlete): string {
  return this.db.obtenerTextoTiempoRestantePedido(pedido);
}

getRecordatorioPublicacionClase(pedido: DatosFlete): string {
  const fechaExpiracion = this.db.obtenerFechaExpiracionPedido(pedido);
  if (!fechaExpiracion) {
    return 'recordatorio recordatorio--neutral';
  }

  const diferenciaMs = fechaExpiracion.getTime() - Date.now();
  if (diferenciaMs <= 0) {
    return 'recordatorio recordatorio--danger';
  }

  if (diferenciaMs <= 30 * 60 * 1000) {
    return 'recordatorio recordatorio--warning';
  }

  return 'recordatorio recordatorio--success';
}
cargarRespuestas(pedidoId: string) {
  if (this.respuestasSubscriptions.has(pedidoId)) {
    return;
  }

  const rutaRespuestas = `PedirFlete/${this.userId}/Pedidos/${pedidoId}/Respuesta`;

  this.database.getAll(rutaRespuestas).then((obs) => {
    if (obs && obs.subscribe) {
      const subscription = obs.subscribe((resRef) => {
        if (resRef) {
          const respuestas = resRef.map((respuestaRef: any) => {
            const respuestaData = respuestaRef.payload.doc.data() as respuesta;
            const docId = respuestaRef.payload.doc.id;
            return {
              ...respuestaData,
              docId,
              idFletero: respuestaData.idFletero || docId,
            };
          });
          this.respuestasPorPedido[pedidoId] = respuestas;
          if (this.pedidoRespuestasActivoId === pedidoId) {
            this.respuestas = respuestas;
          }
        } else {
          this.respuestasPorPedido[pedidoId] = [];
          if (this.pedidoRespuestasActivoId === pedidoId) {
            this.respuestas = [];
          }
        }
      });

      this.respuestasSubscriptions.set(pedidoId, subscription);
    }
  });
}

verPedidos(isOpen: boolean, pedido: DatosFlete) {
  this.isModalOpen = isOpen;
  this.datos2 = pedido;
  this.pedidoRespuestasActivoId = pedido.id;

  this.cargarRespuestas(pedido['id']);

  // Mostrar las respuestas ya cargadas para el pedido activo
  this.respuestas = this.respuestasPorPedido[pedido.id] || [];
}


  contarRespuestas(pedidoId: string): number {
    const respuestas = this.respuestasPorPedido[pedidoId];
    return respuestas ? respuestas.length : 0;
  }
cerrarModal() {
  this.cerrarTodosLosModales();
}

cambiarSegmento(seg: 'pedidos' | 'enProceso' | 'finalizados') {
  this.segmento = seg;
}

cargarPedidosConfirmados() {
  this.database.getAll(`PedirFlete/${this.userId}/PedidosConfirmados/`).then((res) => {
    if (res && res.subscribe) {
      const subscription = res.subscribe((resRef) => {
        this.pedidosConfirmadosList = resRef.map((pasosRef) => {
          const pasosFlete: any = pasosRef.payload.doc.data();
          pasosFlete.id = pasosRef.payload.doc.id;
          this.reviewData[pasosFlete.id] = this.reviewData[pasosFlete.id] || { rating: 0, comment: '', submitted: false };
          return pasosFlete;
        });
        this.pedidosConfirmadosList.forEach(p => {
          this.cargarEstadoViaje(p);
          this.verificarResenaExistente(p.id);
        });
        this.syncEstadoViajeSubscriptions(this.pedidosConfirmadosList.map((pedido) => pedido.id));

        if (this.segmento === 'enProceso' && this.pedidoDestacadoId) {
          this.programarScrollPedidoDestacado();
        }
      });

      this.mainSubscriptions.add(subscription);
    }
  });
}

private programarScrollPedidoDestacado(): void {
  if (!this.pedidoDestacadoId) {
    return;
  }

  window.setTimeout(() => {
    const target = document.getElementById(`pedido-en-proceso-${this.pedidoDestacadoId}`);
    if (!target) {
      return;
    }

    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 250);
}

cargarPedidosFinalizados() {
  this.database.getAll(`PedirFlete/${this.userId}/PedidosFinalizados/`).then((res) => {
    if (res && res.subscribe) {
      const subscription = res.subscribe((resRef) => {
        this.pedidosFinalizadosList = resRef.map((pasosRef) => {
          const pasosFlete: any = pasosRef.payload.doc.data();
          pasosFlete.id = pasosRef.payload.doc.id;
          this.reviewData[pasosFlete.id] = this.reviewData[pasosFlete.id] || { rating: 0, comment: '', submitted: false };
          return pasosFlete;
        });

        this.pedidosFinalizadosList.forEach((p) => {
          this.verificarResenaExistente(p.id);
        });
      });

      this.mainSubscriptions.add(subscription);
    }
  });
}

cargarEstadoViaje(pedido: any): void {
  const fleteroId = pedido.respuesta?.idFletero;
  if (!fleteroId || !pedido.id) return;
  if (this.estadoViajeSubscriptions.has(pedido.id)) {
    return;
  }

  const subscription = this.db.obtenerFleteProcesoPorPedidoId(fleteroId, pedido.id, this.userId).subscribe((fletes) => {
    if (fletes && fletes.length > 0) {
      this.estadoViajePorPedido[pedido.id] = fletes[0];
    } else {
      this.estadoViajePorPedido[pedido.id] = null;
    }
  });

  this.estadoViajeSubscriptions.set(pedido.id, subscription);
}

verificarResenaExistente(pedidoId: string): void {
  this.angularFirestore
    .collectionGroup('reviews', ref => ref
      .where('pedidoId', '==', pedidoId)
      .where('userId', '==', this.userId)
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

async submitResena(pedido: any) {
  const fleteroId = pedido.respuesta?.idFletero || pedido.fleteroId;
  if (!fleteroId) {
    this.interacion.presentToast('No se encontró el fletero para calificar');
    return;
  }
  const form = this.reviewData[pedido.id];
  if (!form || !form.rating || !form.comment?.trim()) {
    this.interacion.presentToast('Completa la calificación y el comentario');
    return;
  }
  const review = {
    userId: this.userId,
    fleteroId,
    rating: form.rating,
    comment: form.comment.trim(),
    date: new Date(),
    pedidoId: pedido.id
  };
  await this.db.createDoc3(`PedirFlete/${this.userId}/PedidosFinalizados/${pedido.id}/reviews`, review);
  this.reviewData[pedido.id].submitted = true;
  this.interacion.presentToast('Reseña enviada. ¡Gracias!');
}

async seguirViaje(pedido: any): Promise<void> {
  const fleteEnProceso = this.estadoViajePorPedido[pedido.id];
  if (!fleteEnProceso) {
    this.interacion.presentToast('No se encontró el viaje activo');
    return;
  }
  const coordsStart = fleteEnProceso.startCoordinates || pedido.startCoordinates;
  const coordsEnd = fleteEnProceso.endCoordinatesP || pedido.endCoordinatesP;
  if (!coordsStart || !coordsEnd) {
    this.interacion.presentToast('No hay coordenadas de ruta disponibles');
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
  await modal.present();
}

async abrirChatViaje(pedido: any): Promise<void> {
  const fleteEnProceso = this.estadoViajePorPedido[pedido.id];
  const fleteroId = fleteEnProceso?.fleteroId || pedido.respuesta?.idFletero || pedido.fleteroId;

  if (!fleteroId || !pedido.id) {
    this.interacion.presentToast('No encontramos el chat de este viaje todavÃ­a.');
    return;
  }

  try {
    const chat = await this.db.getOrCreateChat(this.userId, fleteroId, pedido.id, {
      userNombre: `${pedido.nombre || ''} ${pedido.apellido || ''}`.trim(),
      fleteroNombre: `${pedido.respuesta?.nombre || ''} ${pedido.respuesta?.apellido || ''}`.trim(),
      pedidoResumen: {
        desde: pedido.uDesde,
        hasta: pedido.uHasta,
        fecha: pedido.fecha,
        hora: pedido.hora,
        minutos: pedido.minutos,
        cargamento: pedido.cargamento,
      }
    });

    this.router.navigate(['/chat', chat.id], {
      queryParams: {
        fleteroId,
        fleteId: pedido.id,
        userId: this.userId,
      }
    });
  } catch (error) {
    console.error('Error al abrir chat del viaje:', error);
    this.interacion.presentToast('No se pudo abrir el chat del viaje.');
  }
}

private syncRespuestaSubscriptions(pedidoIds: string[]): void {
  const idsActivos = new Set(pedidoIds);
  this.respuestasSubscriptions.forEach((subscription, pedidoId) => {
    if (!idsActivos.has(pedidoId)) {
      subscription.unsubscribe();
      this.respuestasSubscriptions.delete(pedidoId);
      delete this.respuestasPorPedido[pedidoId];
    }
  });

  pedidoIds.forEach((pedidoId) => this.cargarRespuestas(pedidoId));
}

private syncEstadoViajeSubscriptions(pedidoIds: string[]): void {
  const idsActivos = new Set(pedidoIds);
  this.estadoViajeSubscriptions.forEach((subscription, pedidoId) => {
    if (!idsActivos.has(pedidoId)) {
      subscription.unsubscribe();
      this.estadoViajeSubscriptions.delete(pedidoId);
      delete this.estadoViajePorPedido[pedidoId];
    }
  });
}

}


