# SAD - Sistema de Autorizacion de Documentos

Aplicacion web estatica para gestionar solicitudes de autorizacion de documentos internos. Esta construida con HTML5, CSS3, JavaScript ES6 y Supabase.

## Notificaciones en segundo plano

Para recibir notificaciones aunque la pagina este cerrada se usa Web Push con Service Worker y una Edge Function de Supabase.

1. Genera un par de claves VAPID.
2. Coloca la clave publica en `APP_CONFIG.vapidPublicKey` dentro de `js/config.js`.
3. Ejecuta `sql/security-hardening.sql` en Supabase SQL Editor para crear `push_subscriptions` y sus politicas RLS.
4. Configura estos secretos en Supabase Edge Functions: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` y `WEBHOOK_SECRET`.
5. Despliega `supabase/functions/send-push`.
6. Crea un Database Webhook en Supabase para `public.notificaciones` en evento `INSERT`, apuntando a `/functions/v1/send-push` y enviando el header `x-sad-webhook-secret` con el mismo valor de `WEBHOOK_SECRET`.
