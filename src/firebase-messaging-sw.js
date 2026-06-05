/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDI1Hv5bQ3KeCgobygHkSPeuFsXDZp3IVo',
  authDomain: 'tufleteyarg.firebaseapp.com',
  projectId: 'tufleteyarg',
  storageBucket: 'tufleteyarg.firebasestorage.app',
  messagingSenderId: '686053975749',
  appId: '1:686053975749:web:0172c6aacded8e791232ac',
  measurementId: 'G-YGX2YDZ5B6',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || 'TuFleteYa';
  const options = {
    body: payload?.notification?.body || 'Tienes una actualización.',
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
