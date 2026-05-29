import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { Router } from '@angular/router';
import { UserU } from 'src/app/folder/models/models';
import { AuthService } from 'src/app/folder/services/auth.service';
import { FirestoreService } from 'src/app/folder/services/firestore.service';

@Component({
  selector: 'app-profile-usuario',
  templateUrl: './profile-usuario.component.html',
  styleUrls: ['./profile-usuario.component.scss'],
})
export class ProfileUsuarioComponent implements OnInit {
  @ViewChild('fileInput') fileInput: ElementRef<HTMLInputElement>;

  filter: string = "filtro";
  login: boolean = false;
  DatosU: UserU;
  DatosG: UserU;
  imageSrc: string = '';

  constructor(
    private auth: AuthService,
    private router: Router,
    private db: FirestoreService,
  ) { }  

  ngOnInit() {     
    this.auth.stateUser<UserU>().subscribe(res  => {
      if (res) {
        this.login = true;
        this.getDatosUser(res.uid);
        this.getDatosGmail(res.uid);
      } else {
        this.login = false;
        this.router.navigate(['/login']);
      }   
    })
  }

  getDatosUser(uid: string) {
    this.db.getDoc<UserU>('Usuarios', uid).subscribe(res => {
      if (res) {
        this.DatosU = res;
      } else {
        this.db.getDoc<UserU>(`Usuarios/${uid}/DatosPersonales`, uid).subscribe((legacy) => {
          if (legacy) {
            this.DatosU = legacy;
          } else {
            console.log('Tiene errores -> ');
          }
        });
      }
    })
  }

  getDatosGmail(uid: string) {
    const path = `Usuarios/`;
    const id = uid;

    this.db.getDoc<UserU>(path, id).subscribe(res => {
      if (res) {
        this.DatosG = res;
        console.log(this.DatosG.image); // Verifica que tenga el valor esperado

      } else {
        console.log('Tiene errores -> ');
      }
    })
  }

  openFileInput(): void {
    this.fileInput.nativeElement.click();
  }

  async handleFileInput(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files[0];
    if (!file || !this.DatosU?.uid) {
      return;
    }

    try {
      const imageUrl = await this.uploadProfileImage(file, this.DatosU.uid);
      await this.db.updateDoc('Usuarios', this.DatosU.uid, {
        image: imageUrl,
        photoURL: imageUrl,
      });
      this.DatosU.image = imageUrl;
      this.DatosU.photoURL = imageUrl;
      console.log('Imagen actualizada correctamente');
    } catch (error) {
      console.error('Error al actualizar la imagen:', error);
    }
  }

  private async uploadProfileImage(file: File, uid: string): Promise<string> {
    const resizedImage = await this.resizeImageFile(file, 800, 600);
    const storageRef = this.db.fireStorage.ref(`Usuarios/${uid}/perfil/profile.jpg`);
    const uploadTask = await storageRef.putString(resizedImage, 'data_url', {
      contentType: 'image/jpeg',
    });

    return uploadTask.ref.getDownloadURL();
  }

  private resizeImageFile(file: File, maxWidth: number, maxHeight: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        this.resizeImage(reader.result as string, maxWidth, maxHeight, resolve);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  resizeImage(imageData: string, maxWidth: number, maxHeight: number, callback: (resizedImage: string) => void): void {
    const img = new Image();
    img.src = imageData;
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height *= maxWidth / width;
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width *= maxHeight / height;
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      const resizedImage = canvas.toDataURL('image/jpeg', 0.8);
      callback(resizedImage);
    };
  }
}
