# Migracion De Operaciones Sensibles A Backend

Este documento describe el estado actual de la migracion de operaciones sensibles desde el cliente hacia Firebase Functions.

La primera etapa ya esta implementada en buena parte: existen callables en `functions/src/index.ts` y el cliente las invoca desde `src/app/folder/services/firestore.service.ts`. Aun quedan fallbacks locales y algunas superficies pendientes, por lo que la migracion no debe considerarse cerrada al 100%.

## Resumen Actual

### Ya migrado a backend

- Operaciones administrativas criticas:
  - `adminDespenalizarUsuario`
  - `adminSetBloqueoManualFletero`
  - `adminMarcarApelacionPendienteFletero`
  - `adminResolverApelacionFletero`
- Operaciones principales de viaje:
  - `confirmarPedidoConRespuestaSeguro`
  - `actualizarEstadoFleteSeguro`
  - `finalizarFleteSeguro`
  - `cancelarFleteSeguro`
- Operaciones administrativas adicionales:
  - `adminSetHabilitadoFletero`
  - `adminSetVerificadoFletero`
  - `adminRevisarDniFletero`
- Procesos automaticos:
  - `cancelarFletesNoIniciados24h`
  - push por pedido nuevo
  - push por respuesta nueva
  - push por pedido confirmado
  - push por cambio de estado de viaje

### Parcialmente migrado

Estas operaciones ya usan backend, pero todavia conservan fallback local en el cliente para entornos locales o cuando la callable no esta disponible:

- `confirmarPedidoConRespuesta(...)`
- `actualizarEstadoFlete(...)`
- `finalizarFleteYArchivarPedido(...)`
- `cancelarFleteYRegistrarEvento(...)`

Mientras existan esos fallbacks, el codigo cliente todavia contiene logica sensible. En produccion deberian quedar inactivos, pero conviene eliminarlos cuando el backend este desplegado y validado.

### Pendiente de migrar

- Reviews:
  - hoy se crean desde cliente con `createDoc3(...)`
  - falta callable `crearReview(pedidoId, rating, comment)`
- Chats:
  - `getOrCreateChat(...)` sigue en cliente
  - `enviarMensaje(...)` sigue en cliente
  - `updateChatTyping(...)` sigue en cliente
- Endurecimiento fino de reglas:
  - `PedirFlete/*` todavia permite varias transiciones directas desde cliente
  - `Fleteros` todavia permite update por el propio fletero sobre el documento principal
  - reviews tienen validaciones basicas, pero no validan fuerte contra el pedido finalizado desde backend

## Prioridad 0 - Administracion Critica

Estado: implementado en backend.

Estas operaciones ya no deberian ejecutarse directamente desde cliente. Actualmente el servicio cliente solo actua como wrapper de callables.

### 1. Despenalizacion manual de usuarios

- Metodo cliente: `despenalizarUsuario(...)`
- Callable actual: `adminDespenalizarUsuario`
- Archivo cliente: `src/app/folder/services/firestore.service.ts`
- Archivo backend: `functions/src/index.ts`
- Estado:
  - valida admin con `assertAdmin(...)`
  - actualiza `AlertasAdminUsuarios`
  - sincroniza estado pendiente en `MetricasUsuarios`
  - recalcula confiabilidad del usuario
  - escribe `HistorialPenalizacionesUsuarios`

### 2. Bloqueo y desbloqueo manual de fleteros

- Metodo cliente: `setBloqueoManualFletero(...)`
- Callable actual: `adminSetBloqueoManualFletero`
- Archivo cliente: `src/app/folder/services/firestore.service.ts`
- Archivo backend: `functions/src/index.ts`
- Estado:
  - valida admin
  - actualiza `MetricasFleteros`
  - actualiza `Fleteros`
  - genera `HistorialSancionesFleteros`

### 3. Apelaciones y resolucion administrativa

- Metodos cliente:
  - `marcarApelacionPendienteFletero(...)`
  - `resolverApelacionFletero(...)`
- Callables actuales:
  - `adminMarcarApelacionPendienteFletero`
  - `adminResolverApelacionFletero`
- Archivo cliente: `src/app/folder/services/firestore.service.ts`
- Archivo backend: `functions/src/index.ts`
- Estado:
  - validan admin
  - actualizan `MetricasFleteros`
  - actualizan `Fleteros`
  - escriben historial administrativo

## Prioridad 1 - Ciclo Principal Del Viaje

Estado: implementado en backend, pero con fallbacks locales pendientes de retirar.

Estas operaciones ya tienen callables, pero el cliente conserva implementaciones fallback. La deuda principal es eliminar esos fallbacks y cerrar mas las reglas de `PedirFlete/*` y `Fleteros/{fleteroId}/FletesProceso`.

### 4. Confirmacion de viaje y alta de flete en proceso

- Metodo cliente actual: `confirmarPedidoConRespuesta(...)`
- Callable actual: `confirmarPedidoConRespuestaSeguro`
- Metodos legacy todavia presentes:
  - `movePedidoToPedidosHechos(...)`
  - `guardarFleteEnProceso(...)`
  - `registrarConfirmacionUsuario(...)`
- Uso actual:
  - `src/app/folder/fletes/pasos/precios/precios.component.ts`
- Estado:
  - valida que el invocante sea el usuario duenio del pedido
  - valida que exista el pedido original
  - valida que exista la respuesta seleccionada
  - crea `FletesProceso`
  - crea `PedidosConfirmados`
  - elimina pedido y respuesta originales
  - incrementa metricas de fletero y usuario desde backend
- Pendiente:
  - retirar `confirmarPedidoConRespuestaFallback(...)`
  - revisar si `movePedidoToPedidosHechos(...)` y `guardarFleteEnProceso(...)` siguen siendo necesarios o pueden eliminarse

### 5. Finalizacion de viaje

- Metodo cliente: `finalizarFleteYArchivarPedido(...)`
- Callable actual: `finalizarFleteSeguro`
- Archivo cliente: `src/app/folder/services/firestore.service.ts`
- Archivo backend: `functions/src/index.ts`
- Estado:
  - valida que el invocante sea fletero del viaje o admin
  - mueve datos a `PedidosFinalizados`
  - actualiza `FletesProceso`
  - actualiza metricas de usuario y fletero
  - cierra chat relacionado
- Pendiente:
  - retirar `finalizarFleteYArchivarPedidoFallback(...)`
  - cerrar escrituras directas del cliente sobre finalizacion

### 6. Cancelacion de viaje con efectos colaterales

- Metodo cliente: `cancelarFleteYRegistrarEvento(...)`
- Callable actual: `cancelarFleteSeguro`
- Archivo cliente: `src/app/folder/services/firestore.service.ts`
- Archivo backend: `functions/src/index.ts`
- Estado:
  - valida actor real desde `request.auth`
  - permite fletero, usuario participante o admin
  - deriva `canceladoPor` en backend
  - actualiza `FletesProceso`
  - mueve a `PedidosCancelados`
  - elimina `PedidosConfirmados`
  - crea `ViajesCancelados`
  - recalcula metricas y scores
  - crea alerta admin cuando corresponde
  - cierra chat relacionado
- Pendiente:
  - retirar `cancelarFleteYRegistrarEventoFallback(...)`
  - revisar reglas para impedir cancelaciones directas desde cliente

### 7. Cambio de estado operativo del viaje

- Metodo cliente: `actualizarEstadoFlete(...)`
- Callable actual: `actualizarEstadoFleteSeguro`
- Usos actuales:
  - `src/app/folder/mapbox/ver-ruta/ver-ruta.component.ts`
  - `src/app/components/ComponentesFleteros/mis-viajes/mis-viajes.component.ts`
- Estado:
  - valida actor del viaje o admin
  - permite iniciar viaje desde `Confirmado` hacia `En Viaje`
  - permite finalizar desde `Confirmado` o `En Viaje`
  - rechaza estados no permitidos para esa callable
- Pendiente:
  - retirar `actualizarEstadoFleteFallback(...)`
  - alinear nombres documentados: el backend actual usa `actualizarEstadoFleteSeguro`, no `avanzarEstadoFlete`

## Prioridad 2 - Metricas, Score, Auditoria Y Reglas

Estado: integrado principalmente dentro de callables.

El recalculo de metricas, score, sanciones, alertas e historial ya existe en backend como funciones internas de `functions/src/index.ts`. No esta implementado como triggers `onWrite`; esta integrado dentro de las callables de viaje y administracion.

### 8. Recalculo de score y sancion automatica

- Logica backend actual:
  - `actualizarConfiabilidadUsuario(...)`
  - `actualizarConfiabilidadYSancionFletero(...)`
  - `registrarMetricasFinalizacionFletero(...)`
  - `registrarMetricasCancelacionFletero(...)`
  - `registrarMetricasFinalizacionUsuario(...)`
  - `registrarMetricasCancelacionUsuario(...)`
- Estado:
  - usado por confirmacion, finalizacion, cancelacion y acciones administrativas
  - las reglas ya bloquean escritura cliente sobre `MetricasUsuarios` y `MetricasFleteros`
- Pendiente:
  - eliminar duplicacion equivalente que quedo en el cliente como fallback
  - decidir si conviene mantenerlo integrado en callables o migrarlo a triggers idempotentes

### 9. Alertas e historial administrativos automaticos

- Logica backend actual:
  - `notificarAdminPenalizacionUsuario(...)`
  - `registrarHistorialPenalizacionUsuario(...)`
  - `registrarHistorialSancionFletero(...)`
- Estado:
  - el backend escribe alertas e historiales
  - las reglas ya bloquean escritura cliente sobre:
    - `AlertasAdminUsuarios`
    - `HistorialPenalizacionesUsuarios`
    - `HistorialSancionesFleteros`
- Pendiente:
  - retirar restos de escritura local usados por fallbacks

## Prioridad 3 - Chats Y Reviews

Estado: pendiente o mantenido temporalmente en cliente.

### 10. Creacion de chats

- Metodo actual: `getOrCreateChat(...)`
- Archivos:
  - `src/app/folder/services/firestore.service.ts`
  - `src/app/folder/chat/chat-services.ts`
- Usos actuales:
  - `src/app/folder/fletes/pasos/precios/precios.component.ts`
  - `src/app/folder/fletes/fletes-dis/card/card.component.ts`
  - `src/app/components/ComponentesFleteros/home-fletero/home-fletero.component.ts`
- Estado:
  - sigue en cliente
  - las reglas validan participantes de chat
- Riesgo:
  - bajo a medio
  - puede generar duplicacion o inconsistencias si cambia la ruta del chat
- Recomendacion:
  - dejarlo en cliente por ahora si las reglas siguen fuertes
  - moverlo a backend si se necesita deduplicacion estricta, auditoria o creacion ligada a confirmacion de viaje

### 11. Mensajeria y typing

- Metodos actuales:
  - `enviarMensaje(...)`
  - `updateChatTyping(...)`
- Archivo: `src/app/folder/chat/chat-services.ts`
- Estado:
  - sigue en cliente
  - las reglas validan `senderId`, `chatId`, texto y participacion
- Recomendacion:
  - mantener en cliente por ahora
  - migrar solo si se agregan moderacion, antifraude, rate limiting o notificaciones server-side por mensaje

### 12. Reviews

- Uso actual:
  - `src/app/folder/fletes/pasos/precios/precios.component.ts`
  - `src/app/folder/fletes/pasos/precios/pedidos-finalizados/pedidos-finalizados.component.ts`
- Estado:
  - siguen creandose desde cliente con `createDoc3(...)`
  - las reglas validan payload basico
  - no hay callable `crearReview(...)`
- Riesgo:
  - medio
  - falta validacion backend fuerte de que el pedido exista realmente en `PedidosFinalizados`, pertenezca al usuario y corresponda al fletero calificado
- Backend recomendado:
  - Callable Function `crearReview(pedidoId, rating, comment)`
  - validar `request.auth.uid`
  - leer `PedirFlete/{uid}/PedidosFinalizados/{pedidoId}`
  - derivar `fleteroId` desde el pedido finalizado, no desde el cliente
  - impedir multiples reviews para el mismo pedido

## Estado De Firestore Rules

Ya estan endurecidas:

- `MetricasUsuarios`: lectura admin/duenio, escritura cliente bloqueada
- `MetricasFleteros`: lectura admin/duenio, escritura cliente bloqueada
- `AlertasAdminUsuarios`: lectura admin, escritura cliente bloqueada
- `HistorialPenalizacionesUsuarios`: lectura admin, escritura cliente bloqueada
- `HistorialSancionesFleteros`: lectura admin, escritura cliente bloqueada
- `ViajesCancelados`: lectura admin, escritura cliente bloqueada

Todavia conviene revisar:

- `PedirFlete/{userId}/PedidosConfirmados`
- `PedirFlete/{userId}/PedidosFinalizados`
- `PedirFlete/{userId}/PedidosCancelados`
- `Fleteros/{fleteroId}`
- `Fleteros/{fleteroId}/FletesProceso`
- `reviews`

La meta es que las transiciones de negocio queden cerradas al backend y que el cliente solo pueda crear datos de baja criticidad o datos propios con validaciones estrictas.

## Nuevo Orden Recomendado

1. Retirar fallbacks locales de confirmacion, finalizacion, cancelacion y cambio de estado cuando las callables esten desplegadas y probadas.
2. Eliminar o marcar como deprecated metodos legacy como `movePedidoToPedidosHechos(...)` y `guardarFleteEnProceso(...)` si ya no tienen usos reales.
3. Endurecer reglas de `PedirFlete/*` para impedir movimientos directos entre estados desde cliente.
4. Endurecer reglas de `Fleteros/{fleteroId}` para evitar que el propio fletero edite campos administrativos, score, sanciones o habilitacion.
5. Implementar callable `crearReview(...)` y mover las pantallas de reviews a esa callable.
6. Decidir si chat queda en cliente o se crea desde backend al confirmar el viaje.
7. Revisar si las metricas deben seguir integradas en callables o pasar a triggers idempotentes.

## Nota Tecnica

La migracion ya no esta en fase inicial: la carpeta `functions` existe y contiene la mayor parte del backend sensible.

La deuda actual no es "crear backend", sino terminar de cerrar el circuito:

1. quitar fallback local sensible
2. endurecer reglas que todavia permiten transiciones directas
3. mover reviews a backend
4. mantener chat en cliente solo si las reglas siguen validando bien participantes y payloads

Cuando esos puntos esten completos, el cliente dejara de participar en sanciones, score, bloqueos y transiciones criticas de viaje.
