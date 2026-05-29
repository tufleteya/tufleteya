import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';

@Injectable({
  providedIn: 'root'
})
export class AdminService {

  constructor(private firestore: AngularFirestore) {}

  getUsuarios() {
    return this.firestore.collection('Usuarios').valueChanges({ idField: 'id' });
  }

  getFleteros() {
    return this.firestore.collection('Fleteros').valueChanges({ idField: 'id' });
  }

  getPedidosActivos() {
    return this.firestore.collectionGroup('Pedidos').valueChanges();
  }

  getPedidosConfirmados() {
    return this.firestore.collectionGroup('PedidosConfirmados').valueChanges();
  }

  getChats() {
    return this.firestore.collection('chats').valueChanges({ idField: 'id' });
  }
}

