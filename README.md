# SAD - Sistema de Autorizacion de Documentos

Aplicacion web estatica para gestionar solicitudes de autorizacion de documentos internos. Esta construida con HTML5, CSS3, JavaScript ES6 y Supabase.

## Como probar

Sirve el directorio por HTTP y abre la URL en el navegador. Los modulos ES6 funcionan mejor asi que abriendo el archivo directo.

```bash
python3 -m http.server 4173
```

Luego entra a `http://localhost:4173/`.

## Conectar Supabase

1. Crea un proyecto en Supabase.
2. Ejecuta `sql/schema.sql` en el SQL editor.
3. Copia la URL del proyecto y la anon key en `js/config.js`.
4. Crea tu usuario desde Supabase Auth.
5. Ejecuta `sql/bootstrap-admin.sql` cambiando `TU_CORREO_AQUI@empresa.com` por tu correo real para convertir ese primer usuario en administrador.
6. Inicia sesion en la app con el correo y contrasena reales de Supabase Auth.
7. Desde la app, un administrador puede completar rol, departamento y estado de otros perfiles.

> Nota: crear usuarios y restablecer contrasenas de Supabase Auth desde GitHub Pages no debe hacerse con la service role key en el navegador. Para produccion, crea credenciales desde Supabase Dashboard o agrega una Edge Function segura si decides ampliar la arquitectura.

## Seguridad de claves

La URL de Supabase y la anon key/public key se usan en el navegador y, por diseno, son visibles para cualquier persona que abra la aplicacion. En una app estatica publicada en GitHub Pages, mover esos valores a un `.env` no los vuelve secretos: si el frontend los necesita, terminaran llegando al navegador.

La seguridad real debe depender de:

- Row Level Security en todas las tablas expuestas.
- Politicas de Storage para mantener archivos privados.
- Signed URLs para descargas.
- Nunca publicar `service_role`, secret keys, tokens personales de GitHub ni claves privadas.

Los archivos `.env` estan ignorados por Git para evitar subir secretos operativos por accidente.

## Estructura

- `index.html`: entrada de la SPA.
- `css/`: estilos responsive.
- `js/components/`: layout, iconos, modal y toast.
- `js/pages/`: pantallas de la aplicacion.
- `js/services/`: comunicacion con Supabase.
- `js/utils/`: constantes, formato y validaciones.
- `sql/schema.sql`: base de datos, RLS, storage privado y datos semilla.

## Funcionalidad incluida

- Login y cierre de sesion.
- Dashboard por rol.
- Nueva solicitud con multiples archivos y validacion.
- Mis solicitudes, pendientes e historial con filtros.
- Detalle con archivos, preview de imagenes/PDF, comentarios, historial y decisiones.
- Usuarios, departamentos y tipos de documento.
- Perfil sin cambio de correo ni contrasena.
- Centro de notificaciones interno.
- Auditoria de acciones relevantes.
- Codigos automaticos `AUT-AAAA-000001`.
- Storage privado con Signed URLs en modo Supabase.

## Publicar en GitHub Pages

Sube este directorio a un repositorio y habilita Pages sobre la rama principal. No requiere build step.
