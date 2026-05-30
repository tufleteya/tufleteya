const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const envDir = path.join(root, 'src', 'environments');
const swPath = path.join(root, 'src', 'firebase-messaging-sw.js');

const isCiBuild = process.env.VERCEL === '1' || process.env.CI === 'true';

const required = [
  'FIREBASE_API_KEY',
  'FIREBASE_AUTH_DOMAIN',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_STORAGE_BUCKET',
  'FIREBASE_MESSAGING_SENDER_ID',
  'FIREBASE_APP_ID',
  'FCM_VAPID_KEY',
  'MAPBOX_API_KEY',
];

function env(name) {
  return process.env[name] || '';
}

function quote(value) {
  return JSON.stringify(value || '');
}

const missing = required.filter((name) => !env(name));

if (missing.length) {
  if (!isCiBuild) {
    console.log(`generate-env: faltan variables (${missing.join(', ')}); se conservan los archivos locales.`);
    process.exit(0);
  }

  console.error(`generate-env: faltan variables requeridas: ${missing.join(', ')}`);
  process.exit(1);
}

fs.mkdirSync(envDir, { recursive: true });

function environmentFile(production) {
  return `export const environment = {
  production: ${production},
  fcmVapidKey: ${quote(env('FCM_VAPID_KEY'))},
  apiKey: ${quote(env('MAPBOX_API_KEY'))},
  firebaseConfig: {
    apiKey: ${quote(env('FIREBASE_API_KEY'))},
    authDomain: ${quote(env('FIREBASE_AUTH_DOMAIN'))},
    projectId: ${quote(env('FIREBASE_PROJECT_ID'))},
    storageBucket: ${quote(env('FIREBASE_STORAGE_BUCKET'))},
    messagingSenderId: ${quote(env('FIREBASE_MESSAGING_SENDER_ID'))},
    appId: ${quote(env('FIREBASE_APP_ID'))},
    measurementId: ${quote(env('FIREBASE_MEASUREMENT_ID'))}
  }
};

export const environmentss = environment;
`;
}

fs.writeFileSync(path.join(envDir, 'environment.ts'), environmentFile(false));
fs.writeFileSync(path.join(envDir, 'environment.prod.ts'), environmentFile(true));

fs.writeFileSync(swPath, `/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: ${quote(env('FIREBASE_API_KEY'))},
  authDomain: ${quote(env('FIREBASE_AUTH_DOMAIN'))},
  projectId: ${quote(env('FIREBASE_PROJECT_ID'))},
  storageBucket: ${quote(env('FIREBASE_STORAGE_BUCKET'))},
  messagingSenderId: ${quote(env('FIREBASE_MESSAGING_SENDER_ID'))},
  appId: ${quote(env('FIREBASE_APP_ID'))},
  measurementId: ${quote(env('FIREBASE_MEASUREMENT_ID'))},
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || 'TuFleteYa';
  const options = {
    body: payload?.notification?.body || 'Tienes una actualizacion.',
    data: payload?.data || {},
    icon: '/assets/icon/favicon.png',
    badge: '/assets/icon/favicon.png',
  };

  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawUrl = event?.notification?.data?.url || '/home';
  const url = typeof rawUrl === 'string' && rawUrl.trim() ? rawUrl : '/home';

  event.waitUntil((async () => {
    const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientList) {
      if ('focus' in client) {
        await client.focus();
        if ('navigate' in client) {
          await client.navigate(url);
        }
        return;
      }
    }
    await clients.openWindow(url);
  })());
});
`);

console.log('generate-env: archivos de entorno generados.');
