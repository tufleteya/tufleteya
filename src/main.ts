import { enableProdMode } from '@angular/core';
import { platformBrowser } from '@angular/platform-browser';
import { defineCustomElements } from '@ionic/pwa-elements/loader';
import { AppModule } from './app/app.module';
import { environment } from './environments/environment';

// Define los elementos personalizados de Ionic PWA
defineCustomElements(window); // Asegúrate de que se ejecute
console.log('Custom elements defined'); // Mensaje para confirmar que se ha ejecutado

// Habilita el modo de producción si está en el entorno de producción
if (environment.production) {
  enableProdMode();
  console.log('Production mode enabled'); // Mensaje para confirmar que el modo de producción se ha habilitado
}

// Inicia la aplicación
platformBrowser().bootstrapModule(AppModule)
  .catch(err => console.error('Error bootstrapping the application:', err));
