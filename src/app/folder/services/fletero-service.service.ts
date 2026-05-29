import { Injectable } from '@angular/core';
import { AngularFirestore, AngularFirestoreCollection } from '@angular/fire/compat/firestore';
import { UserF } from '../models/models';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class FleteroServiceService {

  private fleterosCollection: AngularFirestoreCollection<UserF>;
  fleteros: Observable<UserF[]>;

  constructor(private firestore: AngularFirestore) {
    this.fleterosCollection = this.firestore.collection<UserF>('Fleteros');
    this.fleteros = this.fleterosCollection.valueChanges();
  }

  getFleteros(): Observable<UserF[]> {
    return this.fleteros;
  }

  getFleteroById(id: string): Observable<UserF | null> {
    return this.fleterosCollection
      .doc<UserF>(id)
      .snapshotChanges()
      .pipe(
        map((snapshot) => {
          if (snapshot.payload.exists) {
            const data = snapshot.payload.data();
            const fletero: UserF = {
              uid: snapshot.payload.id,
              ...data
            };
            return fletero;
          } else {
            return null;
          }
        })
      );
  }



  async actualizarFletero(fletero: UserF): Promise<void> {
    try {
      const fleteroRef = this.firestore.collection('fleteros').doc(fletero.uid);
      await fleteroRef.update(fletero);
    } catch (error) {
      console.error('Error al actualizar el fletero:', error);
      throw error;
    }
  }
}
