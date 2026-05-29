import { Component, ViewChild } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { UserF, datosVehiculo, tipoVehiculo } from 'src/app/folder/models/models';
import { AuthService } from 'src/app/folder/services/auth.service';
import { FirestoreService } from 'src/app/folder/services/firestore.service';
import { InteractionService } from 'src/app/folder/services/interaction.service';
import { NuevoService } from 'src/app/folder/services/nuevo.service';
import { take } from 'rxjs/operators';
import { AngularFireStorage } from '@angular/fire/compat/storage';

@Component({
  selector: 'app-paso2-f',
  templateUrl: './paso2-f.component.html',
  styleUrls: ['./paso2-f.component.scss'],
})
export class Paso2FComponent {

  private formularioEnviado: boolean = false;

  registerF: UserF = {
    uid: null,
    nombre: null,
    apellido: null,
    dni: null,
    edad: null,
    domicilio: null,
    telefono: null,
    image: null,
    email: null,
    password: null,
    verificado: false,
    habilitado: false,
    perfil:  'Fletero',
    datosVehiculos: null,
    recomendacion: null,
  }
  
   prefijosTelefonicos = [
    "11", "351", "3543", "379", "370", "221", "380", "261", "299", "343",
    "376", "2804", "362", "2966", "387", "383", "264", "266", "381", "388",
    "342", "2954", "385", "2920", "2901"
  ];
  constructor(private routes: Router,
    private authS: AuthService,      
    private interaction: InteractionService,    
    private firestore: FirestoreService,    
    private db: NuevoService,    
    private afAuth: AngularFireAuth,
    private router: Router,
    private storage: AngularFireStorage

  ) { }

  validateNombre() {
    // Agrega tu lógica de validación personalizada aquí
    // Por ejemplo, puedes verificar si el nombre tiene al menos 3 caracteres
    if (this.registerF.nombre && this.registerF.nombre.length < 3) {
      return true; // La validación falla
    }
    return false; // La validación pasa
  }
  validateApellido() {
    // Agrega tu lógica de validación personalizada aquí
    // Por ejemplo, puedes verificar si el apellido tiene al menos 3 caracteres
    if (this.registerF.apellido && this.registerF.apellido.length < 3) {
      return true; // La validación falla
    }
    return false; // La validación pasa
  }
  validateDNI() {
    // Utiliza una expresión regular para validar el patrón del DNI
    const dniPattern = /^[0-9]{8}$/;
    if (!dniPattern.test(this.registerF.dni)) {
      return true; // La validación falla
    }
    return false; // La validación pasa
  }

  validateTelefono(telefono: string): boolean {
    // Ensure that telefono is not undefined or empty
    if (!telefono) {
      return false; // Return false if telefono is undefined or empty
    }
  
    // Eliminate spaces and hyphens, if any
    const numeroLimpio = telefono.replace(/\s+/g, '').replace(/-/g, '');
  
    // Extract the prefix (first 3 or 4 digits)
    const prefijo = numeroLimpio.substring(0, 3);
    // Verifica si el prefijo está en el arreglo de prefijos
    if (this.prefijosTelefonicos.includes(prefijo)) {
      // Verifica si el número tiene entre 10 y 11 dígitos en total
      if (numeroLimpio.length < 10 || numeroLimpio.length > 11) {
        return false; // La validación falla
      }

      // Verifica si todos los caracteres son dígitos numéricos
      if (!/^\d+$/.test(numeroLimpio)) {
        return false; // La validación falla
      }

      // Si todas las validaciones pasan, consideramos el número válido
      return true;
    }

    return false; // La validación falla si el prefijo no está en el arreglo
  }

  // Resto de tu código aquí...
  
  validateDomicilio() {
    if (!this.registerF.domicilio) {
      return true; // La validación falla si el campo está vacío
    }
    return false; // La validación pasa si el campo no está vacío
  }
  
  validateEdad() {
    const edad = this.registerF.edad;
    if (edad < 18 || edad > 65) {
      return true; // La validación falla
    }
    return false; // La validación pasa
  }
  async siguiente() {
    // Validate the form before saving data
    if (this.validateForm()) {
      await this.interaction.presentLoading('Guardando datos personales...');
      
      // Get the currently authenticated user
      this.authS.stateUser<UserF>()
      .pipe(take(1))
      .subscribe(res => {
        this.db.stopLoading();
        // Your code here
        
        const path = `Fleteros`;
  
        // Check if a document for this user already exists
        this.firestore.getDoc<UserF>(path, res.uid).subscribe(res2 => {
          const datosPersonales = {
            uid: this.registerF.uid,
            nombre: this.registerF.nombre,
            apellido: this.registerF.apellido,
            dni: this.registerF.dni,
            edad: this.registerF.edad,
            domicilio: this.registerF.domicilio,
            telefono: this.registerF.telefono,
            email: res2.email,
            perfil: res2.perfil,
            verificado: false, // Remove this line or set it to the desired value
            habilitado: false,
          };

          // Define the path for saving the personal data
          const path3 = `Fleteros`;
          // Update or create the document as needed
          if (this.formularioEnviado === false) {
            this.db.updateDoc(path3,res.uid, datosPersonales)
            this.registerF.image = this.registerF.image;
              this.interaction.closeLoading();
              this.formularioEnviado = true; // Establece la bandera en true
              this.router.navigate(['/paso3F']);
            
            return
          }

        });
      });
    } else {
      this.interaction.presentToast('Por favor, complete todos los campos correctamente.');
    }
  }
  


  validateForm(): boolean {
    // Validación para el campo Nombre
    if (!this.registerF.nombre || this.registerF.nombre.length < 3) {
      return false; // Validación fallida para el campo Nombre
    }
  
    // Validación para el campo Apellido
    if (!this.registerF.apellido || this.registerF.apellido.length < 3) {
      return false; // Validación fallida para el campo Apellido
    }
  
    // Validación para el campo DNI
    const dniPattern = /^[0-9]{8}$/;
    if (!this.registerF.dni || !dniPattern.test(this.registerF.dni)) {
      return false; // Validación fallida para el campo DNI
    }
  
    // Validación para el campo Edad
    if (!this.registerF.edad || this.registerF.edad < 18 || this.registerF.edad > 100) {
      return false; // Validación fallida para el campo Edad
    }
  
    // Validación para el campo Domicilio (verifica si está vacío)
    if (!this.registerF.domicilio) {
      return false; // Validación fallida para el campo Domicilio
    }
  
    // Validación para el campo Teléfono utilizando la función validateTelefono
    if (!this.registerF.telefono || !this.validateTelefono(this.registerF.telefono)) {
      return false; // Validación fallida para el campo Teléfono
    }
    
    return true; // Todos los campos son válidos
  }
  
  
   
  onImagePerfil(event: any): void {
    this.uploadImageToStorage(event.target.files[0], 'image');
  }

  async uploadImageToStorage(file: File | null, imageType: string) {
    if (!file) {
      return; // Asegúrate de manejar el caso en que el archivo sea nulo
    }
  
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const fileDataUrl: string = event.target.result as string;
  
        const timestamp = new Date().getTime().toString();
        const imageName = `${timestamp}.jpg`;
  
        const storageRef = this.storage.ref(`images/${imageName}`);
        const uploadTask = await storageRef.putString(fileDataUrl, 'data_url');
        const downloadUrl = await uploadTask.ref.getDownloadURL();
  
        // Asigna la URL de descarga al campo correspondiente según el tipo de imagen
        if (imageType === 'image') {
          this.registerF.image = downloadUrl;
        } 
      };
  
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error al subir la imagen a Firebase Storage:', error);
      // Manejar el error según tus necesidades (por ejemplo, mostrar un mensaje al usuario)
    }
  }


}
  