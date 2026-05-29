// import { Component, OnInit, ViewChild } from '@angular/core';
// import { AngularFireAuth } from '@angular/fire/compat/auth';
// import { AngularFirestore } from '@angular/fire/compat/firestore';
// import { AngularFireStorage } from '@angular/fire/compat/storage';
// import { Router } from '@angular/router';
// import { IonModal, LoadingController, ToastController } from '@ionic/angular';
// import { UserF, datosVehiculo, tipoVehiculo } from 'src/app/folder/models/models';
// import { AuthService } from 'src/app/folder/services/auth.service';
// import { FirestoreService } from 'src/app/folder/services/firestore.service';
// import { InteractionService } from 'src/app/folder/services/interaction.service';

// @Component({
//   selector: 'app-paso3f',
//   templateUrl: './paso3f.component.html',
//   styleUrls: ['./paso3f.component.scss'],
// })
// export class Paso3fComponent implements OnInit {
//   private formularioEnviado: boolean = false;

//   @ViewChild(IonModal) modal: IonModal;

//   name: string;
//   message = "putoss";
//   registerF: UserF = {
//     uid: null,
//     nombre: null,
//     apellido: null,
//     dni: null,
//     edad: null,
//     domicilio: null,
//     telefono: null,
//     image: null,
//     email: null,
//     password: null,
//     verificado: false,
//     habilitado: false,
//     perfil:  'Fletero',
//     datosVehiculos: null,
//     recomendacion: null,
//   }

//   Datovehicular: datosVehiculo = {
//     uid: null,
//     tipoVehiculo: null,
//     marca: null,
//     ano: null,
//     modelo: null,
//     patente: '',
//     imagePatente: null,
//     imageDni: null,
//     imageCarnet: null,
//     imageDniDorzal: null,
//     imageCarnetDorzal: null
//   }

// loading: any;
// vehiculo = tipoVehiculo;

//   constructor(private routes: Router,
//     private authS: AuthService,      
//     private interaction: InteractionService,    
//     private firestore: FirestoreService,    
//     private afAuth: AngularFireAuth,
//     private router: Router,
//     private storage: AngularFireStorage

//   ) { }

//   ngOnInit() {
//   } 


 




  
  
  
//   async siguiente() {
//     // Validate the form fields
//     if (this.validateForm()) {
//       // If the form is valid, proceed with saving the data
//       this.authS.stateUser<UserF>().subscribe((res) => {
//         this.interaction.closeLoading();
//             const id = res.uid;
//             const path2 = `Fleteros/${res.uid}/DatosVehiculares`;
  
//             // Actualiza la propiedad patenteImage con la representación en base64
//             const datosVehicularesConImagen = {
//               ...this.Datovehicular,
//             };
  
//             // Ahora, puedes guardar todo el objeto en la colección
//             this.firestore.createDocument<datosVehiculo>(datosVehicularesConImagen, path2, id)
//               this.interaction.presentToast('Registrado con éxito');
//               if (this.formularioEnviado === false) {
//                 // Tu código de redirección aquí
//                 this.formularioEnviado = true; // Establece la bandera en true
//                 this.router.navigate(['/home']);
//                 return
//               }

//             });
//     } else {
//       // If the form is not valid, display an error messagjjje or take appropriate action
//       console.log("Form validation failed. Please complete all fields correctly.");
//       // You can also display a toast or other error message to the user.
//     }
//   }
  
  
//   validateTipoVehiculo() {
//     // Check if the tipoVehiculo field is not one of the allowed types
//     const allowedTypes: ('Camioneta' | 'Camion' | 'Grua' | 'Furgonetas' | 'Camiones frigoríficos' | 'Otro...' )[] = ['Camioneta' , 'Camion' , 'Grua' , 'Furgonetas' , 'Camiones frigoríficos' , 'Otro...' ];
//     return !this.Datovehicular.tipoVehiculo || !allowedTypes.includes(this.Datovehicular.tipoVehiculo);
//   }
  
  
//   validateMarca() {
//     // Check if the marca field is empty or contains only whitespace
//     return !this.Datovehicular.marca || this.Datovehicular.marca.trim() === '';
//   }
  
//   validateModelo() {
//     // Check if the modelo field is empty or contains only whitespace
//     return !this.Datovehicular.modelo || this.Datovehicular.modelo.trim() === '';
//   }
  
//   validatePatente() {
//     // Convert patente to a string and then check if it matches the pattern
//     const patentePattern = /^[A-Z0-9]{6,9}$/; // Pattern for a 6-character alphanumeric patente
//     return !this.Datovehicular.patente.toString() || !patentePattern.test(this.Datovehicular.patente.toString());
//   }
  
  

//   validateForm(): boolean {
  
//     // Validación para el campo tipoVehiculo
//     if (!this.Datovehicular.tipoVehiculo || 
//         (this.Datovehicular.tipoVehiculo !== 'Camioneta' &&
//             this.Datovehicular.tipoVehiculo !== 'Camion' &&
//             this.Datovehicular.tipoVehiculo !== 'Grua' &&
//             this.Datovehicular.tipoVehiculo !== 'Furgonetas' &&
//             this.Datovehicular.tipoVehiculo !== 'Camiones frigoríficos' &&
//             this.Datovehicular.tipoVehiculo !== 'Otro...')) {
//     return false; // Validación fallida para el campo tipoVehiculo
//   }
  
//     // Validación para el campo marca
//     if (!this.Datovehicular.marca || this.Datovehicular.marca.trim() === '') {
//       return false; // Validación fallida para el campo marca
//     }
  
//     // Validación para el campo modelo
//     if (!this.Datovehicular.modelo || this.Datovehicular.modelo.trim() === '') {
//       return false; // Validación fallida para el campo modelo
//     }
  
//     // Validación para el campo patente
//     const patentePattern = /^[A-Z0-9]{6,8}$/; // Example pattern for a 6-character alphanumeric patente
//     if (!this.Datovehicular.patente || !patentePattern.test(this.Datovehicular.patente)) {
//       return false; // Validación fallida para el campo patente
//     }
  
//     return (
//       !this.validateTipoVehiculo() &&
//       !this.validateMarca() &&
//       !this.validateModelo() 
//       &&  !this.validatePatente()
//     );  }
  
// }
  