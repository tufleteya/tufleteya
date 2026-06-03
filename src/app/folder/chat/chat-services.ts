import { Injectable } from '@angular/core';
// Importaciones de compatibilidad (AngularFire) para que coincidan con tu AppModule
import { AngularFirestore } from '@angular/fire/compat/firestore'; 
import firebase from 'firebase/compat/app';

import {
  Chat,
  Mensaje,
  SupportChat,
  SupportChatStatus,
  SupportMessage,
  SupportRequesterType,
  SupportSenderRole,
} from '../../folder/models/models';
import { Observable, of } from 'rxjs';
import { map, shareReplay, switchMap } from 'rxjs/operators'; // Necesario para adaptar la respuesta de AngularFirestore
import 'firebase/compat/firestore';

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly userChatCountCache = new Map<string, Observable<number>>();
  private readonly fleteroChatCountCache = new Map<string, Observable<number>>();

  // Inyectar AngularFirestore en lugar de Firestore (soluciona el NullInjectorError)
  constructor(private firestore: AngularFirestore) {}

getChat(chatId: string): Observable<Chat | undefined> {
  return this.firestore
    .collectionGroup<Chat>('chats', ref => ref.where('id', '==', chatId).limit(1))
    .snapshotChanges()
    .pipe(
      map(actions => actions[0] ? this.mapChatAction(actions[0]) : undefined)
    );
}

private buildChatId(userId: string, fleteroId: string, pedidoId: string): string {
  return `${userId}_${fleteroId}_${pedidoId}`;
}

async getOrCreateChat(
  userId: string,
  fleteroId: string,
  fleteroNombre: string,
  fleteId: string,
  userNombre: string
): Promise<Chat> {
  const pedidoId = fleteId;
  const chatId = this.buildChatId(userId, fleteroId, pedidoId);

  const existingPath = await this.resolveChatDocPath(chatId) || await this.resolveChatDocPath(pedidoId);
  if (existingPath) {
    const snap = await this.firestore.doc<Chat>(existingPath).get().toPromise();
    const data = ((snap?.data() || {}) as Partial<Chat>);
    return {
      ...data,
      id: data.id || chatId,
      pedidoId: data.pedidoId || pedidoId,
      fleteId: data.fleteId || pedidoId,
      path: existingPath,
    } as Chat;
  }

  const chatPath = `PedirFlete/${userId}/PedidosConfirmados/${pedidoId}/chats/${chatId}`;
  const chatRef = this.firestore.doc<Chat>(chatPath);

const nuevoChat: Chat = {
  id: chatId,
  path: chatPath,
  fleteId: pedidoId,
  pedidoId,
  userId,
  fleteroId,
  fleteroNombre,
  userNombre,
  estado: 'activo',
  createdAt: firebase.firestore.Timestamp.now(),
  lastMessage: '',
  lastMessageTime: firebase.firestore.Timestamp.now()
};

  await chatRef.set(nuevoChat);
  return nuevoChat;
}



  getMensajes(chatId: string): Observable<Mensaje[]> {
    return this.getChat(chatId).pipe(
      switchMap((chat) => {
        if (!chat?.path) {
          return of([]);
        }

        const chatPath = chat.path;
        return this.firestore.collection<Mensaje>(`${chatPath}/mensajes`, ref =>
          ref.orderBy('timestamp', 'asc')
        ).snapshotChanges();
      }),
      map(actions => actions.map(a => {
        const data = a.payload.doc.data() as Mensaje;
        const id = a.payload.doc.id;
        return { id, ...data };
      }))
    ) as Observable<Mensaje[]>;
  }
async enviarMensaje(
  chatId: string,
  senderId: string,
  senderRole: 'user' | 'fletero',
  text: string
) {
  const chatPath = await this.resolveChatDocPath(chatId);
  if (!chatPath) {
    throw new Error(`chat-not-found:${chatId}`);
  }

  const chatDocId = this.getDocIdFromPath(chatPath);
  const timestamp = firebase.firestore.FieldValue.serverTimestamp();
  const mensaje: Mensaje = {
    chatId: chatDocId,
    senderId,
    text,
    senderRole,
    timestamp: timestamp as any,
    leido: false
  };

  await this.firestore
    .collection(`${chatPath}/mensajes`)
    .add(mensaje);

  await this.firestore
    .doc(chatPath)
    .set(
      {
        lastMessage: text,
        lastMessageTime: timestamp
      },
      { merge: true }
    );
}












getChatsByUser(userId: string): Observable<Chat[]> {
    return this.firestore
      .collectionGroup<Chat>('chats', ref =>
        ref.where('userId', '==', userId)
      )
      .snapshotChanges()
      .pipe(
        map(actions =>
          actions.map(a => ({
            ...this.mapChatAction(a)
          }))
        )
      );
  }

  getActiveChatsByUser(userId: string): Observable<Chat[]> {
    return this.firestore
      .collectionGroup<Chat>('chats', ref =>
        ref.where('userId', '==', userId).where('estado', '==', 'activo')
      )
      .snapshotChanges()
      .pipe(
        map(actions =>
          actions.map(a => ({
            ...this.mapChatAction(a)
          }))
        )
      );
  }

  getOpenChatCountForUser(userId: string): Observable<number> {
    const cachedCount = this.userChatCountCache.get(userId);
    if (cachedCount) {
      return cachedCount;
    }

    const count$ = this.getActiveChatsByUser(userId).pipe(
      map(chats => chats.length),
      shareReplay({ bufferSize: 1, refCount: true })
    );

    this.userChatCountCache.set(userId, count$);
    return count$;
  }


  getChatsByFletero(fleteroId: string): Observable<Chat[]> {
  return this.firestore
    .collectionGroup<Chat>('chats', ref =>
      ref.where('fleteroId', '==', fleteroId)
         .orderBy('lastMessageTime', 'desc')
    )
    .snapshotChanges()
    .pipe(
      map(actions =>
        actions.map(a => ({
          ...this.mapChatAction(a)
        }))
      )
    );
}

getActiveChatsByFletero(fleteroId: string): Observable<Chat[]> {
  return this.firestore
    .collectionGroup<Chat>('chats', ref =>
      ref.where('fleteroId', '==', fleteroId)
         .where('estado', '==', 'activo')
         .orderBy('lastMessageTime', 'desc')
    )
    .snapshotChanges()
    .pipe(
      map(actions =>
        actions.map(a => ({
          ...this.mapChatAction(a)
        }))
      )
    );
}

getOpenChatCountForFletero(fleteroId: string): Observable<number> {
  const cachedCount = this.fleteroChatCountCache.get(fleteroId);
  if (cachedCount) {
    return cachedCount;
  }

  const count$ = this.getActiveChatsByFletero(fleteroId).pipe(
    map(chats => chats.length),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  this.fleteroChatCountCache.set(fleteroId, count$);
  return count$;
}

getPedido(fleteId: string): Observable<any> {
  return this.firestore
    .doc(`fletes/${fleteId}`)
    .valueChanges({ idField: 'id' });
}


actualizarEstadoFlete(fleteId: string, estado: string) {
  return this.firestore
    .doc(`fletes/${fleteId}`)
    .update({ estado });
}

updateChatTyping(
  chatId: string,
  rol: 'Usuario' | 'Fletero',
  escribiendo: boolean
) {
  const campo =
    rol === 'Usuario'
      ? { 'typing.usuario': escribiendo }
      : { 'typing.fletero': escribiendo };

  return this.resolveChatDocPath(chatId).then((chatPath) =>
    this.firestore
      .doc(chatPath || `chats/${chatId}`)
      .set(campo, { merge: true })
  );
}
getFleteroById(fleteroId: string): Observable<any> {
  return this.firestore
    .doc(`Fleteros/${fleteroId}`)
    .valueChanges({ idField: 'id' });
}
getUsuarioById(userId: string): Observable<any> {
  return this.firestore
    .doc(`Usuarios/${userId}`)
    .valueChanges({ idField: 'id' });
}

async getOrCreateSupportChat(
  requesterId: string,
  requesterType: SupportRequesterType,
  requesterName: string,
  requesterPhone = '',
  requesterEmail = '',
  subject = 'Soporte'
): Promise<SupportChat> {
  const activeSnap = await this.firestore
    .collection<SupportChat>('SupportChats', ref =>
      ref.where('requesterId', '==', requesterId)
         .orderBy('updatedAt', 'desc')
         .limit(10)
    )
    .get()
    .toPromise();

  const activeDoc = activeSnap?.docs?.find((doc) => {
    const status = (doc.data() as SupportChat).status;
    return status === 'en_espera' || status === 'atendido';
  });
  if (activeDoc?.exists) {
    return {
      id: activeDoc.id,
      ...(activeDoc.data() as SupportChat),
    };
  }

  const timestamp = firebase.firestore.FieldValue.serverTimestamp();
  const chatRef = this.firestore.collection<SupportChat>('SupportChats').doc();
  const supportChat: SupportChat = {
    id: chatRef.ref.id,
    requesterId,
    requesterType,
    requesterName,
    requesterPhone,
    requesterEmail,
    subject,
    status: 'en_espera',
    assignedTo: null,
    assignedToName: null,
    createdAt: timestamp as any,
    updatedAt: timestamp as any,
    lastMessage: '',
    lastMessageAt: timestamp as any,
    unreadBySupport: 0,
    unreadByRequester: 0,
  };

  await chatRef.set(supportChat);
  return supportChat;
}

getSupportChat(chatId: string): Observable<SupportChat | undefined> {
  return this.firestore
    .doc<SupportChat>(`SupportChats/${chatId}`)
    .snapshotChanges()
    .pipe(
      map(action => action.payload.exists
        ? ({ id: action.payload.id, ...(action.payload.data() as SupportChat) })
        : undefined
      )
    );
}

getMySupportChats(requesterId: string): Observable<SupportChat[]> {
  return this.firestore
    .collection<SupportChat>('SupportChats', ref =>
      ref.where('requesterId', '==', requesterId).orderBy('updatedAt', 'desc')
    )
    .snapshotChanges()
    .pipe(map(actions => actions.map(action => this.mapSupportChatAction(action))));
}

getSupportQueue(status: SupportChatStatus | 'todos' = 'todos'): Observable<SupportChat[]> {
  return this.firestore
    .collection<SupportChat>('SupportChats', ref => {
      const ordered = ref.orderBy('updatedAt', 'desc');
      return status === 'todos' ? ordered : ref.where('status', '==', status).orderBy('updatedAt', 'desc');
    })
    .snapshotChanges()
    .pipe(map(actions => actions.map(action => this.mapSupportChatAction(action))));
}

getSupportMessages(chatId: string): Observable<SupportMessage[]> {
  return this.firestore
    .collection<SupportMessage>(`SupportChats/${chatId}/mensajes`, ref => ref.orderBy('timestamp', 'asc'))
    .snapshotChanges()
    .pipe(
      map(actions => actions.map(action => ({
        id: action.payload.doc.id,
        ...(action.payload.doc.data() as SupportMessage),
      })))
    );
}

async sendSupportMessage(
  chatId: string,
  senderId: string,
  senderRole: SupportSenderRole,
  text: string
): Promise<void> {
  const timestamp = firebase.firestore.FieldValue.serverTimestamp();
  const message: SupportMessage = {
    chatId,
    senderId,
    senderRole,
    text,
    timestamp: timestamp as any,
    leido: false,
  };

  await this.firestore.collection(`SupportChats/${chatId}/mensajes`).add(message);

  const fromSupport = senderRole === 'soporte' || senderRole === 'admin';
  await this.firestore.doc(`SupportChats/${chatId}`).set({
    lastMessage: text,
    lastMessageAt: timestamp,
    lastMessageBy: senderId,
    updatedAt: timestamp,
    status: fromSupport ? 'atendido' : 'en_espera',
    unreadBySupport: firebase.firestore.FieldValue.increment(fromSupport ? 0 : 1),
    unreadByRequester: firebase.firestore.FieldValue.increment(fromSupport ? 1 : 0),
  }, { merge: true });
}

assignSupportChat(chatId: string, supportUid: string, supportName: string): Promise<void> {
  return this.firestore.doc(`SupportChats/${chatId}`).set({
    assignedTo: supportUid,
    assignedToName: supportName,
    status: 'atendido',
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

updateSupportChatStatus(chatId: string, status: SupportChatStatus): Promise<void> {
  const timestamp = firebase.firestore.FieldValue.serverTimestamp();
  const update: Partial<SupportChat> & { updatedAt: any } = {
    status,
    updatedAt: timestamp,
  };

  if (status === 'archivado') {
    update.archivedAt = timestamp;
  }

  if (status === 'cerrado') {
    update.closedAt = timestamp;
  }

  return this.firestore.doc(`SupportChats/${chatId}`).set(update, { merge: true });
}

updateSupportChatSubject(chatId: string, subject: string): Promise<void> {
  return this.firestore.doc(`SupportChats/${chatId}`).set({
    subject,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

markSupportChatRead(chatId: string, reader: 'support' | 'requester'): Promise<void> {
  const field = reader === 'support' ? 'unreadBySupport' : 'unreadByRequester';
  return this.firestore.doc(`SupportChats/${chatId}`).set({ [field]: 0 }, { merge: true });
}

private mapChatAction(action: any): Chat {
  const data = action.payload.doc.data() as Chat;
  const path = action.payload.doc.ref.path;
  return {
    id: data.id || action.payload.doc.id,
    ...data,
    path,
  };
}

private async resolveChatDocPath(chatId: string): Promise<string | null> {
  const groupSnap = await this.firestore
    .collectionGroup<Chat>('chats', ref => ref.where('id', '==', chatId).limit(1))
    .get()
    .toPromise();

  const doc = groupSnap?.docs?.[0];
  if (doc) {
    return doc.ref.path;
  }

  try {
    const rootSnap = await this.firestore.doc<Chat>(`chats/${chatId}`).get().toPromise();
    if (rootSnap?.exists) {
      return `chats/${chatId}`;
    }
  } catch (error) {
    console.warn('No se pudo leer el chat raiz, se continua con la busqueda anidada:', error);
  }

  return null;
}

private getDocIdFromPath(path: string): string {
  const parts = path.split('/').filter(Boolean);
  return parts[parts.length - 1] || path;
}

private mapSupportChatAction(action: any): SupportChat {
  const data = action.payload.doc.data() as SupportChat;
  return {
    id: data.id || action.payload.doc.id,
    ...data,
  };
}

}
