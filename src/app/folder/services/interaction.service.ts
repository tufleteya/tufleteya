import { Injectable } from '@angular/core';
import { AlertController, LoadingController, ToastController } from '@ionic/angular';
@Injectable({
  providedIn: 'root'
})
export class InteractionService {

  private loading: HTMLIonLoadingElement | null = null;

  constructor(public toastController: ToastController,
              public loadingController: LoadingController,
              public alerController: AlertController) { }

  async presentToast(mensaje: string, duration = 2400) {
    const toastStyle = this.getToastStyle(mensaje);
    const toast = await this.toastController.create({
      message: toastStyle.message,
      duration,
      position: 'top',
      icon: toastStyle.icon,
      color: 'dark',
      cssClass: ['tfy-toast', `tfy-toast-${toastStyle.variant}`],
      buttons: [
        {
          side: 'end',
          icon: 'close-outline',
          role: 'cancel',
        },
      ],
    });
    await toast.present();
  }

  async presentLoading(mensaje: string) {
    await this.closeLoading();
    this.loading = await this.loadingController.create({
      cssClass: 'tfy-loading',
      spinner: 'crescent',
      translucent: true,
      backdropDismiss: false,
      message: mensaje,
    });
    await this.loading.present();
  }

  async closeLoading() {
    if (!this.loading) {
      return;
    }

    try {
      await this.loading.dismiss();
    } catch {
      // El loading puede haberse cerrado desde otro flujo.
    } finally {
      this.loading = null;
    }
  }

 async presentAlert(texto: string, subtitulo: string,) {

    let aceptar = false;
    const alert = await this.alerController.create({
      cssClass: 'tfy-alert',
      mode: 'ios',
      backdropDismiss: false,
      header: texto,
      subHeader: subtitulo,
      buttons: [
        {
          text: 'Volver',
          role: 'cancel',
          cssClass: 'tfy-alert-secondary',
        },
        {
          text: 'Continuar',
          cssClass: 'tfy-alert-primary',
          handler: ()=>{
            aceptar = true;
          }
        },
      ],
    });

    await alert.present();
    await alert.onDidDismiss();
    return aceptar;
  }

  async presentInfoAlert(texto: string, subtitulo: string): Promise<void> {
    const alert = await this.alerController.create({
      cssClass: 'tfy-alert',
      mode: 'ios',
      backdropDismiss: true,
      header: texto,
      subHeader: subtitulo,
      buttons: [
        {
          text: 'Entendido',
          cssClass: 'tfy-alert-primary',
        },
      ],
    });

    await alert.present();
    await alert.onDidDismiss();
  }

  private getToastStyle(mensaje: string): { variant: 'success' | 'danger' | 'warning' | 'info'; icon: string; message: string } {
    const normalized = (mensaje || '').toLowerCase();

    if (
      normalized.includes('error') ||
      normalized.includes('inválid') ||
      normalized.includes('inval') ||
      normalized.includes('fall') ||
      normalized.includes('no se pudo')
    ) {
      return {
        variant: 'danger',
        icon: 'alert-circle-outline',
        message: mensaje,
      };
    }

    if (
      normalized.includes('completa') ||
      normalized.includes('falt') ||
      normalized.includes('atención') ||
      normalized.includes('aviso')
    ) {
      return {
        variant: 'warning',
        icon: 'alert-outline',
        message: mensaje,
      };
    }

    if (
      normalized.includes('éxito') ||
      normalized.includes('exito') ||
      normalized.includes('guardad') ||
      normalized.includes('enviado') ||
      normalized.includes('confirmad') ||
      normalized.includes('finalizad') ||
      normalized.includes('bienvenido') ||
      normalized.includes('sesion finalizada') ||
      normalized.includes('sesión finalizada')
    ) {
      return {
        variant: 'success',
        icon: 'checkmark-circle-outline',
        message: mensaje,
      };
    }

    return {
      variant: 'info',
      icon: 'information-circle-outline',
      message: mensaje,
    };
  }
  
}
