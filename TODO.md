# Estado pre-publicacion

- [x] Build web: `npm run build`
- [x] Build produccion: `npm run build:prod`
- [x] Build Cloud Functions: `cd functions && npm run build`
- [x] Reglas Firestore validadas con emulador local
- [x] Indices Firestore declarados en `firestore.indexes.json`
- [x] Password blindado: helpers de escritura limpian campos sensibles y reglas los bloquean
- [x] Push: registro de tokens y funciones de envio verificadas por compilacion
- [x] Lighthouse local sobre build produccion generado en `.lighthouse-report-prod.json`
- [ ] Deploy Firebase reglas/indices/functions: requiere cuenta con permisos IAM
- [ ] Deploy hosting/Vercel: requiere credenciales de despliegue
- [ ] Mejorar performance Lighthouse antes de campana publica fuerte
