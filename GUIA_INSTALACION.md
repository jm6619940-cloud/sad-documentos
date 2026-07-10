# Guia de instalacion SAD

Esta guia explica como preparar el Sistema de Autorizacion de Documentos (SAD) para dos escenarios: publicacion remota en GitHub Pages y ejecucion local dentro de una maquina virtual de la empresa.

## 1. Requisitos

### Servidor o maquina virtual local

- Sistema operativo recomendado: Ubuntu Server 22.04 LTS o 24.04 LTS.
- Recursos minimos: 2 CPU, 4 GB RAM y 20 GB de almacenamiento.
- Recursos recomendados: 4 CPU, 8 GB RAM y 40 GB de almacenamiento.
- Acceso de red desde los equipos de los empleados.
- Servidor web estatico: Nginx, Apache o Caddy.
- Git instalado para actualizar el codigo.
- Navegadores modernos: Chrome, Edge, Safari o Firefox.
- HTTPS recomendado para notificaciones del navegador y comportamiento tipo app. En desarrollo, `localhost` funciona como excepcion, pero en red interna conviene usar certificado interno.

### Servicios externos

- Proyecto de Supabase.
- Supabase Auth configurado para los usuarios.
- Base de datos con RLS activado.
- Bucket de Storage llamado `documentos`.
- Edge Function `send-push` desplegada si se usaran notificaciones push.
- Claves VAPID configuradas para notificaciones.

## 2. Archivos importantes

- `index.html`: entrada principal de la web.
- `css/styles.css`: estilos globales.
- `js/config.js`: configuracion publica de Supabase y notificaciones.
- `js/`: logica de la aplicacion.
- `assets/`: iconos e imagenes.
- `manifest.webmanifest` y `sw.js`: instalacion tipo app y notificaciones.
- `sql/`: scripts locales de base de datos. Esta carpeta esta ignorada por Git y no debe publicarse.
- `supabase/functions/send-push/`: Edge Function para enviar notificaciones push.

Nunca coloques `service_role`, contrasenas privadas o claves secretas dentro de `js/config.js`. Ese archivo corre en el navegador y puede ser visto por cualquier usuario.

## 3. Configuracion de Supabase

1. Crea o abre el proyecto en Supabase.
2. En Authentication, crea los usuarios necesarios.
3. En Database, ejecuta los scripts SQL desde la carpeta local `sql/`.
4. Ejecuta primero el esquema principal si es una instalacion nueva.
5. Ejecuta luego los scripts de endurecimiento, aprobadores, notificaciones y compras que apliquen al proyecto.
6. Verifica que las tablas tengan RLS habilitado.
7. Verifica que el bucket `documentos` exista y tenga politicas compatibles con usuarios autenticados.
8. Crea el primer administrador con el script de bootstrap de administrador.

Orden recomendado para una instalacion nueva:

```text
sql/schema.sql
sql/bootstrap-admin.sql
sql/security-hardening.sql
sql/purchase-execution.sql
```

Si la base de datos ya existe, no ejecutes el esquema completo otra vez sin revisar. En ese caso aplica solo los scripts nuevos o de migracion.

## 4. Configurar la aplicacion

Edita `js/config.js`:

```js
export const config = {
  supabaseUrl: "https://TU_PROYECTO.supabase.co",
  supabaseAnonKey: "TU_ANON_KEY",
  storageBucket: "documentos",
  vapidPublicKey: "TU_VAPID_PUBLIC_KEY"
};
```

La `anon key` es publica por diseno. La seguridad real depende de RLS, politicas, funciones seguras y permisos de Storage.

## 5. Publicacion en GitHub Pages

1. Sube el repositorio a GitHub.
2. Verifica que `sql/` no este rastreada por Git.
3. En GitHub, entra al repositorio.
4. Ve a Settings > Pages.
5. Selecciona GitHub Actions si el flujo ya existe.
6. Ejecuta el workflow de Pages.
7. Abre la URL publicada.
8. Inicia sesion y prueba crear, aprobar, comentar y visualizar documentos.

GitHub Pages sirve archivos estaticos. No ejecuta Node, PHP ni servidores backend. Por eso la aplicacion usa Supabase para Auth, base de datos, Storage y Edge Functions.

## 6. Instalacion local en una VM

### 6.1 Preparar servidor

En Ubuntu:

```bash
sudo apt update
sudo apt install -y nginx git
```

### 6.2 Copiar el proyecto

Opcion con Git:

```bash
cd /var/www
sudo git clone https://github.com/TU_USUARIO/sad-documentos.git sad
sudo chown -R www-data:www-data /var/www/sad
```

Opcion manual:

1. Copia la carpeta del proyecto a `/var/www/sad`.
2. Verifica que `index.html`, `css/`, `js/`, `assets/`, `manifest.webmanifest` y `sw.js` esten presentes.
3. No copies credenciales privadas ni scripts sensibles que no deban estar en el servidor web.

### 6.3 Configurar Nginx

Crea `/etc/nginx/sites-available/sad`:

```nginx
server {
    listen 80;
    server_name _;

    root /var/www/sad;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location = /sw.js {
        add_header Cache-Control "no-cache";
    }

    location ~* \.(js|css|png|jpg|jpeg|svg|webmanifest)$ {
        expires 7d;
        add_header Cache-Control "public";
    }
}
```

Activa el sitio:

```bash
sudo ln -s /etc/nginx/sites-available/sad /etc/nginx/sites-enabled/sad
sudo nginx -t
sudo systemctl reload nginx
```

Los empleados podran entrar con:

```text
http://IP_DE_LA_VM/
```

Para notificaciones push confiables fuera de `localhost`, configura HTTPS con certificado interno o un dominio empresarial.

## 7. Notificaciones push

Para que las notificaciones funcionen incluso con la app en segundo plano:

1. Genera claves VAPID.
2. Coloca la clave publica en `js/config.js`.
3. Coloca la clave privada como secret de Supabase Edge Functions.
4. Despliega la funcion `send-push`.
5. Crea el webhook en Supabase que llame esa funcion cuando se inserten notificaciones.
6. En la web, permite notificaciones desde el navegador.
7. En iPhone, agrega la app a la pantalla de inicio si el flujo del navegador lo requiere.
8. Verifica que el modo No molestar o Focus no bloquee avisos.

## 8. Informe avanzado local

El dashboard de administrador tiene dos informes:

- `Generar informe`: compatible con GitHub Pages y preparado para imprimir o guardar como PDF.
- `Informe avanzado`: disponible en local, LAN o VM. Genera graficas SVG embebidas, por lo que funciona aunque el archivo HTML se descargue y se abra sin conexion.

El informe avanzado no depende de librerias externas para dibujar las graficas. Esto evita problemas con CSP, descargas locales y redes empresariales sin salida a internet.

Para analisis interactivo, usa los botones de exportacion del informe avanzado:

- `Datos CSV`: ideal para Power BI, tablas dinamicas o importacion limpia en Excel.
- `Excel`: abre una tabla analitica en Excel con responsables, etapas, duracion y atrasos mayores a 3 dias.

Las graficas del informe HTML son visuales y se conservan al guardar como PDF. Para moverse dentro de los datos como en Power BI, importa el CSV o el Excel y crea segmentadores, tablas dinamicas o dashboards internos.

## 9. Seguridad recomendada

- Mantener RLS activo en todas las tablas.
- No publicar la carpeta `sql/`.
- No exponer claves `service_role`.
- Limitar operaciones sensibles con funciones `security definer` bien revisadas.
- Validar aprobadores, estados y campos obligatorios en base de datos y frontend.
- Mantener Storage con politicas que solo permitan leer documentos a usuarios autorizados.
- Revisar logs de Supabase y auditoria de solicitudes.
- Usar HTTPS en la VM para proteger sesiones y notificaciones.
- Hacer respaldos periodicos de la base de datos y documentos.

## 10. Actualizaciones

Para actualizar la VM desde Git:

```bash
cd /var/www/sad
sudo git pull
sudo chown -R www-data:www-data /var/www/sad
sudo systemctl reload nginx
```

Despues de actualizar:

1. Abre la web en modo incognito.
2. Verifica login.
3. Crea una solicitud de prueba.
4. Asigna aprobadores.
5. Aprueba o solicita correccion.
6. Revisa notificaciones.
7. Genera un informe.

## 11. Problemas comunes

### La pagina carga vieja

Limpia cache del navegador o cambia el parametro de version en `index.html`.

### No suben documentos

Verifica el bucket `documentos`, el tamano maximo, el tipo MIME y las politicas de Storage.

### No llegan notificacio

Revisa permisos del navegador, HTTPS, service worker, claves VAPID, Edge Function y webhook.

### Un usuario no ve solicitudes

Revisa su rol, departamento, aprobadores asignados y politicas RLS.

### GitHub Pages se queda en build

Revisa el workflow, archivos publicados y que no se esten subiendo carpetas innecesarias como `sql/` o temporales.
