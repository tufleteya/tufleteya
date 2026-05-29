import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { AngularFireStorage } from '@angular/fire/compat/storage';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class NuevoService {
  private editingInProgress = false; // Variable de control
  private data: any[] = [];	
  continueLoading: boolean = true;
  constructor(private firestore: AngularFirestore,
 ) { }

 get shouldContinueLoading(): boolean {
  return this.continueLoading;
}

set shouldContinueLoading(value: boolean) {
  this.continueLoading = value;
}
stopLoading() {
  this.shouldContinueLoading = false;
  this.continueLoading = false;
}

updateDoc(path: string, id: string, data: any) {
  if (!this.editingInProgress) { // Verifica si la edición ya está en progreso
    this.editingInProgress = true; // Marca la edición como en progreso
    return this.firestore.collection(path).doc(id).update(data)
      .then(() => {
        // La edición se completó con éxito
        this.editingInProgress = false; // Restablece la variable de control
      })
      .catch(error => {
        // Manejo de errores
        this.editingInProgress = false; // Restablece la variable de control en caso de error
        console.error('Error al editar el documento:', error);
      });
  } else {
    // Si ya hay una edición en progreso, no hagas nada y devuelve una promesa vacía
    return Promise.resolve();
  }
}

 obtenerDatos(miColeccion: string): Observable<any[]> {
  const collectionRef = this.firestore.collection(miColeccion);
  return collectionRef.valueChanges();
}


 getCollection(collectionName: string): Observable<any[]> {
  return this.firestore.collection(collectionName).valueChanges();
}


 updateDocument(documentPath: string, data: any, ): Promise<void> {
  this.continueLoading = false;
  const documentRef = this.firestore.doc(documentPath);
  return documentRef.update(data);
}

    async create(collection, dato){
      try{
        return await this.firestore.collection(collection).add(dato);
      }catch(err) {
        console.log("error", err);
      }
    }
    
    async getAll2<tipo>(collection){
      try{
        return await this.firestore.collection(collection).snapshotChanges();
      }catch(err) {
        console.log("error", err);
      }
    }
    async getAll(collection){
      try{
        return await this.firestore.collection(collection).snapshotChanges();
      }catch(err) {
        console.log("error", err);
      }
    }

    updateObjectById(id: string, newData: any): boolean {
      const index = this.data.findIndex(item => item.id === id);
      if (index !== -1) {
        this.data[index] = { ...this.data[index], ...newData };
        return true; // Indica que la actualización fue exitosa
      }
      return false; // Indica que el objeto con el ID especificado no se encontró
    }

    async getById(collection, id){
      try{
        return await this.firestore.collection(collection).doc(id).get();
      }catch(err) {
        console.log("error", err);
      }
    }

    async delete(collection, id){
      try{
        return await this.firestore.collection(collection).doc(id).delete();
      }catch(err) {
        console.log("error", err);
      }
    }


    deleteDoc(path: string, id: string){
      return this.firestore.collection(path).doc(id).delete();
    }

    async update(collection, id, dato){
      try{
        return await this.firestore.collection(collection).doc(id).set(dato);
      }catch(err) {
        console.log("error", err);
      }
    }

  }
