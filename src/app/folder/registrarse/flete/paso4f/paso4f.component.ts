import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AngularFireStorage } from '@angular/fire/compat/storage';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { EstadoRevisionDocumento, UserF, datosVehiculo } from 'src/app/folder/models/models';
import { AuthService } from 'src/app/folder/services/auth.service';
import { FirestoreService } from 'src/app/folder/services/firestore.service';
import { InteractionService } from 'src/app/folder/services/interaction.service';

@Component({
  selector: 'app-paso4f',
  templateUrl: './paso4f.component.html',
  styleUrls: ['./paso4f.component.scss'],
})
export class Paso4fComponent {
  private static readonly MAX_UPLOAD_IMAGE_WIDTH = 1280;
  private static readonly MAX_UPLOAD_IMAGE_HEIGHT = 1280;
  private static readonly UPLOAD_IMAGE_QUALITY = 0.72;
  selectedAntecedentesUrl: string | null = null;

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
    perfil: 'Fletero',
    datosVehiculos: null,
    recomendacion: null,
    antecedentesPenales: {
      aprobado: false,
      observacion: 'Pendiente de revisión',
    },
  };

  Datovehicular: datosVehiculo = {
    uid: null,
    tipoVehiculo: null,
    marca: null,
    modelo: null,
    patente: null,
    imagePatente: null,
    imageDni: null,
    imageCarnet: null,
    imageDniDorzal: null,
    imageCarnetDorzal: null,
    ano: null,
  };

  loading: any;

  constructor(
    private router: Router,
    private db: FirestoreService,
    private authS: AuthService,
    private interaction: InteractionService,
    private storage: AngularFireStorage
  ) {}

  private addDays(base: Date, days: number): Date {
    const result = new Date(base);
    result.setDate(result.getDate() + days);
    return result;
  }

  async takePhoto(imageType: string, source: CameraSource = CameraSource.Camera): Promise<void> {
    try {
      const image = await Camera.getPhoto({
        quality: 70,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source,
      });

      const imageUrl = image.dataUrl;
      if (!imageUrl) {
        this.interaction.presentToast('No se pudo capturar la imagen.');
        return;
      }

      await this.uploadImageToStorage(imageUrl, imageType);
    } catch (error: any) {
      if (error?.message?.includes('User cancelled photos app')) {
        return;
      }
      if (source === CameraSource.Camera) {
        const usarGaleria = await this.interaction.presentAlert(
          'No pudimos abrir la cámara',
          'Podés continuar seleccionando una foto desde la galería.'
        );

        if (usarGaleria) {
          await this.takePhoto(imageType, CameraSource.Photos);
        }
        return;
      }

      console.error('Error al tomar la foto:', error);
      this.interaction.presentToast('No se pudo obtener la imagen. Revisá permisos de cámara/galería.');
    }
  }

  async uploadImageToStorage(imageDataUrl: string, imageType: string): Promise<void> {
    try {
      const user = await this.authS.getCurrentUser();
      if (!user) {
        this.interaction.presentToast('No encontramos la sesión activa.');
        return;
      }

      const optimizedImage = await this.optimizeImageForUpload(imageDataUrl);
      const safeImageType = imageType.replace(/[^a-zA-Z0-9_-]/g, '');
      const storageRef = this.storage.ref(`fleteros/${user.uid}/documentacion/${safeImageType}.jpg`);
      const uploadTask = await storageRef.putString(optimizedImage, 'data_url', {
        contentType: 'image/jpeg',
        customMetadata: {
          imageType: safeImageType,
          updatedAt: new Date().toISOString(),
        },
      });
      const downloadUrl = await uploadTask.ref.getDownloadURL();

      switch (imageType) {
        case 'patente':
          this.Datovehicular.imagePatente = downloadUrl;
          break;
        case 'dni':
          this.Datovehicular.imageDni = downloadUrl;
          break;
        case 'dniDorzal':
          this.Datovehicular.imageDniDorzal = downloadUrl;
          break;
        case 'carnet':
          this.Datovehicular.imageCarnet = downloadUrl;
          break;
        case 'carnetDorzal':
          this.Datovehicular.imageCarnetDorzal = downloadUrl;
          break;
        case 'antecedentes':
          this.selectedAntecedentesUrl = downloadUrl;
          this.registerF.antecedentesPenales = {
            url: downloadUrl,
            aprobado: false,
            observacion: 'Pendiente de revision',
            fecha: new Date(),
            vencimiento: this.addDays(new Date(), 15),
          };
          break;
        default:
          console.error('Tipo de imagen desconocido:', imageType);
          break;
      }

      this.interaction.presentToast('Imagen cargada correctamente.');
    } catch (error: any) {
      console.error('Error al subir la imagen a Firebase Storage:', error);
      if (error?.code === 'storage/quota-exceeded') {
        this.interaction.presentToast('Firebase Storage se quedó sin cuota. Liberá espacio o aumentá el plan para poder subir imágenes.');
        return;
      }

      this.interaction.presentToast('No se pudo subir la imagen.');
    }
  }

  private optimizeImageForUpload(imageDataUrl: string): Promise<string> {
    return new Promise((resolve) => {
      const image = new Image();

      image.onload = () => {
        const scale = Math.min(
          Paso4fComponent.MAX_UPLOAD_IMAGE_WIDTH / image.width,
          Paso4fComponent.MAX_UPLOAD_IMAGE_HEIGHT / image.height,
          1
        );
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        if (!context) {
          resolve(imageDataUrl);
          return;
        }

        canvas.width = width;
        canvas.height = height;
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', Paso4fComponent.UPLOAD_IMAGE_QUALITY));
      };

      image.onerror = () => resolve(imageDataUrl);
      image.src = imageDataUrl;
    });
  }

  validateVehicleDocs(): boolean {
    return this.getDocumentosFaltantes().length > 0;
  }

  hasImage(url?: string | null): boolean {
    return !!url;
  }

  async siguiente(): Promise<void> {
    const user = await this.authS.getCurrentUser();
    if (!user) {
      this.interaction.presentToast('No encontramos la sesión activa.');
      return;
    }

    const documentosFaltantes = this.getDocumentosFaltantes();
    if (documentosFaltantes.length > 0) {
      this.interaction.presentToast(`Faltan: ${documentosFaltantes.join(', ')}.`);
      return;
    }

    await this.interaction.presentLoading('Enviando documentación...');

    try {
      const antecedentesPenales = {
        url: this.selectedAntecedentesUrl || '',
        aprobado: false,
        observacion: 'Pendiente de revisión',
        fecha: new Date(),
        vencimiento: this.addDays(new Date(), 15),
      };

      const verificacionDni: {
        frontalUrl: string;
        dorsalUrl: string;
        estado: EstadoRevisionDocumento;
        observacion: string;
        revisadoPorAdmin: boolean;
        fechaCarga: Date;
        fechaRevision: null;
        revisadoPor: string;
      } = {
        frontalUrl: this.Datovehicular.imageDni || '',
        dorsalUrl: this.Datovehicular.imageDniDorzal || '',
        estado: 'pendiente',
        observacion: 'Pendiente de revisión administrativa',
        revisadoPorAdmin: false,
        fechaCarga: new Date(),
        fechaRevision: null,
        revisadoPor: '',
      };

      const documentacion = {
        uid: user.uid,
        dniFrontal: this.Datovehicular.imageDni,
        dniDorsal: this.Datovehicular.imageDniDorzal,
        carnetFrontal: this.Datovehicular.imageCarnet,
        carnetDorsal: this.Datovehicular.imageCarnetDorzal,
        patenteFoto: this.Datovehicular.imagePatente,
        antecedentesPenales,
        verificacionDni,
        fechaCarga: new Date(),
        estadoDocumentacion: 'pendiente_revision',
      };

      await this.db.updateDoc('Fleteros', user.uid, {
        antecedentesPenales,
        verificacionDni,
        documentacionCompleta: true,
        estadoRegistro: 'pendiente_revision',
        verificado: false,
        habilitado: false,
        bloqueadoPorVencimiento: false,
      });
      await this.db.addDataToDocument(`Fleteros/${user.uid}/Vehiculos`, user.uid, {
        imagePatente: this.Datovehicular.imagePatente || '',
        imageDni: this.Datovehicular.imageDni || '',
        imageDniDorzal: this.Datovehicular.imageDniDorzal || '',
        imageCarnet: this.Datovehicular.imageCarnet || '',
        imageCarnetDorzal: this.Datovehicular.imageCarnetDorzal || '',
      }).catch(() => undefined);

      await this.db.createDoc(documentacion, `Fleteros/${user.uid}/Documentacion`, user.uid);
      await this.db.createDoc(antecedentesPenales, `Fleteros/${user.uid}/Antecedentes`, user.uid);

      this.registerF.uid = user.uid;
      this.registerF.antecedentesPenales = antecedentesPenales;
      this.registerF.verificacionDni = verificacionDni;
      this.registerF.verificado = false;
      this.registerF.habilitado = false;
      this.registerF.documentacionCompleta = true;

      this.interaction.presentToast('Documentación enviada. Queda pendiente de revisión.');
      this.router.navigate(['/home', 'fletero'], { replaceUrl: true });
    } catch (error) {
      console.error('Error al guardar la documentación:', error);
      this.interaction.presentToast('No se pudo guardar la documentación.');
    } finally {
      await this.interaction.closeLoading();
    }
  }

  async omitirPorAhora(): Promise<void> {
    const user = await this.authS.getCurrentUser();
    if (!user) {
      this.interaction.presentToast('No encontramos la sesión activa.');
      return;
    }

    const confirmar = await this.interaction.presentAlert(
      'Omitir verificación',
      'Podrás usar acceso parcial. Más tarde podés volver a cargar documentación.'
    );

    if (!confirmar) {
      return;
    }

    try {
      await this.db.updateDoc('Fleteros', user.uid, {
        estadoRegistro: 'documentacion',
        documentacionCompleta: false,
        verificado: false,
        habilitado: false,
        documentacionOmitidaAt: new Date(),
      });
      this.interaction.presentToast('Verificación omitida por ahora.');
    } catch (error) {
      console.error('Error al omitir documentación:', error);
      this.interaction.presentToast('No se pudo guardar el estado de omisión.');
    } finally {
      this.router.navigate(['/home', 'fletero']);
    }
  }

  async continuarConCargaManual(): Promise<void> {
    const user = await this.authS.getCurrentUser();
    if (!user) {
      this.interaction.presentToast('No encontramos la sesión activa.');
      return;
    }

    const confirmar = await this.interaction.presentAlert(
      'Continuar con carga manual',
      'El fletero quedará pendiente de revisión. La documentación se cargará o validará manualmente desde administración.'
    );

    if (!confirmar) {
      return;
    }

    try {
      const revisionManual = {
        estado: 'pendiente' as EstadoRevisionDocumento,
        observacion: 'Documentación pendiente de carga manual por administración.',
        revisadoPorAdmin: false,
        fechaCarga: new Date(),
        fechaRevision: null,
        revisadoPor: '',
        cargaManualPendiente: true,
      };

      await this.db.updateDoc('Fleteros', user.uid, {
        estadoRegistro: 'pendiente_revision',
        documentacionCompleta: false,
        verificado: false,
        habilitado: false,
        bloqueadoPorVencimiento: false,
        documentacionManualPendiente: true,
        documentacionOmitidaAt: new Date(),
        verificacionDni: revisionManual,
        antecedentesPenales: {
          aprobado: false,
          observacion: 'Antecedentes pendientes de carga manual por administración.',
          fecha: new Date(),
          cargaManualPendiente: true,
        },
      });

      await this.db.createDoc({
        uid: user.uid,
        estadoDocumentacion: 'carga_manual_pendiente',
        observacion: 'Alta continuada sin Storage por carga manual administrativa.',
        fechaCarga: new Date(),
        requiereCargaManual: true,
        dniFrontal: '',
        dniDorsal: '',
        carnetFrontal: '',
        carnetDorsal: '',
        patenteFoto: '',
        antecedentesPenales: {
          aprobado: false,
          observacion: 'Pendiente de carga manual.',
          fecha: new Date(),
          cargaManualPendiente: true,
        },
        verificacionDni: revisionManual,
      }, `Fleteros/${user.uid}/Documentacion`, user.uid);

      this.interaction.presentToast('Alta registrada. Queda pendiente de carga manual.');
      this.router.navigate(['/home', 'fletero'], { replaceUrl: true });
    } catch (error) {
      console.error('Error al registrar carga manual:', error);
      this.interaction.presentToast('No se pudo registrar la carga manual.');
    }
  }

  private getDocumentosFaltantes(): string[] {
    const faltantes: string[] = [];

    if (!this.Datovehicular.imageDni) {
      faltantes.push('DNI frontal');
    }
    if (!this.Datovehicular.imageDniDorzal) {
      faltantes.push('DNI dorsal');
    }
    if (!this.Datovehicular.imageCarnet) {
      faltantes.push('Licencia frontal');
    }
    if (!this.Datovehicular.imageCarnetDorzal) {
      faltantes.push('Licencia dorsal');
    }
    if (!this.Datovehicular.imagePatente) {
      faltantes.push('Patente');
    }
    if (!this.selectedAntecedentesUrl) {
      faltantes.push('Antecedentes');
    }

    return faltantes;
  }
}
