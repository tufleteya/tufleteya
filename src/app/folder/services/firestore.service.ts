import { Injectable } from '@angular/core';
import { AngularFirestore, AngularFirestoreDocument, AngularFirestoreCollection } from '@angular/fire/compat/firestore';
import { AngularFireStorage } from '@angular/fire/compat/storage';
import { DatosFlete, UserF, UserU, datosVehiculo, respuesta, FleteEnProceso, EstadoFleteProceso, CancelacionViaje, MetricasFletero, EstadoSancionAutomatico, NivelConfiabilidad, MetricasUsuario, HistorialSancionFletero, NotificacionPenalizacionUsuarioAdmin, HistorialPenalizacionUsuarioAdmin, EstadoRevisionDocumento, RolPanel } from '../models/models';
import { firstValueFrom, Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import 'firebase/firestore';
import firebase from 'firebase/compat/app';
import { AuthService } from './auth.service';
import { httpsCallable } from 'firebase/functions';
import { functions } from 'src/app/firebase-config';
import { environment } from 'src/environments/environment';

import { Firestore, doc, getDoc, setDoc } from '@angular/fire/firestore';

@Injectable({
  providedIn: 'root'
})


export class FirestoreService {
  private pedidoId: string;
  



  fletes: DatosFlete[] = []
  
  constructor(public angularFirestore: AngularFirestore,
              public fireStorage: AngularFireStorage,
              public auths : AuthService
             ) { }

             private sanitizeWriteData<T>(data: T): T {
              if (!data || typeof data !== 'object' || data instanceof Date || Array.isArray(data)) {
                return data;
              }

              const sensitiveKeys = new Set(['password', 'pass', 'contrasena', 'contraseña']);
              const clean: Record<string, unknown> = {};

              Object.entries(data as Record<string, unknown>).forEach(([key, value]) => {
                if (sensitiveKeys.has(key.toLowerCase())) {
                  return;
                }

                clean[key] = value;
              });

              return clean as T;
             }

             private async ensureAuthenticatedWriteContext(): Promise<void> {
              await this.auths.requireCurrentUser();
             }

             construirFechaProgramadaPedido(pedido: Pick<DatosFlete, 'fecha' | 'hora' | 'minutos'>): Date | null {
              if (!pedido?.fecha) {
                return null;
              }

              const fechaTexto = String(pedido.fecha);
              const matchFecha = fechaTexto.match(/^(\d{4})-(\d{2})-(\d{2})/);
              const fechaBase = matchFecha
                ? new Date(
                    Number(matchFecha[1]),
                    Number(matchFecha[2]) - 1,
                    Number(matchFecha[3]),
                    Number(pedido.hora || 0),
                    Number(pedido.minutos || 0),
                    0,
                    0
                  )
                : new Date(fechaTexto as any);

              if (Number.isNaN(fechaBase.getTime())) {
                return null;
              }

              if (!matchFecha) {
                fechaBase.setHours(Number(pedido.hora || 0), Number(pedido.minutos || 0), 0, 0);
              }

              return fechaBase;
             }

             obtenerFechaExpiracionPedido(pedido: Pick<DatosFlete, 'fecha' | 'hora' | 'minutos'>): Date | null {
              const fechaProgramada = this.construirFechaProgramadaPedido(pedido);
              if (!fechaProgramada) {
                return null;
              }

              return new Date(fechaProgramada.getTime() + (2 * 60 * 60 * 1000));
             }

             pedidoExpirado(pedido: Pick<DatosFlete, 'fecha' | 'hora' | 'minutos'>): boolean {
              const fechaExpiracion = this.obtenerFechaExpiracionPedido(pedido);
              return !!fechaExpiracion && fechaExpiracion.getTime() <= Date.now();
             }

             obtenerTextoTiempoRestantePedido(pedido: Pick<DatosFlete, 'fecha' | 'hora' | 'minutos'>): string {
              const fechaExpiracion = this.obtenerFechaExpiracionPedido(pedido);
              if (!fechaExpiracion) {
                return 'La publicación vence automáticamente 2 horas después del horario pactado.';
              }

              const diferenciaMs = fechaExpiracion.getTime() - Date.now();
              if (diferenciaMs <= 0) {
                return 'La publicación ya venció y se eliminará al sincronizar.';
              }

              const totalMinutos = Math.ceil(diferenciaMs / 60000);
              const horas = Math.floor(totalMinutos / 60);
              const minutos = totalMinutos % 60;

              if (horas <= 0) {
                return `La publicación vence en ${totalMinutos} min.`;
              }

              if (minutos === 0) {
                return `La publicación vence en ${horas} h.`;
              }

              return `La publicación vence en ${horas} h ${minutos} min.`;
             }

             async eliminarPedidoPendienteExpirado(pedido: DatosFlete): Promise<boolean> {
              if (!pedido?.uid || !pedido?.id || !this.pedidoExpirado(pedido)) {
                return false;
              }

              try {
                await this.angularFirestore.doc(`PedirFlete/${pedido.uid}/Pedidos/${pedido.id}`).delete();
                return true;
              } catch (error) {
                console.error('No se pudo eliminar el pedido expirado:', error);
                return false;
              }
             }

             private getCallable(functionName: string) {
              return httpsCallable(functions, functionName);
             }

             private shouldUseLocalConfirmationFallback(): boolean {
              if (environment.production || typeof window === 'undefined') {
                return false;
              }

              return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
             }

             private isCallableEndpointUnavailable(error: any): boolean {
              const code = String(error?.code || '').toLowerCase();
              const message = String(error?.message || '').toLowerCase();

              const endpointNotFound = (code === 'functions/not-found' || code === 'not-found')
                && !message.includes('no se encontr');
              const networkOrCorsFailure = code === 'functions/internal' || code === 'internal';

              return endpointNotFound || networkOrCorsFailure;
             }

             async confirmarPedidoConRespuesta(
              pedido: DatosFlete,
              respuestaSeleccionada: respuesta,
              fleteEnProceso: FleteEnProceso
             ): Promise<void> {
              if (this.shouldUseLocalConfirmationFallback()) {
                console.warn('Entorno local detectado; usando confirmación local hasta desplegar la Callable.');
                await this.confirmarPedidoConRespuestaFallback(pedido, respuestaSeleccionada, fleteEnProceso);
                return;
              }

              const callable = this.getCallable('confirmarPedidoConRespuestaSeguro');
              try {
                await callable({
                  pedido,
                  respuesta: respuestaSeleccionada,
                  fleteEnProceso,
                });
              } catch (error) {
                if (!this.isCallableEndpointUnavailable(error)) {
                  throw error;
                }

                console.warn('Callable confirmarPedidoConRespuestaSeguro no disponible; usando confirmación local.', error);
                await this.confirmarPedidoConRespuestaFallback(pedido, respuestaSeleccionada, fleteEnProceso);
              }
             }

             private async confirmarPedidoConRespuestaFallback(
              pedido: DatosFlete,
              respuestaSeleccionada: respuesta,
              fleteEnProceso: FleteEnProceso
             ): Promise<void> {
              const usuarioId = (pedido.uid || '').trim();
              const pedidoId = (pedido.id || '').trim();
              const fleteroId = (respuestaSeleccionada.idFletero || fleteEnProceso.fleteroId || '').trim();
              const respuestaId = (respuestaSeleccionada.docId || fleteroId).trim();
              const fleteId = (fleteEnProceso.id || '').trim();

              if (!usuarioId || !pedidoId || !fleteroId || !respuestaId || !fleteId) {
                throw new Error('Faltan datos para confirmar el pedido localmente.');
              }

              const fechaConfirmacion = new Date();

              await this.angularFirestore
                .collection(`Fleteros/${fleteroId}/FletesProceso`)
                .doc(fleteId)
                .set({
                  ...fleteEnProceso,
                  id: fleteId,
                  pedidoId,
                  usuarioId,
                  fleteroId,
                  estado: 'Confirmado',
                  fechaConfirmacion,
                }, { merge: true });

              await this.angularFirestore
                .collection(`PedirFlete/${usuarioId}/PedidosConfirmados`)
                .doc(pedidoId)
                .set({
                  ...pedido,
                  uid: usuarioId,
                  usuarioId,
                  pedidoId,
                  fleteroId,
                  precio: respuestaSeleccionada.precio ?? pedido.precio ?? 0,
                  respuesta: respuestaSeleccionada,
                  estadoViaje: 'Confirmado',
                  fechaConfirmacion,
                }, { merge: true });

              await Promise.all([
                this.angularFirestore.doc(`PedirFlete/${usuarioId}/Pedidos/${pedidoId}`).delete(),
                this.angularFirestore.doc(`PedirFlete/${usuarioId}/Pedidos/${pedidoId}/Respuesta/${respuestaId}`).delete(),
              ]);
             }

             private async incrementarMetricas(path: string, id: string, incrementos: Record<string, number>): Promise<void> {
              const docRef = this.angularFirestore.collection(path).doc(id);
              const snap = await docRef.ref.get();
              const actual = (snap.data() || {}) as Record<string, unknown>;
              const siguiente: Record<string, number | Date> = {
                updatedAt: new Date(),
              };

              for (const [campo, delta] of Object.entries(incrementos)) {
                const valorActual = typeof actual[campo] === 'number' ? Number(actual[campo]) : 0;
                siguiente[campo] = valorActual + delta;
              }

              await docRef.set(siguiente, { merge: true });
             }

             async movePedidoToPedidosHechos(pedido: DatosFlete, respuesta: respuesta) {
              try {
                const precio = respuesta.precio;
            
                // Agregar el pedido a la colección "PedidosConfirmados" con el precio proporcionado
                const pedidoHecho = { ...pedido, precio };
                
                // Obtener una referencia al documento en "PedidosConfirmados"
                const pedidoFinalizadoRef = this.angularFirestore.collection(`PedirFlete/${pedido.uid}/PedidosConfirmados`).doc(pedido.id);
                
                // Agregar el pedido y la respuesta al mismo documento en "PedidosConfirmados"
                await pedidoFinalizadoRef.set({
                  ...pedidoHecho,
                  respuesta: respuesta // Esto agrega la respuesta como un campo dentro del documento
                });
            
                // Eliminar el pedido de la colección actual
                await this.angularFirestore.doc(`PedirFlete/${pedido.uid}/Pedidos/${pedido.id}`).delete();
                await this.angularFirestore.doc(`PedirFlete/${pedido.uid}/Pedidos/${pedido.id}/Respuesta/${respuesta.idFletero}`).delete();
                await this.registrarConfirmacionUsuario(pedido.uid);
                // Show a success message
                return true; // Éxito
              } catch (error) {
                console.error('Error al mover el pedido:', error);
                return false; // Error
              }
            }
            


    getFirestoreInstance() {
    return this.angularFirestore;
  }
  async getOrCreateChat(
    userId: string,
    fleteroId: string,
    pedidoId: string,
    chatContext?: {
      userNombre?: string;
      fleteroNombre?: string;
      pedidoResumen?: {
        desde?: string;
        hasta?: string;
        fecha?: any;
        hora?: number;
        minutos?: number;
        cargamento?: string;
      };
    }
  ) {
  const chatId = `${userId}_${fleteroId}_${pedidoId}`;
  const existingPath = await this.resolveChatDocPath(chatId);
  if (existingPath) {
    const snap = await this.angularFirestore.doc(existingPath).get().toPromise();
    return {
      id: chatId,
      path: existingPath,
      ...((snap?.data() as any) || {})
    };
  }

  const chatPath = `PedirFlete/${userId}/PedidosConfirmados/${pedidoId}/chats/${chatId}`;
  const chatRef = this.angularFirestore.doc(chatPath);
  const ahora = new Date();
  const nuevoChat = {
    id: chatId,
    path: chatPath,
    userId,
    fleteroId,
    pedidoId,
    fleteId: pedidoId,
    estado: 'activo',
    userNombre: chatContext?.userNombre || '',
    fleteroNombre: chatContext?.fleteroNombre || '',
    pedidoResumen: chatContext?.pedidoResumen || null,
    mensajes: [],
    creado: ahora,
    createdAt: ahora,
    lastMessage: '',
    lastMessageTime: ahora,
    typing: { usuario: false, fletero: false }
  };

  await chatRef.set(nuevoChat, { merge: true });
  return nuevoChat;
}


    deleteDocument(path: string, id: string): Promise<void> {
    return this.angularFirestore.collection(path).doc(id).delete();
      }
              


// guarda datos sin idÇ
createDocument<tipo>(data: tipo, enlace: string, id: string) {
  const ref = this.angularFirestore.doc(`${enlace}/${id}`);
  return this.ensureAuthenticatedWriteContext().then(() => ref.set(this.sanitizeWriteData(data)));
}



// guarda datos con id            
  createDoc<tipo>(data: any, path: string, id: string) {
    const collection = this.angularFirestore.collection(path);
    return this.ensureAuthenticatedWriteContext().then(() => collection.doc(id).set(this.sanitizeWriteData(data)));

  }

  async createDoc3<T>(collectionPath: string, data: T): Promise<string> {
    const collectionRef = this.angularFirestore.collection<T>(collectionPath);
    const docRef = await collectionRef.add(this.sanitizeWriteData(data));
    return docRef.id;
  }

  async createCollection(path: string): Promise<void> {
    try {
      await this.angularFirestore.collection(path).add({}); // Agregar un documento vacío para crear la colección
    } catch (error) {
      console.error('Error creating collection:', error);
      throw error;
    }
  }
  async addDataToDocument(collectionPath: string, documentId: string, data: any): Promise<void> {
    await this.ensureAuthenticatedWriteContext();
    const documentRef = this.angularFirestore.collection(collectionPath).doc(documentId);
    await documentRef.set(this.sanitizeWriteData(data), { merge: true });
  }

  createDoc2<tipo>(data: any, path: string, uid: string) {
    const collection = this.angularFirestore.collection(path);
    return this.ensureAuthenticatedWriteContext().then(() => collection.doc(uid).set(this.sanitizeWriteData(data)));

  }

  getAllFletero(){
    const pedidosCollectionPath = 'Fleteros'
    return this.angularFirestore.collection(pedidosCollectionPath).valueChanges() as Observable<UserF[]>;

  }

  getAllPedidos() {
    return this.auths.stateUser().pipe(
      switchMap((user) => {
        if (user) {
          // Obtén el UID del usuario autenticado
          const uid = user.uid;
          
          // Construye la ruta a la colección de pedidos del usuario
          const pedidosCollectionPath = `PedirFlete/${uid}/Pedidos`;
  
          // Devuelve un observable que obtiene los datos de la colección
          return this.angularFirestore.collection(pedidosCollectionPath).valueChanges() as Observable<DatosFlete[]>;
        } else {
          // Si el usuario no está autenticado, devuelva un observable vacío o maneje el caso según su lógica
          // return of([]);
        }
      })
    );
  }
  
  // updateDoc3(path: string, data: any): Promise<void> {
  //   return this.firestore.doc(path).update(data);
  // }
  
  // crea un id unico 
  createId() {
    return this.angularFirestore.createId();
  }
  
  getCollection<tipo>(path: string) { 
    
    const collection = this.angularFirestore.collection<tipo>(path);
    return collection.valueChanges();
    
  }

  getCollectionWithIds<tipo>(path: string) {
    const collection = this.angularFirestore.collection<tipo>(path);
    return collection.valueChanges({ idField: 'id' }) as Observable<tipo[]>;
  }

  getCollection2<tipo>(path: string, id : string) {

    const collection = this.angularFirestore.collection<tipo>(path);
    return collection.valueChanges(id);
  }
  
  
  getDoc<tipo>(path: string, id: string) {
    return this.angularFirestore.collection(path).doc<tipo>(id).valueChanges()
  }
  getDoc2<tipo>(path: string) {
    return this.angularFirestore.doc<tipo>(path).valueChanges();
  }
  
  
  updateDoc3(path: string, data: any): Promise<void> {
    return this.angularFirestore.doc(path).set(this.sanitizeWriteData(data), { merge: true });
  }
  
  async update(collection, id, dato){
    try{
      await this.ensureAuthenticatedWriteContext();
      return await this.angularFirestore.collection(collection).doc(id).set(this.sanitizeWriteData(dato), { merge: true });
    }catch(err) {
      console.log("error", err);
    }
  }
  updateDoc(path: string, id: string, data: any) {
    return this.ensureAuthenticatedWriteContext().then(() => this.angularFirestore.collection(path).doc(id).update(this.sanitizeWriteData(data)));
  }
  
  //para recomendacion
  updateDoc2(path: string, id: string, data: any) {
    return this.ensureAuthenticatedWriteContext().then(() => this.angularFirestore.collection(path).doc(id).update(this.sanitizeWriteData(data)));
  }
  
  //setear
  setDoc<T>(path: string, id: string, data: T): Promise<void> {
    const documentRef = this.angularFirestore.collection<T>(path).doc<T>(id);
    return this.ensureAuthenticatedWriteContext().then(() => documentRef.set(this.sanitizeWriteData(data)));
  }
  
  deleteDoc(path: string, id: string){
    return this.angularFirestore.collection(path).doc(id).delete();
  }
  
  getCollectionRef(path: string): AngularFirestoreCollection<any> {
    return this.angularFirestore.collection(path);
  }

  createPedido(uid: string, paso: number, data: any) {
    return this.angularFirestore.collection('Usuarios').doc(uid).collection('Pedidos').doc(`Paso${paso}`).set(data);
  }



  setPedidoId(id: string) {
    this.pedidoId = id;
  }

  getPedidoId() {
    return this.pedidoId;
  }



//card
getAll(collection: string): Observable<any[]> {
  return this.angularFirestore.collection(collection).valueChanges({ idField: 'uid' });
}

obtenerPedidosDisponibles(): Observable<DatosFlete[]> {
  return this.angularFirestore
    .collectionGroup<DatosFlete>('Pedidos')
    .valueChanges({ idField: 'id' })
    .pipe(
      map((pedidos) => (pedidos || []).filter((pedido) => pedido?.timestamp != null && !this.pedidoExpirado(pedido))),
      catchError((error) => {
        console.error('Error cargando pedidos disponibles:', error);
        return of([]);
      })
    ) as Observable<DatosFlete[]>;
}



createDoc5(data: any, collectionPath: string, documentId: string): Promise<void> {
  const docRef = this.angularFirestore.collection(collectionPath).doc(documentId);
  return this.ensureAuthenticatedWriteContext().then(() => docRef.set(this.sanitizeWriteData(data), { merge: true }));
}

// ========== MÉTODOS PARA GESTIONAR FLETES EN PROCESO ==========

/**
 * Guarda un flete en proceso en la subcollección FletesProceso del fletero
 */
async guardarFleteEnProceso(fleteroId: string, fleteEnProceso: FleteEnProceso): Promise<string> {
  const docRef = this.angularFirestore
    .collection(`Fleteros/${fleteroId}/FletesProceso`)
    .doc(fleteEnProceso.id);
  
  await docRef.set({
    ...fleteEnProceso,
    fechaConfirmacion: new Date()
  }, { merge: true });

  await this.registrarTomaDeViaje(fleteroId);
  
  return fleteEnProceso.id;
}

/**
 * Obtiene los fletes en proceso de un fletero en tiempo real
 */
obtenerFletesProceso(fleteroId: string): Observable<FleteEnProceso[]> {
  return this.angularFirestore
    .collection(`Fleteros/${fleteroId}/FletesProceso`)
    .valueChanges({ idField: 'id' }) as Observable<FleteEnProceso[]>;
}

/**
 * Obtiene un flete en proceso específico
 */
obtenerFleteEnProceso(fleteroId: string, fleteId: string): Observable<FleteEnProceso> {
  return this.angularFirestore
    .collection(`Fleteros/${fleteroId}/FletesProceso`)
    .doc(fleteId)
    .valueChanges() as Observable<FleteEnProceso>;
}

/**
 * Actualiza el estado de un flete en proceso
 */
async actualizarEstadoFlete(
  fleteroId: string,
  fleteId: string,
  nuevoEstado: EstadoFleteProceso
): Promise<void> {
  if (this.shouldUseLocalConfirmationFallback()) {
    console.warn('Entorno local detectado; actualizando estado local hasta desplegar la Callable.');
    await this.actualizarEstadoFleteFallback(fleteroId, fleteId, nuevoEstado);
    return;
  }

  const callable = this.getCallable('actualizarEstadoFleteSeguro');
  try {
    await callable({
      fleteroId,
      fleteId,
      nuevoEstado,
    });
  } catch (error) {
    if (!this.isCallableEndpointUnavailable(error)) {
      throw error;
    }

    console.warn('Callable actualizarEstadoFleteSeguro no disponible; usando actualizacion local.', error);
    await this.actualizarEstadoFleteFallback(fleteroId, fleteId, nuevoEstado);
  }
}

private async actualizarEstadoFleteFallback(
  fleteroId: string,
  fleteId: string,
  nuevoEstado: EstadoFleteProceso
): Promise<void> {
  const ref = this.angularFirestore.doc(`Fleteros/${fleteroId}/FletesProceso/${fleteId}`);

  if (nuevoEstado === 'En Viaje') {
    await ref.set({
      estado: 'En Viaje',
      fechaInicioViaje: new Date(),
    }, { merge: true });
    return;
  }

  const snap = await ref.ref.get();
  const flete = snap.data() as FleteEnProceso | undefined;
  if (!flete) {
    throw new Error('No se encontro el viaje para actualizar su estado.');
  }

  if (nuevoEstado === 'Finalizado') {
    await this.finalizarFleteYArchivarPedidoFallback({ ...flete, id: fleteId });
    return;
  }

  await ref.set({ estado: nuevoEstado }, { merge: true });
}

async finalizarFleteYArchivarPedido(flete: FleteEnProceso): Promise<void> {
  if (this.shouldUseLocalConfirmationFallback()) {
    console.warn('Entorno local detectado; usando finalizacion local hasta desplegar la Callable.');
    await this.finalizarFleteYArchivarPedidoFallback(flete);
    return;
  }

  const callable = this.getCallable('finalizarFleteSeguro');
  try {
    await callable({
      fleteroId: flete.fleteroId,
      fleteId: flete.id,
    });
  } catch (error) {
    if (!this.isCallableEndpointUnavailable(error)) {
      throw error;
    }

    console.warn('Callable finalizarFleteSeguro no disponible; usando finalizacion local.', error);
    await this.finalizarFleteYArchivarPedidoFallback(flete);
  }
}

async cancelarFleteYRegistrarEvento(
  flete: FleteEnProceso,
  cancelacion: Pick<CancelacionViaje, 'motivo' | 'canceladoPor' | 'observacion'>
): Promise<void> {
  if (this.shouldUseLocalConfirmationFallback()) {
    console.warn('Entorno local detectado; usando cancelacion local hasta desplegar la Callable.');
    await this.cancelarFleteYRegistrarEventoFallback(flete, cancelacion);
    return;
  }

  await this.ensureAuthenticatedWriteContext();
  const callable = this.getCallable('cancelarFleteSeguro');
  try {
    await callable({
      fleteroId: flete.fleteroId,
      fleteId: flete.id,
      motivo: cancelacion.motivo,
      observacion: cancelacion.observacion || '',
    });
  } catch (error) {
    if (!this.isCallableEndpointUnavailable(error)) {
      throw error;
    }

    console.warn('Callable cancelarFleteSeguro no disponible; usando cancelacion local.', error);
    await this.cancelarFleteYRegistrarEventoFallback(flete, cancelacion);
  }
}

private async finalizarFleteYArchivarPedidoFallback(flete: FleteEnProceso): Promise<void> {
  const fechaFinalizacion = new Date();
  const pedidoConfirmadoRef = this.angularFirestore.doc(`PedirFlete/${flete.usuarioId}/PedidosConfirmados/${flete.pedidoId}`);
  const pedidoFinalizadoRef = this.angularFirestore.doc(`PedirFlete/${flete.usuarioId}/PedidosFinalizados/${flete.pedidoId}`);
  const pedidoConfirmadoSnap = await pedidoConfirmadoRef.ref.get();
  const pedidoConfirmadoData = (pedidoConfirmadoSnap.data() ?? {}) as Record<string, unknown>;

  await this.angularFirestore
    .doc(`Fleteros/${flete.fleteroId}/FletesProceso/${flete.id}`)
    .set({
      estado: 'Finalizado',
      fechaFinalizacion,
    }, { merge: true });

  const payloadFinalizado = pedidoConfirmadoSnap.exists
    ? {
        ...pedidoConfirmadoData,
        uid: String(pedidoConfirmadoData['uid'] ?? flete.usuarioId),
        usuarioId: String(pedidoConfirmadoData['usuarioId'] ?? flete.usuarioId),
        pedidoId: String(pedidoConfirmadoData['pedidoId'] ?? flete.pedidoId),
        fleteroId: String(pedidoConfirmadoData['fleteroId'] ?? flete.fleteroId),
        estadoViaje: 'Finalizado',
        fechaFinalizacion,
      }
    : {
        id: flete.pedidoId,
        uid: flete.usuarioId,
        usuarioId: flete.usuarioId,
        pedidoId: flete.pedidoId,
        fleteroId: flete.fleteroId,
        nombre: flete.nombre,
        apellido: flete.apellido,
        fecha: flete.fecha,
        hora: flete.hora,
        minutos: flete.minutos,
        uDesde: flete.uDesde,
        uHasta: flete.uHasta,
        precio: flete.precioAceptado ?? flete.precio,
        precioAceptado: flete.precioAceptado || null,
        cargamento: flete.cargamento,
        tipoVehiculo: flete.tipoVehiculo,
        tipoServicio: flete.tipoServicio,
        ayudantes: flete.ayudantes,
        fechaConfirmacion: flete.fechaConfirmacion || null,
        fechaInicioViaje: flete.fechaInicioViaje || null,
        fechaFinalizacion,
        estadoViaje: 'Finalizado',
      };

  await pedidoFinalizadoRef.set(payloadFinalizado, { merge: true });
  if (pedidoConfirmadoSnap.exists) {
    await pedidoConfirmadoRef.delete();
  }

  await this.runOptionalLocalSystemWrite(
    () => this.registrarMetricasFinalizacion(flete.fleteroId),
    'metricas de finalizacion del fletero'
  );
  await this.runOptionalLocalSystemWrite(
    () => this.registrarMetricasUsuarioFinalizacion(flete.usuarioId),
    'metricas de finalizacion del usuario'
  );
  await this.cerrarChatRelacionado(flete.usuarioId, flete.fleteroId, flete.pedidoId);
}

private async cancelarFleteYRegistrarEventoFallback(
  flete: FleteEnProceso,
  cancelacion: Pick<CancelacionViaje, 'motivo' | 'canceladoPor' | 'observacion'>
): Promise<void> {
  const fechaCancelacion = new Date();
  const etapa = flete.estado === 'En Viaje' ? 'en_viaje' : 'antes_de_iniciar';
  const cancelacionData: CancelacionViaje = {
    motivo: cancelacion.motivo,
    canceladoPor: cancelacion.canceladoPor,
    observacion: cancelacion.observacion || '',
    fecha: fechaCancelacion,
    etapa,
  };

  await this.angularFirestore
    .doc(`Fleteros/${flete.fleteroId}/FletesProceso/${flete.id}`)
    .set({
      estado: 'Cancelado',
      cancelacion: cancelacionData,
      fechaCancelacion,
    }, { merge: true });

  const pedidoConfirmadoRef = this.angularFirestore.doc(`PedirFlete/${flete.usuarioId}/PedidosConfirmados/${flete.pedidoId}`);
  const pedidoCanceladoRef = this.angularFirestore.doc(`PedirFlete/${flete.usuarioId}/PedidosCancelados/${flete.pedidoId}`);
  const pedidoConfirmadoSnap = await pedidoConfirmadoRef.ref.get();
  const pedidoConfirmadoData = (pedidoConfirmadoSnap.data() ?? {}) as Record<string, unknown>;

  const payloadCancelado = pedidoConfirmadoSnap.exists
    ? {
        ...pedidoConfirmadoData,
        uid: String(pedidoConfirmadoData['uid'] ?? flete.usuarioId),
        usuarioId: String(pedidoConfirmadoData['usuarioId'] ?? flete.usuarioId),
        pedidoId: String(pedidoConfirmadoData['pedidoId'] ?? flete.pedidoId),
        fleteroId: String(pedidoConfirmadoData['fleteroId'] ?? flete.fleteroId),
        estadoViaje: 'Cancelado',
        cancelacion: cancelacionData,
        fechaCancelacion,
      }
    : {
        id: flete.pedidoId,
        uid: flete.usuarioId,
        pedidoId: flete.pedidoId,
        fleteroId: flete.fleteroId,
        usuarioId: flete.usuarioId,
        nombre: flete.nombre,
        apellido: flete.apellido,
        fecha: flete.fecha,
        hora: flete.hora,
        minutos: flete.minutos,
        uDesde: flete.uDesde,
        uHasta: flete.uHasta,
        precio: flete.precio,
        precioAceptado: flete.precioAceptado || null,
        cargamento: flete.cargamento,
        tipoVehiculo: flete.tipoVehiculo,
        tipoServicio: flete.tipoServicio,
        ayudantes: flete.ayudantes,
        fechaConfirmacion: flete.fechaConfirmacion || null,
        fechaInicioViaje: flete.fechaInicioViaje || null,
        fechaCancelacion,
        estadoViaje: 'Cancelado',
        cancelacion: cancelacionData,
      };

  await pedidoCanceladoRef.set(payloadCancelado, { merge: true });
  if (pedidoConfirmadoSnap.exists) {
    await pedidoConfirmadoRef.delete();
  }
  if (this.esCancelacionImputableAlFletero(cancelacionData)) {
    await this.runOptionalLocalSystemWrite(
      () => this.registrarMetricasCancelacion(flete.fleteroId, etapa),
      'metricas de cancelacion del fletero'
    );
  }
  await this.runOptionalLocalSystemWrite(
    () => this.registrarMetricasUsuarioCancelacion(flete.usuarioId, cancelacion.canceladoPor, etapa),
    'metricas de cancelacion del usuario'
  );
  /*



      usuarioId: flete.usuarioId,
      alertaId,
      pedidoId: flete.pedidoId,
      fleteProcesoId: flete.id,
      fecha: fechaCancelacion,
      actor: 'Sistema',
      accion: 'penalizacion_usuario',
      etapa,
      motivo: cancelacion.motivo,
      detalle: `Cancelación registrada por el usuario en etapa ${etapa}.`,
      origenPantalla: 'sistema',
      scoreAnterior: Number(metricasUsuario.scoreConfiabilidadUsuario ?? 100),
      scoreNuevo: Number(metricasUsuario.scoreConfiabilidadUsuario ?? 100),
    });
  }

  */
  await this.cerrarChatRelacionado(flete.usuarioId, flete.fleteroId, flete.pedidoId);
}

private async runOptionalLocalSystemWrite(action: () => Promise<void>, label: string): Promise<void> {
  try {
    await action();
  } catch (error) {
    const code = String((error as any)?.code || '').toLowerCase();
    if (code.includes('permission-denied') || code.includes('permission_denied')) {
      console.warn(`No se pudieron actualizar ${label} desde el cliente. Debe resolverlo la Callable.`, error);
      return;
    }

    throw error;
  }
}

private esCancelacionImputableAlFletero(cancelacion: Pick<CancelacionViaje, 'motivo' | 'canceladoPor'>): boolean {
  return cancelacion.canceladoPor === 'Fletero' || cancelacion.motivo === 'no_inicio_24h';
}

/**
 * Actualiza la ubicación actual del flete
 */
async actualizarUbicacionFlete(
  fleteroId: string,
  fleteId: string,
  latitud: number,
  longitud: number
): Promise<void> {
  return this.angularFirestore
    .collection(`Fleteros/${fleteroId}/FletesProceso`)
    .doc(fleteId)
    .update({
      ubicacionActual: { latitude: latitud, longitude: longitud },
      ubicacionActualizadaAt: new Date(),
    });
}

async registrarSalidaParadaFlete(
  fleteroId: string,
  fleteId: string,
  parada: { id: string; orden: number; direccion?: string }
): Promise<void> {
  const fecha = new Date();
  const evento = {
    id: `${parada.id || parada.orden}-salida-${fecha.getTime()}`,
    paradaId: parada.id,
    orden: parada.orden,
    tipo: 'salida',
    mensaje: `El fletero salio de la parada ${parada.orden}`,
    fecha,
  };

  return this.angularFirestore
    .collection(`Fleteros/${fleteroId}/FletesProceso`)
    .doc(fleteId)
    .set({
      paradasEventos: firebase.firestore.FieldValue.arrayUnion(evento),
      [`paradasVisitadas.${parada.id}`]: true,
      ultimaParadaEvento: evento,
    }, { merge: true });
}

/**
 * Obtiene los fletes en proceso filtrados por estado
 */
obtenerFletesPorEstado(
  fleteroId: string,
  estado: EstadoFleteProceso
): Observable<FleteEnProceso[]> {
  return this.angularFirestore
    .collection(`Fleteros/${fleteroId}/FletesProceso`, ref =>
      ref.where('estado', '==', estado)
    )
    .valueChanges({ idField: 'id' }) as Observable<FleteEnProceso[]>;
}

/**
 * Obtiene un FleteEnProceso por el pedidoId original
 */
obtenerFleteProcesoPorPedidoId(
  fleteroId: string,
  pedidoId: string,
  usuarioId?: string
): Observable<FleteEnProceso[]> {
  return this.angularFirestore
    .collection(`Fleteros/${fleteroId}/FletesProceso`, ref =>
      usuarioId
        ? ref.where('pedidoId', '==', pedidoId).where('usuarioId', '==', usuarioId)
        : ref.where('pedidoId', '==', pedidoId)
    )
    .valueChanges({ idField: 'id' }) as Observable<FleteEnProceso[]>;
}

private async cerrarChatRelacionado(userId: string, fleteroId: string, pedidoId: string): Promise<void> {
  const chatsSnap = await this.angularFirestore
    .collectionGroup('chats', ref =>
      ref.where('userId', '==', userId).where('fleteroId', '==', fleteroId)
    )
    .get()
    .toPromise();

  const updates = (chatsSnap?.docs || [])
    .filter((doc) => {
      const data = doc.data() as any;
      return data?.pedidoId === pedidoId || data?.fleteId === pedidoId || doc.id === pedidoId || doc.id === `${userId}_${fleteroId}_${pedidoId}`;
    })
    .map((doc) => doc.ref.set({ estado: 'cerrado' }, { merge: true }));

  if (updates.length > 0) {
    await Promise.all(updates);
  }
}

private async resolveChatDocPath(chatId: string): Promise<string | null> {
  try {
    const rootSnap = await this.angularFirestore.doc(`chats/${chatId}`).get().toPromise();
    if (rootSnap?.exists) {
      return `chats/${chatId}`;
    }
  } catch (error) {
    if (!this.isPermissionDenied(error)) {
      throw error;
    }
    console.warn('No se pudo leer el chat raiz; se buscara un chat anidado.', error);
  }

  try {
    const groupSnap = await this.angularFirestore
      .collectionGroup('chats', ref => ref.where('id', '==', chatId).limit(1))
      .get()
      .toPromise();

    const doc = groupSnap?.docs?.[0];
    return doc ? doc.ref.path : null;
  } catch (error) {
    if (!this.isPermissionDenied(error)) {
      throw error;
    }
    console.warn('No se pudo resolver un chat existente por permisos; se intentara crear uno nuevo.', error);
    return null;
  }
}

private isPermissionDenied(error: any): boolean {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return code.includes('permission-denied')
    || code.includes('permission_denied')
    || message.includes('missing or insufficient permissions');
}

private async registrarMetricasCancelacion(fleteroId: string, etapa: 'antes_de_iniciar' | 'en_viaje'): Promise<void> {
  await this.incrementarMetricas('MetricasFleteros', fleteroId, {
    cancelacionesTotal: 1,
    cancelacionesAntesDeIniciar: etapa === 'antes_de_iniciar' ? 1 : 0,
    cancelacionesEnViaje: etapa === 'en_viaje' ? 1 : 0,
    sancionableScore: etapa === 'en_viaje' ? 2 : 1,
  });

  await this.actualizarConfiabilidadYSancion(fleteroId);
}

private async registrarConfirmacionUsuario(usuarioId: string): Promise<void> {
  await this.incrementarMetricas('MetricasUsuarios', usuarioId, {
    viajesConfirmadosTotal: 1,
  });

  await this.actualizarConfiabilidadUsuario(usuarioId);
}

private async notificarAdminPenalizacionUsuario(alerta: NotificacionPenalizacionUsuarioAdmin): Promise<string> {
  const alertaRef = this.angularFirestore.collection('AlertasAdminUsuarios').doc();
  await alertaRef.set({
    ...alerta,
    id: alertaRef.ref.id,
  }, { merge: true });

  await this.sincronizarPenalizacionesPendientesUsuario(alerta.usuarioId);
  return alertaRef.ref.id;
}

private async registrarHistorialPenalizacionUsuario(evento: HistorialPenalizacionUsuarioAdmin): Promise<void> {
  const historialRef = this.angularFirestore.collection('HistorialPenalizacionesUsuarios').doc();
  await historialRef.set({
    ...evento,
    id: historialRef.ref.id,
  }, { merge: true });
}

private async sincronizarPenalizacionesPendientesUsuario(usuarioId: string): Promise<void> {
  const metricasRef = this.angularFirestore.collection('MetricasUsuarios').doc(usuarioId);
  const snap = await this.angularFirestore.collection<NotificacionPenalizacionUsuarioAdmin>('AlertasAdminUsuarios', ref =>
    ref.where('usuarioId', '==', usuarioId).where('estado', '==', 'pendiente')
  ).ref.get();

  const pendientes = snap.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() as NotificacionPenalizacionUsuarioAdmin) }))
    .sort((a, b) => {
      const aTime = new Date(a.fecha as any).getTime();
      const bTime = new Date(b.fecha as any).getTime();
      return bTime - aTime;
    });

  const ultimaPendiente = pendientes[0];

  await metricasRef.set({
    penalizacionPendienteAdmin: pendientes.length > 0,
    penalizacionesPendientesCount: pendientes.length,
    ultimoMotivoPenalizacion: ultimaPendiente?.motivo || '',
    ultimaPenalizacionEtapa: ultimaPendiente?.etapa || null,
    ultimaPenalizacionFecha: ultimaPendiente?.fecha || null,
    ultimoEventoPenalizacionId: ultimaPendiente?.id || '',
    updatedAt: new Date(),
  }, { merge: true });
}

private async registrarTomaDeViaje(fleteroId: string): Promise<void> {
  await this.incrementarMetricas('MetricasFleteros', fleteroId, {
    viajesTomadosTotal: 1,
  });

  await this.actualizarConfiabilidadYSancion(fleteroId);
}

private async registrarMetricasFinalizacion(fleteroId: string): Promise<void> {
  await this.incrementarMetricas('MetricasFleteros', fleteroId, {
    viajesFinalizados: 1,
  });

  await this.actualizarConfiabilidadYSancion(fleteroId);
}

private async registrarMetricasUsuarioFinalizacion(usuarioId: string): Promise<void> {
  await this.incrementarMetricas('MetricasUsuarios', usuarioId, {
    viajesFinalizados: 1,
  });

  await this.actualizarConfiabilidadUsuario(usuarioId);
}

private async registrarMetricasUsuarioCancelacion(
  usuarioId: string,
  canceladoPor: 'Fletero' | 'Usuario' | 'Sistema',
  etapa: 'antes_de_iniciar' | 'en_viaje'
): Promise<void> {
  await this.incrementarMetricas('MetricasUsuarios', usuarioId, {
    cancelacionesTotal: 1,
    cancelacionesPorFletero: canceladoPor === 'Fletero' ? 1 : 0,
    cancelacionesPorUsuario: canceladoPor === 'Usuario' ? 1 : 0,
    cancelacionesAntesDeIniciar: canceladoPor === 'Usuario' && etapa === 'antes_de_iniciar' ? 1 : 0,
    cancelacionesEnViaje: canceladoPor === 'Usuario' && etapa === 'en_viaje' ? 1 : 0,
  });

  await this.actualizarConfiabilidadUsuario(usuarioId);
}

private async actualizarConfiabilidadYSancion(fleteroId: string): Promise<void> {
  const metricasRef = this.angularFirestore.collection('MetricasFleteros').doc(fleteroId);
  const fleteroRef = this.angularFirestore.collection('Fleteros').doc(fleteroId);

  const [metricasSnap, fleteroSnap] = await Promise.all([
    metricasRef.ref.get(),
    fleteroRef.ref.get(),
  ]);

  const metricas = (metricasSnap.data() ?? {}) as MetricasFletero;
  const fletero = (fleteroSnap.data() ?? {}) as UserF;

  const viajesTomados = Number(metricas.viajesTomadosTotal || 0);
  const viajesFinalizados = Number(metricas.viajesFinalizados || 0);
  const cancelacionesTotal = Number(metricas.cancelacionesTotal || 0);
  const cancelacionesAntesDeIniciar = Number(metricas.cancelacionesAntesDeIniciar || 0);
  const cancelacionesEnViaje = Number(metricas.cancelacionesEnViaje || 0);
  const viajesTomadosSeguro = Math.max(viajesTomados, 0);
  const tasaFinalizacion = viajesTomadosSeguro > 0
    ? Math.round((viajesFinalizados / viajesTomadosSeguro) * 100)
    : 100;

  const scoreBruto = 100
    - (cancelacionesAntesDeIniciar * 12)
    - (cancelacionesEnViaje * 25)
    - (Math.max(cancelacionesTotal - 1, 0) * 4)
    + Math.min(viajesFinalizados * 3, 18)
    + Math.min(viajesTomados, 10);

  const scoreConfiabilidad = Math.max(0, Math.min(100, Math.round(scoreBruto)));
  const nivelConfiabilidad: NivelConfiabilidad = scoreConfiabilidad >= 85
    ? 'Alta'
    : scoreConfiabilidad >= 65
      ? 'Media'
      : scoreConfiabilidad >= 40
        ? 'Baja'
        : 'Critica';

  const { estadoSancion, motivoSancionAutomatica } = this.calcularSancionAutomatica({
    scoreConfiabilidad,
    cancelacionesTotal,
    cancelacionesEnViaje,
  });

  const bloqueadoPorSancion = estadoSancion === 'suspension_automatica' || estadoSancion === 'bloqueado_revision';
  const bloqueoManualAdmin = Boolean(metricas.bloqueoManualAdmin ?? fletero?.bloqueoManualAdmin);
  const motivoBloqueoManual = metricas.motivoBloqueoManual ?? fletero?.motivoBloqueoManual ?? '';
  const apelacionPendiente = Boolean(metricas.apelacionPendiente ?? fletero?.apelacionPendiente);
  const apelacionDetalle = metricas.apelacionDetalle ?? fletero?.apelacionDetalle ?? '';
  const estadoAnterior = (metricas.estadoSancion || fletero?.estadoSancion || 'normal') as string;

  await metricasRef.set({
    updatedAt: new Date(),
    scoreConfiabilidad,
    nivelConfiabilidad,
    estadoSancion,
    bloqueadoPorSancion,
    motivoSancionAutomatica,
    bloqueoManualAdmin,
    motivoBloqueoManual,
    apelacionPendiente,
    apelacionDetalle,
    tasaFinalizacion,
  }, { merge: true });

  await fleteroRef.set({
    scoreConfiabilidad,
    nivelConfiabilidad,
    estadoSancion,
    bloqueadoPorSancion,
    bloqueoManualAdmin,
    motivoBloqueoManual,
    apelacionPendiente,
    apelacionDetalle,
  }, { merge: true });

  if (estadoAnterior !== estadoSancion) {
    await this.registrarHistorialSancionFletero({
      fleteroId,
      fecha: new Date(),
      actor: 'Sistema',
      accion: 'sancion_automatica',
      estadoAnterior,
      estadoNuevo: estadoSancion,
      bloqueadoManualAnterior: bloqueoManualAdmin,
      bloqueadoManualNuevo: bloqueoManualAdmin,
      motivo: motivoSancionAutomatica,
      detalle: `Score ${scoreConfiabilidad} | tasa finalización ${tasaFinalizacion}%`,
    });
  }
}

private async actualizarConfiabilidadUsuario(usuarioId: string): Promise<void> {
  const metricasRef = this.angularFirestore.collection('MetricasUsuarios').doc(usuarioId);
  const usuarioRef = this.angularFirestore.collection('Usuarios').doc(usuarioId);
  const [metricasSnap] = await Promise.all([
    metricasRef.ref.get(),
    usuarioRef.ref.get(),
  ]);

  const metricas = (metricasSnap.data() ?? {}) as MetricasUsuario;
  const viajesConfirmadosTotal = Number(metricas.viajesConfirmadosTotal || 0);
  const viajesFinalizados = Number(metricas.viajesFinalizados || 0);
  const cancelacionesPorFletero = Number(metricas.cancelacionesPorFletero || 0);
  const cancelacionesPorUsuario = Number(metricas.cancelacionesPorUsuario || 0);
  const cancelacionesAntesDeIniciar = Number(metricas.cancelacionesAntesDeIniciar || 0);
  const cancelacionesEnViaje = Number(metricas.cancelacionesEnViaje || 0);

  const tasaFinalizacion = viajesConfirmadosTotal > 0
    ? Math.round((viajesFinalizados / viajesConfirmadosTotal) * 100)
    : 100;

  const scoreBruto = 100
    - (cancelacionesAntesDeIniciar * 12)
    - (cancelacionesEnViaje * 28)
    - (Math.max(cancelacionesPorUsuario - 1, 0) * 4)
    + Math.min(viajesFinalizados * 2, 16);

  const scoreConfiabilidadUsuario = Math.max(0, Math.min(100, Math.round(scoreBruto)));
  const nivelConfiabilidadUsuario: NivelConfiabilidad = scoreConfiabilidadUsuario >= 85
    ? 'Alta'
    : scoreConfiabilidadUsuario >= 65
      ? 'Media'
      : scoreConfiabilidadUsuario >= 40
        ? 'Baja'
        : 'Critica';

  await metricasRef.set({
    updatedAt: new Date(),
    cancelacionesPorFletero,
    cancelacionesPorUsuario,
    cancelacionesAntesDeIniciar,
    cancelacionesEnViaje,
    scoreConfiabilidadUsuario,
    nivelConfiabilidadUsuario,
    tasaFinalizacion,
  }, { merge: true });

  await usuarioRef.set({
    scoreConfiabilidadUsuario,
    nivelConfiabilidadUsuario,
  }, { merge: true });
}

async despenalizarUsuario(
  alertaId: string,
  detalleAdmin: string = 'Despenalización manual por admin',
  origenPantalla: 'usuarios' | 'reportes' = 'usuarios'
): Promise<void> {
  const callable = this.getCallable('adminDespenalizarUsuario');
  await callable({ alertaId, detalleAdmin, origenPantalla });
}

async setRolPanelUsuario(uid: string, rol: RolPanel, activo: boolean = true, actorAdmin: string = 'admin-panel'): Promise<void> {
  const normalizedUid = uid.trim();
  if (!normalizedUid) {
    throw new Error('Falta el usuario a modificar.');
  }

  if (this.shouldUseLocalConfirmationFallback()) {
    await this.setRolPanelUsuarioFallback(normalizedUid, rol, activo, actorAdmin);
    return;
  }

  const callable = this.getCallable('adminSetRolPanelUsuario');
  try {
    await callable({ uid: normalizedUid, rol, activo, actorAdmin });
  } catch (error) {
    if (!this.isCallableEndpointUnavailable(error)) {
      throw error;
    }

    console.warn('Callable adminSetRolPanelUsuario no disponible; usando fallback local.', error);
    await this.setRolPanelUsuarioFallback(normalizedUid, rol, activo, actorAdmin);
  }
}

private async setRolPanelUsuarioFallback(uid: string, rol: RolPanel, activo: boolean, actorAdmin: string): Promise<void> {
  const [usuarioSnap, fleteroSnap, currentUser] = await Promise.all([
    this.angularFirestore.collection('Usuarios').doc(uid).ref.get(),
    this.angularFirestore.collection('Fleteros').doc(uid).ref.get(),
    this.auths.requireCurrentUser(),
  ]);

  const usuario = (usuarioSnap.data() || {}) as UserU;
  const fletero = (fleteroSnap.data() || {}) as UserF;
  const email = usuario.email || fletero.email || '';

  await this.angularFirestore.collection('Admins').doc(uid).set({
    uid,
    email,
    rol,
    activo,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy: currentUser.uid,
    updatedByLabel: actorAdmin,
  }, { merge: true });
}

async setPerfilAplicacionUsuario(uid: string, perfilActivo: 'Usuario' | 'Fletero', motivo: string, actorAdmin: string = 'admin-panel'): Promise<void> {
  const callable = this.getCallable('adminSetPerfilAplicacionUsuario');
  await callable({ uid, perfilActivo, motivo, actorAdmin });
}

async setBloqueoManualFletero(fleteroId: string, bloquear: boolean, motivo: string, actorAdmin: string = 'admin-panel'): Promise<void> {
  const callable = this.getCallable('adminSetBloqueoManualFletero');
  await callable({ fleteroId, bloquear, motivo, actorAdmin });
}

async setHabilitadoFletero(fleteroId: string, habilitado: boolean, actorAdmin: string = 'admin-panel'): Promise<void> {
  if (this.shouldUseLocalConfirmationFallback()) {
    await this.setHabilitadoFleteroFallback(fleteroId, habilitado);
    return;
  }

  const callable = this.getCallable('adminSetHabilitadoFletero');
  try {
    await callable({ fleteroId, habilitado, actorAdmin });
  } catch (error) {
    if (!this.shouldUseLocalConfirmationFallback() || !this.isCallableEndpointUnavailable(error)) {
      throw error;
    }

    console.warn('Callable adminSetHabilitadoFletero no disponible; usando fallback local sin historial.', error);
    await this.setHabilitadoFleteroFallback(fleteroId, habilitado);
  }
}

async setVerificadoFletero(fleteroId: string, verificado: boolean, actorAdmin: string = 'admin-panel'): Promise<void> {
  if (this.shouldUseLocalConfirmationFallback()) {
    await this.setVerificadoFleteroFallback(fleteroId, verificado, actorAdmin);
    return;
  }

  const callable = this.getCallable('adminSetVerificadoFletero');
  try {
    await callable({ fleteroId, verificado, actorAdmin });
  } catch (error) {
    if (!this.shouldUseLocalConfirmationFallback() || !this.isCallableEndpointUnavailable(error)) {
      throw error;
    }

    console.warn('Callable adminSetVerificadoFletero no disponible; usando fallback local sin historial.', error);
    await this.setVerificadoFleteroFallback(fleteroId, verificado, actorAdmin);
  }
}

private async setHabilitadoFleteroFallback(fleteroId: string, habilitado: boolean): Promise<void> {
  const normalizedId = fleteroId.trim();

  if (!normalizedId) {
    throw new Error('Falta el fletero a actualizar.');
  }

  await this.angularFirestore.collection('Fleteros').doc(normalizedId).set({
    habilitado,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

private async setVerificadoFleteroFallback(fleteroId: string, verificado: boolean, actorAdmin: string): Promise<void> {
  const normalizedId = fleteroId.trim();

  if (!normalizedId) {
    throw new Error('Falta el fletero a actualizar.');
  }

  const fleteroRef = this.angularFirestore.collection('Fleteros').doc(normalizedId);
  const fleteroSnap = await fleteroRef.ref.get();
  const fletero = (fleteroSnap.data() || {}) as UserF;
  const verificacionDni = fletero.verificacionDni || {};
  const update: Record<string, unknown> = {
    verificado,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    verificacionDni: {
      ...verificacionDni,
      estado: verificado ? 'aprobado' : (verificacionDni.estado || 'pendiente'),
      observacion: verificado
        ? 'Validado manualmente desde admin.'
        : (verificacionDni.observacion || ''),
      revisadoPorAdmin: verificado,
      fechaRevision: firebase.firestore.FieldValue.serverTimestamp(),
      revisadoPor: actorAdmin,
    },
  };

  if (verificado) {
    update['habilitado'] = true;
  }

  await fleteroRef.set(update, { merge: true });
}

async revisarDniFletero(
  fleteroId: string,
  estado: Exclude<EstadoRevisionDocumento, 'pendiente'>,
  observacion: string,
  actorAdmin: string = 'admin-panel'
): Promise<void> {
  const callable = this.getCallable('adminRevisarDniFletero');
  await callable({ fleteroId, estado, observacion, actorAdmin });
}

async marcarApelacionPendienteFletero(fleteroId: string, detalle: string, actorAdmin: string = 'admin-panel'): Promise<void> {
  const callable = this.getCallable('adminMarcarApelacionPendienteFletero');
  await callable({ fleteroId, detalle, actorAdmin });
}

async resolverApelacionFletero(fleteroId: string, aprobar: boolean, detalle: string, actorAdmin: string = 'admin-panel'): Promise<void> {
  const callable = this.getCallable('adminResolverApelacionFletero');
  await callable({ fleteroId, aprobar, detalle, actorAdmin });
}

private calcularSancionAutomatica(input: {
  scoreConfiabilidad: number;
  cancelacionesTotal: number;
  cancelacionesEnViaje: number;
}): {
  estadoSancion: EstadoSancionAutomatico;
  motivoSancionAutomatica: string;
} {
  if (input.cancelacionesEnViaje >= 3 || input.scoreConfiabilidad < 25) {
    return {
      estadoSancion: 'bloqueado_revision',
      motivoSancionAutomatica: 'Bloqueo automático por reincidencia crítica o score extremadamente bajo.',
    };
  }

  if (input.cancelacionesEnViaje >= 2 || input.scoreConfiabilidad < 45) {
    return {
      estadoSancion: 'suspension_automatica',
      motivoSancionAutomatica: 'Suspensión automática por cancelaciones graves o score bajo.',
    };
  }

  if (input.cancelacionesTotal >= 2 || input.scoreConfiabilidad < 70) {
    return {
      estadoSancion: 'advertencia',
      motivoSancionAutomatica: 'Advertencia por tendencia de cancelaciones o caída de confiabilidad.',
    };
  }

  return {
    estadoSancion: 'normal',
    motivoSancionAutomatica: 'Operación normal.',
  };
}

private async registrarHistorialSancionFletero(evento: HistorialSancionFletero): Promise<void> {
  const docRef = this.angularFirestore.collection('HistorialSancionesFleteros').doc();
  await docRef.set({
    id: docRef.ref.id,
    ...evento,
  }, { merge: true });
}

}
