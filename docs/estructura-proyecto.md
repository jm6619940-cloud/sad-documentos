# Estructura del Proyecto SAD

Esta guia indica que archivo tocar segun el cambio que necesites hacer.

## Entrada principal

- `index.html`: carga Bootstrap, SweetAlert2, CSS modular y `js/app.js`.
- `sw.js`: cache offline/PWA y notificaciones push.
- `manifest.webmanifest`: nombre, iconos y comportamiento de app instalada.

## JavaScript

- `js/app.js`: router principal, sesion, layout, refresco global, modales de notificaciones y navegacion.
- `js/config.js`: URL y llave publica de Supabase.
- `js/components/`: piezas compartidas de interfaz.
  - `layout.js`: shell, menu lateral, topbar y navegacion.
  - `modal.js`: sistema de modales centrados.
  - `toast.js`: alertas SweetAlert2/toast.
  - `icons.js`: iconos reutilizables.
- `js/pages/`: pantallas de la app.
  - `dashboard.js`: metricas, compras e informes.
  - `newRequest.js`: crear solicitud.
  - `requestsTable.js`: tablas de solicitudes, filtros y paginacion.
  - `requestDetail.js`: modal de solicitud, chat, archivos, firma y decisiones.
  - `profile.js`: perfil, onboarding, firma avanzada y PIN.
  - `users.js`: administracion de usuarios.
  - `catalogs.js`: departamentos y tipos de documento.
  - `notifications.js`: modal de notificaciones.
- `js/services/`: integraciones externas.
  - `dataService.js`: lecturas/escrituras Supabase, Storage y RPC.
  - `browserNotifications.js`: notificaciones del navegador, push, badge y realtime.
  - `supabaseClient.js`: inicializacion del cliente Supabase.
- `js/utils/`: utilidades puras.
  - `appVersion.js`: version activa para cache y service worker.
  - `constants.js`: roles, estados y constantes.
  - `format.js`: fechas, bytes y normalizacion.
  - `pdfOptimizer.js`: compresion/optimizacion de PDF antes de subir.
  - `purchases.js`: reglas del flujo de compras.
  - `security.js`: escape de HTML/atributos.
  - `validators.js`: validacion de archivos.

## CSS

El CSS esta separado por responsabilidad en `css/modules/`.

- `base.css`: variables, tema oscuro, reset, login, formularios y botones base.
- `layout-dashboard.css`: layout principal, menu, topbar, dashboard, paneles y metricas.
- `tables.css`: tablas/listas de solicitudes, paginacion, chips y vistas tabulares.
- `requests-chat.css`: aprobadores, solicitudes, notificaciones, chat y detalles.
- `preview-signature.css`: vista previa de archivos, PDF, firma, perfil de firma y lienzos.
- `feedback.css`: modales, overlays, avisos y toasts.
- `responsive.css`: ajustes para tablet y mobile.

`css/styles.css` queda como archivo de compatibilidad que importa esos modulos en el orden correcto.

## Supabase

- `supabase/functions/send-push/index.ts`: Edge Function para push notifications.
- `sql/`: scripts locales de base de datos. Esta carpeta esta ignorada por Git.

## Reglas de mantenimiento

- Si cambias CSS, modifica el modulo correspondiente y sube la version en `index.html`, `css/styles.css`, `sw.js` y `js/utils/appVersion.js` cuando aplique cache nuevo.
- Si cambias rutas o modulos JS, revisa `sw.js` para que el cache incluya el archivo.
- Evita volver a poner versiones `?v=` dentro de imports JS internos. La version principal vive en `js/utils/appVersion.js` y en `index.html`.
